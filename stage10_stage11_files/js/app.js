const menuItems = [
  { id: "dashboard",    label: "📊 Dashboard",    stage: "Stage 1" },
  { id: "roomtypes",    label: "🏷️ Room Types",   stage: "Stage 3" },
  { id: "rooms",        label: "🛏️ Rooms",        stage: "Stage 3" },
  { id: "availability", label: "🔍 Availability", stage: "Stage 3" },
  { id: "guests",       label: "👥 Guests",       stage: "Stage 4" },
  { id: "reservations", label: "📅 Reservations", stage: "Stage 5" },
  { id: "stage10",      label: "✔️ Stage 10 - Confirmation", stage: "Stage 10" },
  { id: "stage11",      label: "📜 Stage 11 - Search & History", stage: "Stage 11" },
  { id: "checkin",      label: "🔑 Check-in",     stage: "Stage 6" },
  { id: "billing",      label: "💳 Billing",      stage: "Stage 7" },
  { id: "checkout",     label: "🚪 Check-out",    stage: "Stage 8" },
  { id: "receipts",     label: "🧾 Receipts",     stage: "Stage 8" },
  { id: "reports",      label: "📈 Reports",      stage: "Stage 9" },
  { id: "users",        label: "🔐 Users",        stage: "a later stage" },
  { id: "database",     label: "🗄️ Database",     stage: "Stage 2" },
  { id: "logout",       label: "⏻ Logout",        stage: "" }
];
const menuList     = document.getElementById("menu");
const contentArea  = document.getElementById("content");
const pageTitle    = document.getElementById("page-title");
const dbStatus     = document.getElementById("db-status");
const logoutScreen = document.getElementById("logout-screen");

function buildMenu() {
  menuItems.forEach(function (item) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.textContent = item.label;
    link.id = "menu-" + item.id;
    link.addEventListener("click", function () { showPage(item.id); });
    li.appendChild(link);
    menuList.appendChild(li);
  });
}

function showPage(pageId) {
  if (pageId === "logout") { logout(); return; }
  menuItems.forEach(item => document.getElementById("menu-" + item.id).classList.remove("active"));
  document.getElementById("menu-" + pageId).classList.add("active");
  const item = menuItems.find(m => m.id === pageId);
  pageTitle.textContent = item.label.replace(/^[^\s]+\s*/, "");

  if (pageId === "dashboard") showDashboard();
  else if (pageId === "roomtypes") showRoomTypesPage();
  else if (pageId === "rooms") showRoomsPage();
  else if (pageId === "availability") showAvailabilityPage();
  else if (pageId === "guests") showGuestsPage();
  else if (pageId === "reservations") showReservationsPage();
  else if (pageId === "stage10") showStage10Page();
  else if (pageId === "stage11") showStage11Page();
  else if (pageId === "checkin") showCheckinPage();
  else if (pageId === "billing") showBillingPage();
  else if (pageId === "checkout") showCheckoutPage();
  else if (pageId === "receipts") showReceiptsPage();
  else if (pageId === "reports") showReportsPage();
  else if (pageId === "database") showDatabasePage();
  else showComingSoon(item);
}

function showDashboard() {
  const availableRooms = Database.getAll("rooms").filter(room =>
    room.status === "Available" && room.active_status !== "Inactive").length;
  contentArea.innerHTML =
    '<div class="card-grid">' +
      makeCard("Total Rooms", Database.count("rooms")) +
      makeCard("Available Rooms", availableRooms) +
      makeCard("Guests", Database.getAll("guests").filter(isGuestActive).length) +
      makeCard("Reservations", Database.count("reservations")) +
      makeCard("Checked-in", Database.getAll("reservations").filter(r => r.status === "Checked-in").length) +
    '</div><div class="panel"><h2>Welcome to the Hotel Reservation System</h2>' +
    '<p>Use the menu on the left to move around the system.</p>' +
    '<p>The numbers above will update automatically as records are added.</p></div>';
}
function makeCard(label, number) {
  return '<div class="card"><div class="label">' + label +
    '</div><div class="number">' + number + '</div></div>';
}
function showComingSoon(item) {
  contentArea.innerHTML = '<div class="panel"><h2>' + item.label +
    '</h2><p>This module will be developed in <strong>' + item.stage + '</strong>.</p></div>';
}
function logout() {
  if (confirm("Are you sure you want to log out?")) logoutScreen.classList.remove("hidden");
}
document.getElementById("login-again").addEventListener("click", function () {
  logoutScreen.classList.add("hidden");
  showPage("dashboard");
});
function startApp() {
  if (Database.connect()) {
    dbStatus.textContent = "Database: Connected";
    dbStatus.classList.add("connected");
  } else {
    dbStatus.textContent = "Database: Failed";
    dbStatus.classList.add("failed");
  }
  buildMenu();
  showPage("dashboard");
}
startApp();
