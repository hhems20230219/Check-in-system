let people = [];
let currentPerson = null;
let serviceRecords = [];
let serviceRecordTable = null;
let currentLocationResult = null;
let editingRecordId = null;
let sampleDataCache = null;
let sampleRecordNextId = 1000;

let signaturePadState = {
  hasSignature: false
};

const servicePageConfig = {
  enableTableActions: true
};

$(document).ready(function () {
  appLog("INFO", "service.html 初始化");

  initializeNavbar(function () {
    initializePage();
  });

  bindEvents();
  startClock();
  initializeSignatureCanvas();
});

function initializePage() {
  hideAlert();
  hideModalAlert("#checkInAlertContainer");
  hideModalAlert("#checkOutAlertContainer");
  hideModalAlert("#editRecordAlertContainer");

  setLocationBadge("notLocated");
  setDefaultFilterDates();
  fillHalfHourOptions();
  loadPeople();
  refreshLocation(false);

  updateCheckInDutyType();
  updateCheckOutDutyType();
  updateEditDutyType();
}

function bindEvents() {
  $("#modalNameSelect").on("change", handleModalNameChange);
  $("#confirmUserButton").on("click", confirmCurrentUser);

  $("#refreshLocationButton").on("click", function () {
    refreshLocation(true);
  });

  $("#openCheckInButton").on("click", openCheckInModal);
  $("#openCheckOutButton").on("click", openCheckOutModal);

  $("#checkInServiceType").on("change", updateCheckInDutyType);
  $("#checkInNameSelect").on("change", syncCheckInTitle);

  $("#checkOutServiceTypeSelect").on("change", updateCheckOutDutyType);
  $("#checkOutDutyTypeSelect").on("change", updateCheckOutContentBlock);
  $("#checkOutNameSelect").on("change", syncCheckOutTitle);

  $("#checkInForm").on("submit", submitCheckIn);
  $("#checkOutForm").on("submit", submitCheckOut);
  $("#editRecordForm").on("submit", submitEditRecord);

  $("#editServiceTypeSelect").on("change", updateEditDutyType);

  $("#searchRecordButton").on("click", loadServiceRecords);
  $("#clearFilterButton").on("click", clearFilters);
  $("#clearSignatureButton").on("click", clearSignature);

  $("#checkInModal").on("hidden.bs.modal", function () {
    hideModalAlert("#checkInAlertContainer");
  });

  $("#checkOutModal").on("hidden.bs.modal", function () {
    hideModalAlert("#checkOutAlertContainer");
  });

  $("#editRecordModal").on("hidden.bs.modal", function () {
    hideModalAlert("#editRecordAlertContainer");
  });
}

function callApi(action, payload) {
  appLog("INFO", "呼叫 API", { action: action, payload: payload });

  if (appConfig.useSampleData) {
    return loadSampleData(action, payload || {});
  }

  return $.ajax({
    url: appConfig.apiUrl,
    method: "POST",
    data: JSON.stringify({
      action: action,
      payload: payload || {}
    }),
    contentType: "text/plain;charset=utf-8"
  });
}

