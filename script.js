const ROUND_DURATION = 20;
const LOCK_SECONDS = 5;
const MASTER_RECOVERY_CODE = "786482";
const OWNER_ADMIN_MOBILE = "9351433914";
const DEFAULT_BLOCK_POPUP_MSG = "🚫 Block your ID! Please msg Customer Care.";

const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyAKqTV8_EGXMDFpQN7y0Jy74qoLX5xd8SE",
    authDomain: "rubinapro-c03b8.firebaseapp.com",
    databaseURL: "https://rubinapro-c03b8-default-rtdb.firebaseio.com",
    projectId: "rubinapro-c03b8",
    storageBucket: "rubinapro-c03b8.firebasestorage.app",
    messagingSenderId: "790156196888",
    appId: "1:790156196888:web:21437e03807db0eee8d76d",
    measurementId: "G-LVEK6ECWKM"
};

if (!localStorage.getItem('rp_firebase_config')) {
    localStorage.setItem('rp_firebase_config', JSON.stringify(DEFAULT_FIREBASE_CONFIG));
}

if (!localStorage.getItem('rp_zero_init_v2')) {
    localStorage.setItem('rp_balance', '0.00');
    localStorage.setItem('rp_zero_init_v2', '1');
}

if (!sessionStorage.getItem('rp_cleared_stuck_force')) {
    localStorage.removeItem('rp_forced_next_num');
    sessionStorage.setItem('rp_cleared_stuck_force', '1');
}

let cloudDb = null;
let depApprovalOn = localStorage.getItem('rp_dep_approval_on') !== '0';
let witApprovalOn = localStorage.getItem('rp_wit_approval_on') !== '0';

let selectedRawRecharge = 1000;
let selectedTotalCreditWithBonus = 1350;

let walletBalance = parseFloat(localStorage.getItem('rp_balance') || '0.00');
let soundEnabled = true;
let audioCtx = null;
let isAppInBackground = false;

let timeRemaining = ROUND_DURATION;
let periodCounter = 51;
let currentPeriodId = "";
let lastSettledPeriodId = "";

let selectedBet = { type: 'COLOR', value: 'GREEN', label: 'Green', odds: 2.0 };
let baseChipAmount = 10;
let betMultiplier = 1;

window.adminForcedNextNumber = null;

let gameHistory = [];
let userBets = [];
let currentAiSignal = { color: 'GREEN', confidence: 81, hotNumber: 7 };

/* ============================================================
 * HELPER: CHECK IF CURRENT USER IS BLOCKED & SHOW POPUP
 * ============================================================ */
function isCurrentUserBlockedWithPopup() {
    const curMob = localStorage.getItem('rp_logged_user') || OWNER_ADMIN_MOBILE;
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
    const u = users[curMob];
    if (u && u.blocked) {
        playLossSound();
        const msg = (u.blockMsg && u.blockMsg.trim()) ? u.blockMsg.trim() : DEFAULT_BLOCK_POPUP_MSG;
        showFeedbackBanner(msg, true);
        return true;
    }
    return false;
}

/* ============================================================
 * UNIVERSAL SERVER CLOCK SYNC (SAME PERIOD & SECOND ON ALL PHONES)
 * ============================================================ */
function getServerSyncedPeriodAndTime() {
    const nowMs = Date.now();
    const nowDate = new Date(nowMs);
    const y = nowDate.getFullYear();
    const m = String(nowDate.getMonth() + 1).padStart(2, '0');
    const d = String(nowDate.getDate()).padStart(2, '0');

    const midnightMs = new Date(y, nowDate.getMonth(), nowDate.getDate()).getTime();
    const elapsedSecToday = Math.floor((nowMs - midnightMs) / 1000);

    const slotIndex = Math.floor(elapsedSecToday / ROUND_DURATION) + 1;
    const secIntoSlot = elapsedSecToday % ROUND_DURATION;
    const secLeft = ROUND_DURATION - secIntoSlot;

    const pId = `${y}${m}${d}${String(slotIndex).padStart(4, '0')}`;
    return { periodId: pId, slotIndex: slotIndex, secLeft: secLeft, datePrefix: `${y}${m}${d}` };
}

