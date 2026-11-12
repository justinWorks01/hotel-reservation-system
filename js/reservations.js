let reservationPanel = null;
let reservationSearch = "";
let reservationStatusFilter = "All";
let reservationFrom = "";
let reservationTo = "";

const RESERVATION_TRANSITIONS = {
  "Pending":     ["Confirmed", "Cancelled"],
  "Confirmed":   ["Checked-in", "Cancelled", "No-show"],
  "Checked-in":  ["Checked-out"],
  "Checked-out": [],
  "Cancelled":   [],
  "No-show":     []
};

function nextReservationNo() {
  let highest = 0;
  Database.getAll("reservations").forEach(function (r) {
    const match = /^R-(\d+)$/.exec(r.reservation_no);
    if (match && Number(match[1]) > highest) highest = Number(match[1]);
  });
  return "R-" + String(highest + 1).padStart(4, "0");
}

function getReservationGuestName(reservation) {
  const guest = Database.getById("guests", reservation.guest_id);
  return guest ? getGuestName(guest) : "(unknown)";
}

function getReservationRoomNumber(reservation) {
  const room = Database.getById("rooms", reservation.room_id);
  return room ? room.room_number : "?";
}

function valueOrEmpty(value) {
  return (value === undefined || value === null) ? "" : value;
}

function inputFromRecord(data) {
  return {
    guestId:  valueOrEmpty(data.guest_id),
    roomId:   valueOrEmpty(data.room_id),
    checkIn:  valueOrEmpty(data.check_in_date),
    checkOut: valueOrEmpty(data.check_out_date),
    guests:   valueOrEmpty(data.number_of_guests)
  };
}

function readReservationForm() {
  return {
    guestId:  toNumber(document.getElementById("rv-guest").value),
    roomId:   toNumber(document.getElementById("rv-room").value),
    checkIn:  document.getElementById("rv-checkin").value,
    checkOut: document.getElementById("rv-checkout").value,
    guests:   toNumber(document.getElementById("rv-guests").value)
  };
}

function currentIgnoreId() {
  return (reservationPanel && reservationPanel.mode === "edit") ? reservationPanel.id : null;
}

function datesAreValid(input) {
  return input.checkIn !== "" && input.checkOut !== "" && input.checkOut > input.checkIn;
}

function validateReservation(input, ignoreId, live) {
  const errors = [];
  const isMissing = function (v) { return v === "" || v === undefined || v === null; };

  let guest = null;
  if (isMissing(input.guestId)) {
    if (!live) errors.push("Guest is required.");
  } else {
    guest = Database.getById("guests", input.guestId);
    if (!guest) {
      errors.push("Guest does not exist.");
    } else if (!isGuestActive(guest)) {
      errors.push(getGuestName(guest) + " is inactive and cannot make a reservation.");
    }
  }

  let room = null;
  if (isMissing(input.roomId)) {
    if (!live) errors.push("Room is required.");
  } else {
    room = Database.getById("rooms", input.roomId);
    if (!room) {
      errors.push("Room does not exist.");
    } else if (!isRoomActive(room)) {
      errors.push("Room " + room.room_number + " is inactive.");
    } else if (room.status === "Maintenance") {
      errors.push("Room " + room.room_number + " is under maintenance.");
    }
  }

  if (isMissing(input.checkIn) && !live) errors.push("Check-in date is required.");
  if (isMissing(input.checkOut) && !live) errors.push("Check-out date is required.");
  if (!isMissing(input.checkIn) && !isMissing(input.checkOut) && input.checkOut <= input.checkIn) {
    errors.push("Check-out date must be after the check-in date.");
  }

  if (isMissing(input.guests)) {
    if (!live) errors.push("Number of guests is required.");
  } else if (!Number.isInteger(input.guests) || input.guests < 1) {
    errors.push("Number of guests must be a whole number of at least 1.");
  } else if (room && input.guests > room.capacity) {
    errors.push("Room " + room.room_number + " can only accommodate " + room.capacity + " guests.");
  }

  if (room && datesAreValid(input)) {
    const clash = findRoomConflict(room.room_id, input.checkIn, input.checkOut, ignoreId);
    if (clash) {
      errors.push("Room " + room.room_number + " is already reserved for " +
                  formatDateRange(clash.check_in_date, clash.check_out_date) + " (" + clash.reservation_no + ").");
    }
  }

  return errors;
}

