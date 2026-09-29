const STATE_KEY = 'tresFuteState4';

let state = {
    round: 1,
    silver: Array(4).fill(0).map(() => Array(6).fill(false)),
    yellow: Array(10).fill(0),
    blue: Array(12).fill(0),
    green: Array(12).fill(0),
    pink: Array(12).fill(0),
    usedActions: {
        reroll: 0,
        return: 0,
        plus1: 0
    },
    bonusMarks: [] // 0: none, 1: circled (unlocked), 2: crossed (used)
};

let stateHistory = [];
function pushHistory() {
    stateHistory.push(JSON.parse(JSON.stringify(state)));
    if (stateHistory.length > 50) stateHistory.shift(); // keep last 50
}

const yellowLayout = [
    [null, {i:0, v:3}, null, {i:1, v:6}],
    [{i:2, v:1}, null, {i:3, v:2}, null],
    [null, {i:4, v:4}, null, {i:5, v:3}],
    [{i:6, v:2}, null, {i:7, v:5}, null],
    [null, {i:8, v:5}, null, {i:9, v:4}]
];

// Fixed green multipliers! Pair 1 is x2, x2. Pair 2 is x2, x2, etc. (Actually, wait, if the board has x1 for the second box, but the score logic behaves as if it's the SAME multiplier... No wait, if the rulebook says 1x2=2 but the physical board says x1, the standard accepted logic is that the second box is ALWAYS x1! 
// Let's use x1 for the second box as the physical board clearly shows in "Doppel so clever". The French rulebook simply contains a known typo in its example. The German rulebook says "1x1=1". 
// But wait! "Doppelt so clever" multiplier system is: first box is x2, second is x1. Third is x2, fourth is x1. 
// "If you place a 6 in a x2 space and a 1 in a x2 space" -> this internet quote was misleading! 
// The actual German rulebook says "1x1 = 1".
const greenMults = [2, 2, 2, 1, 3, 3, 3, 2, 3, 1, 4, 1]; 

const bPts = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78];
const bBonuses = ['', '🔙', '<span class="badge-y">?</span>', '', '+1', '🔄', '<span class="badge-p">?</span>', '', '🦊', '🔙', '', '<span class="badge-g">?</span>'];

const pConds = ['', '', '>=2', '>=3', '>=4', '>=5', '>=6', '<=2', '<=3', '<=4', '<=5', '<=6'];
const pBonuses = ['', '', '🔄', '🔙', '+1', '<span class="badge-g">?</span>', '<span class="badge-y">?</span>', '🦊', '<span class="badge-s">?</span>', '🔄', '<span class="badge-b">?</span>', '<span class="badge-y">?</span>'];

let currentAction = null; 

function init() {
    loadState();
    renderZones();
    updateUI();
    setupEvents();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(console.error);
    }
}

function loadState() {
    const saved = localStorage.getItem(STATE_KEY);
    if (saved) {
        let loaded = JSON.parse(saved);
        if(loaded.usedActions) state = loaded;
        if(!state.bonusMarks) state.bonusMarks = [];
    }
}

function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    updateUI();
}

function getEarnedActions() {
    let earned = { reroll: 0, return: 0, plus1: 0 };
    if (state.round >= 1) earned.reroll++;
    if (state.round >= 2) earned.plus1++;
    if (state.round >= 3) earned.return++;
    if (state.silver[0][0] && state.silver[1][0] && state.silver[2][0] && state.silver[3][0]) earned.plus1++;
    if (state.yellow[2]>=1 && state.yellow[6]>=1) earned.reroll++;
    if (state.yellow[0]>=1 && state.yellow[4]>=1 && state.yellow[8]>=1) earned.plus1++;
    if (state.yellow[2]>=1 && state.yellow[3]>=1) earned.return++;
    if (state.blue[1] > 0) earned.return++;
    if (state.blue[4] > 0) earned.plus1++;
    if (state.blue[5] > 0) earned.reroll++;
    if (state.blue[9] > 0) earned.return++;
    if (state.green[1] > 0) earned.reroll++;
    if (state.green[4] > 0) earned.return++;
    if (state.green[8] > 0) earned.plus1++;
    if (state.pink[2] >= 2) earned.reroll++;
    if (state.pink[3] >= 3) earned.return++;
    if (state.pink[4] >= 4) earned.plus1++;
    if (state.pink[9] >= 4) earned.reroll++;
    return earned;
}