function loadSampleData(action, payload) {
  const loadPromise = sampleDataCache
    ? $.Deferred().resolve(sampleDataCache).promise()
    : $.getJSON("sampleData.json").then(function (data) {
        sampleDataCache = data;
        sampleDataCache.serviceRecords = (sampleDataCache.serviceRecords || []).map(function (record, index) {
          return Object.assign({ recordId: index + 2 }, record);
        });

        sampleRecordNextId = getNextSampleRecordId(sampleDataCache.serviceRecords);
        return sampleDataCache;
      });

  return loadPromise.then(function (sampleData) {
    if (action === "getPeople") {
      return {
        success: true,
        message: "操作成功",
        data: sampleData.people || []
      };
    }

    if (action === "getServiceRecords") {
      return {
        success: true,
        message: "操作成功",
        data: filterSampleServiceRecords(sampleData.serviceRecords || [], payload)
      };
    }

    if (action === "createServiceRecord") {
      const openRecord = findOpenRecordFromList(sampleData.serviceRecords, payload.record.name);

      if (openRecord) {
        return {
          success: false,
          message: "已有尚未簽退的簽到紀錄，請先完成簽退後再簽到",
          data: null
        };
      }

      const newRecord = Object.assign({ recordId: sampleRecordNextId++ }, payload.record);
      sampleData.serviceRecords.push(newRecord);

      return {
        success: true,
        message: "範例模式：簽到成功，資料已暫存在前端記憶體",
        data: newRecord
      };
    }

    if (action === "updateOpenRecord") {
      const openRecord = findOpenRecordFromList(sampleData.serviceRecords, payload.record.name);

      if (!openRecord) {
        return {
          success: false,
          message: "找不到尚未簽退的簽到紀錄，請先簽到後再簽退",
          data: null
        };
      }

      const index = sampleData.serviceRecords.findIndex(function (item) {
        return Number(item.recordId) === Number(openRecord.recordId);
      });

      sampleData.serviceRecords[index] = Object.assign(
        {},
        sampleData.serviceRecords[index],
        payload.record,
        { recordId: openRecord.recordId }
      );

      return {
        success: true,
        message: "範例模式：簽退成功",
        data: sampleData.serviceRecords[index]
      };
    }

    if (action === "editServiceRecord") {
      const recordId = Number(payload.record.recordId);
      const index = sampleData.serviceRecords.findIndex(function (item) {
        return Number(item.recordId) === recordId;
      });

      if (index < 0) {
        return {
          success: false,
          message: "找不到要修改的紀錄",
          data: null
        };
      }

      sampleData.serviceRecords[index] = Object.assign({}, sampleData.serviceRecords[index], payload.record);

      return {
        success: true,
        message: "範例模式：修改成功",
        data: sampleData.serviceRecords[index]
      };
    }

    if (action === "deleteServiceRecord") {
      const recordId = Number(payload.recordId);

      sampleData.serviceRecords = sampleData.serviceRecords.filter(function (item) {
        return Number(item.recordId) !== recordId;
      });

      return {
        success: true,
        message: "範例模式：刪除成功",
        data: null
      };
    }

    return {
      success: false,
      message: "不支援的範例 action",
      data: null
    };
  });
}

function getNextSampleRecordId(records) {
  const maxRecordId = records.reduce(function (maxValue, record) {
    return Math.max(maxValue, Number(record.recordId || 0));
  }, 0);

  return Math.max(1000, maxRecordId + 1);
}

function filterSampleServiceRecords(records, payload) {
  let filteredRecords = records.slice();

  if (payload.personName) {
    filteredRecords = filteredRecords.filter(function (item) {
      return item.name === payload.personName;
    });
  }

  if (payload.serviceType) {
    filteredRecords = filteredRecords.filter(function (item) {
      return item.serviceType === payload.serviceType;
    });
  }

  if (payload.startDate) {
    filteredRecords = filteredRecords.filter(function (item) {
      return item.eventDate >= payload.startDate;
    });
  }

  if (payload.endDate) {
    filteredRecords = filteredRecords.filter(function (item) {
      return item.eventDate <= payload.endDate;
    });
  }

  return filteredRecords;
}

function loadPeople() {
  callApi("getPeople", {}).then(function (response) {
    if (!response.success) {
      showAlert(response.message, "danger");
      return;
    }

    people = response.data || [];
    renderPeopleOptions();

    const savedName = localStorage.getItem(appConfig.storageKeys.currentPersonName);

    if (savedName) {
      setCurrentPerson(savedName);
    } else {
      resetNavbarPerson();
      $("#userModal").modal("show");
    }
  });
}

function renderPeopleOptions() {
  const options = [`<option value="">${appConfig.selectText.pleaseSelectPerson}</option>`];

  people.forEach(function (person) {
    options.push(`<option value="${escapeHtml(person.name)}">${escapeHtml(person.name)}</option>`);
  });

  $("#modalNameSelect,#checkInNameSelect,#checkOutNameSelect,#editNameSelect").html(options.join(""));
}

function handleModalNameChange() {
  const person = findPerson($("#modalNameSelect").val());

  $("#modalUnitInput").val(person ? person.unit : "-");
  $("#modalTitleInput").val(person ? person.title : "-");
}

function confirmCurrentUser() {
  const personName = $("#modalNameSelect").val();

  if (!personName) {
    showAlert("請選擇人員", "warning");
    return;
  }

  localStorage.setItem(appConfig.storageKeys.currentPersonName, personName);
  $("#userModal").modal("hide");
  setCurrentPerson(personName);
}

