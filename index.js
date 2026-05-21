/* ==============================
   前端主程式
   負責：UI、API、DataTables、Modal、表單流程
   ============================== */

const appConfig = {
    useSampleData: true,
    apiUrl: "請填入你的 Google Apps Script Web App URL",
    monthlyTargetHours: 4,
    trainingYearlyTarget: 12,
    storageCurrentUserKey: "xinxing_attendance_current_user"
};

let staffList = [];
let recordList = [];
let currentUser = null;
let recordTable = null;
let signInModal = null;
let signOutModal = null;
let userModal = null;
let isSignatureDrawing = false;

/* ==============================
   範例資料
   ============================== */
const sampleStaffList = [
    { id: "S001", unit: "新興分隊", title: "隊員", name: "王小明", identityNo: "A123456789", enabled: "TRUE" },
    { id: "S002", unit: "新興分隊", title: "小隊長", name: "陳小華", identityNo: "B123456789", enabled: "TRUE" }
];

let sampleRecordList = [
    {
        id: "R001",
        createdAt: "2026-05-01 08:00:00",
        unit: "新興分隊",
        title: "隊員",
        name: "王小明",
        dutyType: "協勤",
        serviceType: "出勤",
        signInDate: "2026-05-01",
        signInTime: "08:00",
        signOutDate: "2026-05-01",
        signOutTime: "12:00",
        workContent: "救護協勤",
        signature: ""
    }
];

/* ==============================
   初始化
   ============================== */
$(document).ready(function () {
    console.log("系統初始化開始");

    signInModal = new bootstrap.Modal(document.getElementById("signInModal"));
    signOutModal = new bootstrap.Modal(document.getElementById("signOutModal"));
    userModal = new bootstrap.Modal(document.getElementById("userModal"));

    initClock();
    initTimeOptions();
    initDataTable();
    initSignatureCanvas();
    bindEvents();

    loadInitialData();
    locateAndRender();

    console.log("系統初始化完成");
});

/* ==============================
   綁定事件
   ============================== */
function bindEvents() {
    $("#btnLocate").on("click", locateAndRender);
    $("#btnSaveUser").on("click", saveCurrentUser);
    $("#userSelect").on("change", renderUserPreview);

    $("#btnOpenSignIn").on("click", openSignInModal);
    $("#btnOpenSignOut").on("click", openSignOutModal);

    $("#signInDutyType").on("change", renderSignInFields);
    $("#signOutDutyType").on("change", renderSignOutFields);

    $("#signInForm").on("submit", submitSignIn);
    $("#signOutForm").on("submit", submitSignOut);

    $("#btnClearSignature").on("click", clearSignature);
    $("#monthFilter").on("change", renderRecords);
}

/* ==============================
   時鐘
   ============================== */
function initClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();
    $("#clockTime").text(formatTime(now));
    $("#clockDate").text(formatDate(now));
}

/* ==============================
   載入初始資料
   ============================== */
function loadInitialData() {
    if (appConfig.useSampleData) {
        console.log("目前使用範例資料模式");
        staffList = sampleStaffList.filter(x => x.enabled === "TRUE");
        recordList = sampleRecordList;
        afterDataLoaded();
        return;
    }

    apiGet("readAll", {})
        .then(function (response) {
            staffList = response.staffList || [];
            recordList = response.recordList || [];
            afterDataLoaded();
        })
        .catch(function (error) {
            showAlert("danger", "讀取資料失敗：" + error.message);
        });
}

function afterDataLoaded() {
    restoreCurrentUser();
    renderUserSelect();
    renderNavbarUser();
    renderRecords();
    renderSummary();

    if (!currentUser && staffList.length > 0) {
        userModal.show();
    }

    if (staffList.length === 0) {
        showAlert("warning", "目前沒有人員資料，請先確認 Google Sheet 的人員資料工作表。");
    }
}

/* ==============================
   API：GET
   ============================== */
function apiGet(action, params) {
    const query = $.param(Object.assign({ action: action }, params || {}));
    const url = appConfig.apiUrl + "?" + query;

    console.log("送出 GET API：" + action);

    return fetch(url)
        .then(response => response.json())
        .then(handleApiResponse);
}

/* ==============================
   API：POST
   ============================== */