function notAllowedHtml(errors, title) {
  return '<p class="not-allowed">' + escapeHtml(title || "RESERVATION NOT ALLOWED") + '</p>' +
         errors.map(function (e) { return '<p class="msg-error">' + escapeHtml(e) + '</p>'; }).join("");
}

function showReservationsPage(message) {
  let html = "";
  if (message) html += '<div class="message-area">' + message + '</div>';
  if (reservationPanel) html += buildReservationPanel();

  let statusOptions = "";
  ["All"].concat(SCHEMA.reservations.fields.status.allowed).forEach(function (s) {
    statusOptions += '<option value="' + s + '"' + (s === reservationStatusFilter ? " selected" : "") + '>' +
                     (s === "All" ? "All statuses" : s) + '</option>';
  });

  html += '<div class="panel">' +
    '<h2>RESERVATION HISTORY</h2>' +
    '<div class="toolbar">' +
      '<input type="text" id="rv-search" class="input" placeholder="Search reservation no., guest, room..." ' +
        'value="' + escapeHtml(reservationSearch) + '" oninput="filterReservations()">' +
      '<select id="rv-status-filter" class="input" onchange="filterReservations()">' + statusOptions + '</select>' +
      '<label class="inline-label">From <input type="date" id="rv-from" class="input" value="' + escapeHtml(reservationFrom) + '" onchange="filterReservations()"></label>' +
      '<label class="inline-label">To <input type="date" id="rv-to" class="input" value="' + escapeHtml(reservationTo) + '" onchange="filterReservations()"></label>' +
      '<button class="btn" onclick="addReservation()">+ New Reservation</button>' +
    '</div>' +
    '<table class="data-table">' +
      '<thead><tr><th>Reservation</th><th>Guest</th><th>Room</th><th>Dates</th><th>Guests</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>' +
      '<tbody id="rv-rows">' + buildReservationRows() + '</tbody>' +
    '</table>' +
  '</div>';

  contentArea.innerHTML = html;
}

function buildReservationRows() {
  const keyword = reservationSearch.toLowerCase();

  const reservations = Database.getAll("reservations").filter(function (r) {
    const text = (r.reservation_no + " " + getReservationGuestName(r) + " room " + getReservationRoomNumber(r)).toLowerCase();
    const matchesText = text.indexOf(keyword) !== -1;
    const matchesStatus = (reservationStatusFilter === "All" || r.status === reservationStatusFilter);
    const matchesFrom = !reservationFrom || r.check_out_date >= reservationFrom;
    const matchesTo = !reservationTo || r.check_in_date <= reservationTo;
    return matchesText && matchesStatus && matchesFrom && matchesTo;
  });

  reservations.sort(function (a, b) { return b.reservation_id - a.reservation_id; });

  if (reservations.length === 0) {
    return '<tr><td colspan="8">No reservations found.</td></tr>';
  }

  let html = "";
  reservations.forEach(function (r) {
    const id = r.reservation_id;
    let actions = '<button class="btn-small" onclick="viewReservation(' + id + ')">View</button> ';

    if (r.status === "Pending" || r.status === "Confirmed") {
      actions += '<button class="btn-small" onclick="editReservation(' + id + ')">Edit</button> ';
    }
    if (r.status === "Pending") {
      actions += '<button class="btn-small" onclick="confirmReservation(' + id + ')">Confirm</button> ';
    }
    if (r.status === "Confirmed") {
      actions += '<button class="btn-small btn-secondary" onclick="markNoShow(' + id + ')">No-show</button> ';
    }
    if (r.status === "Pending" || r.status === "Confirmed") {
      actions += '<button class="btn-small btn-secondary" onclick="cancelReservation(' + id + ')">Cancel</button>';
    }

    html += '<tr>' +
      '<td><strong>' + escapeHtml(r.reservation_no) + '</strong></td>' +
      '<td>' + escapeHtml(getReservationGuestName(r)) + '</td>' +
      '<td>Room ' + escapeHtml(getReservationRoomNumber(r)) + '</td>' +
      '<td>' + escapeHtml(formatDateRange(r.check_in_date, r.check_out_date)) + '</td>' +
      '<td>' + r.number_of_guests + '</td>' +
      '<td>' + formatPeso(r.total_amount) + '</td>' +
      '<td>' + statusBadge(r.status) + '</td>' +
      '<td class="actions">' + actions + '</td>' +
    '</tr>';
  });
  return html;
}

