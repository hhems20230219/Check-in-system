// app.js
/* global bootstrap, $ */

const webAppUrl = "https://script.google.com/macros/s/AKfycbxoUGfQVQC_iDy1R--Ve9inpHTxz85daqU1HOU2ZTEIggw-A7JcqqjW4GKu3Py2khZV/exec";

const gpsRules = {
  assist: [
    { name: "新興分隊", lat: 22.630760865622978, lng: 120.31122281518338, radius: 100 },
    { name: "吉林街142號", lat: 22.644379387561017, lng: 120.30652000270213, radius: 100 }
  ],
  training: [
    { name: "新興分隊", lat: 22.630760865622978, lng: 120.31122281518338, radius: 100 },
    { name: "日月光K11", lat: 22.722363004033074, lng: 120.30469365772642, radius: 100 }
  ]
};

// ✅ 室內定位常見：accuracy 很大（50~200m）
const GPS_ACCURACY_WARN_M = 60;       // >= 60m：提示「室內訊號不佳」
const GPS_ACCURACY_BLOCK_M = 150;     // >= 150m：直接視為不可靠，GPS 不通過
const FUTURE_TOLERANCE_MS = 30 * 1000;

// ✅ localStorage：v2（單位/職稱/姓名）+ 相容 v1（unitTitle/personName）
const LS_KEY_V2 = "xh_ems_person_v2"; // { unit, title, name }
const LS_KEY_V1 = "xh_ems_person_v1"; // 舊版：{ unitTitle, personName }

let people = []; // [{ unit, title, name }]
let selected = { unit: "", title: "", name: "" };
let lastGps = { ok: false, lat: null, lng: null, accuracy: null };

let pickModal, inModal, outModal, confirmModal;

// ✅ 確認送出用
let pendingConfirm = {
  kind: "",      // "signIn" | "signOut"
  summary: null, // { typeText, title, name, date, time, content? }
  request: null  // { action, ... }
};

$(function () {
  pickModal = new bootstrap.Modal(document.getElementById("pickPersonModal"));
  inModal = new bootstrap.Modal(document.getElementById("signInModal"));
  outModal = new bootstrap.Modal(document.getElementById("signOutModal"));
  confirmModal = new bootstrap.Modal(document.getElementById("confirmModal"));

  registerServiceWorker_();
  startClock_();
  bindEvents_();

  showLoading_(true);

  loadPeople_()
    .then(function () {
      loadSelectedFromStorage_();

      if (!isSelectedValid_()) {
        openPickModal_();
      } else {
        applySelectedToUi_();
      }

      setDefaultMonth_();
      return refreshSignAsync_();
    })
    .always(function () {
      showLoading_(false);
      locate_(); // ✅ 初次定位
    });
});

