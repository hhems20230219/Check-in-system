/* index.js：負責 UI、API、表單、DataTables、簽名、Summary */

const appConfig = {
    useMockData: true,
    googleScriptUrl: "請填入你的 Google Apps Script Web App URL",
    storageKeyCurrentUser: "xinxing_attendance_current_user",
    rules: {
        monthlyDutyTargetHours: 4,
        threeMonthDutyTargetHours: 12,
        yearlyTrainingTargetCount: 12
    }
};

let staffList = [];
let attendanceList = [];
let currentUser = null;
let attendanceTable = null;
let signaturePad = null;

const mockData = {
    staff: [
        { id: "P001", unit: "新興分隊", title: "隊員", name: "王小明", personalId: "A123456789", enabled: true },
        { id: "P002", unit: "新興分隊", title: "小隊長", name: "陳小華", personalId: "B123456789", enabled: true },
        { id: "P003", unit: "新興分隊", title: "副小隊長", name: "林志強", personalId: "C123456789", enabled: true }
    ],
    attendance: [
        {
            id: "A001",
            createdAt: "2026-03-05T08:00:00",
            unit: "新興分隊",
            title: "隊員",
            name: "王小明",
            staffId: "P001",
            dutyType: "協勤",
            serviceType: "待命協勤",
            checkInDate: "2026-03-05",
            checkInTime: "08:00",
            checkOutDate: "2026-03-05",
            checkOutTime: "12:00",
            workContent: "",
            signature: "",
            hours: 4
        },
        {
            id: "A002",
            createdAt: "2026-04-12T18:00:00",
            unit: "新興分隊",
            title: "隊員",
            name: "王小明",
            staffId: "P001",
            dutyType: "協勤",
            serviceType: "出勤",
            checkInDate: "2026-04-12",
            checkInTime: "18:00",
            checkOutDate: "2026-04-12",
            checkOutTime: "21:00",
            workContent: "救護勤務支援",
            signature: "",
            hours: 3
        },
        {
            id: "A003",
            createdAt: "2026-05-02T09:00:00",
            unit: "新興分隊",
            title: "隊員",
            name: "王小明",
            staffId: "P001",
            dutyType: "協勤",
            serviceType: "待命協勤",
            checkInDate: "2026-05-02",
            checkInTime: "09:00",
            checkOutDate: "2026-05-02",
            checkOutTime: "11:00",
            workContent: "",
            signature: "",
            hours: 2
        },
        {
            id: "A004",
            createdAt: "2026-05-08T19:00:00",
            unit: "新興分隊",
            title: "隊員",
            name: "王小明",
            staffId: "P001",
            dutyType: "常年訓練",
            serviceType: "簽到",
            checkInDate: "2026-05-08",
            checkInTime: "19:00",
            checkOutDate: "",
            checkOutTime: "",
            workContent: "",
            signature: "",
            hours: ""
        },
        {
            id: "A005",
            createdAt: "2026-04-20T13:00:00",
            unit: "新興分隊",
            title: "隊員",
            name: "王小明",
            staffId: "P001",
            dutyType: "公差勤務",
            serviceType: "",
            checkInDate: "2026-04-20",
            checkInTime: "13:00",
            checkOutDate: "2026-04-20",
            checkOutTime: "16:00",
            workContent: "協助活動場地整理",
            signature: "",
            hours: 3
        },
        {
            id: "A006",
            createdAt: "2026-05-10T19:00:00",
            unit: "新興分隊",
            title: "小隊長",
            name: "陳小華",
            staffId: "P002",
            dutyType: "常年訓練",
            serviceType: "請假",
            checkInDate: "2026-05-10",
            checkInTime: "19:00",
            checkOutDate: "",
            checkOutTime: "",
            workContent: "",
            signature: "",
            hours: ""
        }
    ]
};

