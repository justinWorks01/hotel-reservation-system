let checkinPanel = null;
let checkinSearch = "";

function verifyCheckIn(r, actual, guestCount, skipReservationChecks) {
  const errors = [];
  const room = Database.getById("rooms", r.room_id);

  if (!skipReservationChecks) {
    if (r.status !== "Confirmed") {
      errors.push("Reservation " + r.reservation_no + " is " + r.status + ". Only Confirmed reservations can be checked in.");
    }

    const guest = Database.getById("guests", r.guest_id);
    if (!guest) {
      errors.push("Guest does not exist.");
    } else if (!isGuestActive(guest)) {
      errors.push(getGuestName(guest) + " is inactive and cannot be checked in.");
    }

    if (!room) {
      errors.push("Room does not exist.");
    } else if (!isRoomActive(room)) {
      errors.push("Room " + room.room_number + " is inactive.");
    } else if (room.status === "Maintenance") {
      errors.push("Room " + room.room_number + " is under maintenance.");
    }

    if (guestCount === "" || !Number.isInteger(guestCount) || guestCount < 1) {
      errors.push("Number of guests must be a whole number of at least 1.");
    } else if (room && guestCount > room.capacity) {
      errors.push("Room " + room.room_number + " can only accommodate " + room.capacity + " guests.");
    }
  }

  if (room && room.status === "Occupied") {
    errors.push("Room " + room.room_number + " is currently occupied.");
  } else if (room && room.status === "Cleaning") {
    errors.push("Room " + room.room_number + " is being cleaned and is not ready.");
  }

  if (!actual) {
    errors.push("Actual check-in date and time is required.");
  } else if (isNaN(Date.parse(actual))) {
    errors.push("Actual check-in must be a valid date and time.");
  } else {
    const day = actual.slice(0, 10);
    if (Date.parse(actual) > Date.now()) {
      errors.push("Actual check-in cannot be in the future.");
    }
    if (day < r.check_in_date) {
      errors.push("Check-in is only allowed on or after the reserved check-in date (" + formatDate(r.check_in_date) + ").");
    } else if (r.check_out_date && day >= r.check_out_date) {
      errors.push("The reserved stay ended on " + formatDate(r.check_out_date) + ". Check-in is no longer possible.");
    }
  }

  return errors;
}

function performCheckIn(reservationId, actual, guestCount) {
  const r = Database.getById("reservations", reservationId);
  const errors = verifyCheckIn(r, actual, guestCount, false);
  if (errors.length > 0) return { ok: false, errors: errors };

  const room = Database.getById("rooms", r.room_id);
  const previousRoomStatus = room.status;

  const inserted = Database.insert("check_ins", {
    reservation_id: reservationId,
    actual_check_in: actual,
    room_id: r.room_id,
    guest_count: guestCount,
    status: "Checked-in"
  });
  if (!inserted.ok) return inserted;

  const roomUpdate = Database.update("rooms", r.room_id, { status: "Occupied" });
  const reservationUpdate = Database.update("reservations", reservationId, { status: "Checked-in" });

  if (!roomUpdate.ok || !reservationUpdate.ok) {
    Database.update("rooms", r.room_id, { status: previousRoomStatus });
    Database.update("reservations", reservationId, { status: r.status });
    Database.remove("check_ins", inserted.record.check_in_id);
    return { ok: false, errors: ["The check-in could not be completed. Nothing was changed."] };
  }

  return { ok: true, record: inserted.record };
}

function showCheckinPage(message) {
  let html = "";
  if (message) html += '<div class="message-area">' + message + '</div>';
  if (checkinPanel) html += buildCheckinPanel();

  html += '<div class="panel">' +
    '<h2>RESERVATIONS FOR CHECK-IN</h2>' +
    '<div class="toolbar">' +
      '<input type="text" id="ci-search" class="input" placeholder="Search reservation no., guest, room..." ' +
        'value="' + escapeHtml(checkinSearch) + '" oninput="filterCheckins()">' +
      '<button class="btn" onclick="startWalkin()">+ Walk-in Guest</button>' +
    '</div>' +
    '<table class="data-table">' +
      '<thead><tr><th>Reservation</th><th>Guest</th><th>Room</th><th>Reserved Dates</th><th>Guests</th><th>Status</th><th>Action</th></tr></thead>' +
      '<tbody id="ci-rows">' + buildCheckinRows() + '</tbody>' +
    '</table>' +
  '</div>' + buildCurrentGuestsPanel();

  contentArea.innerHTML = html;
}

