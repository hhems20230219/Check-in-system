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

let switchModalInstance = null;
let checkInModalInstance = null;
let checkOutModalInstance = null;
let loadingModalInstance = null;

let signatureCanvas = null;
let signatureCtx = null;
let isDrawing = false;
let hasSignature = false;
let loadingCount = 0;

// PWA
let deferredInstallPrompt = null;

function isBusy() {
    return loadingCount > 0;
}

function setUiBusyState(isDisabled) {
    $('#btnRefreshLocation').prop('disabled', isDisabled);
    $('#btnSwitchUser').prop('disabled', isDisabled);
    $('#btnCheckIn').prop('disabled', isDisabled);
    $('#btnCheckOut').prop('disabled', isDisabled);
    $('#btnInstallApp').prop('disabled', isDisabled);
}

function showLoading(title = '處理中', message = '請稍候...') {
    loadingCount++;
    $('#loadingModalTitle').text(title);
    $('#loadingModalMessage').text(message);
    setUiBusyState(true);

    if (!document.getElementById('loadingModal').classList.contains('show')) {
        loadingModalInstance.show();
    }
}

function hideLoading() {
    loadingCount = Math.max(loadingCount - 1, 0);

    if (loadingCount === 0) {
        setUiBusyState(false);

        if (document.getElementById('loadingModal').classList.contains('show')) {
            loadingModalInstance.hide();
        }
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
    const weekMap = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return `${date.getFullYear()}年${pad2(date.getMonth() + 1)}月${pad2(date.getDate())}日 ${weekMap[date.getDay()]}`;
}

function formatHoursByMinutes(minutes) {
    return (Number(minutes || 0) / 60).toFixed(1);
}

function getCurrentUser() {
    return currentUserIndex >= 0 ? (staffList[currentUserIndex] || null) : null;
}

function getCurrentFilterYearMonth() {
    return $('#filterYearMonth').val() || formatYearMonth(new Date());
}

function getCurrentDateAndRoundedHalfHour() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    return {
        date: formatDate(now),
        time: `${pad2(hour)}:${minute < 30 ? '00' : '30'}`
    };
}

function generateHalfHourOptions($select) {
    $select.empty();
    for (let hour = 0; hour < 24; hour++) {
        ['00', '30'].forEach(minute => {
            const value = `${pad2(hour)}:${minute}`;
            $select.append(`<option value="${value}">${value}</option>`);
        });
    }
}

function populateNameOptions($select) {
    $select.empty();
    staffList.forEach(user => {
        $select.append(`<option value="${escapeHtml(user.name)}">${escapeHtml(user.name)}</option>`);
    });
}

function getUserByName(name) {
    return staffList.find(user => user.name === name) || null;
}

function findUserIndexByName(name) {
    return staffList.findIndex(user => user.name === name);
}

function syncTitleByName(nameSelector, titleSelector) {
    const user = getUserByName($(nameSelector).val());
    $(titleSelector).val(user ? user.title : '');
}

function syncUnitByName(nameSelector, unitSelector) {
    const user = getUserByName($(nameSelector).val());
    $(unitSelector).val(user ? user.unit : '');
}

function syncUserInfoByName(nameSelector, unitSelector, titleSelector) {
    syncUnitByName(nameSelector, unitSelector);
    syncTitleByName(nameSelector, titleSelector);
}

function toggleCheckOutDutyStatus() {
    const shiftType = $('#checkOutShiftType').val();
    const shouldShow = shiftType === '協勤';
    $('#checkOutDutyStatusGroup').toggleClass('d-none', !shouldShow);

    if (!shouldShow) {
        $('#checkOutDutyStatus').val('');
    } else if (!$('#checkOutDutyStatus').val()) {
        $('#checkOutDutyStatus').val('出勤');
    }
}

function shouldRequireWorkContent(shiftType, dutyStatus) {
    if (shiftType === '公差勤務') return true;
    if (shiftType === '協勤' && dutyStatus !== '備勤') return true;
    return false;
}

function toggleCheckOutWorkContent() {
    const shiftType = $('#checkOutShiftType').val();
    const dutyStatus = $('#checkOutDutyStatus').val() || '';
    const shouldShow = shouldRequireWorkContent(shiftType, dutyStatus);

    $('#checkOutWorkContentGroup').toggleClass('d-none', !shouldShow);

    if (!shouldShow) {
        $('#checkOutWorkContent').val('');
    }
}

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