function setCurrentPerson(personName) {
  currentPerson = findPerson(personName);

  if (!currentPerson) {
    showAlert("找不到人員資料", "danger");
    resetNavbarPerson();
    return;
  }

  updateNavbarPerson(currentPerson);

  $("#modalNameSelect,#checkInNameSelect,#checkOutNameSelect,#editNameSelect").val(personName);

  handleModalNameChange();
  syncCheckInTitle();
  syncCheckOutTitle();
  loadServiceRecords();
}

function findPerson(personName) {
  return people.find(function (item) {
    return item.name === personName;
  });
}

function loadServiceRecords() {
  if (!currentPerson) {
    renderServiceRecordTable([]);
    hideAlert();
    return;
  }

  callApi("getServiceRecords", buildFilterPayload()).then(function (response) {
    if (!response.success) {
      showAlert(response.message, "danger");
      return;
    }

    serviceRecords = response.data || [];
    renderServiceRecordTable(serviceRecords);
    hideAlert();
  });
}

function buildFilterPayload() {
  const month = $("#filterMonthInput").val();
  let startDate = $("#filterStartDateInput").val();
  let endDate = $("#filterEndDateInput").val();

  if (month && !startDate && !endDate) {
    startDate = `${month}-01`;
    endDate = getMonthLastDate(month);
  }

  return {
    personName: currentPerson ? currentPerson.name : "",
    startDate: startDate,
    endDate: endDate,
    serviceType: $("#filterServiceTypeSelect").val()
  };
}

function renderServiceRecordTable(records) {
  const rows = records.map(function (record) {
    const hours = calculateRecordHours(record);

    return [
      escapeHtml(record.serviceType || "-"),
      escapeHtml(record.dutyType || "-"),
      escapeHtml(record.checkInDate || "-"),
      escapeHtml(record.checkInTime || "-"),
      escapeHtml(record.checkOutDate || "-"),
      escapeHtml(record.checkOutTime || "-"),
      `${hours} 小時`,
      buildTableActionButtons(record)
    ];
  });

  if (serviceRecordTable) {
    serviceRecordTable.clear().rows.add(rows).draw();
    return;
  }

  serviceRecordTable = new DataTable("#serviceRecordTable", {
    data: rows,
    responsive: true,
    language: {
      url: "https://cdn.datatables.net/plug-ins/2.1.8/i18n/zh-HANT.json"
    }
  });
}

function buildTableActionButtons(record) {
  if (!servicePageConfig.enableTableActions) {
    return "-";
  }

  return `
    <button class="btn btn-sm btn-outline-primary me-1" onclick="editRecord(${record.recordId})">
      <i class="fa-solid fa-pen-to-square me-1"></i>修改
    </button>
    <button class="btn btn-sm btn-outline-danger" onclick="deleteRecord(${record.recordId})">
      <i class="fa-solid fa-trash me-1"></i>刪除
    </button>
  `;
}

function openCheckInModal() {
  if (!currentPerson) {
    showAlert("請先切換使用者", "warning");
    return;
  }

  const openRecord = findOpenServiceRecord(currentPerson.name);

  if (openRecord) {
    showAlert("已有尚未簽退的簽到紀錄，請先完成簽退後再簽到", "warning");
    return;
  }

  hideModalAlert("#checkInAlertContainer");
  ensureHalfHourOptions();

  const now = new Date();

  $("#checkInServiceType").val(appConfig.serviceTypes.standby);
  $("#checkInNameSelect").val(currentPerson.name);
  $("#checkInDateInput").val(formatDate(now));
  $("#checkInTimeSelect").val(formatHalfHour(now));

  syncCheckInTitle();
  updateCheckInDutyType();

  $("#checkInModal").modal("show");
}

