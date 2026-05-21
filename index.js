/* 系統集中設定 */
const appConfig = {
    useSampleData: true,
    apiUrl: "請填入你的 Google Apps Script Web App URL",

    storageKeyCurrentUser: "xinxing_attendance_current_user",

    rules: {
        monthlyTargetHours: 4,
        totalTargetHours: 100,
        yearlyTrainingTarget: 12
    },

    workTypes: {
        duty: "協勤",
        training: "常年訓練",
        business: "公差勤務"
    },

    dutyTypes: {
        "協勤": ["待命協勤", "出勤"],
        "常年訓練": [],
        "公差勤務": ["公差勤務"]
    }
};

/* 範例資料 */
const sampleData = {
    staffList: [
        { id: "P001", unit: "新興分隊", title: "隊員", name: "王小明", identityNo: "A123456789", enabled: "TRUE" },
        { id: "P002", unit: "新興分隊", title: "小隊長", name: "陳小華", identityNo: "B123456789", enabled: "TRUE" }
    ],
    records: [
        {
            id: "R001",
            createdAt: "2026-05-01 08:00:00",
            unit: "新興分隊",
            title: "隊員",
            name: "王小明",
            workType: "協勤",
            dutyType: "出勤",
            checkInDate: "2026-05-01",
            checkInTime: "08:00",
            checkOutDate: "2026-05-01",
            checkOutTime: "12:00",
            workContent: "救護協勤",
            signature: "",
            hours: 4
        }
    ]
};

let currentUser = null;
let staffList = [];
let recordTable = null;
let signaturePad = {
    canvas: null,
    context: null,
    isDrawing: false
};

/* 初始化 */
$(document).ready(function () {
    console.log("系統初始化開始");

    initializeClock();
    initializeDefaultMonth();
    initializeModals();
    initializeEvents();
    initializeSignatureCanvas();
    initializeTimeOptions();

    loadInitialData();

    locationManager.locate();

    console.log("系統初始化完成");
});

/* 初始化時鐘 */
function initializeClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

/* 每秒更新時間 */
function updateClock() {
    const now = new Date();

    $("#currentTime").text(formatTime(now));
    $("#currentDate").text(formatDate(now));
}

