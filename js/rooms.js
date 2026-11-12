let roomPanel = null;
let roomSearch = "";
let roomStatusFilter = "All";

function getRoomTypeName(roomTypeId) {
  const type = Database.getById("room_types", roomTypeId);
  return type ? type.type_name : "(unknown)";
}

function showRoomsPage(message) {
  let html = "";
  if (message) html += '<div class="message-area">' + message + '</div>';
  if (roomPanel) html += buildRoomPanel();

  let filterOptions = '<option value="All">All statuses</option>';
  SCHEMA.rooms.fields.status.allowed.forEach(function (s) {
    filterOptions += '<option value="' + s + '"' + (s === roomStatusFilter ? " selected" : "") + '>' + s + '</option>';
  });

  html += '<div class="panel">' +
    '<div class="toolbar">' +
      '<input type="text" id="room-search" class="input" placeholder="Search room number, type, floor..." ' +
        'value="' + escapeHtml(roomSearch) + '" oninput="filterRooms()">' +
      '<select id="room-status-filter" class="input" onchange="filterRooms()">' + filterOptions + '</select>' +
      '<button class="btn" onclick="addRoom()">+ Add Room</button>' +
    '</div>' +
    '<table class="data-table">' +
      '<thead><tr><th>Room No.</th><th>Type</th><th>Floor</th><th>Capacity</th><th>Rate</th><th>Status</th><th>Active?</th><th>Actions</th></tr></thead>' +
      '<tbody id="room-rows">' + buildRoomRows() + '</tbody>' +
    '</table>' +
  '</div>';

  contentArea.innerHTML = html;
}

function buildRoomRows() {
  const keyword = roomSearch.toLowerCase();

  const rooms = Database.getAll("rooms").filter(function (room) {
    const text = (room.room_number + " " + getRoomTypeName(room.room_type_id) + " floor " + room.floor + " " + room.status).toLowerCase();
    const matchesSearch = text.indexOf(keyword) !== -1;
    const matchesStatus = (roomStatusFilter === "All" || room.status === roomStatusFilter);
    return matchesSearch && matchesStatus;
  });

  rooms.sort(function (a, b) {
    return a.room_number.localeCompare(b.room_number, undefined, { numeric: true });
  });

  if (rooms.length === 0) {
    return '<tr><td colspan="8">No rooms found.</td></tr>';
  }

  let html = "";
  rooms.forEach(function (room) {
    const active = isRoomActive(room);
    const id = room.room_id;

    let statusSelect = '<select class="input input-small" onchange="changeRoomStatus(' + id + ', this.value)">';
    SCHEMA.rooms.fields.status.allowed.forEach(function (s) {
      statusSelect += '<option' + (s === room.status ? " selected" : "") + '>' + s + '</option>';
    });
    statusSelect += '</select>';

    html += '<tr>' +
      '<td><strong>' + escapeHtml(room.room_number) + '</strong></td>' +
      '<td>' + escapeHtml(getRoomTypeName(room.room_type_id)) + '</td>' +
      '<td>' + room.floor + '</td>' +
      '<td>' + room.capacity + '</td>' +
      '<td>' + formatPeso(room.rate) + '/night</td>' +
      '<td>' + statusBadge(room.status) + '<br>' + statusSelect + '</td>' +
      '<td>' + statusBadge(active ? "Active" : "Inactive") + '</td>' +
      '<td class="actions">' +
        '<button class="btn-small" onclick="viewRoom(' + id + ')">View</button> ' +
        '<button class="btn-small" onclick="editRoom(' + id + ')">Edit</button> ' +
        (room.status !== "Maintenance"
          ? '<button class="btn-small btn-secondary" onclick="markRoomMaintenance(' + id + ')">Maintenance</button> '
          : '') +
        '<button class="btn-small btn-secondary" onclick="toggleRoomActive(' + id + ')">' + (active ? "Deactivate" : "Activate") + '</button>' +
      '</td>' +
    '</tr>';
  });
  return html;
}

function filterRooms() {
  roomSearch = document.getElementById("room-search").value;
  roomStatusFilter = document.getElementById("room-status-filter").value;
  document.getElementById("room-rows").innerHTML = buildRoomRows();
}

function addRoom()        { roomPanel = { mode: "add",  id: null, draft: null }; showRoomsPage(); }
function editRoom(id)     { roomPanel = { mode: "edit", id: id,   draft: null }; showRoomsPage(); }
function viewRoom(id)     { roomPanel = { mode: "view", id: id,   draft: null }; showRoomsPage(); }
function closeRoomPanel() { roomPanel = null; showRoomsPage(); }

function changeRoomStatus(id, newStatus) {
  const room = Database.getById("rooms", id);

  if (newStatus === "Maintenance" && room.status === "Occupied") {
    showRoomsPage(messageHtml("error", "Room " + room.room_number + " is occupied. Check out the guest before marking it as maintenance."));
    return;
  }

  const result = Database.update("rooms", id, { status: newStatus });
  if (result.ok) {
    showRoomsPage(messageHtml("ok", "Room " + room.room_number + " status changed to " + newStatus + "."));
  } else {
    showRoomsPage(messageHtml("error", result.errors));
  }
}

function markRoomMaintenance(id) {
  changeRoomStatus(id, "Maintenance");
}

function toggleRoomActive(id) {
  const room = Database.getById("rooms", id);
  const turningOff = isRoomActive(room);

  if (turningOff && (room.status === "Occupied" || room.status === "Reserved")) {
    showRoomsPage(messageHtml("error", "Room " + room.room_number + " is " + room.status.toLowerCase() + " and cannot be deactivated."));
    return;
  }

  const newValue = turningOff ? "Inactive" : "Active";
  const result = Database.update("rooms", id, { active_status: newValue });

  if (result.ok) {
    showRoomsPage(messageHtml("ok", "Room " + room.room_number + " is now " + newValue + "."));
  } else {
    showRoomsPage(messageHtml("error", result.errors));
  }
}

