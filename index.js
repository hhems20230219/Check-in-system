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
    logInfo("系統初始化開始");

    initClock();
    initTimeOptions();
    initModals();
    initEvents();
    initSignatureCanvas();
    initRecordFilters();
    initDataTable();

    loadInitialData();
    attendanceLocation.refreshLocation(updateLocationUi);

    logInfo("系統初始化流程已完成，等待資料與定位回應");
});

/* 工程用 Log */
function logInfo(message, data) {
    console.log(`[INFO] ${message}`, data || "");
}

function logWarn(message, data) {
    console.warn(`[WARN] ${message}`, data || "");
}

function logError(message, error) {
    console.error(`[ERROR] ${message}`, error || "");
}

/* 每秒更新時間 */
function initClock() {
    updateClock();
    setInterval(updateClock, 1000);
    logInfo("時間模組初始化完成");
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

    logInfo("時間選單初始化完成", { optionCount: options.length });
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
        logInfo("簽退 Modal 已開啟，簽名板已重新計算尺寸並清空");
    });

    logInfo("Modal 初始化完成");
}

/* 綁定事件 */
function initEvents() {
    $("#btnOpenUserModal").on("click", openUserModal);
    $("#btnSaveUser").on("click", saveCurrentUser);

    $("#btnRefreshLocation").on("click", function () {
        logInfo("使用者觸發重新定位");
        attendanceLocation.refreshLocation(updateLocationUi);
    });

    $("#btnOpenCheckInModal").on("click", openCheckInModal);
    $("#btnOpenCheckOutModal").on("click", openCheckOutModal);

    $("#checkInType").on("change", updateCheckInFields);
    $("#checkOutType, #serviceType").on("change", updateCheckOutFields);

    $("#userSelect").on("change", function () {
        logInfo("切換使用者 Modal 下拉選單變更", { staffId: $(this).val() });
        syncStaffToUserFields($(this).val());
    });

    $("#checkInName").on("change", function () {
        logInfo("簽到 Modal 姓名變更", { staffId: $(this).val() });
        syncStaffToCheckInFields($(this).val());
    });

    $("#checkOutName").on("change", function () {
        logInfo("簽退 Modal 姓名變更", { staffId: $(this).val() });
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
        logInfo("簽名板已清除");
    });

    $(window).on("resize", function () {
        resizeSignatureCanvas();
    });

    logInfo("事件綁定完成");
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

    logInfo("出勤紀錄篩選條件初始化完成", {
        mode: "month",
        month: thisMonth
    });
}

/* 更新出勤紀錄篩選 UI */
function updateRecordFilterUi() {
    const mode = $("#recordFilterMode").val();

    $("#monthFilter").toggleClass("d-none", mode !== "month");
    $("#startDateFilter").toggleClass("d-none", mode !== "range");
    $("#endDateFilter").toggleClass("d-none", mode !== "range");

    logInfo("出勤紀錄篩選 UI 已更新", { mode: mode });
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

    logInfo("DataTables 初始化完成");
}

/* 載入初始資料 */
function loadInitialData() {
    if (appConfig.useMockData) {
        logInfo("資料來源模式：mockData.json");

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

                logInfo("mockData.json 資料載入完成", {
                    staffCount: staffList.length,
                    attendanceCount: attendanceList.length
                });

                afterDataLoaded();
            })
            .catch(function (error) {
                showAlert("danger", "讀取範例資料失敗：" + error.message);
                logError("mockData.json 資料載入失敗", error);
            });

        return;
    }

    logInfo("資料來源模式：Google Sheet API");

    fetchJson("readAll", {})
        .then(function (result) {
            staffList = result.staff || [];
            attendanceList = result.attendance || [];

            logInfo("Google Sheet 資料載入完成", {
                staffCount: staffList.length,
                attendanceCount: attendanceList.length
            });

            afterDataLoaded();
        })
        .catch(function (error) {
            showAlert("danger", "讀取資料失敗：" + error.message);
            logError("Google Sheet 資料讀取失敗", error);
        });
}