function renderLocationStatus(data) {
    const $badge = $('#locationBadge');
    const $message = $('#locationStatusMessage');

    if (!data || !data.success) {
        $badge.removeClass('text-bg-success text-bg-danger text-bg-warning').addClass('text-bg-secondary').text('未定位');
        $message.removeClass('text-success text-danger').addClass('text-muted').text(data && data.message ? data.message : '定位失敗，請開啟 Wi-Fi 後再重新定位');
        return;
    }

    if (data.inRange) {
        $badge.removeClass('text-bg-secondary text-bg-danger text-bg-warning').addClass('text-bg-success').text('定位符合');
        $message.removeClass('text-muted text-danger').addClass('text-success').text(`目前位置符合範圍，緯度 ${data.latitude}，經度 ${data.longitude}，最近距離 ${Number(data.nearestDistanceMeters || 0).toFixed(0)} 公尺`);
        return;
    }

    $badge.removeClass('text-bg-secondary text-bg-success text-bg-warning').addClass('text-bg-danger').text('定位不符合');
    $message.removeClass('text-muted text-success').addClass('text-danger').text(`目前位置不在指定範圍內，緯度 ${data.latitude}，經度 ${data.longitude}，最近距離 ${Number(data.nearestDistanceMeters || 0).toFixed(0)} 公尺`);
}

async function refreshLocation() {
    if (isBusy()) {
        return;
    }

    if (!window.LocationService || typeof window.LocationService.getCurrentLocation !== 'function') {
        locationInfo = { success: false, inRange: false, message: '找不到定位模組 location.js，請開啟 Wi-Fi 後再試' };
        renderLocationStatus(locationInfo);
        renderReminderStatus();
        return;
    }

    $('#btnRefreshLocation').prop('disabled', true);
    $('#locationStatusMessage')
        .removeClass('text-success text-danger')
        .addClass('text-muted')
        .text('定位中...');
    $('#locationBadge')
        .removeClass('text-bg-success text-bg-danger text-bg-secondary')
        .addClass('text-bg-warning')
        .text('定位中');

    try {
        const result = await Promise.resolve(window.LocationService.getCurrentLocation());
        locationInfo = result;
        renderLocationStatus(result);
        renderReminderStatus();
    } catch (error) {
        locationInfo = { success: false, inRange: false, message: '定位失敗，請開啟 Wi-Fi 後再重新定位' };
        renderLocationStatus(locationInfo);
        renderReminderStatus();
    } finally {
        $('#btnRefreshLocation').prop('disabled', false);
    }
}

function setReminder(message) {
    if (!message) {
        $('#eventReminderSection').addClass('d-none');
        $('#workStatus').text('');
        return;
    }

    $('#eventReminderSection').removeClass('d-none');
    $('#workStatus').text(message);
}

function hasOpenRecord(userName) {
    return records.some(item => item.name === userName && !item.checkOutDate && !item.checkOutTime);
}

function getLatestOpenRecord(userName) {
    for (let i = records.length - 1; i >= 0; i--) {
        const item = records[i];
        if (item.name === userName && !item.checkOutDate && !item.checkOutTime) {
            return item;
        }
    }
    return null;
}

function renderReminderStatus() {
    const user = getCurrentUser();
    if (!user) return;

    if (hasOpenRecord(user.name)) {
        setReminder('目前已有未簽退紀錄，可切換姓名查看其他人資料。');
        return;
    }

    if (!locationInfo || !locationInfo.success) {
        setReminder('尚未完成定位，請開啟 Wi-Fi 並重新定位。');
        return;
    }

    if (!locationInfo.inRange) {
        setReminder('目前定位不在指定範圍內，協勤或常年訓練將無法送出。');
        return;
    }

    setReminder('');
}

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

    const currentYearMonth = getCurrentFilterYearMonth();

    const monthMinutes = assistRecords
        .filter(r => (r.yearMonth || '') === currentYearMonth)
        .reduce((sum, item) => {
            return sum + Number(item.minutes || 0);
        }, 0);

    const totalHours = totalMinutes / 60;
    const monthHours = monthMinutes / 60;

    $('#totalHours').text(totalHours.toFixed(1));
    $('#monthHours').text(monthHours.toFixed(1));
    $('#monthHoursProgressText').html(`${monthHours.toFixed(1)}<small class="ms-1">小時</small> / 12 <small class="ms-1">小時</small>`);

    const progressPercent = Math.min((monthHours / MONTH_TARGET_HOURS) * 100, 100);

    $('#monthHoursProgressBar')
        .css('width', `${progressPercent}%`)
        .text(`${progressPercent.toFixed(0)}%`)
        .attr('aria-valuenow', progressPercent.toFixed(0));
}

