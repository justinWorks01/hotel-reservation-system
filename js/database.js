const DB_PREFIX = "hotel_";   

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

  
  getAll: function (table) {
    const data = localStorage.getItem(DB_PREFIX + table);
    return data ? JSON.parse(data) : [];
  },

 
  saveAll: function (table, records) {
    localStorage.setItem(DB_PREFIX + table, JSON.stringify(records));
  },


  getById: function (table, id) {
    const key = TABLES[table];
    return this.getAll(table).find(function (r) { return r[key] === id; });
  },

 
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


  remove: function (table, id) {
    const key = TABLES[table];
    const records = this.getAll(table).filter(function (r) {
      return r[key] !== id;
    });
    this.saveAll(table, records);
  },

  
  count: function (table) {
    return this.getAll(table).length;
  }
};