function openCheckOutModal() {
  if (!currentPerson) {
    showAlert("請先切換使用者", "warning");
    return;
  }

  const openRecord = findOpenServiceRecord(currentPerson.name);

  if (!openRecord) {
    showAlert("找不到尚未簽退的簽到紀錄，請先簽到後再簽退", "warning");
    return;
  }

  hideModalAlert("#checkOutAlertContainer");
  ensureHalfHourOptions();

  const now = new Date();

  editingRecordId = openRecord.recordId;
  signaturePadState.hasSignature = false;

  $("#checkOutServiceTypeSelect").val(openRecord.serviceType || appConfig.serviceTypes.standby);
  updateCheckOutDutyType();

  $("#checkOutDutyTypeSelect").val(openRecord.dutyType || "");
  $("#checkOutNameSelect").val(openRecord.name || currentPerson.name);
  $("#checkOutDateInput").val(formatDate(now));
  $("#checkOutTimeSelect").val(formatHalfHour(now));
  $("#serviceContentInput").val(openRecord.serviceContent || "");

  syncCheckOutTitle();
  updateCheckOutContentBlock();
  clearSignature();

  $("#checkOutModal").modal("show");
}

function submitCheckIn(event) {
  event.preventDefault();

  hideModalAlert("#checkInAlertContainer");

  const personName = $("#checkInNameSelect").val();
  const serviceType = $("#checkInServiceType").val();
  const dutyType = serviceType === appConfig.serviceTypes.annualTraining ? $("#checkInDutyType").val() : "";

  if (findOpenServiceRecord(personName)) {
    showModalAlert("#checkInAlertContainer", "已有尚未簽退的簽到紀錄，請先完成簽退後再簽到", "warning");
    return;
  }

  if ((serviceType === appConfig.serviceTypes.standby || serviceType === appConfig.serviceTypes.annualTraining) && !isLocationAllowed()) {
    showModalAlert("#checkInAlertContainer", getCurrentLocationBlockMessage("無法簽到"), "danger");
    return;
  }

  const checkInDate = $("#checkInDateInput").val();

  const record = {
    serviceType: serviceType,
    dutyType: dutyType,
    eventDate: checkInDate,
    checkInDate: checkInDate,
    checkInTime: $("#checkInTimeSelect").val(),
    checkOutDate: "",
    checkOutTime: "",
    name: personName,
    serviceContent: ""
  };

  callApi("createServiceRecord", { record: record }).then(function (response) {
    if (!response.success) {
      showModalAlert("#checkInAlertContainer", response.message, "danger");
      return;
    }

    syncFiltersToRecord(record);
    showAlert(response.message, "success");
    $("#checkInModal").modal("hide");
    loadServiceRecords();
  });
}

function submitCheckOut(event) {
  event.preventDefault();

  hideModalAlert("#checkOutAlertContainer");

  if (!signaturePadState.hasSignature) {
    showModalAlert("#checkOutAlertContainer", "請先完成簽名後再送出", "danger");
    return;
  }

  const personName = $("#checkOutNameSelect").val();
  const openRecord = findOpenServiceRecord(personName);

  if (!openRecord) {
    showModalAlert("#checkOutAlertContainer", "找不到尚未簽退的簽到紀錄，請確認姓名或先完成簽到", "warning");
    return;
  }

  const serviceType = $("#checkOutServiceTypeSelect").val();
  const dutyType = serviceType === appConfig.serviceTypes.standby ? $("#checkOutDutyTypeSelect").val() : "";

  const updatedRecord = {
    recordId: openRecord.recordId,
    serviceType: serviceType,
    dutyType: dutyType,
    eventDate: openRecord.eventDate,
    checkInDate: openRecord.checkInDate,
    checkInTime: openRecord.checkInTime,
    checkOutDate: $("#checkOutDateInput").val(),
    checkOutTime: $("#checkOutTimeSelect").val(),
    name: personName,
    serviceContent: shouldShowCheckOutContentByValue(serviceType, dutyType)
      ? $("#serviceContentInput").val()
      : openRecord.serviceContent || ""
  };

  callApi("updateOpenRecord", { record: updatedRecord }).then(function (response) {
    if (!response.success) {
      showModalAlert("#checkOutAlertContainer", response.message, "danger");
      return;
    }

    syncFiltersToRecord(updatedRecord);
    showAlert(response.message, "success");
    $("#checkOutModal").modal("hide");
    editingRecordId = null;
    signaturePadState.hasSignature = false;
    loadServiceRecords();
  });
}

