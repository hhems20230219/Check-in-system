if (!window.AttendanceApi) {
    alert('api.js 尚未正確載入，請檢查 index.html 的 script 順序或檔案路徑。');
    throw new Error('AttendanceApi is not defined');
}

const AppState = {
    MONTH_TARGET_HOURS: 12,
    LAST_USER_STORAGE_KEY: 'attendance_last_user_name',
    staffList: [],
    records: [],
    currentUserIndex: -1,
    locationInfo: {
        success: false,
        inRange: false,
        message: '尚未取得定位'
    },
    busyCounter: 0,
    deferredInstallPrompt: null,
    signature: {
        canvas: null,
        ctx: null,
        isDrawing: false,
        hasSignature: false
    },
    modal: {
        switchUser: null,
        checkIn: null,
        checkOut: null,
        loading: null
    }
};

const Ui = {
    $btnRefreshLocation: null,
    $btnSwitchUser: null,
    $btnCheckIn: null,
    $btnCheckOut: null,
    $btnInstallApp: null,
    $loadingModalTitle: null,
    $loadingModalMessage: null,
    $locationBadge: null,
    $locationStatusMessage: null,
    $eventReminderSection: null,
    $workStatus: null,
    $navDepartment: null,
    $navTitle: null,
    $navName: null,
    $clockTime: null,
    $clockDate: null,
    $filterYearMonth: null,
    $recordTitle: null,
    $recordTableBody: null,
    $recordTableWrap: null,
    $emptyText: null,
    $totalHours: null,
    $monthHours: null,
    $monthHoursProgressText: null,
    $monthHoursProgressBar: null,
    $switchName: null,
    $switchUnit: null,
    $switchTitle: null,
    $checkInShiftType: null,
    $checkInName: null,
    $checkInTitle: null,
    $checkInDate: null,
    $checkInTime: null,
    $checkOutShiftType: null,
    $checkOutDutyStatus: null,
    $checkOutDutyStatusGroup: null,
    $checkOutName: null,
    $checkOutTitle: null,
    $checkOutDate: null,
    $checkOutTime: null,
    $checkOutWorkContent: null,
    $checkOutWorkContentGroup: null
};