function renderRecordHeader() {
    $('#recordTitle').html(`<i class="fa-solid fa-table-list"></i> 出勤紀錄（${getCurrentFilterYearMonth()}）`);
}

function renderRecords() {
    const user = getCurrentUser();
    if (!user) return;

    const filterYearMonth = getCurrentFilterYearMonth();

    const rows = records
        .filter(r => r.name === user.name && r.yearMonth === filterYearMonth)
        .slice()
        .reverse();

    const $tbody = $('#recordTableBody');
    $tbody.empty();

    if (rows.length === 0) {
        $('#recordTableWrap').addClass('d-none');
        $('#emptyText').removeClass('d-none');
        return;
    }

    $('#recordTableWrap').removeClass('d-none');
    $('#emptyText').addClass('d-none');

    rows.forEach(item => {
        $tbody.append(`
            <tr>
                <td>${escapeHtml(item.shiftType || '')}</td>
                <td>${escapeHtml(item.checkInDate || '')}</td>
                <td>${escapeHtml(item.checkInTime || '')}</td>
                <td>${escapeHtml(item.checkOutDate || '')}</td>
                <td>${escapeHtml(item.checkOutTime || '')}</td>
                <td>${item.minutes !== null && item.minutes !== undefined ? `${formatHoursByMinutes(item.minutes)}<small class="ms-1 text-muted">小時</small>` : '-'}</td>
            </tr>
        `);
    });
}

function renderAll() {
    const user = getCurrentUser();

    if (!user) {
        $('#navDepartment').text('');
        $('#navTitle').text('');
        $('#navName').text('');
        $('#recordTableBody').empty();
        $('#recordTableWrap').addClass('d-none');
        $('#emptyText').removeClass('d-none');
        $('#totalHours').text('0.0');
        $('#monthHours').text('0.0');
        $('#monthHoursProgressText').html(`0.0<small class="ms-1">小時</small> / 12 <small class="ms-1">小時</small>`);
        $('#monthHoursProgressBar').css('width', '0%').text('0%').attr('aria-valuenow', '0');
        return;
    }

    renderNavbar();
    renderLocationStatus(locationInfo);
    renderReminderStatus();
    renderRecordHeader();
    calculateSummary();
    renderRecords();
}

function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function combineDateTime(dateText, timeText) {
    return new Date(`${dateText}T${timeText}:00`);
}

function validateGpsRequired(shiftType) {
    if (shiftType === '公差勤務') return true;

    if (!locationInfo || !locationInfo.success) {
        alert('尚未完成定位，請開啟 Wi-Fi 後再重新定位。');
        return false;
    }

    if (!locationInfo.inRange) {
        alert('目前位置不在指定範圍內，無法送出。');
        return false;
    }

    return true;
}

function setupSignatureCanvas() {
    signatureCanvas = document.getElementById('signatureCanvas');
    signatureCtx = signatureCanvas.getContext('2d');

    resizeSignatureCanvas();

    signatureCanvas.addEventListener('mousedown', startDraw);
    signatureCanvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', endDraw);

    signatureCanvas.addEventListener('touchstart', startDrawTouch, { passive: false });
    signatureCanvas.addEventListener('touchmove', drawTouch, { passive: false });
    signatureCanvas.addEventListener('touchend', endDraw, { passive: false });

    window.addEventListener('resize', function () {
        if (document.getElementById('checkOutModal').classList.contains('show')) {
            const backup = hasSignature ? getSignatureDataUrl() : '';
            resizeSignatureCanvas();
            if (backup) {
                restoreSignatureFromDataUrl(backup);
                hasSignature = true;
            }
        }
    });
}

