let people = [];
let currentPerson = null;
let indexData = null;

$(document).ready(function () {
  appLog("INFO", "index.html 初始化");

  initializeNavbar(function () {
    loadPeople();
  });

  $("#modalNameSelect").on("change", handleModalNameChange);
  $("#confirmUserButton").on("click", confirmCurrentUser);
});

function callApi(action, payload) {
  appLog("INFO", "呼叫 API", { action: action, payload: payload });

  if (appConfig.useSampleData) {
    return loadSampleData(action, payload);
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
  appLog("DEBUG", "使用 sampleData.json 模式", action);

  return $.getJSON("sampleData.json").then(function (sampleData) {
    if (action === "getPeople") {
      return {
        success: true,
        message: "操作成功",
        data: sampleData.people
      };
    }

    if (action === "getIndexData") {
      const personName = payload.personName;
      const person = sampleData.people.find(item => item.name === personName);

      if (!person) {
        return {
          success: false,
          message: "找不到指定人員",
          data: null
        };
      }

      const records = sampleData.serviceRecords.filter(item => item.name === personName);

      return {
        success: true,
        message: "操作成功",
        data: buildIndexDataFromSample(person, records, appConfig.awardRules)
      };
    }

    return {
      success: false,
      message: "不支援的範例 action",
      data: null
    };
  }).catch(function (error) {
    appLog("FATAL", "sampleData.json 載入失敗", error);

    return {
      success: false,
      message: "sampleData.json 載入失敗",
      data: null
    };
  });
}

function loadPeople() {
  callApi("getPeople", {}).then(function (response) {
    if (!response.success) {
      showPageAlert(response.message, "danger");
      return;
    }

    people = response.data || [];
    renderPeopleOptions();

    const savedName = localStorage.getItem(appConfig.storageKeys.currentPersonName);

    if (savedName) {
      setCurrentPerson(savedName);
    } else {
      resetIndexView();
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

  $("#modalNameSelect").html(options.join(""));
}

function handleModalNameChange() {
  const personName = $("#modalNameSelect").val();
  const person = people.find(item => item.name === personName);

  $("#modalUnitInput").val(person ? person.unit : "-");
  $("#modalTitleInput").val(person ? person.title : "-");
}

function confirmCurrentUser() {
  const personName = $("#modalNameSelect").val();

  if (!personName) {
    showPageAlert("請選擇姓名", "warning");
    return;
  }

  localStorage.setItem(appConfig.storageKeys.currentPersonName, personName);
  $("#userModal").modal("hide");
  setCurrentPerson(personName);
}

function setCurrentPerson(personName) {
  currentPerson = people.find(item => item.name === personName);

  if (!currentPerson) {
    resetIndexView();
    resetNavbarPerson();
    return;
  }

  updateNavbarPerson(currentPerson);
  $("#modalNameSelect").val(personName);
  handleModalNameChange();

  callApi("getIndexData", { personName: personName }).then(function (response) {
    if (!response.success) {
      showPageAlert(response.message, "danger");
      return;
    }

    indexData = response.data;
    renderIndexData(indexData);
    showPageAlert("資料載入完成", "success");
  });
}

function resetIndexView() {
  $("#entryDateText").text("-");
  $("#serviceYearsText").text("-");
  $("#emtLicenseText").text("-");

  $("#totalHoursText").text("0 小時");
  $("#monthlyTitleText").text("--月出勤時數");
  $("#monthlyHoursText").text("0 / 4 小時");
  $("#threeMonthText").text("--月至--月 0 / 12 小時");
  $("#monthlyHintText").text("-");
  setProgressBar("#monthlyProgressBar", 0);

  $("#trainingYearTitleText").text("----年常年訓練次數");
  $("#annualTrainingText").text("0 / 12 次");
  setProgressBar("#annualTrainingProgressBar", 0);

  $("#medicalLicenseList").html(renderEmptyListItem());
  $("#ownedAwardList").html(renderEmptyListItem());
  $("#volunteerTrainingList").html(renderEmptyListItem());
  $("#awardEligibilityCard").addClass("d-none");
  $("#awardEligibilityList").html("-");
}

function renderIndexData(data) {
  renderBasicInfo(data.person);
  renderMedicalLicenses(data.person);
  renderServiceSummary(data.serviceSummary);
  renderAnnualTrainingSummary(data.serviceSummary);
  renderTraining(data.trainingEligibilityList);
  renderOwnedAwards(data.person);
  renderAwardEligibility(data.awardEligibilityList);
}

function renderBasicInfo(person) {
  $("#entryDateText").text(person.entryDate || "-");
  $("#serviceYearsText").text(person.serviceYearsText || "-");
  $("#emtLicenseText").text(person.emtLicense || "-");
}

function renderMedicalLicenses(person) {
  const html = appConfig.medicalLicenses.map(function (item) {
    return `
      <li class="list-group-item d-flex justify-content-between">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(person[item.key] || "-")}</strong>
      </li>
    `;
  });

  $("#medicalLicenseList").html(html.join(""));
}

function renderServiceSummary(summary) {
  const rule = appConfig.serviceRules;

  $("#totalHoursText").text(`${summary.totalHours} 小時`);
  $("#monthlyTitleText").text(`${summary.currentMonthNumber}月出勤時數`);
  $("#monthlyHoursText").text(`${summary.monthlyHours} / ${rule.monthlyRequiredHours} 小時`);
  $("#threeMonthText").text(`${summary.threeMonthStartMonth}月至${summary.threeMonthEndMonth}月 ${summary.threeMonthHours} / ${rule.threeMonthRequiredHours} 小時`);

  let progressValue = summary.monthlyHours;
  let progressTarget = rule.monthlyRequiredHours;
  let progressText = `${summary.monthlyHours} / ${rule.monthlyRequiredHours}`;

  if (summary.monthlyHours < rule.monthlyRequiredHours) {
    progressValue = summary.threeMonthHours;
    progressTarget = rule.threeMonthRequiredHours;
    progressText = `${summary.threeMonthHours} / ${rule.threeMonthRequiredHours}`;
  }

  setProgressBar("#monthlyProgressBar", calculatePercent(progressValue, progressTarget));

  const hint = summary.monthlyHours >= rule.monthlyRequiredHours
    ? "本月已達 4 小時"
    : `本月未滿 4 小時，${summary.threeMonthStartMonth}月至${summary.threeMonthEndMonth}月累計 ${progressText} 小時`;

  $("#monthlyHintText").text(hint);
}

function renderAnnualTrainingSummary(summary) {
  const rule = appConfig.serviceRules;
  const annualTrainingCount = Number(summary.annualTrainingCount || 0);

  $("#trainingYearTitleText").text(`${summary.currentYear}年常年訓練次數`);
  $("#annualTrainingText").text(`${annualTrainingCount} / ${rule.annualTrainingRequiredCount} 次`);
  setProgressBar("#annualTrainingProgressBar", calculatePercent(annualTrainingCount, rule.annualTrainingRequiredCount));
}

function renderTraining(trainingEligibilityList) {
  if (!trainingEligibilityList || trainingEligibilityList.length === 0) {
    $("#volunteerTrainingList").html(renderEmptyListItem());
    return;
  }

  const html = trainingEligibilityList.map(function (item) {
    const badgeClass = item.isEligible ? "text-bg-success" : "text-bg-danger";
    const statusText = item.isEligible ? "符合" : "不符合";
    const displayText = item.isCompleted ? item.displayText : statusText;

    return `
      <li class="list-group-item">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div>
            <strong>${escapeHtml(item.label)}</strong>
            ${item.isCompleted ? `<div class="small text-success mt-1">完成日期：${escapeHtml(displayText)}</div>` : ""}
          </div>
          <span class="badge ${badgeClass}">${escapeHtml(statusText)}</span>
        </div>

        <div class="small mt-2">
          <strong>須滿足條件：</strong>${escapeHtml(item.conditionText || "-")}
        </div>

        <div class="small text-muted mt-1">
          <strong>法規依據：</strong>${buildLegalBasisLink(item.legalBasisText, item.legalBasisUrl)}
        </div>
      </li>
    `;
  });

  $("#volunteerTrainingList").html(html.join(""));
}

function renderOwnedAwards(person) {
  const html = appConfig.ownedAwardItems.map(function (item) {
    return `
      <li class="list-group-item d-flex justify-content-between">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(person[item.key] || "-")}</strong>
      </li>
    `;
  });

  $("#ownedAwardList").html(html.join(""));
}

function renderAwardEligibility(items) {
  if (!items || items.length === 0) {
    $("#awardEligibilityCard").addClass("d-none");
    $("#awardEligibilityList").html("-");
    return;
  }

  $("#awardEligibilityCard").removeClass("d-none");

  const html = items.map(function (item) {
    const badgeClass = item.isEligible ? "text-bg-success" : "text-bg-danger";
    const statusText = item.isEligible ? "符合" : "不符合";
    const requiredText = item.requiredConditions.length ? item.requiredConditions.join("、") : "-";

    return `
      <div class="border rounded-3 p-3 mb-2 bg-white">
        <div class="d-flex justify-content-between gap-2">
          <strong>${escapeHtml(item.awardName)}</strong>
          <span class="badge ${badgeClass}">${statusText}</span>
        </div>
        <div class="small mt-2"><strong>須滿足條件：</strong>${escapeHtml(requiredText)}</div>
        <div class="small text-muted mt-1">
          <strong>法規依據：</strong>${buildLegalBasisLink(item.legalBasisText, item.legalBasisUrl)}
        </div>
      </div>
    `;
  });

  $("#awardEligibilityList").html(html.join(""));
}

function buildIndexDataFromSample(person, records, awardRules) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonthNumber = today.getMonth() + 1;
  const currentMonthKey = `${currentYear}-${String(currentMonthNumber).padStart(2, "0")}`;

  const serviceHourRecords = records.filter(isServiceHourRecord);

  const totalHours = serviceHourRecords.reduce((sum, record) => sum + calculateRecordHours(record), 0);

  const monthlyHours = serviceHourRecords
    .filter(record => String(record.eventDate).startsWith(currentMonthKey))
    .reduce((sum, record) => sum + calculateRecordHours(record), 0);

  const threeMonthKeys = getRecentMonthKeys(today, 3);

  const threeMonthHours = serviceHourRecords
    .filter(record => threeMonthKeys.some(key => String(record.eventDate).startsWith(key)))
    .reduce((sum, record) => sum + calculateRecordHours(record), 0);

  const annualTrainingCount = records.filter(function (record) {
    return record.serviceType === appConfig.serviceTypes.annualTraining &&
      String(record.eventDate).startsWith(String(currentYear)) &&
      record.dutyType === appConfig.dutyTypes.checkIn;
  }).length;

  person.serviceYearsText = calculateServiceYearsText(person.entryDate);

  const serviceSummary = {
    totalHours: roundNumber(totalHours),
    monthlyHours: roundNumber(monthlyHours),
    threeMonthHours: roundNumber(threeMonthHours),
    currentYear: currentYear,
    currentMonthNumber: currentMonthNumber,
    threeMonthStartMonth: getMonthNumberFromMonthKey(threeMonthKeys[0]),
    threeMonthEndMonth: getMonthNumberFromMonthKey(threeMonthKeys[threeMonthKeys.length - 1]),
    annualTrainingCount: annualTrainingCount
  };

  return {
    person: person,
    serviceSummary: serviceSummary,
    trainingEligibilityList: buildTrainingEligibilityList(person),
    awardEligibilityList: buildAwardEligibilityList(person, awardRules, serviceSummary)
  };
}

function isServiceHourRecord(record) {
  return appConfig.serviceRules.serviceHourTypes.includes(record.serviceType);
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

  return (endDate - startDate) / 1000 / 60 / 60;
}

function buildLegalBasisLink(text, url) {
  const displayText = escapeHtml(text || "-");

  if (!url) {
    return displayText;
  }

  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${displayText}</a>`;
}

function setProgressBar(selector, percent) {
  const progressBar = $(selector);
  let className = "progress-bar bg-danger";

  if (percent >= 90) {
    className = "progress-bar bg-success";
  } else if (percent >= 50) {
    className = "progress-bar bg-warning text-dark";
  }

  progressBar.attr("class", className);
  progressBar.css("width", `${percent}%`);
  progressBar.text(`${percent}%`);
}

function calculatePercent(value, target) {
  if (!target) {
    return 0;
  }

  return Math.min(100, Math.round((Number(value || 0) / target) * 100));
}

function getRecentMonthKeys(date, count) {
  const keys = [];

  for (let index = count - 1; index >= 0; index--) {
    const targetDate = new Date(date.getFullYear(), date.getMonth() - index, 1);
    keys.push(`${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}`);
  }

  return keys;
}

function getMonthNumberFromMonthKey(monthKey) {
  if (!monthKey || !monthKey.includes("-")) {
    return "--";
  }

  return String(Number(monthKey.split("-")[1]));
}

function calculateServiceYearsText(dateText) {
  if (!dateText) {
    return "-";
  }

  const startDate = new Date(dateText);
  const today = new Date();

  let years = today.getFullYear() - startDate.getFullYear();
  let months = today.getMonth() - startDate.getMonth();

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return `${years} 年 ${months} 個月`;
}

function calculateServiceYearsNumber(dateText) {
  if (!dateText) {
    return 0;
  }

  const startDate = new Date(dateText);
  const today = new Date();

  return Math.max(0, (today - startDate) / 1000 / 60 / 60 / 24 / 365.25);
}

function renderEmptyListItem() {
  return `
    <li class="list-group-item d-flex justify-content-between">
      <span>-</span>
      <strong>-</strong>
    </li>
  `;
}

function showPageAlert(message, type) {
  $("#pageAlert")
    .attr("class", `alert alert-${type} rounded-3`)
    .html(`<i class="fa-solid fa-circle-info me-1"></i>${escapeHtml(message)}`);
}

function roundNumber(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
