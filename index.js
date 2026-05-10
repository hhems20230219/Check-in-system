/* =========================================================
   01. 系統設定與全域變數
========================================================= */

const STORAGE_KEY_USER = 'xinxing_current_user';
const STORAGE_KEY_RECORDS = 'xinxing_attendance_records';

const DEFAULT_EVENT_LOCATION = '高雄市新興區中正三路3號';

const MONTHLY_DUTY_HOUR_TARGET = 4;
const QUARTER_DUTY_HOUR_TARGET = 12;
const ANNUAL_TRAINING_COUNT_TARGET = 12;
const LOCATION_ALLOWED_RADIUS_METERS = 150;

const ALLOWED_LOCATIONS = [
    { name: '新興分隊', lat: 22.630688391448498, lng: 120.31124462521876 },
    { name: '吉林街', lat: 22.644543097907132, lng: 120.30654986729891 },
    { name: '日月光K11', lat: 22.722343421322815, lng: 120.30472881575443 }
];

const STAFF_LIST = [
    { idNumber: 'A123456789', unit: '新興分隊', title: '隊員', name: '王小明' },
    { idNumber: 'B123456789', unit: '新興分隊', title: '隊員', name: '陳小華' },
    { idNumber: 'C123456789', unit: '新興分隊', title: '小隊長', name: '林志強' }
];

let currentUser = null;
let records = [];
let recordDataTable = null;

let isSigning = false;
let hasSignature = false;

let locationState = {
    loaded: false,
    allowed: false,
    placeName: '',
    distanceMeters: null,
    latitude: null,
    longitude: null,
    message: '尚未定位。'
};


/* =========================================================
   02. 系統初始化
========================================================= */

$(function () {
    loadDataFromStorage();
    initStaffOptions();
    initDefaultDateTime();
    initQueryMonth();
    bindEvents();
    startClock();
    renderCurrentUser();
    renderLocationStatus();
    renderRecordsTable();
    initSignatureCanvas();

    refreshLocation();
    updateInitialStatus();
    showUserModalIfNoCurrentUser();
});


/* =========================================================
   03. 事件綁定
========================================================= */

function bindEvents() {
    $('#btnApplyUser').on('click', applyUser);
    $('#btnCheckIn').on('click', checkIn);
    $('#btnCheckOut').on('click', checkOut);
    $('#btnClearSignature').on('click', clearSignature);
    $('#btnRefreshLocation').on('click', refreshLocation);

    $('#queryMonth').on('change', renderRecordsTable);

    $('#userName').on('change', function () {
        syncUserModalByName($(this).val());
    });

    $('#checkInName').on('change', function () {
        syncAttendanceModalByName($(this).val(), 'checkIn');
    });

    $('#checkOutName').on('change', function () {
        syncAttendanceModalByName($(this).val(), 'checkOut');
    });

    $('#checkInDutyKind').on('change', handleCheckInDutyKindChange);
    $('#checkOutDutyKind').on('change', handleCheckOutDutyKindChange);
    $('#checkOutServiceType').on('change', handleCheckOutServiceTypeChange);

    $('#checkInModal').on('shown.bs.modal', function () {
        handleCheckInDutyKindChange();
        updateCheckInLocationAlert();
    });

    $('#checkOutModal').on('shown.bs.modal', function () {
        prepareCheckOutModal();
        resizeSignatureCanvas();
        clearSignature();
    });
}


/* =========================================================
   04. LocalStorage 資料處理
========================================================= */

function loadDataFromStorage() {
    const savedUser = localStorage.getItem(STORAGE_KEY_USER);
    const savedRecords = localStorage.getItem(STORAGE_KEY_RECORDS);

    if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        const matchedUser = getUserByName(parsedUser.name);

        if (matchedUser) {
            currentUser = matchedUser;
        }
    }

    if (savedRecords) {
        records = JSON.parse(savedRecords);
    }
}

function saveCurrentUser() {
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
}

function saveRecords() {
    localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(records));
}


/* =========================================================
   05. 使用者資料處理
========================================================= */

