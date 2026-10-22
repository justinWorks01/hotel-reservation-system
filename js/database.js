/* ==========================================
   DATABASE (js/database.js)
   ------------------------------------------
   Our project uses only HTML, CSS and JavaScript,
   so the "database" is the browser's localStorage.
   Each table is saved as a list (array) of records.

   The table names and primary keys already follow
   the Stage 2 design, so the same code keeps working
   as the project grows.
   ========================================== */

const DB_PREFIX = "hotel_";   // all our data starts with this word

// Table name -> name of its primary key field
const TABLES = {
  room_types:   "room_type_id",
  rooms:        "room_id",
  guests:       "guest_id",
  reservations: "reservation_id",
  check_ins:    "check_in_id",
  billing:      "bill_id",
  check_outs:   "checkout_id",
  users:        "user_id"
};

const Database = {

  // 1. CONNECT: test the storage and create any missing tables.
  //    Returns true if successful, false if not.
  connect: function () {
    try {
      localStorage.setItem(DB_PREFIX + "test", "ok");
      localStorage.removeItem(DB_PREFIX + "test");

      for (const table in TABLES) {
        if (localStorage.getItem(DB_PREFIX + table) === null) {
          localStorage.setItem(DB_PREFIX + table, "[]");   // empty table
        }
      }
      return true;
    } catch (error) {
      console.error("Database connection failed:", error);
      return false;
    }
  },

  // 2. GET ALL: return every record of a table
  getAll: function (table) {
    const data = localStorage.getItem(DB_PREFIX + table);
    return data ? JSON.parse(data) : [];
  },

  // 3. SAVE ALL: replace the whole table (used internally)
  saveAll: function (table, records) {
    localStorage.setItem(DB_PREFIX + table, JSON.stringify(records));
  },

  // 4. FIND ONE: get a single record by its ID
  getById: function (table, id) {
    const key = TABLES[table];
    return this.getAll(table).find(function (r) { return r[key] === id; });
  },

  // 5. INSERT: add a new record and give it the next ID automatically
  insert: function (table, record) {
    const key = TABLES[table];
    const records = this.getAll(table);

    let highest = 0;
    records.forEach(function (r) {
      if (r[key] > highest) highest = r[key];
    });

    record[key] = highest + 1;
    records.push(record);
    this.saveAll(table, records);
    return record;
  },

  // 6. UPDATE: change fields of an existing record
  update: function (table, id, changes) {
    const key = TABLES[table];
    const records = this.getAll(table);

    for (let i = 0; i < records.length; i++) {
      if (records[i][key] === id) {
        Object.assign(records[i], changes);
        this.saveAll(table, records);
        return records[i];
      }
    }
    return null;   // not found
  },

  // 7. DELETE: remove a record
  remove: function (table, id) {
    const key = TABLES[table];
    const records = this.getAll(table).filter(function (r) {
      return r[key] !== id;
    });
    this.saveAll(table, records);
  },

  // 8. COUNT: how many records are in a table
  count: function (table) {
    return this.getAll(table).length;
  }
};