$(document).ready(function () {
    console.log("系統初始化開始");

    initClock();
    initTimeOptions();
    initModals();
    initEvents();
    initSignatureCanvas();
    initMonthFilter();
    initDataTable();

    loadInitialData();

    attendanceLocation.refreshLocation(updateLocationUi);

    console.log("系統初始化完成");
});

/* 每秒更新時間 */
function initClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

/* 更新時間區 */
function updateClock() {
    const now = new Date();

    $("#currentTime").text(formatTime(now));
    $("#currentDate").text(formatDate(now));
}

/* 初始化 00/30 分鐘選項 */
function initTimeOptions() {
    const options = [];

    for (let hour = 0; hour < 24; hour++) {
        ["00", "30"].forEach(function (minute) {
            const value = `${String(hour).padStart(2, "0")}:${minute}`;
            options.push(`<option value="${value}">${value}</option>`);
        });
    }

    $("#checkInTime").html(options.join(""));
    $("#checkOutTime").html(options.join(""));
}

/* 初始化 Modal 物件 */
function initModals() {
    window.userModal = new bootstrap.Modal(document.getElementById("userModal"), {
        backdrop: "static",
        keyboard: false
    });

    window.checkInModal = new bootstrap.Modal(document.getElementById("checkInModal"));
    window.checkOutModal = new bootstrap.Modal(document.getElementById("checkOutModal"));
}

/* 綁定事件 */
function initEvents() {
    $("#btnOpenUserModal").on("click", openUserModal);
    $("#btnSaveUser").on("click", saveCurrentUser);

    $("#btnRefreshLocation").on("click", function () {
        attendanceLocation.refreshLocation(updateLocationUi);
    });

    $("#btnOpenCheckInModal").on("click", openCheckInModal);
    $("#btnOpenCheckOutModal").on("click", openCheckOutModal);

    $("#checkInType").on("change", updateCheckInFields);
    $("#checkOutType, #serviceType").on("change", updateCheckOutFields);

    $("#btnSubmitCheckIn").on("click", submitCheckIn);
    $("#btnSubmitCheckOut").on("click", submitCheckOut);

    $("#monthFilter").on("change", renderAttendanceTable);

    $("#userSelect").on("change", function () {
        const staff = findStaffById($(this).val());
        updateUserModalFields(staff);
    });

    $("#btnClearSignature").on("click", function () {
        signaturePad.clear();
    });

    $("#checkOutModal").on("shown.bs.modal", function () {
        signaturePad.resize();
        signaturePad.clear();
    });
}

