const DB_PREFIX = "hotel_";

const Database = {

  connect: function () {
    try {
      localStorage.setItem(DB_PREFIX + "test", "ok");
      localStorage.removeItem(DB_PREFIX + "test");

      for (const table in SCHEMA) {
        if (localStorage.getItem(DB_PREFIX + table) === null) {
          localStorage.setItem(DB_PREFIX + table, "[]");
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
    const key = SCHEMA[table].pk;
    return this.getAll(table).find(function (r) { return r[key] === id; });
  },

  count: function (table) {
    return this.getAll(table).length;
  },

  validate: function (table, record, ignoreId) {
    const rules = SCHEMA[table];
    const pk = rules.pk;
    const errors = [];
    const existing = this.getAll(table);

    for (const name in rules.fields) {
      const f = rules.fields[name];
      const value = record[name];
      const empty = (value === undefined || value === null || value === "");

      if (empty) {
        if (f.required) errors.push(name + " is required.");
        continue;
      }

      if (f.type === "number" && (typeof value !== "number" || isNaN(value))) {
        errors.push(name + " must be a number.");
        continue;
      }
      if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        errors.push(name + " must be a date (YYYY-MM-DD).");
        continue;
      }
      if (f.type === "datetime" && isNaN(Date.parse(value))) {
        errors.push(name + " must be a valid date and time.");
        continue;
      }

      if (f.integer && !Number.isInteger(value)) {
        errors.push(name + " must be a whole number.");
      }

      if (f.min !== undefined && value < f.min) {
        errors.push(name + " must be at least " + f.min + ".");
      }

      if (f.allowed && f.allowed.indexOf(value) === -1) {
        errors.push(name + " must be one of: " + f.allowed.join(", ") + ".");
      }

      if (f.pattern && !f.pattern.test(value)) {
        errors.push(f.patternMessage || (name + " is not in a valid format."));
      }

      if (f.unique) {
        const duplicate = existing.some(function (r) {
          return r[pk] !== ignoreId &&
                 String(r[name]).toLowerCase() === String(value).toLowerCase();
        });
        if (duplicate) errors.push(name + " \"" + value + "\" already exists.");
      }

      if (f.references && !this.getById(f.references.table, value)) {
        errors.push(name + " " + value + " does not exist in " + f.references.table + ".");
      }
    }

    if (rules.rules) {
      rules.rules.forEach(function (rule) {
        const message = rule(record);
        if (message) errors.push(message);
      });
    }

    return errors;
  },

  insert: function (table, record) {

    const fields = SCHEMA[table].fields;
    for (const name in fields) {
      const f = fields[name];
      if (f.default !== undefined && (record[name] === undefined || record[name] === "")) {
        record[name] = f.default;
      }
    }

    const errors = this.validate(table, record, null);
    if (errors.length > 0) return { ok: false, errors: errors };

    const key = SCHEMA[table].pk;
    const records = this.getAll(table);

    let highest = 0;
    records.forEach(function (r) {
      if (r[key] > highest) highest = r[key];
    });

    const newRecord = Object.assign({ [key]: highest + 1 }, record);
    records.push(newRecord);
    this.saveAll(table, records);
    return { ok: true, record: newRecord };
  },

  update: function (table, id, changes) {
    const key = SCHEMA[table].pk;
    const records = this.getAll(table);
    const index = records.findIndex(function (r) { return r[key] === id; });

    if (index === -1) return { ok: false, errors: ["Record not found."] };

    const updated = Object.assign({}, records[index], changes);
    updated[key] = id;

    const errors = this.validate(table, updated, id);
    if (errors.length > 0) return { ok: false, errors: errors };

    records[index] = updated;
    this.saveAll(table, records);
    return { ok: true, record: updated };
  },

  remove: function (table, id) {
    const used = this.findUsage(table, id);
    if (used.length > 0) {
      return {
        ok: false,
        errors: ["Cannot delete: this record is still used in " + used.join(", ") + "."]
      };
    }

    const key = SCHEMA[table].pk;
    const records = this.getAll(table).filter(function (r) { return r[key] !== id; });
    this.saveAll(table, records);
    return { ok: true };
  },

  findUsage: function (table, id) {
    const found = [];

    for (const otherTable in SCHEMA) {
      for (const name in SCHEMA[otherTable].fields) {
        const f = SCHEMA[otherTable].fields[name];

        if (f.references && f.references.table === table) {
          const total = this.getAll(otherTable).filter(function (r) {
            return r[name] === id;
          }).length;
          if (total > 0) found.push(otherTable + " (" + total + ")");
        }
      }
    }
    return found;
  },

  resetAll: function () {
    for (const table in SCHEMA) {
      this.saveAll(table, []);
    }
  },

  loadSampleData: function () {
    if (this.count("room_types") > 0 || this.count("guests") > 0) {
      return { ok: false, errors: ["The database already has data. Reset it first."] };
    }

    const add = function (table, record) {
      const result = Database.insert(table, record);
      if (!result.ok) throw new Error(table + ": " + result.errors.join(" "));
      return result.record;
    };

    try {

      const standard  = add("room_types", { type_name: "Standard Room",  description: "Simple room with basic amenities",        base_rate: 1800, capacity: 2, status: "Active" });
      const deluxe    = add("room_types", { type_name: "Deluxe Room",    description: "Spacious room with additional amenities", base_rate: 3500, capacity: 3, status: "Active" });
      const family    = add("room_types", { type_name: "Family Room",    description: "Large room for families",                 base_rate: 4500, capacity: 5, status: "Active" });
      const executive = add("room_types", { type_name: "Executive Room", description: "Business-class room with work area",      base_rate: 5500, capacity: 3, status: "Active" });
      const suite     = add("room_types", { type_name: "Suite",          description: "Premium suite with living area",          base_rate: 7500, capacity: 4, status: "Active" });

      const room101 = add("rooms", { room_number: "101", room_type_id: standard.room_type_id,  floor: 1, capacity: 2, rate: 1800, status: "Available" });
      const room102 = add("rooms", { room_number: "102", room_type_id: standard.room_type_id,  floor: 1, capacity: 2, rate: 1800, status: "Available" });
      const room201 = add("rooms", { room_number: "201", room_type_id: deluxe.room_type_id, floor: 2, capacity: 3, rate: 3500, status: "Available" });
      add("rooms", { room_number: "202", room_type_id: deluxe.room_type_id,    floor: 2, capacity: 3, rate: 3500, status: "Available" });
      const room305 = add("rooms", { room_number: "305", room_type_id: deluxe.room_type_id,    floor: 3, capacity: 3, rate: 3800, status: "Available" });
      add("rooms", { room_number: "310", room_type_id: family.room_type_id,    floor: 3, capacity: 5, rate: 4500, status: "Available" });
      add("rooms", { room_number: "401", room_type_id: executive.room_type_id, floor: 4, capacity: 3, rate: 5500, status: "Maintenance" });
      add("rooms", { room_number: "501", room_type_id: suite.room_type_id,     floor: 5, capacity: 4, rate: 7500, status: "Available" });

      const juan = add("guests", { guest_no: "G-0001", first_name: "Juan", last_name: "Dela Cruz", contact_no: "09123456789", email: "juan@email.com", address: "Bayombong, Nueva Vizcaya", identification_type: "Passport", identification_reference: "********" });
      add("guests", { guest_no: "G-0002", first_name: "Maria", last_name: "Santos", contact_no: "09987654321", email: "maria@email.com", address: "Cabanatuan City, Nueva Ecija", identification_type: "Driver's License", identification_reference: "********" });

      add("reservations", { reservation_no: "R-0001", guest_id: juan.guest_id, room_id: room201.room_id, reservation_date: "2026-10-22", check_in_date: "2026-11-10", check_out_date: "2026-11-12", number_of_guests: 2, total_amount: 7000, status: "Confirmed" });

      add("reservations", { reservation_no: "R-0002", guest_id: juan.guest_id, room_id: room101.room_id, reservation_date: "2026-09-01", check_in_date: "2026-09-10", check_out_date: "2026-09-12", number_of_guests: 2, total_amount: 3600, status: "Confirmed" });
      add("reservations", { reservation_no: "R-0003", guest_id: juan.guest_id, room_id: room102.room_id, reservation_date: "2026-10-22", check_in_date: "2026-12-20", check_out_date: "2026-12-22", number_of_guests: 2, total_amount: 3600, status: "Confirmed" });

      const pedro = add("guests", { guest_no: "G-0003", first_name: "Pedro", last_name: "Reyes", contact_no: "09171234567", email: "pedro@email.com", address: "Solano, Nueva Vizcaya", identification_type: "National ID", identification_reference: "********" });

      add("reservations", { reservation_no: "R-0004", guest_id: pedro.guest_id, room_id: room305.room_id, reservation_date: "2026-10-22", check_in_date: "2026-11-20", check_out_date: "2026-11-22", number_of_guests: 2, total_amount: 7600, status: "Pending" });

      return { ok: true };
    } catch (error) {
      return { ok: false, errors: [error.message] };
    }
  }
};
