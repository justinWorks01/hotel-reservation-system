let guestPanel = null;
let guestSearch = "";
let guestStatusFilter = "All";

const GUEST_ID_TYPES = ["Passport", "Driver's License", "National ID", "UMID", "Voter's ID", "Other"];

function isGuestActive(guest) {
  return guest.active_status !== "Inactive";
}

function getGuestName(guest) {
  return guest.first_name + " " + guest.last_name;
}

function maskReference(reference) {
  return reference ? "********" : "-";
}

function nextGuestNo() {
  let highest = 0;
  Database.getAll("guests").forEach(function (g) {
    const match = /^G-(\d+)$/.exec(g.guest_no);
    if (match && Number(match[1]) > highest) highest = Number(match[1]);
  });
  return "G-" + String(highest + 1).padStart(4, "0");
}

function findUpcomingReservations(guestId) {
  const today = todayText();
  return Database.getAll("reservations").filter(function (r) {
    return r.guest_id === guestId &&
           (r.status === "Pending" || r.status === "Confirmed" || r.status === "Checked-in") &&
           r.check_out_date >= today;
  });
}

function showGuestsPage(message) {
  let html = "";
  if (message) html += '<div class="message-area">' + message + '</div>';
  if (guestPanel) html += buildGuestPanel();

  let filterOptions = "";
  ["All", "Active", "Inactive"].forEach(function (s) {
    filterOptions += '<option value="' + s + '"' + (s === guestStatusFilter ? " selected" : "") + '>' +
                     (s === "All" ? "All guests" : s) + '</option>';
  });

  html += '<div class="panel">' +
    '<div class="toolbar">' +
      '<input type="text" id="guest-search" class="input" placeholder="Search guest no., name, contact, email..." ' +
        'value="' + escapeHtml(guestSearch) + '" oninput="filterGuests()">' +
      '<select id="guest-status-filter" class="input" onchange="filterGuests()">' + filterOptions + '</select>' +
      '<button class="btn" onclick="addGuest()">+ Register Guest</button>' +
    '</div>' +
    '<table class="data-table">' +
      '<thead><tr><th>Guest No.</th><th>Name</th><th>Contact</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead>' +
      '<tbody id="guest-rows">' + buildGuestRows() + '</tbody>' +
    '</table>' +
  '</div>';

  contentArea.innerHTML = html;
}

function buildGuestRows() {
  const keyword = guestSearch.toLowerCase();

  const guests = Database.getAll("guests").filter(function (g) {
    const text = (g.guest_no + " " + getGuestName(g) + " " + g.contact_no + " " + (g.email || "")).toLowerCase();
    const active = isGuestActive(g);
    const matchesStatus = (guestStatusFilter === "All") ||
                          (guestStatusFilter === "Active" && active) ||
                          (guestStatusFilter === "Inactive" && !active);
    return text.indexOf(keyword) !== -1 && matchesStatus;
  });

  guests.sort(function (a, b) {
    return a.guest_no.localeCompare(b.guest_no, undefined, { numeric: true });
  });

  if (guests.length === 0) {
    return '<tr><td colspan="6">No guests found.</td></tr>';
  }

  let html = "";
  guests.forEach(function (g) {
    const active = isGuestActive(g);
    const id = g.guest_id;

    html += '<tr>' +
      '<td><strong>' + escapeHtml(g.guest_no) + '</strong></td>' +
      '<td>' + escapeHtml(getGuestName(g)) + '</td>' +
      '<td>' + escapeHtml(g.contact_no) + '</td>' +
      '<td>' + escapeHtml(g.email) + '</td>' +
      '<td>' + statusBadge(active ? "Active" : "Inactive") + '</td>' +
      '<td class="actions">' +
        '<button class="btn-small" onclick="viewGuest(' + id + ')">View</button> ' +
        '<button class="btn-small" onclick="profileGuest(' + id + ')">Profile</button> ' +
        '<button class="btn-small" onclick="editGuest(' + id + ')">Edit</button> ' +
        '<button class="btn-small btn-secondary" onclick="toggleGuest(' + id + ')">' + (active ? "Deactivate" : "Activate") + '</button>' +
      '</td>' +
    '</tr>';
  });
  return html;
}

function filterGuests() {
  guestSearch = document.getElementById("guest-search").value;
  guestStatusFilter = document.getElementById("guest-status-filter").value;
  document.getElementById("guest-rows").innerHTML = buildGuestRows();
}

function addGuest()        { guestPanel = { mode: "add",     id: null, draft: null }; showGuestsPage(); }
function editGuest(id)     { guestPanel = { mode: "edit",    id: id,   draft: null }; showGuestsPage(); }
function viewGuest(id)     { guestPanel = { mode: "view",    id: id,   draft: null }; showGuestsPage(); }
function profileGuest(id)  { guestPanel = { mode: "profile", id: id,   draft: null }; showGuestsPage(); }
function closeGuestPanel() { guestPanel = null; showGuestsPage(); }

