if (!window.AttendanceApi) {
    alert('api.js 尚未正確載入');
    throw new Error('AttendanceApi is not defined');
}

const MONTH_TARGET_HOURS = 12;
const LAST_USER_STORAGE_KEY = 'attendance_last_user_name';

let staffList = [];
let records = [];
let currentUserIndex = -1;

let switchUserModalInstance = null;
let checkInModalInstance = null;
let checkOutModalInstance = null;
let loadingModalInstance = null;

let loadingCount = 0;

/* =========================
   Loading（修正 spinner）
========================= */
function showLoading(title = '處理中', message = '請稍候...') {
    loadingCount++;

    $('#loadingModalTitle').text(title);
    $('#loadingModalMessage').text(message);

    loadingModalInstance.show();
}

function hideLoading() {
    loadingCount = Math.max(loadingCount - 1, 0);

    if (loadingCount === 0) {
        loadingModalInstance.hide();
    }
}

/* 🔥 核心：讓 spinner 會動 */
async function withLoading(title, message, action) {
    showLoading(title, message);

    // 讓畫面先 render（關鍵）
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
function pad2(n) {
    return String(n).padStart(2, '0');
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
    const w = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    return `${date.getFullYear()}年${pad2(date.getMonth()+1)}月${pad2(date.getDate())}日 ${w[date.getDay()]}`;
}

function formatHoursByMinutes(m) {
    return (Number(m || 0) / 60).toFixed(1);
}

/* =========================
   使用者
========================= */
function getCurrentUser() {
    return currentUserIndex >= 0 ? staffList[currentUserIndex] : null;
}

function findUserIndexByName(name) {
    return staffList.findIndex(u => u.name === name);
}

/* 🔥 單位/職稱同步 */
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
    const u = getCurrentUser();
    if (!u) return;

    $('#navDepartment').text(u.unit);
    $('#navTitle').text(u.title);
    $('#navName').text(u.name);
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

    const assist = records.filter(r =>
        r.name === user.name &&
        r.shiftType === '協勤' &&
        r.minutes !== null
    );

    const totalMin = assist.reduce((s, r) => s + Number(r.minutes || 0), 0);

    const ym = $('#filterYearMonth').val();

    const monthMin = assist
        .filter(r => r.yearMonth === ym)
        .reduce((s, r) => s + Number(r.minutes || 0), 0);

    $('#totalHours').text((totalMin / 60).toFixed(1));
    $('#monthHours').text((monthMin / 60).toFixed(1));
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

/* 🔥 切換使用者（無 loading） */
function applySwitchUser(e) {
    e.preventDefault();

    const name = $('#switchName').val();
    const idx = findUserIndexByName(name);

    if (idx < 0) {
        alert('找不到使用者');
        return;
    }

    currentUserIndex = idx;

    // 記住
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
        alert(err.message || '簽到失敗');
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

        const target = records.find(r => r.name === name && !r.checkOutTime);
        if (target) Object.assign(target, res.record);

        renderAll();

        checkOutModalInstance.hide();
        alert('簽退成功');

    } catch (err) {
        alert(err.message || '簽退失敗');
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

    if (!staffList.length) {
        alert('沒有使用者資料');
        return;
    }

    // 🔥 正確記憶使用者
    const last = localStorage.getItem(LAST_USER_STORAGE_KEY);
    const idx = findUserIndexByName(last);

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

    $('#switchName').on('change', function () {
        syncUserInfoByName('#switchName', '#switchUnit', '#switchTitle');
    });

    $('#checkInForm').on('submit', submitCheckIn);
    $('#checkOutForm').on('submit', submitCheckOut);

    $('#filterYearMonth').val(formatYearMonth(new Date()));
});
