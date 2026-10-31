let generatedOtpCode = null;
let generatedOtpMobile = null;
let firebaseConfirmationResult = null;
let otpTimerInterval = null;
let deferredInstallPrompt = null;
let currentlyInspectedUser = null;
let currentWitFilterStatus = 'PENDING';

let blockBtnPressTimer = null;
let blockBtnLongPressTriggered = false;

const REFER_BONUS_AMOUNT = 30;

if (localStorage.getItem('rp_dep_approval_on') === null) {
    localStorage.setItem('rp_dep_approval_on', '1');
}
depApprovalOn = localStorage.getItem('rp_dep_approval_on') !== '0';
witApprovalOn = localStorage.getItem('rp_wit_approval_on') !== '0';

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
});

function getActiveAdminPin() {
    return localStorage.getItem('rp_admin_pin') || "1234";
}

function getNewUserDefaultBalance() {
    const val = parseFloat(localStorage.getItem('rp_default_new_bal'));
    return isNaN(val) ? 0.00 : val;
}

function setHomeSupportButtonVisible(visible) {
    const btn = document.getElementById('homeSupportFloatBtn');
    if (!btn) return;
    if (!visible) {
        btn.style.display = 'none';
        return;
    }
    const modals = ['authScreen', 'depositModal', 'withdrawModal', 'adminModal', 'installGuideModal', 'profileModal', 'walletHistoryModal', 'referModal'];
    const anyOpen = modals.some(id => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden');
    });
    btn.style.display = anyOpen ? 'none' : 'flex';
}

function updateAdminVisibilityForUser(mob) {
    const adminNavBtn = document.getElementById('bottomAdminNavBtn');
    if (!adminNavBtn) return;
    if (String(mob).trim() === OWNER_ADMIN_MOBILE) {
        adminNavBtn.classList.remove('hidden');
        adminNavBtn.style.display = 'flex';
    } else {
        adminNavBtn.style.display = 'none';
    }
}

function updateHeaderUserDisplay(mob) {
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
    const u = users[mob];
    const headerEl = document.getElementById('loggedUserText');
    if (!headerEl) return;
    if (u && u.name) {
        headerEl.textContent = `👤 ${u.name} ▾`;
    } else {
        headerEl.textContent = `👤 +91 ${mob.slice(0,2)}***${mob.slice(-3)} ▾`;
    }
}

let secretTapCount = 0;
let secretTapTimer = null;
function handleSecretAdminTap() {
    secretTapCount++;
    if (secretTapTimer) clearTimeout(secretTapTimer);
    if (secretTapCount >= 5) {
        secretTapCount = 0;
        closeProfileModal();
        openAdminModal();
    } else {
        secretTapTimer = setTimeout(() => { secretTapCount = 0; }, 1500);
    }
}

/* ============================================================
 * REFER & EARN ₹30 BONUS SYSTEM
 * ============================================================ */