/* 初始化月份查詢 */
function initMonthFilter() {
    const now = new Date();
    $("#monthFilter").val(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
}

/* 初始化 DataTables */
function initDataTable() {
    attendanceTable = $("#attendanceTable").DataTable({
        responsive: true,
        pageLength: 10,
        order: [[2, "desc"], [3, "desc"]],
        language: {
            search: "搜尋：",
            lengthMenu: "每頁顯示 _MENU_ 筆",
            info: "顯示第 _START_ 到 _END_ 筆，共 _TOTAL_ 筆",
            paginate: {
                first: "第一頁",
                last: "最後一頁",
                next: "下一頁",
                previous: "上一頁"
            },
            zeroRecords: "查無資料",
            emptyTable: "目前沒有出勤紀錄"
        }
    });
}

/* 載入初始資料 */
function loadInitialData() {
    if (appConfig.useMockData) {
        console.log("目前使用範例資料模式");
        staffList = mockData.staff;
        attendanceList = mockData.attendance;
        afterDataLoaded();
        return;
    }

    console.log("開始從 Google Sheet 讀取資料");

    fetchJson("readAll", {})
        .then(function (result) {
            staffList = result.staff || [];
            attendanceList = result.attendance || [];
            afterDataLoaded();
        })
        .catch(function (error) {
            showAlert("danger", "讀取資料失敗：" + error.message);
        });
}

/* 資料載入後處理 */
function afterDataLoaded() {
    bindStaffOptions();
    restoreCurrentUser();
    renderAttendanceTable();
    renderSummary();

    if (!currentUser) {
        window.userModal.show();
    }
}

/* 綁定人員下拉 */
function bindStaffOptions() {
    const enabledStaff = staffList.filter(function (item) {
        return item.enabled === true || item.enabled === "TRUE" || item.enabled === "是";
    });

    const options = enabledStaff.map(function (item) {
        return `<option value="${item.id}">${item.name}</option>`;
    });

    $("#userSelect").html(options.join(""));

    if (enabledStaff.length > 0) {
        $("#userSelect").val(enabledStaff[0].id);
        updateUserModalFields(enabledStaff[0]);
    }
}

/* 開啟使用者切換 */
function openUserModal() {
    if (currentUser) {
        $("#userSelect").val(currentUser.id);
        updateUserModalFields(currentUser);
    }

    window.userModal.show();
}

/* 更新切換使用者 Modal 欄位 */
function updateUserModalFields(staff) {
    $("#userUnit").val(staff ? staff.unit : "");
    $("#userTitle").val(staff ? staff.title : "");
    $("#userName").val(staff ? staff.name : "");
}

/* 儲存目前使用者 */
function saveCurrentUser() {
    const staff = findStaffById($("#userSelect").val());

    if (!staff) {
        showAlert("danger", "找不到人員資料，請確認人員資料是否正確");
        return;
    }

    currentUser = staff;
    localStorage.setItem(appConfig.storageKeyCurrentUser, JSON.stringify(currentUser));
    updateUserUi();
    window.userModal.hide();

    showAlert("success", "已切換使用者：" + currentUser.name);
}

/* 還原使用者 */
function restoreCurrentUser() {
    const saved = localStorage.getItem(appConfig.storageKeyCurrentUser);

    if (!saved) {
        currentUser = null;
        updateUserUi();
        return;
    }

    const savedUser = JSON.parse(saved);
    currentUser = findStaffById(savedUser.id) || null;
    updateUserUi();
}

/* 更新 Navbar 使用者資訊 */
function updateUserUi() {
    $("#navUnit").text(currentUser ? currentUser.unit : "-");
    $("#navTitle").text(currentUser ? currentUser.title : "-");
    $("#navName").text(currentUser ? currentUser.name : "-");
}

/* 開啟簽到 */
function openCheckInModal() {
    if (!ensureCurrentUser()) return;

    hideModalMessage("#checkInMessage");

    $("#checkInTitle").val(currentUser.title);
    $("#checkInName").val(currentUser.name);
    $("#checkInDate").val(formatDate(new Date()));
    $("#checkInTime").val(getNearestHalfHourTime());

    updateCheckInFields();
    window.checkInModal.show();
}

/* 開啟簽退 */
function openCheckOutModal() {
    if (!ensureCurrentUser()) return;

    hideModalMessage("#checkOutMessage");

    $("#checkOutTitle").val(currentUser.title);
    $("#checkOutName").val(currentUser.name);
    $("#checkOutDate").val(formatDate(new Date()));
    $("#checkOutTime").val(getNearestHalfHourTime());
    $("#workContent").val("");

    updateCheckOutFields();
    window.checkOutModal.show();
}

/* 簽到欄位切換 */
function updateCheckInFields() {
    const dutyType = $("#checkInType").val();

    if (dutyType === "常年訓練") {
        $("#trainingActionArea").removeClass("d-none");
    } else {
        $("#trainingActionArea").addClass("d-none");
    }
}

/* 簽退欄位切換 */
function updateCheckOutFields() {
    const dutyType = $("#checkOutType").val();
    const serviceType = $("#serviceType").val();

    if (dutyType === "協勤") {
        $("#serviceTypeArea").removeClass("d-none");
    } else {
        $("#serviceTypeArea").addClass("d-none");
    }

    const shouldShowWorkContent =
        dutyType === "公差勤務" ||
        (dutyType === "協勤" && serviceType === "出勤");

    $("#workContentArea").toggleClass("d-none", !shouldShowWorkContent);
}

/* 送出簽到 */
function submitCheckIn() {
    if (!ensureCurrentUser()) return;

    const staff = currentUser;
    const dutyType = $("#checkInType").val();

    if (!canOperateByLocation(dutyType)) {
        showModalMessage("#checkInMessage", "此協勤種類需要定位成功後才能簽到");
        return;
    }

    if (dutyType === "常年訓練" && hasMonthlyTrainingRecord(staff.id, $("#checkInDate").val())) {
        showModalMessage("#checkInMessage", "本月已有常年訓練簽到或請假紀錄，不能重複登記");
        return;
    }

    const record = {
        id: createGuid(),
        createdAt: new Date().toISOString(),
        unit: staff.unit,
        title: staff.title,
        name: staff.name,
        staffId: staff.id,
        dutyType: dutyType,
        serviceType: dutyType === "常年訓練" ? $("#trainingAction").val() : "",
        checkInDate: $("#checkInDate").val(),
        checkInTime: $("#checkInTime").val(),
        checkOutDate: "",
        checkOutTime: "",
        workContent: "",
        signature: "",
        hours: ""
    };

    if (appConfig.useMockData) {
        attendanceList.push(record);
        renderAttendanceTable();
        renderSummary();
        window.checkInModal.hide();
        showAlert("success", "簽到成功");
        return;
    }

    postJson("create", record)
        .then(function () {
            attendanceList.push(record);
            renderAttendanceTable();
            renderSummary();
            window.checkInModal.hide();
            showAlert("success", "簽到成功");
        })
        .catch(function (error) {
            showModalMessage("#checkInMessage", "簽到失敗：" + error.message);
        });
}

/* 送出簽退 */
function submitCheckOut() {
    if (!ensureCurrentUser()) return;

    const staff = currentUser;
    const dutyType = $("#checkOutType").val();
    const serviceType = dutyType === "協勤" ? $("#serviceType").val() : "";

    if (!canOperateByLocation(dutyType)) {
        showModalMessage("#checkOutMessage", "此協勤種類需要定位成功後才能簽退");
        return;
    }

    const openRecord = findLatestOpenRecord(staff.id, dutyType);

    if (!openRecord) {
        showModalMessage("#checkOutMessage", "找不到尚未簽退的紀錄");
        return;
    }

    const shouldNeedWorkContent =
        dutyType === "公差勤務" ||
        (dutyType === "協勤" && serviceType === "出勤");

    if (shouldNeedWorkContent && !$("#workContent").val().trim()) {
        showModalMessage("#checkOutMessage", "請填寫工作內容");
        return;
    }

    if (signaturePad.isEmpty()) {
        showModalMessage("#checkOutMessage", "請完成簽名");
        return;
    }

    openRecord.serviceType = serviceType;
    openRecord.checkOutDate = $("#checkOutDate").val();
    openRecord.checkOutTime = $("#checkOutTime").val();
    openRecord.workContent = $("#workContent").val().trim();
    openRecord.signature = signaturePad.toDataUrl();
    openRecord.hours = calculateHours(
        openRecord.checkInDate,
        openRecord.checkInTime,
        openRecord.checkOutDate,
        openRecord.checkOutTime
    );

    if (appConfig.useMockData) {
        renderAttendanceTable();
        renderSummary();
        window.checkOutModal.hide();
        showAlert("success", "簽退成功");
        return;
    }

    postJson("update", openRecord)
        .then(function () {
            renderAttendanceTable();
            renderSummary();
            window.checkOutModal.hide();
            showAlert("success", "簽退成功");
        })
        .catch(function (error) {
            showModalMessage("#checkOutMessage", "簽退失敗：" + error.message);
        });
}

/* 判斷定位限制 */
function canOperateByLocation(dutyType) {
    if (dutyType === "公差勤務") {
        return true;
    }

    const locationState = attendanceLocation.getCurrentState();
    return locationState.isValid === true;
}

/* 更新定位畫面 */
function updateLocationUi(state) {
    $("#locationStatus")
        .text(state.message)
        .toggleClass("text-success", state.isValid)
        .toggleClass("text-danger", !state.isValid);

    showAlert(state.isValid ? "success" : "warning", state.message);
}

/* 渲染表格 */
function renderAttendanceTable() {
    const month = $("#monthFilter").val();

    const filtered = attendanceList.filter(function (item) {
        if (!month) return true;
        return item.checkInDate && item.checkInDate.startsWith(month);
    });

    attendanceTable.clear();

    filtered.forEach(function (item) {
        attendanceTable.row.add([
            item.dutyType || "",
            item.serviceType || "",
            item.checkInDate || "",
            item.checkInTime || "",
            item.checkOutDate || "",
            item.checkOutTime || "",
            item.hours || "-"
        ]);
    });

    attendanceTable.draw();
}

/* 渲染 Summary */
function renderSummary() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentYear = String(now.getFullYear());

    const dutyRecords = attendanceList.filter(function (item) {
        return item.dutyType === "協勤" && item.hours;
    });

    const currentMonthHours = sumHours(dutyRecords.filter(function (item) {
        return item.checkInDate && item.checkInDate.startsWith(currentMonth);
    }));

    const threeMonthHours = sumHours(getRecentThreeMonthDutyRecords(dutyRecords, now));
    const totalHours = sumHours(dutyRecords);

    const useMonthlyRule = currentMonthHours >= appConfig.rules.monthlyDutyTargetHours;
    const displayedDutyHours = useMonthlyRule ? currentMonthHours : threeMonthHours;
    const dutyTargetHours = useMonthlyRule
        ? appConfig.rules.monthlyDutyTargetHours
        : appConfig.rules.threeMonthDutyTargetHours;

    $("#summaryDutyTitle").text(useMonthlyRule ? "本月協勤時數" : "近三個月協勤時數");
    $("#summaryDutyHours").text(displayedDutyHours);
    $("#summaryDutyRuleText").text(useMonthlyRule ? "已達每月 4 小時" : "本月未達 4 小時，改看近三個月 12 小時");

    const trainingCount = attendanceList.filter(function (item) {
        return item.dutyType === "常年訓練" &&
            item.serviceType === "簽到" &&
            item.checkInDate &&
            item.checkInDate.startsWith(currentYear);
    }).length;

    $("#summaryTotalHours").text(totalHours);
    $("#summaryTrainingYear").text(currentYear + "年");
    $("#summaryTrainingCount").text(trainingCount);

    updateProgress("#dutyProgress", displayedDutyHours, dutyTargetHours);
    updateProgress("#trainingProgress", trainingCount, appConfig.rules.yearlyTrainingTargetCount);
}

