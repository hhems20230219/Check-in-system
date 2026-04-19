if (!window.AttendanceApi) {
    alert('api.js 尚未正確載入');
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
   Loading（只給 API 用）
========================= */

function showLoading(title = '處理中', message = '請稍候...') {
    loadingCount++;

    $('#loadingModalTitle').text(title);
    $('#loadingModalMessage').text(message);

    if (!document.getElementById('loadingModal').classList.contains('show')) {
        loadingModalInstance.show();
    }
}

function hideLoading() {
    loadingCount = Math.max(loadingCount - 1, 0);

    if (loadingCount === 0) {
        loadingModalInstance.hide();
    }
}

async function withLoading(title, message, action) {
    showLoading(title, message);
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

function formatDate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatTime(d) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatYearMonth(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function getCurrentUser() {
    return currentUserIndex >= 0 ? staffList[currentUserIndex] : null;
}

function findUserIndexByName(name) {
    return staffList.findIndex(x => x.name === name);
}

function escapeHtml(v) {
    return String(v || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/* =========================
   UI Render
========================= */

function renderNavbar() {
    const u = getCurrentUser();
    if (!u) return;

    $('#navDepartment').text(u.unit);
    $('#navTitle').text(u.title);
    $('#navName').text(u.name);
}

function renderRecords() {
    const u = getCurrentUser();
    if (!u) return;

    const ym = $('#filterYearMonth').val();
    const rows = records.filter(r => r.name === u.name && r.yearMonth === ym).reverse();

    const $tbody = $('#recordTableBody');
    $tbody.empty();

    if (!rows.length) {
        $('#recordTableWrap').addClass('d-none');
        $('#emptyText').removeClass('d-none');
        return;
    }

    $('#recordTableWrap').removeClass('d-none');
    $('#emptyText').addClass('d-none');

    rows.forEach(r => {
        $tbody.append(`
            <tr>
                <td>${escapeHtml(r.shiftType)}</td>
                <td>${r.checkInDate}</td>
                <td>${r.checkInTime}</td>
                <td>${r.checkOutDate || ''}</td>
                <td>${r.checkOutTime || ''}</td>
                <td>${r.minutes ? (r.minutes/60).toFixed(1) : '-'}</td>
            </tr>
        `);
    });
}

function renderAll() {
    renderNavbar();
    renderRecords();
}

/* =========================
   切換使用者（🔥已修正）
========================= */

function openSwitchUserModal() {
    if (!staffList.length) return;

    const u = getCurrentUser();
    const name = u ? u.name : staffList[0].name;

    $('#switchName').val(name);
    switchUserModalInstance.show();
}

/* ⭐ 核心修正在這裡 ⭐ */
function applySwitchUser(event) {
    event.preventDefault();

    const name = $('#switchName').val();
    const index = findUserIndexByName(name);

    if (index < 0) {
        alert('找不到使用者');
        return;
    }

    currentUserIndex = index;
    localStorage.setItem(LAST_USER_STORAGE_KEY, name);

    switchUserModalInstance.hide();

    // ✅ 避免 iOS 卡住
    setTimeout(() => {
        renderAll();
    }, 100);
}

/* =========================
   API
========================= */

async function loadInitData() {
    const result = await withLoading('載入中', '讀取資料...', async () => {
        return await AttendanceApi.getInitData();
    });

    staffList = result.data.staffList || [];
    records = result.data.records || [];

    const last = localStorage.getItem(LAST_USER_STORAGE_KEY);
    const idx = findUserIndexByName(last);

    currentUserIndex = idx >= 0 ? idx : -1;

    if (currentUserIndex < 0) {
        openSwitchUserModal();
    }

    renderAll();
}

/* =========================
   初始化
========================= */

$(async function () {

    switchUserModalInstance = new bootstrap.Modal(document.getElementById('switchUserModal'));
    loadingModalInstance = new bootstrap.Modal(document.getElementById('loadingModal'));

    $('#filterYearMonth').val(formatYearMonth(new Date()));

    await loadInitData();

    $('#btnSwitchUser').on('click', openSwitchUserModal);
    $('#switchUserForm').on('submit', applySwitchUser);
});
