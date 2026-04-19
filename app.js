if (!window.AttendanceApi) {
    alert('api.js 尚未正確載入，請檢查 index.html 的 script 順序或檔案路徑。');
    throw new Error('AttendanceApi is not defined');
}

const MONTH_TARGET_HOURS = 12;
const LAST_USER_STORAGE_KEY = 'attendance_last_user_name';

let staffList = [];
let records = [];
let currentUserIndex = -1;
let locationInfo = {
    success: false,
    inRange: false,
    message: '尚未取得定位'
};

let switchUserModalInstance = null;
let checkInModalInstance = null;
let checkOutModalInstance = null;
let loadingModalInstance = null;

let loadingCount = 0;

/* =========================
   🔧 Loading（只鎖定位）
========================= */
function showLoading(title = '處理中', message = '請稍候...') {
    loadingCount++;

    $('#loadingModalTitle').text(title);
    $('#loadingModalMessage').text(message);

    // 🔥 只鎖「重新定位」
    $('#btnRefreshLocation').prop('disabled', true);

    loadingModalInstance.show();
}

function hideLoading() {
    loadingCount = Math.max(loadingCount - 1, 0);

    if (loadingCount === 0) {
        $('#btnRefreshLocation').prop('disabled', false);
        loadingModalInstance.hide();
    }
}

/* =========================
   🔥 spinner 一定會轉
========================= */
async function withLoading(title, message, action) {
    showLoading(title, message);

    // 🔥 關鍵：先讓畫面 render
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
    return `${date.getFullYear()}年${pad2(date.getMonth() + 1)}月${pad2(date.getDate())}日 ${weekMap[date.getDay()]}`;
}

function formatHoursByMinutes(minutes) {
    return (Number(minutes || 0) / 60).toFixed(1);
}

/* =========================
   使用者
========================= */
function getCurrentUser() {
    return currentUserIndex >= 0 ? (staffList[currentUserIndex] || null) : null;
}

function findUserIndexByName(name) {
    return staffList.findIndex(user => user.name === name);
}

function syncUserInfoByName(nameSelector, unitSelector, titleSelector) {
    const name = $(nameSelector).val();
    const user = staffList.find(u => u.name === name);

    if (!user) return;

    $(unitSelector).val(user.unit || '');
    $(titleSelector).val(user.title || '');
}

/* =========================
   UI
========================= */
function renderNavbar() {
    const user = getCurrentUser();
    if (!user) return;

    $('#navDepartment').text(user.unit);
    $('#navTitle').text(user.title);
    $('#navName').text(user.name);
}

function updateClock() {
    const now = new Date();
    $('#clockTime').text(formatTime(now));
    $('#clockDate').text(formatDateDisplay(now));
}

/* =========================
   統計
========================= */
function calculateSummary() {
    const user = getCurrentUser();
    if (!user) return;

    const assistRecords = records.filter(r =>
        r.name === user.name &&
        r.minutes !== null &&
        r.shiftType === '協勤'
    );

    const totalMinutes = assistRecords.reduce((sum, item) => {
        return sum + Number(item.minutes || 0);
    }, 0);

    const currentYearMonth = $('#filterYearMonth').val();

    const monthMinutes = assistRecords
        .filter(r => (r.yearMonth || '') === currentYearMonth)
        .reduce((sum, item) => {
            return sum + Number(item.minutes || 0);
        }, 0);

    $('#totalHours').text((totalMinutes / 60).toFixed(1));
    $('#monthHours').text((monthMinutes / 60).toFixed(1));
}

/* =========================
   渲染
========================= */
function renderAll() {
    renderNavbar();
    calculateSummary();
}

/* =========================
   Modal
========================= */
function openSwitchUserModal() {

    if (!staffList.length) return;

    const user = getCurrentUser();
    const currentName = user ? user.name : staffList[0].name;

    $('#switchName').empty();

    staffList.forEach(u => {
        $('#switchName').append(`<option value="${u.name}">${u.name}</option>`);
    });

    $('#switchName').val(currentName);

    syncUserInfoByName('#switchName', '#switchUnit', '#switchTitle');

    switchUserModalInstance.show();
}

/* =========================
   切換使用者（不使用 loading）
========================= */
function applySwitchUser(event) {
    event.preventDefault();

    const selectedName = $('#switchName').val();
    const index = findUserIndexByName(selectedName);

    if (index < 0) {
        alert('找不到使用者');
        return;
    }

    currentUserIndex = index;
    localStorage.setItem(LAST_USER_STORAGE_KEY, selectedName);

    switchUserModalInstance.hide();

    setTimeout(renderAll, 100);
}

/* =========================
   簽到
========================= */
async function submitCheckIn(event) {
    event.preventDefault();

    const name = $('#checkInName').val();
    const shiftType = $('#checkInShiftType').val();
    const checkInDate = $('#checkInDate').val();
    const checkInTime = $('#checkInTime').val();

    try {
        const result = await withLoading('簽到中', '請稍候...', async () => {
            return await AttendanceApi.checkIn({
                name,
                shiftType,
                checkInDate,
                checkInTime
            });
        });

        records.push(result.record);
        renderAll();

        checkInModalInstance.hide();
        alert('簽到成功');

    } catch (error) {
        alert(error.message || '簽到失敗');
    }
}

/* =========================
   簽退
========================= */
async function submitCheckOut(event) {
    event.preventDefault();

    const name = $('#checkOutName').val();
    const shiftType = $('#checkOutShiftType').val();
    const checkOutDate = $('#checkOutDate').val();
    const checkOutTime = $('#checkOutTime').val();

    try {
        const result = await withLoading('簽退中', '請稍候...', async () => {
            return await AttendanceApi.checkOut({
                name,
                shiftType,
                checkOutDate,
                checkOutTime
            });
        });

        const target = records.find(r => r.name === name && !r.checkOutTime);
        if (target) Object.assign(target, result.record);

        renderAll();

        checkOutModalInstance.hide();
        alert('簽退成功');

    } catch (error) {
        alert(error.message || '簽退失敗');
    }
}

/* =========================
   初始化
========================= */
async function loadInitData() {

    const result = await withLoading('資料讀取中', '請稍候...', async () => {
        return await AttendanceApi.getInitData();
    });

    staffList = result.data.staffList || [];
    records = result.data.records || [];

    if (!staffList.length) {
        alert('人員資料工作表沒有資料');
        return;
    }

    const lastName = localStorage.getItem(LAST_USER_STORAGE_KEY);
    const lastIndex = findUserIndexByName(lastName);

    currentUserIndex = lastIndex >= 0 ? lastIndex : 0;

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

    $('#filterYearMonth').val(formatYearMonth(new Date()));

    await loadInitData();

    $('#btnSwitchUser').on('click', openSwitchUserModal);
    $('#switchUserForm').on('submit', applySwitchUser);

    $('#switchName').on('change', function () {
        syncUserInfoByName('#switchName', '#switchUnit', '#switchTitle');
    });

    $('#checkInForm').on('submit', submitCheckIn);
    $('#checkOutForm').on('submit', submitCheckOut);
});
