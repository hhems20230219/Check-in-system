// =======================================================
// 義消訓練資格判斷
// 只負責判斷邏輯
// 固定文字與法規依據統一由 config.js 管理
// =======================================================

function buildTrainingEligibilityList(person) {
  appLog("DEBUG", "開始建立義消訓練判斷資料", person);

  return appConfig.volunteerTrainingItems.map(function (item) {
    return judgeTrainingEligibility(item, person);
  });
}

function judgeTrainingEligibility(item, person) {
  const completedDate = person[item.key];

  if (completedDate) {
    return buildTrainingResult(item, true, true, completedDate, "text-success", "已完成");
  }

  if (item.key === "newTraining") {
    return judgeNewTraining(item, person);
  }

  if (item.key === "basicLeaderTraining") {
    return judgeBasicLeaderTraining(item, person);
  }

  if (item.key === "juniorLeaderTraining") {
    return judgeJuniorLeaderTraining(item, person);
  }

  return buildTrainingResult(item, false, false, "不符合", "text-danger", "找不到對應訓練規則");
}

function judgeNewTraining(item, person) {
  const hasEntryDate = Boolean(person.entryDate);

  if (hasEntryDate) {
    return buildTrainingResult(
      item,
      false,
      true,
      "符合",
      "text-primary",
      "已有入隊日期，可安排新進人員基本訓練"
    );
  }

  return buildTrainingResult(
    item,
    false,
    false,
    "不符合",
    "text-danger",
    "缺少入隊日期，無法判斷新進人員基本訓練資格"
  );
}

function judgeBasicLeaderTraining(item, person) {
  const hasNewTraining = Boolean(person.newTraining);

  if (hasNewTraining) {
    return buildTrainingResult(
      item,
      false,
      true,
      "符合",
      "text-primary",
      "已完成新進人員訓練，可安排基礎幹部講習班"
    );
  }

  return buildTrainingResult(
    item,
    false,
    false,
    "不符合",
    "text-danger",
    "尚未完成新進人員訓練，無法安排基礎幹部講習班"
  );
}

function judgeJuniorLeaderTraining(item, person) {
  const hasNewTraining = Boolean(person.newTraining);
  const hasBasicLeaderTraining = Boolean(person.basicLeaderTraining);
  const hasEligibleLeaderTitle = isEligibleJuniorLeaderTitle(person.title);

  if (!hasNewTraining) {
    return buildTrainingResult(
      item,
      false,
      false,
      "不符合",
      "text-danger",
      "尚未完成新進人員訓練，無法安排初級幹部講習班"
    );
  }

  if (hasBasicLeaderTraining || hasEligibleLeaderTitle) {
    return buildTrainingResult(
      item,
      false,
      true,
      "符合",
      "text-primary",
      hasBasicLeaderTraining
        ? "已完成基礎幹部講習班，可安排初級幹部講習班"
        : "符合小隊長以上職務條件，可安排初級幹部講習班"
    );
  }

  return buildTrainingResult(
    item,
    false,
    false,
    "不符合",
    "text-danger",
    "已完成新進人員訓練，但尚未符合小隊長以上職務條件，且尚未完成基礎幹部講習班"
  );
}

function isEligibleJuniorLeaderTitle(title) {
  if (!title) {
    return false;
  }

  return appConfig.leaderTitleRules.eligibleJuniorLeaderTitles.includes(title);
}

function buildTrainingResult(item, isCompleted, isEligible, displayText, displayClass, reason) {
  const result = {
    key: item.key,
    label: item.label,
    isCompleted: isCompleted,
    isEligible: isEligible,
    displayText: displayText,
    displayClass: displayClass,
    conditionText: item.conditionText,
    legalBasisText: item.legalBasisText || "-",
    legalBasisUrl: item.legalBasisUrl || "",
    reason: reason
  };

  appLog(isEligible ? "INFO" : "WARN", `義消訓練判斷：${item.label}`, result);

  return result;
}
