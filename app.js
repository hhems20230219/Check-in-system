if (!window.AttendanceApi) {
    alert('api.js 尚未正確載入');
    throw new Error('AttendanceApi is not defined');
}

const MONTH_TARGET_HOURS = 12;
const LAST_USER_STORAGE_KEY = 'attendance_last_user_name';

let staffList = [];
let records = [];
let currentUserIndex = -1;
let locationInfo = { success: false };

let switchUserModalInstance = null;
let checkInModalInstance = null;
let checkOutModalInstance = null;
let loadingModalInstance = null;

let loadingCount = 0;

/* =========================
   🔥 強制修復 iOS modal bug
========================= */
function forceCloseAllModals() {
    $('.modal').each(function () {
        const m = bootstrap.Modal.getInstance(this);
        if (m) m.hide();
    });

    $('.modal-backdrop').remove();
    $('body').removeClass('modal-open').css({
        overflow: '',
        paddingRight: ''
    });
}

/* =========================
   🔥 Loading 控制（核心修正）
========================= */
function showLoading(title = '處理中', message = '請稍候...') {

    forceCloseAllModals(); // 🔥 避免卡住

    loadingCount++;

    $('#loadingModalTitle').text(title);
    $('#loadingModalMessage').text(message);

    loadingModalInstance.show();
}

function hideLoading() {
    loadingCount = Math.max(loadingCount - 1, 0);

    if (loadingCount === 0) {
        loadingModalInstance.hide();

        // 🔥 再清一次（iOS 必要）
        setTimeout(forceCloseAllModals, 100);
    }
}

/* =========================
   🔥 Spinner 一定會轉
========================= */
async function withLoading(title, message, action) {

    showLoading(title, message);

    // 🔥 關鍵：讓畫面先 render
    await new Promise(requestAnimationFrame);

    try {
        return await action();
    } finally {
        hideLoading();
    }
}

/* =========================
   工具
========================= */
function pad2(num) {
    return String(num).padStart(2, '0');
}

function formatDate(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatYearMonth(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function formatTime(date) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function formatDateDisplay(date) {
    const weekMap = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    return `${date.getFullYear()}年${pad2(date.getMonth()+1)}月${pad2(date.getDate())}日 ${weekMap[date.getDay()]}`;
}

function formatHoursByMinutes(minutes) {
    return (Number(minutes || 0) / 60).toFixed(1);
}

function getCurrentUser() {
    return currentUserIndex >= 0 ? staffList[currentUserIndex] : null;
}

/* =========================
   UI
========================= */
function renderNavbar() {
    const u = getCurrentUser();
    if (!u) return;

    $('#navDepartment').text(u.unit || '');
    $('#navTitle').text(u.title || '');
    $('#navName').text(u.name || '');
}

function updateClock() {
    const now = new Date();
    $('#clockTime').text(formatTime(now));
    $('#clockDate').text(formatDateDisplay(now));
}

function calculateSummary() {
    const user = getCurrentUser();
    if (!user) return;

    const assist = records.filter(r =>
        r.name === user.name &&
        r.shiftType === '協勤'
    );

    const totalMin = assist.reduce((s, r) => s + (r.minutes || 0), 0);

    const ym = $('#filterYearMonth').val();

    const monthMin = assist
        .filter(r => r.yearMonth === ym)
        .reduce((s, r) => s + (r.minutes || 0), 0);

    const totalH = totalMin / 60;
    const monthH = monthMin / 60;

    $('#totalHours').text(totalH.toFixed(1));
    $('#monthHours').text(monthH.toFixed(1));
}

/* =========================
   渲染
========================= */
function renderAll() {
    renderNavbar();
    calculateSummary();
}

/* =========================
   Modal 行為
========================= */
function openSwitchUserModal() {

    if (!staffList.length) return;

    $('#switchName').empty();

    staffList.forEach(u => {
        $('#switchName').append(`<option value="${u.name}">${u.name}</option>`);
    });

    switchUserModalInstance.show();
}

/* =========================
   🔥 切換使用者（不再 loading）
========================= */
function applySwitchUser(e) {
    e.preventDefault();

    const name = $('#switchName').val();
    const idx = staffList.findIndex(x => x.name === name);

    if (idx < 0) return;

    currentUserIndex = idx;
    localStorage.setItem(LAST_USER_STORAGE_KEY, name);

    switchUserModalInstance.hide();

    setTimeout(renderAll, 100);
}

/* =========================
   簽到
========================= */
async function submitCheckIn(e) {
    e.preventDefault();

    const name = $('#checkInName').val();
    const shiftType = $('#checkInShiftType').val();
    const date = $('#checkInDate').val();
    const time = $('#checkInTime').val();

    try {
        const res = await withLoading('簽到中', '請稍候...', async () => {
            return await AttendanceApi.checkIn({
                name,
                shiftType,
                checkInDate: date,
                checkInTime: time
            });
        });

        records.push(res.record);

        renderAll();
        checkInModalInstance.hide();

        alert('簽到成功');

    } catch (err) {
        alert(err.message || '失敗');
    }
}

/* =========================
   簽退
========================= */
async function submitCheckOut(e) {
    e.preventDefault();

    const name = $('#checkOutName').val();
    const shiftType = $('#checkOutShiftType').val();
    const date = $('#checkOutDate').val();
    const time = $('#checkOutTime').val();

    try {
        const res = await withLoading('簽退中', '請稍候...', async () => {
            return await AttendanceApi.checkOut({
                name,
                shiftType,
                checkOutDate: date,
                checkOutTime: time
            });
        });

        const r = records.find(x => x.name === name && !x.checkOutTime);
        if (r) Object.assign(r, res.record);

        renderAll();
        checkOutModalInstance.hide();

        alert('簽退成功');

    } catch (err) {
        alert(err.message || '失敗');
    }
}

/* =========================
   初始化
========================= */
async function loadInitData() {

    const res = await withLoading('資料讀取中', '請稍候...', async () => {
        return await AttendanceApi.getInitData();
    });

    staffList = res.data.staffList || [];
    records = res.data.records || [];

    const last = localStorage.getItem(LAST_USER_STORAGE_KEY);
    const idx = staffList.findIndex(x => x.name === last);

    currentUserIndex = idx >= 0 ? idx : 0;

    renderAll();
}

/* =========================
   啟動
========================= */
$(async function () {

    switchUserModalInstance = new bootstrap.Modal('#switchUserModal');
    checkInModalInstance = new bootstrap.Modal('#checkInModal');
    checkOutModalInstance = new bootstrap.Modal('#checkOutModal');
    loadingModalInstance = new bootstrap.Modal('#loadingModal');

    updateClock();
    setInterval(updateClock, 1000);

    await loadInitData();

    $('#btnSwitchUser').on('click', openSwitchUserModal);
    $('#switchUserForm').on('submit', applySwitchUser);

    $('#checkInForm').on('submit', submitCheckIn);
    $('#checkOutForm').on('submit', submitCheckOut);
});