function filterReservations() {
  reservationSearch = document.getElementById("rv-search").value;
  reservationStatusFilter = document.getElementById("rv-status-filter").value;
  reservationFrom = document.getElementById("rv-from").value;
  reservationTo = document.getElementById("rv-to").value;
  document.getElementById("rv-rows").innerHTML = buildReservationRows();
}

function addReservation()       { reservationPanel = { mode: "add",  id: null, draft: null }; showReservationsPage(); }
function editReservation(id)    { reservationPanel = { mode: "edit", id: id,   draft: null }; showReservationsPage(); }
function viewReservation(id)    { reservationPanel = { mode: "view", id: id,   draft: null }; showReservationsPage(); }
function closeReservationPanel() { reservationPanel = null; showReservationsPage(); }

function startReservation(roomId, checkIn, checkOut, guests) {
  reservationPanel = {
    mode: "add",
    id: null,
    draft: { room_id: roomId, check_in_date: checkIn, check_out_date: checkOut, number_of_guests: guests }
  };
  showPage("reservations");
}

function buildReservationPanel() {
  if (reservationPanel.mode === "view") return buildReservationView(reservationPanel.id);
  return buildReservationForm();
}

function buildGuestOptions(selectedId) {
  let options = '<option value="">-- Select guest --</option>';
  const guests = Database.getAll("guests").filter(function (g) {
    return isGuestActive(g) || g.guest_id === selectedId;
  });
  guests.sort(function (a, b) { return a.guest_no.localeCompare(b.guest_no, undefined, { numeric: true }); });
  guests.forEach(function (g) {
    options += '<option value="' + g.guest_id + '"' + (g.guest_id === selectedId ? " selected" : "") + '>' +
               escapeHtml(g.guest_no + " - " + getGuestName(g)) + '</option>';
  });
  return options;
}

function buildRoomOptions(input, ignoreId) {
  const reasons = {};
  if (datesAreValid(input)) {
    const guestCount = (Number.isInteger(input.guests) && input.guests >= 1) ? input.guests : 1;
    const found = findAvailableRooms(input.checkIn, input.checkOut, guestCount, "", ignoreId);
    found.unavailable.forEach(function (item) { reasons[item.room.room_id] = item.reason; });
  }

  let options = '<option value="">-- Select room --</option>';
  const rooms = Database.getAll("rooms").filter(function (room) {
    return isRoomActive(room) || room.room_id === input.roomId;
  });
  rooms.sort(function (a, b) { return a.room_number.localeCompare(b.room_number, undefined, { numeric: true }); });

  rooms.forEach(function (room) {
    const type = Database.getById("room_types", room.room_type_id);
    let label = "Room " + room.room_number + " - " + (type ? type.type_name : "?") + " - " + formatPeso(room.rate) + "/night";
    if (reasons[room.room_id]) label += " (" + reasons[room.room_id] + ")";
    options += '<option value="' + room.room_id + '"' + (room.room_id === input.roomId ? " selected" : "") + '>' +
               escapeHtml(label) + '</option>';
  });
  return options;
}

