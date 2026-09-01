(function () {
    "use strict";

    /* =========================================================
       ▼▼▼ ここにSupabaseの接続情報を設定してください ▼▼▼
       1. https://supabase.com で無料アカウント/プロジェクトを作成
       2. プロジェクトの Settings → API から "Project URL" と "anon public key" を取得
       3. 下の2つの値を書き換える(supabase_setup.sql をSQL Editorで実行しておくこと)
       未設定のままでも通常のプレイ(1人用)は問題なく動作します。
       ========================================================= */
    const SUPABASE_URL = "https://vnpwavephmnvlccvvrcc.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZucHdhdmVwaG1udmxjY3Z2cmNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMjIzMDIsImV4cCI6MjEwMzY5ODMwMn0.vtoWnfywI9riFGgc12_urFYl7oFQxVJzyiYatSIVQI4";

    const supabaseConfigured = SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY";
    const supabaseClient = (supabaseConfigured && window.supabase)
        ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
        : null;

    // ユーザーID+パスワード方式(メールアドレス不要)のための設定。
    // Supabase Authは内部的にメールアドレス形式を要求するため、
    // ユーザーIDを「実在しないダミードメイン(.invalidはRFC2606で予約された特殊用途ドメイン)」
    // と組み合わせた疑似メールアドレスとして扱う。画面上にメールは一切表示されない。
    const USERNAME_EMAIL_DOMAIN = "@users.invalid";
    const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
    function usernameToEmail(username) {
        return username.toLowerCase() + USERNAME_EMAIL_DOMAIN;
    }

    /* =========================================================
       0. 定数・データプール
       ========================================================= */

    const SIM_ITER = 2200; // オッズ推定用の内部シミュレーション回数
    const START_BALANCE = 10000;
    const SLOT_MS = 5 * 60 * 1000; // 5分刻みのスケジュール枠(日本時間0時起点でも同じグリッドになる)

    // 実際のJRAレースの平均速度の目安(時速60km/h ≒ 秒速16.7m)。
    const AVG_SPEED_MPS = 16.7;

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

    const CLASS_NAMES = ["2歳新馬", "3歳未勝利", "3歳1勝クラス", "4歳上1勝クラス", "4歳上2勝クラス",
        "4歳上3勝クラス", "3歳上オープン", "3歳上リステッド", "G3", "G2", "G1"];
    const DISTANCES = [1200, 1400, 1600, 1800, 2000, 2200, 2400];
    const SURFACES = ["芝", "ダート"];

    const FRAME_COLORS = {
        1: "#ffffff", 2: "#1a1a1a", 3: "#e0313d", 4: "#2a5fd6",
        5: "#f4d81c", 6: "#2fa84f", 7: "#f08a1e", 8: "#f06fa8"
    };
    const FRAME_TEXT_DARK = new Set([1, 5]); // 白・黄色地は黒文字

    const BET_TYPES = {
        win: { label: "単勝", short: "単", picks: 1, ordered: false, takeout: 0.80 },
        place: { label: "複勝", short: "複", picks: 1, ordered: false, takeout: 0.80 },
        quinella: { label: "馬連", short: "連", picks: 2, ordered: false, takeout: 0.775 },
        exacta: { label: "馬単", short: "単2", picks: 2, ordered: true, takeout: 0.75 },
        wide: { label: "ワイド", short: "ワ", picks: 2, ordered: false, takeout: 0.775 },
        trio: { label: "三連複", short: "複3", picks: 3, ordered: false, takeout: 0.75 },
        trifecta: { label: "三連単", short: "単3", picks: 3, ordered: true, takeout: 0.725 },
    };
    const BET_TYPE_ORDER = ["win", "place", "quinella", "exacta", "wide", "trio", "trifecta"];

    const horseSilhouetteColors = ["#e0553a", "#4a6fe3", "#e6c34f", "#3fae6a", "#c9c9c9",
        "#b5253a", "#8892a8", "#a85fd1", "#4fb8a6", "#d6863c", "#6b6ed6", "#5fbf7a",
        "#c95fa0", "#7a9be0", "#d1a23f", "#5fa8d6"];

    // 400m周回の楕円(スタジアム形)コースのジオメトリ(SVG viewBox 0 0 600 260 基準)
    const TRACK_LAP_METERS = 400;
    const TRACK_CX_LEFT = 190;
    const TRACK_CX_RIGHT = 410;
    const TRACK_CY = 130;
    const TRACK_OUTER_R = 110;
    const TRACK_INNER_R = 65;
    const TRACK_CENTER_R = 88;

    /* =========================================================
       1. 状態
       ========================================================= */

    let balance = START_BALANCE;
    let raceSeq = 0;
    let currentRace = null;
    let archiveRaces = []; // 確定済みレースの履歴(アーカイブ)
    let currentBetType = "win";
    let currentSelection = []; // 馬番の配列(クリック順)
    let cart = []; // {raceNo, raceLabelStr, type, selection, amount, odds}
    let history = []; // 確定済み購入(結果反映後)
    let selectedArchiveRaceNo = null;
    let currentUser = null;      // Supabaseにログイン中のユーザー(未ログインならnull)
    let currentDisplayName = ""; // ログイン中の表示名
    let raceAnimInterval = null;

    /* =========================================================
       2. DOM参照
       ========================================================= */

    const $ = (id) => document.getElementById(id);
    const balanceEl = $("balanceAmount");
    const raceSeqLabelEl = $("raceSeqLabel");
    const raceInfoEl = $("raceInfo");
    const cooldownBoxEl = $("cooldownBox");
    const trackEl = $("track");
    const trackPlaceholderEl = $("trackPlaceholder");
    const raceStatusMsgEl = $("raceStatusMsg");
    const resultBannerEl = $("resultBanner");
    const resultPanelEl = $("resultPanel");
    const entryTableEl = $("entryTable");
    const entryHintEl = $("entryHint");
    const betTypeTabsEl = $("betTypeTabs");
    const betSlipEl = $("betSlip");
    const cartBodyEl = $("cartBody");
    const cartTotalEl = $("cartTotal");
    const historyBodyEl = $("historyBody");
    const archiveListEl = $("archiveList");
    const archiveDetailEl = $("archiveDetail");
    const clearCartBtn = $("clearCartBtn");
    const confirmPurchaseBtn = $("confirmPurchaseBtn");
    const accountBox = $("accountBox");
    const accountConfigMsg = $("accountConfigMsg");
    const accountInfo = $("accountInfo");
    const accountNameEl = $("accountName");
    const renameBtn = $("renameBtn");
    const signOutBtn = $("signOutBtn");
    const authGateEl = $("authGate");
    const gateUserId = $("gateUserId");
    const gatePassword = $("gatePassword");
    const gateMainBtn = $("gateMainBtn");
    const gateSwitchModeBtn = $("gateSwitchModeBtn");
    const gateTogglePw = $("gateTogglePw");
    const gateModeDescEl = $("gateModeDesc");
    const authGateStatusEl = $("authGateStatus");
    const rankingBodyEl = $("rankingBody");
    const rankingMonthLabelEl = $("rankingMonthLabel");

    /* =========================================================
       3. ユーティリティ(決定論的な乱数・時刻表示)
       ========================================================= */

    // 文字列/数値から32bitのハッシュ値を作る(シードの下準備)
    function hashSeed(input) {
        let h = 2166136261;
        const s = String(input);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    // mulberry32: シード値から再現可能な疑似乱数列を作る軽量PRNG。
    // 同じシード(=同じ発走時刻)を渡せば、どの端末でも全く同じ乱数列 = 同じレースになる。
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // 日本時間(Asia/Tokyo)でHH:MM表示にする
    function formatJST(ms) {
        return new Date(ms).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });
    }
    function formatJSTDate(ms) {
        return new Date(ms).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit' });
    }

    function shade(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        let r = (num >> 16) + percent;
        let g = ((num >> 8) & 0x00FF) + percent;
        let b = (num & 0x0000FF) + percent;
        r = Math.max(Math.min(255, r), 0);
        g = Math.max(Math.min(255, g), 0);
        b = Math.max(Math.min(255, b), 0);
        return "#" + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
    }

    function pad2(n) { return n < 10 ? "0" + n : "" + n; }

    function raceLabel(race) { return `${race.postTimeLabel}発走`; }

    function uniqueName(used, rand) {
        let name;
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

    function randomJockey(rand) {
        const sur = JOCKEY_SURNAME[Math.floor(rand() * JOCKEY_SURNAME.length)];
        const giv = JOCKEY_GIVEN_JP[Math.floor(rand() * JOCKEY_GIVEN_JP.length)];
        return sur + " " + giv;
    }

    function assignFrames(n) {
        const base = Math.floor(n / 8);
        const extra = n % 8;
        const counts = Array.from({ length: 8 }, (_, i) => base + (i < extra ? 1 : 0));
        const frames = [];
        counts.forEach((c, idx) => { for (let k = 0; k < c; k++) frames.push(idx + 1); });
        return frames;
    }

    /* =========================================================
       4. 馬・レース生成(発走時刻をシードにした決定論的生成)
       ========================================================= */

    function makeHorse(number, frame, usedNames, rand) {
        const sexPool = ["牡", "牝", "牡", "セ"];
        const sex = sexPool[Math.floor(rand() * sexPool.length)];
        const age = 3 + Math.floor(rand() * 5);
        let weight = sex === "牝" ? 54 : 56;
        weight += (rand() < 0.5 ? -1 : 1) * (rand() < 0.5 ? 0 : (rand() < 0.5 ? 1 : 2));
        weight = Math.max(50, Math.min(60, weight));
        const weightStr = (weight + (rand() < 0.5 ? 0 : 0.5)).toFixed(1);

        return {
            number,
            frame,
            name: uniqueName(usedNames, rand),
            color: horseSilhouetteColors[(number - 1) % horseSilhouetteColors.length],
            sexAge: `${sex}${age}`,
            weight: weightStr,
            jockey: randomJockey(rand),
            strength: 0.5 + rand() * 1.1,
            pos: 0,
            finished: false,
            finishOrder: null,
            finishTimeMs: null,
            paceWobble: 0,
        };
    }

    function simulateFinishOrders(horses, iterations, rand) {
        const results = [];
        const base = horses.map(h => ({ num: h.number, s: h.strength }));
        for (let it = 0; it < iterations; it++) {
            const pool = base.slice();
            const order = [];
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

    // slotStart(発走予定時刻のUnixミリ秒)だけを種にして、馬・オッズ・実際の着順まで
    // すべて再現可能に生成する。同じslotStartなら、どの端末で計算しても完全に同じ結果になる。
    function makeRace(raceNo, slotStart) {
        const rand = mulberry32(hashSeed(slotStart));

        const runnerCount = 8 + Math.floor(rand() * 9); // 8-16
        const frames = assignFrames(runnerCount);
        const usedNames = new Set();
        const horses = [];
        for (let i = 1; i <= runnerCount; i++) {
            horses.push(makeHorse(i, frames[i - 1], usedNames, rand));
        }
        const simOrders = simulateFinishOrders(horses, SIM_ITER, rand);
        const [actualOrder] = simulateFinishOrders(horses, 1, rand); // このレースの「本当の」着順を先に決定しておく

        const race = {
            raceNo,
            slotStart,
            postTimeLabel: formatJST(slotStart),
            dateLabel: formatJSTDate(slotStart),
            className: CLASS_NAMES[Math.floor(rand() * CLASS_NAMES.length)],
            surface: SURFACES[Math.floor(rand() * SURFACES.length)],
            distance: DISTANCES[Math.floor(rand() * DISTANCES.length)],
            horses,
            simOrders,
            status: "open", // open | running | finished
            result: null,
            actualFinishOrder: actualOrder,
        };

        // 単勝・複勝オッズをシミュレーション結果から算出
        const placeK = runnerCount <= 7 ? 2 : 3;
        horses.forEach(h => {
            const winCount = simOrders.filter(o => o[0] === h.number).length;
            const placeCount = simOrders.filter(o => o.slice(0, placeK).includes(h.number)).length;
            const winP = Math.max(winCount / simOrders.length, 1 / (simOrders.length * 2));
            const placeP = Math.max(placeCount / simOrders.length, 1 / (simOrders.length * 2));
            h.winOdds = Math.max(1.1, Math.round((BET_TYPES.win.takeout / winP) * 10) / 10);
            const placeBase = Math.max(1.0, (BET_TYPES.place.takeout / placeP));
            h.placeOddsLow = Math.max(1.0, Math.round(placeBase * 0.85 * 10) / 10);
            h.placeOddsHigh = Math.round(placeBase * 1.15 * 10) / 10;
        });
        const byOdds = [...horses].sort((a, b) => a.winOdds - b.winOdds);
        byOdds.forEach((h, idx) => { h.popularity = idx + 1; });

        // 実際の着順に基づき、決定論的な所要タイムを各馬に割り当てる
        // (発走時刻がシードなので、どの端末でも同じ映像・同じ結末になる)
        const baseDur = (race.distance / AVG_SPEED_MPS) * 1000;
        const n = actualOrder.length;
        const spread = baseDur * 0.16;
        const step = n > 1 ? spread / (n - 1) : 0;
        actualOrder.forEach((num, rank) => {
            const h = horses.find(x => x.number === num);
            const jitter = (rand() - 0.5) * step * 0.3;
            h.finishTimeMs = Math.max(baseDur * 0.85, baseDur * 0.92 + step * rank + jitter);
            h.paceWobble = rand() * 2 - 1;
        });
        race.totalAnimMs = Math.max(...horses.map(h => h.finishTimeMs));

        return race;
    }

    /* =========================================================
       5. オッズ推定(カレントの買い目に対して)
       ========================================================= */

    function comboProbability(race, type, selection) {
        const orders = race.simOrders;
        const runners = race.horses.length;
        let count = 0;
        if (type === "place") {
            const k = runners <= 7 ? 2 : 3;
            for (const o of orders) { if (o.slice(0, k).includes(selection[0])) count++; }
        } else if (type === "win") {
            for (const o of orders) { if (o[0] === selection[0]) count++; }
        } else if (type === "quinella") {
            for (const o of orders) { const t2 = o.slice(0, 2); if (selection.every(s => t2.includes(s))) count++; }
        } else if (type === "exacta") {
            for (const o of orders) { if (o[0] === selection[0] && o[1] === selection[1]) count++; }
        } else if (type === "wide") {
            for (const o of orders) { const t3 = o.slice(0, 3); if (selection.every(s => t3.includes(s))) count++; }
        } else if (type === "trio") {
            for (const o of orders) { const t3 = o.slice(0, 3); if (selection.every(s => t3.includes(s))) count++; }
        } else if (type === "trifecta") {
            for (const o of orders) {
                if (o[0] === selection[0] && o[1] === selection[1] && o[2] === selection[2]) count++;
            }
        }
        return count / orders.length;
    }

    function estimateOdds(race, type, selection) {
        const p = Math.max(comboProbability(race, type, selection), 1 / (race.simOrders.length * 3));
        const odds = Math.max(1.0, (BET_TYPES[type].takeout / p));
        return Math.round(odds * 10) / 10;
    }

    /* =========================================================
       6. スケジューラ(日本時間0時起点・5分刻みで自動開催)
       ========================================================= */

    function nextSlotFromNow() {
        const now = Date.now();
        return (Math.floor(now / SLOT_MS) + 1) * SLOT_MS;
    }

    function loadOrCreateRace(slotStart) {
        raceSeq += 1;
        currentRace = makeRace(raceSeq, slotStart);
        currentSelection = [];
        if (cart.length > 0) {
            cart = [];
            flashResult("レースが切り替わったため、カート内の未購入の買い目は無効になりました。", "lose");
        }
        renderAll();
    }

    // タブが非表示/スリープ等でJSタイマーが止まっていた場合、見逃した分を
    // アニメーションなしで即座に精算し、常に「今」の状態に復元する。
    function settleMissedRace(race) {
        if (cart.length > 0) {
            cart = [];
            flashResult("レースが切り替わったため、カート内の未購入の買い目は無効になりました。", "lose");
        }
        concludeRace(race); // race.actualFinishOrder は生成時点で確定済みなので、実況なしでも精算できる
        loadOrCreateRace(nextSlotFromNow());
    }

    // 1秒ごと、および画面がアクティブに戻った瞬間に呼ばれる時計係。
    // 「閉じていた/バックグラウンドだった間の経過時間」を毎回きちんと計算し直すことで、
    // 何時に開いても必ず実時刻に基づいた状態になるようにする。
    function resyncToRealTime() {
        if (!currentRace) { loadOrCreateRace(nextSlotFromNow()); return; }
        const race = currentRace;
        const now = Date.now();

        if (race.status === "open") {
            const elapsed = now - race.slotStart;
            if (elapsed < 0) {
                updatePostTimeCountdown(-elapsed, race);
            } else if (elapsed < race.totalAnimMs) {
                beginRaceAnimation(race, elapsed); // 経過時間ぶん早送りしてアニメーションを再開
            } else {
                // 発走・レース時間ともに過ぎているのに気づけなかった(タブが長時間非アクティブだった)
                settleMissedRace(race);
            }
        } else if (race.status === "finished") {
            // 通常は finishRace 内で即座に次のレースが用意されるが、念のための保険
            loadOrCreateRace(nextSlotFromNow());
        }
        // "running" のときは実況用のタイマーが自然に追いつくのでここでは何もしない
    }

    function masterTick() {
        resyncToRealTime();
    }

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") resyncToRealTime();
    });
    window.addEventListener("focus", resyncToRealTime);
    window.addEventListener("pageshow", resyncToRealTime);

    function updatePostTimeCountdown(remainMs, race) {
        if (!cooldownBoxEl) return;
        const m = Math.floor(remainMs / 60000);
        const s = Math.floor((remainMs % 60000) / 1000);
        const pct = Math.max(0, Math.min(100, 100 - (remainMs / SLOT_MS) * 100));
        cooldownBoxEl.innerHTML = `
      <div class="cooldown-label">発走まで ${m}:${pad2(s)} ・ 次のレースは 日本時間 ${race.postTimeLabel} 発走予定</div>
      <div class="cooldown-bar"><div class="cooldown-fill" style="width:${pct}%;"></div></div>
    `;
    }

    /* =========================================================
       7. レンダリング: 現在のレース情報
       ========================================================= */

    function renderRaceInfo() {
        const race = currentRace;
        raceSeqLabelEl.textContent = raceLabel(race);
        raceInfoEl.innerHTML = `
      <div class="rname">${race.className}</div>
      <div class="rmeta">${race.surface} ${race.distance}m</div>
      <div class="rmeta">発走 ${race.dateLabel} ${race.postTimeLabel}(日本時間)</div>
      <div class="rmeta">${race.horses.length}頭立て</div>
    `;
    }

    /* =========================================================
       8. レンダリング: コース(実況)
       ========================================================= */

    function horseSvg(color) {
        const leg = shade(color, -55);
        return `<svg class="silhouette" viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
      <g class="horse-rig">
        <g transform="translate(30,34)"><g class="leg leg-b"><path d="M0,0 L-3,12 L-6,24" stroke="${leg}"/></g></g>
        <g transform="translate(62,34)"><g class="leg leg-a"><path d="M0,0 L3,12 L6,24" stroke="${leg}"/></g></g>
        <path class="tail" d="M22,26 C12,29 6,27 2,34" stroke="${color}" stroke-width="4" fill="none" stroke-linecap="round"/>
        <ellipse cx="44" cy="26" rx="22" ry="11" fill="${color}"/>
        <path d="M60,18 C68,8 78,4 86,6 C92,7 95,11 92,15 C90,18 84,17 80,14 L77,22 C71,19 64,20 60,20 Z" fill="${color}"/>
        <path d="M80,5 L84,-3 L87,7 Z" fill="${color}"/>
        <circle cx="88" cy="10" r="1.6" fill="#171310"/>
        <g transform="translate(36,34)"><g class="leg leg-a"><path d="M0,0 L-3,12 L-5,24" stroke="${leg}"/></g></g>
        <g transform="translate(68,34)"><g class="leg leg-b"><path d="M0,0 L3,12 L5,24" stroke="${leg}"/></g></g>
      </g>
    </svg>`;
    }

    function stadiumPath(r) {
        const yTop = TRACK_CY - r, yBot = TRACK_CY + r;
        return `M${TRACK_CX_LEFT},${yTop} L${TRACK_CX_RIGHT},${yTop} A${r},${r} 0 0 1 ${TRACK_CX_RIGHT},${yBot} L${TRACK_CX_LEFT},${yBot} A${r},${r} 0 0 1 ${TRACK_CX_LEFT},${yTop} Z`;
    }

    function trackGeometryFor(race) {
        const totalLaps = race.distance / TRACK_LAP_METERS;
        const startFrac = ((1 - (totalLaps % 1)) % 1 + 1) % 1;
        const n = race.horses.length;
        const spacing = Math.min(3.4, 34 / Math.max(1, n - 1));
        return { totalLaps, startFrac, n, spacing };
    }

    function computeOvalPoint(centerlineEl, pathLen, geo, h, idx) {
        const lapFrac = ((geo.startFrac + (h.pos / 100) * geo.totalLaps) % 1 + 1) % 1;
        const L = lapFrac * pathLen;
        const p = centerlineEl.getPointAtLength(L);
        const p2 = centerlineEl.getPointAtLength((L + 1) % pathLen);
        const dx = p2.x - p.x, dy = p2.y - p.y;
        const mag = Math.sqrt(dx * dx + dy * dy) || 1;
        const px = -dy / mag, py = dx / mag;
        const offset = (idx - (geo.n - 1) / 2) * geo.spacing;
        return { x: p.x + px * offset, y: p.y + py * offset };
    }

    function effectiveScore(h) {
        return h.finished ? (100000 - h.finishOrder) : h.pos;
    }

    function currentLeaderNum(race) {
        let best = null, bestScore = -Infinity;
        race.horses.forEach(h => {
            const s = effectiveScore(h);
            if (s > bestScore) { bestScore = s; best = h.number; }
        });
        return best;
    }

    function updateLeaderHighlight(race) {
        const leader = currentLeaderNum(race);
        race.horses.forEach(h => {
            const el = document.getElementById(`horse-${h.number}`);
            if (el) el.classList.toggle("leading", h.number === leader);
        });
    }

    function renderStandings(race) {
        const el = document.getElementById("liveStandings");
        if (!el) return;
        const sorted = [...race.horses].sort((a, b) => effectiveScore(b) - effectiveScore(a));
        el.innerHTML = `<div class="lstitle">現在の順位</div>` + sorted.map((h, i) => `
      <div class="standing-row${i === 0 ? ' lead' : ''}"><span class="srank">${i + 1}</span><span class="sname">${h.number}.${h.name}</span></div>
    `).join("");
    }

    function renderTrack() {
        const race = currentRace;

        if (race.status === "open") {
            trackEl.style.display = "none";
            trackPlaceholderEl.style.display = "block";
            trackEl.innerHTML = "";
            race.__trackCtx = null;
            return;
        }
        trackPlaceholderEl.style.display = "none";
        trackEl.style.display = "block";

        const outerPath = stadiumPath(TRACK_OUTER_R);
        const innerPath = stadiumPath(TRACK_INNER_R);
        const centerPath = stadiumPath(TRACK_CENTER_R);
        const finishX = TRACK_CX_LEFT;
        const finishYTop = TRACK_CY - TRACK_OUTER_R;
        const finishYBot = TRACK_CY - TRACK_INNER_R;

        let horseMarkers = "";
        race.horses.forEach(h => {
            const legDur = (0.62 - (h.strength - 0.6) * 0.22).toFixed(2);
            horseMarkers += `<div class="horse" id="horse-${h.number}" style="--leg-dur:${legDur}s;">
        ${horseSvg(h.color)}
        <span class="tag">${h.number}</span>
      </div>`;
        });

        const laps = race.distance / TRACK_LAP_METERS;
        const estSec = Math.round(race.distance / AVG_SPEED_MPS);
        const estMin = Math.floor(estSec / 60), estRem = estSec % 60;

        trackEl.innerHTML = `
      <div class="oval-panel">
        <div class="oval-wrap">
          <svg class="oval-svg" viewBox="0 0 600 260" xmlns="http://www.w3.org/2000/svg">
            <path d="${innerPath}" fill="#123322"></path>
            <path d="${outerPath} ${innerPath}" fill-rule="evenodd" fill="#2a5e3d"></path>
            <path d="${outerPath}" fill="none" stroke="#f1e7d0" stroke-opacity=".5" stroke-width="1.5"></path>
            <path d="${innerPath}" fill="none" stroke="#f1e7d0" stroke-opacity=".5" stroke-width="1.5"></path>
            <path id="centerlinePath" d="${centerPath}" fill="none" stroke="rgba(241,231,208,.15)" stroke-width="1" stroke-dasharray="3,5"></path>
            <line x1="${finishX}" y1="${finishYTop}" x2="${finishX}" y2="${finishYBot}" stroke="#fff" stroke-width="4" stroke-dasharray="4,4"></line>
            <text x="${finishX + 6}" y="${finishYTop + 10}" fill="#f1e7d0" font-size="11" font-family="Oswald, sans-serif" letter-spacing="1">GOAL</text>
          </svg>
          <div class="oval-horses" id="ovalHorses">${horseMarkers}</div>
        </div>
        <div class="live-standings" id="liveStandings"></div>
      </div>
      <div class="lap-info">1周 ${TRACK_LAP_METERS}m ・ 総距離 ${race.distance}m(${laps % 1 === 0 ? laps : laps.toFixed(1)}周) ・ 予想タイム 約${estMin}分${estRem}秒</div>
    `;

        const centerlineEl = document.getElementById("centerlinePath");
        const pathLen = centerlineEl.getTotalLength();
        const geo = trackGeometryFor(race);

        race.horses.forEach((h, idx) => {
            const pt = computeOvalPoint(centerlineEl, pathLen, geo, h, idx);
            const el = document.getElementById(`horse-${h.number}`);
            if (el) {
                el.style.left = (pt.x / 600 * 100) + "%";
                el.style.top = (pt.y / 260 * 100) + "%";
                if (race.status === "finished") el.classList.add("finished");
            }
        });
        renderStandings(race);

        race.__trackCtx = { centerlineEl, pathLen, geo };
    }

    /* =========================================================
       9. レース実況(発走時刻に自動開始) ― 実際のレースタイムに近い速度で進行
       ========================================================= */

    function beginRaceAnimation(race, elapsedOffset) {
        elapsedOffset = elapsedOffset || 0;
        race.status = "running";
        hideResult();
        resultPanelEl.innerHTML = "";
        raceStatusMsgEl.textContent = "実況中です。";

        if (cart.length > 0) {
            cart = [];
            renderCart();
            flashResult("発売を締め切りました。カート内の未購入分は無効になりました。", "lose");
        }

        race.horses.forEach(h => { h.pos = 0; h.finished = false; });

        renderTrack();
        renderRaceControls();

        race.horses.forEach(h => {
            const el = document.getElementById(`horse-${h.number}`);
            if (el) { el.classList.remove("finished", "winner", "leading"); el.classList.add("running"); }
        });

        const ctx = race.__trackCtx;
        const raceStartAt = performance.now() - elapsedOffset;
        let finishedCount = 0;

        if (raceAnimInterval) clearInterval(raceAnimInterval);
        raceAnimInterval = setInterval(() => {
            const elapsed = performance.now() - raceStartAt;
            race.horses.forEach((h, idx) => {
                if (h.finished) return;
                const t = Math.min(1, elapsed / h.finishTimeMs);
                const wobble = Math.sin(t * Math.PI) * 1.3 * h.paceWobble;
                h.pos = Math.min(100, Math.max(h.pos, t * 100 + wobble));
                const el = document.getElementById(`horse-${h.number}`);
                if (t >= 1) {
                    h.pos = 100;
                    h.finished = true;
                    finishedCount++;
                    if (el) el.classList.remove("running");
                }
                if (ctx && el) {
                    const pt = computeOvalPoint(ctx.centerlineEl, ctx.pathLen, ctx.geo, h, idx);
                    el.style.left = (pt.x / 600 * 100) + "%";
                    el.style.top = (pt.y / 260 * 100) + "%";
                }
            });
            updateLeaderHighlight(race);
            renderStandings(race);

            if (finishedCount >= race.horses.length) {
                clearInterval(raceAnimInterval);
                raceAnimInterval = null;
                concludeRace(race);
                loadOrCreateRace(race.slotStart + SLOT_MS); // 次の発走枠を即座に投票受付開始
            }
        }, 150);
    }

    function concludeRace(race) {
        race.status = "finished";
        race.result = race.actualFinishOrder;

        const winnerNum = race.result[0];
        race.horses.forEach(h => {
            const el = document.getElementById(`horse-${h.number}`);
            if (!el) return;
            el.classList.remove("leading");
            el.classList.add("finished");
            if (h.number === winnerNum) el.classList.add("winner");
        });

        let totalPayout = 0;
        let anyBetOnThisRace = false;
        history.forEach(rec => {
            if (rec.raceNo !== race.raceNo) return;
            if (rec.settled) return;
            anyBetOnThisRace = true;
            const { hit } = evaluateBet(rec.type, rec.selection, race.result);
            rec.settled = true;
            rec.hit = hit;
            rec.payout = hit ? Math.round(rec.amount * rec.odds) : 0;
            totalPayout += rec.payout;
        });
        if (totalPayout > 0) updateBalance(balance + totalPayout, true);

        const winnerHorse = race.horses.find(h => h.number === winnerNum);
        const label = raceLabel(race);
        if (anyBetOnThisRace) {
            if (totalPayout > 0) {
                flashResult(`🏆 ${label}確定! 1着は${winnerNum}.${winnerHorse.name}。払戻合計 ${totalPayout} チップ!`, "win");
            } else {
                flashResult(`${label}確定。1着は${winnerNum}.${winnerHorse.name}。的中はありませんでした。`, "lose");
            }
        } else {
            flashResult(`${label}確定。1着は${winnerNum}.${winnerHorse.name}。`, "info");
        }

        archiveRaces.push(race);
        selectedArchiveRaceNo = race.raceNo;

        renderResultPanel(race);
        renderHistory();
        renderArchive();
        syncSettledBetsToSupabase(race);
    }

    function evaluateBet(type, selection, order) {
        const runners = order.length;
        let hit = false;
        if (type === "win") { hit = order[0] === selection[0]; }
        else if (type === "place") { const k = runners <= 7 ? 2 : 3; hit = order.slice(0, k).includes(selection[0]); }
        else if (type === "quinella") { const t2 = order.slice(0, 2); hit = selection.every(s => t2.includes(s)); }
        else if (type === "exacta") { hit = order[0] === selection[0] && order[1] === selection[1]; }
        else if (type === "wide") { const t3 = order.slice(0, 3); hit = selection.every(s => t3.includes(s)); }
        else if (type === "trio") { const t3 = order.slice(0, 3); hit = selection.every(s => t3.includes(s)); }
        else if (type === "trifecta") { hit = order[0] === selection[0] && order[1] === selection[1] && order[2] === selection[2]; }
        return { hit };
    }

    /* =========================================================
       10. レンダリング: 結果パネル(着順+払戻金) / アーカイブ
       ========================================================= */

    function buildPayoutRows(race) {
        const order = race.result;
        const rows = [];
        const k = order.length <= 7 ? 2 : 3;
        rows.push({ type: "単勝", combo: `${order[0]}`, odds: estimateOdds(race, "win", [order[0]]) });
        for (let i = 0; i < k; i++) {
            rows.push({ type: "複勝", combo: `${order[i]}`, odds: estimateOdds(race, "place", [order[i]]) });
        }
        rows.push({ type: "馬連", combo: `${order[0]} - ${order[1]}`, odds: estimateOdds(race, "quinella", [order[0], order[1]]) });
        rows.push({ type: "馬単", combo: `${order[0]} → ${order[1]}`, odds: estimateOdds(race, "exacta", [order[0], order[1]]) });
        if (order.length >= 3) {
            [[0, 1], [0, 2], [1, 2]].forEach(([a, b]) => {
                rows.push({ type: "ワイド", combo: `${order[a]} - ${order[b]}`, odds: estimateOdds(race, "wide", [order[a], order[b]]) });
            });
            rows.push({ type: "三連複", combo: `${order[0]} - ${order[1]} - ${order[2]}`, odds: estimateOdds(race, "trio", [order[0], order[1], order[2]]) });
            rows.push({ type: "三連単", combo: `${order[0]} → ${order[1]} → ${order[2]}`, odds: estimateOdds(race, "trifecta", [order[0], order[1], order[2]]) });
        }
        return rows;
    }

    function buildResultHTML(race) {
        const byNum = {};
        race.horses.forEach(h => byNum[h.number] = h);

        const finishRows = race.result.map((num, i) => {
            const h = byNum[num];
            return `<tr>
        <td class="${i === 0 ? 'pos1' : ''}">${i + 1}着</td>
        <td><span class="waku" style="background:${FRAME_COLORS[h.frame]};${FRAME_TEXT_DARK.has(h.frame) ? '' : 'color:#fff;'}">${h.frame}</span></td>
        <td>${h.number}</td>
        <td>${h.name}</td>
        <td>${h.jockey}</td>
      </tr>`;
        }).join("");

        const payoutRows = buildPayoutRows(race).map(r => `
      <tr><td>${r.type}</td><td>${r.combo}</td><td>${r.odds.toFixed(1)}倍</td></tr>
    `).join("");

        return `
      <div class="result-panel">
        <h3>${race.dateLabel} ${raceLabel(race)} ${race.className}(${race.surface}${race.distance}m) 着順</h3>
        <table class="finish-table">
          <thead><tr><th>着順</th><th>枠</th><th>馬番</th><th>馬名</th><th>騎手</th></tr></thead>
          <tbody>${finishRows}</tbody>
        </table>
        <h3>払戻金(参考オッズ)</h3>
        <table class="payout-table">
          <thead><tr><th>式別</th><th>組み合わせ</th><th>オッズ</th></tr></thead>
          <tbody>${payoutRows}</tbody>
        </table>
      </div>
    `;
    }

    function renderResultPanel(race) {
        resultPanelEl.innerHTML = (race.status === "finished") ? buildResultHTML(race) : "";
    }

    function renderArchive() {
        if (archiveRaces.length === 0) {
            archiveListEl.innerHTML = `<div class="archive-empty">まだ確定したレースはありません</div>`;
            archiveDetailEl.innerHTML = "";
            return;
        }
        if (selectedArchiveRaceNo === null || !archiveRaces.some(r => r.raceNo === selectedArchiveRaceNo)) {
            selectedArchiveRaceNo = archiveRaces[archiveRaces.length - 1].raceNo;
        }

        archiveListEl.innerHTML = "";
        archiveRaces.slice().reverse().forEach(race => {
            const winner = race.horses.find(h => h.number === race.result[0]);
            const div = document.createElement("div");
            div.className = "race-tab" + (selectedArchiveRaceNo === race.raceNo ? " active" : "");
            div.innerHTML = `
        <div class="rno">${race.postTimeLabel}</div>
        <div class="rtime">${race.dateLabel}</div>
        <span class="rstatus finished">1着 ${winner.number}番</span>
      `;
            div.addEventListener("click", () => {
                selectedArchiveRaceNo = race.raceNo;
                renderArchive();
            });
            archiveListEl.appendChild(div);
        });

        const selectedRace = archiveRaces.find(r => r.raceNo === selectedArchiveRaceNo);
        archiveDetailEl.innerHTML = buildResultHTML(selectedRace);
    }

    function renderRaceControls() {
        const race = currentRace;
        if (race.status === "open") {
            raceStatusMsgEl.textContent = "投票受付中です。買い目をカートに入れて購入してください。発走時刻になると自動的にレースが始まります。";
            cooldownBoxEl.style.display = "block";
            updatePostTimeCountdown(Math.max(0, race.slotStart - Date.now()), race);
        } else if (race.status === "running") {
            raceStatusMsgEl.textContent = "実況中です。";
            cooldownBoxEl.style.display = "none";
        } else {
            raceStatusMsgEl.textContent = "このレースは確定しました。";
            cooldownBoxEl.style.display = "none";
        }
    }

    /* =========================================================
       11. レンダリング: 出馬表
       ========================================================= */

    function renderEntryTable() {
        const race = currentRace;
        const finished = race.status === "finished";

        const rowsHtml = race.horses.map(h => {
            const selected = currentSelection.includes(h.number);
            const disabled = finished || race.status === "running";
            const wakuStyle = `background:${FRAME_COLORS[h.frame]};${FRAME_TEXT_DARK.has(h.frame) ? '' : 'color:#fff;'}`;
            const popClass = h.popularity === 1 ? "fav1" : (h.popularity === 2 ? "fav2" : "");
            return `<tr data-num="${h.number}" class="${selected ? 'selected' : ''} ${disabled ? 'scratched' : ''}">
        <td><span class="waku" style="${wakuStyle}">${h.frame}</span></td>
        <td>${h.number}</td>
        <td class="horse-name-cell">${h.name}</td>
        <td>${h.sexAge}</td>
        <td>${h.weight}</td>
        <td>${h.jockey}</td>
        <td>${h.winOdds.toFixed(1)}</td>
        <td>${h.placeOddsLow.toFixed(1)}-${h.placeOddsHigh.toFixed(1)}</td>
        <td><span class="pop-badge ${popClass}">${h.popularity}</span></td>
      </tr>`;
        }).join("");

        entryTableEl.innerHTML = `
      <thead>
        <tr>
          <th>枠</th><th>馬番</th><th>馬名</th><th>性齢</th><th>斤量</th><th>騎手</th>
          <th>単勝</th><th>複勝</th><th>人気</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    `;

        entryHintEl.textContent = finished
            ? "このレースは確定済みです"
            : `式別「${BET_TYPES[currentBetType].label}」であと${Math.max(0, BET_TYPES[currentBetType].picks - currentSelection.length)}頭選択`;

        if (!finished && race.status !== "running") {
            entryTableEl.querySelectorAll("tbody tr").forEach(tr => {
                tr.addEventListener("click", () => {
                    const num = Number(tr.dataset.num);
                    toggleSelection(num);
                });
            });
        }
    }

    function toggleSelection(num) {
        const idx = currentSelection.indexOf(num);
        if (idx >= 0) {
            currentSelection.splice(idx, 1);
        } else {
            const need = BET_TYPES[currentBetType].picks;
            if (currentSelection.length >= need) {
                currentSelection.shift();
            }
            currentSelection.push(num);
        }
        renderEntryTable();
        renderBetSlip();
    }

    /* =========================================================
       12. レンダリング: 式別タブ
       ========================================================= */

    function renderBetTypeTabs() {
        betTypeTabsEl.innerHTML = "";
        BET_TYPE_ORDER.forEach(key => {
            const def = BET_TYPES[key];
            const btn = document.createElement("button");
            btn.className = "bet-type-tab" + (key === currentBetType ? " active" : "");
            btn.textContent = def.label;
            btn.addEventListener("click", () => {
                currentBetType = key;
                currentSelection = [];
                renderBetTypeTabs();
                renderEntryTable();
                renderBetSlip();
            });
            betTypeTabsEl.appendChild(btn);
        });
    }

    /* =========================================================
       13. レンダリング: 投票フォーム(馬券)
       ========================================================= */

    function renderBetSlip() {
        const race = currentRace;
        const def = BET_TYPES[currentBetType];
        const notLoggedIn = !currentUser;
        const disabled = race.status !== "open" || notLoggedIn;

        let slotsHtml = "";
        if (def.ordered) {
            const labels = def.picks === 2 ? ["1着", "2着"] : ["1着", "2着", "3着"];
            slotsHtml = labels.map((lab, i) => {
                const val = currentSelection[i];
                return `<div class="pick-slot ${val ? 'filled' : ''}">
          <div class="slot-label">${lab}</div>
          <div class="slot-value">${val ? val : "―"}</div>
        </div>` + (i < labels.length - 1 ? `<span class="pick-arrow">→</span>` : "");
            }).join("");
        } else {
            slotsHtml = Array.from({ length: def.picks }).map((_, i) => {
                const val = currentSelection[i];
                return `<div class="pick-slot ${val ? 'filled' : ''}">
          <div class="slot-label">選択${i + 1}</div>
          <div class="slot-value">${val ? val : "―"}</div>
        </div>`;
            }).join("");
        }

        const complete = currentSelection.length === def.picks;
        let oddsHtml = `<span style="color:var(--parchment-dim); font-size:13px;">馬番を${def.picks}頭選択してください</span>`;
        let odds = null;
        if (complete && race.status === "open") {
            odds = estimateOdds(race, currentBetType, currentSelection);
            oddsHtml = `<span class="slip-odds">${odds.toFixed(1)}<span class="suf">倍(予想)</span></span>`;
        }

        const loginNotice = notLoggedIn
            ? `<div class="login-required-notice">投票には上のフォームからログイン(または新規登録)が必要です。</div>`
            : "";

        betSlipEl.innerHTML = `
      ${loginNotice}
      <div class="slip-picks">${slotsHtml}</div>
      <div class="slip-field">
        <label>予想オッズ</label>
        ${oddsHtml}
      </div>
      <div class="slip-field">
        <label>金額(チップ)</label>
        <input type="number" id="slipAmount" min="100" step="100" value="100" ${disabled ? "disabled" : ""}>
        <div class="chip-row">
          <button class="chip-btn" data-add="100" ${disabled ? "disabled" : ""}>+100</button>
          <button class="chip-btn" data-add="500" ${disabled ? "disabled" : ""}>+500</button>
          <button class="chip-btn" data-add="1000" ${disabled ? "disabled" : ""}>+1000</button>
        </div>
      </div>
      <button class="primary" id="addToCartBtn" ${(!complete || disabled) ? "disabled" : ""}>カートに追加</button>
    `;

        betSlipEl.querySelectorAll(".chip-btn[data-add]").forEach(btn => {
            btn.addEventListener("click", () => {
                const input = $("slipAmount");
                const cur = Number(input.value) || 0;
                input.value = cur + Number(btn.dataset.add);
            });
        });

        const addBtn = $("addToCartBtn");
        if (addBtn) {
            addBtn.addEventListener("click", () => addToCart(odds));
        }
    }

    function addToCart(odds) {
        const race = currentRace;
        const def = BET_TYPES[currentBetType];

        if (!currentUser) {
            flashResult("投票にはログインが必要です。上のフォームからログイン/新規登録してください。", "lose");
            return;
        }
        const amountInput = $("slipAmount");
        const amount = Math.floor(Number(amountInput.value));

        if (!amount || amount < 100) {
            flashResult("金額は100チップ以上で入力してください。", "lose");
            return;
        }
        const cartTotal = cart.reduce((s, b) => s + b.amount, 0);
        if (amount + cartTotal > balance) {
            flashResult("所持チップが足りません(カート内合計を含む)。", "lose");
            return;
        }

        cart.push({
            raceNo: race.raceNo,
            raceLabelStr: raceLabel(race),
            type: currentBetType,
            typeLabel: def.label,
            selection: [...currentSelection],
            selectionLabel: def.ordered ? currentSelection.join(" → ") : currentSelection.slice().sort((a, b) => a - b).join(" - "),
            amount,
            odds,
        });

        currentSelection = [];
        renderEntryTable();
        renderBetSlip();
        renderCart();
        hideResult();
    }

    /* =========================================================
       14. レンダリング: カート
       ========================================================= */

    function renderCart() {
        if (cart.length === 0) {
            cartBodyEl.innerHTML = `<tr class="empty-row"><td colspan="7">カートは空です</td></tr>`;
        } else {
            cartBodyEl.innerHTML = cart.map((b, i) => `
        <tr>
          <td>${b.raceLabelStr}</td>
          <td>${b.typeLabel}</td>
          <td>${b.selectionLabel}</td>
          <td>${b.amount}</td>
          <td>${b.odds.toFixed(1)}倍</td>
          <td>${Math.round(b.amount * b.odds)}</td>
          <td><button class="remove-btn" data-idx="${i}" title="削除">✕</button></td>
        </tr>
      `).join("");
            cartBodyEl.querySelectorAll(".remove-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    cart.splice(Number(btn.dataset.idx), 1);
                    renderCart();
                });
            });
        }
        const total = cart.reduce((s, b) => s + b.amount, 0);
        cartTotalEl.textContent = `合計 ${total} チップ`;
        confirmPurchaseBtn.disabled = cart.length === 0;
    }

    function confirmPurchase() {
        if (!currentUser) {
            flashResult("投票にはログインが必要です。上のフォームからログイン/新規登録してください。", "lose");
            return;
        }
        const total = cart.reduce((s, b) => s + b.amount, 0);
        if (total === 0) return;
        if (total > balance) {
            flashResult("所持チップが足りません。", "lose");
            return;
        }
        updateBalance(balance - total, true);
        cart.forEach(b => {
            history.push({
                raceNo: b.raceNo,
                raceLabelStr: b.raceLabelStr,
                type: b.type,
                typeLabel: b.typeLabel,
                selection: b.selection,
                selectionLabel: b.selectionLabel,
                amount: b.amount,
                odds: b.odds,
                settled: false,
                hit: null,
                payout: null,
                synced: false,
            });
        });
        cart = [];
        renderCart();
        renderHistory();
        flashResult("購入を確定しました。発走時刻になると自動的に払戻されます。", "win");
    }

    /* =========================================================
       15. レンダリング: 購入履歴
       ========================================================= */

    function renderHistory() {
        if (history.length === 0) {
            historyBodyEl.innerHTML = `<tr class="empty-row"><td colspan="7">まだ購入履歴はありません</td></tr>`;
            return;
        }
        historyBodyEl.innerHTML = history.slice().reverse().map(rec => {
            let resultText = "未確定";
            let payoutText = "-";
            let netClass = "pl-zero";
            let netText = "-";
            if (rec.settled) {
                resultText = rec.hit ? "的中" : "落選";
                payoutText = `${rec.payout}`;
                const net = rec.payout - rec.amount;
                netClass = net > 0 ? "pl-pos" : (net < 0 ? "pl-neg" : "pl-zero");
                netText = (net >= 0 ? "+" : "") + net;
            }
            return `<tr>
        <td>${rec.raceLabelStr}</td>
        <td>${rec.typeLabel}</td>
        <td>${rec.selectionLabel}</td>
        <td>${rec.amount}</td>
        <td>${resultText}</td>
        <td>${payoutText}</td>
        <td class="${netClass}">${netText}</td>
      </tr>`;
        }).join("");
    }

    /* =========================================================
       16. 共通UI(残高・メッセージ)
       ========================================================= */

    function updateBalance(newVal, flash) {
        balance = newVal;
        balanceEl.textContent = Math.round(balance);
        if (flash) {
            balanceEl.classList.remove("flip");
            void balanceEl.offsetWidth;
            balanceEl.classList.add("flip");
        }
    }

    function flashResult(msg, kind) {
        resultBannerEl.textContent = msg;
        resultBannerEl.className = "result-banner show " + kind;
    }
    function hideResult() {
        resultBannerEl.className = "result-banner";
    }

    /* =========================================================
       17. アカウント(Supabase匿名認証+表示名)・月間ランキング
       ========================================================= */

    let gateMode = "login"; // "login" | "signup"

    function updateGateModeUI() {
        if (gateMode === "login") {
            gateMainBtn.textContent = "ログイン";
            gateSwitchModeBtn.textContent = "初めての方はこちら(新規登録)";
            gateModeDescEl.innerHTML = "ユーザーIDとパスワードでログインしてください。<br>メールアドレスは不要です。";
        } else {
            gateMainBtn.textContent = "新規登録";
            gateSwitchModeBtn.textContent = "すでにアカウントをお持ちの方はこちら(ログイン)";
            gateModeDescEl.innerHTML = "ユーザーIDとパスワードを決めてください。<br>メールアドレスは不要です。";
        }
        authGateStatusEl.textContent = "";
    }

    function toggleGateMode() {
        gateMode = gateMode === "login" ? "signup" : "login";
        updateGateModeUI();
        gateUserId.focus();
    }

    function handleGateMainAction() {
        if (gateMode === "login") handleGateLogin();
        else handleGateSignup();
    }

    function showAuthGate() {
        authGateEl.style.display = "flex";
        accountBox.style.display = "none";
        gateUserId.value = "";
        gatePassword.value = "";
        gatePassword.type = "password";
        gateTogglePw.textContent = "表示";
        gateMode = "login";
        updateGateModeUI();
        setGateBusy(false);
        setTimeout(() => gateUserId.focus(), 50);
    }

    function hideAuthGate() {
        authGateEl.style.display = "none";
        accountBox.style.display = "block";
    }

    function setGateBusy(busy, msg) {
        gateMainBtn.disabled = busy;
        gateSwitchModeBtn.disabled = busy;
        if (msg !== undefined) authGateStatusEl.textContent = msg;
    }

    function renderAccountUI() {
        accountNameEl.textContent = currentDisplayName || "プレイヤー";
    }

    // profilesから表示名だけを取得する(無ければnull)
    async function fetchProfileName(userId) {
        const { data, error } = await supabaseClient
            .from("profiles")
            .select("display_name")
            .eq("id", userId)
            .maybeSingle();
        if (error || !data) return null;
        return data.display_name || null;
    }

    function finishGateSuccess() {
        hideAuthGate();
        renderAccountUI();
        renderEntryTable();
        renderBetSlip();
        fetchRanking();
    }

    // 新規登録: ユーザーID+パスワードだけでアカウントを作る。
    // メールアドレスの代わりに「ユーザーID@ダミードメイン」の疑似メールをSupabase内部でのみ使う。
    async function handleGateSignup() {
        const username = gateUserId.value.trim();
        const password = gatePassword.value;

        if (!USERNAME_PATTERN.test(username)) {
            authGateStatusEl.textContent = "ユーザーIDは英数字とアンダースコアのみ、3〜20文字で入力してください。";
            return;
        }
        if (password.length < 6) {
            authGateStatusEl.textContent = "パスワードは6文字以上で入力してください。";
            return;
        }
        setGateBusy(true, "登録処理中…");

        try {
            const { data, error } = await supabaseClient.auth.signUp({
                email: usernameToEmail(username),
                password,
            });
            if (error) {
                authGateStatusEl.textContent = /registered|exists/i.test(error.message)
                    ? "そのユーザーIDは既に使われています。ログインをお試しください。"
                    : "登録エラー: " + error.message;
                setGateBusy(false);
                return;
            }
            if (!data.user) {
                authGateStatusEl.textContent = "登録に失敗しました。時間をおいて再度お試しください。";
                setGateBusy(false);
                return;
            }
            const { error: upsertError } = await supabaseClient
                .from("profiles")
                .upsert({ id: data.user.id, display_name: username });
            if (upsertError) {
                authGateStatusEl.textContent = "エラー: " + upsertError.message;
                setGateBusy(false);
                return;
            }
            currentUser = data.user;
            currentDisplayName = username;
            finishGateSuccess();
        } catch (e) {
            authGateStatusEl.textContent = "エラー: " + String(e);
            setGateBusy(false);
        }
    }

    // ログイン: 既存のユーザーID+パスワードで、どの端末からでも同じアカウントに入れる。
    async function handleGateLogin() {
        const username = gateUserId.value.trim();
        const password = gatePassword.value;
        if (!username || !password) {
            authGateStatusEl.textContent = "ユーザーIDとパスワードを入力してください。";
            return;
        }
        setGateBusy(true, "ログイン中…");

        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: usernameToEmail(username),
                password,
            });
            if (error) {
                authGateStatusEl.textContent = "ユーザーIDまたはパスワードが正しくありません。";
                setGateBusy(false);
                return;
            }
            currentUser = data.user;
            currentDisplayName = (await fetchProfileName(data.user.id)) || username;
            finishGateSuccess();
        } catch (e) {
            authGateStatusEl.textContent = "エラー: " + String(e);
            setGateBusy(false);
        }
    }

    // 「別の人として始める」: この端末で今ログイン中のアカウントからログアウトし、
    // 別のユーザーID・パスワードでログイン/新規登録し直せるようゲートを出し直す。
    async function handleSwitchPerson() {
        if (supabaseClient) await supabaseClient.auth.signOut();
        currentUser = null;
        currentDisplayName = "";
        currentSelection = [];
        renderEntryTable();
        renderBetSlip();
        showAuthGate();
    }

    // 表示名(ランキングに出る名前)だけを変更する。ログイン用のユーザーID・パスワードには影響しない。
    async function handleRenameClick() {
        if (!currentUser) return;
        const name = window.prompt("新しい表示名を入力してください(ランキングに表示されます)", currentDisplayName || "");
        if (!name || !name.trim()) return;
        const { error } = await supabaseClient.from("profiles").upsert({ id: currentUser.id, display_name: name.trim() });
        if (error) {
            flashResult("表示名の変更に失敗しました: " + error.message, "lose");
            return;
        }
        currentDisplayName = name.trim();
        renderAccountUI();
        fetchRanking();
        flashResult("表示名を変更しました。", "win");
    }

    // レース確定後、そのレースで確定した(自分の)賭け結果を settle-bet Edge Function 経由で送信する。
    // hit/payoutはこちらから送らず、サーバー側が race_slot から再計算した結果を信頼する。
    async function syncSettledBetsToSupabase(race) {
        if (!supabaseClient || !currentUser) return;
        const pending = history.filter(rec => rec.raceNo === race.raceNo && rec.settled && !rec.synced);
        if (pending.length === 0) return;

        for (const rec of pending) {
            rec.synced = true; // 二重送信防止のため先にフラグを立てる
            try {
                const { error } = await supabaseClient.functions.invoke("settle-bet", {
                    body: {
                        race_slot: new Date(race.slotStart).toISOString(),
                        bet_type: rec.type,       // "win"などのキー(日本語ラベルではない)
                        selection: rec.selection, // 馬番の配列(生の値)
                        amount: rec.amount,
                    },
                });
                if (error) {
                    console.error("settle-bet error", error);
                    rec.synced = false; // 失敗時は次回再送できるよう戻す
                }
            } catch (e) {
                console.error("settle-bet exception", e);
                rec.synced = false;
            }
        }
        fetchRanking();
    }

    function currentMonthLabelJST() {
        const now = new Date();
        return now.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long' });
    }

    async function fetchRanking() {
        if (rankingMonthLabelEl) rankingMonthLabelEl.textContent = currentMonthLabelJST();

        if (!supabaseConfigured) {
            accountConfigMsg.style.display = "block";
            rankingBodyEl.innerHTML = `<tr class="empty-row"><td colspan="4">Supabase未設定のため、ランキングは利用できません</td></tr>`;
            return;
        }
        if (!supabaseClient) return;

        const { data, error } = await supabaseClient.rpc("monthly_ranking");
        if (error) {
            rankingBodyEl.innerHTML = `<tr class="empty-row"><td colspan="4">ランキングの取得に失敗しました: ${error.message}</td></tr>`;
            return;
        }
        const rows = (data || []).filter(r => r.bet_count > 0);
        if (rows.length === 0) {
            rankingBodyEl.innerHTML = `<tr class="empty-row"><td colspan="4">今月はまだ確定した賭けがありません</td></tr>`;
            return;
        }
        rankingBodyEl.innerHTML = rows.map((r, i) => {
            const rank = i + 1;
            const badgeClass = rank === 1 ? "r1" : (rank === 2 ? "r2" : (rank === 3 ? "r3" : ""));
            const netClass = r.net_total > 0 ? "pl-pos" : (r.net_total < 0 ? "pl-neg" : "pl-zero");
            const netText = (r.net_total >= 0 ? "+" : "") + r.net_total;
            return `<tr>
        <td><span class="rank-badge ${badgeClass}">${rank}</span></td>
        <td>${r.display_name}</td>
        <td>${r.bet_count}</td>
        <td class="${netClass}">${netText}</td>
      </tr>`;
        }).join("");
    }

    // 起動時: Supabase未設定なら通常プレイのみ(ゲートは出さない)。
    // 設定済みなら、既存の匿名セッション+表示名が確認できるまでゲートで先へ進ませない。
    async function initAccount() {
        if (!supabaseConfigured) {
            accountConfigMsg.style.display = "block";
            authGateEl.style.display = "none";
            fetchRanking();
            return;
        }
        try {
            const { data } = await supabaseClient.auth.getSession();
            if (data && data.session && data.session.user) {
                const name = await fetchProfileName(data.session.user.id);
                if (name) {
                    currentUser = data.session.user;
                    currentDisplayName = name;
                    hideAuthGate();
                    renderAccountUI();
                    renderEntryTable();
                    renderBetSlip();
                    fetchRanking();
                    return;
                }
            }
        } catch (e) {
            console.error("initAccount error", e);
        }
        showAuthGate();
        fetchRanking();
    }

    gateMainBtn.addEventListener("click", handleGateMainAction);
    gateSwitchModeBtn.addEventListener("click", toggleGateMode);
    gatePassword.addEventListener("keydown", (e) => { if (e.key === "Enter") handleGateMainAction(); });
    gateUserId.addEventListener("keydown", (e) => { if (e.key === "Enter") gatePassword.focus(); });
    gateTogglePw.addEventListener("click", () => {
        const showing = gatePassword.type === "text";
        gatePassword.type = showing ? "password" : "text";
        gateTogglePw.textContent = showing ? "表示" : "隠す";
    });
    renameBtn.addEventListener("click", handleRenameClick);
    signOutBtn.addEventListener("click", handleSwitchPerson);

    /* =========================================================
       18. 初期化・全体レンダリング
       ========================================================= */

    function renderAll() {
        renderRaceInfo();
        renderTrack();
        renderRaceControls();
        renderResultPanel(currentRace);
        renderEntryTable();
        renderBetTypeTabs();
        renderBetSlip();
        renderCart();
        renderHistory();
        renderArchive();
    }

    clearCartBtn.addEventListener("click", () => { cart = []; renderCart(); });
    confirmPurchaseBtn.addEventListener("click", confirmPurchase);

    updateBalance(balance, false);
    loadOrCreateRace(nextSlotFromNow());
    setInterval(masterTick, 1000);
    initAccount();
})();