function getDeterministicHardOutcomeForPeriod(pIdStr) {
    let hash = 2166136261;
    const str = String(pIdStr) + "_RUBINAPRO_HARD_SALT";
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    const rawNum = Math.abs(hash) % 10;

    const prevNum = parseInt(pIdStr, 10) - 1;
    let prevHash = 2166136261;
    const prevStr = String(prevNum) + "_RUBINAPRO_HARD_SALT";
    for (let i = 0; i < prevStr.length; i++) {
        prevHash ^= prevStr.charCodeAt(i);
        prevHash = Math.imul(prevHash, 16777619);
    }
    const prevWin = Math.abs(prevHash) % 10;

    if (rawNum === prevWin) {
        return (rawNum + 3) % 10;
    }
    return rawNum;
}

/* ============================================================
 * BONUS CALCULATOR & DEPOSIT (DEPOSIT ALWAYS REMAINS OPEN EVEN IF BLOCKED)
 * ============================================================ */
function calculateDepositBonus(amt) {
    const n = parseInt(amt, 10) || 0;
    let pct = 0;
    if (n >= 10000) pct = 70;
    else if (n >= 5000) pct = 40;
    else if (n >= 1000) pct = 35;
    else if (n >= 500) pct = 30;
    else if (n >= 300) pct = 20;
    else if (n >= 100) pct = 2;
    const bonus = Math.round((n * pct) / 100);
    return { base: n, pct: pct, bonus: bonus, total: n + bonus };
}

function openDepositModal() {
    playClickSound();
    if (typeof setHomeSupportButtonVisible === 'function') setHomeSupportButtonVisible(false);
    const defaultBtn = document.getElementById('depCard-1000');
    chooseDepositAmount(1000, defaultBtn);
    document.getElementById('depositModal').classList.remove('hidden');
}

function closeDepositModal() {
    document.getElementById('depositModal').classList.add('hidden');
    if (typeof setHomeSupportButtonVisible === 'function') {
        setHomeSupportButtonVisible(!!localStorage.getItem('rp_logged_user'));
    }
}

function chooseDepositAmount(baseAmount, btnEl) {
    const info = calculateDepositBonus(baseAmount);
    selectedRawRecharge = info.base;
    selectedTotalCreditWithBonus = info.total;
    document.getElementById('customDepInput').value = info.total;

    document.querySelectorAll('.dep-amt-btn').forEach(btn => {
        btn.classList.remove('selected-dep-btn');
    });
    if (btnEl) {
        btnEl.classList.add('selected-dep-btn');
    }
    playClickSound();
}

function onCustomDepManualInput() {
    const val = parseInt(document.getElementById('customDepInput').value, 10) || 0;
    selectedRawRecharge = val;
    selectedTotalCreditWithBonus = val;
}

function proceedCustomDeposit() {
    const inputVal = parseInt(document.getElementById('customDepInput').value, 10);
    if (!inputVal || inputVal < 100) {
        playLossSound();
        showFeedbackBanner('Minimum recharge amount is ₹100!', true);
        return;
    }
    playClickSound();
    const payBase = selectedRawRecharge >= 100 ? selectedRawRecharge : inputVal;
    const creditTotal = selectedTotalCreditWithBonus >= 100 ? selectedTotalCreditWithBonus : inputVal;

    localStorage.setItem('rp_pending_dep_amt', payBase);
    localStorage.setItem('rp_pending_dep_credit', creditTotal);
    window.location.href = `payment.html?amount=${payBase}&credit=${creditTotal}`;
}

/* ============================================================
 * HD SOUND ENGINE & BACKGROUND MUTE
 * ============================================================ */
document.addEventListener('visibilitychange', () => { isAppInBackground = document.hidden; });
window.addEventListener('blur', () => { isAppInBackground = true; });
window.addEventListener('focus', () => { isAppInBackground = false; });

function shouldPlayTickSound() {
    if (!soundEnabled || isAppInBackground || document.hidden) return false;
    const modals = ['authScreen', 'depositModal', 'withdrawModal', 'adminModal', 'installGuideModal', 'profileModal', 'supportModal', 'walletHistoryModal'];
    return modals.every(id => {
        const el = document.getElementById(id);
        return !el || el.classList.contains('hidden');
    });
}