function resizeSignatureCanvas() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = signatureCanvas.getBoundingClientRect();

    signatureCanvas.width = Math.max(1, Math.floor(rect.width * ratio));
    signatureCanvas.height = Math.max(1, Math.floor(rect.height * ratio));

    signatureCtx = signatureCanvas.getContext('2d');
    signatureCtx.setTransform(1, 0, 0, 1, 0, 0);
    signatureCtx.scale(ratio, ratio);
    signatureCtx.lineWidth = 2;
    signatureCtx.lineCap = 'round';
    signatureCtx.lineJoin = 'round';
    signatureCtx.strokeStyle = '#111';
    signatureCtx.fillStyle = '#fff';
    signatureCtx.fillRect(0, 0, rect.width, rect.height);
}

function getCanvasPoint(event) {
    const rect = signatureCanvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function startDraw(event) {
    isDrawing = true;
    const point = getCanvasPoint(event);
    signatureCtx.beginPath();
    signatureCtx.moveTo(point.x, point.y);
}

function draw(event) {
    if (!isDrawing) return;
    const point = getCanvasPoint(event);
    signatureCtx.lineTo(point.x, point.y);
    signatureCtx.stroke();
    hasSignature = true;
}

function startDrawTouch(event) {
    event.preventDefault();
    if (!event.touches || event.touches.length === 0) return;
    startDraw(event.touches[0]);
}

function drawTouch(event) {
    event.preventDefault();
    if (!event.touches || event.touches.length === 0) return;
    draw(event.touches[0]);
}

function endDraw() {
    isDrawing = false;
}

function clearSignature() {
    const rect = signatureCanvas.getBoundingClientRect();
    signatureCtx.clearRect(0, 0, rect.width, rect.height);
    signatureCtx.fillStyle = '#fff';
    signatureCtx.fillRect(0, 0, rect.width, rect.height);
    hasSignature = false;
}

function restoreSignatureFromDataUrl(dataUrl) {
    const img = new Image();
    img.onload = function () {
        const rect = signatureCanvas.getBoundingClientRect();
        signatureCtx.fillStyle = '#fff';
        signatureCtx.fillRect(0, 0, rect.width, rect.height);
        signatureCtx.drawImage(img, 0, 0, rect.width, rect.height);
    };
    img.src = dataUrl;
}

function getSignatureDataUrl() {
    return hasSignature ? signatureCanvas.toDataURL('image/png') : '';
}

function saveLastSelectedUser(name) {
    localStorage.setItem(LAST_USER_STORAGE_KEY, name);
}

function getLastSelectedUser() {
    return localStorage.getItem(LAST_USER_STORAGE_KEY) || '';
}

function openSwitchUserModal() {
    if (isBusy()) {
        return;
    }

    if (!staffList.length) return;

    const user = getCurrentUser();
    const currentName = user ? user.name : (getLastSelectedUser() || staffList[0].name);

    $('#switchName').val(currentName);
    syncUserInfoByName('#switchName', '#switchUnit', '#switchTitle');
    switchUserModalInstance.show();
}

function applySwitchUser(event) {
    event.preventDefault();

    const selectedName = $('#switchName').val();
    const index = findUserIndexByName(selectedName);

    if (index < 0) {
        alert('找不到使用者');
        return;
    }

    currentUserIndex = index;
    saveLastSelectedUser(selectedName);
    renderAll();
    switchUserModalInstance.hide();
}

function openCheckInModal() {
    if (isBusy()) {
        return;
    }

    const user = getCurrentUser();
    if (!user) {
        openSwitchUserModal();
        return;
    }

    const current = getCurrentDateAndRoundedHalfHour();

    $('#checkInShiftType').val('協勤');
    $('#checkInName').val(user.name);
    syncTitleByName('#checkInName', '#checkInTitle');
    $('#checkInDate').val(current.date);
    $('#checkInTime').val(current.time);

    checkInModalInstance.show();
}

function openCheckOutModal() {
    if (isBusy()) {
        return;
    }

    const user = getCurrentUser();
    if (!user) {
        openSwitchUserModal();
        return;
    }

    const openRecord = getLatestOpenRecord(user.name);

    if (!openRecord) {
        alert('目前沒有可簽退的未完成紀錄。');
        return;
    }

    $('#checkOutShiftType').val(openRecord.shiftType || '協勤');
    $('#checkOutDutyStatus').val(openRecord.dutyStatus || '出勤');
    $('#checkOutName').val(openRecord.name || user.name);
    syncTitleByName('#checkOutName', '#checkOutTitle');
    $('#checkOutDate').val(openRecord.checkInDate || formatDate(new Date()));
    $('#checkOutTime').val(openRecord.checkInTime || '08:00');
    $('#checkOutWorkContent').val(openRecord.workContent || '');

    toggleCheckOutDutyStatus();
    toggleCheckOutWorkContent();
    checkOutModalInstance.show();
}

async function submitCheckIn(event) {
    event.preventDefault();

    if (isBusy()) {
        return;
    }

    const shiftType = $('#checkInShiftType').val();
    const name = $('#checkInName').val();
    const checkInDate = $('#checkInDate').val();
    const checkInTime = $('#checkInTime').val();

    if (!checkInDate || !checkInTime || !name) {
        alert('請完整填寫簽到資料。');
        return;
    }

    if (hasOpenRecord(name)) {
        alert('此姓名已有未簽退紀錄。');
        return;
    }

    if (!validateGpsRequired(shiftType)) {
        return;
    }

    try {
        const result = await withLoading('簽到中', '正在送出簽到資料，請稍候...', async () => {
            return await AttendanceApi.checkIn({
                name,
                shiftType,
                checkInDate,
                checkInTime
            });
        });

        records.push(result.record);

        const index = findUserIndexByName(name);
        if (index >= 0) {
            currentUserIndex = index;
            saveLastSelectedUser(name);
        }

        renderAll();
        checkInModalInstance.hide();
        alert('簽到成功');
    } catch (error) {
        alert(error.message || '簽到失敗');
    }
}

async function submitCheckOut(event) {
    event.preventDefault();

    if (isBusy()) {
        return;
    }

    const name = $('#checkOutName').val();
    const openRecord = getLatestOpenRecord(name);

    if (!openRecord) {
        alert('目前沒有可簽退的未完成紀錄。');
        return;
    }

    const shiftType = $('#checkOutShiftType').val();
    const dutyStatus = shiftType === '協勤' ? ($('#checkOutDutyStatus').val() || '出勤') : '';
    const checkOutDate = $('#checkOutDate').val();
    const checkOutTime = $('#checkOutTime').val();
    const workContent = $('#checkOutWorkContent').val().trim();
    const signatureDataUrl = getSignatureDataUrl();

    if (!checkOutDate || !checkOutTime || !name) {
        alert('請完整填寫簽退資料。');
        return;
    }

    if (shouldRequireWorkContent(shiftType, dutyStatus) && !workContent) {
        alert('請填寫工作內容。');
        return;
    }

    if (!signatureDataUrl) {
        alert('請先完成手寫簽名。');
        return;
    }

    if (!validateGpsRequired(shiftType)) {
        return;
    }

    const startDateTime = combineDateTime(openRecord.checkInDate, openRecord.checkInTime);
    const endDateTime = combineDateTime(checkOutDate, checkOutTime);

    if (endDateTime < startDateTime) {
        alert('簽退時間不得早於簽到時間。');
        return;
    }

    try {
        const result = await withLoading('簽退中', '正在送出簽退資料，請稍候...', async () => {
            return await AttendanceApi.checkOut({
                name,
                shiftType,
                checkOutDate,
                checkOutTime,
                workContent
            });
        });

        const target = getLatestOpenRecord(name);
        if (target) {
            target.shiftType = result.record.shiftType;
            target.checkOutDate = result.record.checkOutDate;
            target.checkOutTime = result.record.checkOutTime;
            target.minutes = result.record.minutes;
            target.workContent = result.record.workContent || '';
        }

        const index = findUserIndexByName(name);
        if (index >= 0) {
            currentUserIndex = index;
            saveLastSelectedUser(name);
        }

        renderAll();
        checkOutModalInstance.hide();
        clearSignature();
        alert('簽退成功');
    } catch (error) {
        alert(error.message || '簽退失敗');
    }
}

async function loadInitData() {
    try {
        const result = await withLoading('資料讀取中', '正在載入人員與出勤資料，請稍候...', async () => {
            return await AttendanceApi.getInitData();
        });

        staffList = result.data.staffList || [];
        records = result.data.records || [];

        if (!staffList.length) {
            alert('人員資料工作表沒有資料');
            return;
        }

        populateNameOptions($('#switchName'));
        populateNameOptions($('#checkInName'));
        populateNameOptions($('#checkOutName'));

        const lastName = getLastSelectedUser();
        const lastIndex = findUserIndexByName(lastName);

        if (lastIndex >= 0) {
            currentUserIndex = lastIndex;
        } else {
            currentUserIndex = -1;
        }

        if (currentUserIndex >= 0) {
            const user = getCurrentUser();
            $('#switchName').val(user.name);
            syncUserInfoByName('#switchName', '#switchUnit', '#switchTitle');
            $('#checkInName').val(user.name);
            $('#checkOutName').val(user.name);
            syncTitleByName('#checkInName', '#checkInTitle');
            syncTitleByName('#checkOutName', '#checkOutTitle');
            renderAll();
        } else {
            renderAll();
            openSwitchUserModal();
        }
    } catch (error) {
        alert(error.message || '初始化失敗');
    }
}

// ===== PWA =====
function isStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function setupPwaInstallPrompt() {
    const $btnInstallApp = $('#btnInstallApp');

    window.addEventListener('beforeinstallprompt', function (event) {
        event.preventDefault();
        deferredInstallPrompt = event;

        if (!isStandaloneMode()) {
            $btnInstallApp.removeClass('d-none');
        }
    });

    window.addEventListener('appinstalled', function () {
        deferredInstallPrompt = null;
        $btnInstallApp.addClass('d-none');
    });

    $btnInstallApp.on('click', async function () {
        if (isBusy()) {
            return;
        }

        if (!deferredInstallPrompt) {
            alert('目前無法顯示安裝提示，請使用 Chrome 或 Edge 並透過 HTTPS 開啟。');
            return;
        }

        deferredInstallPrompt.prompt();
        const choiceResult = await deferredInstallPrompt.userChoice;

        if (choiceResult.outcome === 'accepted') {
            $btnInstallApp.addClass('d-none');
        }

        deferredInstallPrompt = null;
    });

    if (isStandaloneMode()) {
        $btnInstallApp.addClass('d-none');
    }
}

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    try {
        const registration = await navigator.serviceWorker.register('./sw.js');
        console.log('Service Worker registered:', registration.scope);
    } catch (error) {
        console.error('Service Worker register failed:', error);
    }
}