/* 資料載入後處理 */
function afterDataLoaded() {
    bindStaffOptions();
    restoreCurrentUser();

    if (currentUser) {
        setModalStaffValue(currentUser.id);
    } else {
        clearCurrentUserState();
    }

    renderAttendanceTable();
    renderSummary();

    if (!currentUser) {
        window.userModal.show();
        logWarn("目前沒有可用的目前使用者，已開啟切換使用者 Modal");
    }

    logInfo("資料載入後處理完成", {
        currentUser: currentUser ? currentUser.name : null
    });
}

/* 綁定人員下拉，只顯示啟用人員 */
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
    } else {
        clearModalStaffFields();
    }

    logInfo("人員下拉選單綁定完成", {
        enabledStaffCount: enabledStaff.length
    });
}

/* 取得啟用人員 */
function getEnabledStaffList() {
    return staffList.filter(function (item) {
        return isStaffEnabled(item);
    });
}

/* 判斷人員是否啟用 */
function isStaffEnabled(staff) {
    if (!staff) return false;

    return staff.enabled === true ||
        staff.enabled === "TRUE" ||
        staff.enabled === "true" ||
        staff.enabled === "是" ||
        staff.enabled === 1;
}

/* 依 id 找啟用人員 */
function findEnabledStaffById(id) {
    const staff = findStaffById(id);
    return isStaffEnabled(staff) ? staff : null;
}

/* 同步三個 Modal 的人員選擇 */
function setModalStaffValue(staffId) {
    const staff = findEnabledStaffById(staffId);
    if (!staff) {
        clearModalStaffFields();
        logWarn("同步 Modal 人員失敗，找不到啟用人員", { staffId: staffId });
        return;
    }

    $("#userSelect").val(staff.id);
    $("#checkInName").val(staff.id);
    $("#checkOutName").val(staff.id);

    syncStaffToUserFields(staff.id);
    syncStaffToCheckInFields(staff.id);
    syncStaffToCheckOutFields(staff.id);

    logInfo("三個 Modal 人員欄位已同步", {
        staffId: staff.id,
        name: staff.name
    });
}

/* 清空目前使用者狀態 */
function clearCurrentUserState() {
    currentUser = null;
    localStorage.removeItem(appConfig.storageKeyCurrentUser);
    updateUserUi();
    clearModalStaffFields();

    logWarn("目前使用者狀態已清空");
}

/* 清空 Modal 人員欄位 */
function clearModalStaffFields() {
    $("#userUnit").val("");
    $("#userTitle").val("");
    $("#checkInTitle").val("");
    $("#checkOutTitle").val("");

    $("#userSelect").val("");
    $("#checkInName").val("");
    $("#checkOutName").val("");

    logInfo("Modal 人員欄位已清空");
}

/* 切換使用者欄位同步 */
function syncStaffToUserFields(staffId) {
    const staff = findEnabledStaffById(staffId);

    if (!staff) {
        $("#userUnit").val("");
        $("#userTitle").val("");
        logWarn("切換使用者欄位同步失敗，人員不存在或已停用", { staffId: staffId });
        return;
    }

    $("#userUnit").val(staff.unit);
    $("#userTitle").val(staff.title);
}

/* 簽到欄位同步 */
function syncStaffToCheckInFields(staffId) {
    const staff = findEnabledStaffById(staffId);

    if (!staff) {
        $("#checkInTitle").val("");
        logWarn("簽到欄位同步失敗，人員不存在或已停用", { staffId: staffId });
        return;
    }

    $("#checkInTitle").val(staff.title);
}

/* 簽退欄位同步 */
function syncStaffToCheckOutFields(staffId) {
    const staff = findEnabledStaffById(staffId);

    if (!staff) {
        $("#checkOutTitle").val("");
        logWarn("簽退欄位同步失敗，人員不存在或已停用", { staffId: staffId });
        return;
    }

    $("#checkOutTitle").val(staff.title);
}

/* 開啟使用者切換 */
function openUserModal() {
    if (currentUser && findEnabledStaffById(currentUser.id)) {
        $("#userSelect").val(currentUser.id);
        syncStaffToUserFields(currentUser.id);
        logInfo("開啟切換使用者 Modal", { currentUserId: currentUser.id });
    } else {
        clearCurrentUserState();
        logWarn("開啟切換使用者 Modal 前偵測到目前使用者不可用");
    }

    window.userModal.show();
}