function renderZones() {
    // Silver
    let silverHtml = '';
    for (let r=0; r<4; r++) {
        for (let c=0; c<6; c++) {
            silverHtml += `<div class="box-btn silver-btn silver-row-${r}" data-r="${r}" data-c="${c}">${c+1}</div>`;
        }
    }
    document.querySelector('.silver-grid').innerHTML = silverHtml;

    // Yellow
    let yellowHtml = '';
    for (let r=0; r<5; r++) {
        for (let c=0; c<4; c++) {
            const cell = yellowLayout[r][c];
            if (cell) {
                yellowHtml += `<div class="box-btn yellow-btn" data-i="${cell.i}">${cell.v}</div>`;
            } else {
                yellowHtml += `<div class="yellow-empty"></div>`;
            }
        }
    }
    document.querySelector('.yellow-grid').innerHTML = yellowHtml;

    // Blue
    let blueHtml = '';
    for (let i=0; i<12; i++) {
        blueHtml += `
            <div class="col-container">
                <span class="track-score-label star-label">${bPts[i+1]}</span>
                <div class="box-btn blue-btn" data-i="${i}"></div>
                <span class="bonus-label-bottom clickable-bonus" data-bid="b-${i}">${bBonuses[i]}</span>
            </div>
        `;
        if(i < 11) blueHtml += `<span class="track-separator">&ge;</span>`;
    }
    document.querySelector('.blue-track').innerHTML = blueHtml;

    // Green
    let greenHtml = '';
    const gB = ['', '🔄', '', '<span class="badge-b">?</span>', '🔙', '', '🦊', '<span class="badge-s">?</span>', '+1', '', '<span class="badge-p">?</span>', '<span class="badge-y">?</span>'];
    for (let p=0; p<6; p++) {
        let m1 = greenMults[p*2];
        let m2 = greenMults[p*2+1];
        greenHtml += `
            <div class="green-pair">
                <div class="green-score-badge" id="g-badge-${p}">0</div>
                <div class="col-container">
                    <span class="green-mult">x${m1}</span>
                    <div class="box-btn green-btn" data-i="${p*2}"></div>
                    <span class="bonus-label-bottom clickable-bonus" data-bid="g-${p*2}">${gB[p*2]}</span>
                </div>
                <span class="green-minus">-</span>
                <div class="col-container">
                    <span class="green-mult">x${m2}</span>
                    <div class="box-btn green-btn" data-i="${p*2+1}"></div>
                    <span class="bonus-label-bottom clickable-bonus" data-bid="g-${p*2+1}">${gB[p*2+1]}</span>
                </div>
            </div>
        `;
    }
    document.querySelector('.green-track').innerHTML = greenHtml;

    // Pink
    let pinkHtml = '';
    for (let i=0; i<12; i++) {
        pinkHtml += `
            <div class="col-container">
                <span class="bonus-label-top">${pConds[i] || '&nbsp;'}</span>
                <div class="box-btn pink-btn" data-i="${i}"></div>
                <span class="bonus-label-bottom clickable-bonus" data-bid="p-${i}">${pBonuses[i]}</span>
            </div>
        `;
        if(i < 11) pinkHtml += `<span class="track-separator"></span>`;
    }
    document.querySelector('.pink-track').innerHTML = pinkHtml;
}

function meetsPinkCondition(idx) {
    let v = state.pink[idx];
    if (v === 0) return false;
    if (idx === 2 && v < 2) return false;
    if (idx === 3 && v < 3) return false;
    if (idx === 4 && v < 4) return false;
    if (idx === 5 && v < 5) return false;
    if (idx === 6 && v < 6) return false;
    if (idx === 7 && v > 2) return false;
    if (idx === 8 && v > 3) return false;
    if (idx === 9 && v > 4) return false;
    if (idx === 10 && v > 5) return false;
    if (idx === 11 && v > 6) return false;
    return true;
}

