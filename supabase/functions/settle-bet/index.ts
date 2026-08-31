// =========================================================
// Supabase Edge Function: settle-bet
//
// 【役割】
// クライアント(ブラウザ)は「当たった/払戻いくら」を自己申告しない。
// このサーバー関数が、race_slot(発走時刻)だけを受け取り、
// script.js とまったく同じ決定論的アルゴリズムでレースを再計算し、
// 本当に的中したか・正しい払戻額はいくらかを自分で導き出してから
// bets テーブルへ記録する。
//
// 【デプロイ方法】
// 1. Supabase CLI をインストール (npm install -g supabase)
// 2. supabase login
// 3. supabase link --project-ref <あなたのプロジェクトref>
// 4. このファイルを supabase/functions/settle-bet/index.ts として保存
// 5. supabase functions deploy settle-bet
//    (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は自動で環境変数に入るので
//     手動設定は不要)
// =========================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* =========================================================
   ここから下は script.js の決定論的レース生成ロジックの移植。
   rand() を呼ぶ順序・回数が1つでもズレるとシードから導かれる結果が
   変わってしまうため、意図的に script.js と完全に同じ実装にしてある。
   ========================================================= */

const SIM_ITER = 2200;

const NAME_PREFIX = ["サンダー", "ミッドナイト", "ゴールド", "ブレイブ", "ウィンド", "レッド", "シルバー",
  "ラッキー", "スター", "ダイヤモンド", "インペリアル", "クリムゾン", "シャイニング", "ノーブル", "スカイ",
  "オーシャン", "フレイム", "エターナル", "ミラクル", "ヴィクトリー", "トップ", "グランド", "ロイヤル",
  "フェニックス", "ブリリアント", "スワロー", "タイガー", "イーグル", "ドラゴン", "エンペラー", "クレスト",
  "アルタイル", "バルカン", "セイレーン", "オルフェ", "リブレ"];
const NAME_SUFFIX = ["ボルト", "スター", "ラッシュ", "ハート", "チェイサー", "フューリー", "アロー", "セブン",
  "キング", "クイーン", "ウィング", "ブレイズ", "ソード", "シャドウ", "ライト", "ウェイブ", "スピリット",
  "グローリー", "レジェンド", "ファング", "クラウン", "ドリーム", "パルス", "エコー"];
const JOCKEY_SURNAME = ["星野", "桜井", "東", "南雲", "霧島", "青葉", "白石", "黒田", "紅林", "月島",
  "早乙女", "神崎", "水無月", "竜崎", "梓川", "冬木", "夏目", "秋山", "春日", "北条"];
const JOCKEY_GIVEN_JP = ["隼人", "蒼太", "悠真", "大和", "陽斗", "颯", "樹", "遼", "翔太", "健",
  "誠", "尊", "涼介", "航", "旭", "駿", "湊", "陸", "澪", "楓"];

const BET_TYPES: Record<string, { label: string; picks: number; ordered: boolean; takeout: number }> = {
  win: { label: "単勝", picks: 1, ordered: false, takeout: 0.80 },
  place: { label: "複勝", picks: 1, ordered: false, takeout: 0.80 },
  quinella: { label: "馬連", picks: 2, ordered: false, takeout: 0.775 },
  exacta: { label: "馬単", picks: 2, ordered: true, takeout: 0.75 },
  wide: { label: "ワイド", picks: 2, ordered: false, takeout: 0.775 },
  trio: { label: "三連複", picks: 3, ordered: false, takeout: 0.75 },
  trifecta: { label: "三連単", picks: 3, ordered: true, takeout: 0.725 },
};