function editRecord(recordId) {
  if (!servicePageConfig.enableTableActions) {
    showAlert("目前已關閉表格操作功能", "warning");
    return;
  }

  const record = findServiceRecordById(recordId);

  if (!record) {
    showAlert("找不到要修改的紀錄", "danger");
    return;
  }

  hideModalAlert("#editRecordAlertContainer");
  ensureHalfHourOptions();

  $("#editRecordIdInput").val(record.recordId);
  $("#editServiceTypeSelect").val(record.serviceType || appConfig.serviceTypes.standby);
  updateEditDutyType();

  $("#editDutyTypeSelect").val(record.dutyType || "");
  $("#editNameSelect").val(record.name || "");
  $("#editEventDateInput").val(record.eventDate || "");
  $("#editCheckInDateInput").val(record.checkInDate || "");
  $("#editCheckInTimeSelect").val(record.checkInTime || "");
  $("#editCheckOutDateInput").val(record.checkOutDate || "");
  $("#editCheckOutTimeSelect").val(record.checkOutTime || "");
  $("#editServiceContentInput").val(record.serviceContent || "");

  $("#editRecordModal").modal("show");
}

function submitEditRecord(event) {
  event.preventDefault();

  hideModalAlert("#editRecordAlertContainer");

  const record = {
    recordId: Number($("#editRecordIdInput").val()),
    serviceType: $("#editServiceTypeSelect").val(),
    dutyType: $("#editDutyTypeSelect").val(),
    eventDate: $("#editEventDateInput").val(),
    checkInDate: $("#editCheckInDateInput").val(),
    checkInTime: $("#editCheckInTimeSelect").val(),
    checkOutDate: $("#editCheckOutDateInput").val(),
    checkOutTime: $("#editCheckOutTimeSelect").val(),
    name: $("#editNameSelect").val(),
    serviceContent: $("#editServiceContentInput").val()
  };

  if (!record.recordId) {
    showModalAlert("#editRecordAlertContainer", "缺少紀錄 ID，無法修改", "danger");
    return;
  }

  callApi("editServiceRecord", { record: record }).then(function (response) {
    if (!response.success) {
      showModalAlert("#editRecordAlertContainer", response.message, "danger");
      return;
    }

    syncFiltersToRecord(record);
    showAlert(response.message, "success");
    $("#editRecordModal").modal("hide");
    loadServiceRecords();
  });
}

function deleteRecord(recordId) {
  if (!servicePageConfig.enableTableActions) {
    showAlert("目前已關閉表格操作功能", "warning");
    return;
  }

  if (!confirm("確定要刪除這筆紀錄？")) {
    return;
  }

  callApi("deleteServiceRecord", { recordId: recordId }).then(function (response) {
    showAlert(response.message, response.success ? "success" : "danger");

    if (response.success) {
      loadServiceRecords();
    }
  });
}

function findServiceRecordById(recordId) {
  return serviceRecords.find(function (record) {
    return Number(record.recordId) === Number(recordId);
  });
}

function findOpenServiceRecord(personName) {
  return findOpenRecordFromList(serviceRecords, personName);
}

function findOpenRecordFromList(records, personName) {
  const matchedRecords = (records || [])
    .filter(function (record) {
      return record.name === personName &&
        record.checkInDate &&
        record.checkInTime &&
        !record.checkOutDate &&
        !record.checkOutTime &&
        record.serviceType !== appConfig.serviceTypes.annualTraining;
    })
    .sort(function (a, b) {
      const aTime = `${a.checkInDate} ${a.checkInTime}`;
      const bTime = `${b.checkInDate} ${b.checkInTime}`;
      return bTime.localeCompare(aTime);
    });

  return matchedRecords.length > 0 ? matchedRecords[0] : null;
}

function updateCheckInDutyType() {
  const serviceType = $("#checkInServiceType").val();

  if (serviceType === appConfig.serviceTypes.annualTraining) {
    $("#checkInDutyTypeBlock").removeClass("d-none");
    $("#checkInDutyType").prop("required", true);
    renderOptions("#checkInDutyType", [appConfig.dutyTypes.checkIn, appConfig.dutyTypes.leave]);
    return;
  }

  $("#checkInDutyTypeBlock").addClass("d-none");
  $("#checkInDutyType").prop("required", false).html("");
}