function buildRoomPanel() {
  if (roomPanel.mode === "view") {
    return buildRoomView(roomPanel.id);
  }

  const editing = (roomPanel.mode === "edit");
  const data = roomPanel.draft ||
               (editing ? Database.getById("rooms", roomPanel.id) : { status: "Available" });

  let typeOptions = '<option value="">-- Select room type --</option>';
  Database.getAll("room_types").forEach(function (t) {
    if (t.status === "Active" || t.room_type_id === data.room_type_id) {
      typeOptions += '<option value="' + t.room_type_id + '"' +
        (t.room_type_id === data.room_type_id ? " selected" : "") + '>' + escapeHtml(t.type_name) + '</option>';
    }
  });

  let statusOptions = "";
  SCHEMA.rooms.fields.status.allowed.forEach(function (s) {
    statusOptions += '<option' + (s === data.status ? " selected" : "") + '>' + s + '</option>';
  });

  return '<div class="panel">' +
    '<h2>ROOM INFORMATION - ' + (editing ? "Edit" : "Add") + '</h2>' +
    '<div class="form-grid">' +
      '<div class="form-group"><label>Room Number</label>' +
        '<input type="text" id="room-number" class="input" placeholder="e.g. 201" value="' + escapeHtml(data.room_number) + '"></div>' +
      '<div class="form-group"><label>Room Type</label>' +
        '<select id="room-type" class="input" onchange="fillFromRoomType()">' + typeOptions + '</select></div>' +
      '<div class="form-group"><label>Floor</label>' +
        '<input type="number" id="room-floor" class="input" min="1" step="1" value="' + escapeHtml(data.floor) + '"></div>' +
      '<div class="form-group"><label>Capacity (guests)</label>' +
        '<input type="number" id="room-capacity" class="input" min="1" step="1" value="' + escapeHtml(data.capacity) + '"></div>' +
      '<div class="form-group"><label>Rate (₱ per night)</label>' +
        '<input type="number" id="room-rate" class="input" min="0" step="0.01" value="' + escapeHtml(data.rate) + '"></div>' +
      '<div class="form-group"><label>Status</label>' +
        '<select id="room-status" class="input">' + statusOptions + '</select></div>' +
    '</div>' +
    '<p class="hint">Choosing a room type fills in the capacity and rate. You can still change them for this room.</p>' +
    '<button class="btn" onclick="saveRoom()">Save</button> ' +
    '<button class="btn btn-secondary" onclick="closeRoomPanel()">Cancel</button>' +
  '</div>';
}

function fillFromRoomType() {
  const typeId = toNumber(document.getElementById("room-type").value);
  const type = (typeId === "") ? null : Database.getById("room_types", typeId);

  if (type) {
    document.getElementById("room-capacity").value = type.capacity;
    document.getElementById("room-rate").value = type.base_rate;
  }
}

function buildRoomView(id) {
  const room = Database.getById("rooms", id);
  const reservations = Database.getAll("reservations").filter(function (r) { return r.room_id === id; });

  let reservationHtml = "<li><span>Reservations:</span> none yet</li>";
  if (reservations.length > 0) {
    reservationHtml = "<li><span>Reservations:</span><ul>";
    reservations.forEach(function (r) {
      reservationHtml += "<li>" + escapeHtml(r.reservation_no) + ": " + formatDate(r.check_in_date) +
                         " to " + formatDate(r.check_out_date) + " (" + escapeHtml(r.status) + ")</li>";
    });
    reservationHtml += "</ul></li>";
  }

  return '<div class="panel">' +
    '<h2>ROOM INFORMATION</h2>' +
    '<ul class="detail-list">' +
      '<li><span>Room Number:</span> ' + escapeHtml(room.room_number) + '</li>' +
      '<li><span>Room Type:</span> ' + escapeHtml(getRoomTypeName(room.room_type_id)) + '</li>' +
      '<li><span>Floor:</span> ' + room.floor + '</li>' +
      '<li><span>Capacity:</span> ' + room.capacity + '</li>' +
      '<li><span>Rate:</span> ' + formatPeso(room.rate) + '/night</li>' +
      '<li><span>Status:</span> ' + statusBadge(room.status) + '</li>' +
      '<li><span>Active?:</span> ' + statusBadge(isRoomActive(room) ? "Active" : "Inactive") + '</li>' +
      reservationHtml +
    '</ul>' +
    '<button class="btn" onclick="editRoom(' + id + ')">Edit</button> ' +
    '<button class="btn btn-secondary" onclick="closeRoomPanel()">Close</button>' +
  '</div>';
}

function saveRoom() {
  const record = {
    room_number:  document.getElementById("room-number").value.trim(),
    room_type_id: toNumber(document.getElementById("room-type").value),
    floor:        toNumber(document.getElementById("room-floor").value),
    capacity:     toNumber(document.getElementById("room-capacity").value),
    rate:         toNumber(document.getElementById("room-rate").value),
    status:       document.getElementById("room-status").value
  };

  let result;
  if (roomPanel.mode === "edit") {
    result = Database.update("rooms", roomPanel.id, record);
  } else {
    result = Database.insert("rooms", record);
  }

  if (!result.ok) {
    roomPanel.draft = record;
    showRoomsPage(messageHtml("error", result.errors));
    return;
  }

  roomPanel = null;
  showRoomsPage(messageHtml("ok", "Room saved successfully."));
}