function buildCheckinRows() {
  const keyword = checkinSearch.toLowerCase();

  const reservations = Database.getAll("reservations").filter(function (r) {
    const text = (r.reservation_no + " " + getReservationGuestName(r) + " room " + getReservationRoomNumber(r)).toLowerCase();
    return (r.status === "Pending" || r.status === "Confirmed") && text.indexOf(keyword) !== -1;
  });

  reservations.sort(function (a, b) { return a.check_in_date.localeCompare(b.check_in_date); });

  if (reservations.length === 0) {
    return '<tr><td colspan="7">No reservations waiting for check-in.</td></tr>';
  }

  let html = "";
  reservations.forEach(function (r) {
    const action = (r.status === "Confirmed")
      ? '<button class="btn-small" onclick="startCheckin(' + r.reservation_id + ')">Check In</button>'
      : 'Confirm it first';

    html += '<tr>' +
      '<td><strong>' + escapeHtml(r.reservation_no) + '</strong></td>' +
      '<td>' + escapeHtml(getReservationGuestName(r)) + '</td>' +
      '<td>Room ' + escapeHtml(getReservationRoomNumber(r)) + '</td>' +
      '<td>' + escapeHtml(formatDateRange(r.check_in_date, r.check_out_date)) + '</td>' +
      '<td>' + r.number_of_guests + '</td>' +
      '<td>' + statusBadge(r.status) + '</td>' +
      '<td class="actions">' + action + '</td>' +
    '</tr>';
  });
  return html;
}

function filterCheckins() {
  checkinSearch = document.getElementById("ci-search").value;
  document.getElementById("ci-rows").innerHTML = buildCheckinRows();
}

function buildCurrentGuestsPanel() {
  const current = Database.getAll("reservations").filter(function (r) { return r.status === "Checked-in"; });
  current.sort(function (a, b) {
    return getReservationRoomNumber(a).localeCompare(getReservationRoomNumber(b), undefined, { numeric: true });
  });

  let rows = '<tr><td colspan="6">No guests are checked in right now.</td></tr>';
  if (current.length > 0) {
    rows = "";
    current.forEach(function (r) {
      const records = Database.getAll("check_ins").filter(function (c) { return c.reservation_id === r.reservation_id; });
      const record = records[records.length - 1];
      rows += '<tr>' +
        '<td><strong>Room ' + escapeHtml(getReservationRoomNumber(r)) + '</strong></td>' +
        '<td>' + escapeHtml(getReservationGuestName(r)) + '</td>' +
        '<td>' + escapeHtml(r.reservation_no) + '</td>' +
        '<td>' + (record ? escapeHtml(formatDateTime(record.actual_check_in)) : "-") + '</td>' +
        '<td>' + (record ? record.guest_count : r.number_of_guests) + '</td>' +
        '<td>' + escapeHtml(formatDate(r.check_out_date)) + '</td>' +
      '</tr>';
    });
  }

  return '<div class="panel">' +
    '<h2>CHECKED-IN GUESTS</h2>' +
    '<table class="data-table">' +
      '<thead><tr><th>Room</th><th>Guest</th><th>Reservation</th><th>Actual Check-in</th><th>Guests</th><th>Check-out Due</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>' +
  '</div>';
}

function startCheckin(id)  { checkinPanel = { mode: "checkin", id: id, draft: null }; showCheckinPage(); }
function closeCheckinPanel() { checkinPanel = null; showCheckinPage(); }

function buildCheckinPanel() {
  if (checkinPanel.mode === "walkin") return buildWalkinForm();
  return buildCheckinForm();
}

function buildCheckinSummary(r, actual, guestCount) {
  const errors = verifyCheckIn(r, actual, guestCount, false);
  let html = '<div class="summary-box">';
  if (errors.length > 0) {
    html += notAllowedHtml(errors, "CHECK-IN NOT ALLOWED");
  } else {
    html += '<p class="msg-ok">Reservation, guest and room are verified. Ready to check in.</p>';
  }
  return html + '</div>';
}