/* 儲存目前使用者 */
function saveCurrentUser() {
    const staff = findEnabledStaffById($("#userSelect").val());

    if (!staff) {
        clearCurrentUserState();
        renderAttendanceTable();
        renderSummary();
        showAlert("danger", "此人員已停用，請重新選擇啟用中的人員");
        logWarn("儲存目前使用者失敗，人員不存在或已停用");
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

    logInfo("目前使用者切換完成", {
        staffId: currentUser.id,
        name: currentUser.name,
        unit: currentUser.unit,
        title: currentUser.title
    });
}

/* 還原使用者 */
function restoreCurrentUser() {
    const saved = localStorage.getItem(appConfig.storageKeyCurrentUser);

    if (!saved) {
        clearCurrentUserState();
        logInfo("沒有可還原的使用者暫存資料");
        return;
    }

    let savedUser = null;

    try {
        savedUser = JSON.parse(saved);
    } catch (error) {
        logError("使用者暫存資料格式錯誤，已清除", error);
        clearCurrentUserState();
        return;
    }

    const staff = findEnabledStaffById(savedUser.id);

    if (!staff) {
        logWarn("原本選擇的人員已停用或不存在，已清除目前使用者", { staffId: savedUser.id });
        clearCurrentUserState();
        return;
    }

    currentUser = staff;
    updateUserUi();

    logInfo("目前使用者已從 localStorage 還原", {
        staffId: currentUser.id,
        name: currentUser.name
    });
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

    logInfo("簽到 Modal 已開啟", {
        staffId: currentUser.id,
        name: currentUser.name
    });
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

    logInfo("簽退 Modal 已開啟", {
        staffId: currentUser.id,
        name: currentUser.name
    });
}

/* 簽到欄位切換 */
function updateCheckInFields() {
    const dutyType = $("#checkInType").val();

    $("#trainingActionArea").toggleClass("d-none", dutyType !== "常年訓練");

    logInfo("簽到欄位狀態已更新", {
        dutyType: dutyType,
        showTrainingAction: dutyType === "常年訓練"
    });
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

    logInfo("簽退欄位狀態已更新", {
        dutyType: dutyType,
        serviceType: serviceType,
        showWorkContent: shouldShowWorkContent
    });
}

/* 送出簽到 */
function submitCheckIn() {
    const staff = findEnabledStaffById($("#checkInName").val());
    const dutyType = $("#checkInType").val();

    logInfo("開始執行簽到送出流程", {
        staffId: $("#checkInName").val(),
        dutyType: dutyType
    });

    if (!staff) {
        showModalMessage("#checkInMessage", "此人員已停用，無法簽到");
        logWarn("簽到失敗，人員不存在或已停用");
        return;
    }

    if (!canOperateByLocation(dutyType)) {
        showModalMessage("#checkInMessage", "此協勤種類需要定位成功後才能簽到");
        logWarn("簽到失敗，定位條件不符合", { dutyType: dutyType });
        return;
    }

    if (dutyType === "常年訓練" && hasMonthlyTrainingRecord(staff.id, $("#checkInDate").val())) {
        showModalMessage("#checkInMessage", "本月已有常年訓練簽到或請假紀錄，不能重複登記");
        logWarn("簽到失敗，本月已有常年訓練紀錄", { staffId: staff.id });
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

    if (!confirmCheckIn(record)) {
        logInfo("使用者取消簽到送出", { recordId: record.id });
        return;
    }

    if (appConfig.useMockData) {
        attendanceList.push(record);

        if (currentUser && currentUser.id === staff.id) {
            renderAttendanceTable();
            renderSummary();
        }

        window.checkInModal.hide();
        showAlert("success", "簽到成功");

        logInfo("簽到成功，資料已寫入前端暫存", {
            recordId: record.id,
            staffId: staff.id
        });

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

            logInfo("簽到成功，API 已完成新增", {
                recordId: record.id,
                staffId: staff.id
            });
        })
        .catch(function (error) {
            showModalMessage("#checkInMessage", "簽到失敗：" + error.message);
            logError("簽到 API 新增失敗", error);
        });
}

/* 送出簽退 */
function submitCheckOut() {
    const staff = findEnabledStaffById($("#checkOutName").val());
    const dutyType = $("#checkOutType").val();
    const serviceType = dutyType === "協勤" ? $("#serviceType").val() : "";

    logInfo("開始執行簽退送出流程", {
        staffId: $("#checkOutName").val(),
        dutyType: dutyType,
        serviceType: serviceType
    });

    if (!staff) {
        showModalMessage("#checkOutMessage", "此人員已停用，無法簽退");
        logWarn("簽退失敗，人員不存在或已停用");
        return;
    }

    if (!canOperateByLocation(dutyType)) {
        showModalMessage("#checkOutMessage", "此協勤種類需要定位成功後才能簽退");
        logWarn("簽退失敗，定位條件不符合", { dutyType: dutyType });
        return;
    }

    const openRecord = findLatestOpenRecord(staff.id, dutyType);

    if (!openRecord) {
        showModalMessage("#checkOutMessage", "找不到尚未簽退的紀錄");
        logWarn("簽退失敗，找不到未簽退紀錄", {
            staffId: staff.id,
            dutyType: dutyType
        });
        return;
    }

    const shouldNeedWorkContent =
        dutyType === "公差勤務" ||
        (dutyType === "協勤" && serviceType === "出勤");

    if (shouldNeedWorkContent && !$("#workContent").val().trim()) {
        showModalMessage("#checkOutMessage", "請填寫工作內容");
        logWarn("簽退失敗，缺少必要工作內容");
        return;
    }

    if (signaturePad.isEmpty()) {
        showModalMessage("#checkOutMessage", "請完成簽名");
        logWarn("簽退失敗，尚未完成簽名");
        return;
    }

    const checkOutDate = $("#checkOutDate").val();
    const checkOutTime = $("#checkOutTime").val();
    const workContent = $("#workContent").val().trim();
    const calculatedHours = calculateHours(
        openRecord.checkInDate,
        openRecord.checkInTime,
        checkOutDate,
        checkOutTime
    );

    const previewRecord = Object.assign({}, openRecord, {
        serviceType: serviceType,
        checkOutDate: checkOutDate,
        checkOutTime: checkOutTime,
        workContent: workContent,
        hours: calculatedHours
    });

    if (!confirmCheckOut(previewRecord)) {
        logInfo("使用者取消簽退送出", { recordId: openRecord.id });
        return;
    }

    openRecord.serviceType = serviceType;
    openRecord.checkOutDate = checkOutDate;
    openRecord.checkOutTime = checkOutTime;
    openRecord.workContent = workContent;
    openRecord.signature = signaturePad.toDataUrl();
    openRecord.hours = calculatedHours;

    if (appConfig.useMockData) {
        if (currentUser && currentUser.id === staff.id) {
            renderAttendanceTable();
            renderSummary();
        }

        window.checkOutModal.hide();
        showAlert("success", "簽退成功");

        logInfo("簽退成功，資料已更新至前端暫存", {
            recordId: openRecord.id,
            staffId: staff.id,
            hours: calculatedHours
        });

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

            logInfo("簽退成功，API 已完成更新", {
                recordId: openRecord.id,
                staffId: staff.id,
                hours: calculatedHours
            });
        })
        .catch(function (error) {
            showModalMessage("#checkOutMessage", "簽退失敗：" + error.message);
            logError("簽退 API 更新失敗", error);
        });
}

