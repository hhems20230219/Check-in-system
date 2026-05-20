const API_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
const STORAGE_KEY_CURRENT_USER = "currentAttendanceUser";

let staffList = [];
let currentUser = null;
let recordTable = null;
let isDrawing = false;

$(document).ready(function () {
    initClock();
    initDefaultDateTime();
    initEvents();
    initSignatureCanvas();
    initDataTable();

    refreshLocation();
    loadInitialData();
});

function initClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();
    $("#currentTime").text(formatTime(now));
    $("#currentDate").text(formatDate(now));
}

function initDefaultDateTime() {
    const now = new Date();
    const today = formatDate(now);
    const time = formatTime(now).substring(0, 5);

    $("#signInDate").val(today);
    $("#signInTime").val(time);
    $("#signOutDate").val(today);
    $("#signOutTime").val(time);
    $("#queryMonth").val(today.substring(0, 7));
}

function initEvents() {
    $("#btnRelocate").on("click", refreshLocation);
    $("#btnSaveUser").on("click", saveCurrentUser);

    $("#btnOpenSignIn").on("click", openSignInModal);
    $("#btnOpenSignOut").on("click", openSignOutModal);

    $("#signInServiceType").on("change", updateSignInFields);
    $("#signOutServiceType").on("change", updateSignOutFields);

    $("#signInForm").on("submit", submitSignIn);
    $("#signOutForm").on("submit", submitSignOut);

    $("#queryMonth").on("change", loadRecordsAndSummary);
    $("#btnClearSignature").on("click", clearSignature);
}

function initDataTable() {
    recordTable = $("#recordTable").DataTable({
        responsive: true,
        pageLength: 10,
        order: [[2, "desc"], [3, "desc"]],
        language: {
            search: "搜尋：",
            lengthMenu: "每頁 _MENU_ 筆",
            info: "顯示第 _START_ 到 _END_ 筆，共 _TOTAL_ 筆",
            paginate: {
                first: "第一頁",
                last: "最後一頁",
                next: "下一頁",
                previous: "上一頁"
            },
            zeroRecords: "查無資料",
            infoEmpty: "目前沒有資料"
        }
    });
}

async function loadInitialData() {
    try {
        showAlert("info", "正在讀取人員資料");

        const response = await apiGet({ action: "readStaff" });
        staffList = response.data || [];

        renderStaffSelect();
        restoreCurrentUser();

        if (!currentUser) {
            new bootstrap.Modal("#userModal", { backdrop: "static", keyboard: false }).show();
        }

        await loadRecordsAndSummary();
        hideAlert();

        console.log("初始化資料完成");
    } catch (error) {
        showAlert("danger", error.message);
        console.log("初始化資料失敗");
    }
}

function renderStaffSelect() {
    const select = $("#staffSelect");
    select.empty();

    staffList.forEach(staff => {
        select.append(`
            <option value="${staff.id}">
                ${staff.unit} / ${staff.title} / ${staff.name}
            </option>
        `);
    });
}

function restoreCurrentUser() {
    const saved = localStorage.getItem(STORAGE_KEY_CURRENT_USER);

    if (!saved) {
        updateNavbarUser(null);
        return;
    }

    currentUser = JSON.parse(saved);
    updateNavbarUser(currentUser);
}

function saveCurrentUser() {
    const staffId = $("#staffSelect").val();
    currentUser = staffList.find(x => x.id === staffId);

    if (!currentUser) {
        showAlert("warning", "請先選擇使用者");
        return;
    }

    localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(currentUser));
    updateNavbarUser(currentUser);

    bootstrap.Modal.getInstance(document.getElementById("userModal")).hide();
    loadRecordsAndSummary();

    console.log("已切換目前使用者");
}

function updateNavbarUser(user) {
    $("#navUnit").text(user ? user.unit : "-");
    $("#navTitle").text(user ? user.title : "-");
    $("#navName").text(user ? user.name : "-");
}

function openSignInModal() {
    if (!ensureCurrentUser()) return;

    initDefaultDateTime();
    updateSignInFields();

    new bootstrap.Modal("#signInModal").show();
}

function openSignOutModal() {
    if (!ensureCurrentUser()) return;

    initDefaultDateTime();
    updateSignOutFields();
    clearSignature();

    new bootstrap.Modal("#signOutModal").show();
}

function updateSignInFields() {
    const serviceType = $("#signInServiceType").val();

    $("#signInDutyTypeBlock").toggleClass("d-none", serviceType === "常年訓練");
    $("#trainingStatusBlock").toggleClass("d-none", serviceType !== "常年訓練");
}

function updateSignOutFields() {
    const serviceType = $("#signOutServiceType").val();

    $("#signOutDutyTypeBlock").toggleClass("d-none", serviceType !== "協勤");
    $("#workContentBlock").toggleClass("d-none", serviceType === "常年訓練");
}

