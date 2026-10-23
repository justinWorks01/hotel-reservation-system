/* ==========================================
   ROOM AVAILABILITY CHECKING (js/availability.js)
   Laboratory Activity 5

   findAvailableRooms() is the foundation of the
   Reservation module (Stage 5), so keep it reusable.
   ========================================== */

// What the user searched for (kept when the page is redrawn)
let availabilityQuery = { checkIn: "", checkOut: "", guests: 2, roomTypeId: "" };

// ----- THE AVAILABILITY LOGIC -----
// Returns { available: [...], unavailable: [...] }
// A room is NOT available when:
//   - the room or its room type is inactive
//   - the room is under maintenance
//   - the number of guests is more than the room capacity
//   - it has a CONFIRMED reservation that overlaps the dates
// roomTypeId can be "" to search all room types.
function findAvailableRooms(checkIn, checkOut, guests, roomTypeId) {
  const available = [];
  const unavailable = [];
  const reservations = Database.getAll("reservations");

  Database.getAll("rooms").forEach(function (room) {
    // Skip rooms of other types when a type was chosen
    if (roomTypeId && room.room_type_id !== roomTypeId) return;

    const type = Database.getById("room_types", room.room_type_id);
    let reason = null;

    if (!isRoomActive(room)) {
      reason = "Room is inactive";
    } else if (!type || type.status === "Inactive") {
      reason = "Room type is inactive";
    } else if (room.status === "Maintenance") {
      reason = "Under maintenance";
    } else if (room.capacity < guests) {
      reason = "Capacity is only " + room.capacity;
    } else {
      // Two periods overlap when each one starts before the other ends.
      // Check-out day and check-in day may be the same day.
      const clash = reservations.find(function (r) {
        return r.room_id === room.room_id &&
               r.status === "Confirmed" &&
               r.check_in_date < checkOut &&
               r.check_out_date > checkIn;
      });
      if (clash) reason = "Already reserved (" + clash.reservation_no + ")";
    }

    const item = { room: room, typeName: type ? type.type_name : "(unknown)", reason: reason };
    if (reason) unavailable.push(item); else available.push(item);
  });

  const byRoomNumber = function (a, b) {
    return a.room.room_number.localeCompare(b.room.room_number, undefined, { numeric: true });
  };
  available.sort(byRoomNumber);
  unavailable.sort(byRoomNumber);

  return { available: available, unavailable: unavailable };
}

// ----- DRAW THE PAGE -----
function showAvailabilityPage() {
  const q = availabilityQuery;

  let typeOptions = '<option value="">All room types</option>';
  Database.getAll("room_types").forEach(function (t) {
    if (t.status === "Active") {
      typeOptions += '<option value="' + t.room_type_id + '"' +
        (t.room_type_id === q.roomTypeId ? " selected" : "") + '>' + escapeHtml(t.type_name) + '</option>';
    }
  });

  contentArea.innerHTML =
    '<div class="panel">' +
      '<h2>SEARCH CRITERIA</h2>' +
      '<div class="form-grid">' +
        '<div class="form-group"><label>Check-in Date</label>' +
          '<input type="date" id="av-checkin" class="input" value="' + escapeHtml(q.checkIn) + '"></div>' +
        '<div class="form-group"><label>Check-out Date</label>' +
          '<input type="date" id="av-checkout" class="input" value="' + escapeHtml(q.checkOut) + '"></div>' +
        '<div class="form-group"><label>Guests</label>' +
          '<input type="number" id="av-guests" class="input" min="1" step="1" value="' + escapeHtml(q.guests) + '"></div>' +
        '<div class="form-group"><label>Room Type</label>' +
          '<select id="av-type" class="input">' + typeOptions + '</select></div>' +
      '</div>' +
      '<button class="btn" onclick="searchAvailability()">Search Available Rooms</button>' +
    '</div>' +
    '<div id="av-results"></div>';
}

// ----- SEARCH BUTTON -----
function searchAvailability() {
  const checkIn = document.getElementById("av-checkin").value;
  const checkOut = document.getElementById("av-checkout").value;
  const guests = toNumber(document.getElementById("av-guests").value);
  const typeId = toNumber(document.getElementById("av-type").value);   // "" = all types

  availabilityQuery = { checkIn: checkIn, checkOut: checkOut, guests: guests, roomTypeId: typeId };
  const results = document.getElementById("av-results");

  // Check the search criteria first
  const errors = [];
  if (!checkIn)  errors.push("Check-in date is required.");
  if (!checkOut) errors.push("Check-out date is required.");
  if (checkIn && checkOut && checkOut <= checkIn) {
    errors.push("Check-out date must be after the check-in date.");
  }
  if (guests === "" || !Number.isInteger(guests) || guests < 1) {
    errors.push("Guests must be a whole number of at least 1.");
  }
  if (errors.length > 0) {
    results.innerHTML = messageHtml("error", errors);
    return;
  }

  const found = findAvailableRooms(checkIn, checkOut, guests, typeId);
  results.innerHTML = buildAvailabilityResults(found, checkIn, checkOut, guests, typeId);
}

// ----- THE RESULTS -----
function buildAvailabilityResults(found, checkIn, checkOut, guests, typeId) {
  const nights = countNights(checkIn, checkOut);
  const typeText = typeId ? getRoomTypeName(typeId) : "All room types";

  let html = '<div class="panel">' +
    '<h2>AVAILABLE ROOMS</h2>' +
    '<p>' + formatDate(checkIn) + ' to ' + formatDate(checkOut) + ' (' + nights + ' night' + (nights > 1 ? 's' : '') + ') &bull; ' +
      guests + ' guest' + (guests > 1 ? 's' : '') + ' &bull; ' + escapeHtml(typeText) + '</p>';

  if (found.available.length === 0) {
    html += '<p class="msg-error">No rooms are available for the selected dates.</p>';
  } else {
    html += '<table class="data-table">' +
      '<thead><tr><th>Room</th><th>Type</th><th>Capacity</th><th>Rate</th><th>Total for ' + nights + ' night' + (nights > 1 ? 's' : '') + '</th></tr></thead><tbody>';
    found.available.forEach(function (item) {
      html += '<tr>' +
        '<td><strong>Room ' + escapeHtml(item.room.room_number) + '</strong></td>' +
        '<td>' + escapeHtml(item.typeName) + '</td>' +
        '<td>' + item.room.capacity + '</td>' +
        '<td>' + formatPeso(item.room.rate) + '/night</td>' +
        '<td>' + formatPeso(item.room.rate * nights) + '</td>' +
      '</tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div>';

  // Rooms that did not qualify, with the reason (useful for checking and testing)
  if (found.unavailable.length > 0) {
    html += '<div class="panel"><h2>Not available</h2>' +
      '<table class="data-table"><thead><tr><th>Room</th><th>Type</th><th>Reason</th></tr></thead><tbody>';
    found.unavailable.forEach(function (item) {
      html += '<tr><td>Room ' + escapeHtml(item.room.room_number) + '</td>' +
              '<td>' + escapeHtml(item.typeName) + '</td>' +
              '<td>' + escapeHtml(item.reason) + '</td></tr>';
    });
    html += '</tbody></table></div>';
  }
  return html;
}
