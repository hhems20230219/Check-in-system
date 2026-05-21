/* index.js：負責 UI、API、表單、DataTables、簽名、Summary */

const appConfig = {
    useMockData: true,
    mockDataUrl: "./mockData.json",
    googleScriptUrl: "請填入你的 Google Apps Script Web App URL",
    storageKeyCurrentUser: "xinxing_attendance_current_user",
    rules: {
        monthlyDutyTargetHours: 4,
        threeMonthDutyTargetHours: 12,
        yearlyTrainingTargetCount: 12,
        progressWarningPercent: 50,
        progressSuccessPercent: 90
    }
};

let staffList = [];
let attendanceList = [];
let currentUser = null;
let attendanceTable = null;
let signaturePad = null;

$(document).ready(function () {
    console.log("系統初始化開始");

    initClock();
    initTimeOptions();
    initModals();
    initEvents();
    initSignatureCanvas();
    initRecordFilters();
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

/* 初始化 Modal */
function initModals() {
    window.userModal = new bootstrap.Modal(document.getElementById("userModal"), {
        backdrop: "static",
        keyboard: false
    });

    window.checkInModal = new bootstrap.Modal(document.getElementById("checkInModal"));
    window.checkOutModal = new bootstrap.Modal(document.getElementById("checkOutModal"));

    document.getElementById("checkOutModal").addEventListener("shown.bs.modal", function () {
        resizeSignatureCanvas();
        signaturePad.clear();
        console.log("簽退視窗已開啟，簽名板已重新初始化");
    });
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

    $("#userSelect").on("change", function () {
        syncStaffToUserFields($(this).val());
    });

    $("#checkInName").on("change", function () {
        syncStaffToCheckInFields($(this).val());
    });

    $("#checkOutName").on("change", function () {
        syncStaffToCheckOutFields($(this).val());
    });

    $("#btnSubmitCheckIn").on("click", submitCheckIn);
    $("#btnSubmitCheckOut").on("click", submitCheckOut);

    $("#recordFilterMode, #monthFilter, #startDateFilter, #endDateFilter").on("change", function () {
        updateRecordFilterUi();
        renderAttendanceTable();
    });

    $("#btnClearSignature").on("click", function () {
        signaturePad.clear();
    });

    $(window).on("resize", function () {
        resizeSignatureCanvas();
    });
}

/* 初始化出勤紀錄篩選 */
function initRecordFilters() {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    $("#recordFilterMode").val("month");
    $("#monthFilter").val(thisMonth);
    $("#startDateFilter").val(`${thisMonth}-01`);
    $("#endDateFilter").val(formatDate(now));

    updateRecordFilterUi();
}

/* 更新出勤紀錄篩選 UI */
function updateRecordFilterUi() {
    const mode = $("#recordFilterMode").val();

    $("#monthFilter").toggleClass("d-none", mode !== "month");
    $("#startDateFilter").toggleClass("d-none", mode !== "range");
    $("#endDateFilter").toggleClass("d-none", mode !== "range");
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
        console.log("目前使用 mockData.json 範例資料模式");

        fetch(appConfig.mockDataUrl)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("讀取 mockData.json 失敗");
                }

                return response.json();
            })
            .then(function (mockData) {
                staffList = mockData.staff || [];
                attendanceList = mockData.attendance || [];
                afterDataLoaded();
            })
            .catch(function (error) {
                showAlert("danger", "讀取範例資料失敗：" + error.message);
                console.log("讀取範例資料失敗", error);
            });

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

    if (currentUser) {
        setModalStaffValue(currentUser.id);
    }

    renderAttendanceTable();
    renderSummary();

    if (!currentUser) {
        window.userModal.show();
    }
}

/* 綁定人員下拉 */
function bindStaffOptions() {
    const enabledStaff = getEnabledStaffList();

    const options = enabledStaff.map(function (item) {
        return `<option value="${item.id}">${item.name}</option>`;
    }).join("");

    $("#userSelect").html(options);
    $("#checkInName").html(options);
    $("#checkOutName").html(options);

    if (enabledStaff.length > 0) {
        setModalStaffValue(enabledStaff[0].id);
    }
}

/* 取得啟用人員 */
function getEnabledStaffList() {
    return staffList.filter(function (item) {
        return item.enabled === true || item.enabled === "TRUE" || item.enabled === "是";
    });
}

/* 同步三個 Modal 的人員選擇 */
function setModalStaffValue(staffId) {
    if (!staffId) return;

    $("#userSelect").val(staffId);
    $("#checkInName").val(staffId);
    $("#checkOutName").val(staffId);

    syncStaffToUserFields(staffId);
    syncStaffToCheckInFields(staffId);
    syncStaffToCheckOutFields(staffId);
}