/* 初始化月份 */
function initializeDefaultMonth() {
    const now = new Date();
    $("#queryMonth").val(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}`);
}

/* 初始化 Modal */
function initializeModals() {
    window.userModal = new bootstrap.Modal(document.getElementById("userModal"));
    window.checkInModal = new bootstrap.Modal(document.getElementById("checkInModal"));
    window.checkOutModal = new bootstrap.Modal(document.getElementById("checkOutModal"));
}

/* 綁定事件 */
function initializeEvents() {
    $("#btnLocate").on("click", handleLocate);
    $("#btnOpenUserModal").on("click", openUserModal);
    $("#btnSaveUser").on("click", saveSelectedUser);

    $("#btnOpenCheckInModal").on("click", openCheckInModal);
    $("#btnOpenCheckOutModal").on("click", openCheckOutModal);

    $("#checkInWorkType").on("change", updateCheckInFields);
    $("#checkOutWorkType").on("change", updateCheckOutFields);

    $("#checkInForm").on("submit", submitCheckIn);
    $("#checkOutForm").on("submit", submitCheckOut);

    $("#queryMonth").on("change", reloadRecords);

    $("#userSelect").on("change", updateUserReadonlyFields);
    $("#btnClearSignature").on("click", clearSignature);
}

/* 載入初始資料 */
async function loadInitialData() {
    try {
        staffList = await readStaffList();
        fillUserSelect();

        currentUser = loadCurrentUser();

        if (currentUser) {
            updateNavbarUser();
            await reloadRecords();
        } else {
            showAlert("請先切換使用者。", "warning");
            window.userModal.show();
        }
    } catch (error) {
        console.log("載入初始資料失敗", error);
        showAlert("載入資料失敗，請確認 API 或範例資料設定。", "danger");
    }
}

/* 讀取人員資料 */
async function readStaffList() {
    if (appConfig.useSampleData) {
        console.log("目前使用範例人員資料");
        return sampleData.staffList.filter(x => String(x.enabled).toUpperCase() === "TRUE");
    }

    const result = await apiGet({
        action: "readStaff"
    });

    return result.data || [];
}

/* 讀取出勤紀錄 */
async function readRecords() {
    if (appConfig.useSampleData) {
        console.log("目前使用範例出勤紀錄");
        return sampleData.records.filter(x => x.name === currentUser.name);
    }

    const result = await apiGet({
        action: "readRecords",
        name: currentUser.name,
        month: $("#queryMonth").val()
    });

    return result.data || [];
}

/* 重新載入紀錄 */
async function reloadRecords() {
    if (!currentUser) {
        return;
    }

    const records = await readRecords();
    const month = $("#queryMonth").val();
    const filteredRecords = filterRecordsByMonth(records, month);

    renderRecordTable(filteredRecords);
    renderSummary(filteredRecords, records);

    console.log("出勤紀錄已重新載入");
}

/* 篩選月份紀錄 */
function filterRecordsByMonth(records, month) {
    if (!month) {
        return records;
    }

    return records.filter(item => String(item.checkInDate || "").startsWith(month));
}

/* 渲染 DataTable */
function renderRecordTable(records) {
    if (recordTable) {
        recordTable.clear().rows.add(records).draw();
        return;
    }

    recordTable = $("#recordTable").DataTable({
        data: records,
        responsive: true,
        columns: [
            { data: "workType", defaultContent: "" },
            { data: "dutyType", defaultContent: "" },
            { data: "checkInDate", defaultContent: "" },
            { data: "checkInTime", defaultContent: "" },
            { data: "checkOutDate", defaultContent: "" },
            { data: "checkOutTime", defaultContent: "" },
            { data: "hours", defaultContent: "-" }
        ],
        pageLength: 10,
        order: [[2, "desc"], [3, "desc"]],
        language: {
            search: "搜尋：",
            lengthMenu: "每頁顯示 _MENU_ 筆",
            info: "顯示第 _START_ 至 _END_ 筆，共 _TOTAL_ 筆",
            paginate: {
                previous: "上一頁",
                next: "下一頁"
            },
            zeroRecords: "查無資料"
        }
    });
}

/* 渲染 Summary */
function renderSummary(monthRecords, allRecords) {
    const year = new Date().getFullYear();

    const monthlyHours = sumHours(
        monthRecords.filter(x => x.workType === appConfig.workTypes.duty)
    );

    const totalHours = sumHours(
        allRecords.filter(x => x.workType === appConfig.workTypes.duty)
    );

    const trainingCount = allRecords.filter(x =>
        x.workType === appConfig.workTypes.training &&
        String(x.checkInDate || "").startsWith(String(year)) &&
        x.dutyType === "簽到"
    ).length;

    $("#monthlyHours").text(monthlyHours);
    $("#totalHours").text(totalHours);
    $("#trainingYear").text(year);
    $("#trainingCount").text(trainingCount);

    updateProgress("#monthlyProgress", monthlyHours, appConfig.rules.monthlyTargetHours);
    updateProgress("#totalProgress", totalHours, appConfig.rules.totalTargetHours);
    updateProgress("#trainingProgress", trainingCount, appConfig.rules.yearlyTrainingTarget);
}

/* 加總時數 */
function sumHours(records) {
    return records.reduce((total, item) => total + Number(item.hours || 0), 0);
}

/* 更新進度條 */
function updateProgress(selector, value, target) {
    const percent = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;

    $(selector)
        .css("width", `${percent}%`)
        .text(`${percent}%`);
}

/* 開啟使用者 Modal */
function openUserModal() {
    window.userModal.show();
}

/* 填入人員下拉 */
function fillUserSelect() {
    const select = $("#userSelect");
    select.empty();

    staffList.forEach(item => {
        select.append(`<option value="${item.id}">${item.name}</option>`);
    });

    updateUserReadonlyFields();
}

/* 更新使用者 readonly 欄位 */
function updateUserReadonlyFields() {
    const selectedId = $("#userSelect").val();
    const user = staffList.find(x => x.id === selectedId);

    $("#userUnit").val(user ? user.unit : "");
    $("#userTitle").val(user ? user.title : "");
}

/* 儲存目前使用者 */
async function saveSelectedUser() {
    const selectedId = $("#userSelect").val();
    const user = staffList.find(x => x.id === selectedId);

    if (!user) {
        showAlert("請選擇使用者。", "warning");
        return;
    }

    currentUser = user;
    localStorage.setItem(appConfig.storageKeyCurrentUser, JSON.stringify(user));

    updateNavbarUser();
    window.userModal.hide();

    await reloadRecords();

    showAlert("使用者已切換完成。", "success");
}

/* 載入目前使用者 */
function loadCurrentUser() {
    const raw = localStorage.getItem(appConfig.storageKeyCurrentUser);

    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/* 更新 Navbar 使用者資訊 */
function updateNavbarUser() {
    $("#navUnit").text(currentUser?.unit || "-");
    $("#navTitle").text(currentUser?.title || "-");
    $("#navName").text(currentUser?.name || "-");
}

/* 執行定位 */
async function handleLocate() {
    const result = await locationManager.locate();

    showAlert(result.message, result.success ? "success" : "danger");
}

/* 開啟簽到 Modal */
function openCheckInModal() {
    if (!ensureCurrentUser()) {
        return;
    }

    setDefaultDateTime("#checkInDate", "#checkInTime");
    updateCheckInFields();

    window.checkInModal.show();
}

/* 開啟簽退 Modal */
function openCheckOutModal() {
    if (!ensureCurrentUser()) {
        return;
    }

    setDefaultDateTime("#checkOutDate", "#checkOutTime");
    updateCheckOutFields();
    clearSignature();

    window.checkOutModal.show();
}

/* 檢查目前使用者 */
function ensureCurrentUser() {
    if (!currentUser) {
        showAlert("請先切換使用者。", "warning");
        window.userModal.show();
        return false;
    }

    return true;
}

/* 更新簽到欄位 */
function updateCheckInFields() {
    const workType = $("#checkInWorkType").val();

    fillDutyType("#checkInDutyType", workType);

    if (workType === appConfig.workTypes.training) {
        $("#checkInDutyTypeGroup").addClass("d-none");
        $("#trainingActionGroup").removeClass("d-none");
    } else {
        $("#checkInDutyTypeGroup").removeClass("d-none");
        $("#trainingActionGroup").addClass("d-none");
    }
}

/* 更新簽退欄位 */
function updateCheckOutFields() {
    const workType = $("#checkOutWorkType").val();

    fillDutyType("#checkOutDutyType", workType);

    if (workType === appConfig.workTypes.training) {
        $("#checkOutDutyTypeGroup").addClass("d-none");
        $("#workContentGroup").addClass("d-none");
    } else {
        $("#checkOutDutyTypeGroup").removeClass("d-none");
        $("#workContentGroup").removeClass("d-none");
    }
}

/* 填入服勤類別 */
function fillDutyType(selector, workType) {
    const select = $(selector);
    select.empty();

    const items = appConfig.dutyTypes[workType] || [];

    items.forEach(item => {
        select.append(`<option value="${item}">${item}</option>`);
    });
}

/* 送出簽到 */
async function submitCheckIn(event) {
    event.preventDefault();

    const workType = $("#checkInWorkType").val();

    if (!await validateLocationForWorkType(workType)) {
        return;
    }

    const dutyType = workType === appConfig.workTypes.training
        ? $("#trainingAction").val()
        : $("#checkInDutyType").val();

    const payload = {
        action: "create",
        unit: currentUser.unit,
        title: currentUser.title,
        name: currentUser.name,
        workType,
        dutyType,
        checkInDate: $("#checkInDate").val(),
        checkInTime: $("#checkInTime").val()
    };

    try {
        if (appConfig.useSampleData) {
            payload.id = createId();
            payload.createdAt = formatDateTime(new Date());
            payload.hours = "";
            sampleData.records.push(payload);
            console.log("範例模式：已新增簽到資料");
        } else {
            await apiPost(payload);
        }

        window.checkInModal.hide();
        showAlert("簽到完成。", "success");
        await reloadRecords();
    } catch (error) {
        console.log("簽到失敗", error);
        showAlert("簽到失敗，請稍後再試。", "danger");
    }
}

/* 送出簽退 */
async function submitCheckOut(event) {
    event.preventDefault();

    const workType = $("#checkOutWorkType").val();

    if (!await validateLocationForWorkType(workType)) {
        return;
    }

    const workContent = $("#workContent").val().trim();

    if (workType !== appConfig.workTypes.training && !workContent) {
        showAlert("請填寫工作內容。", "warning");
        return;
    }

    const payload = {
        action: "update",
        name: currentUser.name,
        workType,
        dutyType: workType === appConfig.workTypes.training ? "" : $("#checkOutDutyType").val(),
        checkOutDate: $("#checkOutDate").val(),
        checkOutTime: $("#checkOutTime").val(),
        workContent,
        signature: exportSignatureBase64()
    };

    try {
        if (appConfig.useSampleData) {
            updateSampleCheckOut(payload);
            console.log("範例模式：已更新簽退資料");
        } else {
            await apiPost(payload);
        }

        window.checkOutModal.hide();
        showAlert("簽退完成。", "success");
        await reloadRecords();
    } catch (error) {
        console.log("簽退失敗", error);
        showAlert("簽退失敗，請稍後再試。", "danger");
    }
}

/* 驗證定位 */
async function validateLocationForWorkType(workType) {
    if (!locationManager.isLocationRequired(workType)) {
        return true;
    }

    if (!locationManager.enableLocationCheck) {
        return true;
    }

    if (locationManager.isLocationValid) {
        return true;
    }

    const result = await locationManager.locate();

    if (!result.success) {
        showAlert("此協勤種類需要定位成功後才能操作。", "danger");
        return false;
    }

    return true;
}

/* 範例模式簽退 */
function updateSampleCheckOut(payload) {
    const record = [...sampleData.records]
        .reverse()
        .find(x =>
            x.name === payload.name &&
            x.workType === payload.workType &&
            !x.checkOutDate
        );

    if (!record) {
        throw new Error("找不到尚未簽退的紀錄");
    }

    record.dutyType = payload.dutyType || record.dutyType;
    record.checkOutDate = payload.checkOutDate;
    record.checkOutTime = payload.checkOutTime;
    record.workContent = payload.workContent;
    record.signature = payload.signature;
    record.hours = calculateHours(record.checkInDate, record.checkInTime, record.checkOutDate, record.checkOutTime);
}

/* 初始化時間選項 */
function initializeTimeOptions() {
    fillTimeOptions("#checkInTime");
    fillTimeOptions("#checkOutTime");
}

/* 建立 00/30 分時間選項 */
function fillTimeOptions(selector) {
    const select = $(selector);
    select.empty();

    for (let hour = 0; hour < 24; hour++) {
        ["00", "30"].forEach(minute => {
            const value = `${pad2(hour)}:${minute}`;
            select.append(`<option value="${value}">${value}</option>`);
        });
    }
}

/* 設定預設日期時間 */
function setDefaultDateTime(dateSelector, timeSelector) {
    const now = new Date();
    $(dateSelector).val(formatDate(now));

    const minute = now.getMinutes() < 30 ? "00" : "30";
    $(timeSelector).val(`${pad2(now.getHours())}:${minute}`);
}

/* 初始化簽名 Canvas */
function initializeSignatureCanvas() {
    signaturePad.canvas = document.getElementById("signatureCanvas");
    signaturePad.context = signaturePad.canvas.getContext("2d");

    resizeSignatureCanvas();

    window.addEventListener("resize", resizeSignatureCanvas);

    signaturePad.canvas.addEventListener("pointerdown", startDraw);
    signaturePad.canvas.addEventListener("pointermove", draw);
    signaturePad.canvas.addEventListener("pointerup", stopDraw);
    signaturePad.canvas.addEventListener("pointerleave", stopDraw);
}

/* 調整 Canvas 尺寸 */
function resizeSignatureCanvas() {
    const canvas = signaturePad.canvas;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width;
    canvas.height = rect.height;

    signaturePad.context.lineWidth = 2;
    signaturePad.context.lineCap = "round";
}

/* 開始簽名 */
function startDraw(event) {
    signaturePad.isDrawing = true;
    const point = getCanvasPoint(event);

    signaturePad.context.beginPath();
    signaturePad.context.moveTo(point.x, point.y);
}

/* 繪製簽名 */
function draw(event) {
    if (!signaturePad.isDrawing) {
        return;
    }

    const point = getCanvasPoint(event);

    signaturePad.context.lineTo(point.x, point.y);
    signaturePad.context.stroke();
}

/* 停止簽名 */
function stopDraw() {
    signaturePad.isDrawing = false;
}

/* 取得 Canvas 座標 */
function getCanvasPoint(event) {
    const rect = signaturePad.canvas.getBoundingClientRect();

    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

/* 清除簽名 */
function clearSignature() {
    signaturePad.context.clearRect(0, 0, signaturePad.canvas.width, signaturePad.canvas.height);
}

/* 匯出簽名 Base64 */
function exportSignatureBase64() {
    return signaturePad.canvas.toDataURL("image/png");
}

/* API GET */
async function apiGet(params) {
    const url = new URL(appConfig.apiUrl);

    Object.keys(params).forEach(key => {
        url.searchParams.append(key, params[key]);
    });

    const response = await fetch(url.toString());
    return await response.json();
}

/* API POST */
async function apiPost(payload) {
    const response = await fetch(appConfig.apiUrl, {
        method: "POST",
        body: JSON.stringify(payload)
    });

    return await response.json();
}

/* 顯示 Alert */
function showAlert(message, type) {
    $("#alertArea")
        .removeClass("d-none alert-success alert-danger alert-warning alert-info")
        .addClass(`alert-${type}`)
        .text(message);
}

/* 計算時數 */
function calculateHours(startDate, startTime, endDate, endTime) {
    const start = new Date(`${startDate}T${startTime}:00`);
    const end = new Date(`${endDate}T${endTime}:00`);
    const hours = (end - start) / 1000 / 60 / 60;

    return hours > 0 ? Number(hours.toFixed(1)) : 0;
}

/* 日期格式 */
function formatDate(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/* 時間格式 */
function formatTime(date) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/* 日期時間格式 */
function formatDateTime(date) {
    return `${formatDate(date)} ${formatTime(date)}`;
}

/* 補零 */
function pad2(value) {
    return String(value).padStart(2, "0");
}

/* 建立 ID */
function createId() {
    return `R${Date.now()}`;
}