function initAudio() {
    if (!audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) audioCtx = new AudioCtx();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

document.addEventListener('touchstart', initAudio, { once: true });
document.addEventListener('click', initAudio, { once: true });

function playTone(freq = 500, type = 'triangle', duration = 0.14, gainLevel = 0.80) {
    if (!soundEnabled || isAppInBackground || document.hidden) return;
    try {
        initAudio();
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(gainLevel, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
}

function playClickSound() { playTone(650, 'triangle', 0.08, 0.75); }

function playWinSound() {
    if (!soundEnabled || isAppInBackground || document.hidden) return;
    const notes = [
        { f: 523.25, d: 0.12, t: 0, type: 'triangle' },
        { f: 659.25, d: 0.12, t: 110, type: 'triangle' },
        { f: 783.99, d: 0.12, t: 220, type: 'triangle' },
        { f: 1046.50, d: 0.18, t: 330, type: 'square' },
        { f: 783.99, d: 0.10, t: 480, type: 'triangle' },
        { f: 1046.50, d: 0.40, t: 580, type: 'square' }
    ];
    notes.forEach(n => setTimeout(() => playTone(n.f, n.type, n.d, 0.90), n.t));
}

function playLossSound() {
    if (!soundEnabled || isAppInBackground || document.hidden) return;
    try {
        initAudio();
        if (!audioCtx) return;
        const notes = [
            { fStart: 392.00, fEnd: 370.00, t: 0, dur: 0.22 },
            { fStart: 349.23, fEnd: 330.00, t: 230, dur: 0.22 },
            { fStart: 311.13, fEnd: 293.66, t: 460, dur: 0.22 },
            { fStart: 261.63, fEnd: 185.00, t: 690, dur: 0.55 }
        ];
        notes.forEach(n => {
            setTimeout(() => {
                if (!audioCtx || isAppInBackground || document.hidden) return;
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(n.fStart, audioCtx.currentTime);
                osc.frequency.linearRampToValueAtTime(n.fEnd, audioCtx.currentTime + n.dur);
                gain.gain.setValueAtTime(0.85, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + n.dur);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + n.dur);
            }, n.t);
        });
    } catch (e) {}
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    document.getElementById('soundToggleBtn').textContent = soundEnabled ? '🔊 HD Sound' : '🔇 Muted';
    const profBtn = document.getElementById('profSoundBtn');
    if (profBtn) profBtn.textContent = soundEnabled ? '🔊 ON' : '🔇 OFF';
    if (soundEnabled) playWinSound();
}

/* ============================================================
 * 20-SECOND TRADING ENGINE
 * ============================================================ */
function saveWalletBalance() {
    localStorage.setItem('rp_balance', walletBalance.toFixed(2));
    document.getElementById('walletBalance').textContent = walletBalance.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function getOutcomeDetails(num) {
    const n = parseInt(num, 10);
    let colors = [];
    if (n === 0) colors = ['RED', 'VIOLET'];
    else if (n === 5) colors = ['GREEN', 'VIOLET'];
    else if ([1, 3, 7, 9].includes(n)) colors = ['GREEN'];
    else colors = ['RED'];
    return { number: n, colors, size: n >= 5 ? 'BIG' : 'SMALL' };
}

function getBallStyle(num) {
    if (num === 0) return 'num-0-bg';
    if (num === 5) return 'num-5-bg';
    if ([1, 3, 7, 9].includes(num)) return 'num-green-bg';
    return 'num-red-bg';
}

function seedInitialHistory() {
    const syncInfo = getServerSyncedPeriodAndTime();
    currentPeriodId = syncInfo.periodId;
    periodCounter = syncInfo.slotIndex;
    timeRemaining = syncInfo.secLeft;
    lastSettledPeriodId = "";

    gameHistory = [];
    const startSlot = Math.max(1, syncInfo.slotIndex - 25);
    for (let s = startSlot; s < syncInfo.slotIndex; s++) {
        const pastPid = `${syncInfo.datePrefix}${String(s).padStart(4, '0')}`;
        const winNum = getDeterministicHardOutcomeForPeriod(pastPid);
        const d = getOutcomeDetails(winNum);
        gameHistory.unshift({ periodId: pastPid, number: d.number, colors: d.colors, size: d.size });
    }
    document.getElementById('currentPeriodId').textContent = `#${currentPeriodId}`;
}

function runAiPatternAnalysis() {
    const recent12 = gameHistory.slice(0, 12);
    let g = 0, r = 0;
    recent12.forEach(item => {
        if (item.colors.includes('GREEN')) g++;
        if (item.colors.includes('RED')) r++;
    });
    const nextColor = g >= r ? 'RED' : 'GREEN';
    const confidence = 74 + (periodCounter % 15);
    const matching = nextColor === 'GREEN' ? [1, 3, 5, 7, 9] : [0, 2, 4, 6, 8];
    const hotNumber = matching[periodCounter % matching.length];

    currentAiSignal = { color: nextColor, confidence, hotNumber };
    const colEl = document.getElementById('aiPredColor');
    colEl.textContent = nextColor;
    colEl.style.color = nextColor === 'GREEN' ? '#34d399' : '#f87171';
    document.getElementById('aiConfidenceBadge').textContent = `${confidence}%`;
    document.getElementById('aiHotNumber').textContent = `#${hotNumber}`;
    document.getElementById('aiPredSize').textContent = hotNumber >= 5 ? 'BIG' : 'SMALL';
}

function applyAiSignal() {
    if (isCurrentUserBlockedWithPopup()) return;
    if (timeRemaining <= LOCK_SECONDS) return;
    const c = currentAiSignal.color;
    selectTarget('COLOR', c, c === 'GREEN' ? 'Green' : 'Red', 2);
    showFeedbackBanner(`Market Signal Applied: ${c}`);
}

function selectTarget(type, value, label, odds) {
    if (isCurrentUserBlockedWithPopup()) return;
    if (timeRemaining <= LOCK_SECONDS) return;
    selectedBet = { type, value, label, odds };
    playClickSound();
    document.querySelectorAll('.bet-target-btn').forEach(btn => btn.classList.remove('active-target'));
    const activeBtn = document.getElementById(`btn-${type}-${value}`);
    if (activeBtn) activeBtn.classList.add('active-target');
    updateBetCalculationUI();
}

function setBaseAmount(val) {
    if (isCurrentUserBlockedWithPopup()) return;
    baseChipAmount = val;
    playClickSound();
    document.querySelectorAll('.chip-item:not(.mult-item)').forEach(btn => {
        btn.classList.toggle('selected-chip', parseInt(btn.dataset.val, 10) === val);
    });
    updateBetCalculationUI();
}

function setMultiplier(mult) {
    if (isCurrentUserBlockedWithPopup()) return;
    betMultiplier = mult;
    playClickSound();
    document.querySelectorAll('.mult-item').forEach(btn => {
        btn.classList.toggle('selected-chip', parseInt(btn.dataset.mult, 10) === mult);
    });
    updateBetCalculationUI();
}

function updateBetCalculationUI() {
    const totalStake = baseChipAmount * betMultiplier;
    const potentialWin = totalStake * selectedBet.odds;
    document.getElementById('selectedTargetBadge').textContent = `${selectedBet.label} (${selectedBet.odds}x)`;
    document.getElementById('potentialWinDisplay').textContent = `₹${potentialWin.toLocaleString('en-IN')}`;
    document.getElementById('totalBetBtnText').textContent = `₹${totalStake.toLocaleString('en-IN')}`;
}

function confirmPlaceBet() {
    // If blocked, stop bet and show custom/default block popup!
    if (isCurrentUserBlockedWithPopup()) return;

    const curMob = localStorage.getItem('rp_logged_user') || OWNER_ADMIN_MOBILE;
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');

    if (timeRemaining <= LOCK_SECONDS) {
        playLossSound();
        showFeedbackBanner('Round is locked!', true);
        return;
    }
    const stake = baseChipAmount * betMultiplier;
    if (stake > walletBalance) {
        playLossSound();
        openDepositModal();
        showFeedbackBanner('Insufficient Balance! Please Recharge Wallet.', true);
        return;
    }
    walletBalance -= stake;
    saveWalletBalance();
    playTone(760, 'triangle', 0.16, 0.85);

    let existingBet = userBets.find(
        b => b.periodId === currentPeriodId && b.type === selectedBet.type && String(b.value) === String(selectedBet.value) && b.status === 'PENDING'
    );

    let activeBetRecord = null;
    if (existingBet) {
        existingBet.stake += stake;
        existingBet.time = new Date().toLocaleTimeString();
        activeBetRecord = existingBet;
    } else {
        activeBetRecord = {
            id: `${currentPeriodId}_${curMob}_${selectedBet.type}_${selectedBet.value}`,
            user: curMob,
            userName: (users[curMob] && users[curMob].name) ? users[curMob].name : 'Trader',
            periodId: currentPeriodId,
            type: selectedBet.type,
            value: String(selectedBet.value),
            label: selectedBet.label,
            stake: stake,
            status: 'PENDING',
            payout: 0,
            time: new Date().toLocaleTimeString()
        };
        userBets.unshift(activeBetRecord);
    }

    const currentRoundUserBets = userBets.filter(b => b.periodId === currentPeriodId && b.status === 'PENDING');
    const summaryStr = currentRoundUserBets.map(b => `${b.label} (₹${b.stake})`).join(', ');

    if (!users[curMob]) users[curMob] = { name: 'Trader', pass: '1234', balance: walletBalance, totalDeposit: 0 };
    users[curMob].balance = walletBalance;
    users[curMob].lastBet = summaryStr;
    users[curMob].lastActive = Date.now();
    users[curMob].recentBets = userBets.slice(0, 15);
    localStorage.setItem('rp_users', JSON.stringify(users));

    let allLiveBets = JSON.parse(localStorage.getItem('rp_live_bets') || '[]');
    const liveIdx = allLiveBets.findIndex(b => b.id === activeBetRecord.id);
    if (liveIdx > -1) {
        allLiveBets[liveIdx] = activeBetRecord;
    } else {
        allLiveBets.unshift(activeBetRecord);
    }
    localStorage.setItem('rp_live_bets', JSON.stringify(allLiveBets.slice(0, 40)));

    if (cloudDb) {
        cloudDb.ref(`rp_users/${curMob}`).update(users[curMob]);
        cloudDb.ref(`rp_live_bets/${activeBetRecord.id}`).set(activeBetRecord);
    }

    renderActiveRoundBets();
    renderMyBetsTable();
    if (typeof renderAdminLiveMonitor === 'function') renderAdminLiveMonitor();
    showFeedbackBanner(`Trade Confirmed: Total ₹${activeBetRecord.stake} on ${selectedBet.label}`);
}

function renderActiveRoundBets() {
    const activeBets = userBets.filter(b => b.periodId === currentPeriodId && b.status === 'PENDING');
    const container = document.getElementById('currentRoundBetsContainer');
    if (!activeBets.length) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');
    document.getElementById('activeBetsCount').textContent = activeBets.length;
    const total = activeBets.reduce((acc, b) => acc + b.stake, 0);
    document.getElementById('activeTotalStaked').textContent = `Total: ₹${total}`;
    document.getElementById('activeBetsList').innerHTML = activeBets.map(b => `
        <span class="mono" style="background:#1e293b; padding:3px 8px; border-radius:6px; font-size:11px;">${b.label} • ₹${b.stake}</span>
    `).join('');
}

function startRoundTimer() {
    setInterval(() => {
        const syncInfo = getServerSyncedPeriodAndTime();
        timeRemaining = syncInfo.secLeft;

        if (currentPeriodId && syncInfo.periodId !== currentPeriodId && lastSettledPeriodId !== currentPeriodId) {
            const finishedPeriod = currentPeriodId;
            currentPeriodId = syncInfo.periodId;
            periodCounter = syncInfo.slotIndex;
            executeRoundSettlement(finishedPeriod);
        } else {
            currentPeriodId = syncInfo.periodId;
            periodCounter = syncInfo.slotIndex;
            document.getElementById('currentPeriodId').textContent = `#${currentPeriodId}`;
        }
        updateTimerUI();
    }, 1000);
}

function updateTimerUI() {
    document.getElementById('secTens').textContent = Math.floor(timeRemaining / 10);
    document.getElementById('secOnes').textContent = timeRemaining % 10;
    document.getElementById('timerProgressBar').style.width = `${(timeRemaining / ROUND_DURATION) * 100}%`;

    const lockOverlay = document.getElementById('betLockOverlay');
    if (timeRemaining <= LOCK_SECONDS) {
        lockOverlay.classList.remove('hidden');
        document.getElementById('lockCountdownBig').textContent = `0${timeRemaining}`;
        if (shouldPlayTickSound()) playTone(950, 'square', 0.11, 0.75);
    } else {
        lockOverlay.classList.add('hidden');
    }
}

function executeRoundSettlement(completedPeriod) {
    lastSettledPeriodId = completedPeriod;

    let forcedVal = window.adminForcedNextNumber;
    const localForced = localStorage.getItem('rp_forced_next_num');
    if ((forcedVal === null || forcedVal === undefined || isNaN(forcedVal)) && localForced !== null && localForced !== '' && localForced !== 'null') {
        forcedVal = parseInt(localForced, 10);
    }

    const hasForced = (forcedVal !== null && forcedVal !== undefined && !isNaN(forcedVal) && forcedVal >= 0 && forcedVal <= 9);
    const winNum = hasForced
        ? parseInt(forcedVal, 10)
        : getDeterministicHardOutcomeForPeriod(completedPeriod);

    window.adminForcedNextNumber = null;
    localStorage.removeItem('rp_forced_next_num');
    if (cloudDb) {
        cloudDb.ref('rp_live/forcedNumber').set(-1);
    }

    const statusEl = document.getElementById('adminForceStatus');
    if (statusEl) statusEl.textContent = 'Auto Random';
    if (typeof highlightAdminForceBtn === 'function') highlightAdminForceBtn(null);

    const outcome = getOutcomeDetails(winNum);

    if (!gameHistory.some(h => h.periodId === completedPeriod)) {
        gameHistory.unshift({ periodId: completedPeriod, number: outcome.number, colors: outcome.colors, size: outcome.size });
        if (gameHistory.length > 50) gameHistory.pop();
    }

    let staked = 0, payout = 0, hadBets = false;
    userBets.forEach(bet => {
        if (bet.periodId === completedPeriod && bet.status === 'PENDING') {
            hadBets = true;
            staked += bet.stake;
            let won = false, mult = 0;

            if (bet.type === 'NUMBER' && parseInt(bet.value, 10) === outcome.number) {
                won = true;
                mult = 9.0;
            } else if (bet.type === 'COLOR') {
                if (bet.value === 'GREEN' && outcome.colors.includes('GREEN')) {
                    won = true;
                    mult = outcome.number === 5 ? 1.5 : 2.0;
                } else if (bet.value === 'RED' && outcome.colors.includes('RED')) {
                    won = true;
                    mult = outcome.number === 0 ? 1.5 : 2.0;
                } else if (bet.value === 'VIOLET' && outcome.colors.includes('VIOLET')) {
                    won = true;
                    mult = 4.5;
                }
            }

            if (won) {
                bet.status = 'WIN';
                bet.payout = bet.stake * mult;
                payout += bet.payout;
                walletBalance += bet.payout;
            } else {
                bet.status = 'LOSS';
            }
        }
    });

    const curMob = localStorage.getItem('rp_logged_user');
    if (curMob) {
        const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
        if (users[curMob]) {
            users[curMob].balance = walletBalance;
            users[curMob].lastBet = '';
            users[curMob].recentBets = userBets.slice(0, 15);
            localStorage.setItem('rp_users', JSON.stringify(users));
            if (cloudDb) cloudDb.ref(`rp_users/${curMob}`).update(users[curMob]);
        }
    }

    document.getElementById('currentPeriodId').textContent = `#${currentPeriodId}`;

    saveWalletBalance();
    renderActiveRoundBets();
    renderHistoryUI();
    renderMyBetsTable();
    renderFrequencyAnalytics();
    runAiPatternAnalysis();
    if (typeof renderAdminLiveMonitor === 'function') renderAdminLiveMonitor();

    if (hadBets) {
        payout > 0 ? playWinSound() : playLossSound();
    }
    showRoundResultToast(completedPeriod, outcome, hadBets, staked, payout);
}

function renderHistoryUI() {
    document.getElementById('recentMiniDots').innerHTML = gameHistory.slice(0, 8).map(r => `
        <span class="mini-ball ${getBallStyle(r.number)} mono">${r.number}</span>
    `).join('');

    document.getElementById('historyTableBody').innerHTML = gameHistory.slice(0, 20).map(r => {
        const dots = r.colors.map(c => `<span class="color-dot" style="background:${c === 'GREEN' ? '#10b981' : (c === 'RED' ? '#ef4444' : '#8b5cf6')};"></span>`).join('');
        return `
            <tr>
                <td>#${r.periodId}</td>
                <td class="txt-center"><span class="mini-ball ${getBallStyle(r.number)}">${r.number}</span></td>
                <td class="txt-center"><span class="size-pill ${r.size === 'BIG' ? 'size-big' : 'size-small'}">${r.size}</span></td>
                <td class="txt-right">${dots}</td>
            </tr>
        `;
    }).join('');
}

function renderMyBetsTable() {
    document.getElementById('myBetsTabCount').textContent = userBets.length;
    const emptyEl = document.getElementById('myBetsEmptyState');
    const tableEl = document.getElementById('myBetsTable');
    if (!userBets.length) {
        emptyEl.classList.remove('hidden');
        tableEl.classList.add('hidden');
        return;
    }
    emptyEl.classList.add('hidden');
    tableEl.classList.remove('hidden');
    document.getElementById('myBetsTableBody').innerHTML = userBets.slice(0, 25).map(b => {
        let res = `<span class="amber-txt">Running</span>`;
        if (b.status === 'WIN') res = `<span class="green-txt">+₹${b.payout.toFixed(1)}</span>`;
        else if (b.status === 'LOSS') res = `<span style="color:#f87171;">-₹${b.stake}</span>`;
        return `<tr><td>#${b.periodId.slice(-4)}</td><td>${b.label}</td><td>₹${b.stake}</td><td class="txt-right">${res}</td></tr>`;
    }).join('');
}

function renderFrequencyAnalytics() {
    const total = gameHistory.length || 1;
    let g = 0, r = 0, v = 0;
    const counts = Array(10).fill(0);
    gameHistory.forEach(item => {
        counts[item.number]++;
        if (item.colors.includes('GREEN')) g++;
        if (item.colors.includes('RED')) r++;
        if (item.colors.includes('VIOLET')) v++;
    });

    document.getElementById('colorFreqBars').innerHTML = [
        { name: 'Green', cnt: g, col: '#10b981' },
        { name: 'Red', cnt: r, col: '#ef4444' },
        { name: 'Violet', cnt: v, col: '#8b5cf6' }
    ].map(b => {
        const pct = Math.round((b.cnt / total) * 100);
        return `
            <div style="margin-bottom:8px;" class="mono">
                <div style="display:flex; justify-content:space-between; font-size:11px;">
                    <span style="color:${b.col};">${b.name}</span><span>${pct}% (${b.cnt})</span>
                </div>
                <div class="progress-track" style="height:5px; margin-top:3px;"><div style="height:100%; width:${pct}%; background:${b.col};"></div></div>
            </div>
        `;
    }).join('');

    document.getElementById('numberFreqGrid').innerHTML = counts.map((cnt, num) => `
        <div style="background:#090d16; border:1px solid #2d3748; border-radius:8px; padding:6px; text-align:center;" class="mono">
            <span class="mini-ball ${getBallStyle(num)}">${num}</span>
            <div style="font-size:11px; margin-top:3px;">${cnt}x</div>
        </div>
    `).join('');
}

function switchTab(tabName) {
    playClickSound();
    ['history', 'mybets', 'analytics'].forEach(t => {
        document.getElementById(`tabContent-${t}`).classList.toggle('hidden', t !== tabName);
        document.getElementById(`tabBtn-${t}`).classList.toggle('active-tab', t === tabName);
    });
}

let toastTimer = null;
function showRoundResultToast(periodId, outcome, hadBets, staked, payout) {
    const toast = document.getElementById('roundResultToast');
    const ball = document.getElementById('toastNumberBall');
    const title = document.getElementById('toastOutcomeTitle');
    const sub = document.getElementById('toastPnlSubtext');

    ball.className = `mini-ball mono toast-ball ${getBallStyle(outcome.number)}`;
    ball.textContent = outcome.number;
    document.getElementById('toastPeriodText').textContent = `Period #${periodId} • ${outcome.size}`;

    if (!hadBets) {
        title.textContent = `Winning Number: ${outcome.number}`;
        title.style.color = '#fff';
        sub.textContent = `Color: ${outcome.colors.join(' + ')}`;
    } else if (payout > 0) {
        title.textContent = `PROFIT WON +₹${payout.toFixed(2)}!`;
        title.style.color = '#34d399';
        sub.textContent = `Winning Number: ${outcome.number}`;
    } else {
        title.textContent = `Trade Loss (-₹${staked})`;
        title.style.color = '#f87171';
        sub.textContent = `Winning Number: ${outcome.number}`;
    }

    toast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(hideResultToast, 4000);
}

function hideResultToast() {
    document.getElementById('roundResultToast').classList.add('hidden');
}

let fbTimer = null;
function showFeedbackBanner(msg, isErr = false) {
    const el = document.getElementById('feedbackBanner');
    el.textContent = msg;
    el.style.background = isErr ? '#dc2626' : '#10b981';
    el.style.color = isErr ? '#fff' : '#000';
    el.classList.remove('hidden');
    if (fbTimer) clearTimeout(fbTimer);
    fbTimer = setTimeout(() => el.classList.add('hidden'), 4500);
}