// -------------------- Events --------------------
function bindEvents_() {
  $("#btnRelocate").on("click", locate_);

  $("#btnSwitchPerson").on("click", function () {
    openPickModal_();
  });

  // ✅ 選人：改姓名 -> 單位/職稱跟著變
  $("#pickPersonName").on("change", function () {
    const name = $(this).val();
    setPickInfoByName_(name);
  });

  // ✅ 簽到：改姓名 -> 職稱跟著變
  $("#inPersonName").on("change", function () {
    const name = $(this).val();
    setTitleByName_(name, "#inTitle");
  });

  // ✅ 簽退：改姓名 -> 職稱跟著變
  $("#outPersonName").on("change", function () {
    const name = $(this).val();
    setTitleByName_(name, "#outTitle");
  });

  $("#btnPickCancel").on("click", function () {
    if (!isSelectedValid_()) return;
    pickModal.hide();
  });

  $("#btnPickOk").on("click", function () {
    const name = $("#pickPersonName").val();
    const p = findPersonByName_(name);
    if (!p) {
      showStatus_("danger", "請先選擇姓名");
      return;
    }

    selected.unit = p.unit || "";
    selected.title = p.title || "";
    selected.name = p.name || "";
    saveSelectedToStorage_();
    applySelectedToUi_();
    pickModal.hide();

    showLoading_(true);
    refreshSignAsync_().always(function () {
      showLoading_(false);
    });
  });

  $("#btnOpenSignIn").on("click", function () {
    clearSignStatus_("in");
    fillSignInModal_();

    // ✅ 開啟簽到時：把 GPS 目標清單切到簽到 duty
    renderGpsTargets_("assist", { from: "page" });
    updateGpsBadgeForModal_("in");

    inModal.show();
  });

  $("#btnOpenSignOut").on("click", function () {
    clearSignStatus_("out");
    fillSignOutModal_();
    updateOutUiByDuty_();

    // ✅ 開啟簽退時：把 GPS 目標清單切到簽退 duty
    renderGpsTargets_($("#outDutyType").val(), { from: "page" });
    updateGpsBadgeForModal_("out");

    outModal.show();
  });

  // ✅ duty 改變：即時切換「GPS 目標列表」+ 重判
  $("#inDutyType").on("change", function () {
    renderGpsTargets_($("#inDutyType").val(), { from: "in" });
    updateGpsBadgeForModal_("in");
  });

  $("#outDutyType").on("change", function () {
    updateOutUiByDuty_();
    renderGpsTargets_($("#outDutyType").val(), { from: "out" });
    updateGpsBadgeForModal_("out");
  });

  $("#outMode").on("change", function () {
    updateOutUiByDuty_();
  });

  // ✅ 送出先開確認視窗
  $("#btnSubmitSignIn").on("click", prepareConfirmSignIn_);
  $("#btnSubmitSignOut").on("click", prepareConfirmSignOut_);
  $("#btnConfirmSubmit").on("click", doConfirmedSubmit_);

  $("#btnRefreshSign").on("click", function () {
    showLoading_(true);
    refreshSignAsync_().always(function () {
      showLoading_(false);
    });
  });

  $("#signYmPicker").on("change", function () {
    showLoading_(true);
    refreshSignAsync_().always(function () {
      showLoading_(false);
    });
  });

  // ✅ modal 關閉時，把 page 顯示切回 assist（你也可以改成記住最後一次）
  $("#signInModal").on("hidden.bs.modal", function () {
    renderGpsTargets_("assist", { from: "page" });
  });
  $("#signOutModal").on("hidden.bs.modal", function () {
    renderGpsTargets_("assist", { from: "page" });
  });
}

// -------------------- Loading --------------------
function showLoading_(show) {
  if (show) $("#pageLoading").show();
  else $("#pageLoading").hide();
}

// -------------------- People / selected --------------------
function loadPeople_() {
  showStatus_("info", "載入名單中...");
  return $.get(webAppUrl, { action: "people" })
    .then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.message) ? res.message : "名單載入失敗");

      people = (res.data || [])
        .map(x => ({
          unit: String(x.unit || "").trim(),
          title: String(x.title || "").trim(),
          name: String(x.name || "").trim()
        }))
        .filter(x => x.name);

      if (!people.length) showStatus_("warning", "people 無資料");
      else showStatus_("success", "名單載入完成");

      buildPeopleSelects_();
    })
    .catch(function (err) {
      showStatus_("danger", "名單載入失敗：" + (err && err.message ? err.message : err));
    });
}

function buildPeopleSelects_() {
  const opts = [];
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    opts.push(`<option value="${esc_(p.name)}">${esc_(p.name)}</option>`);
  }
  const html = opts.join("") || `<option value="">無資料</option>`;

  $("#pickPersonName").html(html);
  $("#inPersonName").html(html);
  $("#outPersonName").html(html);
}

function findPersonByName_(name) {
  const n = String(name || "").trim();
  if (!n) return null;
  return people.find(x => x && x.name === n) || null;
}

function setTitleByName_(name, titleSelector) {
  const p = findPersonByName_(name);
  $(titleSelector).val(p ? (p.title || "") : "");
}

function setPickInfoByName_(name) {
  const p = findPersonByName_(name);
  $("#pickUnit").val(p ? (p.unit || "") : "");
  $("#pickTitle").val(p ? (p.title || "") : "");
}

// ✅ v2 + v1 相容搬移
function loadSelectedFromStorage_() {
  try {
    const raw2 = localStorage.getItem(LS_KEY_V2);
    if (raw2) {
      const obj2 = JSON.parse(raw2);
      selected.unit = String(obj2.unit || "");
      selected.title = String(obj2.title || "");
      selected.name = String(obj2.name || "");
      return;
    }
  } catch { }

  try {
    const raw1 = localStorage.getItem(LS_KEY_V1);
    if (!raw1) return;
    const obj1 = JSON.parse(raw1);

    selected.unit = "";
    selected.title = String(obj1.unitTitle || "");
    selected.name = String(obj1.personName || "");

    saveSelectedToStorage_();
  } catch { }
}

