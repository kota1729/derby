(function () {
    "use strict";

    /* =========================================================
       0. 定数・データプール
       ========================================================= */

    const RACE_COUNT = 12;
    const SIM_ITER = 2200; // オッズ推定用の内部シミュレーション回数
    const START_BALANCE = 10000;

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

    /* =========================================================
       1. 状態
       ========================================================= */

    let balance = START_BALANCE;
    let races = [];
    let activeRaceIdx = 0;
    let currentBetType = "win";
    let currentSelection = []; // 馬番の配列(クリック順)
    let cart = []; // {raceIdx, raceNo, type, selection, amount, odds}
    let history = []; // 確定済み購入(結果反映後)

    /* =========================================================
       2. DOM参照
       ========================================================= */

    const $ = (id) => document.getElementById(id);
    const balanceEl = $("balanceAmount");
    const raceTabsEl = $("raceTabs");
    const raceInfoEl = $("raceInfo");
    const trackEl = $("track");
    const runRaceBtn = $("runRaceBtn");
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
    const clearCartBtn = $("clearCartBtn");
    const confirmPurchaseBtn = $("confirmPurchaseBtn");

    /* =========================================================
       3. ユーティリティ
       ========================================================= */

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

    function uniqueName(used) {
        let name;
        let guard = 0;
        do {
            const p = NAME_PREFIX[Math.floor(Math.random() * NAME_PREFIX.length)];
            const s = NAME_SUFFIX[Math.floor(Math.random() * NAME_SUFFIX.length)];
            name = p + s;
            guard++;
        } while (used.has(name) && guard < 50);
        used.add(name);
        return name;
    }

    function randomJockey() {
        const sur = JOCKEY_SURNAME[Math.floor(Math.random() * JOCKEY_SURNAME.length)];
        const giv = JOCKEY_GIVEN_JP[Math.floor(Math.random() * JOCKEY_GIVEN_JP.length)];
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
       4. 馬・レース生成
       ========================================================= */

    function makeHorse(number, frame, usedNames) {
        const sexPool = ["牡", "牝", "牡", "セ"];
        const sex = sexPool[Math.floor(Math.random() * sexPool.length)];
        const age = 3 + Math.floor(Math.random() * 5);
        let weight = sex === "牝" ? 54 : 56;
        weight += (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? 1 : 2));
        weight = Math.max(50, Math.min(60, weight));
        const weightStr = (weight + (Math.random() < 0.5 ? 0 : 0.5)).toFixed(1);

        return {
            number,
            frame,
            name: uniqueName(usedNames),
            color: horseSilhouetteColors[(number - 1) % horseSilhouetteColors.length],
            sexAge: `${sex}${age}`,
            weight: weightStr,
            jockey: randomJockey(),
            strength: 0.5 + Math.random() * 1.1,
            pos: 0,
            finished: false,
            finishOrder: null,
        };
    }

    function simulateFinishOrders(horses, iterations) {
        const results = [];
        const base = horses.map(h => ({ num: h.number, s: h.strength }));
        for (let it = 0; it < iterations; it++) {
            const pool = base.slice();
            const order = [];
            while (pool.length) {
                let total = 0;
                for (let i = 0; i < pool.length; i++) total += pool[i].s;
                let r = Math.random() * total;
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

    function makeRace(raceNo, startMinutes) {
        const runnerCount = 8 + Math.floor(Math.random() * 9); // 8-16
        const frames = assignFrames(runnerCount);
        const usedNames = new Set();
        const horses = [];
        for (let i = 1; i <= runnerCount; i++) {
            horses.push(makeHorse(i, frames[i - 1], usedNames));
        }
        const simOrders = simulateFinishOrders(horses, SIM_ITER);

        const hh = pad2(Math.floor(startMinutes / 60));
        const mm = pad2(startMinutes % 60);

        const race = {
            raceNo,
            postTime: `${hh}:${mm}`,
            className: CLASS_NAMES[Math.floor(Math.random() * CLASS_NAMES.length)],
            surface: SURFACES[Math.floor(Math.random() * SURFACES.length)],
            distance: DISTANCES[Math.floor(Math.random() * DISTANCES.length)],
            horses,
            simOrders,
            status: "open", // open | running | finished
            result: null,   // 確定後: 馬番の配列(1着から順)
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
        // 人気(単勝オッズ昇順)
        const byOdds = [...horses].sort((a, b) => a.winOdds - b.winOdds);
        byOdds.forEach((h, idx) => { h.popularity = idx + 1; });

        return race;
    }

    function buildProgram() {
        races = [];
        let t = 9 * 60 + 50; // 09:50スタート
        for (let r = 1; r <= RACE_COUNT; r++) {
            races.push(makeRace(r, t));
            t += 27 + Math.floor(Math.random() * 6); // 約27〜32分間隔
        }
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
       6. レンダリング: 番組表タブ
       ========================================================= */

    function renderRaceTabs() {
        raceTabsEl.innerHTML = "";
        races.forEach((race, idx) => {
            const div = document.createElement("div");
            div.className = "race-tab" + (idx === activeRaceIdx ? " active" : "");
            const statusLabel = race.status === "open" ? "発売中" : (race.status === "running" ? "実況中" : "確定");
            div.innerHTML = `
        <div class="rno">${race.raceNo}R</div>
        <div class="rtime">${race.postTime}発走</div>
        <span class="rstatus ${race.status}">${statusLabel}</span>
      `;
            div.addEventListener("click", () => {
                if (races[activeRaceIdx].status === "running") return;
                activeRaceIdx = idx;
                currentSelection = [];
                renderAll();
            });
            raceTabsEl.appendChild(div);
        });
    }

    /* =========================================================
       7. レンダリング: レース情報バー
       ========================================================= */

    function renderRaceInfo() {
        const race = races[activeRaceIdx];
        raceInfoEl.innerHTML = `
      <div class="rname">${race.raceNo}R　${race.className}</div>
      <div class="rmeta">${race.surface} ${race.distance}m</div>
      <div class="rmeta">発走 ${race.postTime}</div>
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

    function renderTrack() {
        const race = races[activeRaceIdx];
        trackEl.innerHTML = "";
        race.horses.forEach(h => {
            const lane = document.createElement("div");
            lane.className = "lane";
            const legDur = (0.62 - (h.strength - 0.6) * 0.22).toFixed(2);
            const leftPct = race.status === "finished" ? Math.min(h.pos, 96) : 0;
            lane.innerHTML = `
        <div class="lane-num">${h.number}</div>
        <div class="lane-track">
          <div class="horse" id="horse-${h.number}" style="left:${leftPct}%; --leg-dur:${legDur}s;">
            ${horseSvg(h.color)}
            <span class="tag">${h.number}.${h.name}</span>
          </div>
          <div class="finish-line"></div>
          ${h.number === 1 ? '<div class="finish-label">GOAL</div>' : ''}
        </div>
      `;
            trackEl.appendChild(lane);
        });
    }

    /* =========================================================
       9. レース実況(発走)
       ========================================================= */

    function startRace() {
        const race = races[activeRaceIdx];
        if (race.status !== "open") return;

        // このレースにカート未購入の買い目が残っていないか確認
        const pendingForThisRace = cart.some(b => b.raceIdx === activeRaceIdx);
        if (pendingForThisRace) {
            flashResult("カートに未購入の買い目があります。先に「購入を確定する」を押すか、カートから削除してください。", "lose");
            return;
        }

        race.status = "running";
        runRaceBtn.disabled = true;
        raceTabsEl.querySelectorAll(".race-tab").forEach(t => t.style.pointerEvents = "none");
        hideResult();
        resultPanelEl.innerHTML = "";
        raceStatusMsgEl.textContent = "発走しました…";

        race.horses.forEach(h => {
            h.pos = 0; h.finished = false; h.finishOrder = null;
            const el = document.getElementById(`horse-${h.number}`);
            if (el) { el.classList.remove("finished", "winner"); el.classList.add("running"); }
        });

        let finishedCount = 0;
        const orderObjs = [];

        const interval = setInterval(() => {
            race.horses.forEach(h => {
                if (h.finished) return;
                const jitter = Math.random() * 1.6;
                h.pos += (h.strength * 1.05 + jitter);
                const el = document.getElementById(`horse-${h.number}`);
                if (h.pos >= 100) {
                    h.pos = 100;
                    h.finished = true;
                    finishedCount++;
                    h.finishOrder = finishedCount;
                    orderObjs.push(h);
                    if (el) el.classList.remove("running");
                }
                if (el) el.style.left = Math.min(h.pos, 96) + "%";
            });

            if (finishedCount >= race.horses.length) {
                clearInterval(interval);
                finishRace(race, orderObjs);
            }
        }, 110);
    }

    function finishRace(race, orderObjs) {
        race.status = "finished";
        race.result = orderObjs.map(h => h.number);
        runRaceBtn.disabled = true;
        raceTabsEl.querySelectorAll(".race-tab").forEach(t => t.style.pointerEvents = "auto");

        const winnerNum = race.result[0];
        race.horses.forEach(h => {
            const el = document.getElementById(`horse-${h.number}`);
            if (!el) return;
            el.classList.add("finished");
            if (h.number === winnerNum) el.classList.add("winner");
        });

        // このレースに紐づく確定済み(購入済み)の買い目を精算
        let totalPayout = 0;
        let anyBetOnThisRace = false;
        history.forEach(rec => {
            if (rec.raceIdx !== races.indexOf(race)) return;
            if (rec.settled) return;
            anyBetOnThisRace = true;
            const { hit, payout } = evaluateBet(rec.type, rec.selection, race.result);
            rec.settled = true;
            rec.hit = hit;
            rec.payout = payout;
            totalPayout += payout;
        });
        if (totalPayout > 0) updateBalance(balance + totalPayout, true);

        const winnerHorse = race.horses.find(h => h.number === winnerNum);
        if (anyBetOnThisRace) {
            if (totalPayout > 0) {
                flashResult(`🏆 ${race.raceNo}R確定! 1着は${winnerNum}.${winnerHorse.name}。払戻合計 ${totalPayout} チップ!`, "win");
            } else {
                flashResult(`${race.raceNo}R確定。1着は${winnerNum}.${winnerHorse.name}。的中はありませんでした。`, "lose");
            }
        } else {
            flashResult(`${race.raceNo}R確定。1着は${winnerNum}.${winnerHorse.name}。`, "info");
        }

        renderResultPanel(race);
        renderHistory();
        renderRaceTabs();
        renderRaceControls();
        renderEntryTable();
        renderBetSlip();
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
        return { hit, payout: 0 }; // payoutは呼び出し側でロック済みオッズを使って計算する
    }

    /* =========================================================
       10. レンダリング: 結果パネル(着順+払戻金表)
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

    function renderResultPanel(race) {
        if (race.status !== "finished") { resultPanelEl.innerHTML = ""; return; }
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

        resultPanelEl.innerHTML = `
      <div class="result-panel">
        <h3>${race.raceNo}R 着順</h3>
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

    function renderRaceControls() {
        const race = races[activeRaceIdx];
        if (race.status === "open") {
            runRaceBtn.disabled = false;
            runRaceBtn.textContent = "発売締切 & 発走";
            raceStatusMsgEl.textContent = "このレースは発売中です。買い目をカートに入れて購入してください。";
        } else if (race.status === "running") {
            runRaceBtn.disabled = true;
            runRaceBtn.textContent = "実況中…";
            raceStatusMsgEl.textContent = "レース進行中です。";
        } else {
            runRaceBtn.disabled = true;
            runRaceBtn.textContent = "確定済み";
            raceStatusMsgEl.textContent = "このレースは確定しました。番組表から他のレースを選べます。";
        }
    }

    /* =========================================================
       11. レンダリング: 出馬表
       ========================================================= */

    function renderEntryTable() {
        const race = races[activeRaceIdx];
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
                // 上限に達している場合は先頭を捨てて追加(最新の選択を優先)
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
        const race = races[activeRaceIdx];
        const def = BET_TYPES[currentBetType];
        const disabled = race.status !== "open";

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
        if (complete && !disabled) {
            odds = estimateOdds(race, currentBetType, currentSelection);
            oddsHtml = `<span class="slip-odds">${odds.toFixed(1)}<span class="suf">倍(予想)</span></span>`;
        }

        betSlipEl.innerHTML = `
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
        const race = races[activeRaceIdx];
        const def = BET_TYPES[currentBetType];
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
            raceIdx: activeRaceIdx,
            raceNo: race.raceNo,
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
          <td>${b.raceNo}R</td>
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
        const total = cart.reduce((s, b) => s + b.amount, 0);
        if (total === 0) return;
        if (total > balance) {
            flashResult("所持チップが足りません。", "lose");
            return;
        }
        updateBalance(balance - total, true);
        cart.forEach(b => {
            history.push({
                raceIdx: b.raceIdx,
                raceNo: b.raceNo,
                type: b.type,
                typeLabel: b.typeLabel,
                selection: b.selection,
                selectionLabel: b.selectionLabel,
                amount: b.amount,
                odds: b.odds,
                settled: false,
                hit: null,
                payout: null,
            });
        });
        cart = [];
        renderCart();
        renderHistory();
        flashResult("購入を確定しました。対象レースが確定すると自動的に払戻されます。", "win");
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
        <td>${rec.raceNo}R</td>
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
       17. 初期化・全体レンダリング
       ========================================================= */

    function renderAll() {
        renderRaceTabs();
        renderRaceInfo();
        renderTrack();
        renderRaceControls();
        renderResultPanel(races[activeRaceIdx]);
        renderEntryTable();
        renderBetTypeTabs();
        renderBetSlip();
        renderCart();
        renderHistory();
    }

    runRaceBtn.addEventListener("click", startRace);
    clearCartBtn.addEventListener("click", () => { cart = []; renderCart(); });
    confirmPurchaseBtn.addEventListener("click", confirmPurchase);

    buildProgram();
    updateBalance(balance, false);
    renderAll();
})();