function toggleGuest(id) {
  const guest = Database.getById("guests", id);
  const turningOff = isGuestActive(guest);

  if (turningOff) {
    const upcoming = findUpcomingReservations(id);
    if (upcoming.length > 0) {
      showGuestsPage(messageHtml("error", getGuestName(guest) + " has " + upcoming.length +
        " upcoming reservation(s) (" + upcoming.map(function (r) { return r.reservation_no; }).join(", ") +
        ") and cannot be deactivated."));
      return;
    }
  }

  const newValue = turningOff ? "Inactive" : "Active";
  const result = Database.update("guests", id, { active_status: newValue });

  if (result.ok) {
    showGuestsPage(messageHtml("ok", getGuestName(guest) + " is now " + newValue + "."));
  } else {
    showGuestsPage(messageHtml("error", result.errors));
  }
}

function buildGuestPanel() {
  if (guestPanel.mode === "view")    return buildGuestView(guestPanel.id);
  if (guestPanel.mode === "profile") return buildGuestProfile(guestPanel.id);
  return buildGuestForm();
}

function buildGuestForm() {
  const editing = (guestPanel.mode === "edit");
  const data = guestPanel.draft ||
               (editing ? Database.getById("guests", guestPanel.id) : { guest_no: nextGuestNo() });

  let idOptions = '<option value="">-- None --</option>';
  const idTypes = GUEST_ID_TYPES.slice();
  if (data.identification_type && idTypes.indexOf(data.identification_type) === -1) {
    idTypes.push(data.identification_type);
  }
  idTypes.forEach(function (t) {
    idOptions += '<option' + (t === data.identification_type ? " selected" : "") + '>' + escapeHtml(t) + '</option>';
  });

  return '<div class="panel">' +
    '<h2>GUEST REGISTRATION - ' + (editing ? "Edit" : "Add") + '</h2>' +
    '<div class="form-grid">' +
      '<div class="form-group"><label>Guest No.</label>' +
        '<input type="text" id="guest-no" class="input" placeholder="G-0001" value="' + escapeHtml(data.guest_no) + '"></div>' +
      '<div class="form-group"><label>First Name</label>' +
        '<input type="text" id="guest-first" class="input" value="' + escapeHtml(data.first_name) + '"></div>' +
      '<div class="form-group"><label>Last Name</label>' +
        '<input type="text" id="guest-last" class="input" value="' + escapeHtml(data.last_name) + '"></div>' +
      '<div class="form-group"><label>Contact</label>' +
        '<input type="text" id="guest-contact" class="input" placeholder="09123456789" value="' + escapeHtml(data.contact_no) + '"></div>' +
      '<div class="form-group"><label>Email</label>' +
        '<input type="text" id="guest-email" class="input" placeholder="juan@email.com" value="' + escapeHtml(data.email) + '"></div>' +
      '<div class="form-group"><label>Address</label>' +
        '<input type="text" id="guest-address" class="input" value="' + escapeHtml(data.address) + '"></div>' +
      '<div class="form-group"><label>Identification Type</label>' +
        '<select id="guest-id-type" class="input">' + idOptions + '</select></div>' +
      '<div class="form-group"><label>Identification Reference</label>' +
        '<input type="text" id="guest-id-ref" class="input" value="' + escapeHtml(data.identification_reference) + '"></div>' +
    '</div>' +
    '<p class="hint">Required: guest number, first name, last name and contact. Email and the other details are optional.</p>' +
    '<button class="btn" onclick="saveGuest()">Save</button> ' +
    '<button class="btn btn-secondary" onclick="closeGuestPanel()">Cancel</button>' +
  '</div>';
}

function buildGuestView(id) {
  const g = Database.getById("guests", id);

  return '<div class="panel">' +
    '<h2>GUEST INFORMATION</h2>' +
    '<ul class="detail-list">' +
      '<li><span>Guest No.:</span> ' + escapeHtml(g.guest_no) + '</li>' +
      '<li><span>First Name:</span> ' + escapeHtml(g.first_name) + '</li>' +
      '<li><span>Last Name:</span> ' + escapeHtml(g.last_name) + '</li>' +
      '<li><span>Contact:</span> ' + escapeHtml(g.contact_no) + '</li>' +
      '<li><span>Email:</span> ' + escapeHtml(g.email || "-") + '</li>' +
      '<li><span>Address:</span> ' + escapeHtml(g.address || "-") + '</li>' +
      '<li><span>Identification Type:</span> ' + escapeHtml(g.identification_type || "-") + '</li>' +
      '<li><span>Identification Reference:</span> ' + maskReference(g.identification_reference) + '</li>' +
      '<li><span>Status:</span> ' + statusBadge(isGuestActive(g) ? "Active" : "Inactive") + '</li>' +
    '</ul>' +
    '<button class="btn" onclick="profileGuest(' + id + ')">Open Profile</button> ' +
    '<button class="btn" onclick="editGuest(' + id + ')">Edit</button> ' +
    '<button class="btn btn-secondary" onclick="closeGuestPanel()">Close</button>' +
  '</div>';
}