function initStaffOptions() {
    const placeholder = '<option value="">請選擇</option>';

    const options = STAFF_LIST.map(user => {
        return `<option value="${escapeHtml(user.name)}">${escapeHtml(user.name)}</option>`;
    }).join('');

    $('#userName').html(placeholder + options);
    $('#checkInName').html(placeholder + options);
    $('#checkOutName').html(placeholder + options);
}

function updateInitialStatus() {
    if (currentUser) {
        setStatus('目前使用者：' + currentUser.name + '，可以進行簽到或簽退。', 'success');
    } else {
        setStatus('請先選擇使用者後再進行簽到或簽退。', 'warning');
    }
}

function showUserModalIfNoCurrentUser() {
    if (currentUser) {
        return;
    }

    const userModal = new bootstrap.Modal(document.getElementById('userModal'), {
        backdrop: 'static',
        keyboard: false
    });

    userModal.show();
}

function applyUser() {
    const selectedName = $('#userName').val();
    const selectedUser = getUserByName(selectedName);

    if (!selectedUser) {
        setStatus('請選擇使用者。', 'warning');
        return;
    }

    currentUser = selectedUser;
    saveCurrentUser();
    renderCurrentUser();
    setStatus('已切換使用者：' + currentUser.name, 'success');

    bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
}

function renderCurrentUser() {
    if (!currentUser) {
        $('#navUnit').text('-');
        $('#navTitle').text('-');
        $('#navName').text('-');

        $('#userUnit').val('');
        $('#userTitle').val('');
        $('#userName').val('');

        $('#checkInName').val('');
        $('#checkOutName').val('');
        $('#checkInUnit').val('');
        $('#checkInTitle').val('');
        $('#checkOutUnit').val('');
        $('#checkOutTitle').val('');

        return;
    }

    $('#navUnit').text(currentUser.unit);
    $('#navTitle').text(currentUser.title);
    $('#navName').text(currentUser.name);

    $('#userUnit').val(currentUser.unit);
    $('#userTitle').val(currentUser.title);
    $('#userName').val(currentUser.name);

    $('#checkInName').val(currentUser.name);
    $('#checkOutName').val(currentUser.name);

    syncAttendanceModalByName(currentUser.name, 'checkIn');
    syncAttendanceModalByName(currentUser.name, 'checkOut');
}

function syncUserModalByName(name) {
    const user = getUserByName(name);

    $('#userUnit').val(user ? user.unit : '');
    $('#userTitle').val(user ? user.title : '');
}

function syncAttendanceModalByName(name, modalType) {
    const user = getUserByName(name);

    if (modalType === 'checkIn') {
        $('#checkInUnit').val(user ? user.unit : '');
        $('#checkInTitle').val(user ? user.title : '');
    }

    if (modalType === 'checkOut') {
        $('#checkOutUnit').val(user ? user.unit : '');
        $('#checkOutTitle').val(user ? user.title : '');
    }
}

function getUserByName(name) {
    return STAFF_LIST.find(x => x.name === name);
}


/* =========================================================
   06. 定位處理
========================================================= */

