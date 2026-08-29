(function () {
    "use strict";

    const HORSE_POOL = [
        { name: "サンダーボルト", color: "#e0553a" },
        { name: "ミッドナイトスター", color: "#4a6fe3" },
        { name: "ゴールドラッシュ", color: "#e6c34f" },
        { name: "ブレイブハート", color: "#3fae6a" },
        { name: "ウィンドチェイサー", color: "#c9c9c9" },
        { name: "レッドフューリー", color: "#b5253a" },
        { name: "シルバーアロー", color: "#8892a8" },
        { name: "ラッキーセブン", color: "#a85fd1" },
    ];

    const LANE_COUNT = 6;
    let balance = 100;
    let raceNo = 1;
    let horses = [];
    let selectedHorseId = null;
    let currentBet = null; // {horseId, amount}
    let racing = false;
    let raceInterval = null;

    const $ = (id) => document.getElementById(id);
    const balanceEl = $("balanceAmount");
    const betGrid = $("betGrid");
    const track = $("track");
    const selectedNameEl = $("selectedName");
    const betAmountInput = $("betAmount");
    const placeBetBtn = $("placeBetBtn");
    const startRaceBtn = $("startRaceBtn");
    const newRaceBtn = $("newRaceBtn");
    const currentBetInfo = $("currentBetInfo");
    const resultBanner = $("resultBanner");
    const historyBody = $("historyBody");
    const raceNoEl = $("raceNo");

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

    // ギャロップする馬:胴体・首/頭・尻尾・4本脚(対角ペアで交互に動く)をパーツ分けしたSVG
    function horseSvg(color) {
        const leg = shade(color, -55);
        const eye = "#171310";
        return `<svg class="silhouette" viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
      <g class="horse-rig">
        <g transform="translate(30,34)"><g class="leg leg-b"><path d="M0,0 L-3,12 L-6,24" stroke="${leg}"/></g></g>
        <g transform="translate(62,34)"><g class="leg leg-a"><path d="M0,0 L3,12 L6,24" stroke="${leg}"/></g></g>
        <path class="tail" d="M22,26 C12,29 6,27 2,34" stroke="${color}" stroke-width="4" fill="none" stroke-linecap="round"/>
        <ellipse cx="44" cy="26" rx="22" ry="11" fill="${color}"/>
        <path d="M60,18 C68,8 78,4 86,6 C92,7 95,11 92,15 C90,18 84,17 80,14 L77,22 C71,19 64,20 60,20 Z" fill="${color}"/>
        <path d="M80,5 L84,-3 L87,7 Z" fill="${color}"/>
        <circle cx="88" cy="10" r="1.6" fill="${eye}"/>
        <g transform="translate(36,34)"><g class="leg leg-a"><path d="M0,0 L-3,12 L-5,24" stroke="${leg}"/></g></g>
        <g transform="translate(68,34)"><g class="leg leg-b"><path d="M0,0 L3,12 L5,24" stroke="${leg}"/></g></g>
      </g>
    </svg>`;
    }

    function pickHorses() {
        const pool = [...HORSE_POOL];
        const chosen = [];
        for (let i = 0; i < LANE_COUNT; i++) {
            const idx = Math.floor(Math.random() * pool.length);
            chosen.push(pool.splice(idx, 1)[0]);
        }
        return chosen.map((h, i) => ({
            id: i,
            lane: i + 1,
            name: h.name,
            color: h.color,
            strength: 0.6 + Math.random() * 0.8, // base ability
            pos: 0,
            finished: false,
            finishOrder: null,
        }));
    }

    function assignOdds() {
        // strength -> implied probability -> odds with track take
        const total = horses.reduce((s, h) => s + h.strength, 0);
        horses.forEach(h => {
            const prob = h.strength / total;
            const rawOdds = (1 / prob) * 0.82; // track take ~18%
            const jitter = 0.9 + Math.random() * 0.2;
            h.odds = Math.max(1.2, Math.round(rawOdds * jitter * 10) / 10);
        });
    }

    function renderTrack() {
        track.innerHTML = "";
        horses.forEach(h => {
            const lane = document.createElement("div");
            lane.className = "lane";
            // 能力値が高いほど脚の回転を速く(周期を短く)して疾走感を出す
            const legDur = (0.62 - (h.strength - 0.6) * 0.28).toFixed(2);
            lane.innerHTML = `
        <div class="lane-num">${h.lane}</div>
        <div class="lane-track">
          <div class="horse" id="horse-${h.id}" style="left:0%; --leg-dur:${legDur}s;">
            ${horseSvg(h.color)}
            <span class="tag">${h.name}</span>
          </div>
          <div class="finish-line"></div>
          ${h.lane === 1 ? '<div class="finish-label">GOAL</div>' : ''}
        </div>
      `;
            track.appendChild(lane);
        });
    }

    function renderBetGrid() {
        betGrid.innerHTML = "";
        horses.forEach(h => {
            const card = document.createElement("div");
            card.className = "horse-card" + (selectedHorseId === h.id ? " selected" : "");
            card.dataset.id = h.id;
            card.innerHTML = `
        <div class="row1">
          <div class="name"><span class="dot" style="background:${h.color}"></span>${h.lane}. ${h.name}</div>
          <div class="odds">${h.odds.toFixed(1)}<span class="odds-suffix">倍</span></div>
        </div>
        <div class="meta">単勝オッズ &middot; レーン ${h.lane}</div>
      `;
            card.addEventListener("click", () => selectHorse(h.id));
            betGrid.appendChild(card);
        });
    }

    function selectHorse(id) {
        if (racing || currentBet) return;
        selectedHorseId = id;
        const h = horses.find(x => x.id === id);
        selectedNameEl.textContent = `${h.lane}. ${h.name} (${h.odds.toFixed(1)}倍)`;
        document.querySelectorAll(".horse-card").forEach(c => {
            c.classList.toggle("selected", Number(c.dataset.id) === id);
        });
    }

    function updateBalance(newVal, flash) {
        balance = newVal;
        balanceEl.textContent = Math.round(balance);
        if (flash) {
            balanceEl.classList.remove("flip");
            void balanceEl.offsetWidth;
            balanceEl.classList.add("flip");
        }
    }

    function placeBet() {
        if (racing || currentBet) return;
        if (selectedHorseId === null) {
            flashResult("賭ける馬を選んでください。", "lose");
            return;
        }
        const amt = Math.floor(Number(betAmountInput.value));
        if (!amt || amt < 10) {
            flashResult("賭け金は10チップ以上で入力してください。", "lose");
            return;
        }
        if (amt > balance) {
            flashResult("所持チップが足りません。", "lose");
            return;
        }
        currentBet = { horseId: selectedHorseId, amount: amt };
        updateBalance(balance - amt, true);
        const h = horses.find(x => x.id === selectedHorseId);
        currentBetInfo.innerHTML = `賭け中: <b>${h.lane}. ${h.name}</b> に <b>${amt}</b> チップ (${h.odds.toFixed(1)}倍)`;
        placeBetBtn.disabled = true;
        betAmountInput.disabled = true;
        document.querySelectorAll(".chip-btn").forEach(b => b.disabled = true);
        document.querySelectorAll(".horse-card").forEach(c => c.style.pointerEvents = "none");
        startRaceBtn.disabled = false;
        hideResult();
    }

    function flashResult(msg, kind) {
        resultBanner.textContent = msg;
        resultBanner.className = "result-banner show " + kind;
    }
    function hideResult() {
        resultBanner.className = "result-banner";
    }

    function startRace() {
        if (racing || !currentBet) return;
        racing = true;
        startRaceBtn.disabled = true;
        hideResult();
        horses.forEach(h => {
            h.pos = 0; h.finished = false; h.finishOrder = null;
            const el = document.getElementById(`horse-${h.id}`);
            if (el) {
                el.classList.remove("finished", "winner");
                el.classList.add("running");
            }
        });

        let finishedCount = 0;
        const order = [];

        raceInterval = setInterval(() => {
            horses.forEach(h => {
                if (h.finished) return;
                const jitter = Math.random() * 1.6;
                h.pos += (h.strength * 1.1 + jitter);
                const el = document.getElementById(`horse-${h.id}`);
                if (h.pos >= 100) {
                    h.pos = 100;
                    h.finished = true;
                    finishedCount++;
                    h.finishOrder = finishedCount;
                    order.push(h);
                    if (el) el.classList.remove("running");
                }
                if (el) el.style.left = Math.min(h.pos, 96) + "%";
            });

            if (finishedCount >= horses.length) {
                clearInterval(raceInterval);
                finishRace(order);
            }
        }, 110);
    }

    function finishRace(order) {
        racing = false;
        const winner = order[0];
        horses.forEach(h => {
            const el = document.getElementById(`horse-${h.id}`);
            if (!el) return;
            el.classList.add("finished");
            if (h.id === winner.id) el.classList.add("winner");
        });

        const bet = currentBet;
        const betHorse = horses.find(h => h.id === bet.horseId);
        const placeOfBetHorse = betHorse.finishOrder;
        let payout = 0;
        let won = betHorse.id === winner.id;
        if (won) {
            payout = Math.round(bet.amount * betHorse.odds);
            updateBalance(balance + payout, true);
            flashResult(`🏆 ${betHorse.lane}. ${betHorse.name} が1着! 払戻 ${payout} チップ獲得!`, "win");
        } else {
            flashResult(`結果: 1着は ${winner.lane}. ${winner.name}。あなたの ${betHorse.name} は${placeOfBetHorse}着でした。`, "lose");
        }

        addHistory({
            race: raceNo,
            horseName: `${betHorse.lane}.${betHorse.name}`,
            amount: bet.amount,
            place: placeOfBetHorse,
            payout: payout,
            net: payout - bet.amount,
        });

        currentBet = null;
        currentBetInfo.textContent = "";
        newRaceBtn.disabled = false;
    }

    function addHistory(rec) {
        const emptyRow = historyBody.querySelector(".empty-row");
        if (emptyRow) emptyRow.remove();
        const tr = document.createElement("tr");
        const netClass = rec.net >= 0 ? "pl-pos" : "pl-neg";
        const netStr = (rec.net >= 0 ? "+" : "") + rec.net;
        tr.innerHTML = `
      <td>${rec.race}</td>
      <td>${rec.horseName}</td>
      <td>${rec.amount}</td>
      <td>${rec.place}着</td>
      <td>${rec.payout}</td>
      <td class="${netClass}">${netStr}</td>
    `;
        historyBody.prepend(tr);
    }

    function newRace() {
        raceNo++;
        raceNoEl.textContent = "R." + raceNo;
        selectedHorseId = null;
        selectedNameEl.textContent = "未選択";
        placeBetBtn.disabled = false;
        betAmountInput.disabled = false;
        document.querySelectorAll(".chip-btn").forEach(b => b.disabled = false);
        startRaceBtn.disabled = true;
        newRaceBtn.disabled = true;
        hideResult();
        horses = pickHorses();
        assignOdds();
        renderTrack();
        renderBetGrid();

        if (balance <= 0) {
            flashResult("所持チップが尽きました。ページを再読み込みするとリセットされます。", "lose");
        }
    }

    // controls
    document.querySelectorAll(".chip-btn[data-add]").forEach(btn => {
        btn.addEventListener("click", () => {
            const cur = Number(betAmountInput.value) || 0;
            betAmountInput.value = cur + Number(btn.dataset.add);
        });
    });
    document.querySelector(".chip-btn[data-max]").addEventListener("click", () => {
        betAmountInput.value = balance;
    });
    placeBetBtn.addEventListener("click", placeBet);
    startRaceBtn.addEventListener("click", startRace);
    newRaceBtn.addEventListener("click", newRace);

    // init
    updateBalance(balance, false);
    horses = pickHorses();
    assignOdds();
    renderTrack();
    renderBetGrid();
})();