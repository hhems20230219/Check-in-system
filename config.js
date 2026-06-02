// =======================================================
// 系統集中設定檔
// 所有固定規則、欄位、顯示文字都集中放這裡
// =======================================================

const appConfig = {
  appTitle: "新興救護義消差勤管理系統",
  apiUrl: "請填入 Apps Script Web App URL",
  useSampleData: true,

  storageKeys: {
    currentPersonName: "volunteerCurrentPersonName"
  },

  serviceRules: {
    monthlyRequiredHours: 4,
    threeMonthRequiredHours: 12,
    annualTrainingRequiredCount: 12,
    serviceHourTypes: ["備勤", "公差勤務"]
  },

  selectText: {
    pleaseSelectPerson: "請選擇人員"
  },

  serviceTypes: {
    standby: "備勤",
    annualTraining: "常年訓練",
    officialDuty: "公差勤務"
  },

  dutyTypes: {
    checkIn: "簽到",
    leave: "請假",
    dispatch: "出勤",
    standby: "待命備勤"
  },

  medicalLicenses: [
    { key: "acls", label: "ACLS" },
    { key: "bls", label: "BLS" },
    { key: "blsI", label: "BLS-I" },
    { key: "tecc", label: "TECC" }
  ],

  leaderTitleRules: {
    eligibleJuniorLeaderTitles: [
      "小隊長",
      "副小隊長",
      "中隊長",
      "副中隊長",
      "大隊長",
      "副大隊長",
      "分隊長",
      "副分隊長",
      "顧問"
    ]
  },

  volunteerTrainingItems: [
    {
      key: "newTraining",
      label: "新進人員基本訓練",
      conditionText: "§10 入隊後三年內應完成新進人員基本訓練",
      legalBasisText: "義勇消防組織訓練演習服勤辦法",
      legalBasisUrl: "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0120033"
    },
    {
      key: "basicLeaderTraining",
      label: "基礎幹部講習班",
      conditionText: "§12.4 已完成新進人員訓練後，三年內應完成基礎幹部講習班",
      legalBasisText: "義勇消防組織訓練演習服勤辦法",
      legalBasisUrl: "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0120033"
    },
    {
      key: "juniorLeaderTraining",
      label: "初級幹部講習班",
      conditionText: "§12.3 已完成新進人員訓練，且曾任或現任義勇消防小隊長以上職務（含顧問職）合計滿一年以上之人員，或曾經基礎幹部講習班訓練合格之人員",
      legalBasisText: "義勇消防組織訓練演習服勤辦法",
      legalBasisUrl: "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0120033"
    }
  ],

  ownedAwardItems: [
    { key: "modelAward", label: "內政部消防署全國消防楷模" },
    { key: "emsAward", label: "內政部消防署全國救護志工菁英" },
    { key: "excellentAward", label: "績優義消人員" },
    { key: "fortyYearAward", label: "義消服務滿40年以上績優人員" },
    { key: "fortyFiveYearAward", label: "義消服務滿45年以上績優人員" }
  ],

  awardRules: [
    {
      awardName: "內政部消防署全國消防楷模",
      conditionText: "服務滿五年以上",
      minimumServiceYears: 5,
      minimumTotalServiceHours: 0,
      needNewTraining: false,
      needBasicLeaderTraining: false,
      needJuniorLeaderTraining: false,
      legalBasisText: "內政部消防署全國消防楷模甄選表揚實施規定",
      legalBasisUrl: "https://law.nfa.gov.tw/MOBILE/law.aspx?LSID=FL029281",
      isEnabled: true
    },
    {
      awardName: "內政部消防署全國救護志工菁英",
      conditionText: "服務滿五年，服務時數累計達一千小時以上",
      minimumServiceYears: 5,
      minimumTotalServiceHours: 1000,
      needNewTraining: false,
      needBasicLeaderTraining: false,
      needJuniorLeaderTraining: false,
      legalBasisText: "內政部消防署全國救護志工菁英甄選表揚實施規定",
      legalBasisUrl: "https://law.nfa.gov.tw/MOBILE/law.aspx?LSID=FL060960",
      isEnabled: true
    },
    {
      awardName: "義消服務滿40年以上績優人員",
      conditionText: "服務滿40年",
      minimumServiceYears: 40,
      minimumTotalServiceHours: 0,
      needNewTraining: false,
      needBasicLeaderTraining: false,
      needJuniorLeaderTraining: false,
      legalBasisText: "義勇消防人員獎勵相關規定",
      legalBasisUrl: "請填入法規網址",
      isEnabled: true
    },
    {
      awardName: "義消服務滿45年以上績優人員",
      conditionText: "服務滿45年",
      minimumServiceYears: 45,
      minimumTotalServiceHours: 0,
      needNewTraining: false,
      needBasicLeaderTraining: false,
      needJuniorLeaderTraining: false,
      legalBasisText: "義勇消防人員獎勵相關規定",
      legalBasisUrl: "請填入法規網址",
      isEnabled: true
    }
  ]
};

function appLog(level, message, data) {
  const allowedLevels = ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"];
  const logLevel = allowedLevels.includes(level) ? level : "INFO";
  const prefix = `[${logLevel}] ${message}`;

  if (data !== undefined) {
    console.log(prefix, data);
  } else {
    console.log(prefix);
  }
}