function refreshLocation() {
    if (!navigator.geolocation) {
        locationState.loaded = true;
        locationState.allowed = false;
        locationState.message = '此瀏覽器不支援定位。';

        renderLocationStatus();
        updateCheckInLocationAlert();
        return;
    }

    $('#locationText').text('定位中...');

    navigator.geolocation.getCurrentPosition(
        function (position) {
            updateLocationState(position.coords.latitude, position.coords.longitude);
            renderLocationStatus();
            updateCheckInLocationAlert();
        },
        function () {
            locationState.loaded = true;
            locationState.allowed = false;
            locationState.message = '定位失敗，請確認瀏覽器定位權限。';

            renderLocationStatus();
            updateCheckInLocationAlert();
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

function updateLocationState(latitude, longitude) {
    const nearest = getNearestAllowedLocation(latitude, longitude);

    locationState = {
        loaded: true,
        allowed: nearest.distanceMeters <= LOCATION_ALLOWED_RADIUS_METERS,
        placeName: nearest.name,
        distanceMeters: nearest.distanceMeters,
        latitude: latitude,
        longitude: longitude,
        message: ''
    };

    locationState.message = locationState.allowed
        ? `定位成功：${nearest.name}，距離約 ${Math.round(nearest.distanceMeters)} 公尺。`
        : `目前不在允許範圍內，最近地點：${nearest.name}，距離約 ${Math.round(nearest.distanceMeters)} 公尺。`;
}

function getNearestAllowedLocation(latitude, longitude) {
    let nearest = null;

    ALLOWED_LOCATIONS.forEach(location => {
        const distanceMeters = calculateDistanceMeters(latitude, longitude, location.lat, location.lng);

        if (!nearest || distanceMeters < nearest.distanceMeters) {
            nearest = {
                name: location.name,
                distanceMeters: distanceMeters
            };
        }
    });

    return nearest;
}

function isLocationRequired(dutyKind) {
    return dutyKind === '協勤' || dutyKind === '常年訓練';
}

function validateLocationForDuty(dutyKind) {
    if (!isLocationRequired(dutyKind)) {
        return true;
    }

    if (!locationState.loaded) {
        setStatus('此勤務需要定位，請先按「重新定位」。', 'warning');
        updateCheckInLocationAlert();
        return false;
    }

    if (!locationState.allowed) {
        setStatus('目前不在允許定位範圍內，無法送出。', 'warning');
        updateCheckInLocationAlert();
        return false;
    }

    return true;
}

function renderLocationStatus() {
    const textClass = locationState.loaded && locationState.allowed
        ? 'text-success'
        : 'text-secondary';

    $('#locationText')
        .removeClass()
        .addClass(textClass)
        .text(locationState.message);
}

function updateCheckInLocationAlert() {
    const dutyKind = $('#checkInDutyKind').val();

    if (!isLocationRequired(dutyKind)) {
        $('#checkInLocationAlert').addClass('d-none');
        return;
    }

    if (!locationState.loaded) {
        $('#checkInLocationAlert')
            .removeClass('d-none alert-success alert-danger')
            .addClass('alert-warning')
            .html('<i class="fa-solid fa-triangle-exclamation me-1"></i>此勤務需要定位，請先按「重新定位」。');
        return;
    }

    if (!locationState.allowed) {
        $('#checkInLocationAlert')
            .removeClass('d-none alert-success alert-warning')
            .addClass('alert-danger')
            .html('<i class="fa-solid fa-circle-xmark me-1"></i>目前不在允許定位範圍內，無法送出。');
        return;
    }

    $('#checkInLocationAlert')
        .removeClass('d-none alert-warning alert-danger')
        .addClass('alert-success')
        .html('<i class="fa-solid fa-circle-check me-1"></i>定位已符合勤務範圍，可以送出。');
}

function calculateDistanceMeters(lat1, lng1, lat2, lng2) {
    const earthRadiusMeters = 6371000;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusMeters * c;
}

function toRadians(value) {
    return value * Math.PI / 180;
}


/* =========================================================
   07. 日期時間選單處理
========================================================= */

function initDefaultDateTime() {
    const today = formatDateDash(new Date());
    const nearestTime = getNearestHalfHourTime(new Date());

    buildHalfHourOptions('#checkInTime');
    buildHalfHourOptions('#checkOutTime');

    $('#checkInDate').val(today);
    $('#checkOutDate').val(today);
    $('#checkInTime').val(nearestTime);
    $('#checkOutTime').val(nearestTime);

    $('#checkOutDutyKind').val('協勤');
    $('#checkOutServiceType').val('出勤');

    handleCheckInDutyKindChange();
    handleCheckOutDutyKindChange();
}

function initQueryMonth() {
    $('#queryMonth').val(formatMonthValue(new Date()));
}

function buildHalfHourOptions(selector) {
    const select = $(selector);
    select.empty();

    for (let hour = 0; hour < 24; hour++) {
        const h = String(hour).padStart(2, '0');
        select.append(`<option value="${h}:00">${h}:00</option>`);
        select.append(`<option value="${h}:30">${h}:30</option>`);
    }
}

function getNearestHalfHourTime(date) {
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = date.getMinutes() < 30 ? '00' : '30';

    return `${hour}:${minute}`;
}


/* =========================================================
   08. 簽到流程
========================================================= */

function handleCheckInDutyKindChange() {
    const dutyKind = $('#checkInDutyKind').val();

    if (dutyKind === '常年訓練') {
        $('#trainingStatusBlock').show();
        $('#checkInTimeBlock').hide();
        $('#checkInTime').val('');
    } else {
        $('#trainingStatusBlock').hide();
        $('#trainingStatus').val('簽到');
        $('#checkInTimeBlock').show();

        if (!$('#checkInTime').val()) {
            $('#checkInTime').val(getNearestHalfHourTime(new Date()));
        }
    }

    updateCheckInLocationAlert();
}

function checkIn() {
    const selectedName = $('#checkInName').val();
    const user = getUserByName(selectedName);
    const dutyKind = $('#checkInDutyKind').val();

    if (!user) {
        setStatus('請選擇人員。', 'warning');
        return;
    }

    if (!validateLocationForDuty(dutyKind)) {
        return;
    }

    if (dutyKind === '常年訓練' && hasMonthlyTrainingRecord(user.name, $('#checkInDate').val())) {
        setStatus('常年訓練每個月只能登記一次，已登記過簽到或請假。', 'warning');
        return;
    }

    if (hasUnfinishedRecord(user.name, dutyKind)) {
        setStatus('已有尚未簽退的紀錄，請先簽退。', 'warning');
        return;
    }

    const recordDate = $('#checkInDate').val();

    if (!recordDate) {
        setStatus('請選擇日期。', 'warning');
        return;
    }

    if (dutyKind === '常年訓練') {
        records.push(createTrainingRecord(user, recordDate));
    } else {
        const checkInTime = $('#checkInTime').val();

        if (!checkInTime) {
            setStatus('請選擇簽到時間。', 'warning');
            return;
        }

        records.push(createCheckInRecord(user, dutyKind, recordDate, checkInTime));
    }

    currentUser = user;
    saveCurrentUser();
    saveRecords();

    renderCurrentUser();
    renderRecordsTable();
    setStatus('簽到成功。', 'success');

    bootstrap.Modal.getInstance(document.getElementById('checkInModal')).hide();
}

function hasMonthlyTrainingRecord(personName, recordDate) {
    if (!recordDate) {
        return false;
    }

    const targetMonth = recordDate.substring(0, 7);

    return records.some(record =>
        record.personName === personName &&
        record.dutyKind === '常年訓練' &&
        record.checkInDate &&
        record.checkInDate.startsWith(targetMonth)
    );
}

function createTrainingRecord(user, recordDate) {
    const trainingStatus = $('#trainingStatus').val();

    return {
        dutyKind: '常年訓練',
        status: trainingStatus,
        serviceType: '',
        eventDate: recordDate,
        eventName: '常年訓練',
        eventLocation: DEFAULT_EVENT_LOCATION,
        checkInDate: recordDate,
        checkInTime: '',
        checkOutDate: '',
        checkOutTime: '',
        idNumber: user.idNumber,
        unit: user.unit,
        title: user.title,
        personName: user.name,
        workContent: '',
        signatureImage: '',
        hours: '',
        locationName: locationState.placeName || '',
        latitude: locationState.latitude || '',
        longitude: locationState.longitude || ''
    };
}

function createCheckInRecord(user, dutyKind, checkInDate, checkInTime) {
    return {
        dutyKind: dutyKind,
        status: '',
        serviceType: '',
        eventDate: checkInDate,
        eventName: '',
        eventLocation: DEFAULT_EVENT_LOCATION,
        checkInDate: checkInDate,
        checkInTime: checkInTime,
        checkOutDate: '',
        checkOutTime: '',
        idNumber: user.idNumber,
        unit: user.unit,
        title: user.title,
        personName: user.name,
        workContent: '',
        signatureImage: '',
        hours: 0,
        locationName: locationState.placeName || '',
        latitude: locationState.latitude || '',
        longitude: locationState.longitude || ''
    };
}

function hasUnfinishedRecord(personName, dutyKind) {
    if (dutyKind === '常年訓練') {
        return false;
    }

    return records.some(record =>
        record.personName === personName &&
        record.dutyKind === dutyKind &&
        !record.checkOutTime
    );
}


/* =========================================================
   09. 簽退流程
========================================================= */

function prepareCheckOutModal() {
    $('#checkOutDutyKind').val('協勤');
    $('#checkOutServiceType').val('出勤');
    handleCheckOutDutyKindChange();
}

function handleCheckOutDutyKindChange() {
    const dutyKind = $('#checkOutDutyKind').val();

    if (dutyKind === '公差勤務') {
        $('#checkOutServiceType').val('');
        $('#checkOutServiceTypeBlock').hide();
    } else {
        $('#checkOutServiceTypeBlock').show();

        if (!$('#checkOutServiceType').val()) {
            $('#checkOutServiceType').val('出勤');
        }
    }

    handleCheckOutServiceTypeChange();
}

function checkOut() {
    const selectedName = $('#checkOutName').val();
    const user = getUserByName(selectedName);
    const dutyKind = $('#checkOutDutyKind').val();

    if (!user) {
        setStatus('請選擇簽退人員。', 'warning');
        return;
    }

    const record = getLastUnfinishedCheckOutRecord(user.name, dutyKind);

    if (!record) {
        setStatus('找不到此協勤種類尚未簽退的紀錄。', 'warning');
        return;
    }

    const checkOutDate = $('#checkOutDate').val();
    const checkOutTime = $('#checkOutTime').val();

    if (!checkOutDate || !checkOutTime) {
        setStatus('請選擇簽退日期與時間。', 'warning');
        return;
    }

    if (isWorkContentRequired() && !$('#checkOutWorkContent').val().trim()) {
        setStatus('請填寫工作內容。', 'warning');
        return;
    }

    if (!hasSignature) {
        setStatus('請完成簽名後再簽退。', 'warning');
        return;
    }

    const checkInDateTime = new Date(record.checkInDate + 'T' + record.checkInTime);
    const checkOutDateTime = new Date(checkOutDate + 'T' + checkOutTime);

    if (checkOutDateTime < checkInDateTime) {
        setStatus('簽退時間不可早於簽到時間。', 'warning');
        return;
    }

    updateCheckOutRecord(record, checkOutDate, checkOutTime, checkInDateTime, checkOutDateTime);

    currentUser = user;
    saveCurrentUser();
    saveRecords();

    renderCurrentUser();
    renderRecordsTable();
    setStatus('簽退成功。', 'success');

    $('#checkOutWorkContent').val('');
    clearSignature();

    bootstrap.Modal.getInstance(document.getElementById('checkOutModal')).hide();
}

function getLastUnfinishedCheckOutRecord(personName, dutyKind) {
    return [...records].reverse().find(record =>
        record.personName === personName &&
        record.dutyKind === dutyKind &&
        !record.checkOutTime
    );
}

function updateCheckOutRecord(record, checkOutDate, checkOutTime, checkInDateTime, checkOutDateTime) {
    const diffHours = (checkOutDateTime - checkInDateTime) / 1000 / 60 / 60;

    record.serviceType = $('#checkOutDutyKind').val() === '協勤'
        ? $('#checkOutServiceType').val()
        : '';

    record.checkOutDate = checkOutDate;
    record.checkOutTime = checkOutTime;
    record.workContent = isWorkContentRequired()
        ? $('#checkOutWorkContent').val().trim()
        : '';
    record.signatureImage = document.getElementById('signatureCanvas').toDataURL('image/png');
    record.hours = Math.max(0, diffHours).toFixed(1);
}

function handleCheckOutServiceTypeChange() {
    if (isWorkContentRequired()) {
        $('#checkOutWorkContentBlock').show();
    } else {
        $('#checkOutWorkContentBlock').hide();
        $('#checkOutWorkContent').val('');
    }
}

function isWorkContentRequired() {
    const dutyKind = $('#checkOutDutyKind').val();
    const serviceType = $('#checkOutServiceType').val();

    if (dutyKind === '公差勤務') {
        return true;
    }

    return serviceType !== '待命備勤';
}


/* =========================================================
   10. DataTables 協勤紀錄表格
========================================================= */

function renderRecordsTable() {
    const queryMonth = $('#queryMonth').val();

    const filteredRecords = records.filter(record => {
        if (!queryMonth) {
            return true;
        }

        return record.checkInDate &&
            record.checkInDate.startsWith(queryMonth);
    });

    const hasAnyStatus = filteredRecords.some(record =>
        record.status &&
        String(record.status).trim() !== ''
    );

    const tableData = filteredRecords.map(record => {
        return [
            escapeHtml(record.dutyKind),
            escapeHtml(record.status || ''),
            escapeHtml(formatDateForDisplay(record.checkInDate)),
            escapeHtml(record.checkInTime || '-'),
            escapeHtml(formatDateForDisplay(record.checkOutDate)),
            escapeHtml(record.checkOutTime || '-'),
            escapeHtml(formatHoursForDisplay(record))
        ];
    });

    if (recordDataTable) {
        recordDataTable.clear();
        recordDataTable.rows.add(tableData);
        recordDataTable.column(1).visible(hasAnyStatus);
        recordDataTable.draw();
    } else {
        recordDataTable = new DataTable('#recordTable', {
            responsive: true,
            autoWidth: false,
            data: tableData,
            pageLength: 10,
            lengthChange: false,
            ordering: true,
            searching: true,
            columnDefs: [
                {
                    targets: 1,
                    visible: hasAnyStatus
                }
            ],
            layout: {
                topStart: null,
                topEnd: 'search',
                bottomStart: 'info',
                bottomEnd: 'paging'
            },
            language: {
                search: '搜尋：',
                info: '顯示第 _START_ 到 _END_ 筆，共 _TOTAL_ 筆',
                infoEmpty: '目前沒有資料',
                zeroRecords: '查無資料',
                paginate: {
                    first: '第一頁',
                    last: '最後一頁',
                    next: '下一頁',
                    previous: '上一頁'
                }
            }
        });
    }

    updateSummary();
}

function formatHoursForDisplay(record) {
    if (record.dutyKind === '常年訓練') {
        return '-';
    }

    return record.hours || '0.0';
}


/* =========================================================
   11. 時數與訓練統計
========================================================= */

function updateSummary() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = formatDateDash(now).substring(0, 7);

    const dutyRecords = records.filter(record =>
        record.dutyKind === '協勤' &&
        record.checkOutTime
    );

    const monthlyDutyRecords = dutyRecords.filter(record =>
        record.checkInDate.startsWith(currentMonth)
    );

    const quarterDutyRecords = dutyRecords.filter(record =>
        isDateInRecentThreeMonths(record.checkInDate, now)
    );

    const annualTrainingRecords = records.filter(record =>
        record.dutyKind === '常年訓練' &&
        record.status === '簽到' &&
        record.checkInDate.startsWith(String(currentYear))
    );

    const totalDutyHours = sumHours(dutyRecords);
    const monthlyDutyHours = sumHours(monthlyDutyRecords);
    const quarterDutyHours = sumHours(quarterDutyRecords);
    const annualTrainingCount = annualTrainingRecords.length;

    const monthlyPass = monthlyDutyHours >= MONTHLY_DUTY_HOUR_TARGET;
    const quarterPass = quarterDutyHours >= QUARTER_DUTY_HOUR_TARGET;
    const dutyPass = monthlyPass || quarterPass;

    $('#annualTrainingTitle').text(currentYear + ' 常年訓練');

    $('#totalDutyHours').text(totalDutyHours.toFixed(1));
    $('#monthlyDutyHoursText').text(monthlyDutyHours.toFixed(1));
    $('#quarterDutyHoursText').text(quarterDutyHours.toFixed(1));
    $('#annualTrainingCount').text(annualTrainingCount);

    updateProgressBar('#monthlyDutyProgress', monthlyDutyHours, MONTHLY_DUTY_HOUR_TARGET);
    updateProgressBar('#annualTrainingProgress', annualTrainingCount, ANNUAL_TRAINING_COUNT_TARGET);

    toggleSummaryColor('#monthlyDutyHoursText', dutyPass);
    toggleSummaryColor('#annualTrainingCount', annualTrainingCount >= ANNUAL_TRAINING_COUNT_TARGET);

    if (monthlyPass) {
        $('#quarterDutyHoursText').closest('.small').hide();
    } else {
        $('#quarterDutyHoursText').closest('.small').show();
        toggleSummaryColor('#quarterDutyHoursText', quarterPass);
    }
}

function sumHours(data) {
    return data.reduce((sum, record) => {
        return sum + Number(record.hours || 0);
    }, 0);
}

function updateProgressBar(selector, currentValue, targetValue) {
    const percent = targetValue <= 0 ? 0 : Math.min(100, Math.round((currentValue / targetValue) * 100));

    $(selector)
        .css('width', percent + '%')
        .text(percent + '%');
}

function toggleSummaryColor(selector, isSuccess) {
    $(selector)
        .removeClass('summary-success summary-danger')
        .addClass(isSuccess ? 'summary-success' : 'summary-danger');
}

function isDateInRecentThreeMonths(dateText, baseDate) {
    if (!dateText) {
        return false;
    }

    const recordDate = new Date(dateText + 'T00:00');
    const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth() - 2, 1);
    const endDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0, 23, 59, 59);

    return recordDate >= startDate && recordDate <= endDate;
}