async function submitSignIn(event) {
    event.preventDefault();

    const serviceType = $("#signInServiceType").val();

    if (!canOperateByLocation(serviceType)) {
        showAlert("warning", "此協勤種類需要定位成功且在允許範圍內才能簽到");
        return;
    }

    const dutyType = serviceType === "常年訓練"
        ? $("#trainingStatus").val()
        : $("#signInDutyType").val();

    const payload = {
        action: "create",
        staffId: currentUser.id,
        unit: currentUser.unit,
        title: currentUser.title,
        name: currentUser.name,
        serviceType: serviceType,
        dutyType: dutyType,
        signInDate: $("#signInDate").val(),
        signInTime: $("#signInTime").val()
    };

    try {
        const response = await apiPost(payload);
        showAlert("success", response.message || "簽到完成");
        bootstrap.Modal.getInstance(document.getElementById("signInModal")).hide();
        await loadRecordsAndSummary();

        console.log("簽到資料已送出");
    } catch (error) {
        showAlert("danger", error.message);
        console.log("簽到失敗");
    }
}

async function submitSignOut(event) {
    event.preventDefault();

    const serviceType = $("#signOutServiceType").val();

    if (!canOperateByLocation(serviceType)) {
        showAlert("warning", "此協勤種類需要定位成功且在允許範圍內才能簽退");
        return;
    }

    const workContentRequired = serviceType === "協勤" || serviceType === "公差勤務";
    const workContent = $("#workContent").val().trim();

    if (workContentRequired && !workContent) {
        showAlert("warning", "請填寫工作內容");
        return;
    }

    const payload = {
        action: "update",
        staffId: currentUser.id,
        unit: currentUser.unit,
        title: currentUser.title,
        name: currentUser.name,
        serviceType: serviceType,
        dutyType: $("#signOutDutyType").val(),
        signOutDate: $("#signOutDate").val(),
        signOutTime: $("#signOutTime").val(),
        workContent: workContent,
        signature: getSignatureBase64()
    };

    try {
        const response = await apiPost(payload);
        showAlert("success", response.message || "簽退完成");
        bootstrap.Modal.getInstance(document.getElementById("signOutModal")).hide();
        await loadRecordsAndSummary();

        console.log("簽退資料已送出");
    } catch (error) {
        showAlert("danger", error.message);
        console.log("簽退失敗");
    }
}

async function loadRecordsAndSummary() {
    if (!currentUser) return;

    const month = $("#queryMonth").val();

    const response = await apiGet({
        action: "readDashboard",
        staffId: currentUser.id,
        month: month
    });

    renderSummary(response.summary);
    renderRecords(response.records || []);
}

function renderSummary(summary) {
    const monthlyTarget = summary.monthlyTargetHours || 4;
    const totalTarget = summary.totalTargetHours || 100;
    const trainingTarget = summary.trainingTargetCount || 12;

    $("#monthlyHours").text(summary.monthlyHours || 0);
    $("#totalHours").text(summary.totalHours || 0);
    $("#trainingYear").text(summary.trainingYear || new Date().getFullYear());
    $("#trainingCount").text(summary.trainingCount || 0);

    setProgress("#monthlyProgress", summary.monthlyHours || 0, monthlyTarget);
    setProgress("#totalProgress", summary.totalHours || 0, totalTarget);
    setProgress("#trainingProgress", summary.trainingCount || 0, trainingTarget);
}

function setProgress(selector, value, target) {
    const percent = target > 0 ? Math.min(100, Math.round(value / target * 100)) : 0;
    $(selector).css("width", `${percent}%`).text(`${percent}%`);
}

function renderRecords(records) {
    recordTable.clear();

    records.forEach(item => {
        recordTable.row.add([
            item.serviceType,
            item.dutyType,
            item.signInDate,
            item.signInTime,
            item.signOutDate,
            item.signOutTime,
            item.hours
        ]);
    });

    recordTable.draw();
}

async function apiGet(params) {
    const url = `${API_URL}?${new URLSearchParams(params).toString()}`;
    const response = await fetch(url);
    const result = await response.json();

    if (!result.success) {
        throw new Error(result.message || "API 查詢失敗");
    }

    return result;
}

async function apiPost(payload) {
    const response = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!result.success) {
        throw new Error(result.message || "API 寫入失敗");
    }

    return result;
}

function showAlert(type, message) {
    $("#systemAlert")
        .removeClass("d-none alert-success alert-danger alert-warning alert-info")
        .addClass(`alert-${type}`)
        .text(message);
}

function hideAlert() {
    $("#systemAlert").addClass("d-none").text("");
}

function ensureCurrentUser() {
    if (!currentUser) {
        showAlert("warning", "請先切換使用者");
        new bootstrap.Modal("#userModal", { backdrop: "static", keyboard: false }).show();
        return false;
    }

    return true;
}

function formatDate(date) {
    return date.toISOString().substring(0, 10);
}

function formatTime(date) {
    return date.toTimeString().substring(0, 8);
}

function initSignatureCanvas() {
    const canvas = document.getElementById("signatureCanvas");
    const context = canvas.getContext("2d");

    function getPoint(event) {
        const rect = canvas.getBoundingClientRect();
        const source = event.touches ? event.touches[0] : event;

        return {
            x: source.clientX - rect.left,
            y: source.clientY - rect.top
        };
    }

    function start(event) {
        event.preventDefault();
        isDrawing = true;

        const point = getPoint(event);
        context.beginPath();
        context.moveTo(point.x, point.y);
    }

    function move(event) {
        if (!isDrawing) return;

        event.preventDefault();
        const point = getPoint(event);
        context.lineTo(point.x, point.y);
        context.stroke();
    }

    function end() {
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
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
}

function getSignatureBase64() {
    return document.getElementById("signatureCanvas").toDataURL("image/png");
}