function apiPost(action, data) {
    console.log("送出 POST API：" + action);

    return fetch(appConfig.apiUrl, {
        method: "POST",
        body: JSON.stringify({
            action: action,
            data: data
        })
    })
        .then(response => response.json())
        .then(handleApiResponse);
}

function handleApiResponse(response) {
    if (!response || response.success !== true) {
        throw new Error(response && response.message ? response.message : "API 回傳失敗");
    }

    return response.data;
}

/* ==============================
   使用者切換
   ============================== */
function renderUserSelect() {
    const $select = $("#userSelect");
    $select.empty();

    staffList.forEach(function (staff) {
        $select.append(`<option value="${staff.id}">${staff.name}</option>`);
    });

    renderUserPreview();
}

function renderUserPreview() {
    const staff = getSelectedStaff();
    $("#userUnit").val(staff ? staff.unit : "");
    $("#userTitle").val(staff ? staff.title : "");
}

function getSelectedStaff() {
    const staffId = $("#userSelect").val();
    return staffList.find(x => x.id === staffId) || staffList[0] || null;
}

function saveCurrentUser() {
    const staff = getSelectedStaff();

    if (!staff) {
        showAlert("warning", "沒有可切換的人員資料。");
        return;
    }

    currentUser = staff;
    localStorage.setItem(appConfig.storageCurrentUserKey, JSON.stringify(currentUser));

    renderNavbarUser();
    renderSummary();
    renderRecords();

    userModal.hide();
    showAlert("success", "使用者已切換為：" + currentUser.name);
}

function restoreCurrentUser() {
    const raw = localStorage.getItem(appConfig.storageCurrentUserKey);

    if (!raw) return;

    try {
        const savedUser = JSON.parse(raw);
        currentUser = staffList.find(x => x.id === savedUser.id) || null;
    } catch {
        currentUser = null;
    }
}

function renderNavbarUser() {
    $("#navUnit").text(currentUser ? currentUser.unit : "-");
    $("#navTitle").text(currentUser ? currentUser.title : "-");
    $("#navName").text(currentUser ? currentUser.name : "-");
}

/* ==============================
   定位顯示
   ============================== */
function locateAndRender() {
    $("#locationStatus").text("定位中...");

    locateCurrentPosition(
        function (state) {
            renderLocationState(state);
        },
        function (state) {
            renderLocationState(state);
        }
    );
}

function renderLocationState(state) {
    $("#locationStatus")
        .removeClass("text-muted text-success text-danger")
        .addClass(state.isValid ? "text-success" : "text-danger")
        .text(state.message);

    showAlert(state.isValid ? "success" : "warning", state.message);
}

/* ==============================
   簽到流程
   ============================== */
function openSignInModal() {
    if (!validateCurrentUser()) return;

    fillUserToSignForms();
    setDefaultDateTime("#signInDate", "#signInTime");
    renderSignInFields();

    signInModal.show();
}

function renderSignInFields() {
    const dutyType = $("#signInDutyType").val();
    $("#trainingStatusBox").toggleClass("d-none", dutyType !== "常年訓練");
}

function submitSignIn(event) {
    event.preventDefault();

    const dutyType = $("#signInDutyType").val();

    if (!validateCurrentUser()) return;
    if (!validateLocationByDutyType(dutyType)) return;

    const record = {
        id: createClientId(),
        createdAt: formatDateTime(new Date()),
        unit: currentUser.unit,
        title: currentUser.title,
        name: currentUser.name,
        dutyType: dutyType,
        serviceType: dutyType === "常年訓練" ? $("#trainingStatus").val() : "",
        signInDate: $("#signInDate").val(),
        signInTime: $("#signInTime").val(),
        signOutDate: "",
        signOutTime: "",
        workContent: "",
        signature: ""
    };

    if (dutyType === "常年訓練" && hasMonthlyTrainingRecord(record.signInDate)) {
        showAlert("warning", "本月已有常年訓練簽到或請假紀錄，不能重複建立。");
        return;
    }

    if (appConfig.useSampleData) {
        sampleRecordList.push(record);
        recordList = sampleRecordList;
        afterRecordChanged("簽到成功");
        return;
    }

    apiPost("create", record)
        .then(function () {
            loadInitialData();
            showAlert("success", "簽到成功");
            signInModal.hide();
        })
        .catch(function (error) {
            showAlert("danger", "簽到失敗：" + error.message);
        });
}