/* 簽到送出前確認 */
function confirmCheckIn(record) {
    logInfo("顯示簽到確認視窗", { recordId: record.id });

    const message =
        "請確認簽到資料是否正確：\n\n" +
        `單位：${record.unit}\n` +
        `職稱：${record.title}\n` +
        `姓名：${record.name}\n` +
        `協勤種類：${record.dutyType}\n` +
        `服勤類別：${record.serviceType || "-"}\n` +
        `簽到日期：${record.checkInDate}\n` +
        `簽到時間：${record.checkInTime}\n\n` +
        "確定要送出嗎？";

    return window.confirm(message);
}

/* 簽退送出前確認 */
function confirmCheckOut(record) {
    logInfo("顯示簽退確認視窗", { recordId: record.id });

    const message =
        "請確認簽退資料是否正確：\n\n" +
        `單位：${record.unit}\n` +
        `職稱：${record.title}\n` +
        `姓名：${record.name}\n` +
        `協勤種類：${record.dutyType}\n` +
        `服勤類別：${record.serviceType || "-"}\n` +
        `簽到日期：${record.checkInDate}\n` +
        `簽到時間：${record.checkInTime}\n` +
        `簽退日期：${record.checkOutDate}\n` +
        `簽退時間：${record.checkOutTime}\n` +
        `時數：${record.hours} 小時\n` +
        `工作內容：${record.workContent || "-"}\n\n` +
        "確定要送出嗎？";

    return window.confirm(message);
}