$(async function () {
    generateHalfHourOptions($('#checkInTime'));
    generateHalfHourOptions($('#checkOutTime'));
    $('#filterYearMonth').val(formatYearMonth(new Date()));

    switchUserModalInstance = new bootstrap.Modal(document.getElementById('switchUserModal'));
    checkInModalInstance = new bootstrap.Modal(document.getElementById('checkInModal'));
    checkOutModalInstance = new bootstrap.Modal(document.getElementById('checkOutModal'));
    loadingModalInstance = new bootstrap.Modal(document.getElementById('loadingModal'));

    setupSignatureCanvas();
    setupPwaInstallPrompt();
    await registerServiceWorker();

    updateClock();
    setInterval(updateClock, 1000);

    await loadInitData();
    await refreshLocation();

    $('#btnRefreshLocation').on('click', refreshLocation);
    $('#btnSwitchUser').on('click', openSwitchUserModal);

    $('#switchUserForm').on('submit', applySwitchUser);
    $('#switchName').on('change', function () {
        syncUserInfoByName('#switchName', '#switchUnit', '#switchTitle');
    });

    $('#btnCheckIn').on('click', openCheckInModal);
    $('#btnCheckOut').on('click', openCheckOutModal);
    $('#checkInForm').on('submit', submitCheckIn);
    $('#checkOutForm').on('submit', submitCheckOut);
    $('#filterYearMonth').on('change', renderAll);

    $('#checkInName').on('change', function () {
        syncTitleByName('#checkInName', '#checkInTitle');
    });

    $('#checkOutName').on('change', function () {
        syncTitleByName('#checkOutName', '#checkOutTitle');
    });

    $('#checkOutShiftType').on('change', function () {
        toggleCheckOutDutyStatus();
        toggleCheckOutWorkContent();
    });

    $('#checkOutDutyStatus').on('change', function () {
        toggleCheckOutWorkContent();
    });

    $('#btnClearSignature').on('click', clearSignature);

    $('#checkOutModal').on('shown.bs.modal', function () {
        resizeSignatureCanvas();
        clearSignature();
        toggleCheckOutDutyStatus();
        toggleCheckOutWorkContent();
    });

    toggleCheckOutDutyStatus();
    toggleCheckOutWorkContent();
});