/* 切換使用者欄位同步 */
function syncStaffToUserFields(staffId) {
    const staff = findStaffById(staffId);
    if (!staff) return;

    $("#userUnit").val(staff.unit);
    $("#userTitle").val(staff.title);
}

/* 簽到欄位同步 */
function syncStaffToCheckInFields(staffId) {
    const staff = findStaffById(staffId);
    if (!staff) return;

    $("#checkInTitle").val(staff.title);
}

/* 簽退欄位同步 */
function syncStaffToCheckOutFields(staffId) {
    const staff = findStaffById(staffId);
    if (!staff) return;

    $("#checkOutTitle").val(staff.title);
}

/* 開啟使用者切換 */
function openUserModal() {
    if (currentUser) {
        $("#userSelect").val(currentUser.id);
        syncStaffToUserFields(currentUser.id);
    }

    window.userModal.show();
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
    setModalStaffValue(currentUser.id);

    renderAttendanceTable();
    renderSummary();

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
    const staff = findStaffById(savedUser.id);

    currentUser = staff || null;
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

    $("#checkInName").val(currentUser.id);
    syncStaffToCheckInFields(currentUser.id);

    $("#checkInDate").val(formatDate(new Date()));
    $("#checkInTime").val(getNearestHalfHourTime());

    updateCheckInFields();
    window.checkInModal.show();
}

/* 開啟簽退 */
function openCheckOutModal() {
    if (!ensureCurrentUser()) return;

    hideModalMessage("#checkOutMessage");

    $("#checkOutName").val(currentUser.id);
    syncStaffToCheckOutFields(currentUser.id);

    $("#checkOutDate").val(formatDate(new Date()));
    $("#checkOutTime").val(getNearestHalfHourTime());
    $("#workContent").val("");

    updateCheckOutFields();
    window.checkOutModal.show();
}

/* 簽到欄位切換 */
function updateCheckInFields() {
    const dutyType = $("#checkInType").val();

    $("#trainingActionArea").toggleClass("d-none", dutyType !== "常年訓練");
}

/* 簽退欄位切換 */
function updateCheckOutFields() {
    const dutyType = $("#checkOutType").val();
    const serviceType = $("#serviceType").val();

    $("#serviceTypeArea").toggleClass("d-none", dutyType !== "協勤");

    const shouldShowWorkContent =
        dutyType === "公差勤務" ||
        (dutyType === "協勤" && serviceType === "出勤");

    $("#workContentArea").toggleClass("d-none", !shouldShowWorkContent);
}

/* 送出簽到 */
function submitCheckIn() {
    const staff = findStaffById($("#checkInName").val());
    const dutyType = $("#checkInType").val();

    if (!staff) {
        showModalMessage("#checkInMessage", "找不到簽到人員資料");
        return;
    }

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

        if (currentUser && currentUser.id === staff.id) {
            renderAttendanceTable();
            renderSummary();
        }

        window.checkInModal.hide();
        showAlert("success", "簽到成功");
        return;
    }

    postJson("create", record)
        .then(function () {
            attendanceList.push(record);

            if (currentUser && currentUser.id === staff.id) {
                renderAttendanceTable();
                renderSummary();
            }

            window.checkInModal.hide();
            showAlert("success", "簽到成功");
        })
        .catch(function (error) {
            showModalMessage("#checkInMessage", "簽到失敗：" + error.message);
        });
}