function buildReservationSummary(input, ignoreId) {
  const guest = (input.guestId === "") ? null : Database.getById("guests", input.guestId);
  const room = (input.roomId === "") ? null : Database.getById("rooms", input.roomId);
  const type = room ? Database.getById("room_types", room.room_type_id) : null;
  const nights = datesAreValid(input) ? countNights(input.checkIn, input.checkOut) : 0;

  let html = '<div class="summary-box"><ul class="detail-list">' +
    '<li><span>Guest:</span> ' + (guest ? escapeHtml(getGuestName(guest)) : "-") + '</li>' +
    '<li><span>Room:</span> ' + (room ? escapeHtml(room.room_number) : "-") + '</li>' +
    '<li><span>Room Type:</span> ' + (type ? escapeHtml(type.type_name) : "-") + '</li>' +
    '<li><span>Check-in:</span> ' + (input.checkIn ? escapeHtml(formatDate(input.checkIn)) : "-") + '</li>' +
    '<li><span>Check-out:</span> ' + (input.checkOut ? escapeHtml(formatDate(input.checkOut)) : "-") + '</li>' +
    '<li><span>Guests:</span> ' + (input.guests === "" ? "-" : escapeHtml(input.guests)) + '</li>' +
    '<li><span>Rate:</span> ' + (room ? formatPeso(room.rate) + '/night' : "-") + '</li>' +
    '<li><span>Nights:</span> ' + (nights > 0 ? nights : "-") + '</li>' +
  '</ul>';

  if (room && nights > 0) {
    html += '<p class="computation"><strong>Room Charge</strong> = Room Rate &times; Number of Nights<br>' +
            formatPeso(room.rate) + ' &times; ' + nights + ' = <strong>' + formatPeso(room.rate * nights) + '</strong></p>';
  }

  const errors = validateReservation(input, ignoreId, true);
  if (errors.length > 0) {
    html += notAllowedHtml(errors);
  } else if (guest && room && nights > 0 && input.guests !== "") {
    html += '<p class="msg-ok">This reservation can be saved.</p>';
  }

  return html + '</div>';
}

function buildReservationForm() {
  const editing = (reservationPanel.mode === "edit");
  const data = reservationPanel.draft ||
               (editing ? Database.getById("reservations", reservationPanel.id) : { number_of_guests: 1 });
  const input = inputFromRecord(data);
  const ignoreId = currentIgnoreId();

  return '<div class="panel">' +
    '<h2>RESERVATION - ' + (editing ? "Edit " + escapeHtml(data.reservation_no) : "New") + '</h2>' +
    '<div class="form-grid">' +
      '<div class="form-group"><label>Guest</label>' +
        '<select id="rv-guest" class="input" onchange="refreshReservationForm()">' + buildGuestOptions(input.guestId) + '</select></div>' +
      '<div class="form-group"><label>Check-in</label>' +
        '<input type="date" id="rv-checkin" class="input" value="' + escapeHtml(input.checkIn) + '" onchange="refreshReservationForm()"></div>' +
      '<div class="form-group"><label>Check-out</label>' +
        '<input type="date" id="rv-checkout" class="input" value="' + escapeHtml(input.checkOut) + '" onchange="refreshReservationForm()"></div>' +
      '<div class="form-group"><label>Guests</label>' +
        '<input type="number" id="rv-guests" class="input" min="1" step="1" value="' + escapeHtml(input.guests) + '" oninput="refreshReservationForm()"></div>' +
      '<div class="form-group"><label>Room</label>' +
        '<select id="rv-room" class="input" onchange="refreshReservationForm()">' + buildRoomOptions(input, ignoreId) + '</select></div>' +
    '</div>' +
    '<p class="hint">Rooms that are not free for the chosen dates are marked in the Room list. New reservations start as Pending until they are confirmed.</p>' +
    '<div id="rv-summary">' + buildReservationSummary(input, ignoreId) + '</div>' +
    '<button class="btn" onclick="saveReservation()">Save Reservation</button> ' +
    '<button class="btn btn-secondary" onclick="closeReservationPanel()">Cancel</button>' +
  '</div>';
}

function refreshReservationForm() {
  const input = readReservationForm();
  const ignoreId = currentIgnoreId();
  document.getElementById("rv-room").innerHTML = buildRoomOptions(input, ignoreId);
  document.getElementById("rv-summary").innerHTML = buildReservationSummary(input, ignoreId);
}

