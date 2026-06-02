// =======================================================
// 獎項資格判斷
// 只負責獎項資格，不處理畫面 HTML
// =======================================================

function buildAwardEligibilityList(person, awardRules, serviceSummary) {
  appLog("DEBUG", "開始建立獎項資格判斷", {
    person: person,
    serviceSummary: serviceSummary
  });

  const ownedAwardNames = appConfig.ownedAwardItems
    .filter(item => Boolean(person[item.key]))
    .map(item => item.label);

  return awardRules
    .filter(rule => rule.isEnabled)
    .filter(rule => !ownedAwardNames.includes(rule.awardName))
    .map(rule => judgeAwardEligibility(rule, person, serviceSummary.totalHours));
}

function judgeAwardEligibility(rule, person, totalHours) {
  const requiredConditions = [];
  const missingConditions = [];
  const serviceYears = calculateServiceYearsNumber(person.entryDate);

  if (Number(rule.minimumServiceYears || 0) > 0) {
    requiredConditions.push(`服務年資須滿 ${rule.minimumServiceYears} 年`);
  }

  if (Number(rule.minimumTotalServiceHours || 0) > 0) {
    requiredConditions.push(`累計出勤時數須滿 ${rule.minimumTotalServiceHours} 小時`);
  }

  if (rule.needNewTraining) {
    requiredConditions.push("須完成新進人員訓練");
  }

  if (rule.needBasicLeaderTraining) {
    requiredConditions.push("須完成基礎幹部講習班");
  }

  if (rule.needJuniorLeaderTraining) {
    requiredConditions.push("須完成初級幹部講習班");
  }

  if (Number(rule.minimumServiceYears || 0) > serviceYears) {
    missingConditions.push(`服務年資未滿 ${rule.minimumServiceYears} 年`);
  }

  if (Number(rule.minimumTotalServiceHours || 0) > totalHours) {
    missingConditions.push(`累計出勤時數未滿 ${rule.minimumTotalServiceHours} 小時`);
  }

  if (rule.needNewTraining && !person.newTraining) {
    missingConditions.push("尚未完成新進人員訓練");
  }

  if (rule.needBasicLeaderTraining && !person.basicLeaderTraining) {
    missingConditions.push("尚未完成基礎幹部講習班");
  }

  if (rule.needJuniorLeaderTraining && !person.juniorLeaderTraining) {
    missingConditions.push("尚未完成初級幹部講習班");
  }

  return {
    awardName: rule.awardName,
    isEligible: missingConditions.length === 0,
    requiredConditions: requiredConditions,
    missingConditions: missingConditions,
    legalBasisText: rule.legalBasisText || rule.legalBasis || "-",
    legalBasisUrl: rule.legalBasisUrl || ""
  };
}
