// =======================================================
// Navbar 共用邏輯
// =======================================================

function initializeNavbar(onCompleted) {
  console.log("[INFO] 載入 Navbar");

  $("#navbarContainer").load("navbar.html", function (response, status, xhr) {
    if (status === "error") {
      console.log("[ERROR] Navbar 載入失敗", xhr.status, xhr.statusText);
      return;
    }

    $("#navbarBrandText").text(appConfig.appTitle);

    $("#openUserModalButton").on("click", function () {
      $("#userModal").modal("show");
    });

    console.log("[INFO] Navbar 載入完成");

    if (typeof onCompleted === "function") {
      onCompleted();
    }
  });
}

function updateNavbarPerson(person) {
  $("#navbarUnitText").text(person && person.unit ? person.unit : "-");
  $("#navbarTitleText").text(person && person.title ? person.title : "-");
  $("#navbarNameText").text(person && person.name ? person.name : "-");
}

function resetNavbarPerson() {
  $("#navbarUnitText").text("-");
  $("#navbarTitleText").text("-");
  $("#navbarNameText").text("-");
}
