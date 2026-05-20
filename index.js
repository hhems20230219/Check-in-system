const STORAGE_KEY_CURRENT_USER = "xinxing_current_user";

let staffList = [];
let attendanceRecords = [];
let currentUser = null;

let userModal;
let signInModal;
let signOutModal;

$(document).ready(function () {
    userModal = new bootstrap.Modal(document.getElementById("userModal"));
    signInModal = new bootstrap.Modal(document.getElementById("signInModal"));
    signOutModal = new bootstrap.Modal(document.getElementById("signOutModal"));

    bindEvents();
    initClock();
    initSignatureCanvas();
    setNowToForms();

    loadInitialData();
    refreshLocation();
});

function bindEvents() {
    $("#btnSwitchUser").on("click", function () {
        userModal.show();
    });

    $("#btnSaveUser").on("click", saveCurrentUser);

    $("#staffSelect").on("change", function () {
        const selectedId = $(this).val();
        const staff = staffList.find(x => x.id === selectedId);

        $("#selectedUnit").val(staff ? staff.unit : "");
        $("#selectedTitle").val(staff ? staff.title : "");
    });

    $("#btnRefreshLocation").on("click", refreshLocation);
    $("#btnReload").on("click", loadAttendanceRecords);

    $("#btnOpenSignIn").on("click", function () {
        if (!ensureUserSelected()) return;

        setNowToForms();
        signInModal.show();
    });

    $("#btnOpenSignOut").on("click", function () {
        if (!ensureUserSelected()) return;

        setNowToForms();
        clearSignature();
        signOutModal.show();
    });

    $("#signInWorkType").on("change", updateSignInDutyTypeDisplay);
    $("#signOutWorkType").on("change", updateSignOutDisplay);

    $("#signInForm").on("submit", submitSignIn);
    $("#signOutForm").on("submit", submitSignOut);

    $("#btnClearSignature").on("click", clearSignature);
}

function initClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();

    $("#clockTime").text(formatTime(now));
    $("#clockDate").text(formatDate(now));
}

function setNowToForms() {
    const now = new Date();

    $("#signInDate").val(formatDate(now));
    $("#signInTime").val(formatTimeForInput(now));

    $("#signOutDate").val(formatDate(now));
    $("#signOutTime").val(formatTimeForInput(now));

    updateSignInDutyTypeDisplay();
    updateSignOutDisplay();
}

function updateSignInDutyTypeDisplay() {
    const workType = $("#signInWorkType").val();

    if (workType === "常年訓練") {
        $("#signInDutyTypeArea").removeClass("d-none");
        $("#signInDutyType").html(`
            <option value="簽到">簽到</option>
            <option value="請假">請假</option>
        `);
    } else {
        $("#signInDutyTypeArea").addClass("d-none");
        $("#signInDutyType").html(`<option value=""></option>`);
    }
}

function updateSignOutDisplay() {
    const workType = $("#signOutWorkType").val();

    if (workType === "協勤") {
        $("#signOutDutyTypeArea").removeClass("d-none");
    } else {
        $("#signOutDutyTypeArea").addClass("d-none");
        $("#signOutDutyType").val("");
    }

    if (workType === "協勤" || workType === "公差勤務") {
        $("#workContentArea").removeClass("d-none");
    } else {
        $("#workContentArea").addClass("d-none");
        $("#workContent").val("");
    }
}

async function loadInitialData() {
    await loadStaff();
    restoreCurrentUser();
    await loadAttendanceRecords();

    if (!currentUser) {
        showStatus("請先切換使用者。", "warning");
        userModal.show();
    }
}

async function loadStaff() {
    try {
        const result = await apiGet("readStaff");

        staffList = result.data || [];
        renderStaffOptions();

        console.log("人員資料讀取完成", staffList);
    } catch (error) {
        console.log("人員資料讀取失敗", error);
        showStatus("人員資料讀取失敗，請確認 Apps Script URL 與部署權限。", "danger");
    }
}

async function loadAttendanceRecords() {
    try {
        const result = await apiGet("readAttendance");

        attendanceRecords = result.data || [];
        renderRecords();
        renderSummary();

        console.log("出勤紀錄讀取完成", attendanceRecords);
    } catch (error) {
        console.log("出勤紀錄讀取失敗", error);
        showStatus("出勤紀錄讀取失敗。", "danger");
    }
}

function renderStaffOptions() {
    const $select = $("#staffSelect");
    $select.empty();

    if (staffList.length === 0) {
        $select.append(`<option value="">沒有可選擇的人員資料</option>`);
        return;
    }

    staffList.forEach(function (staff) {
        $select.append(`<option value="${escapeHtml(staff.id)}">${escapeHtml(staff.name)}</option>`);
    });

    $select.trigger("change");
}