/* 判斷定位限制 */
function canOperateByLocation(dutyType) {
    if (dutyType === "公差勤務") {
        logInfo("定位驗證略過：公差勤務不需要定位");
        return true;
    }

    const locationState = attendanceLocation.getCurrentState();
    const isValid = locationState.isValid === true;

    logInfo("定位驗證結果", {
        dutyType: dutyType,
        isValid: isValid,
        message: locationState.message
    });

    return isValid;
}

/* 更新定位畫面 */
function updateLocationUi(state) {
    const badge = $("#locationStatusBadge");

    badge.removeClass(
        "text-bg-secondary text-bg-success text-bg-danger text-bg-warning"
    );

    if (!state.isLocated) {
        if (state.message.includes("逾時")) {
            badge
                .addClass("text-bg-warning")
                .text("定位逾時");
        } else {
            badge
                .addClass("text-bg-danger")
                .text("定位失敗");
        }
    } else if (state.isValid) {
        badge
            .addClass("text-bg-success")
            .text("定位成功");
    } else {
        badge
            .addClass("text-bg-danger")
            .text("定位失敗");
    }

    showAlert(
        state.isValid ? "success" : "warning",
        state.message
    );

    logInfo("定位狀態更新", state);
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

    logInfo("出勤紀錄表格已重新渲染", {
        rowCount: filtered.length,
        currentUser: currentUser ? currentUser.name : null
    });
}

/* 依照目前使用者 + 全部 / 月份 / 日期區間篩選出勤紀錄 */
function getFilteredAttendanceRecords() {
    if (!currentUser) {
        logWarn("出勤紀錄篩選中止，尚未選擇目前使用者");
        return [];
    }

    const mode = $("#recordFilterMode").val();
    const month = $("#monthFilter").val();
    const startDate = $("#startDateFilter").val();
    const endDate = $("#endDateFilter").val();

    const filteredRecords = attendanceList.filter(function (item) {
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

    logInfo("出勤紀錄篩選完成", {
        mode: mode,
        month: month,
        startDate: startDate,
        endDate: endDate,
        resultCount: filteredRecords.length
    });

    return filteredRecords;
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
    const recentMonthRange = getRecentMonthRangeText(now, 3);

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

    const progressValue = isMonthlyCompleted ? monthHours : threeMonthHours;
    const progressTarget = isMonthlyCompleted
        ? appConfig.rules.monthlyDutyTargetHours
        : appConfig.rules.threeMonthDutyTargetHours;

    const trainingCount = userRecords.filter(function (item) {
        return item.dutyType === "常年訓練" &&
            item.serviceType === "簽到" &&
            item.checkInDate &&
            item.checkInDate.startsWith(currentYear);
    }).length;

    $("#summaryTotalHours").text(totalHours);
    $("#summaryMonthTitle").text("本月協勤時數");
    $("#summaryMonthHours").text(monthHours);

    if (isMonthlyCompleted) {
        $("#summaryMonthNote").text(`本月已達目標 ${appConfig.rules.monthlyDutyTargetHours} 小時`);
    } else {
        $("#summaryMonthNote").text(
            `本月 ${monthHours} 小時；${recentMonthRange} ${threeMonthHours} / ${appConfig.rules.threeMonthDutyTargetHours} 小時`
        );
    }

    $("#summaryTrainingYear").text(currentYear + "年");
    $("#summaryTrainingCount").text(trainingCount);
    $("#summaryTrainingCountText").text(`${trainingCount}/${appConfig.rules.yearlyTrainingTargetCount}次`);

    updateProgress("#monthProgress", progressValue, progressTarget);
    updateProgress("#trainingProgress", trainingCount, appConfig.rules.yearlyTrainingTargetCount);

    logInfo("Summary 已重新計算", {
        staffId: currentUser.id,
        name: currentUser.name,
        totalHours: totalHours,
        monthHours: monthHours,
        threeMonthHours: threeMonthHours,
        trainingCount: trainingCount
    });
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

    logInfo("Summary 已清空");
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
    logInfo("簽名板初始化完成");
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

    logInfo("API GET 請求送出", { action: action, data: data });

    return fetch(`${appConfig.googleScriptUrl}?${params.toString()}`)
        .then(handleApiResponse);
}

/* API POST */
function postJson(action, data) {
    logInfo("API POST 請求送出", { action: action, data: data });

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

        logInfo("API 回應成功", result);
        return result.data;
    });
}