function cacheDom() {
    Ui.$btnRefreshLocation = $('#btnRefreshLocation');
    Ui.$btnSwitchUser = $('#btnSwitchUser');
    Ui.$btnCheckIn = $('#btnCheckIn');
    Ui.$btnCheckOut = $('#btnCheckOut');
    Ui.$btnInstallApp = $('#btnInstallApp');

    Ui.$loadingModalTitle = $('#loadingModalTitle');
    Ui.$loadingModalMessage = $('#loadingModalMessage');

    Ui.$locationBadge = $('#locationBadge');
    Ui.$locationStatusMessage = $('#locationStatusMessage');
    Ui.$eventReminderSection = $('#eventReminderSection');
    Ui.$workStatus = $('#workStatus');

    Ui.$navDepartment = $('#navDepartment');
    Ui.$navTitle = $('#navTitle');
    Ui.$navName = $('#navName');

    Ui.$clockTime = $('#clockTime');
    Ui.$clockDate = $('#clockDate');

    Ui.$filterYearMonth = $('#filterYearMonth');
    Ui.$recordTitle = $('#recordTitle');
    Ui.$recordTableBody = $('#recordTableBody');
    Ui.$recordTableWrap = $('#recordTableWrap');
    Ui.$emptyText = $('#emptyText');

    Ui.$totalHours = $('#totalHours');
    Ui.$monthHours = $('#monthHours');
    Ui.$monthHoursProgressText = $('#monthHoursProgressText');
    Ui.$monthHoursProgressBar = $('#monthHoursProgressBar');

    Ui.$switchName = $('#switchName');
    Ui.$switchUnit = $('#switchUnit');
    Ui.$switchTitle = $('#switchTitle');

    Ui.$checkInShiftType = $('#checkInShiftType');
    Ui.$checkInName = $('#checkInName');
    Ui.$checkInTitle = $('#checkInTitle');
    Ui.$checkInDate = $('#checkInDate');
    Ui.$checkInTime = $('#checkInTime');

    Ui.$checkOutShiftType = $('#checkOutShiftType');
    Ui.$checkOutDutyStatus = $('#checkOutDutyStatus');
    Ui.$checkOutDutyStatusGroup = $('#checkOutDutyStatusGroup');
    Ui.$checkOutName = $('#checkOutName');
    Ui.$checkOutTitle = $('#checkOutTitle');
    Ui.$checkOutDate = $('#checkOutDate');
    Ui.$checkOutTime = $('#checkOutTime');
    Ui.$checkOutWorkContent = $('#checkOutWorkContent');
    Ui.$checkOutWorkContentGroup = $('#checkOutWorkContentGroup');
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

function isBusy() {
    return AppState.busyCounter > 0;
}

function setUiBusyState(disabled) {
    Ui.$btnRefreshLocation.prop('disabled', disabled);
    Ui.$btnCheckIn.prop('disabled', disabled);
    Ui.$btnCheckOut.prop('disabled', disabled);
    Ui.$btnInstallApp.prop('disabled', disabled);

    // 切換姓名不跟全局 loading 一起鎖死，避免使用者誤以為整個壞掉
    // 但切換姓名 modal 開啟時，送出按鈕本身不會用 loading modal
}

function showLoading(title = '處理中', message = '請稍候...') {
    AppState.busyCounter += 1;

    Ui.$loadingModalTitle.text(title);
    Ui.$loadingModalMessage.text(message);
    setUiBusyState(true);

    const loadingEl = document.getElementById('loadingModal');
    if (!loadingEl.classList.contains('show')) {
        AppState.modal.loading.show();
    }
}

function hideLoading() {
    AppState.busyCounter = Math.max(AppState.busyCounter - 1, 0);

    if (AppState.busyCounter === 0) {
        setUiBusyState(false);

        const loadingEl = document.getElementById('loadingModal');
        if (loadingEl.classList.contains('show')) {
            AppState.modal.loading.hide();
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

function getCurrentUser() {
    return AppState.currentUserIndex >= 0
        ? (AppState.staffList[AppState.currentUserIndex] || null)
        : null;
}

function getCurrentFilterYearMonth() {
    return Ui.$filterYearMonth.val() || formatYearMonth(new Date());
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

function getUserByName(name) {
    return AppState.staffList.find(user => user.name === name) || null;
}

function findUserIndexByName(name) {
    return AppState.staffList.findIndex(user => user.name === name);
}

function saveLastSelectedUser(name) {
    localStorage.setItem(AppState.LAST_USER_STORAGE_KEY, name);
}

function getLastSelectedUser() {
    return localStorage.getItem(AppState.LAST_USER_STORAGE_KEY) || '';
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

    AppState.staffList.forEach(user => {
        $select.append(
            `<option value="${escapeHtml(user.name)}">${escapeHtml(user.name)}</option>`
        );
    });
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

function hasOpenRecord(userName) {
    return AppState.records.some(item => item.name === userName && !item.checkOutDate && !item.checkOutTime);
}

function getLatestOpenRecord(userName) {
    for (let i = AppState.records.length - 1; i >= 0; i--) {
        const item = AppState.records[i];
        if (item.name === userName && !item.checkOutDate && !item.checkOutTime) {
            return item;
        }
    }
    return null;
}

function shouldRequireWorkContent(shiftType, dutyStatus) {
    if (shiftType === '公差勤務') return true;
    if (shiftType === '協勤' && dutyStatus !== '備勤') return true;
    return false;
}

function validateGpsRequired(shiftType) {
    if (shiftType === '公差勤務') return true;

    if (!AppState.locationInfo || !AppState.locationInfo.success) {
        alert('尚未完成定位，請開啟 Wi-Fi 後再重新定位。');
        return false;
    }

    if (!AppState.locationInfo.inRange) {
        alert('目前位置不在指定範圍內，無法送出。');
        return false;
    }

    return true;
}

function renderNavbar() {
    const user = getCurrentUser();
    if (!user) return;

    Ui.$navDepartment.text(user.unit || '');
    Ui.$navTitle.text(user.title || '');
    Ui.$navName.text(user.name || '');
}

function renderLocationStatus(data) {
    if (!data || !data.success) {
        Ui.$locationBadge
            .removeClass('text-bg-success text-bg-danger text-bg-warning')
            .addClass('text-bg-secondary')
            .text('未定位');

        Ui.$locationStatusMessage
            .removeClass('text-success text-danger')
            .addClass('text-muted')
            .text(data && data.message ? data.message : '定位失敗，請開啟 Wi-Fi 後再重新定位');
        return;
    }

    if (data.inRange) {
        Ui.$locationBadge
            .removeClass('text-bg-secondary text-bg-danger text-bg-warning')
            .addClass('text-bg-success')
            .text('定位符合');

        Ui.$locationStatusMessage
            .removeClass('text-muted text-danger')
            .addClass('text-success')
            .text(`目前位置符合範圍，緯度 ${data.latitude}，經度 ${data.longitude}，最近距離 ${Number(data.nearestDistanceMeters || 0).toFixed(0)} 公尺`);
        return;
    }

    Ui.$locationBadge
        .removeClass('text-bg-secondary text-bg-success text-bg-warning')
        .addClass('text-bg-danger')
        .text('定位不符合');

    Ui.$locationStatusMessage
        .removeClass('text-muted text-success')
        .addClass('text-danger')
        .text(`目前位置不在指定範圍內，緯度 ${data.latitude}，經度 ${data.longitude}，最近距離 ${Number(data.nearestDistanceMeters || 0).toFixed(0)} 公尺`);
}

function setReminder(message) {
    if (!message) {
        Ui.$eventReminderSection.addClass('d-none');
        Ui.$workStatus.text('');
        return;
    }

    Ui.$eventReminderSection.removeClass('d-none');
    Ui.$workStatus.text(message);
}

function renderReminderStatus() {
    const user = getCurrentUser();
    if (!user) return;

    if (hasOpenRecord(user.name)) {
        setReminder('目前已有未簽退紀錄，可切換姓名查看其他人資料。');
        return;
    }

    if (!AppState.locationInfo || !AppState.locationInfo.success) {
        setReminder('尚未完成定位，請開啟 Wi-Fi 並重新定位。');
        return;
    }

    if (!AppState.locationInfo.inRange) {
        setReminder('目前定位不在指定範圍內，協勤或常年訓練將無法送出。');
        return;
    }

    setReminder('');
}

function calculateSummary() {
    const user = getCurrentUser();
    if (!user) return;

    const assistRecords = AppState.records.filter(r =>
        r.name === user.name &&
        r.minutes !== null &&
        r.shiftType === '協勤'
    );

    const totalMinutes = assistRecords.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
    const currentYearMonth = getCurrentFilterYearMonth();

    const monthMinutes = assistRecords
        .filter(r => (r.yearMonth || '') === currentYearMonth)
        .reduce((sum, item) => sum + Number(item.minutes || 0), 0);

    const totalHours = totalMinutes / 60;
    const monthHours = monthMinutes / 60;
    const progressPercent = Math.min((monthHours / AppState.MONTH_TARGET_HOURS) * 100, 100);

    Ui.$totalHours.text(totalHours.toFixed(1));
    Ui.$monthHours.text(monthHours.toFixed(1));
    Ui.$monthHoursProgressText.html(`${monthHours.toFixed(1)}<small class="ms-1">小時</small> / 12 <small class="ms-1">小時</small>`);

    Ui.$monthHoursProgressBar
        .css('width', `${progressPercent}%`)
        .text(`${progressPercent.toFixed(0)}%`)
        .attr('aria-valuenow', progressPercent.toFixed(0));
}

function renderRecordHeader() {
    Ui.$recordTitle.html(`<i class="fa-solid fa-table-list"></i> 出勤紀錄（${getCurrentFilterYearMonth()}）`);
}

function renderRecords() {
    const user = getCurrentUser();
    if (!user) return;

    const filterYearMonth = getCurrentFilterYearMonth();
    const rows = AppState.records
        .filter(r => r.name === user.name && r.yearMonth === filterYearMonth)
        .slice()
        .reverse();

    Ui.$recordTableBody.empty();

    if (rows.length === 0) {
        Ui.$recordTableWrap.addClass('d-none');
        Ui.$emptyText.removeClass('d-none');
        return;
    }

    Ui.$recordTableWrap.removeClass('d-none');
    Ui.$emptyText.addClass('d-none');

    rows.forEach(item => {
        Ui.$recordTableBody.append(`
            <tr>
                <td>${escapeHtml(item.shiftType || '')}</td>
                <td>${escapeHtml(item.checkInDate || '')}</td>
                <td>${escapeHtml(item.checkInTime || '')}</td>
                <td>${escapeHtml(item.checkOutDate || '')}</td>
                <td>${escapeHtml(item.checkOutTime || '')}</td>
                <td>${item.minutes !== null && item.minutes !== undefined
                    ? `${formatHoursByMinutes(item.minutes)}<small class="ms-1 text-muted">小時</small>`
                    : '-'}</td>
            </tr>
        `);
    });
}

function renderEmptyState() {
    Ui.$navDepartment.text('');
    Ui.$navTitle.text('');
    Ui.$navName.text('');
    Ui.$recordTableBody.empty();
    Ui.$recordTableWrap.addClass('d-none');
    Ui.$emptyText.removeClass('d-none');
    Ui.$totalHours.text('0.0');
    Ui.$monthHours.text('0.0');
    Ui.$monthHoursProgressText.html(`0.0<small class="ms-1">小時</small> / 12 <small class="ms-1">小時</small>`);
    Ui.$monthHoursProgressBar.css('width', '0%').text('0%').attr('aria-valuenow', '0');
}

function renderAll() {
    const user = getCurrentUser();

    if (!user) {
        renderEmptyState();
        return;
    }

    renderNavbar();
    renderLocationStatus(AppState.locationInfo);
    renderReminderStatus();
    renderRecordHeader();
    calculateSummary();
    renderRecords();
}

function updateClock() {
    const now = new Date();
    Ui.$clockTime.text(formatTime(now));
    Ui.$clockDate.text(formatDateDisplay(now));
}

async function refreshLocation() {
    if (isBusy()) return;

    if (!window.LocationService || typeof window.LocationService.getCurrentLocation !== 'function') {
        AppState.locationInfo = {
            success: false,
            inRange: false,
            message: '找不到定位模組 location.js，請開啟 Wi-Fi 後再試'
        };
        renderLocationStatus(AppState.locationInfo);
        renderReminderStatus();
        return;
    }

    Ui.$locationStatusMessage
        .removeClass('text-success text-danger')
        .addClass('text-muted')
        .text('定位中...');

    Ui.$locationBadge
        .removeClass('text-bg-success text-bg-danger text-bg-secondary')
        .addClass('text-bg-warning')
        .text('定位中');

    await withLoading('定位中', '正在取得目前位置，請稍候...', async () => {
        try {
            const result = await Promise.resolve(window.LocationService.getCurrentLocation());
            AppState.locationInfo = result;
        } catch (error) {
            AppState.locationInfo = {
                success: false,
                inRange: false,
                message: '定位失敗，請開啟 Wi-Fi 後再重新定位'
            };
        }

        renderLocationStatus(AppState.locationInfo);
        renderReminderStatus();
    });
}

function openSwitchUserModal() {
    if (!AppState.staffList.length) return;

    const user = getCurrentUser();
    const currentName = user ? user.name : (getLastSelectedUser() || AppState.staffList[0].name);

    Ui.$switchName.val(currentName);
    syncUserInfoByName('#switchName', '#switchUnit', '#switchTitle');
    AppState.modal.switchUser.show();
}

function applySwitchUser(event) {
    event.preventDefault();

    const selectedName = Ui.$switchName.val();
    const index = findUserIndexByName(selectedName);

    if (index < 0) {
        alert('找不到使用者');
        return;
    }

    AppState.currentUserIndex = index;
    saveLastSelectedUser(selectedName);

    AppState.modal.switchUser.hide();

    // 等 modal 收起來再渲染，避免 iPhone/Safari 卡住
    setTimeout(function () {
        renderAll();
    }, 150);
}

function openCheckInModal() {
    if (isBusy()) return;

    const user = getCurrentUser();
    if (!user) {
        openSwitchUserModal();
        return;
    }

    const current = getCurrentDateAndRoundedHalfHour();

    Ui.$checkInShiftType.val('協勤');
    Ui.$checkInName.val(user.name);
    syncTitleByName('#checkInName', '#checkInTitle');
    Ui.$checkInDate.val(current.date);
    Ui.$checkInTime.val(current.time);

    AppState.modal.checkIn.show();
}

function toggleCheckOutDutyStatus() {
    const shiftType = Ui.$checkOutShiftType.val();
    const shouldShow = shiftType === '協勤';

    Ui.$checkOutDutyStatusGroup.toggleClass('d-none', !shouldShow);

    if (!shouldShow) {
        Ui.$checkOutDutyStatus.val('');
    } else if (!Ui.$checkOutDutyStatus.val()) {
        Ui.$checkOutDutyStatus.val('出勤');
    }
}

function toggleCheckOutWorkContent() {
    const shiftType = Ui.$checkOutShiftType.val();
    const dutyStatus = Ui.$checkOutDutyStatus.val() || '';
    const shouldShow = shouldRequireWorkContent(shiftType, dutyStatus);

    Ui.$checkOutWorkContentGroup.toggleClass('d-none', !shouldShow);

    if (!shouldShow) {
        Ui.$checkOutWorkContent.val('');
    }
}

function openCheckOutModal() {
    if (isBusy()) return;

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

    Ui.$checkOutShiftType.val(openRecord.shiftType || '協勤');
    Ui.$checkOutDutyStatus.val(openRecord.dutyStatus || '出勤');
    Ui.$checkOutName.val(openRecord.name || user.name);
    syncTitleByName('#checkOutName', '#checkOutTitle');
    Ui.$checkOutDate.val(openRecord.checkInDate || formatDate(new Date()));
    Ui.$checkOutTime.val(openRecord.checkInTime || '08:00');
    Ui.$checkOutWorkContent.val(openRecord.workContent || '');

    toggleCheckOutDutyStatus();
    toggleCheckOutWorkContent();
    AppState.modal.checkOut.show();
}

async function submitCheckIn(event) {
    event.preventDefault();
    if (isBusy()) return;

    const shiftType = Ui.$checkInShiftType.val();
    const name = Ui.$checkInName.val();
    const checkInDate = Ui.$checkInDate.val();
    const checkInTime = Ui.$checkInTime.val();

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
            return await window.AttendanceApi.checkIn({
                name,
                shiftType,
                checkInDate,
                checkInTime
            });
        });

        AppState.records.push(result.record);

        const index = findUserIndexByName(name);
        if (index >= 0) {
            AppState.currentUserIndex = index;
            saveLastSelectedUser(name);
        }

        AppState.modal.checkIn.hide();
        renderAll();
        alert('簽到成功');
    } catch (error) {
        alert(error.message || '簽到失敗');
    }
}

async function submitCheckOut(event) {
    event.preventDefault();
    if (isBusy()) return;

    const name = Ui.$checkOutName.val();
    const openRecord = getLatestOpenRecord(name);

    if (!openRecord) {
        alert('目前沒有可簽退的未完成紀錄。');
        return;
    }

    const shiftType = Ui.$checkOutShiftType.val();
    const dutyStatus = shiftType === '協勤' ? (Ui.$checkOutDutyStatus.val() || '出勤') : '';
    const checkOutDate = Ui.$checkOutDate.val();
    const checkOutTime = Ui.$checkOutTime.val();
    const workContent = Ui.$checkOutWorkContent.val().trim();
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
            return await window.AttendanceApi.checkOut({
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
            AppState.currentUserIndex = index;
            saveLastSelectedUser(name);
        }

        AppState.modal.checkOut.hide();
        clearSignature();
        renderAll();
        alert('簽退成功');
    } catch (error) {
        alert(error.message || '簽退失敗');
    }
}

async function loadInitData() {
    const result = await withLoading('資料讀取中', '正在載入人員與出勤資料，請稍候...', async () => {
        return await window.AttendanceApi.getInitData();
    });

    AppState.staffList = result.data.staffList || [];
    AppState.records = result.data.records || [];

    if (!AppState.staffList.length) {
        alert('人員資料工作表沒有資料');
        return;
    }

    populateNameOptions(Ui.$switchName);
    populateNameOptions(Ui.$checkInName);
    populateNameOptions(Ui.$checkOutName);

    const lastName = getLastSelectedUser();
    const lastIndex = findUserIndexByName(lastName);

    AppState.currentUserIndex = lastIndex >= 0 ? lastIndex : -1;

    if (AppState.currentUserIndex >= 0) {
        const user = getCurrentUser();
        Ui.$switchName.val(user.name);
        syncUserInfoByName('#switchName', '#switchUnit', '#switchTitle');

        Ui.$checkInName.val(user.name);
        Ui.$checkOutName.val(user.name);
        syncTitleByName('#checkInName', '#checkInTitle');
        syncTitleByName('#checkOutName', '#checkOutTitle');

        renderAll();
    } else {
        renderAll();
        openSwitchUserModal();
    }
}

function setupSignatureCanvas() {
    AppState.signature.canvas = document.getElementById('signatureCanvas');
    AppState.signature.ctx = AppState.signature.canvas.getContext('2d');

    resizeSignatureCanvas();

    AppState.signature.canvas.addEventListener('mousedown', startDraw);
    AppState.signature.canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', endDraw);

    AppState.signature.canvas.addEventListener('touchstart', startDrawTouch, { passive: false });
    AppState.signature.canvas.addEventListener('touchmove', drawTouch, { passive: false });
    AppState.signature.canvas.addEventListener('touchend', endDraw, { passive: false });

    window.addEventListener('resize', function () {
        const checkOutModal = document.getElementById('checkOutModal');
        if (checkOutModal.classList.contains('show')) {
            const backup = AppState.signature.hasSignature ? getSignatureDataUrl() : '';
            resizeSignatureCanvas();

            if (backup) {
                restoreSignatureFromDataUrl(backup);
                AppState.signature.hasSignature = true;
            }
        }
    });
}

function resizeSignatureCanvas() {
    const canvas = AppState.signature.canvas;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();

    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));

    AppState.signature.ctx = canvas.getContext('2d');
    AppState.signature.ctx.setTransform(1, 0, 0, 1, 0, 0);
    AppState.signature.ctx.scale(ratio, ratio);
    AppState.signature.ctx.lineWidth = 2;
    AppState.signature.ctx.lineCap = 'round';
    AppState.signature.ctx.lineJoin = 'round';
    AppState.signature.ctx.strokeStyle = '#111';
    AppState.signature.ctx.fillStyle = '#fff';
    AppState.signature.ctx.fillRect(0, 0, rect.width, rect.height);
}

function getCanvasPoint(event) {
    const rect = AppState.signature.canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function startDraw(event) {
    AppState.signature.isDrawing = true;
    const point = getCanvasPoint(event);
    AppState.signature.ctx.beginPath();
    AppState.signature.ctx.moveTo(point.x, point.y);
}

function draw(event) {
    if (!AppState.signature.isDrawing) return;

    const point = getCanvasPoint(event);
    AppState.signature.ctx.lineTo(point.x, point.y);
    AppState.signature.ctx.stroke();
    AppState.signature.hasSignature = true;
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
    AppState.signature.isDrawing = false;
}

function clearSignature() {
    const rect = AppState.signature.canvas.getBoundingClientRect();
    AppState.signature.ctx.clearRect(0, 0, rect.width, rect.height);
    AppState.signature.ctx.fillStyle = '#fff';
    AppState.signature.ctx.fillRect(0, 0, rect.width, rect.height);
    AppState.signature.hasSignature = false;
}

function restoreSignatureFromDataUrl(dataUrl) {
    const img = new Image();
    img.onload = function () {
        const rect = AppState.signature.canvas.getBoundingClientRect();
        AppState.signature.ctx.fillStyle = '#fff';
        AppState.signature.ctx.fillRect(0, 0, rect.width, rect.height);
        AppState.signature.ctx.drawImage(img, 0, 0, rect.width, rect.height);
    };
    img.src = dataUrl;
}

function getSignatureDataUrl() {
    return AppState.signature.hasSignature
        ? AppState.signature.canvas.toDataURL('image/png')
        : '';
}

function isStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function setupPwaInstallPrompt() {
    window.addEventListener('beforeinstallprompt', function (event) {
        event.preventDefault();
        AppState.deferredInstallPrompt = event;

        if (!isStandaloneMode()) {
            Ui.$btnInstallApp.removeClass('d-none');
        }
    });

    window.addEventListener('appinstalled', function () {
        AppState.deferredInstallPrompt = null;
        Ui.$btnInstallApp.addClass('d-none');
    });

    Ui.$btnInstallApp.on('click', async function () {
        if (!AppState.deferredInstallPrompt || isBusy()) {
            if (!AppState.deferredInstallPrompt) {
                alert('目前無法顯示安裝提示，請使用 Chrome 或 Edge 並透過 HTTPS 開啟。');
            }
            return;
        }

        AppState.deferredInstallPrompt.prompt();
        const choiceResult = await AppState.deferredInstallPrompt.userChoice;

        if (choiceResult.outcome === 'accepted') {
            Ui.$btnInstallApp.addClass('d-none');
        }

        AppState.deferredInstallPrompt = null;
    });

    if (isStandaloneMode()) {
        Ui.$btnInstallApp.addClass('d-none');
    }
}

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    try {
        const registration = await navigator.serviceWorker.register('./sw.js');
        console.log('Service Worker registered:', registration.scope);
    } catch (error) {
        console.error('Service Worker register failed:', error);
    }
}

function bindEvents() {
    Ui.$btnRefreshLocation.on('click', refreshLocation);
    Ui.$btnSwitchUser.on('click', openSwitchUserModal);
    Ui.$btnCheckIn.on('click', openCheckInModal);
    Ui.$btnCheckOut.on('click', openCheckOutModal);

    $('#switchUserForm').on('submit', applySwitchUser);
    Ui.$switchName.on('change', function () {
        syncUserInfoByName('#switchName', '#switchUnit', '#switchTitle');
    });

    $('#checkInForm').on('submit', submitCheckIn);
    $('#checkOutForm').on('submit', submitCheckOut);

    Ui.$filterYearMonth.on('change', renderAll);

    Ui.$checkInName.on('change', function () {
        syncTitleByName('#checkInName', '#checkInTitle');
    });

    Ui.$checkOutName.on('change', function () {
        syncTitleByName('#checkOutName', '#checkOutTitle');
    });

    Ui.$checkOutShiftType.on('change', function () {
        toggleCheckOutDutyStatus();
        toggleCheckOutWorkContent();
    });

    Ui.$checkOutDutyStatus.on('change', function () {
        toggleCheckOutWorkContent();
    });

    $('#btnClearSignature').on('click', clearSignature);

    $('#checkOutModal').on('shown.bs.modal', function () {
        resizeSignatureCanvas();
        clearSignature();
        toggleCheckOutDutyStatus();
        toggleCheckOutWorkContent();
    });
}

function initModals() {
    AppState.modal.switchUser = new bootstrap.Modal(document.getElementById('switchUserModal'));
    AppState.modal.checkIn = new bootstrap.Modal(document.getElementById('checkInModal'));
    AppState.modal.checkOut = new bootstrap.Modal(document.getElementById('checkOutModal'));
    AppState.modal.loading = new bootstrap.Modal(document.getElementById('loadingModal'));
}

async function initializeApp() {
    cacheDom();

    Ui.$filterYearMonth.val(formatYearMonth(new Date()));
    generateHalfHourOptions(Ui.$checkInTime);
    generateHalfHourOptions(Ui.$checkOutTime);

    initModals();
    setupSignatureCanvas();
    setupPwaInstallPrompt();
    bindEvents();

    updateClock();
    setInterval(updateClock, 1000);

    await registerServiceWorker();
    await loadInitData();
    await refreshLocation();

    toggleCheckOutDutyStatus();
    toggleCheckOutWorkContent();
}

$(async function () {
    try {
        await initializeApp();
    } catch (error) {
        console.error(error);
        alert(error.message || '系統初始化失敗');
    }
});