function buildCheckinForm() {
  const r = Database.getById("reservations", checkinPanel.id);
  const data = checkinPanel.draft || { actual: nowLocalText(), guests: r.number_of_guests };

  return '<div class="panel">' +
    '<h2>CHECK-IN</h2>' +
    '<ul class="detail-list">' +
      '<li><span>Reservation:</span> ' + escapeHtml(r.reservation_no) + '</li>' +
      '<li><span>Guest:</span> ' + escapeHtml(getReservationGuestName(r)) + '</li>' +
      '<li><span>Room:</span> ' + escapeHtml(getReservationRoomNumber(r)) + '</li>' +
      '<li><span>Reserved Check-in:</span> ' + escapeHtml(formatDate(r.check_in_date)) + '</li>' +
      '<li><span>Reserved Check-out:</span> ' + escapeHtml(formatDate(r.check_out_date)) + '</li>' +
    '</ul>' +
    '<div class="form-grid">' +
      '<div class="form-group"><label>Actual Check-in</label>' +
        '<input type="datetime-local" id="ci-actual" class="input" value="' + escapeHtml(data.actual) + '" onchange="refreshCheckinForm()"></div>' +
      '<div class="form-group"><label>Number of Guests</label>' +
        '<input type="number" id="ci-guests" class="input" min="1" step="1" value="' + escapeHtml(data.guests) + '" oninput="refreshCheckinForm()"></div>' +
    '</div>' +
    '<div id="ci-summary">' + buildCheckinSummary(r, data.actual, toNumber(data.guests)) + '</div>' +
    '<button class="btn" onclick="confirmCheckin()">Confirm Check-in</button> ' +
    '<button class="btn btn-secondary" onclick="closeCheckinPanel()">Cancel</button>' +
  '</div>';
}

function refreshCheckinForm() {
  const r = Database.getById("reservations", checkinPanel.id);
  const actual = document.getElementById("ci-actual").value;
  const guests = toNumber(document.getElementById("ci-guests").value);
  document.getElementById("ci-summary").innerHTML = buildCheckinSummary(r, actual, guests);
}

function confirmCheckin() {
  const id = checkinPanel.id;
  const r = Database.getById("reservations", id);
  const actual = document.getElementById("ci-actual").value;
  const guests = toNumber(document.getElementById("ci-guests").value);

  const result = performCheckIn(id, actual, guests);
  if (!result.ok) {
    checkinPanel.draft = { actual: actual, guests: document.getElementById("ci-guests").value };
    showCheckinPage(notAllowedHtml(result.errors, "CHECK-IN NOT ALLOWED"));
    return;
  }

  checkinPanel = null;
  showCheckinPage(messageHtml("ok", getReservationGuestName(r) + " is checked in to Room " + getReservationRoomNumber(r) +
    ". Room status: Occupied. Reservation " + r.reservation_no + ": Checked-in."));
}

function defaultWalkinData() {
  return {
    guest: "new", first: "", last: "", contact: "", email: "", address: "", idType: "", idRef: "",
    actual: nowLocalText(), checkout: "", guests: "1", room: ""
  };
}

function startWalkin() {
  checkinPanel = { mode: "walkin", id: null, draft: defaultWalkinData() };
  showCheckinPage();
}

function readWalkinForm() {
  const value = function (id) { return document.getElementById(id).value; };
  return {
    guest: value("wi-guest"), first: value("wi-first"), last: value("wi-last"), contact: value("wi-contact"),
    email: value("wi-email"), address: value("wi-address"), idType: value("wi-idtype"), idRef: value("wi-idref"),
    actual: value("wi-actual"), checkout: value("wi-checkout"), guests: value("wi-guests"), room: value("wi-room")
  };
}

function walkinInput(data) {
  return {
    guestId: (data.guest === "new") ? "" : toNumber(data.guest),
    roomId: toNumber(data.room),
    checkIn: data.actual.slice(0, 10),
    checkOut: data.checkout,
    guests: toNumber(data.guests)
  };
}

function buildWalkinRoomOptions(input) {
  const reasons = {};
  if (datesAreValid(input)) {
    const guestCount = (Number.isInteger(input.guests) && input.guests >= 1) ? input.guests : 1;
    const found = findAvailableRooms(input.checkIn, input.checkOut, guestCount, "", null);
    found.unavailable.forEach(function (item) { reasons[item.room.room_id] = item.reason; });
  }

  let options = '<option value="">-- Select room --</option>';
  const rooms = Database.getAll("rooms").filter(function (room) { return isRoomActive(room); });
  rooms.sort(function (a, b) { return a.room_number.localeCompare(b.room_number, undefined, { numeric: true }); });

  rooms.forEach(function (room) {
    const type = Database.getById("room_types", room.room_type_id);
    let label = "Room " + room.room_number + " - " + (type ? type.type_name : "?") + " - " + formatPeso(room.rate) + "/night";
    let reason = reasons[room.room_id];
    if (!reason && room.status === "Occupied") reason = "Currently occupied";
    if (!reason && room.status === "Cleaning") reason = "Being cleaned";
    if (reason) label += " (" + reason + ")";
    options += '<option value="' + room.room_id + '"' + (room.room_id === input.roomId ? " selected" : "") + '>' +
               escapeHtml(label) + '</option>';
  });
  return options;
}