function updateCheckOutDutyType() {
  const serviceType = $("#checkOutServiceTypeSelect").val();

  if (serviceType === appConfig.serviceTypes.standby) {
    $("#checkOutDutyTypeBlock").removeClass("d-none");
    $("#checkOutDutyTypeSelect").prop("required", true);
    renderOptions("#checkOutDutyTypeSelect", [appConfig.dutyTypes.dispatch, appConfig.dutyTypes.standby]);
  } else {
    $("#checkOutDutyTypeBlock").addClass("d-none");
    $("#checkOutDutyTypeSelect").prop("required", false).html("");
  }

  updateCheckOutContentBlock();
}

function updateEditDutyType() {
  const serviceType = $("#editServiceTypeSelect").val();

  if (serviceType === appConfig.serviceTypes.annualTraining) {
    $("#editDutyTypeBlock").removeClass("d-none");
    renderOptions("#editDutyTypeSelect", [appConfig.dutyTypes.checkIn, appConfig.dutyTypes.leave]);
    return;
  }

  if (serviceType === appConfig.serviceTypes.standby) {
    $("#editDutyTypeBlock").removeClass("d-none");
    renderOptions("#editDutyTypeSelect", [appConfig.dutyTypes.dispatch, appConfig.dutyTypes.standby]);
    return;
  }

  $("#editDutyTypeBlock").addClass("d-none");
  $("#editDutyTypeSelect").html("");
}

function updateCheckOutContentBlock() {
  const serviceType = $("#checkOutServiceTypeSelect").val();
  const dutyType = $("#checkOutDutyTypeSelect").val();

  updateCheckOutContentBlockByValue(serviceType, dutyType);
}

function updateCheckOutContentBlockByValue(serviceType, dutyType) {
  if (shouldShowCheckOutContentByValue(serviceType, dutyType)) {
    $("#serviceContentBlock").removeClass("d-none");
    return;
  }

  $("#serviceContentBlock").addClass("d-none");
  $("#serviceContentInput").val("");
}

function shouldShowCheckOutContentByValue(serviceType, dutyType) {
  if (serviceType === appConfig.serviceTypes.officialDuty) {
    return true;
  }

  return serviceType === appConfig.serviceTypes.standby && dutyType === appConfig.dutyTypes.dispatch;
}

function syncCheckInTitle() {
  const person = findPerson($("#checkInNameSelect").val());
  $("#checkInTitleInput").val(person ? person.title : "-");
}

function syncCheckOutTitle() {
  const person = findPerson($("#checkOutNameSelect").val());
  $("#checkOutTitleInput").val(person ? person.title : "-");
}

function ensureHalfHourOptions() {
  if (
    $("#checkInTimeSelect option").length === 0 ||
    $("#checkOutTimeSelect option").length === 0 ||
    $("#editCheckInTimeSelect option").length === 0 ||
    $("#editCheckOutTimeSelect option").length === 0
  ) {
    fillHalfHourOptions();
  }
}

function fillHalfHourOptions() {
  const options = [];

  for (let hour = 0; hour < 24; hour++) {
    ["00", "30"].forEach(function (minute) {
      options.push(`${String(hour).padStart(2, "0")}:${minute}`);
    });
  }

  renderOptions("#checkInTimeSelect", options);
  renderOptions("#checkOutTimeSelect", options);
  renderOptions("#editCheckInTimeSelect", options);
  renderOptions("#editCheckOutTimeSelect", ["", ...options]);
}

function renderOptions(selector, values) {
  const html = values.map(function (value) {
    const text = value || "-";
    return `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`;
  });

  $(selector).html(html.join(""));
}

function refreshLocation(shouldShowResultAlert) {
  setLocationBadge("notLocated");

  getCurrentLocationResult().then(function (result) {
    currentLocationResult = result;

    if (!result.success) {
      setLocationBadge("failed");

      if (shouldShowResultAlert) {
        showAlert(result.message, "danger");
      }

      return;
    }

    if (result.data && result.data.isAllowed) {
      setLocationBadge("success");

      if (shouldShowResultAlert) {
        showAlert(result.message, "success");
      }

      return;
    }

    setLocationBadge("outOfRange");

    if (shouldShowResultAlert) {
      showAlert(result.message, "warning");
    }
  });
}