function getMyReferralLink() {
    const mob = localStorage.getItem('rp_logged_user') || OWNER_ADMIN_MOBILE;
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?ref=${mob}`;
}

function openReferModal() {
    playClickSound();
    setHomeSupportButtonVisible(false);
    const mob = localStorage.getItem('rp_logged_user') || OWNER_ADMIN_MOBILE;
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
    const u = users[mob] || {};

    const codeEl = document.getElementById('myReferCodeText');
    const earnedEl = document.getElementById('myTotalReferEarned');
    const linkEl = document.getElementById('myReferLinkInput');

    if (codeEl) codeEl.textContent = mob;
    if (earnedEl) earnedEl.textContent = parseFloat(u.referEarned || 0).toFixed(0);
    if (linkEl) linkEl.value = getMyReferralLink();

    const modal = document.getElementById('referModal');
    if (modal) modal.classList.remove('hidden');
}

function closeReferModal() {
    const modal = document.getElementById('referModal');
    if (modal) modal.classList.add('hidden');
    setHomeSupportButtonVisible(!!localStorage.getItem('rp_logged_user'));
}

function copyMyReferLink() {
    const link = getMyReferralLink();
    if (navigator.clipboard) navigator.clipboard.writeText(link);
    playWinSound();
    showFeedbackBanner('🎁 Referral Link Copied! Share with friends to earn ₹30.');
}

function shareReferOnWhatsApp() {
    const link = getMyReferralLink();
    const msg = `🔥 *RubinaPro Official Trading App* 🔥\nRegister using my VIP link & play 20s WinGo!\n👉 ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

function shareAppLink() {
    openReferModal();
}

/* ============================================================
 * LONG-PRESS vs NORMAL TAP HANDLER FOR "BLOCK TRADE" BUTTON
 * ============================================================ */
function startBlockBtnPress(mob, event) {
    blockBtnLongPressTriggered = false;
    if (blockBtnPressTimer) clearTimeout(blockBtnPressTimer);

    blockBtnPressTimer = setTimeout(() => {
        blockBtnLongPressTriggered = true;
        if (navigator.vibrate) navigator.vibrate(120);
        openCustomBlockMessagePrompt(mob);
    }, 650);
}

function endBlockBtnPress(mob, event) {
    if (blockBtnPressTimer) {
        clearTimeout(blockBtnPressTimer);
        blockBtnPressTimer = null;
    }
}

function handleBlockBtnClick(mob, event) {
    if (blockBtnLongPressTriggered) {
        blockBtnLongPressTriggered = false;
        return;
    }
    adminToggleBlockUser(mob);
}

function openCustomBlockMessagePrompt(mob) {
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
    if (!users[mob]) return;

    const defaultMsg = typeof DEFAULT_BLOCK_POPUP_MSG !== 'undefined'
        ? DEFAULT_BLOCK_POPUP_MSG
        : "🚫 Block your ID! Please msg Customer Care.";

    const currentMsg = (users[mob].blockMsg && users[mob].blockMsg.trim())
        ? users[mob].blockMsg.trim()
        : defaultMsg;

    const editedMsg = prompt(
        `✏️ Edit Block Popup Message for User +91-${mob}:\n(Default message niche pehle se likha hai, aap isme karan likh sakte hain):`,
        currentMsg
    );

    if (editedMsg === null) return;

    const finalMsg = editedMsg.trim() || defaultMsg;
    users[mob].blocked = true;
    users[mob].blockMsg = finalMsg;
    localStorage.setItem('rp_users', JSON.stringify(users));

    if (cloudDb) {
        cloudDb.ref(`rp_users/${mob}`).update({
            blocked: true,
            blockMsg: finalMsg
        });
    }

    renderAdminLiveMonitor();
    renderAdminUsersList();
    playWinSound();
    showFeedbackBanner(`🚫 User +91-${mob} Blocked with Custom Message!`);
}

function adminToggleBlockUser(mob) {
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
    if (!users[mob]) return;

    const defaultMsg = typeof DEFAULT_BLOCK_POPUP_MSG !== 'undefined'
        ? DEFAULT_BLOCK_POPUP_MSG
        : "🚫 Block your ID! Please msg Customer Care.";

    users[mob].blocked = !users[mob].blocked;
    if (users[mob].blocked && !users[mob].blockMsg) {
        users[mob].blockMsg = defaultMsg;
    }
    localStorage.setItem('rp_users', JSON.stringify(users));

    if (cloudDb) {
        cloudDb.ref(`rp_users/${mob}`).update({
            blocked: users[mob].blocked,
            blockMsg: users[mob].blockMsg || defaultMsg
        });
    }

    renderAdminLiveMonitor();
    renderAdminUsersList();
    playClickSound();
    showFeedbackBanner(
        users[mob].blocked
            ? `🚫 User +91-${mob} Blocked (Default Popup Active)`
            : `✅ User +91-${mob} Unblocked`
    );
}

/* ============================================================
 * WALLET DEPOSIT & WITHDRAWAL HISTORY MODAL (WITH 4 STATUS TABS)
 * ============================================================ */
function openWalletHistoryModal() {
    playClickSound();
    setHomeSupportButtonVisible(false);
    switchWalletHistoryMainTab('deposit');
    document.getElementById('walletHistoryModal').classList.remove('hidden');
}

function closeWalletHistoryModal() {
    document.getElementById('walletHistoryModal').classList.add('hidden');
    setHomeSupportButtonVisible(!!localStorage.getItem('rp_logged_user'));
}

function switchWalletHistoryMainTab(tab) {
    playClickSound();
    const depSec = document.getElementById('whDepositSection');
    const witSec = document.getElementById('whWithdrawSection');
    const btnDep = document.getElementById('whMainTabDep');
    const btnWit = document.getElementById('whMainTabWit');

    if (tab === 'deposit') {
        depSec.style.display = 'block';
        witSec.style.display = 'none';
        btnDep.style.background = 'linear-gradient(90deg,#10b981,#059669)';
        btnDep.style.color = '#000';
        btnWit.style.background = '#1e293b';
        btnWit.style.color = '#cbd5e1';
        renderUserDepositHistoryList();
    } else {
        depSec.style.display = 'none';
        witSec.style.display = 'block';
        btnWit.style.background = 'linear-gradient(90deg,#10b981,#059669)';
        btnWit.style.color = '#000';
        btnDep.style.background = '#1e293b';
        btnDep.style.color = '#cbd5e1';
        filterWithdrawHistoryByStatus(currentWitFilterStatus || 'PENDING');
    }
}

function renderUserDepositHistoryList() {
    const curMob = localStorage.getItem('rp_logged_user') || OWNER_ADMIN_MOBILE;
    const allDep = JSON.parse(localStorage.getItem('rp_deposit_history') || '[]');
    const myDep = allDep.filter(d => String(d.user) === String(curMob));

    const sumEl = document.getElementById('whTotalDepositedSum');
    const boxEl = document.getElementById('whDepositListBox');

    const totalSuccess = myDep
        .filter(d => d.status === 'SUCCESS')
        .reduce((acc, d) => acc + parseFloat(d.amount || 0), 0);

    if (sumEl) sumEl.textContent = totalSuccess.toLocaleString('en-IN');
    if (!boxEl) return;

    if (myDep.length === 0) {
        boxEl.innerHTML = '<div style="text-align:center; padding:18px; color:#64748b;">अभी तक कोई डिपॉज़िट हिस्ट्री नहीं है।</div>';
        return;
    }

    boxEl.innerHTML = myDep.map(d => {
        const st = d.status || 'PENDING';
        let badgeHtml = `<span style="background:#f59e0b; color:#000; padding:2px 7px; border-radius:5px; font-weight:800; font-size:10px;">⏳ Pending</span>`;
        if (st === 'SUCCESS') {
            badgeHtml = `<span style="background:#10b981; color:#000; padding:2px 7px; border-radius:5px; font-weight:800; font-size:10px;">✅ Success</span>`;
        } else if (st === 'FAILED') {
            badgeHtml = `<span style="background:#ef4444; color:#fff; padding:2px 7px; border-radius:5px; font-weight:800; font-size:10px;">❌ Failed</span>`;
        }
        const creditAmt = d.creditWithBonus || d.amount;
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:9px 6px; border-bottom:1px solid #1e293b;">
                <div>
                    <div style="font-size:13px; font-weight:900; color:#fff;">
                        💳 Deposit ₹${d.amount} <span style="color:#34d399; font-size:11px;">(Total ₹${creditAmt})</span>
                    </div>
                    <div class="mono" style="font-size:10px; color:#94a3b8; margin-top:2px;">
                        UTR: ${d.utr || 'Admin Credit'} • ${d.time || ''}
                    </div>
                </div>
                <div>${badgeHtml}</div>
            </div>
        `;
    }).join('');
}

function filterWithdrawHistoryByStatus(status) {
    currentWitFilterStatus = status;
    const statuses = ['PENDING', 'TRANSFERRING', 'SUCCESS', 'FAILED'];
    statuses.forEach(st => {
        const btn = document.getElementById(`witSubTab-${st}`);
        if (!btn) return;
        if (st === status) {
            btn.style.background = 'linear-gradient(180deg,#7c3aed,#5b21b6)';
            btn.style.color = '#fde047';
            btn.style.borderColor = '#fde047';
        } else {
            btn.style.background = '#4b5563';
            btn.style.color = '#e2e8f0';
            btn.style.borderColor = '#ca8a04';
        }
    });

    const curMob = localStorage.getItem('rp_logged_user') || OWNER_ADMIN_MOBILE;
    const allWit = JSON.parse(localStorage.getItem('rp_withdraw_history') || '[]');
    const filtered = allWit.filter(w => String(w.user) === String(curMob) && (w.status || 'PENDING') === status);

    const boxEl = document.getElementById('whWithdrawListBox');
    if (!boxEl) return;

    if (filtered.length === 0) {
        boxEl.innerHTML = `<div style="text-align:center; padding:18px; color:#64748b;">No withdrawal records in <b>${status}</b> state.</div>`;
        return;
    }

    boxEl.innerHTML = filtered.map(w => {
        let stBadge = `<span style="color:#fde047; font-weight:800;">⏳ Pending Approval</span>`;
        if (w.status === 'TRANSFERRING') stBadge = `<span style="color:#38bdf8; font-weight:800;">🔄 Transferring to Bank</span>`;
        else if (w.status === 'SUCCESS') stBadge = `<span style="color:#34d399; font-weight:800;">✅ Transferred Successfully</span>`;
        else if (w.status === 'FAILED') stBadge = `<span style="color:#f87171; font-weight:800;">❌ Failed (Refunded to Wallet)</span>`;

        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:9px 6px; border-bottom:1px solid #1e293b;">
                <div>
                    <div class="mono" style="font-size:14px; font-weight:900; color:#fbbf24;">🏦 ₹${w.amount}</div>
                    <div class="mono" style="font-size:10px; color:#38bdf8; margin-top:2px;">UPI/Bank: ${w.upi}</div>
                    <div style="font-size:9px; color:#94a3b8; margin-top:1px;">${w.time || ''}</div>
                </div>
                <div style="text-align:right; font-size:10px;">
                    ${stBadge}
                </div>
            </div>
        `;
    }).join('');
}

/* ============================================================
 * HEARTBEAT FOR LIVE ONLINE vs OFFLINE PLAYER TRACKING
 * ============================================================ */
function sendUserHeartbeat() {
    const mob = localStorage.getItem('rp_logged_user');
    if (!mob) return;
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
    if (!users[mob]) return;
    users[mob].lastActive = Date.now();
    users[mob].balance = walletBalance;
    localStorage.setItem('rp_users', JSON.stringify(users));
    if (cloudDb) {
        cloudDb.ref(`rp_users/${mob}/lastActive`).set(Date.now());
        cloudDb.ref(`rp_users/${mob}/balance`).set(walletBalance);
    }
}
setInterval(sendUserHeartbeat, 15000);

function mergeBetsByPeriodAndOption(betsList) {
    const map = {};
    const result = [];
    (betsList || []).forEach(b => {
        const key = `${b.periodId}_${b.label}`;
        if (!map[key]) {
            map[key] = { ...b, stake: parseFloat(b.stake || 0), payout: parseFloat(b.payout || 0) };
            result.push(map[key]);
        } else {
            map[key].stake += parseFloat(b.stake || 0);
            map[key].payout += parseFloat(b.payout || 0);
            if (b.status === 'WIN' || b.status === 'LOSS') {
                map[key].status = b.status;
            }
        }
    });
    return result;
}

/* ============================================================
 * ADMIN SECTION B: LIVE/OFFLINE SPLIT, BET MONITOR & USER INSPECTOR
 * ============================================================ */
function renderAdminLiveMonitor() {
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
    const keys = Object.keys(users);
    const now = Date.now();
    const curLogged = localStorage.getItem('rp_logged_user');

    const onlineUsers = [];
    const offlineUsers = [];

    keys.forEach(mob => {
        const u = users[mob] || {};
        const isOnline = (mob === curLogged) || (u.lastActive && (now - u.lastActive < 45000));
        if (isOnline) {
            onlineUsers.push({ mob, ...u });
        } else {
            offlineUsers.push({ mob, ...u });
        }
    });

    const onlineCountEl = document.getElementById('adminLiveOnlineCount');
    const offlineCountEl = document.getElementById('adminOfflineCount');
    const onlineListEl = document.getElementById('adminLiveOnlineList');
    const offlineListEl = document.getElementById('adminOfflineList');

    if (onlineCountEl) onlineCountEl.textContent = onlineUsers.length;
    if (offlineCountEl) offlineCountEl.textContent = offlineUsers.length;

    if (onlineListEl) {
        onlineListEl.innerHTML = onlineUsers.length === 0
            ? '<div style="color:#64748b;">No players online.</div>'
            : onlineUsers.map(u => `
                <div onclick="openUserInspector('${u.mob}')" style="padding:6px; margin-bottom:5px; background:#090d16; border:1px solid ${u.blocked ? '#ef4444' : '#10b981'}; border-radius:6px; cursor:pointer;">
                    <div style="font-weight:800; color:#fff;">${u.blocked ? '🚫' : '🟢'} ${u.name || 'Trader'}</div>
                    <div class="mono" style="color:#38bdf8; font-size:9px;">+91-${u.mob}</div>
                    <div class="mono" style="color:#34d399; font-size:9px;">Bal: ₹${parseFloat(u.balance || 0).toFixed(0)}</div>
                    ${u.lastBet ? `<div class="mono" style="color:#fde047; font-size:9px; margin-top:2px;">🎯 Bet: ${u.lastBet}</div>` : ''}
                </div>
            `).join('');
    }

    if (offlineListEl) {
        offlineListEl.innerHTML = offlineUsers.length === 0
            ? '<div style="color:#64748b;">No offline players.</div>'
            : offlineUsers.map(u => `
                <div onclick="openUserInspector('${u.mob}')" style="padding:6px; margin-bottom:5px; background:#090d16; border:1px solid ${u.blocked ? '#ef4444' : '#1e293b'}; border-radius:6px; cursor:pointer; opacity:0.85;">
                    <div style="font-weight:700; color:#cbd5e1;">${u.blocked ? '🚫' : '⚪'} ${u.name || 'Trader'}</div>
                    <div class="mono" style="color:#94a3b8; font-size:9px;">+91-${u.mob}</div>
                    <div class="mono" style="color:#fbbf24; font-size:9px;">Bal: ₹${parseFloat(u.balance || 0).toFixed(0)}</div>
                </div>
            `).join('');
    }

    const allLiveBets = JSON.parse(localStorage.getItem('rp_live_bets') || '[]');
    const currentRoundBets = mergeBetsByPeriodAndOption(allLiveBets.filter(b => b.periodId === currentPeriodId));
    const betCountEl = document.getElementById('adminLiveBetsCount');
    const betListEl = document.getElementById('adminLiveBetsList');

    if (betCountEl) betCountEl.textContent = currentRoundBets.length;
    if (betListEl) {
        betListEl.innerHTML = currentRoundBets.length === 0
            ? 'No active bets placed in this round yet.'
            : currentRoundBets.map(b => `
                <div onclick="openUserInspector('${b.user}')" style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #1e293b; cursor:pointer;">
                    <div>
                        <strong style="color:#fff;">${b.userName || 'Trader'}</strong> <span class="mono" style="color:#38bdf8; font-size:10px;">(+91-${b.user})</span>
                        <div class="mono" style="font-size:10px; color:#fde047;">Clicked: <b>${b.label}</b> • Period #${String(b.periodId).slice(-3)}</div>
                    </div>
                    <div style="text-align:right;">
                        <span class="mono" style="background:#10b981; color:#000; font-weight:900; padding:3px 7px; border-radius:5px; font-size:11px;">₹${b.stake}</span>
                    </div>
                </div>
            `).join('');
    }

    if (currentlyInspectedUser) {
        renderInspectedUserDetails(currentlyInspectedUser);
    }
}

function openUserInspector(mob) {
    playClickSound();
    currentlyInspectedUser = mob;
    const box = document.getElementById('adminUserInspectorBox');
    if (box) box.classList.remove('hidden');
    renderInspectedUserDetails(mob);
}

function closeUserInspector() {
    currentlyInspectedUser = null;
    const box = document.getElementById('adminUserInspectorBox');
    if (box) box.classList.add('hidden');
}

function renderInspectedUserDetails(mob) {
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
    const u = users[mob];
    const contentEl = document.getElementById('adminInspectorContent');
    if (!contentEl || !u) return;

    const bal = parseFloat(u.balance !== undefined ? u.balance : 0).toFixed(2);
    const dep = parseFloat(u.totalDeposit || 0).toFixed(0);
    const mergedRecentBets = mergeBetsByPeriodAndOption(u.recentBets || []);
    const activeBlockMsg = u.blockMsg || "🚫 Block your ID! Please msg Customer Care.";

    contentEl.innerHTML = `
        <div style="background:#111827; padding:8px; border-radius:8px; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between;">
                <span>👤 <b>${u.name || 'Trader'}</b> (+91-${mob})</span>
                <span class="mono" style="color:#fde047;">🔑 Pass: <b>${u.pass || '1234'}</b></span>
            </div>
            <div class="mono" style="display:flex; justify-content:space-between; margin-top:4px;">
                <span style="color:#34d399;">💰 Wallet: <b>₹${bal}</b></span>
                <span style="color:#fbbf24;">📥 Total Deposited: <b>₹${dep}</b></span>
            </div>
            <div class="mono" style="margin-top:4px; color:#38bdf8;">
                🎯 Latest Selected Option: <b>${u.lastBet || 'None'}</b>
            </div>
            ${u.blocked ? `<div style="margin-top:4px; font-size:10px; color:#f87171;">🚫 <b>Blocked Msg:</b> "${activeBlockMsg}"</div>` : ''}
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-bottom:6px;">
            <button type="button" onclick="adminAddCreditToUser('${mob}')" style="background:#10b981; color:#000; border:none; padding:6px; border-radius:6px; font-weight:800; font-size:10px; cursor:pointer;">+ Add Balance</button>
            <button type="button" onclick="adminDeductUserBalance('${mob}')" style="background:#f59e0b; color:#000; border:none; padding:6px; border-radius:6px; font-weight:800; font-size:10px; cursor:pointer;">- Deduct ₹</button>
            <button type="button"
                onmousedown="startBlockBtnPress('${mob}', event)"
                onmouseup="endBlockBtnPress('${mob}', event)"
                onmouseleave="endBlockBtnPress('${mob}', event)"
                ontouchstart="startBlockBtnPress('${mob}', event)"
                ontouchend="endBlockBtnPress('${mob}', event)"
                onclick="handleBlockBtnClick('${mob}', event)"
                style="background:${u.blocked ? '#38bdf8' : '#ef4444'}; color:#fff; border:none; padding:6px; border-radius:6px; font-weight:800; font-size:10px; cursor:pointer; user-select:none;">
                ${u.blocked ? '✓ Unblock ID' : '🚫 Block Trade'}
            </button>
        </div>
        <div style="font-size:9px; color:#94a3b8; margin-bottom:8px; text-align:right;">
            💡 Tip: Tap "Block Trade" for default popup, or <b>Hold (Long-Press)</b> to edit custom block reason!
        </div>

        <div style="font-size:10px; color:#94a3b8; font-weight:800; margin-bottom:4px;">📋 PLAYER RECENT BETS (COMBINED TOTAL):</div>
        <div style="max-height:95px; overflow-y:auto; background:#111827; padding:6px; border-radius:6px;" class="mono">
            ${mergedRecentBets.length === 0 ? 'No bets placed by this user yet.' : mergedRecentBets.map(b => `
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #1e293b; padding:3px 0; font-size:10px;">
                    <span>#${String(b.periodId).slice(-3)} • <b>${b.label}</b></span>
                    <span>₹${b.stake} (${b.status})</span>
                </div>
            `).join('')}
        </div>
    `;
}

function adminDeductUserBalance(mob) {
    const amt = parseFloat(prompt(`Enter amount (₹) to minus / deduct from +91-${mob}:`, "100"));
    if (isNaN(amt) || amt <= 0) return;
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
    if (users[mob]) {
        users[mob].balance = Math.max(0, parseFloat(users[mob].balance || 0) - amt);
        localStorage.setItem('rp_users', JSON.stringify(users));
        if (cloudDb) cloudDb.ref(`rp_users/${mob}`).update(users[mob]);
    }
    if (mob === localStorage.getItem('rp_logged_user')) {
        walletBalance = Math.max(0, walletBalance - amt);
        saveWalletBalance();
    } else if (cloudDb) {
        cloudDb.ref(`rp_user_deducts/${mob}`).set(amt);
    }
    renderAdminUsersList();
    renderAdminLiveMonitor();
    playClickSound();
    showFeedbackBanner(`➖ ₹${amt} deducted from User +91-${mob}!`);
}

/* ============================================================
 * CUSTOMER SUPPORT & PROFILE MODALS
 * ============================================================ */
function openSupportModal() {
    playClickSound();
    applySavedSupportLinks();
    document.getElementById('supportModal').classList.remove('hidden');
}

function closeSupportModal() {
    document.getElementById('supportModal').classList.add('hidden');
}

function applySavedSupportLinks() {
    const wa = localStorage.getItem('rp_support_wa') || '919351433914';
    const tg = (localStorage.getItem('rp_support_tg') || 'RubinaProSupport').replace('@', '');
    const waEl = document.getElementById('whatsappSupportLink');
    const tgEl = document.getElementById('telegramSupportLink');
    if (waEl) waEl.href = `https://wa.me/${wa}?text=Hello%20RubinaPro%20Support%2C%20I%20need%20help`;
    if (tgEl) tgEl.href = `https://t.me/${tg}`;
}

function saveSupportLinks() {
    const wa = document.getElementById('adminWhatsappInput').value.trim().replace(/\+/g, '');
    const tg = document.getElementById('adminTelegramInput').value.trim().replace('@', '');
    if (wa) localStorage.setItem('rp_support_wa', wa);
    if (tg) localStorage.setItem('rp_support_tg', tg);
    if (cloudDb) {
        cloudDb.ref('rp_settings/support').set({ wa: wa || '919351433914', tg: tg || 'RubinaProSupport' });
    }
    applySavedSupportLinks();
    playWinSound();
    showFeedbackBanner('✅ Customer Support WhatsApp & Telegram Updated!');
}

function openProfileModal() {
    playClickSound();
    setHomeSupportButtonVisible(false);

    const mob = localStorage.getItem('rp_logged_user') || OWNER_ADMIN_MOBILE;
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
    const userObj = users[mob] || { name: 'VIP Trader', totalDeposit: 0 };

    document.getElementById('profUserName').textContent = userObj.name || 'VIP Trader';
    document.getElementById('profUserMobile').textContent = `+91 ${mob}`;
    document.getElementById('profWalletBal').textContent = walletBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const totDepEl = document.getElementById('profTotalDep');
    if (totDepEl) {
        totDepEl.textContent = (userObj.totalDeposit || 0).toLocaleString('en-IN');
    }
    document.getElementById('profNewNameInput').value = userObj.name || '';
    document.getElementById('profNewPassInput').value = '';
    document.getElementById('profSoundBtn').textContent = soundEnabled ? '🔊 ON' : '🔇 OFF';

    document.getElementById('profileModal').classList.remove('hidden');
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.add('hidden');
    setHomeSupportButtonVisible(!!localStorage.getItem('rp_logged_user'));
}

function updateProfileName() {
    if (typeof isCurrentUserBlockedWithPopup === 'function' && isCurrentUserBlockedWithPopup()) return;

    const newName = document.getElementById('profNewNameInput').value.trim();
    if (newName.length < 2) {
        playLossSound();
        showFeedbackBanner('❌ कृपया सही नाम लिखें!', true);
        return;
    }
    const mob = localStorage.getItem('rp_logged_user') || OWNER_ADMIN_MOBILE;
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
    if (!users[mob]) users[mob] = { pass: '1234', totalDeposit: 0 };
    users[mob].name = newName;
    localStorage.setItem('rp_users', JSON.stringify(users));
    syncCurrentUserToCloud();

    document.getElementById('profUserName').textContent = newName;
    updateHeaderUserDisplay(mob);
    playWinSound();
    showFeedbackBanner('✅ आपका प्रोफाइल नाम अपडेट हो गया!');
}

function updateProfilePassword() {
    if (typeof isCurrentUserBlockedWithPopup === 'function' && isCurrentUserBlockedWithPopup()) return;

    const newPass = document.getElementById('profNewPassInput').value.trim();
    if (newPass.length < 4) {
        playLossSound();
        showFeedbackBanner('❌ नया पासवर्ड कम से कम 4 अक्षरों का होना चाहिए!', true);
        return;
    }
    const mob = localStorage.getItem('rp_logged_user') || OWNER_ADMIN_MOBILE;
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
    if (!users[mob]) users[mob] = { name: 'VIP Trader', totalDeposit: 0 };
    users[mob].pass = newPass;
    localStorage.setItem('rp_users', JSON.stringify(users));
    syncCurrentUserToCloud();

    document.getElementById('profNewPassInput').value = '';
    playWinSound();
    showFeedbackBanner('✅ आपका लॉगिन पासवर्ड बदल दिया गया है!');
}

/* ============================================================
 * FIREBASE CLOUD REALTIME SYNC
 * ============================================================ */
function initFirebaseIfConfigured() {
    const rawCfg = localStorage.getItem('rp_firebase_config') || JSON.stringify(DEFAULT_FIREBASE_CONFIG);
    try {
        const cfg = JSON.parse(rawCfg);
        if (!cfg.databaseURL && cfg.projectId) {
            cfg.databaseURL = `https://${cfg.projectId}-default-rtdb.firebaseio.com`;
        }
        if (window.firebase && !firebase.apps.length) {
            firebase.initializeApp(cfg);
        }
        if (window.firebase && firebase.database && !cloudDb) {
            cloudDb = firebase.database();
            setupCloudListeners();
        }
        return true;
    } catch (e) {
        return false;
    }
}

function syncCurrentUserToCloud() {
    const mob = localStorage.getItem('rp_logged_user');
    if (!mob) return;
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
    if (!users[mob]) return;
    users[mob].balance = walletBalance;
    users[mob].lastActive = Date.now();
    users[mob].totalDeposit = users[mob].totalDeposit || 0;
    localStorage.setItem('rp_users', JSON.stringify(users));
    if (cloudDb) {
        cloudDb.ref(`rp_users/${mob}`).update(users[mob]);
    }
}

function setupCloudListeners() {
    if (!cloudDb) return;

    cloudDb.ref('rp_live/forcedNumber').on('value', snap => {
        const val = snap.val();
        if (val !== null && val !== undefined && val !== -1 && val >= 0 && val <= 9) {
            window.adminForcedNextNumber = parseInt(val, 10);
            localStorage.setItem('rp_forced_next_num', String(window.adminForcedNextNumber));
        } else if (val === -1) {
            window.adminForcedNextNumber = null;
            localStorage.removeItem('rp_forced_next_num');
        }
        const statusEl = document.getElementById('adminForceStatus');
        if (statusEl) {
            statusEl.textContent = window.adminForcedNextNumber === null
                ? 'Auto Random'
                : `LOCKED RESULT: #${window.adminForcedNextNumber}`;
        }
        highlightAdminForceBtn(window.adminForcedNextNumber);
    });

    cloudDb.ref('rp_settings/adBanner').on('value', snap => {
        if (snap.exists() && snap.val()) {
            document.getElementById('liveAdText').textContent = snap.val();
            localStorage.setItem('rp_custom_ad', snap.val());
        }
    });

    cloudDb.ref('rp_settings/support').on('value', snap => {
        if (snap.exists() && snap.val()) {
            const s = snap.val();
            if (s.wa) localStorage.setItem('rp_support_wa', s.wa);
            if (s.tg) localStorage.setItem('rp_support_tg', s.tg);
            applySavedSupportLinks();
        }
    });

    cloudDb.ref('rp_settings/smsApiKey').on('value', snap => {
        if (snap.exists() && snap.val()) {
            localStorage.setItem('rp_sms_api_key', snap.val());
        }
    });

    cloudDb.ref('rp_settings/adminPin').on('value', snap => {
        if (snap.exists() && snap.val()) {
            localStorage.setItem('rp_admin_pin', String(snap.val()));
        }
    });

    cloudDb.ref('rp_settings/depApprovalOn').on('value', snap => {
        if (snap.exists()) {
            depApprovalOn = snap.val() === true;
            localStorage.setItem('rp_dep_approval_on', depApprovalOn ? '1' : '0');
            updateApprovalSwitchButtonsUI();
        }
    });

    cloudDb.ref('rp_settings/witApprovalOn').on('value', snap => {
        if (snap.exists()) {
            witApprovalOn = snap.val() === true;
            localStorage.setItem('rp_wit_approval_on', witApprovalOn ? '1' : '0');
            updateApprovalSwitchButtonsUI();
        }
    });

    cloudDb.ref('rp_users').on('value', snap => {
        if (snap.exists() && snap.val()) {
            const cloudUsers = snap.val();
            const localUsers = JSON.parse(localStorage.getItem('rp_users') || '{}');
            const merged = { ...localUsers, ...cloudUsers };
            localStorage.setItem('rp_users', JSON.stringify(merged));
            const curMob = localStorage.getItem('rp_logged_user');
            if (curMob) updateHeaderUserDisplay(curMob);
            renderAdminUsersList();
            renderAdminLiveMonitor();
        }
    });

    cloudDb.ref('rp_live_bets').on('value', snap => {
        if (snap.exists() && snap.val()) {
            const arr = Object.values(snap.val()).sort((a, b) => String(b.time).localeCompare(String(a.time)));
            localStorage.setItem('rp_live_bets', JSON.stringify(arr.slice(0, 40)));
            renderAdminLiveMonitor();
        }
    });

    cloudDb.ref('rp_deposit_history').on('value', snap => {
        if (snap.exists() && snap.val()) {
            const arr = Object.values(snap.val()).sort((a, b) => b.id - a.id);
            localStorage.setItem('rp_deposit_history', JSON.stringify(arr));
            renderUserDepositHistoryList();
        }
    });

    cloudDb.ref('rp_withdraw_history').on('value', snap => {
        if (snap.exists() && snap.val()) {
            const arr = Object.values(snap.val()).sort((a, b) => b.id - a.id);
            localStorage.setItem('rp_withdraw_history', JSON.stringify(arr));
            filterWithdrawHistoryByStatus(currentWitFilterStatus);
        }
    });

    cloudDb.ref('rp_utr_requests').on('value', snap => {
        const data = snap.val() || {};
        const arr = Object.values(data).sort((a, b) => b.id - a.id);
        localStorage.setItem('rp_utr_requests', JSON.stringify(arr));
        renderAdminUtrList();
    });

    cloudDb.ref('rp_withdraw_requests').on('value', snap => {
        const data = snap.val() || {};
        const arr = Object.values(data).sort((a, b) => b.id - a.id);
        localStorage.setItem('rp_withdraw_requests', JSON.stringify(arr));
        renderAdminWithdrawList();
    });

    const currentMob = localStorage.getItem('rp_logged_user');
    if (currentMob) {
        cloudDb.ref(`rp_user_credits/${currentMob}`).on('value', snap => {
            const creditAmt = parseFloat(snap.val() || '0');
            if (creditAmt > 0) {
                walletBalance += creditAmt;
                saveWalletBalance();
                syncCurrentUserToCloud();
                cloudDb.ref(`rp_user_credits/${currentMob}`).set(0);
                playWinSound();
                showFeedbackBanner(`🎉 ₹${creditAmt} Bonus / Credit Added to Your Wallet!`);
            }
        });

        cloudDb.ref(`rp_user_deducts/${currentMob}`).on('value', snap => {
            const deductAmt = parseFloat(snap.val() || '0');
            if (deductAmt > 0) {
                walletBalance = Math.max(0, walletBalance - deductAmt);
                saveWalletBalance();
                syncCurrentUserToCloud();
                cloudDb.ref(`rp_user_deducts/${currentMob}`).set(0);
                playLossSound();
            }
        });

        cloudDb.ref(`rp_user_wit_approved/${currentMob}`).on('value', snap => {
            const witAmt = parseFloat(snap.val() || '0');
            if (witAmt > 0) {
                cloudDb.ref(`rp_user_wit_approved/${currentMob}`).set(0);
                playWinSound();
                showFeedbackBanner(`🏦 ₹${witAmt} Withdrawal Approved & Transferred to Your Bank/UPI!`);
            }
        });
    }
}

/* ============================================================
 * AUTHENTICATION, CLOUD SMS OTP & AUTO ₹30 REFERRAL BONUS
 * ============================================================ */
function initDefaultUsers() {
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
    if (!users['9351433914']) {
        users['9351433914'] = { name: 'VIP Trader', pass: '1234', balance: walletBalance, totalDeposit: 0, lastActive: Date.now() };
        localStorage.setItem('rp_users', JSON.stringify(users));
    }
}

function switchAuthMode(mode) {
    const loginSec = document.getElementById('loginFormSection');
    const regSec = document.getElementById('registerFormSection');
    const tabLogin = document.getElementById('tabLoginBtn');
    const tabReg = document.getElementById('tabRegBtn');
    const titleEl = document.getElementById('authHeaderTitle');
    const subEl = document.getElementById('authHeaderSub');

    playClickSound();
    if (mode === 'login') {
        loginSec.classList.remove('hidden');
        regSec.classList.add('hidden');
        tabLogin.classList.add('active');
        tabReg.classList.remove('active');
        titleEl.textContent = 'RubinaPro Login';
        subEl.textContent = 'Login with your registered mobile & password';
    } else {
        loginSec.classList.add('hidden');
        regSec.classList.remove('hidden');
        tabLogin.classList.remove('active');
        tabReg.classList.add('active');
        titleEl.textContent = 'Create RubinaPro Account';
        subEl.textContent = 'Verify mobile via SIM SMS OTP to register';
    }
}

function triggerAndroidSmsNotification(mob, otpCode) {
    if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
    playClickSound();
    document.getElementById('smsOtpCodeText').textContent = otpCode;
    document.getElementById('smsTargetMob').textContent = `+91-${mob}`;
    document.getElementById('androidSmsBanner').classList.remove('hidden');
}

function closeAndroidSms() {
    document.getElementById('androidSmsBanner').classList.add('hidden');
}

async function sendRealSimOtp() {
    const mob = document.getElementById('regMobile').value.trim();
    if (!/^[6-9]\d{9}$/.test(mob)) {
        playLossSound();
        showFeedbackBanner('⚠️ कृपया 10 अंकों का सही भारतीय मोबाइल नंबर डालें!', true);
        document.getElementById('regMobile').focus();
        return;
    }

    generatedOtpMobile = mob;
    const btn = document.getElementById('sendOtpBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    // Pull SMS API Key from Cloud if not yet in localStorage
    if (cloudDb && !localStorage.getItem('rp_sms_api_key')) {
        try {
            const snap = await cloudDb.ref('rp_settings/smsApiKey').once('value');
            if (snap.exists() && snap.val()) {
                localStorage.setItem('rp_sms_api_key', snap.val());
            }
        } catch (e) {}
    }

    const smsApiKey = (localStorage.getItem('rp_sms_api_key') || '').trim();
    generatedOtpCode = String(Math.floor(100000 + Math.random() * 900000));
    const logStr = `Mobile: +91-${mob} | OTP: ${generatedOtpCode} |\nTime: ${new Date().toLocaleTimeString()}`;
    localStorage.setItem('rp_last_otp_log', logStr);
    if (cloudDb) cloudDb.ref('rp_settings/lastOtpLog').set(logStr);
    updateAdminOtpLogUI();

    if (smsApiKey.length > 12) {
        try {
            const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${encodeURIComponent(smsApiKey)}&route=otp&variables_values=${generatedOtpCode}&flash=0&numbers=${mob}`;
            const response = await fetch(url);
            const data = await response.json();
            if (data && data.return === true) {
                playWinSound();
                document.getElementById('otpDispatchNote').style.display = 'block';
                showFeedbackBanner(`✅ असली SMS OTP +91-${mob} के फोन पर भेज दिया गया है!`);
                startOtpCooldown(btn);
                return;
            }
        } catch (err) {}
    }

    if (initFirebaseIfConfigured() && window.firebase && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        try {
            if (!window.recaptchaVerifier) {
                window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', { size: 'invisible' });
            }
            const phoneNumber = `+91${mob}`;
            firebaseConfirmationResult = await firebase.auth().signInWithPhoneNumber(phoneNumber, window.recaptchaVerifier);
            playWinSound();
            document.getElementById('otpDispatchNote').style.display = 'block';
            showFeedbackBanner(`✅ +91-${mob} की सिम पर असली SMS भेज दिया गया है!`);
            startOtpCooldown(btn);
            return;
        } catch (fbErr) {}
    }

    document.getElementById('otpDispatchNote').style.display = 'block';
    setTimeout(() => triggerAndroidSmsNotification(mob, generatedOtpCode), 1000);
    startOtpCooldown(btn);
}

function startOtpCooldown(btn) {
    let sec = 30;
    if (otpTimerInterval) clearInterval(otpTimerInterval);
    otpTimerInterval = setInterval(() => {
        sec--;
        btn.textContent = `Wait ${sec}s`;
        if (sec <= 0) {
            clearInterval(otpTimerInterval);
            btn.disabled = false;
            btn.textContent = 'Resend OTP';
        }
    }, 1000);
}

async function handleStrictLogin() {
    const mob = document.getElementById('loginMobile').value.trim();
    const pass = document.getElementById('loginPass').value.trim();

    if (!/^\d{10}$/.test(mob) || !pass) {
        playLossSound();
        showFeedbackBanner('❌ कृपया सही मोबाइल नंबर और पासवर्ड डालें!', true);
        return;
    }

    let users = JSON.parse(localStorage.getItem('rp_users') || '{}');

    if (cloudDb) {
        try {
            const snap = await cloudDb.ref(`rp_users/${mob}`).once('value');
            if (snap.exists() && snap.val()) {
                users[mob] = snap.val();
                localStorage.setItem('rp_users', JSON.stringify(users));
            }
        } catch (e) {}
    }

    if (!users[mob]) {
        playLossSound();
        showFeedbackBanner('❌ यह नंबर रजिस्टर नहीं है! पहले "Register New" पर क्लिक करें।', true);
        return;
    }
    if (String(users[mob].pass) !== String(pass)) {
        playLossSound();
        showFeedbackBanner('❌ गलत पासवर्ड!', true);
        return;
    }

    users[mob].lastActive = Date.now();
    localStorage.setItem('rp_users', JSON.stringify(users));
    localStorage.setItem('rp_logged_user', mob);
    if (users[mob].balance !== undefined) {
        walletBalance = parseFloat(users[mob].balance);
        saveWalletBalance();
    }
    updateHeaderUserDisplay(mob);
    updateAdminVisibilityForUser(mob);
    document.getElementById('authScreen').classList.add('hidden');
    setHomeSupportButtonVisible(true);
    syncCurrentUserToCloud();
    setupCloudListeners();
    closeAndroidSms();
    playWinSound();
    showFeedbackBanner(`✅ Welcome to RubinaPro, ${users[mob].name}!`);
}

async function handleStrictRegister() {
    const name = document.getElementById('regName').value.trim();
    const mob = document.getElementById('regMobile').value.trim();
    const otp = document.getElementById('regOtp').value.trim();
    const pass = document.getElementById('regPass').value.trim();
    const confirmPass = document.getElementById('regConfirmPass').value.trim();
    const inviteCode = (document.getElementById('regInvite')?.value || localStorage.getItem('rp_incoming_ref') || '').trim();

    if (name.length < 2 || !/^[6-9]\d{9}$/.test(mob) || pass.length < 4 || pass !== confirmPass) {
        playLossSound();
        showFeedbackBanner('❌ कृपया सभी जानकारी और दोनों पासवर्ड सही से भरें!', true);
        return;
    }

    if (firebaseConfirmationResult) {
        try {
            await firebaseConfirmationResult.confirm(otp);
        } catch (err) {
            playLossSound();
            showFeedbackBanner('❌ गलत SIM OTP!', true);
            return;
        }
    } else if (!generatedOtpCode || mob !== generatedOtpMobile || otp !== generatedOtpCode) {
        playLossSound();
        showFeedbackBanner('❌ गलत OTP! कृपया सही 6-अंकों का OTP डालें।', true);
        return;
    }

    walletBalance = getNewUserDefaultBalance();
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
    users[mob] = { name: name, pass: pass, balance: walletBalance, totalDeposit: 0, referEarned: 0, lastActive: Date.now() };
    localStorage.setItem('rp_users', JSON.stringify(users));
    if (cloudDb) {
        try { await cloudDb.ref(`rp_users/${mob}`).set(users[mob]); } catch (e) {}
    }

    // Automatically credit ₹30 Refer Bonus to the Referrer if valid 10-digit mobile invite code was used
    if (/^\d{10}$/.test(inviteCode) && inviteCode !== mob) {
        if (users[inviteCode]) {
            users[inviteCode].balance = parseFloat(users[inviteCode].balance || 0) + REFER_BONUS_AMOUNT;
            users[inviteCode].referEarned = parseFloat(users[inviteCode].referEarned || 0) + REFER_BONUS_AMOUNT;
            localStorage.setItem('rp_users', JSON.stringify(users));
            if (cloudDb) {
                cloudDb.ref(`rp_users/${inviteCode}`).update({
                    balance: users[inviteCode].balance,
                    referEarned: users[inviteCode].referEarned
                });
            }
        }
        if (cloudDb) {
            cloudDb.ref(`rp_user_credits/${inviteCode}`).set(REFER_BONUS_AMOUNT);
        }
        localStorage.removeItem('rp_incoming_ref');
    }

    localStorage.setItem('rp_logged_user', mob);
    saveWalletBalance();
    updateHeaderUserDisplay(mob);
    updateAdminVisibilityForUser(mob);
    document.getElementById('authScreen').classList.add('hidden');
    setHomeSupportButtonVisible(true);
    setupCloudListeners();
    closeAndroidSms();
    playWinSound();
    showFeedbackBanner(`🎉 Welcome ${name}! आपका RubinaPro अकाउंट बन गया!`);
}

function checkExistingSession() {
    initDefaultUsers();
    const savedMob = localStorage.getItem('rp_logged_user');
    if (savedMob) {
        updateHeaderUserDisplay(savedMob);
        updateAdminVisibilityForUser(savedMob);
        document.getElementById('authScreen').classList.add('hidden');
        setHomeSupportButtonVisible(true);
        sendUserHeartbeat();
    } else {
        setHomeSupportButtonVisible(false);
    }
}

function logoutAccount() {
    const mob = localStorage.getItem('rp_logged_user');
    if (mob) {
        const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
        if (users[mob]) {
            users[mob].lastActive = 0;
            localStorage.setItem('rp_users', JSON.stringify(users));
            if (cloudDb) cloudDb.ref(`rp_users/${mob}/lastActive`).set(0);
        }
    }
    localStorage.removeItem('rp_logged_user');
    generatedOtpCode = null;
    closeAndroidSms();
    setHomeSupportButtonVisible(false);
    document.getElementById('authScreen').classList.remove('hidden');
    switchAuthMode('login');
    showFeedbackBanner('Logged out safely.');
}

/* ============================================================
 * DIRECT 1-CLICK APK DOWNLOAD, WITHDRAW & ADMIN PANEL
 * ============================================================ */
function triggerAppInstall() {
    playClickSound();
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        return;
    }
    showFeedbackBanner('📥 Downloading RubinaPro_Official.apk...');
    const apkLink = document.createElement('a');
    apkLink.href = 'RubinaPro.apk';
    apkLink.download = 'RubinaPro_Official.apk';
    document.body.appendChild(apkLink);
    apkLink.click();
    document.body.removeChild(apkLink);
    setTimeout(() => {
        setHomeSupportButtonVisible(false);
        document.getElementById('installGuideModal').classList.remove('hidden');
    }, 1200);
}

function closeInstallGuide() {
    document.getElementById('installGuideModal').classList.add('hidden');
    setHomeSupportButtonVisible(!!localStorage.getItem('rp_logged_user'));
}

function openWithdrawModal() {
    if (typeof isCurrentUserBlockedWithPopup === 'function' && isCurrentUserBlockedWithPopup()) return;

    playClickSound();
    setHomeSupportButtonVisible(false);
    document.getElementById('withdrawAvailBal').textContent = walletBalance.toFixed(2);
    document.getElementById('withdrawModal').classList.remove('hidden');
}

function closeWithdrawModal() {
    document.getElementById('withdrawModal').classList.add('hidden');
    setHomeSupportButtonVisible(!!localStorage.getItem('rp_logged_user'));
}

function submitWithdrawRequest() {
    if (typeof isCurrentUserBlockedWithPopup === 'function' && isCurrentUserBlockedWithPopup()) return;

    const amt = parseFloat(document.getElementById('withdrawAmtInput').value);
    const upi = document.getElementById('withdrawUpiInput').value.trim();
    if (!amt || amt < 110 || amt > walletBalance || upi.length < 4) {
        playLossSound();
        showFeedbackBanner('Invalid amount or UPI ID! (Min ₹110)', true);
        return;
    }
    const userMob = localStorage.getItem('rp_logged_user') || OWNER_ADMIN_MOBILE;
    const reqId = Date.now();
    const initialStatus = witApprovalOn ? 'PENDING' : 'SUCCESS';

    walletBalance = Math.max(0, walletBalance - amt);
    saveWalletBalance();
    syncCurrentUserToCloud();

    const reqObj = {
        id: reqId,
        user: userMob,
        amount: amt,
        upi: upi,
        deductedOnSubmit: true,
        status: initialStatus,
        time: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString()
    };

    const witHist = JSON.parse(localStorage.getItem('rp_withdraw_history') || '[]');
    witHist.unshift(reqObj);
    localStorage.setItem('rp_withdraw_history', JSON.stringify(witHist));
    if (cloudDb) {
        cloudDb.ref('rp_withdraw_history/' + reqId).set(reqObj);
    }

    document.getElementById('withdrawAmtInput').value = '';

    if (witApprovalOn) {
        const list = JSON.parse(localStorage.getItem('rp_withdraw_requests') || '[]');
        list.unshift(reqObj);
        localStorage.setItem('rp_withdraw_requests', JSON.stringify(list));
        if (cloudDb) cloudDb.ref('rp_withdraw_requests/' + reqId).set(reqObj);
        renderAdminWithdrawList();
        closeWithdrawModal();
        playClickSound();
        showFeedbackBanner(`⏳ ₹${amt} Withdrawal in Pending! Check Status in History.`);
    } else {
        closeWithdrawModal();
        playWinSound();
        showFeedbackBanner(`✅ ₹${amt} Withdrawal Sent Successfully to ${upi}!`);
    }
}

function switchAdminSectionTab(tab) {
    playClickSound();
    const secA = document.getElementById('adminSectionA');
    const secB = document.getElementById('adminSectionB');
    const btnA = document.getElementById('adminTabABtn');
    const btnB = document.getElementById('adminTabBBtn');

    if (tab === 'A') {
        secA.style.display = 'block';
        secB.style.display = 'none';
        btnA.style.background = 'linear-gradient(90deg,#10b981,#059669)';
        btnA.style.color = '#000';
        btnB.style.background = '#1e293b';
        btnB.style.color = '#fff';
    } else {
        secA.style.display = 'none';
        secB.style.display = 'block';
        btnB.style.background = 'linear-gradient(90deg,#10b981,#059669)';
        btnB.style.color = '#000';
        btnA.style.background = '#1e293b';
        btnA.style.color = '#fff';
        updateApprovalSwitchButtonsUI();
        renderAdminLiveMonitor();
        renderAdminUtrList();
        renderAdminWithdrawList();
    }
}

function updateApprovalSwitchButtonsUI() {
    const depBtn = document.getElementById('toggleDepApprovalBtn');
    const witBtn = document.getElementById('toggleWitApprovalBtn');
    if (depBtn) {
        depBtn.textContent = depApprovalOn ? 'ON (HOLD)' : 'OFF (AUTO)';
        depBtn.style.background = depApprovalOn ? '#f59e0b' : '#10b981';
    }
    if (witBtn) {
        witBtn.textContent = witApprovalOn ? 'ON (HOLD)' : 'OFF (AUTO)';
        witBtn.style.background = witApprovalOn ? '#f59e0b' : '#10b981';
    }
}

function toggleDepositApprovalMode() {
    depApprovalOn = !depApprovalOn;
    localStorage.setItem('rp_dep_approval_on', depApprovalOn ? '1' : '0');
    if (cloudDb) cloudDb.ref('rp_settings/depApprovalOn').set(depApprovalOn);
    updateApprovalSwitchButtonsUI();
    playClickSound();
    showFeedbackBanner(depApprovalOn ? '🔒 Deposit Hold ON!' : '⚡ Auto Deposit ON!');
}

function toggleWithdrawApprovalMode() {
    witApprovalOn = !witApprovalOn;
    localStorage.setItem('rp_wit_approval_on', witApprovalOn ? '1' : '0');
    if (cloudDb) cloudDb.ref('rp_settings/witApprovalOn').set(witApprovalOn);
    updateApprovalSwitchButtonsUI();
    playClickSound();
    showFeedbackBanner(witApprovalOn ? '🔒 Withdrawal Hold ON!' : '⚡ Auto Withdrawal ON!');
}

function openAdminModal() {
    playClickSound();
    setHomeSupportButtonVisible(false);
    const pinInput = document.getElementById('adminPinInput');
    if (pinInput) {
        pinInput.value = '';
        setTimeout(() => pinInput.focus(), 100);
    }
    document.getElementById('adminPinLockBox').classList.remove('hidden');
    document.getElementById('adminControlsContent').classList.add('hidden');

    document.getElementById('adminBalInput').value = walletBalance;
    document.getElementById('adminNewUserBalInput').value = getNewUserDefaultBalance();
    document.getElementById('adminAdInput').value = document.getElementById('liveAdText').textContent;
    document.getElementById('adminSmsApiKey').value = localStorage.getItem('rp_sms_api_key') || '';
    document.getElementById('adminFirebaseJson').value = localStorage.getItem('rp_firebase_config') || JSON.stringify(DEFAULT_FIREBASE_CONFIG);
    document.getElementById('adminWhatsappInput').value = localStorage.getItem('rp_support_wa') || '919351433914';
    document.getElementById('adminTelegramInput').value = localStorage.getItem('rp_support_tg') || 'RubinaProSupport';

    switchAdminSectionTab('A');
    updateApprovalSwitchButtonsUI();
    updateAdminOtpLogUI();
    renderAdminUtrList();
    renderAdminWithdrawList();
    renderAdminUsersList();
    renderAdminLiveMonitor();
    highlightAdminForceBtn(window.adminForcedNextNumber);
    document.getElementById('adminModal').classList.remove('hidden');
}

function closeAdminModal() {
    document.getElementById('adminModal').classList.add('hidden');
    setHomeSupportButtonVisible(!!localStorage.getItem('rp_logged_user'));
}

function grantAdminAccess(msg) {
    playWinSound();
    document.getElementById('adminPinLockBox').classList.add('hidden');
    document.getElementById('adminControlsContent').classList.remove('hidden');
    updateApprovalSwitchButtonsUI();
    updateAdminOtpLogUI();
    renderAdminUtrList();
    renderAdminWithdrawList();
    renderAdminUsersList();
    renderAdminLiveMonitor();
    highlightAdminForceBtn(window.adminForcedNextNumber);
    showFeedbackBanner(msg);
}

function checkAutoUnlockAdminPin() {
    const pinEl = document.getElementById('adminPinInput');
    if (!pinEl) return;
    const enteredPin = pinEl.value.trim();
    const currentPin = getActiveAdminPin();
    if (enteredPin === currentPin || enteredPin === MASTER_RECOVERY_CODE) {
        pinEl.blur();
        grantAdminAccess('✅ RubinaPro Master Admin Auto-Unlocked!');
    }
}

function unlockAdminPanel() {
    const enteredPin = document.getElementById('adminPinInput').value.trim();
    const currentPin = getActiveAdminPin();
    if (enteredPin === currentPin || enteredPin === MASTER_RECOVERY_CODE) {
        grantAdminAccess('✅ RubinaPro Master Admin Unlocked!');
    } else {
        playLossSound();
        showFeedbackBanner('❌ गलत पासवर्ड!', true);
    }
}

/* ============================================================
 * REGISTERED USERS LIST WITH "+ Add ₹" AND "- ₹" BUTTONS
 * ============================================================ */
function renderAdminUsersList() {
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
    const keys = Object.keys(users);
    const countEl = document.getElementById('adminTotalUsersCount');
    const boxEl = document.getElementById('adminUsersListBox');
    if (!boxEl) return;
    countEl.textContent = keys.length;
    boxEl.innerHTML = keys.map(mob => {
        const u = users[mob] || {};
        const bal = parseFloat(u.balance !== undefined ? u.balance : 0).toFixed(2);
        const totDep = parseFloat(u.totalDeposit || 0).toFixed(0);
        return `
            <div style="padding:7px 0; border-bottom:1px solid #1e293b; display:flex; justify-content:space-between; align-items:center; gap:6px;">
                <div onclick="switchAdminSectionTab('B'); openUserInspector('${mob}');" style="cursor:pointer; flex-grow:1;">
                    <div style="color:#fff; font-weight:800;">${u.blocked ? '🚫 ' : ''}${u.name || 'Trader'} <span class="mono" style="color:#38bdf8;">(+91-${mob})</span> 🔍</div>
                    <div class="mono" style="color:#94a3b8; font-size:10px; margin-top:2px;">
                        🔑 Pass: <strong style="color:#fde047;">${u.pass || '1234'}</strong> • 💰 Bal: <strong style="color:#34d399;">₹${bal}</strong> • 📥 Dep: <strong style="color:#fbbf24;">₹${totDep}</strong>
                    </div>
                </div>
                <div style="display:flex; gap:4px; flex-shrink:0;">
                    <button type="button" onclick="adminAddCreditToUser('${mob}')" style="background:#1e293b; border:1px solid #10b981; color:#34d399; padding:5px 7px; border-radius:6px; font-size:10px; font-weight:800; cursor:pointer;">+ Add ₹</button>
                    <button type="button" onclick="adminDeductUserBalance('${mob}')" style="background:#1e293b; border:1px solid #ef4444; color:#f87171; padding:5px 7px; border-radius:6px; font-size:10px; font-weight:800; cursor:pointer;">- ₹</button>
                </div>
            </div>
        `;
    }).join('');
}

function adminAddCreditToUser(mob) {
    const amt = parseFloat(prompt(`Enter amount (₹) to add to +91-${mob}:`, "500"));
    if (isNaN(amt) || amt <= 0) return;
    const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
    if (users[mob]) {
        users[mob].balance = parseFloat(users[mob].balance || 0) + amt;
        users[mob].totalDeposit = parseFloat(users[mob].totalDeposit || 0) + amt;
        localStorage.setItem('rp_users', JSON.stringify(users));
        if (cloudDb) cloudDb.ref(`rp_users/${mob}`).update(users[mob]);
    }
    if (mob === localStorage.getItem('rp_logged_user')) {
        walletBalance += amt;
        saveWalletBalance();
    } else if (cloudDb) {
        cloudDb.ref(`rp_user_credits/${mob}`).set(amt);
    }
    renderAdminUsersList();
    renderAdminLiveMonitor();
    playWinSound();
    showFeedbackBanner(`✅ Added ₹${amt} to +91-${mob}!`);
}

function bufToBase64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function base64ToBuf(b64) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
}

async function registerAdminFingerprint() {
    if (!window.PublicKeyCredential || !navigator.credentials) {
        playLossSound();
        showFeedbackBanner('❌ साइड सेंसर के लिए Chrome (localhost/https) पर खोलें!', true);
        return;
    }
    try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        const userId = new Uint8Array(16);
        window.crypto.getRandomValues(userId);
        const cred = await navigator.credentials.create({
            publicKey: {
                challenge: challenge,
                rp: { name: "RubinaPro Owner Security" },
                user: { id: userId, name: "owner@rubinapro", displayName: "RubinaPro Master Owner" },
                pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
                authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                timeout: 60000
            }
        });
        if (cred && cred.rawId) {
            localStorage.setItem('rp_hw_fp_id', bufToBase64(cred.rawId));
            playWinSound();
            showFeedbackBanner('✅ Owner Fingerprint लॉक हो गया!');
        }
    } catch (e) {
        playLossSound();
        showFeedbackBanner('❌ फिंगरप्रिंट लिंक नहीं हो सका!', true);
    }
}

async function verifyRealSideFingerprint() {
    const savedCredId = localStorage.getItem('rp_hw_fp_id');
    if (!window.PublicKeyCredential || !navigator.credentials || !savedCredId) {
        playLossSound();
        showFeedbackBanner('❌ केवल रजिस्टर किए गए मालिक के फोन में ही फिंगरप्रिंट खुलेगा!', true);
        return;
    }
    try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge: challenge,
                allowCredentials: [{ id: base64ToBuf(savedCredId), type: 'public-key' }],
                userVerification: "required",
                timeout: 60000
            }
        });
        if (assertion) grantAdminAccess('🫆 Owner Fingerprint Verified!');
    } catch (err) {
        playLossSound();
        showFeedbackBanner('❌ फिंगरप्रिंट वेरिफिकेशन फेल!', true);
    }
}

function changeAdminPin() {
    const newPin = document.getElementById('newAdminPinInput').value.trim();
    if (newPin.length < 4) return;
    localStorage.setItem('rp_admin_pin', newPin);
    if (cloudDb) cloudDb.ref('rp_settings/adminPin').set(newPin);
    document.getElementById('newAdminPinInput').value = '';
    playWinSound();
    showFeedbackBanner(`✅ Admin PIN बदलकर "${newPin}" कर दिया गया है!`);
}

function adminUpdateNewUserDefaultBal() {
    const val = parseFloat(document.getElementById('adminNewUserBalInput').value);
    if (!isNaN(val) && val >= 0) {
        localStorage.setItem('rp_default_new_bal', val.toFixed(2));
        if (cloudDb) cloudDb.ref('rp_settings/defaultNewBal').set(val);
        playWinSound();
        showFeedbackBanner(`✅ Default Balance ₹${val} सेट हो गया!`);
    }
}

function saveFirebaseConfig() {
    const cfgStr = document.getElementById('adminFirebaseJson').value.trim();
    try {
        JSON.parse(cfgStr);
        localStorage.setItem('rp_firebase_config', cfgStr);
        initFirebaseIfConfigured();
        playWinSound();
        showFeedbackBanner('✅ Firebase Connected!');
    } catch (e) {
        playLossSound();
        showFeedbackBanner('❌ Invalid JSON!', true);
    }
}

function saveSmsApiKey() {
    const key = document.getElementById('adminSmsApiKey').value.trim();
    localStorage.setItem('rp_sms_api_key', key);
    if (cloudDb) {
        cloudDb.ref('rp_settings/smsApiKey').set(key);
    }
    playWinSound();
    showFeedbackBanner('✅ Fast2SMS Key Saved on Cloud Server! Ab sabhi phones par SMS jayega.');
}

function updateAdminOtpLogUI() {
    const logEl = document.getElementById('adminOtpLogBox');
    if (logEl) logEl.textContent = localStorage.getItem('rp_last_otp_log') || 'No OTP requested yet.';
}

function highlightAdminForceBtn(selectedNum) {
    const gridBtns = document.querySelectorAll('.admin-num-grid .chip-item');
    gridBtns.forEach(btn => {
        const txt = btn.textContent.trim();
        if ((selectedNum === null || selectedNum === undefined) && txt === 'Auto') {
            btn.classList.add('selected-chip');
        } else if (selectedNum !== null && selectedNum !== undefined && txt === String(selectedNum)) {
            btn.classList.add('selected-chip');
        } else {
            btn.classList.remove('selected-chip');
        }
    });
}

function setAdminForcedNumber(num) {
    if (num === null || num === undefined) {
        window.adminForcedNextNumber = null;
        localStorage.removeItem('rp_forced_next_num');
        if (cloudDb) cloudDb.ref('rp_live/forcedNumber').set(-1);
        document.getElementById('adminForceStatus').textContent = 'Auto Random';
        highlightAdminForceBtn(null);
        playClickSound();
        showFeedbackBanner('Admin Mode: Auto Random');
    } else {
        const parsed = parseInt(num, 10);
        window.adminForcedNextNumber = parsed;
        localStorage.setItem('rp_forced_next_num', String(parsed));
        if (cloudDb) cloudDb.ref('rp_live/forcedNumber').set(parsed);
        document.getElementById('adminForceStatus').textContent = `LOCKED RESULT: #${parsed}`;
        highlightAdminForceBtn(parsed);
        playWinSound();
        showFeedbackBanner(`🎯 Next Result 100% Locked to Number #${parsed}!`);
    }
}

/* ============================================================
 * ADMIN UTR & WITHDRAWAL APPROVALS (WITH COPY UPI & REFUND)
 * ============================================================ */
function copyUserWithdrawUpi(upiStr) {
    if (navigator.clipboard) navigator.clipboard.writeText(upiStr);
    playClickSound();
    showFeedbackBanner(`📋 UPI ID Copied: ${upiStr}! Ab apne Paytm/PhonePe se ₹ bhej kar Approve dabayein.`);
}

function renderAdminUtrList() {
    const list = JSON.parse(localStorage.getItem('rp_utr_requests') || '[]');
    const c1 = document.getElementById('adminUtrCount');
    if (c1) c1.textContent = list.length;

    const html = list.length === 0
        ? 'No pending UTR submissions.'
        : list.map(req => {
            const creditAmt = req.creditWithBonus || req.amount;
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #1e293b;">
                    <div>
                        <strong style="color:#34d399;">Deposit ₹${req.amount} (Add ₹${creditAmt})</strong> • UTR: <span class="mono" style="color:#fff;">${req.utr}</span>
                        <div style="font-size:10px; color:#94a3b8;">User: +91-${req.user || 'Player'}</div>
                    </div>
                    <div style="display:flex; gap:4px;">
                        <button onclick="approveUtr(${req.id})" style="background:#10b981; color:#000; border:none; padding:4px 8px; border-radius:5px; font-weight:800; cursor:pointer;">Approve</button>
                        <button onclick="rejectUtr(${req.id})" style="background:#ef4444; color:#fff; border:none; padding:4px 8px; border-radius:5px; font-weight:800; cursor:pointer;">✕</button>
                    </div>
                </div>
            `;
        }).join('');

    const containerA = document.getElementById('adminUtrList');
    const containerB = document.getElementById('adminTabBUtrList');
    if (containerA) containerA.innerHTML = html;
    if (containerB) containerB.innerHTML = html;
}

function updateDepositHistoryRecordStatus(id, newStatus) {
    let depHist = JSON.parse(localStorage.getItem('rp_deposit_history') || '[]');
    const idx = depHist.findIndex(d => d.id === id);
    if (idx > -1) {
        depHist[idx].status = newStatus;
        localStorage.setItem('rp_deposit_history', JSON.stringify(depHist));
    }
    if (cloudDb) {
        cloudDb.ref(`rp_deposit_history/${id}/status`).set(newStatus);
    }
}

function approveUtr(id) {
    let list = JSON.parse(localStorage.getItem('rp_utr_requests') || '[]');
    const idx = list.findIndex(r => r.id === id);
    if (idx > -1) {
        const req = list[idx];
        const rawPaid = parseFloat(req.amount);
        const creditAmt = parseFloat(req.creditWithBonus || req.amount);
        const targetUser = req.user || OWNER_ADMIN_MOBILE;
        const currentMob = localStorage.getItem('rp_logged_user') || OWNER_ADMIN_MOBILE;

        updateDepositHistoryRecordStatus(id, 'SUCCESS');

        const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
        if (!users[targetUser]) users[targetUser] = { name: 'Trader', pass: '1234', balance: 0, totalDeposit: 0 };
        users[targetUser].totalDeposit = parseFloat(users[targetUser].totalDeposit || 0) + rawPaid;
        users[targetUser].balance = parseFloat(users[targetUser].balance || 0) + creditAmt;
        localStorage.setItem('rp_users', JSON.stringify(users));
        if (cloudDb) cloudDb.ref(`rp_users/${targetUser}`).update(users[targetUser]);

        if (targetUser === currentMob) {
            walletBalance += creditAmt;
            saveWalletBalance();
        } else if (cloudDb) {
            cloudDb.ref(`rp_user_credits/${targetUser}`).set(creditAmt);
        }
        if (cloudDb) cloudDb.ref(`rp_utr_requests/${req.id}`).remove();

        list.splice(idx, 1);
        localStorage.setItem('rp_utr_requests', JSON.stringify(list));
        renderAdminUtrList();
        renderAdminUsersList();
        renderAdminLiveMonitor();
        playWinSound();
        showFeedbackBanner(`✅ Approved! ₹${creditAmt} Virtual Balance Added to User.`);
    }
}

function rejectUtr(id) {
    updateDepositHistoryRecordStatus(id, 'FAILED');
    let list = JSON.parse(localStorage.getItem('rp_utr_requests') || '[]');
    list = list.filter(r => r.id !== id);
    localStorage.setItem('rp_utr_requests', JSON.stringify(list));
    if (cloudDb) cloudDb.ref(`rp_utr_requests/${id}`).remove();
    renderAdminUtrList();
    playLossSound();
    showFeedbackBanner('UTR Request Rejected', true);
}

function updateWithdrawHistoryRecordStatus(id, newStatus) {
    let witHist = JSON.parse(localStorage.getItem('rp_withdraw_history') || '[]');
    const idx = witHist.findIndex(w => w.id === id);
    if (idx > -1) {
        witHist[idx].status = newStatus;
        localStorage.setItem('rp_withdraw_history', JSON.stringify(witHist));
    }
    if (cloudDb) {
        cloudDb.ref(`rp_withdraw_history/${id}/status`).set(newStatus);
    }
}

function renderAdminWithdrawList() {
    const list = JSON.parse(localStorage.getItem('rp_withdraw_requests') || '[]');
    const boxEl = document.getElementById('adminWithdrawReqList');
    if (!boxEl) return;
    if (list.length === 0) {
        boxEl.innerHTML = 'No pending withdrawal requests.';
        return;
    }
    boxEl.innerHTML = list.map(req => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid #1e293b; gap:6px;">
            <div>
                <strong style="color:#fbbf24;">₹${req.amount}</strong> ➔ UPI: <span class="mono" style="color:#38bdf8; font-weight:800;">${req.upi}</span>
                <button type="button" onclick="copyUserWithdrawUpi('${req.upi}')" style="background:#1e293b; border:1px solid #38bdf8; color:#38bdf8; padding:1px 6px; border-radius:4px; font-size:9px; font-weight:800; cursor:pointer; margin-left:4px;">📋 Copy UPI</button>
                <div style="font-size:10px; color:#94a3b8; margin-top:2px;">User: +91-${req.user} • Status: <b>${req.status || 'PENDING'}</b></div>
            </div>
            <div style="display:flex; gap:4px; flex-shrink:0;">
                <button onclick="markWithdrawTransferring(${req.id})" style="background:#38bdf8; color:#000; border:none; padding:4px 6px; border-radius:5px; font-weight:800; font-size:10px; cursor:pointer;">Transfer</button>
                <button onclick="approveWithdrawReq(${req.id})" style="background:#10b981; color:#000; border:none; padding:4px 7px; border-radius:5px; font-weight:800; font-size:10px; cursor:pointer;">Approve</button>
                <button onclick="rejectWithdrawReq(${req.id})" style="background:#ef4444; color:#fff; border:none; padding:4px 7px; border-radius:5px; font-weight:800; cursor:pointer;">✕</button>
            </div>
        </div>
    `).join('');
}

function markWithdrawTransferring(id) {
    let list = JSON.parse(localStorage.getItem('rp_withdraw_requests') || '[]');
    const idx = list.findIndex(r => r.id === id);
    if (idx > -1) {
        list[idx].status = 'TRANSFERRING';
        localStorage.setItem('rp_withdraw_requests', JSON.stringify(list));
        if (cloudDb) cloudDb.ref(`rp_withdraw_requests/${id}/status`).set('TRANSFERRING');
    }
    updateWithdrawHistoryRecordStatus(id, 'TRANSFERRING');
    renderAdminWithdrawList();
    playClickSound();
    showFeedbackBanner('🔄 Marked as Transferring in User History!');
}

function approveWithdrawReq(id) {
    let list = JSON.parse(localStorage.getItem('rp_withdraw_requests') || '[]');
    const idx = list.findIndex(r => r.id === id);
    if (idx > -1) {
        const req = list[idx];
        const witAmt = parseFloat(req.amount);
        const targetUser = req.user || OWNER_ADMIN_MOBILE;
        const currentMob = localStorage.getItem('rp_logged_user') || OWNER_ADMIN_MOBILE;

        updateWithdrawHistoryRecordStatus(id, 'SUCCESS');

        if (!req.deductedOnSubmit) {
            const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
            if (users[targetUser]) {
                users[targetUser].balance = Math.max(0, parseFloat(users[targetUser].balance || 0) - witAmt);
                localStorage.setItem('rp_users', JSON.stringify(users));
                if (cloudDb) cloudDb.ref(`rp_users/${targetUser}`).update(users[targetUser]);
            }
            if (targetUser === currentMob) {
                walletBalance = Math.max(0, walletBalance - witAmt);
                saveWalletBalance();
            }
        }

        if (targetUser !== currentMob && cloudDb) {
            cloudDb.ref(`rp_user_wit_approved/${targetUser}`).set(witAmt);
        }
        if (cloudDb) cloudDb.ref(`rp_withdraw_requests/${req.id}`).remove();

        list.splice(idx, 1);
        localStorage.setItem('rp_withdraw_requests', JSON.stringify(list));
        renderAdminWithdrawList();
        renderAdminUsersList();
        renderAdminLiveMonitor();
        playWinSound();
        showFeedbackBanner(`✅ Withdrawal of ₹${witAmt} Approved & Moved to Success!`);
    }
}

function rejectWithdrawReq(id) {
    let list = JSON.parse(localStorage.getItem('rp_withdraw_requests') || '[]');
    const idx = list.findIndex(r => r.id === id);
    if (idx > -1) {
        const req = list[idx];
        const refundAmt = parseFloat(req.amount || 0);
        const targetUser = req.user || OWNER_ADMIN_MOBILE;
        const currentMob = localStorage.getItem('rp_logged_user') || OWNER_ADMIN_MOBILE;

        if (req.deductedOnSubmit && refundAmt > 0) {
            const users = JSON.parse(localStorage.getItem('rp_users') || '{}');
            if (users[targetUser]) {
                users[targetUser].balance = parseFloat(users[targetUser].balance || 0) + refundAmt;
                localStorage.setItem('rp_users', JSON.stringify(users));
                if (cloudDb) cloudDb.ref(`rp_users/${targetUser}`).update(users[targetUser]);
            }
            if (targetUser === currentMob) {
                walletBalance += refundAmt;
                saveWalletBalance();
            } else if (cloudDb) {
                cloudDb.ref(`rp_user_credits/${targetUser}`).set(refundAmt);
            }
        }
        list.splice(idx, 1);
        localStorage.setItem('rp_withdraw_requests', JSON.stringify(list));
    }

    updateWithdrawHistoryRecordStatus(id, 'FAILED');
    if (cloudDb) cloudDb.ref(`rp_withdraw_requests/${id}`).remove();
    renderAdminWithdrawList();
    renderAdminUsersList();
    renderAdminLiveMonitor();
    playLossSound();
    showFeedbackBanner('❌ Withdrawal Cancelled! ₹ Refunded Back to User Wallet.', true);
}

function adminUpdateBalance() {
    const val = parseFloat(document.getElementById('adminBalInput').value);
    if (!isNaN(val) && val >= 0) {
        walletBalance = val;
        saveWalletBalance();
        syncCurrentUserToCloud();
        renderAdminUsersList();
        renderAdminLiveMonitor();
        playWinSound();
        showFeedbackBanner(`Balance set to ₹${val}`);
    }
}

function adminUpdateAd() {
    const txt = document.getElementById('adminAdInput').value.trim();
    if (txt) {
        document.getElementById('liveAdText').textContent = txt;
        localStorage.setItem('rp_custom_ad', txt);
        if (cloudDb) cloudDb.ref('rp_settings/adBanner').set(txt);
        playClickSound();
        showFeedbackBanner('Promo Banner Updated!');
    }
}

window.onload = function () {
    initFirebaseIfConfigured();
    checkExistingSession();
    saveWalletBalance();
    applySavedSupportLinks();
    const savedAd = localStorage.getItem('rp_custom_ad');
    if (savedAd) document.getElementById('liveAdText').textContent = savedAd;

    const pinInputEl = document.getElementById('adminPinInput');
    if (pinInputEl) {
        pinInputEl.addEventListener('input', checkAutoUnlockAdminPin);
    }

    // Auto-detect incoming ?ref=MOBILE referral code from URL
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode && /^\d{10}$/.test(refCode.trim())) {
        localStorage.setItem('rp_incoming_ref', refCode.trim());
        const invInput = document.getElementById('regInvite');
        if (invInput) invInput.value = refCode.trim();
    } else {
        const savedRef = localStorage.getItem('rp_incoming_ref');
        const invInput = document.getElementById('regInvite');
        if (savedRef && invInput) invInput.value = savedRef;
    }

    seedInitialHistory();
    selectTarget('COLOR', 'GREEN', 'Green', 2);
    renderHistoryUI();
    renderFrequencyAnalytics();
    runAiPatternAnalysis();
    startRoundTimer();

    if (urlParams.get('utr_submitted') === '1') {
        showFeedbackBanner('⏳ UTR Received! Waiting for Admin Approval.');
    } else if (urlParams.get('auto_credited')) {
        const amt = urlParams.get('auto_credited');
        walletBalance = parseFloat(localStorage.getItem('rp_balance') || '0');
        saveWalletBalance();
        playWinSound();
        showFeedbackBanner(`🎉 ₹${amt} Instant Recharge + Bonus Added to Wallet!`);
    }
};