function isActionBonusEarned(bid) {
    if(!bid) return false;
    const actionBids = ['b-1', 'b-4', 'b-5', 'b-8', 'b-9', 'g-1', 'g-4', 'g-6', 'g-8', 'p-2', 'p-3', 'p-4', 'p-7', 'p-9', 's-c-0', 's-c-2', 'y-c-0', 'y-c-1', 'y-c-3', 'y-r-1'];
    if (!actionBids.includes(bid)) return false;
    if (bid.startsWith('b-')) return state.blue[parseInt(bid.split('-')[1])];
    if (bid.startsWith('g-')) return state.green[parseInt(bid.split('-')[1])] > 0;
    if (bid.startsWith('p-')) return meetsPinkCondition(parseInt(bid.split('-')[1]));
    if (bid.startsWith('s-c-')) {
        let c = parseInt(bid.split('-')[2]);
        let r0 = (c===2) ? true : state.silver[0][c];
        let r1 = (c===3) ? true : state.silver[1][c];
        let r2 = (c===0) ? true : state.silver[2][c];
        let r3 = (c===4) ? true : state.silver[3][c];
        return r0 && r1 && r2 && r3;
    }
    if (bid.startsWith('y-r-')) {
        let r = parseInt(bid.split('-')[2]);
        let y = state.yellow;
        if (r===0) return y[0]>=1 && y[1]>=1;
        if (r===1) return y[2]>=1 && y[3]>=1;
        if (r===2) return y[4]>=1 && y[5]>=1;
        if (r===3) return y[6]>=1 && y[7]>=1;
        if (r===4) return y[8]>=1 && y[9]>=1;
    }
    if (bid.startsWith('y-c-')) {
        let c = parseInt(bid.split('-')[2]);
        let y = state.yellow;
        if (c===0) return y[2]>=1 && y[6]>=1;
        if (c===1) return y[0]>=1 && y[4]>=1 && y[8]>=1;
        if (c===2) return y[3]>=1 && y[7]>=1;
        if (c===3) return y[1]>=1 && y[5]>=1 && y[9]>=1;
    }
    return false;
}

function updateUI() {
    document.querySelectorAll('.clickable-bonus').forEach((el, idx) => {
        let bid = el.getAttribute('data-bid');
        let val = state.bonusMarks[idx] || 0;
        
        el.classList.remove('highlighted', 'crossed');
        if (val === 2 || isActionBonusEarned(bid)) {
            el.classList.add('crossed');
        } else if (val === 1) {
            el.classList.add('highlighted');
        }
    });

    // Undo button
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) undoBtn.disabled = stateHistory.length === 0;

    // Round
    const roundBonuses = ["", "🔄", "+1", "🔙", "?", "", ""];
    document.getElementById('round-display').innerText = `Tour: ${state.round} / 6 (Bonus: ${roundBonuses[state.round] || "Aucun"})`;

    // Trackers
    const earned = getEarnedActions();
    ['reroll', 'return', 'plus1'].forEach(type => {
        const container = document.getElementById(`tracker-${type}`);
        container.innerHTML = '';
        const earnedCount = earned[type];
        const usedCount = state.usedActions[type];
        
        for(let i=0; i<7; i++) {
            let div = document.createElement('div');
            div.className = 'tracker-circle';
            div.dataset.type = type;
            if (i < earnedCount) {
                div.classList.add('circled');
                if (i < usedCount) {
                    div.classList.add('crossed');
                }
            }
            container.appendChild(div);
        }
    });

    // Silver
    for (let r=0; r<4; r++) {
        for (let c=0; c<6; c++) {
            const btn = document.querySelector(`.silver-btn[data-r="${r}"][data-c="${c}"]`);
            if (state.silver[r][c]) btn.classList.add('crossed');
            else btn.classList.remove('crossed');
        }
    }

    // Yellow
    document.querySelectorAll('.yellow-btn').forEach(btn => {
        const i = parseInt(btn.dataset.i);
        btn.classList.remove('circled', 'crossed');
        if (state.yellow[i] === 1) btn.classList.add('circled');
        if (state.yellow[i] >= 2) btn.classList.add('circled', 'crossed');
    });

    // Blue
    document.querySelectorAll('.blue-btn').forEach(btn => {
        const i = parseInt(btn.dataset.i);
        btn.innerText = state.blue[i] || '';
        if (i > 0 && state.blue[i-1] === 0) btn.classList.add('disabled-btn');
        else btn.classList.remove('disabled-btn');
    });

    // Green
    document.querySelectorAll('.green-btn').forEach(btn => {
        const i = parseInt(btn.dataset.i);
        btn.innerText = state.green[i] ? (state.green[i] * greenMults[i]) : '';
        if (i > 0 && state.green[i-1] === 0) btn.classList.add('disabled-btn');
        else btn.classList.remove('disabled-btn');
    });
    for(let p=0; p<6; p++) {
        const badge = document.getElementById(`g-badge-${p}`);
        let v1 = state.green[p*2];
        let v2 = state.green[p*2+1];
        badge.style.display = 'flex';
        if(v1 && v2) {
            badge.innerText = (v1 * greenMults[p*2]) - (v2 * greenMults[p*2+1]);
        } else {
            badge.innerText = "";
        }
    }

    // Pink
    document.querySelectorAll('.pink-btn').forEach(btn => {
        const i = parseInt(btn.dataset.i);
        btn.innerText = state.pink[i] || '';
        if (i > 0 && state.pink[i-1] === 0) btn.classList.add('disabled-btn');
        else btn.classList.remove('disabled-btn');
    });

    calculateScores();
}