function saveCurrentUser() {
    const selectedId = $("#staffSelect").val();
    const staff = staffList.find(x => x.id === selectedId);

    if (!staff) {
        showStatus("請選擇有效的人員。", "warning");
        return;
    }

    currentUser = staff;
    localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(currentUser));

    renderCurrentUser();
    renderSummary();
    userModal.hide();

    showStatus("使用者已切換。", "success");
}

function restoreCurrentUser() {
    const raw = localStorage.getItem(STORAGE_KEY_CURRENT_USER);

    if (!raw) {
        currentUser = null;
        renderCurrentUser();
        return;
    }

    const savedUser = JSON.parse(raw);
    const matchedUser = staffList.find(x => x.id === savedUser.id);

    currentUser = matchedUser || null;
    renderCurrentUser();
}

function renderCurrentUser() {
    $("#navUnit").text(currentUser ? currentUser.unit : "-");
    $("#navTitle").text(currentUser ? currentUser.title : "-");
    $("#navName").text(currentUser ? currentUser.name : "-");
}

function ensureUserSelected() {
    if (!currentUser) {
        showStatus("請先切換使用者。", "warning");
        userModal.show();
        return false;
    }

    return true;
}

async function refreshLocation() {
    $("#locationText").text("定位中...");

    const result = await requestCurrentLocation();
    $("#locationText").text(result.message);

    if (result.isAllowed) {
        showStatus("定位成功，可進行需要定位的簽到或簽退。", "success");
    } else {
        showStatus(result.message, "warning");
    }
}

async function submitSignIn(event) {
    event.preventDefault();

    if (!ensureUserSelected()) return;

    const workType = $("#signInWorkType").val();

    if (isLocationRequired(workType) && !currentLocationState.isAllowed) {
        showStatus("協勤與常年訓練需要在允許定位範圍內才能簽到。", "danger");
        return;
    }

    if (workType === "常年訓練" && hasTrainingRecordInCurrentMonth()) {
        showStatus("本月已經有常年訓練簽到或請假紀錄，不能重複建立。", "warning");
        return;
    }

    if (hasOpenRecord(workType)) {
        showStatus("已有尚未簽退的紀錄，請先簽退。", "warning");
        return;
    }

    const payload = {
        action: "createAttendance",
        data: {
            id: createId(),
            createdAt: new Date().toISOString(),
            unit: currentUser.unit,
            title: currentUser.title,
            name: currentUser.name,
            workType: workType,
            dutyType: workType === "常年訓練" ? $("#signInDutyType").val() : "",
            signInDate: $("#signInDate").val(),
            signInTime: $("#signInTime").val(),
            signOutDate: "",
            signOutTime: "",
            workContent: "",
            signature: ""
        }
    };

    try {
        await apiPost(payload);
        signInModal.hide();
        showStatus("簽到完成。", "success");
        await loadAttendanceRecords();
    } catch (error) {
        console.log("簽到失敗", error);
        showStatus("簽到失敗。", "danger");
    }
}

async function submitSignOut(event) {
    event.preventDefault();

    if (!ensureUserSelected()) return;

    const workType = $("#signOutWorkType").val();

    if (workType === "常年訓練") {
        showStatus("常年訓練不需要簽退。", "warning");
        return;
    }

    if (isLocationRequired(workType) && !currentLocationState.isAllowed) {
        showStatus("協勤需要在允許定位範圍內才能簽退。", "danger");
        return;
    }

    const openRecord = findLatestOpenRecord(workType);

    if (!openRecord) {
        showStatus("找不到可簽退的未完成紀錄。", "warning");
        return;
    }

    const workContent = $("#workContent").val().trim();

    if ((workType === "協勤" || workType === "公差勤務") && workContent === "") {
        showStatus("協勤與公差勤務簽退需要填寫工作內容。", "warning");
        return;
    }

    const payload = {
        action: "updateAttendance",
        data: {
            id: openRecord.id,
            dutyType: workType === "協勤" ? $("#signOutDutyType").val() : openRecord.dutyType,
            signOutDate: $("#signOutDate").val(),
            signOutTime: $("#signOutTime").val(),
            workContent: workContent,
            signature: getSignatureDataUrl()
        }
    };

    try {
        await apiPost(payload);
        signOutModal.hide();
        showStatus("簽退完成。", "success");
        await loadAttendanceRecords();
    } catch (error) {
        console.log("簽退失敗", error);
        showStatus("簽退失敗。", "danger");
    }
}

function renderRecords() {
    const $body = $("#recordTableBody");
    $body.empty();

    const userRecords = getCurrentUserRecords();

    if (userRecords.length === 0) {
        $body.append(`<tr><td colspan="7" class="text-center text-muted">尚無資料</td></tr>`);
        return;
    }

    userRecords.forEach(function (record) {
        $body.append(`
            <tr>
                <td>${escapeHtml(record.workType)}</td>
                <td>${escapeHtml(record.dutyType || "-")}</td>
                <td>${escapeHtml(record.signInDate || "-")}</td>
                <td>${escapeHtml(record.signInTime || "-")}</td>
                <td>${escapeHtml(record.signOutDate || "-")}</td>
                <td>${escapeHtml(record.signOutTime || "-")}</td>
                <td>${calculateRecordHours(record)}</td>
            </tr>
        `);
    });
}