function buildReservationView(id) {
  const r = Database.getById("reservations", id);
  const room = Database.getById("rooms", r.room_id);
  const type = room ? Database.getById("room_types", room.room_type_id) : null;
  const nights = countNights(r.check_in_date, r.check_out_date);

  let buttons = '';
  if (r.status === "Pending" || r.status === "Confirmed") {
    buttons += '<button class="btn" onclick="editReservation(' + id + ')">Edit</button> ';
  }
  buttons += '<button class="btn btn-secondary" onclick="closeReservationPanel()">Close</button>';

  return '<div class="panel">' +
    '<h2>RESERVATION</h2>' +
    '<ul class="detail-list">' +
      '<li><span>Reservation No.:</span> ' + escapeHtml(r.reservation_no) + '</li>' +
      '<li><span>Status:</span> ' + statusBadge(r.status) + '</li>' +
      '<li><span>Guest:</span> ' + escapeHtml(getReservationGuestName(r)) + '</li>' +
      '<li><span>Room:</span> ' + escapeHtml(room ? room.room_number : "?") + '</li>' +
      '<li><span>Room Type:</span> ' + escapeHtml(type ? type.type_name : "?") + '</li>' +
      '<li><span>Check-in:</span> ' + escapeHtml(formatDate(r.check_in_date)) + '</li>' +
      '<li><span>Check-out:</span> ' + escapeHtml(formatDate(r.check_out_date)) + '</li>' +
      '<li><span>Guests:</span> ' + r.number_of_guests + '</li>' +
      '<li><span>Nights:</span> ' + nights + '</li>' +
      '<li><span>Room Charge:</span> ' + formatPeso(r.total_amount) + '</li>' +
      '<li><span>Reserved on:</span> ' + escapeHtml(formatDate(r.reservation_date)) + '</li>' +
    '</ul>' + buttons +
  '</div>';
}

function saveReservation() {
  const input = readReservationForm();
  const editing = (reservationPanel.mode === "edit");
  const ignoreId = currentIgnoreId();

  const errors = validateReservation(input, ignoreId, false);
  if (errors.length > 0) {
    reservationPanel.draft = {
      guest_id: input.guestId, room_id: input.roomId, check_in_date: input.checkIn,
      check_out_date: input.checkOut, number_of_guests: input.guests,
      reservation_no: editing ? Database.getById("reservations", ignoreId).reservation_no : undefined
    };
    showReservationsPage(notAllowedHtml(errors));
    return;
  }

  const room = Database.getById("rooms", input.roomId);
  const nights = countNights(input.checkIn, input.checkOut);
  const details = {
    guest_id: input.guestId,
    room_id: input.roomId,
    check_in_date: input.checkIn,
    check_out_date: input.checkOut,
    number_of_guests: input.guests,
    total_amount: room.rate * nights
  };

  let result;
  if (editing) {
    result = Database.update("reservations", ignoreId, details);
  } else {
    details.reservation_no = nextReservationNo();
    details.reservation_date = todayText();
    details.status = "Pending";
    result = Database.insert("reservations", details);
  }

  if (!result.ok) {
    showReservationsPage(notAllowedHtml(result.errors));
    return;
  }

  reservationPanel = null;
  showReservationsPage(messageHtml("ok", "Reservation " + result.record.reservation_no + " saved as " +
    result.record.status + ". Room charge: " + formatPeso(result.record.total_amount) + "."));
}

function changeReservationStatus(id, newStatus) {
  const r = Database.getById("reservations", id);

  if (RESERVATION_TRANSITIONS[r.status].indexOf(newStatus) === -1) {
    showReservationsPage(messageHtml("error", "A " + r.status + " reservation cannot be changed to " + newStatus + "."));
    return false;
  }

  const result = Database.update("reservations", id, { status: newStatus });
  if (!result.ok) {
    showReservationsPage(messageHtml("error", result.errors));
    return false;
  }
  showReservationsPage(messageHtml("ok", "Reservation " + r.reservation_no + " is now " + newStatus + "."));
  return true;
}

function confirmReservation(id) {
  const r = Database.getById("reservations", id);

  if (r.status !== "Pending") {
    showReservationsPage(messageHtml("error", "Only Pending reservations can be confirmed."));
    return;
  }

  const errors = validateReservation(inputFromRecord(r), id, false);
  if (errors.length > 0) {
    showReservationsPage(notAllowedHtml(errors, "CANNOT CONFIRM " + r.reservation_no));
    return;
  }

  changeReservationStatus(id, "Confirmed");
}

function cancelReservation(id) {
  const r = Database.getById("reservations", id);
  if (confirm("Cancel reservation " + r.reservation_no + "?")) {
    changeReservationStatus(id, "Cancelled");
  }
}

function markNoShow(id) {
  const r = Database.getById("reservations", id);

  if (r.check_in_date > todayText()) {
    showReservationsPage(messageHtml("error", "A no-show can only be recorded on or after the check-in date (" +
      formatDate(r.check_in_date) + ")."));
    return;
  }

  if (confirm("Mark reservation " + r.reservation_no + " as a no-show?")) {
    changeReservationStatus(id, "No-show");
  }
}