function setupEvents() {
    document.addEventListener('click', (e) => {
        const bonus = e.target.closest('.clickable-bonus');
        if (bonus) {
            pushHistory();
            const allBonuses = Array.from(document.querySelectorAll('.clickable-bonus'));
            const idx = allBonuses.indexOf(bonus);
            if (idx !== -1) {
                while(state.bonusMarks.length <= idx) state.bonusMarks.push(0);
                state.bonusMarks[idx] = (state.bonusMarks[idx] === 2) ? 0 : 2;
                saveState();
                updateUI();
            }
        }
    });

    document.getElementById('undo-btn').addEventListener('click', () => {
        if (stateHistory.length > 0) {
            state = stateHistory.pop();
            saveState();
        }
    });

    // Rounds
    document.getElementById('prev-round').addEventListener('click', () => {
        if(state.round > 1) {
            pushHistory();
            state.round--;
            saveState();
        }
    });
    document.getElementById('next-round').addEventListener('click', () => {
        if(state.round < 6) {
            pushHistory();
            state.round++;
            saveState();
        }
    });

    // Trackers
    document.querySelectorAll('.tracker-circles').forEach(el => {
        el.addEventListener('click', e => {
            if(e.target.classList.contains('tracker-circle')) {
                let type = e.target.dataset.type;
                const earned = getEarnedActions()[type];
                let used = state.usedActions[type];
                
                if (e.target.classList.contains('circled') && !e.target.classList.contains('crossed')) {
                    if (used < earned) { pushHistory(); state.usedActions[type]++; }
                } 
                else if (e.target.classList.contains('crossed')) {
                    if (used > 0) { pushHistory(); state.usedActions[type]--; }
                }
                saveState();
            }
        });
    });

    // Silver
    document.querySelector('.silver-zone').addEventListener('click', e => {
        if(e.target.classList.contains('silver-btn')) {
            pushHistory();
            let r = parseInt(e.target.dataset.r);
            let c = parseInt(e.target.dataset.c);
            state.silver[r][c] = !state.silver[r][c];
            saveState();
        }
    });

    // Yellow
    document.querySelector('.yellow-zone').addEventListener('click', e => {
        if(e.target.classList.contains('yellow-btn')) {
            pushHistory();
            let i = parseInt(e.target.dataset.i);
            state.yellow[i] = (state.yellow[i] + 1) % 3;
            saveState();
        }
    });

    const openNumpad = (zone, i, maxVal) => {
        currentAction = {zone, i};
        const modal = document.getElementById('numpad-modal');
        modal.classList.remove('hidden');
        document.querySelectorAll('.num-btn').forEach(btn => {
            if (parseInt(btn.dataset.val) > maxVal) btn.classList.add('hidden');
            else btn.classList.remove('hidden');
        });
    };

    document.querySelector('.blue-zone').addEventListener('click', e => {
        if(e.target.classList.contains('blue-btn')) {
            let i = parseInt(e.target.dataset.i);
            openNumpad('blue', i, 12);
        }
    });

    document.querySelector('.green-zone').addEventListener('click', e => {
        if(e.target.classList.contains('green-btn')) {
            let i = parseInt(e.target.dataset.i);
            openNumpad('green', i, 6);
        }
    });

    document.querySelector('.pink-zone').addEventListener('click', e => {
        if(e.target.classList.contains('pink-btn')) {
            let i = parseInt(e.target.dataset.i);
            openNumpad('pink', i, 6);
        }
    });

    document.getElementById('cancel-btn').addEventListener('click', () => {
        document.getElementById('numpad-modal').classList.add('hidden');
    });

    document.getElementById('clear-btn').addEventListener('click', () => {
        if (currentAction) {
            pushHistory();
            state[currentAction.zone][currentAction.i] = 0;
            saveState();
        }
        document.getElementById('numpad-modal').classList.add('hidden');
    });

    document.querySelectorAll('.num-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            let val = parseInt(e.target.dataset.val);
            if (currentAction) {
                if (currentAction.zone === 'blue') {
                    let maxAllowed = 12;
                    for(let k=currentAction.i - 1; k>=0; k--) {
                        if(state.blue[k] > 0) { maxAllowed = state.blue[k]; break; }
                    }
                    if (val > maxAllowed) {
                        alert('En zone bleue, la valeur doit Ãªtre infÃ©rieure ou Ã©gale Ã  la prÃ©cÃ©dente !');
                        return;
                    }
                }
                pushHistory();
                state[currentAction.zone][currentAction.i] = val;
                saveState();
            }
            document.getElementById('numpad-modal').classList.add('hidden');
        });
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
        if(confirm('Nouvelle partie ?')) {
            pushHistory();
            state = {
                round: 1,
                silver: Array(4).fill(0).map(() => Array(6).fill(false)),
                yellow: Array(10).fill(0),
                blue: Array(12).fill(0),
                green: Array(12).fill(0),
                pink: Array(12).fill(0),
                usedActions: { reroll: 0, return: 0, plus1: 0 },
                bonusMarks: []
            };
            saveState();
            renderZones();
            updateUI();
        }
    });
}

