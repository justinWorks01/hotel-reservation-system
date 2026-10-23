/* ==========================================
   MAIN APPLICATION (js/app.js)
   Handles: menu, page switching, dashboard, logout
   ========================================== */

// ----- 1. THE MENU -----
// Each item has an id, a label, and the stage where it will be built.
const menuItems = [
  { id: "dashboard",    label: "📊 Dashboard",    stage: "Stage 1" },
  { id: "roomtypes",    label: "🏷️ Room Types",   stage: "Stage 3" },
  { id: "rooms",        label: "🛏️ Rooms",        stage: "Stage 3" },
  { id: "availability", label: "🔍 Availability", stage: "Stage 3" },
  { id: "guests",       label: "👥 Guests",       stage: "Stage 4" },
  { id: "reservations", label: "📅 Reservations", stage: "a later stage" },
  { id: "checkin",      label: "🔑 Check-in",     stage: "a later stage" },
  { id: "billing",      label: "💳 Billing",      stage: "a later stage" },
  { id: "checkout",     label: "🚪 Check-out",    stage: "a later stage" },
  { id: "reports",      label: "📈 Reports",      stage: "a later stage" },
  { id: "users",        label: "🔐 Users",        stage: "a later stage" },
  { id: "database",     label: "🗄️ Database",     stage: "Stage 2" },
  { id: "logout",       label: "⏻ Logout",        stage: "" }
];

// Get the parts of the page we need to change
const menuList     = document.getElementById("menu");
const contentArea  = document.getElementById("content");
const pageTitle    = document.getElementById("page-title");
const dbStatus     = document.getElementById("db-status");
const logoutScreen = document.getElementById("logout-screen");

// Build the menu links on the screen
function buildMenu() {
  menuItems.forEach(function (item) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.textContent = item.label;
    link.id = "menu-" + item.id;
    link.addEventListener("click", function () {
      showPage(item.id);
    });
    li.appendChild(link);
    menuList.appendChild(li);
  });
}

// ----- 2. SHOWING A PAGE -----
function showPage(pageId) {
  // Logout is not a page, it has its own behavior
  if (pageId === "logout") {
    logout();
    return;
  }

  // Highlight the selected menu item
  menuItems.forEach(function (item) {
    document.getElementById("menu-" + item.id).classList.remove("active");
  });
  document.getElementById("menu-" + pageId).classList.add("active");

  // Find the menu item to get its label
  const item = menuItems.find(function (m) { return m.id === pageId; });
  pageTitle.textContent = item.label.split(" ").slice(1).join(" ");   // remove the emoji

  // Show the dashboard, or a "coming soon" page for modules not yet built
  if (pageId === "dashboard") {
    showDashboard();
  } else if (pageId === "roomtypes") {
    showRoomTypesPage();
  } else if (pageId === "rooms") {
    showRoomsPage();
  } else if (pageId === "availability") {
    showAvailabilityPage();
  } else if (pageId === "database") {
    showDatabasePage();
  } else {
    showComingSoon(item);
  }
}

// ----- 3. THE DASHBOARD -----
function showDashboard() {
  // Count the rooms that are available
  const availableRooms = Database.getAll("rooms").filter(function (room) {
    return room.status === "Available" && room.active_status !== "Inactive";
  }).length;

  contentArea.innerHTML =
    '<div class="card-grid">' +
      makeCard("Total Rooms", Database.count("rooms")) +
      makeCard("Available Rooms", availableRooms) +
      makeCard("Guests", Database.count("guests")) +
      makeCard("Reservations", Database.count("reservations")) +
      makeCard("Checked-in", Database.count("check_ins")) +
    '</div>' +
    '<div class="panel">' +
      '<h2>Welcome to the Hotel Reservation System</h2>' +
      '<p>Use the menu on the left to move around the system.</p>' +
      '<p>The numbers above will update automatically as we add rooms, guests and reservations in the next laboratory activities.</p>' +
    '</div>';
}

// Helper that creates the HTML of one dashboard card
function makeCard(label, number) {
  return '<div class="card">' +
           '<div class="label">' + label + '</div>' +
           '<div class="number">' + number + '</div>' +
         '</div>';
}

// ----- 4. PAGES NOT YET BUILT -----
function showComingSoon(item) {
  contentArea.innerHTML =
    '<div class="panel">' +
      '<h2>' + item.label + '</h2>' +
      '<p>This module will be developed in <strong>' + item.stage + '</strong>.</p>' +
    '</div>';
}

// ----- 5. LOGOUT -----
function logout() {
  if (confirm("Are you sure you want to log out?")) {
    logoutScreen.classList.remove("hidden");
  }
}

document.getElementById("login-again").addEventListener("click", function () {
  logoutScreen.classList.add("hidden");
  showPage("dashboard");
});

// ----- 6. START THE APPLICATION -----
function startApp() {
  // Connect to the database and show the result in the top bar
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