/* 取得近三個月協勤紀錄 */
function getRecentThreeMonthDutyRecords(records, baseDate) {
    const monthKeys = [];

    for (let i = 0; i < 3; i++) {
        const date = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
        monthKeys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
    }

    return records.filter(function (item) {
        return monthKeys.some(function (monthKey) {
            return item.checkInDate && item.checkInDate.startsWith(monthKey);
        });
    });
}

/* 更新 Progress */
function updateProgress(selector, value, target) {
    const percent = target <= 0 ? 0 : Math.min(100, Math.round((value / target) * 100));
    $(selector).css("width", percent + "%").text(percent + "%");
}

/* 初始化簽名板 */
function initSignatureCanvas() {
    const canvas = document.getElementById("signatureCanvas");
    const context = canvas.getContext("2d");
    let isDrawing = false;
    let hasDrawn = false;

    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(300, Math.floor(rect.width));
        const height = 180;

        canvas.width = width;
        canvas.height = height;

        context.lineWidth = 2;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.strokeStyle = "#000000";

        hasDrawn = false;
    }

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

        const point = getPoint(event);
        isDrawing = true;
        hasDrawn = true;

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

    function end(event) {
        if (event) {
            event.preventDefault();
        }

        isDrawing = false;
    }

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("mouseleave", end);

    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end, { passive: false });

    window.addEventListener("resize", resizeCanvas);

    signaturePad = {
        resize: resizeCanvas,
        clear: function () {
            context.clearRect(0, 0, canvas.width, canvas.height);
            hasDrawn = false;
        },
        isEmpty: function () {
            return !hasDrawn;
        },
        toDataUrl: function () {
            return canvas.toDataURL("image/png");
        }
    };
}