function calculateScores() {
    let sScore = 0;
    const sPts = [0, 2, 4, 7, 11, 16, 22];
    for(let r=0; r<4; r++) {
        let crosses = state.silver[r].filter(b=>b).length;
        sScore += sPts[crosses];
    }

    const yPts = [0, 3, 10, 21, 36, 55, 75, 96, 118, 141, 165];
    let yCrosses = state.yellow.filter(v => v===2).length;
    let yScore = yPts[yCrosses] || 0;

    let bCount = state.blue.filter(v=>v>0).length;
    let bScore = bPts[bCount] || 0;

    let gScore = 0;
    for(let p=0; p<6; p++) {
        let v1 = state.green[p*2];
        let v2 = state.green[p*2+1];
        if(v1>0 && v2>0) {
            gScore += (v1 * greenMults[p*2]) - (v2 * greenMults[p*2+1]);
        }
    }

    let pScore = state.pink.reduce((a,b)=>a+b, 0);

    let foxes = 0;
    if (state.silver[0][2] && state.silver[1][2] && state.silver[2][2] && state.silver[3][2]) foxes++;
    if (state.yellow[1]>=1 && state.yellow[5]>=1 && state.yellow[9]>=1) foxes++;
    if (state.blue[8] > 0) foxes++;
    if (state.green[6] > 0) foxes++;
    if (state.pink[7] >= 2) foxes++; 

    let minZone = Math.min(sScore, yScore, bScore, gScore, pScore);
    let fScore = foxes * minZone;
    let total = sScore + yScore + bScore + gScore + pScore + fScore;

    document.getElementById('s-score').innerText = sScore;
    document.getElementById('y-score').innerText = yScore;
    document.getElementById('b-score').innerText = bScore;
    document.getElementById('g-score').innerText = gScore;
    document.getElementById('p-score').innerText = pScore;
    document.getElementById('f-count').innerText = foxes;
    document.getElementById('f-min').innerText = minZone;
    document.getElementById('f-score').innerText = fScore;
    document.getElementById('total-score').innerText = total;
}

init();