function saveSelectedToStorage_() {
  try {
    localStorage.setItem(LS_KEY_V2, JSON.stringify({
      unit: selected.unit || "",
      title: selected.title || "",
      name: selected.name || ""
    }));
  } catch { }
}

function isSelectedValid_() {
  if (!selected.name) return false;
  return people.some(p => p.name === selected.name);
}

function applySelectedToUi_() {
  $("#navUnit").text(selected.unit || "--");
  $("#navTitle").text(selected.title || "--");
  $("#navPersonName").text(selected.name || "--");
}

function openPickModal_() {
  if (isSelectedValid_()) {
    $("#pickPersonName").val(selected.name);
    setPickInfoByName_(selected.name);
  } else {
    const first = people[0];
    $("#pickPersonName").val(first ? first.name : "");
    setPickInfoByName_(first ? first.name : "");
  }
  pickModal.show();
}

// -------------------- Clock --------------------
function startClock_() {
  tick_();
  setInterval(tick_, 1000);
}

function tick_() {
  const now = new Date();
  $("#nowDateText").text(fmtDate_(now));
  $("#nowClockText").text(fmtClockHms_(now));
}

// -------------------- GPS --------------------
// ✅ 核心：把 gpsRules（assist/training）渲染到 #gpsTargetText
// ✅ 只需要改「GPS 目標顯示」這段：renderGpsTargets_()
// 其他檔案不用動

function renderGpsTargets_(dutyType, opt) {
  const duty = (dutyType === "training") ? "training" : "assist";
  const rules = (duty === "training") ? gpsRules.training : gpsRules.assist;

  // 先找「最近的目標」
  let nearest = null;   // { t, dist }
  if (lastGps.ok && lastGps.lat != null && lastGps.lng != null) {
    for (let i = 0; i < rules.length; i++) {
      const t = rules[i];
      const d = Math.round(distMeters_(lastGps.lat, lastGps.lng, t.lat, t.lng));
      if (!nearest || d < nearest.dist) nearest = { t: t, dist: d };
    }
  } else {
    // 沒 GPS 時，也至少顯示第一個目標（避免空白）
    if (rules.length) nearest = { t: rules[0], dist: null };
  }

  const lines = [];
  lines.push(`<div class="fw-semibold mb-1">GPS 目標（${esc_(dutyTypeText_(duty))}）</div>`);

  if (!nearest || !nearest.t) {
    lines.push(`<div class="text-muted">尚無可顯示的目標</div>`);
  } else {
    const t = nearest.t;
    const distText = (nearest.dist == null) ? "距離：-- m" : `距離：約 ${nearest.dist} m`;
    lines.push(
      `<div>• ${esc_(t.name)}（lat=${t.lat}, lng=${t.lng}｜半徑 ${t.radius}m｜${esc_(distText)}）</div>`
    );
  }

  // ✅ 同步顯示目前 accuracy（如果有）
  if (lastGps.ok && lastGps.accuracy != null) {
    const acc = parseInt(String(lastGps.accuracy || 0), 10) || 0;
    lines.push(`<div class="mt-1">目前 GPS 精度：約 ${acc} m</div>`);

    // ✅ 精度偏低提醒
    if (acc >= GPS_ACCURACY_WARN_M) {
      lines.push(`<div class="mt-1 text-warning">提示：室內常見精度飄移，建議到室外/窗邊再試。</div>`);
    }
  }

  $("#gpsTargetText").html(lines.join(""));
}