/* API GET */
function fetchJson(action, data) {
    const params = new URLSearchParams(Object.assign({ action: action }, data));
    return fetch(`${appConfig.googleScriptUrl}?${params.toString()}`)
        .then(handleApiResponse);
}

/* API POST */
function postJson(action, data) {
    return fetch(appConfig.googleScriptUrl, {
        method: "POST",
        body: JSON.stringify({
            action: action,
            data: data
        })
    }).then(handleApiResponse);
}

/* API 回應處理 */
function handleApiResponse(response) {
    return response.json().then(function (result) {
        if (!result.success) {
            throw new Error(result.message || "API 回傳失敗");
        }

        return result.data;
    });
}

/* 工具：確認使用者 */
function ensureCurrentUser() {
    if (!currentUser) {
        showAlert("warning", "請先切換使用者");
        window.userModal.show();
        return false;
    }

    return true;
}

/* 工具：找人員 */
function findStaffById(id) {
    return staffList.find(function (item) {
        return item.id === id;
    });
}

/* 工具：找最後一筆未簽退 */
function findLatestOpenRecord(staffId, dutyType) {
    const records = attendanceList.filter(function (item) {
        return item.staffId === staffId &&
            item.dutyType === dutyType &&
            !item.checkOutDate &&
            dutyType !== "常年訓練";
    });

    return records.length > 0 ? records[records.length - 1] : null;
}