function buildGuestProfile(id) {
  const g = Database.getById("guests", id);

  const reservations = Database.getAll("reservations")
    .filter(function (r) { return r.guest_id === id; })
    .sort(function (a, b) { return a.check_in_date.localeCompare(b.check_in_date); });

  const totalVisits = reservations.filter(function (r) { return r.status !== "Cancelled" && r.status !== "No-show"; }).length;

  let historyHtml = '<p>No reservations yet.</p>';
  if (reservations.length > 0) {
    historyHtml = '<ul class="history-list">';
    reservations.forEach(function (r) {
      const room = Database.getById("rooms", r.room_id);
      historyHtml += '<li><strong>' + escapeHtml(r.reservation_no) + '</strong> &ndash; ' +
        escapeHtml(formatDateRange(r.check_in_date, r.check_out_date)) +
        ' &ndash; Room ' + escapeHtml(room ? room.room_number : "?") +
        ' &ndash; ' + formatPeso(r.total_amount) + ' ' + statusBadge(r.status) + '</li>';
    });
    historyHtml += '</ul>';
  }

  const reservationIds = reservations.map(function (r) { return r.reservation_id; });
  const numberOf = function (reservationId) {
    const r = Database.getById("reservations", reservationId);
    return r ? r.reservation_no : "?";
  };

  const checkIns = Database.getAll("check_ins").filter(function (c) {
    return reservationIds.indexOf(c.reservation_id) !== -1;
  });
  const bills = Database.getAll("billing").filter(function (b) { return b.guest_id === id; });
  const checkOuts = Database.getAll("check_outs").filter(function (c) {
    return reservationIds.indexOf(c.reservation_id) !== -1;
  });

  let transactionHtml = "";
  checkIns.forEach(function (c) {
    transactionHtml += '<li>Check-in &ndash; ' + escapeHtml(numberOf(c.reservation_id)) + ' &ndash; ' +
                       escapeHtml(formatDateTime(c.actual_check_in)) + '</li>';
  });
  bills.forEach(function (b) {
    transactionHtml += '<li>Bill #' + b.bill_id + ' &ndash; ' + escapeHtml(numberOf(b.reservation_id)) +
                       ' &ndash; Total ' + formatPeso(b.total_amount) + ', Paid ' + formatPeso(b.amount_paid) +
                       ', Balance ' + formatPeso(b.balance) + '</li>';
  });
  checkOuts.forEach(function (c) {
    transactionHtml += '<li>Check-out &ndash; ' + escapeHtml(numberOf(c.reservation_id)) + ' &ndash; ' +
                       escapeHtml(formatDateTime(c.checkout_date)) + ' &ndash; ' + escapeHtml(c.payment_status) + '</li>';
  });
  transactionHtml = transactionHtml
    ? '<ul class="history-list">' + transactionHtml + '</ul>'
    : '<p>No check-ins, bills or check-outs yet.</p>';

  return '<div class="panel">' +
    '<h2>GUEST PROFILE</h2>' +
    '<hr class="divider">' +
    '<ul class="detail-list">' +
      '<li><span>Guest No.:</span> ' + escapeHtml(g.guest_no) + '</li>' +
      '<li><span>Name:</span> ' + escapeHtml(getGuestName(g)) + '</li>' +
      '<li><span>Contact:</span> ' + escapeHtml(g.contact_no) + '</li>' +
      '<li><span>Email:</span> ' + escapeHtml(g.email || "-") + '</li>' +
      '<li><span>Address:</span> ' + escapeHtml(g.address || "-") + '</li>' +
      '<li><span>Status:</span> ' + statusBadge(isGuestActive(g) ? "Active" : "Inactive") + '</li>' +
    '</ul>' +
    '<h3 class="section-title">Reservation History:</h3>' + historyHtml +
    '<h3 class="section-title">Hotel Transactions:</h3>' + transactionHtml +
    '<hr class="divider">' +
    '<p><strong>Total Visits: ' + totalVisits + '</strong></p>' +
    '<button class="btn" onclick="editGuest(' + id + ')">Edit</button> ' +
    '<button class="btn btn-secondary" onclick="closeGuestPanel()">Close</button>' +
  '</div>';
}

function saveGuest() {
  const record = {
    guest_no:   document.getElementById("guest-no").value.trim(),
    first_name: document.getElementById("guest-first").value.trim(),
    last_name:  document.getElementById("guest-last").value.trim(),

    contact_no: document.getElementById("guest-contact").value.replace(/[\s-]/g, ""),
    email:      document.getElementById("guest-email").value.trim(),
    address:    document.getElementById("guest-address").value.trim(),
    identification_type:      document.getElementById("guest-id-type").value,
    identification_reference: document.getElementById("guest-id-ref").value.trim()
  };

  let result;
  if (guestPanel.mode === "edit") {
    result = Database.update("guests", guestPanel.id, record);
  } else {
    result = Database.insert("guests", record);
  }

  if (!result.ok) {
    guestPanel.draft = record;
    showGuestsPage(messageHtml("error", result.errors));
    return;
  }

  guestPanel = null;
  showGuestsPage(messageHtml("ok", "Guest saved successfully."));
}