function buildWalkinSummary(data) {
  const input = walkinInput(data);
  const room = (input.roomId === "") ? null : Database.getById("rooms", input.roomId);
  const nights = datesAreValid(input) ? countNights(input.checkIn, input.checkOut) : 0;

  let html = '<div class="summary-box">';
  if (room && nights > 0) {
    html += '<p class="computation"><strong>Room Charge</strong> = Room Rate &times; Number of Nights<br>' +
            formatPeso(room.rate) + ' &times; ' + nights + ' = <strong>' + formatPeso(room.rate * nights) + '</strong></p>';
  }

  const pseudo = {
    reservation_no: "new reservation", status: "Confirmed", guest_id: input.guestId, room_id: input.roomId,
    check_in_date: input.checkIn, check_out_date: input.checkOut, number_of_guests: input.guests
  };
  let errors = validateReservation(input, null, true);
  if (data.actual) errors = errors.concat(verifyCheckIn(pseudo, data.actual, input.guests, true));

  if (errors.length > 0) {
    html += notAllowedHtml(errors, "CHECK-IN NOT ALLOWED");
  } else if (room && nights > 0) {
    html += '<p class="msg-ok">This walk-in can be checked in.</p>';
  }
  return html + '</div>';
}

function buildWalkinForm() {
  const data = checkinPanel.draft;
  const isNew = (data.guest === "new");

  let guestOptions = '<option value="new"' + (isNew ? " selected" : "") + '>+ Register new guest</option>';
  const guests = Database.getAll("guests").filter(isGuestActive);
  guests.sort(function (a, b) { return a.guest_no.localeCompare(b.guest_no, undefined, { numeric: true }); });
  guests.forEach(function (g) {
    guestOptions += '<option value="' + g.guest_id + '"' + (String(g.guest_id) === data.guest ? " selected" : "") + '>' +
                    escapeHtml(g.guest_no + " - " + getGuestName(g)) + '</option>';
  });

  let idOptions = '<option value="">-- None --</option>';
  GUEST_ID_TYPES.forEach(function (t) {
    idOptions += '<option' + (t === data.idType ? " selected" : "") + '>' + escapeHtml(t) + '</option>';
  });

  const input = walkinInput(data);

  return '<div class="panel">' +
    '<h2>WALK-IN GUEST CHECK-IN</h2>' +
    '<h3 class="section-title">1. Guest</h3>' +
    '<div class="form-grid"><div class="form-group"><label>Guest</label>' +
      '<select id="wi-guest" class="input" onchange="refreshWalkinForm()">' + guestOptions + '</select></div></div>' +
    '<div id="wi-newguest" class="form-grid' + (isNew ? '' : ' hidden') + '">' +
      '<div class="form-group"><label>First Name</label><input type="text" id="wi-first" class="input" value="' + escapeHtml(data.first) + '"></div>' +
      '<div class="form-group"><label>Last Name</label><input type="text" id="wi-last" class="input" value="' + escapeHtml(data.last) + '"></div>' +
      '<div class="form-group"><label>Contact</label><input type="text" id="wi-contact" class="input" placeholder="09123456789" value="' + escapeHtml(data.contact) + '"></div>' +
      '<div class="form-group"><label>Email</label><input type="text" id="wi-email" class="input" value="' + escapeHtml(data.email) + '"></div>' +
      '<div class="form-group"><label>Address</label><input type="text" id="wi-address" class="input" value="' + escapeHtml(data.address) + '"></div>' +
      '<div class="form-group"><label>Identification Type</label><select id="wi-idtype" class="input">' + idOptions + '</select></div>' +
      '<div class="form-group"><label>Identification Reference</label><input type="text" id="wi-idref" class="input" value="' + escapeHtml(data.idRef) + '"></div>' +
    '</div>' +
    '<h3 class="section-title">2. Stay and room</h3>' +
    '<div class="form-grid">' +
      '<div class="form-group"><label>Check-in (arrival)</label>' +
        '<input type="datetime-local" id="wi-actual" class="input" value="' + escapeHtml(data.actual) + '" onchange="refreshWalkinForm()"></div>' +
      '<div class="form-group"><label>Check-out</label>' +
        '<input type="date" id="wi-checkout" class="input" value="' + escapeHtml(data.checkout) + '" onchange="refreshWalkinForm()"></div>' +
      '<div class="form-group"><label>Guests</label>' +
        '<input type="number" id="wi-guests" class="input" min="1" step="1" value="' + escapeHtml(data.guests) + '" oninput="refreshWalkinForm()"></div>' +
      '<div class="form-group"><label>Room</label>' +
        '<select id="wi-room" class="input" onchange="refreshWalkinForm()">' + buildWalkinRoomOptions(input) + '</select></div>' +
    '</div>' +
    '<p class="hint">Rooms that are not free for the chosen dates are marked in the Room list. Saving creates a confirmed reservation and checks the guest in right away.</p>' +
    '<div id="wi-summary">' + buildWalkinSummary(data) + '</div>' +
    '<button class="btn" onclick="saveWalkin()">Check In Walk-in Guest</button> ' +
    '<button class="btn btn-secondary" onclick="closeCheckinPanel()">Cancel</button>' +
  '</div>';
}

