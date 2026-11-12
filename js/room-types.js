let roomTypePanel = null;
let roomTypeSearch = "";

function showRoomTypesPage(message) {
  let html = "";
  if (message) html += '<div class="message-area">' + message + '</div>';
  if (roomTypePanel) html += buildRoomTypePanel();

  html += '<div class="panel">' +
    '<div class="toolbar">' +
      '<input type="text" id="rt-search" class="input" placeholder="Search room types..." ' +
        'value="' + escapeHtml(roomTypeSearch) + '" oninput="filterRoomTypes()">' +
      '<button class="btn" onclick="addRoomType()">+ Add Room Type</button>' +
    '</div>' +
    '<table class="data-table">' +
      '<thead><tr><th>Type Name</th><th>Description</th><th>Capacity</th><th>Base Rate</th><th>Rooms</th><th>Status</th><th>Actions</th></tr></thead>' +
      '<tbody id="rt-rows">' + buildRoomTypeRows() + '</tbody>' +
    '</table>' +
  '</div>';

  contentArea.innerHTML = html;
}

function buildRoomTypeRows() {
  const keyword = roomTypeSearch.toLowerCase();

  const types = Database.getAll("room_types").filter(function (t) {
    const text = (t.type_name + " " + (t.description || "") + " " + t.status).toLowerCase();
    return text.indexOf(keyword) !== -1;
  });

  if (types.length === 0) {
    return '<tr><td colspan="7">No room types found.</td></tr>';
  }

  let html = "";
  types.forEach(function (t) {
    const roomCount = Database.getAll("rooms").filter(function (r) {
      return r.room_type_id === t.room_type_id;
    }).length;
    const toggleText = (t.status === "Active") ? "Deactivate" : "Activate";

    html += '<tr>' +
      '<td><strong>' + escapeHtml(t.type_name) + '</strong></td>' +
      '<td>' + escapeHtml(t.description) + '</td>' +
      '<td>' + t.capacity + ' Guests</td>' +
      '<td>' + formatPeso(t.base_rate) + '/night</td>' +
      '<td>' + roomCount + '</td>' +
      '<td>' + statusBadge(t.status) + '</td>' +
      '<td class="actions">' +
        '<button class="btn-small" onclick="viewRoomType(' + t.room_type_id + ')">View</button> ' +
        '<button class="btn-small" onclick="editRoomType(' + t.room_type_id + ')">Edit</button> ' +
        '<button class="btn-small btn-secondary" onclick="toggleRoomType(' + t.room_type_id + ')">' + toggleText + '</button>' +
      '</td>' +
    '</tr>';
  });
  return html;
}

function filterRoomTypes() {
  roomTypeSearch = document.getElementById("rt-search").value;
  document.getElementById("rt-rows").innerHTML = buildRoomTypeRows();
}

function addRoomType() {
  roomTypePanel = { mode: "add", id: null, draft: null };
  showRoomTypesPage();
}

function editRoomType(id) {
  roomTypePanel = { mode: "edit", id: id, draft: null };
  showRoomTypesPage();
}

function viewRoomType(id) {
  roomTypePanel = { mode: "view", id: id, draft: null };
  showRoomTypesPage();
}

function closeRoomTypePanel() {
  roomTypePanel = null;
  showRoomTypesPage();
}

function toggleRoomType(id) {
  const type = Database.getById("room_types", id);
  const newStatus = (type.status === "Active") ? "Inactive" : "Active";
  const result = Database.update("room_types", id, { status: newStatus });

  if (result.ok) {
    showRoomTypesPage(messageHtml("ok", type.type_name + " is now " + newStatus + "."));
  } else {
    showRoomTypesPage(messageHtml("error", result.errors));
  }
}

function buildRoomTypePanel() {
  if (roomTypePanel.mode === "view") {
    return buildRoomTypeView(roomTypePanel.id);
  }

  const editing = (roomTypePanel.mode === "edit");

  const data = roomTypePanel.draft ||
               (editing ? Database.getById("room_types", roomTypePanel.id) : { status: "Active" });

  return '<div class="panel">' +
    '<h2>ROOM TYPE - ' + (editing ? "Edit" : "Add") + '</h2>' +
    '<div class="form-grid">' +
      '<div class="form-group"><label>Type Name</label>' +
        '<input type="text" id="rt-name" class="input" placeholder="e.g. Deluxe Room" value="' + escapeHtml(data.type_name) + '"></div>' +
      '<div class="form-group"><label>Description</label>' +
        '<input type="text" id="rt-description" class="input" placeholder="e.g. Spacious room with additional amenities" value="' + escapeHtml(data.description) + '"></div>' +
      '<div class="form-group"><label>Capacity (guests)</label>' +
        '<input type="number" id="rt-capacity" class="input" min="1" step="1" value="' + escapeHtml(data.capacity) + '"></div>' +
      '<div class="form-group"><label>Base Rate (₱ per night)</label>' +
        '<input type="number" id="rt-rate" class="input" min="0" step="0.01" value="' + escapeHtml(data.base_rate) + '"></div>' +
      '<div class="form-group"><label>Status</label>' +
        '<select id="rt-status" class="input">' +
          '<option' + (data.status === "Active" ? " selected" : "") + '>Active</option>' +
          '<option' + (data.status === "Inactive" ? " selected" : "") + '>Inactive</option>' +
        '</select></div>' +
    '</div>' +
    '<button class="btn" onclick="saveRoomType()">Save</button> ' +
    '<button class="btn btn-secondary" onclick="closeRoomTypePanel()">Cancel</button>' +
  '</div>';
}

function buildRoomTypeView(id) {
  const t = Database.getById("room_types", id);
  const rooms = Database.getAll("rooms").filter(function (r) { return r.room_type_id === id; });
  const roomNumbers = rooms.map(function (r) { return r.room_number; }).join(", ");

  return '<div class="panel">' +
    '<h2>ROOM TYPE</h2>' +
    '<ul class="detail-list">' +
      '<li><span>Type Name:</span> ' + escapeHtml(t.type_name) + '</li>' +
      '<li><span>Description:</span> ' + escapeHtml(t.description) + '</li>' +
      '<li><span>Capacity:</span> ' + t.capacity + ' Guests</li>' +
      '<li><span>Base Rate:</span> ' + formatPeso(t.base_rate) + '/night</li>' +
      '<li><span>Status:</span> ' + statusBadge(t.status) + '</li>' +
      '<li><span>Rooms of this type:</span> ' + (rooms.length > 0 ? escapeHtml(roomNumbers) : "none yet") + '</li>' +
    '</ul>' +
    '<button class="btn" onclick="editRoomType(' + id + ')">Edit</button> ' +
    '<button class="btn btn-secondary" onclick="closeRoomTypePanel()">Close</button>' +
  '</div>';
}

function saveRoomType() {

  const record = {
    type_name:   document.getElementById("rt-name").value.trim(),
    description: document.getElementById("rt-description").value.trim(),
    capacity:    toNumber(document.getElementById("rt-capacity").value),
    base_rate:   toNumber(document.getElementById("rt-rate").value),
    status:      document.getElementById("rt-status").value
  };

  let result;
  if (roomTypePanel.mode === "edit") {
    result = Database.update("room_types", roomTypePanel.id, record);
  } else {
    result = Database.insert("room_types", record);
  }

  if (!result.ok) {
    roomTypePanel.draft = record;
    showRoomTypesPage(messageHtml("error", result.errors));
    return;
  }

  roomTypePanel = null;
  showRoomTypesPage(messageHtml("ok", "Room type saved successfully."));
}