function setLocationBadge(status) {
  const badge = $("#locationStatusBadge");

  if (status === "success") {
    badge.attr("class", "badge text-bg-success").text("定位成功");
    return;
  }

  if (status === "failed") {
    badge.attr("class", "badge text-bg-danger").text("定位失敗");
    return;
  }

  if (status === "outOfRange") {
    badge.attr("class", "badge text-bg-warning").text("超出範圍");
    return;
  }

  badge.attr("class", "badge text-bg-secondary").text("尚未定位");
}

function isLocationAllowed() {
  if (!positionConfig.enableLocation) {
    return true;
  }

  return currentLocationResult &&
    currentLocationResult.success &&
    currentLocationResult.data &&
    currentLocationResult.data.isAllowed;
}

function getCurrentLocationBlockMessage(actionText) {
  if (!currentLocationResult) {
    return `${actionText}：尚未完成定位，請先按下重新定位`;
  }

  return `${actionText}：${currentLocationResult.message || "定位未符合條件"}`;
}

function syncFiltersToRecord(record) {
  if (!record || !record.eventDate) {
    return;
  }

  $("#filterMonthInput").val(record.eventDate.slice(0, 7));
  $("#filterStartDateInput").val("");
  $("#filterEndDateInput").val("");
  $("#filterServiceTypeSelect").val("");
}

function showAlert(message, type) {
  $("#serviceAlertContainer")
    .removeClass("d-none")
    .html(`
      <div class="alert alert-${type} rounded-3 mb-0">
        <i class="fa-solid fa-circle-info me-1"></i>${escapeHtml(message || "-")}
      </div>
    `);
}

function hideAlert() {
  $("#serviceAlertContainer").addClass("d-none").empty();
}

function showModalAlert(selector, message, type) {
  $(selector)
    .removeClass("d-none")
    .html(`
      <div class="alert alert-${type} rounded-3 mb-0">
        <i class="fa-solid fa-circle-info me-1"></i>${escapeHtml(message || "-")}
      </div>
    `);
}

function hideModalAlert(selector) {
  $(selector).addClass("d-none").empty();
}

function clearFilters() {
  setDefaultFilterDates();
  $("#filterServiceTypeSelect").val("");
  loadServiceRecords();
}

function setDefaultFilterDates() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  $("#filterMonthInput").val(currentMonth);
  $("#filterStartDateInput").val("");
  $("#filterEndDateInput").val("");
}

function startClock() {
  function updateClock() {
    const now = new Date();
    $("#currentTimeText").text(now.toLocaleTimeString("zh-TW", { hour12: false }));
    $("#currentDateText").text(now.toLocaleDateString("zh-TW"));
  }

  updateClock();
  setInterval(updateClock, 1000);
}

function initializeSignatureCanvas() {
  const canvas = document.getElementById("signatureCanvas");

  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  let isDrawing = false;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }

  $("#checkOutModal").on("shown.bs.modal", resizeCanvas);
  window.addEventListener("resize", resizeCanvas);

  canvas.addEventListener("pointerdown", function (event) {
    isDrawing = true;
    signaturePadState.hasSignature = true;
    context.beginPath();
    context.moveTo(event.offsetX, event.offsetY);
  });

  canvas.addEventListener("pointermove", function (event) {
    if (!isDrawing) {
      return;
    }

    context.lineTo(event.offsetX, event.offsetY);
    context.stroke();
  });

  canvas.addEventListener("pointerup", function () {
    isDrawing = false;
  });

  canvas.addEventListener("pointerleave", function () {
    isDrawing = false;
  });
}

function clearSignature() {
  const canvas = document.getElementById("signatureCanvas");
  signaturePadState.hasSignature = false;

  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function calculateRecordHours(record) {
  if (!record.checkInDate || !record.checkInTime || !record.checkOutDate || !record.checkOutTime) {
    return 0;
  }

  const startDate = new Date(`${record.checkInDate}T${record.checkInTime}:00`);
  const endDate = new Date(`${record.checkOutDate}T${record.checkOutTime}:00`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    return 0;
  }

  return Math.round(((endDate - startDate) / 1000 / 60 / 60) * 10) / 10;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatHalfHour(date) {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = date.getMinutes() < 30 ? "00" : "30";

  return `${hour}:${minute}`;
}

function getMonthLastDate(monthText) {
  const parts = monthText.split("-");
  const date = new Date(Number(parts[0]), Number(parts[1]), 0);

  return formatDate(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