function renderSummary() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthText = `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const userRecords = getCurrentUserRecords();

    let monthlyHours = 0;
    let totalHours = 0;
    let trainingCount = 0;

    userRecords.forEach(function (record) {
        const hours = calculateRecordHoursNumber(record);

        if (record.workType === "協勤") {
            totalHours += hours;

            if ((record.signInDate || "").startsWith(currentMonthText)) {
                monthlyHours += hours;
            }
        }

        if (
            record.workType === "常年訓練" &&
            (record.signInDate || "").startsWith(String(currentYear)) &&
            record.dutyType === "簽到"
        ) {
            trainingCount++;
        }
    });

    $("#monthlyHours").text(monthlyHours.toFixed(1));
    $("#totalHours").text(totalHours.toFixed(1));
    $("#trainingYear").text(currentYear);
    $("#trainingCount").text(trainingCount);

    $("#monthlyProgress").css("width", `${Math.min(monthlyHours / 4 * 100, 100)}%`);
    $("#totalProgress").css("width", `${Math.min(totalHours / 100 * 100, 100)}%`);
    $("#trainingProgress").css("width", `${Math.min(trainingCount / 12 * 100, 100)}%`);
}

function getCurrentUserRecords() {
    if (!currentUser) return [];

    return attendanceRecords
        .filter(x => x.name === currentUser.name && x.unit === currentUser.unit)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function hasTrainingRecordInCurrentMonth() {
    const now = new Date();
    const monthText = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    return getCurrentUserRecords().some(function (record) {
        return record.workType === "常年訓練" && (record.signInDate || "").startsWith(monthText);
    });
}

function hasOpenRecord(workType) {
    return findLatestOpenRecord(workType) !== null;
}

function findLatestOpenRecord(workType) {
    const records = getCurrentUserRecords();

    return records.find(function (record) {
        return record.workType === workType &&
            record.signInDate &&
            !record.signOutDate &&
            workType !== "常年訓練";
    }) || null;
}

function calculateRecordHours(record) {
    const hours = calculateRecordHoursNumber(record);

    if (hours <= 0) return "-";

    return hours.toFixed(1);
}

function calculateRecordHoursNumber(record) {
    if (!record.signInDate || !record.signInTime || !record.signOutDate || !record.signOutTime) {
        return 0;
    }

    const start = new Date(`${record.signInDate}T${record.signInTime}`);
    const end = new Date(`${record.signOutDate}T${record.signOutTime}`);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        return 0;
    }

    return (end - start) / 1000 / 60 / 60;
}

async function apiGet(action) {
    const url = `${GAS_API_URL}?action=${encodeURIComponent(action)}`;

    const response = await fetch(url);
    return await response.json();
}

async function apiPost(payload) {
    const response = await fetch(GAS_API_URL, {
        method: "POST",
        body: JSON.stringify(payload)
    });

    return await response.json();
}

function showStatus(message, type) {
    $("#statusBox")
        .removeClass("d-none success warning danger")
        .addClass(type);

    $("#statusMessage").text(message);
}

function formatDate(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function formatTime(date) {
    return [
        String(date.getHours()).padStart(2, "0"),
        String(date.getMinutes()).padStart(2, "0"),
        String(date.getSeconds()).padStart(2, "0")
    ].join(":");
}

function formatTimeForInput(date) {
    const minutes = date.getMinutes() < 30 ? "00" : "30";

    return `${String(date.getHours()).padStart(2, "0")}:${minutes}`;
}

function createId() {
    return `ATT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function initSignatureCanvas() {
    const canvas = document.getElementById("signatureCanvas");
    const ctx = canvas.getContext("2d");

    let isDrawing = false;

    function getPoint(event) {
        const rect = canvas.getBoundingClientRect();
        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;

        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    function start(event) {
        event.preventDefault();
        isDrawing = true;

        const point = getPoint(event);
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
    }

    function move(event) {
        if (!isDrawing) return;

        event.preventDefault();

        const point = getPoint(event);
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
    }

    function end(event) {
        event.preventDefault();
        isDrawing = false;
    }

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("mouseleave", end);

    canvas.addEventListener("touchstart", start);
    canvas.addEventListener("touchmove", move);
    canvas.addEventListener("touchend", end);
}

function clearSignature() {
    const canvas = document.getElementById("signatureCanvas");
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function getSignatureDataUrl() {
    const canvas = document.getElementById("signatureCanvas");
    return canvas.toDataURL("image/png");
}