/* ==============================
   簽退流程
   ============================== */
function openSignOutModal() {
    if (!validateCurrentUser()) return;

    fillUserToSignForms();
    setDefaultDateTime("#signOutDate", "#signOutTime");
    renderSignOutFields();
    clearSignature();

    signOutModal.show();
}

function renderSignOutFields() {
    const dutyType = $("#signOutDutyType").val();

    $("#serviceTypeBox").toggleClass("d-none", dutyType !== "協勤");
    $("#workContentBox").removeClass("d-none");
}

function submitSignOut(event) {
    event.preventDefault();

    const dutyType = $("#signOutDutyType").val();

    if (!validateCurrentUser()) return;
    if (!validateLocationByDutyType(dutyType)) return;

    const openRecord = findOpenRecord(dutyType);

    if (!openRecord) {
        showAlert("warning", "找不到尚未簽退的紀錄。");
        return;
    }

    const workContent = $("#workContent").val().trim();

    if (!workContent) {
        showAlert("warning", "請填寫工作內容。");
        return;
    }

    const updateData = {
        id: openRecord.id,
        serviceType: dutyType === "協勤" ? $("#serviceType").val() : "公差勤務",
        signOutDate: $("#signOutDate").val(),
        signOutTime: $("#signOutTime").val(),
        workContent: workContent,
        signature: getSignatureBase64()
    };

    if (appConfig.useSampleData) {
        Object.assign(openRecord, updateData);
        afterRecordChanged("簽退成功");
        return;
    }

    apiPost("update", updateData)
        .then(function () {
            loadInitialData();
            showAlert("success", "簽退成功");
            signOutModal.hide();
        })
        .catch(function (error) {
            showAlert("danger", "簽退失敗：" + error.message);
        });
}

function findOpenRecord(dutyType) {
    return recordList
        .filter(x =>
            x.name === currentUser.name &&
            x.dutyType === dutyType &&
            !x.signOutDate &&
            x.dutyType !== "常年訓練"
        )
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0] || null;
}

/* ==============================
   驗證
   ============================== */
function validateCurrentUser() {
    if (!currentUser) {
        showAlert("warning", "請先切換使用者。");
        userModal.show();
        return false;
    }

    return true;
}

function validateLocationByDutyType(dutyType) {
    if (!locationConfig.enableLocationCheck) return true;

    if (dutyType === "公差勤務") return true;

    if (!locationState.isValid) {
        showAlert("warning", "此協勤種類需要定位成功後才能操作。");
        return false;
    }

    return true;
}

/* ==============================
   DataTables
   ============================== */
function initDataTable() {
    recordTable = $("#recordTable").DataTable({
        responsive: true,
        pageLength: 10,
        order: [[2, "desc"]],
        language: {
            search: "搜尋：",
            lengthMenu: "每頁 _MENU_ 筆",
            info: "顯示第 _START_ 到 _END_ 筆，共 _TOTAL_ 筆",
            paginate: {
                previous: "上一頁",
                next: "下一頁"
            },
            zeroRecords: "查無資料"
        }
    });
}

function renderRecords() {
    if (!recordTable) return;

    const month = $("#monthFilter").val();
    const rows = getCurrentUserRecords()
        .filter(x => !month || (x.signInDate || "").startsWith(month))
        .map(function (x) {
            return [
                x.dutyType || "",
                x.serviceType || "",
                x.signInDate || "",
                x.signInTime || "",
                x.signOutDate || "",
                x.signOutTime || "",
                calculateRecordHours(x)
            ];
        });

    recordTable.clear();
    recordTable.rows.add(rows);
    recordTable.draw();
}

/* ==============================
   Summary
   ============================== */
function renderSummary() {
    const records = getCurrentUserRecords();
    const now = new Date();
    const currentMonth = formatYearMonth(now);
    const currentYear = now.getFullYear().toString();

    const monthlyHours = sumHours(records.filter(x =>
        x.dutyType === "協勤" &&
        (x.signInDate || "").startsWith(currentMonth)
    ));

    const totalHours = sumHours(records.filter(x => x.dutyType === "協勤"));

    const trainingCount = records.filter(x =>
        x.dutyType === "常年訓練" &&
        (x.signInDate || "").startsWith(currentYear) &&
        x.serviceType === "簽到"
    ).length;

    $("#monthlyHours").text(monthlyHours.toFixed(1));
    $("#totalHours").text(totalHours.toFixed(1));
    $("#trainingYear").text(currentYear);
    $("#trainingCount").text(trainingCount);

    setProgress("#monthlyProgress", monthlyHours, appConfig.monthlyTargetHours);
    setProgress("#trainingProgress", trainingCount, appConfig.trainingYearlyTarget);
}