/* 工具：判斷當月是否已有常訓 */
function hasMonthlyTrainingRecord(staffId, dateText) {
    const month = dateText.substring(0, 7);

    return attendanceList.some(function (item) {
        return item.staffId === staffId &&
            item.dutyType === "常年訓練" &&
            item.checkInDate &&
            item.checkInDate.startsWith(month);
    });
}

/* 工具：計算時數 */
function calculateHours(startDate, startTime, endDate, endTime) {
    const start = new Date(`${startDate}T${startTime}:00`);
    const end = new Date(`${endDate}T${endTime}:00`);

    const diff = (end - start) / 1000 / 60 / 60;
    return diff > 0 ? Math.round(diff * 10) / 10 : 0;
}

/* 工具：加總時數 */
function sumHours(records) {
    return Math.round(records.reduce(function (sum, item) {
        return sum + Number(item.hours || 0);
    }, 0) * 10) / 10;
}

/* 工具：格式化日期 */
function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/* 工具：格式化時間 */
function formatTime(date) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

/* 工具：取得最近半小時 */
function getNearestHalfHourTime() {
    const now = new Date();
    const minute = now.getMinutes() < 30 ? "00" : "30";
    return `${String(now.getHours()).padStart(2, "0")}:${minute}`;
}

/* 工具：產生 id */
function createGuid() {
    return "ID-" + Date.now() + "-" + Math.random().toString(36).substring(2, 8);
}

/* Alert */
function showAlert(type, message) {
    $("#alertArea")
        .removeClass("d-none alert-success alert-danger alert-warning alert-info")
        .addClass("alert-" + type)
        .text(message);
}

/* Modal 訊息 */
function showModalMessage(selector, message) {
    $(selector).removeClass("d-none").text(message);
}

/* 隱藏 Modal 訊息 */
function hideModalMessage(selector) {
    $(selector).addClass("d-none").text("");
}