function hashSeed(input: number): number {
  let h = 2166136261;
  const s = String(input);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uniqueName(used: Set<string>, rand: () => number): string {
  let name = "";
  let guard = 0;
  do {
    const p = NAME_PREFIX[Math.floor(rand() * NAME_PREFIX.length)];
    const s = NAME_SUFFIX[Math.floor(rand() * NAME_SUFFIX.length)];
    name = p + s;
    guard++;
  } while (used.has(name) && guard < 50);
  used.add(name);
  return name;
}

function randomJockey(rand: () => number): string {
  const sur = JOCKEY_SURNAME[Math.floor(rand() * JOCKEY_SURNAME.length)];
  const giv = JOCKEY_GIVEN_JP[Math.floor(rand() * JOCKEY_GIVEN_JP.length)];
  return sur + " " + giv;
}

interface Horse { number: number; strength: number; }

function makeHorse(number: number, usedNames: Set<string>, rand: () => number): Horse {
  const sexPool = ["牡", "牝", "牡", "セ"];
  sexPool[Math.floor(rand() * sexPool.length)]; // 性別(結果には使わないが乱数消費順を一致させるため必要)
  rand(); // 年齢
  (rand() < 0.5 ? -1 : 1);
  if (rand() < 0.5) { /* 0 */ } else { rand(); }
  rand(); // 端数
  uniqueName(usedNames, rand);
  randomJockey(rand);
  const strength = 0.5 + rand() * 1.1;
  return { number, strength };
}

function simulateFinishOrders(horses: Horse[], iterations: number, rand: () => number): number[][] {
  const results: number[][] = [];
  const base = horses.map(h => ({ num: h.number, s: h.strength }));
  for (let it = 0; it < iterations; it++) {
    const pool = base.slice();
    const order: number[] = [];
    while (pool.length) {
      let total = 0;
      for (let i = 0; i < pool.length; i++) total += pool[i].s;
      let r = rand() * total;
      let idx = 0;
      for (; idx < pool.length; idx++) {
        r -= pool[idx].s;
        if (r <= 0) break;
      }
      if (idx >= pool.length) idx = pool.length - 1;
      order.push(pool[idx].num);
      pool.splice(idx, 1);
    }
    results.push(order);
  }
  return results;
}

function comboProbability(simOrders: number[][], runners: number, type: string, selection: number[]): number {
  let count = 0;
  if (type === "place") {
    const k = runners <= 7 ? 2 : 3;
    for (const o of simOrders) if (o.slice(0, k).includes(selection[0])) count++;
  } else if (type === "win") {
    for (const o of simOrders) if (o[0] === selection[0]) count++;
  } else if (type === "quinella") {
    for (const o of simOrders) { const t2 = o.slice(0, 2); if (selection.every(s => t2.includes(s))) count++; }
  } else if (type === "exacta") {
    for (const o of simOrders) if (o[0] === selection[0] && o[1] === selection[1]) count++;
  } else if (type === "wide") {
    for (const o of simOrders) { const t3 = o.slice(0, 3); if (selection.every(s => t3.includes(s))) count++; }
  } else if (type === "trio") {
    for (const o of simOrders) { const t3 = o.slice(0, 3); if (selection.every(s => t3.includes(s))) count++; }
  } else if (type === "trifecta") {
    for (const o of simOrders) if (o[0] === selection[0] && o[1] === selection[1] && o[2] === selection[2]) count++;
  }
  return count / simOrders.length;
}

function estimateOdds(simOrders: number[][], runners: number, type: string, selection: number[]): number {
  const p = Math.max(comboProbability(simOrders, runners, type, selection), 1 / (simOrders.length * 3));
  const odds = Math.max(1.0, BET_TYPES[type].takeout / p);
  return Math.round(odds * 10) / 10;
}

function evaluateBet(type: string, selection: number[], order: number[]): boolean {
  const runners = order.length;
  if (type === "win") return order[0] === selection[0];
  if (type === "place") { const k = runners <= 7 ? 2 : 3; return order.slice(0, k).includes(selection[0]); }
  if (type === "quinella") { const t2 = order.slice(0, 2); return selection.every(s => t2.includes(s)); }
  if (type === "exacta") return order[0] === selection[0] && order[1] === selection[1];
  if (type === "wide") { const t3 = order.slice(0, 3); return selection.every(s => t3.includes(s)); }
  if (type === "trio") { const t3 = order.slice(0, 3); return selection.every(s => t3.includes(s)); }
  if (type === "trifecta") return order[0] === selection[0] && order[1] === selection[1] && order[2] === selection[2];
  return false;
}

// slotStart(発走時刻・ミリ秒)から、そのレースの「本当の着順」とオッズ計算に
// 必要な simOrders を再現する。script.js の makeRace と同じ乱数消費順であること。
function recomputeRace(slotStart: number) {
  const rand = mulberry32(hashSeed(slotStart));
  const runnerCount = 8 + Math.floor(rand() * 9);
  const usedNames = new Set<string>();
  const horses: Horse[] = [];
  for (let i = 1; i <= runnerCount; i++) {
    horses.push(makeHorse(i, usedNames, rand));
  }
  const simOrders = simulateFinishOrders(horses, SIM_ITER, rand);
  const [actualOrder] = simulateFinishOrders(horses, 1, rand);
  return { runnerCount, simOrders, actualOrder };
}

/* ========================================================= */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 呼び出したユーザー本人を、渡されたJWTから検証する(user_idを自己申告させない)
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const body = await req.json();
    const { race_slot, bet_type, selection, amount } = body;

    if (!race_slot || !BET_TYPES[bet_type] || !Array.isArray(selection) || !Number.isFinite(amount) || amount < 100) {
      return new Response(JSON.stringify({ error: "invalid request" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    const def = BET_TYPES[bet_type];
    if (selection.length !== def.picks) {
      return new Response(JSON.stringify({ error: "selection count mismatch" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const slotStart = new Date(race_slot).getTime();
    if (!Number.isFinite(slotStart)) {
      return new Response(JSON.stringify({ error: "invalid race_slot" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    // 発走時刻を過ぎていないレースへの投票(=締切前のはずの投票)は受け付けない
    if (Date.now() < slotStart) {
      return new Response(JSON.stringify({ error: "このレースはまだ発走していません" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ここが肝心な部分: クライアントの自己申告を使わず、サーバー自身で再計算する
    const { runnerCount, simOrders, actualOrder } = recomputeRace(slotStart);
    if (selection.some((n: number) => n < 1 || n > runnerCount)) {
      return new Response(JSON.stringify({ error: "invalid horse number" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const odds = estimateOdds(simOrders, runnerCount, bet_type, selection);
    const hit = evaluateBet(bet_type, selection, actualOrder);
    const payout = hit ? Math.round(amount * odds) : 0;
    const selectionLabel = def.ordered ? selection.join(" → ") : selection.slice().sort((a: number, b: number) => a - b).join(" - ");

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { error: insertError } = await supabaseAdmin.from("bets").insert({
      user_id: user.id,
      race_slot: new Date(slotStart).toISOString(),
      bet_type: def.label,
      selection: selectionLabel,
      amount,
      odds,
      hit,
      payout,
      net: payout - amount,
    });
    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ hit, payout, odds }), {
      status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});