/* =========================================================
   12. 簽名 Canvas
========================================================= */

function initSignatureCanvas() {
    const canvas = document.getElementById('signatureCanvas');

    canvas.addEventListener('pointerdown', startSignature);
    canvas.addEventListener('pointermove', drawSignature);
    canvas.addEventListener('pointerup', stopSignature);
    canvas.addEventListener('pointerleave', stopSignature);

    window.addEventListener('resize', resizeSignatureCanvas);
}

function resizeSignatureCanvas() {
    const canvas = document.getElementById('signatureCanvas');
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
}

function startSignature(event) {
    isSigning = true;
    hasSignature = true;

    const canvas = document.getElementById('signatureCanvas');
    const ctx = canvas.getContext('2d');
    const point = getCanvasPoint(canvas, event);

    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
}

function drawSignature(event) {
    if (!isSigning) {
        return;
    }

    const canvas = document.getElementById('signatureCanvas');
    const ctx = canvas.getContext('2d');
    const point = getCanvasPoint(canvas, event);

    ctx.lineTo(point.x, point.y);
    ctx.stroke();
}

function stopSignature() {
    isSigning = false;
}

function clearSignature() {
    const canvas = document.getElementById('signatureCanvas');
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasSignature = false;
}

function getCanvasPoint(canvas, event) {
    const rect = canvas.getBoundingClientRect();

    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}


/* =========================================================
   13. 即時時鐘
========================================================= */

function startClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();

    $('#currentTime').text(formatTimeSecond(now));
    $('#currentDate').text(formatDateSlash(now));
}


/* =========================================================
   14. 畫面狀態訊息
========================================================= */

function setStatus(message, type) {
    $('#statusText')
        .removeClass()
        .addClass('alert mb-3 alert-' + type)
        .text(message);
}


/* =========================================================
   15. 格式化與安全工具
========================================================= */

function formatDateDash(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
}

function formatDateSlash(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');

    return `${y}/${m}/${d}`;
}

function formatMonthValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');

    return `${y}-${m}`;
}

function formatDateForDisplay(dateText) {
    if (!dateText) {
        return '-';
    }

    return dateText.replaceAll('-', '/');
}

function formatTimeSecond(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');

    return `${h}:${m}:${s}`;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