function locate_() {
  if (!("geolocation" in navigator)) {
    setGpsUi_("secondary", "不支援定位", null);
    showStatus_("danger", "此瀏覽器不支援定位功能");
    renderGpsTargets_("assist", { from: "page" });
    return;
  }

  setGpsUi_("secondary", "定位中...", null);

  navigator.geolocation.getCurrentPosition(
    function (pos) {
      lastGps.ok = true;
      lastGps.lat = pos.coords.latitude;
      lastGps.lng = pos.coords.longitude;
      lastGps.accuracy = Math.round(pos.coords.accuracy || 0);

      $("#gpsRawText").text(`使用者定位：lat=${lastGps.lat}, lng=${lastGps.lng}`);

      if (lastGps.accuracy >= GPS_ACCURACY_WARN_M) {
        setGpsUi_("warning", "定位精度偏低（室內常見）", `精度約 ${lastGps.accuracy} 公尺，請到室外/窗邊再按「重新定位」`);
      } else {
        setGpsUi_("success", "定位成功", `精度約 ${lastGps.accuracy} 公尺`);
      }

      // ✅ 頁面顯示：預設用 assist（你也可以改成記住最後 duty）
      renderGpsTargets_("assist", { from: "page" });

      updateGpsBadgeForModal_("in");
      updateGpsBadgeForModal_("out");
    },
    function (err) {
      lastGps.ok = false;
      lastGps.lat = null;
      lastGps.lng = null;
      lastGps.accuracy = null;

      $("#gpsRawText").text("使用者定位：lat=--, lng=--");
      setGpsUi_("danger", "GPS連線失敗", (err && err.message) ? err.message : "GPS連線失敗");
      showStatus_("danger", "GPS連線失敗，請確認定位權限或 GPS 設定");

      renderGpsTargets_("assist", { from: "page" });

      updateGpsBadgeForModal_("in");
      updateGpsBadgeForModal_("out");
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function setGpsUi_(bsType, text, info) {
  $("#gpsBadge")
    .removeClass("text-bg-secondary text-bg-success text-bg-danger text-bg-warning")
    .addClass("text-bg-" + bsType)
    .html(`<i class="fa-solid fa-location-dot me-1"></i>${esc_(text)}`);

  if (info) showStatus_("info", info);
}

function needGps_(dutyType) {
  return dutyType === "assist" || dutyType === "training";
}

function gpsPassDetailed_(dutyType) {
  if (!needGps_(dutyType)) {
    return { pass: true, level: "success", msg: "不需比對 GPS", detail: "" };
  }
  if (!lastGps.ok) {
    return { pass: false, level: "danger", msg: "尚未GPS連線", detail: "請先按「重新定位」" };
  }

  const acc = parseInt(String(lastGps.accuracy || 0), 10) || 0;

  if (acc >= GPS_ACCURACY_BLOCK_M) {
    return {
      pass: false,
      level: "danger",
      msg: "GPS精度不足（室內）",
      detail: `精度約 ${acc} 公尺｜請到室外/窗邊再重新定位`
    };
  }

  const rules = (dutyType === "training") ? gpsRules.training : gpsRules.assist;

  let passAny = false;
  let minD = null;
  let nearName = "";

  for (let i = 0; i < rules.length; i++) {
    const t = rules[i];
    const d = Math.round(distMeters_(lastGps.lat, lastGps.lng, t.lat, t.lng));
    if (minD == null || d < minD) { minD = d; nearName = t.name; }
    if (d <= (t.radius || 0)) passAny = true;
  }

  if (passAny) {
    const detail = (acc >= GPS_ACCURACY_WARN_M)
      ? `範圍內（精度約 ${acc} 公尺，室內可能飄）`
      : `範圍內（精度約 ${acc} 公尺）`;
    return { pass: true, level: "success", msg: "定位於範圍內", detail: detail };
  }

  if (acc >= GPS_ACCURACY_WARN_M) {
    return {
      pass: false,
      level: "danger",
      msg: "定位於範圍外（室內常見）",
      detail: `最近點：${nearName || "-"}｜距離約 ${minD == null ? "-" : minD} m｜精度約 ${acc} m｜請到室外/窗邊再試`
    };
  }

  return {
    pass: false,
    level: "danger",
    msg: "定位於範圍外",
    detail: `最近點：${nearName || "-"}｜距離約 ${minD == null ? "-" : minD} m`
  };
}

function updateGpsBadgeForModal_(which) {
  const duty = (which === "in") ? $("#inDutyType").val() : $("#outDutyType").val();
  const r = gpsPassDetailed_(duty);

  const $b = (which === "in") ? $("#inGpsBadge") : $("#outGpsBadge");
  $b.removeClass("text-bg-secondary text-bg-success text-bg-danger text-bg-warning")
    .addClass("text-bg-" + (r.pass ? "success" : (r.level || "danger")))
    .html(`<i class="fa-solid fa-location-dot me-1"></i>${esc_(r.msg)}`);

  if (!r.pass && r.detail) {
    showSignStatus_(which, "warning", r.detail);
  }
}

// -------------------- Sign list --------------------
function setDefaultMonth_() {
  const now = new Date();
  const ym = fmtYearMonth_(now);
  $("#signYmPicker").val(ym);
  $("#signYmText").text(ym);
}

function refreshSignAsync_() {
  const ym = $("#signYmPicker").val() || fmtYearMonth_(new Date());
  $("#signYmText").text(ym);

  $("#signTbody").html(`<tr><td colspan="6" class="text-center text-muted py-3">載入中...</td></tr>`);

  return $.get(webAppUrl, { action: "sign", ym: ym, personName: (selected.name || "") })
    .done(function (res) {
      if (!res || !res.ok) {
        const msg = (res && res.message) ? res.message : "載入失敗";
        $("#signTbody").html(`<tr><td colspan="6" class="text-center text-danger py-3">${esc_(msg)}</td></tr>`);
        setAssistHoursUi_(0, 0, ym);
        return;
      }

      setAssistHoursUi_(res.totalAssistMinutesAll || 0, res.totalAssistMinutesMonth || 0, ym);

      const list = res.data || [];
      if (!list.length) {
        $("#signTbody").html(`<tr><td colspan="6" class="text-center text-muted py-3">無資料</td></tr>`);
        return;
      }

      const rows = [];
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        const mins = parseInt(String(r.minutes == null ? "" : r.minutes), 10);
        const hourText = (!isNaN(mins) && mins > 0) ? (Math.round((mins / 60) * 10) / 10).toFixed(1) : "";

        rows.push(`
          <tr>
            <td>${esc_(r.dutyTypeText || "")}</td>
            <td>${esc_(r.signInDate || "")}</td>
            <td>${esc_(toHm_(r.signInTime || ""))}</td>
            <td>${esc_(r.signOutDate || "")}</td>
            <td>${esc_(toHm_(r.signOutTime || ""))}</td>
            <td class="text-end">${esc_(hourText)}</td>
          </tr>
        `);
      }
      $("#signTbody").html(rows.join(""));
    })
    .fail(function () {
      $("#signTbody").html(`<tr><td colspan="6" class="text-center text-danger py-3">載入失敗（請確認 GAS 部署/權限）</td></tr>`);
      setAssistHoursUi_(0, 0, ym);
    });
}

function setAssistHoursUi_(allMinutes, monthMinutes, ym) {
  const allH = minutesToHours1_(allMinutes);
  const monH = minutesToHours1_(monthMinutes);

  $("#totalAssistHoursText").text(allH.text);
  $("#monthAssistHoursText").text(monH.text);

  $("#totalAssistHint").text(allH.hint);
  $("#monthAssistHint").text(`${esc_(String(ym || ""))}｜${monH.hint}`);
}

function minutesToHours1_(m) {
  const n = parseInt(String(m == null ? "" : m), 10);
  if (isNaN(n) || n <= 0) return { text: "0.0", hint: "0 分鐘" };

  const h = n / 60;
  const h1 = Math.round(h * 10) / 10;
  return { text: h1.toFixed(1), hint: `${n} 分鐘` };
}

// -------------------- SignIn / SignOut --------------------
function fillSignInModal_() {
  const now = new Date();

  $("#inPersonName").val(selected.name || "");
  setTitleByName_($("#inPersonName").val(), "#inTitle");

  $("#inDate").val(fmtDate_(now));
  $("#inTime").val(fmtClockHm_(now));
  $("#inDate").attr("max", fmtDate_(now));

  if (!$("#inDutyType").val()) $("#inDutyType").val("assist");

  // ✅ 依簽到 duty 顯示目標點（含距離）
  renderGpsTargets_($("#inDutyType").val(), { from: "in" });
}

function fillSignOutModal_() {
  const now = new Date();

  $("#outPersonName").val(selected.name || "");
  setTitleByName_($("#outPersonName").val(), "#outTitle");

  $("#outDate").val(fmtDate_(now));
  $("#outTime").val(fmtClockHm_(now));
  $("#outDate").attr("max", fmtDate_(now));

  if (!$("#outDutyType").val()) $("#outDutyType").val("assist");

  renderGpsTargets_($("#outDutyType").val(), { from: "out" });
}

function updateOutUiByDuty_() {
  const duty = $("#outDutyType").val();
  const mode = $("#outMode").val();

  if (duty === "assist") {
    $("#outModeWrap").show();
    $("#outContentWrap").toggle(mode === "dispatch");
    if (mode !== "dispatch") $("#outContent").val("");
    return;
  }

  $("#outModeWrap").hide();
  $("#outMode").val("standby");
  $("#outContentWrap").show();
}

function dutyTypeText_(dutyType) {
  if (dutyType === "assist") return "協勤";
  if (dutyType === "training") return "常年訓練";
  if (dutyType === "work") return "公差勤務";
  return String(dutyType || "");
}

function prepareConfirmSignIn_() {
  clearSignStatus_("in");

  const dutyType = $("#inDutyType").val();
  const title = $("#inTitle").val().trim();
  const name = $("#inPersonName").val().trim();
  const signInDate = $("#inDate").val();
  const signInTime = toHm_($("#inTime").val());

  if (!name) { showSignStatus_("in", "danger", "請選姓名"); return; }
  if (!signInDate || !signInTime) { showSignStatus_("in", "danger", "簽到日期／時間為必填"); return; }

  if (isFuturePunch_(signInDate, signInTime)) {
    showSignStatus_("in", "danger", "選到未來時間，不能打卡");
    return;
  }

  const gps = gpsPassDetailed_(dutyType);
  if (!gps.pass && needGps_(dutyType)) {
    showSignStatus_("in", "danger", gps.detail ? ("GPS 未通過：" + gps.detail) : "GPS 未通過，無法簽到");
    return;
  }

  pendingConfirm.kind = "signIn";
  pendingConfirm.summary = {
    typeText: dutyTypeText_(dutyType),
    title: title,
    name: name,
    date: signInDate,
    time: signInTime,
    content: ""
  };
  pendingConfirm.request = {
    action: "signIn",
    dutyType: dutyType,
    title: title,
    personName: name,
    signInDate: signInDate,
    signInTime: signInTime
  };

  fillConfirmModal_(pendingConfirm.summary, false);
  confirmModal.show();
}

function prepareConfirmSignOut_() {
  clearSignStatus_("out");

  const dutyType = $("#outDutyType").val();
  const title = $("#outTitle").val().trim();
  const name = $("#outPersonName").val().trim();
  const signOutDate = $("#outDate").val();
  const signOutTime = toHm_($("#outTime").val());
  const mode = $("#outMode").val();
  const content = $("#outContent").val().trim();

  if (!name) { showSignStatus_("out", "danger", "請選姓名"); return; }
  if (!signOutDate || !signOutTime) { showSignStatus_("out", "danger", "簽退日期／時間為必填"); return; }

  if (isFuturePunch_(signOutDate, signOutTime)) {
    showSignStatus_("out", "danger", "選到未來時間，不能打卡");
    return;
  }

  const gps = gpsPassDetailed_(dutyType);
  if (!gps.pass && needGps_(dutyType)) {
    showSignStatus_("out", "danger", gps.detail ? ("GPS 未通過：" + gps.detail) : "GPS 未通過，無法簽退");
    return;
  }

  let dutyContent = "";
  if (dutyType === "assist") {
    if (mode === "standby") {
      dutyContent = "協勤";
    } else {
      if (!content) { showSignStatus_("out", "danger", "協勤「出勤」請填工作內容"); return; }
      dutyContent = content;
    }
  } else {
    if (!content) { showSignStatus_("out", "danger", "公差勤務請填工作內容"); return; }
    dutyContent = content;
  }

  pendingConfirm.kind = "signOut";
  pendingConfirm.summary = {
    typeText: dutyTypeText_(dutyType),
    title: title,
    name: name,
    date: signOutDate,
    time: signOutTime,
    content: dutyContent
  };
  pendingConfirm.request = {
    action: "signOut",
    dutyType: dutyType,
    title: title,
    personName: name,
    signOutDate: signOutDate,
    signOutTime: signOutTime,
    dutyContent: dutyContent
  };

  fillConfirmModal_(pendingConfirm.summary, true);
  confirmModal.show();
}

function fillConfirmModal_(s, showContent) {
  $("#cfType").text(s.typeText || "--");
  $("#cfTitle").text(s.title || "--");
  $("#cfPersonName").text(s.name || "--");
  $("#cfDate").text(s.date || "--");
  $("#cfTime").text(s.time || "--");

  if (showContent) {
    $("#cfContentRow").show();
    $("#cfContent").text(s.content || "--");
  } else {
    $("#cfContentRow").hide();
    $("#cfContent").text("");
  }
}

function doConfirmedSubmit_() {
  if (!pendingConfirm || !pendingConfirm.request || !pendingConfirm.request.action) {
    confirmModal.hide();
    return;
  }

  $("#btnConfirmSubmit").prop("disabled", true);
  showLoading_(true);

  const req = pendingConfirm.request;
  const kind = pendingConfirm.kind;

  $.get(webAppUrl, req)
    .done(function (res) {
      if (res && res.ok) {
        if (kind === "signIn") {
          showSignStatus_("in", "success", "簽到完成");
          inModal.hide();
        } else {
          showSignStatus_("out", "success", "簽退完成");
          outModal.hide();
        }

        confirmModal.hide();
        refreshSignAsync_();
      } else {
        const msg = (res && res.message) ? res.message : "原因不明";
        if (kind === "signIn") showSignStatus_("in", "danger", "簽到失敗：" + msg);
        else showSignStatus_("out", "danger", "簽退失敗：" + msg);
      }
    })
    .fail(function () {
      if (kind === "signIn") showSignStatus_("in", "danger", "簽到送出失敗（請確認 GAS 部署／權限）");
      else showSignStatus_("out", "danger", "簽退送出失敗（請確認 GAS 部署／權限）");
    })
    .always(function () {
      showLoading_(false);
      $("#btnConfirmSubmit").prop("disabled", false);

      pendingConfirm.kind = "";
      pendingConfirm.summary = null;
      pendingConfirm.request = null;
    });
}

// -------------------- status / utils --------------------
function showStatus_(type, msg) {
  $("#statusBar").html(`
    <div class="alert alert-${esc_(type)} roundedX py-2 px-3 mb-0">
      <i class="fa-solid ${typeIcon_(type)} me-2"></i>${esc_(msg)}
    </div>
  `);
}

function clearSignStatus_(which) {
  const $wrap = (which === "in") ? $("#inStatusBar") : $("#outStatusBar");
  $wrap.html("");
}

function showSignStatus_(which, type, msg) {
  const $wrap = (which === "in") ? $("#inStatusBar") : $("#outStatusBar");
  $wrap.html(`
    <div class="alert alert-${esc_(type)} roundedX py-2 px-3 mb-0">
      <i class="fa-solid ${typeIcon_(type)} me-2"></i>${esc_(msg)}
    </div>
  `);
}

function typeIcon_(type) {
  if (type === "success") return "fa-circle-check";
  if (type === "danger") return "fa-triangle-exclamation";
  if (type === "warning") return "fa-circle-exclamation";
  return "fa-circle-info";
}

function fmtDate_(d) {
  const y = d.getFullYear();
  const m = pad2_(d.getMonth() + 1);
  const day = pad2_(d.getDate());
  return `${y}-${m}-${day}`;
}

function fmtYearMonth_(d) {
  const y = d.getFullYear();
  const m = pad2_(d.getMonth() + 1);
  return `${y}-${m}`;
}

function fmtClockHms_(d) {
  const hh = pad2_(d.getHours());
  const mm = pad2_(d.getMinutes());
  const ss = pad2_(d.getSeconds());
  return `${hh}:${mm}:${ss}`;
}

function fmtClockHm_(d) {
  const hh = pad2_(d.getHours());
  const mm = pad2_(d.getMinutes());
  return `${hh}:${mm}`;
}

function toHm_(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  if (t.length >= 5) return t.substring(0, 5);
  return t;
}

function pad2_(n) { return (n < 10 ? "0" : "") + n; }

function esc_(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function distMeters_(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseLocalDateTime_(dateStr, timeStr) {
  const d = String(dateStr || "").trim();
  const t = String(timeStr || "").trim();
  if (!d || !t) return null;
  const dt = new Date(`${d}T${t}:00`);
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function isFuturePunch_(dateStr, timeStr) {
  const dt = parseLocalDateTime_(dateStr, timeStr);
  if (!dt) return false;
  const now = new Date();
  return dt.getTime() > (now.getTime() + FUTURE_TOLERANCE_MS);
}

function registerServiceWorker_() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(function () { });
}