/* 送出簽退 */
function submitCheckOut() {
    const staff = findStaffById($("#checkOutName").val());
    const dutyType = $("#checkOutType").val();
    const serviceType = dutyType === "協勤" ? $("#serviceType").val() : "";

    if (!staff) {
        showModalMessage("#checkOutMessage", "找不到簽退人員資料");
        return;
    }

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
        if (currentUser && currentUser.id === staff.id) {
            renderAttendanceTable();
            renderSummary();
        }

        window.checkOutModal.hide();
        showAlert("success", "簽退成功");
        return;
    }

    postJson("update", openRecord)
        .then(function () {
            if (currentUser && currentUser.id === staff.id) {
                renderAttendanceTable();
                renderSummary();
            }

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

/* 渲染出勤表格 */
function renderAttendanceTable() {
    const filtered = getFilteredAttendanceRecords();

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

/* 依照目前使用者 + 全部 / 月份 / 日期區間篩選出勤紀錄 */
function getFilteredAttendanceRecords() {
    if (!currentUser) {
        return [];
    }

    const mode = $("#recordFilterMode").val();
    const month = $("#monthFilter").val();
    const startDate = $("#startDateFilter").val();
    const endDate = $("#endDateFilter").val();

    return attendanceList.filter(function (item) {
        if (!item.checkInDate) return false;
        if (item.staffId !== currentUser.id) return false;

        if (mode === "all") {
            return true;
        }

        if (mode === "month") {
            return month ? item.checkInDate.startsWith(month) : true;
        }

        if (mode === "range") {
            if (startDate && item.checkInDate < startDate) return false;
            if (endDate && item.checkInDate > endDate) return false;
            return true;
        }

        return true;
    });
}

/* 渲染 Summary：只統計目前使用者 */
function renderSummary() {
    if (!currentUser) {
        resetSummary();
        return;
    }

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentYear = String(now.getFullYear());

    const userRecords = attendanceList.filter(function (item) {
        return item.staffId === currentUser.id;
    });

    const dutyRecords = userRecords.filter(function (item) {
        return item.dutyType === "協勤" && item.hours;
    });

    const monthHours = sumHours(dutyRecords.filter(function (item) {
        return item.checkInDate && item.checkInDate.startsWith(currentMonth);
    }));

    const threeMonthHours = sumHours(dutyRecords.filter(function (item) {
        return isWithinRecentMonths(item.checkInDate, now, 3);
    }));

    const totalHours = sumHours(dutyRecords);

    const isMonthlyCompleted = monthHours >= appConfig.rules.monthlyDutyTargetHours;
    const displayHours = isMonthlyCompleted ? monthHours : threeMonthHours;
    const displayTarget = isMonthlyCompleted
        ? appConfig.rules.monthlyDutyTargetHours
        : appConfig.rules.threeMonthDutyTargetHours;

    const trainingCount = userRecords.filter(function (item) {
        return item.dutyType === "常年訓練" &&
            item.serviceType === "簽到" &&
            item.checkInDate &&
            item.checkInDate.startsWith(currentYear);
    }).length;

    $("#summaryTotalHours").text(totalHours);

    $("#summaryMonthTitle").text(isMonthlyCompleted ? "本月協勤時數" : "近三個月協勤時數");
    $("#summaryMonthHours").text(displayHours);
    $("#summaryMonthNote").text(isMonthlyCompleted ? "本月已達 4 小時目標" : "本月未滿 4 小時，改看近三個月 12 小時");

    $("#summaryTrainingYear").text(currentYear + "年");
    $("#summaryTrainingCount").text(trainingCount);
    $("#summaryTrainingCountText").text(`${trainingCount}/${appConfig.rules.yearlyTrainingTargetCount}次`);

    updateProgress("#monthProgress", displayHours, displayTarget);
    updateProgress("#trainingProgress", trainingCount, appConfig.rules.yearlyTrainingTargetCount);
}

/* 清空 Summary */
function resetSummary() {
    const now = new Date();

    $("#summaryTotalHours").text(0);
    $("#summaryMonthTitle").text("本月協勤時數");
    $("#summaryMonthHours").text(0);
    $("#summaryMonthNote").text("請先切換使用者");
    $("#summaryTrainingYear").text(now.getFullYear() + "年");
    $("#summaryTrainingCount").text(0);
    $("#summaryTrainingCountText").text(`0/${appConfig.rules.yearlyTrainingTargetCount}次`);

    updateProgress("#monthProgress", 0, appConfig.rules.monthlyDutyTargetHours);
    updateProgress("#trainingProgress", 0, appConfig.rules.yearlyTrainingTargetCount);
}

/* 更新 Progress，依完成率套用紅 / 黃 / 綠 */
function updateProgress(selector, value, target) {
    const percent = target <= 0 ? 0 : Math.min(100, Math.round((value / target) * 100));
    const progressBar = $(selector);

    progressBar
        .removeClass("bg-danger bg-warning bg-success")
        .css("width", percent + "%")
        .text(percent + "%");

    if (percent >= appConfig.rules.progressSuccessPercent) {
        progressBar.addClass("bg-success");
    } else if (percent >= appConfig.rules.progressWarningPercent) {
        progressBar.addClass("bg-warning");
    } else {
        progressBar.addClass("bg-danger");
    }
}

/* 初始化簽名板 */
function initSignatureCanvas() {
    const canvas = document.getElementById("signatureCanvas");
    const context = canvas.getContext("2d");

    let isDrawing = false;
    let hasDrawn = false;

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
        hasDrawn = true;

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

    function end(event) {
        event.preventDefault();
        isDrawing = false;
    }

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("mouseleave", end);

    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end, { passive: false });

    signaturePad = {
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

    resizeSignatureCanvas();
}

/* 重新計算簽名板尺寸 */
function resizeSignatureCanvas() {
    const canvas = document.getElementById("signatureCanvas");
    if (!canvas) return;

    const context = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();

    if (rect.width <= 0) return;

    canvas.width = rect.width;
    canvas.height = 180;

    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#000000";
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

/* 工具：判斷是否在最近 N 個月 */
function isWithinRecentMonths(dateText, baseDate, monthCount) {
    if (!dateText) return false;

    const recordDate = new Date(`${dateText}T00:00:00`);
    const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth() - monthCount + 1, 1);
    const endDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);

    return recordDate >= startDate && recordDate < endDate;
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