function setProgress(selector, value, target) {
    const percent = target <= 0 ? 0 : Math.min(100, Math.round(value / target * 100));
    $(selector).css("width", percent + "%").text(percent + "%");
}

function sumHours(records) {
    return records.reduce((sum, item) => sum + Number(calculateRecordHours(item) || 0), 0);
}

function calculateRecordHours(record) {
    if (!record.signInDate || !record.signInTime || !record.signOutDate || !record.signOutTime) {
        return "";
    }

    const start = new Date(record.signInDate + "T" + record.signInTime + ":00");
    const end = new Date(record.signOutDate + "T" + record.signOutTime + ":00");
    const diff = (end - start) / 1000 / 60 / 60;

    return diff > 0 ? diff.toFixed(1) : "";
}

function getCurrentUserRecords() {
    if (!currentUser) return [];
    return recordList.filter(x => x.name === currentUser.name && x.unit === currentUser.unit);
}

function hasMonthlyTrainingRecord(dateText) {
    const month = (dateText || "").substring(0, 7);

    return getCurrentUserRecords().some(x =>
        x.dutyType === "常年訓練" &&
        (x.signInDate || "").startsWith(month)
    );
}

/* ==============================
   簽名 Canvas
   ============================== */
function initSignatureCanvas() {
    const canvas = document.getElementById("signatureCanvas");
    const ctx = canvas.getContext("2d");

    function resizeCanvas() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    $(canvas).on("pointerdown", function (event) {
        isSignatureDrawing = true;
        ctx.beginPath();
        ctx.moveTo(event.offsetX, event.offsetY);
    });

    $(canvas).on("pointermove", function (event) {
        if (!isSignatureDrawing) return;
        ctx.lineTo(event.offsetX, event.offsetY);
        ctx.stroke();
    });

    $(canvas).on("pointerup pointerleave", function () {
        isSignatureDrawing = false;
    });
}

function clearSignature() {
    const canvas = document.getElementById("signatureCanvas");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function getSignatureBase64() {
    const canvas = document.getElementById("signatureCanvas");
    return canvas.toDataURL("image/png");
}

/* ==============================
   UI 輔助
   ============================== */
function showAlert(type, message) {
    $("#systemAlert")
        .removeClass("d-none alert-success alert-danger alert-warning alert-info")
        .addClass("alert-" + type)
        .text(message);
}

function afterRecordChanged(message) {
    renderRecords();
    renderSummary();
    signInModal.hide();
    signOutModal.hide();
    showAlert("success", message);
}

function fillUserToSignForms() {
    $("#signInTitle").val(currentUser.title);
    $("#signInName").val(currentUser.name);
    $("#signOutTitle").val(currentUser.title);
    $("#signOutName").val(currentUser.name);
}

function initTimeOptions() {
    const options = [];

    for (let hour = 0; hour < 24; hour++) {
        ["00", "30"].forEach(function (minute) {
            options.push(`${String(hour).padStart(2, "0")}:${minute}`);
        });
    }

    $("#signInTime, #signOutTime").html(options.map(x => `<option value="${x}">${x}</option>`).join(""));
}

function setDefaultDateTime(dateSelector, timeSelector) {
    const now = new Date();
    const minute = now.getMinutes() < 30 ? "00" : "30";
    const time = `${String(now.getHours()).padStart(2, "0")}:${minute}`;

    $(dateSelector).val(formatDate(now));
    $(timeSelector).val(time);
}

/* ==============================
   格式化
   ============================== */
function formatDate(date) {
    return date.toISOString().substring(0, 10);
}

function formatTime(date) {
    return date.toTimeString().substring(0, 8);
}

function formatDateTime(date) {
    return formatDate(date) + " " + formatTime(date);
}

function formatYearMonth(date) {
    return date.toISOString().substring(0, 7);
}

function createClientId() {
    return "R" + Date.now();
}