function refreshWalkinForm() {
  const data = readWalkinForm();
  document.getElementById("wi-newguest").className = (data.guest === "new") ? "form-grid" : "form-grid hidden";
  document.getElementById("wi-room").innerHTML = buildWalkinRoomOptions(walkinInput(data));
  document.getElementById("wi-summary").innerHTML = buildWalkinSummary(data);
}

function saveWalkin() {
  const data = readWalkinForm();
  const isNew = (data.guest === "new");
  let createdGuest = null;
  let guestId = isNew ? "" : toNumber(data.guest);

  const undoGuest = function () {
    if (createdGuest) Database.remove("guests", createdGuest.guest_id);
  };
  const fail = function (errors, title) {
    checkinPanel.draft = data;
    showCheckinPage(notAllowedHtml(errors, title));
  };

  if (isNew) {
    const registered = Database.insert("guests", {
      guest_no: nextGuestNo(),
      first_name: data.first.trim(),
      last_name: data.last.trim(),
      contact_no: data.contact.replace(/[\s-]/g, ""),
      email: data.email.trim(),
      address: data.address.trim(),
      identification_type: data.idType,
      identification_reference: data.idRef.trim()
    });
    if (!registered.ok) {
      fail(registered.errors, "GUEST REGISTRATION FAILED");
      return;
    }
    createdGuest = registered.record;
    guestId = createdGuest.guest_id;
  }

  const input = walkinInput(data);
  input.guestId = guestId;
  const pseudo = {
    reservation_no: "new reservation", status: "Confirmed", guest_id: guestId, room_id: input.roomId,
    check_in_date: input.checkIn, check_out_date: input.checkOut, number_of_guests: input.guests
  };
  const errors = validateReservation(input, null, false).concat(verifyCheckIn(pseudo, data.actual, input.guests, true));
  if (errors.length > 0) {
    undoGuest();
    fail(errors, "CHECK-IN NOT ALLOWED");
    return;
  }

  const room = Database.getById("rooms", input.roomId);
  const reservation = Database.insert("reservations", {
    reservation_no: nextReservationNo(),
    guest_id: guestId,
    room_id: input.roomId,
    reservation_date: todayText(),
    check_in_date: input.checkIn,
    check_out_date: input.checkOut,
    number_of_guests: input.guests,
    total_amount: room.rate * countNights(input.checkIn, input.checkOut),
    status: "Confirmed"
  });
  if (!reservation.ok) {
    undoGuest();
    fail(reservation.errors, "CHECK-IN NOT ALLOWED");
    return;
  }

  const checkedIn = performCheckIn(reservation.record.reservation_id, data.actual, input.guests);
  if (!checkedIn.ok) {
    Database.remove("reservations", reservation.record.reservation_id);
    undoGuest();
    fail(checkedIn.errors, "CHECK-IN NOT ALLOWED");
    return;
  }

  checkinPanel = null;
  const guest = Database.getById("guests", guestId);
  showCheckinPage(messageHtml("ok", "Walk-in guest " + getGuestName(guest) + " is checked in to Room " + room.room_number +
    " under reservation " + reservation.record.reservation_no + "."));
}
