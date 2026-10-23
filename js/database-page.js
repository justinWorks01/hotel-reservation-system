/* ==========================================
   DATABASE PAGE (js/database-page.js)  -  Stage 2
   Shows the tables, fields, keys and relationships, and
   has buttons to load sample data and test the constraints.
   ========================================== */

// Turns the rules of one field into readable text
function describeConstraints(field) {
  const parts = [];
  if (field.required) parts.push("Required");
  if (field.unique)   parts.push("Unique");
  if (field.integer)  parts.push("Whole number");
  if (field.min !== undefined) parts.push("Min: " + field.min);
  if (field.allowed)  parts.push("Allowed: " + field.allowed.join(" / "));
  if (field.default !== undefined) parts.push("Default: " + field.default);
  return parts.length > 0 ? parts.join(", ") : "-";
}

// Builds the HTML table (data dictionary) of one database table
function buildTableDictionary(tableName) {
  const schema = SCHEMA[tableName];

  let html = '<div class="panel">' +
    '<h2>' + tableName + ' <span class="count">(' + Database.count(tableName) + ' records)</span></h2>' +
    '<table class="data-table">' +
    '<tr><th>Field</th><th>Type</th><th>Key</th><th>Constraints</th></tr>';

  // The primary key row
  html += '<tr><td><strong>' + schema.pk + '</strong></td><td>number</td>' +
          '<td><span class="key pk">PK</span></td><td>Auto-number, unique</td></tr>';

  // All other fields
  for (const name in schema.fields) {
    const f = schema.fields[name];
    let key = "";
    let notes = describeConstraints(f);

    if (f.references) {
      key = '<span class="key fk">FK</span>';
      notes = "References " + f.references.table + "." + f.references.field + (notes !== "-" ? ", " + notes : "");
    }
    html += '<tr><td>' + name + '</td><td>' + f.type + '</td><td>' + key + '</td><td>' + notes + '</td></tr>';
  }
  html += '</table></div>';
  return html;
}

// Builds the list of relationships (all the foreign keys)
function buildRelationships() {
  let html = '<div class="panel"><h2>Relationships (Foreign Keys)</h2><ul class="plain-list">';
  for (const tableName in SCHEMA) {
    for (const name in SCHEMA[tableName].fields) {
      const f = SCHEMA[tableName].fields[name];
      if (f.references) {
        html += '<li><strong>' + tableName + '.' + name + '</strong> &rarr; ' +
                f.references.table + '.' + f.references.field + '</li>';
      }
    }
  }
  html += '</ul></div>';
  return html;
}

// Draws the whole Database page. "message" is optional text shown under the buttons.
function showDatabasePage(message) {
  let html =
    '<div class="panel">' +
      '<h2>Database Tools</h2>' +
      '<p>Storage: browser localStorage. Every save is checked by the constraints in <code>js/schema.js</code>.</p>' +
      '<button class="btn" id="btn-sample">Load Sample Data</button> ' +
      '<button class="btn" id="btn-test">Run Constraint Tests</button> ' +
      '<button class="btn btn-danger" id="btn-reset">Reset Database</button>' +
      '<div id="db-message">' + (message || "") + '</div>' +
    '</div>';

  html += buildRelationships();
  for (const tableName in SCHEMA) {
    html += buildTableDictionary(tableName);
  }
  contentArea.innerHTML = html;

  document.getElementById("btn-sample").addEventListener("click", function () {
    const result = Database.loadSampleData();
    showDatabasePage(result.ok
      ? '<p class="msg-ok">Sample data loaded successfully.</p>'
      : '<p class="msg-error">' + result.errors.join("<br>") + '</p>');
  });

  document.getElementById("btn-reset").addEventListener("click", function () {
    if (confirm("This will delete ALL data. Continue?")) {
      Database.resetAll();
      showDatabasePage('<p class="msg-ok">Database reset. All tables are empty.</p>');
    }
  });

  document.getElementById("btn-test").addEventListener("click", function () {
    showDatabasePage(runConstraintTests());
  });
}

// Tries to break the rules on purpose. Every test SHOULD be rejected.
function runConstraintTests() {
  const room = Database.getAll("rooms")[0];
  if (!room) {
    return '<p class="msg-error">Load the sample data first, then run the tests.</p>';
  }

  const tests = [
    {
      name: "Unique: add a room with a room number that already exists",
      run: function () {
        return Database.insert("rooms", { room_number: room.room_number, room_type_id: room.room_type_id,
          floor: 1, capacity: 2, rate: 1000, status: "Available" });
      }
    },
    {
      name: "Required: add a guest without a first name",
      run: function () {
        return Database.insert("guests", { guest_no: "G-9999", last_name: "Test", contact_no: "0900" });
      }
    },
    {
      name: "Check: add a room with an invalid status",
      run: function () {
        return Database.insert("rooms", { room_number: "999", room_type_id: room.room_type_id,
          floor: 9, capacity: 2, rate: 1000, status: "Broken" });
      }
    },
    {
      name: "Foreign key: add a reservation for a guest that does not exist",
      run: function () {
        return Database.insert("reservations", { reservation_no: "R-9999", guest_id: 9999, room_id: room.room_id,
          reservation_date: "2026-10-22", check_in_date: "2026-12-01", check_out_date: "2026-12-03",
          number_of_guests: 2, total_amount: 3600, status: "Pending" });
      }
    },
    {
      name: "Rule: add a reservation where check-out is before check-in",
      run: function () {
        const guest = Database.getAll("guests")[0];
        return Database.insert("reservations", { reservation_no: "R-9998", guest_id: guest.guest_id, room_id: room.room_id,
          reservation_date: "2026-10-22", check_in_date: "2026-12-05", check_out_date: "2026-12-01",
          number_of_guests: 2, total_amount: 3600, status: "Pending" });
      }
    },
    {
      name: "Referential integrity: delete a room type that is still used by a room",
      run: function () {
        return Database.remove("room_types", room.room_type_id);
      }
    }
  ];

  let html = '<table class="data-table"><tr><th>Test</th><th>Result</th></tr>';
  tests.forEach(function (test) {
    const result = test.run();
    if (result.ok) {
      html += '<tr><td>' + test.name + '</td><td class="msg-error">FAILED - it was accepted</td></tr>';
    } else {
      html += '<tr><td>' + test.name + '</td><td class="msg-ok">PASSED - rejected: ' + result.errors.join(" ") + '</td></tr>';
    }
  });
  html += '</table>';
  return html;
}