/* 工具：確認使用者 */
function ensureCurrentUser() {
    if (!currentUser || !findEnabledStaffById(currentUser.id)) {
        clearCurrentUserState();
        renderAttendanceTable();
        renderSummary();

        showAlert("warning", "目前沒有啟用中的使用者，請先切換使用者");
        window.userModal.show();

        logWarn("使用者驗證失敗，目前沒有啟用中的使用者");
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

    const record = records.length > 0 ? records[records.length - 1] : null;

    logInfo("查詢最後一筆未簽退紀錄完成", {
        staffId: staffId,
        dutyType: dutyType,
        found: record !== null
    });

    return record;
}

/* 工具：判斷當月是否已有常訓 */
function hasMonthlyTrainingRecord(staffId, dateText) {
    const month = dateText.substring(0, 7);

    const exists = attendanceList.some(function (item) {
        return item.staffId === staffId &&
            item.dutyType === "常年訓練" &&
            item.checkInDate &&
            item.checkInDate.startsWith(month);
    });

    logInfo("常年訓練重複檢查完成", {
        staffId: staffId,
        month: month,
        exists: exists
    });

    return exists;
}

/* 工具：判斷是否在最近 N 個月 */
function isWithinRecentMonths(dateText, baseDate, monthCount) {
    if (!dateText) return false;

    const recordDate = new Date(`${dateText}T00:00:00`);
    const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth() - monthCount + 1, 1);
    const endDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);

    return recordDate >= startDate && recordDate < endDate;
}

/* 工具：產生最近 N 個月顯示文字 */
function getRecentMonthRangeText(baseDate, monthCount) {
    const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth() - monthCount + 1, 1);
    const endDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);

    const startMonth = String(startDate.getMonth() + 1).padStart(2, "0");
    const endMonth = String(endDate.getMonth() + 1).padStart(2, "0");

    return `${startMonth}月-${endMonth}月`;
}

/* 工具：計算時數 */
function calculateHours(startDate, startTime, endDate, endTime) {
    const start = new Date(`${startDate}T${startTime}:00`);
    const end = new Date(`${endDate}T${endTime}:00`);

    const diff = (end - start) / 1000 / 60 / 60;
    const hours = diff > 0 ? Math.round(diff * 10) / 10 : 0;

    logInfo("協勤時數計算完成", {
        startDate: startDate,
        startTime: startTime,
        endDate: endDate,
        endTime: endTime,
        hours: hours
    });

    return hours;
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

    logInfo("系統通知已更新", {
        type: type,
        message: message
    });
}

/* Modal 訊息 */
function showModalMessage(selector, message) {
    $(selector).removeClass("d-none").text(message);

    logWarn("Modal 驗證訊息已顯示", {
        selector: selector,
        message: message
    });
}

/* 隱藏 Modal 訊息 */
function hideModalMessage(selector) {
    $(selector).addClass("d-none").text("");
}
