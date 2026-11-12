const SCHEMA = {

  room_types: {
    pk: "room_type_id",
    fields: {
      type_name:   { type: "text",   required: true, unique: true },
      description: { type: "text" },
      base_rate:   { type: "number", required: true, min: 0 },
      capacity:    { type: "number", required: true, min: 1, integer: true },
      status:      { type: "text",   required: true, allowed: ["Active", "Inactive"], default: "Active" }
    }
  },

  rooms: {
    pk: "room_id",
    fields: {
      room_number:  { type: "text",   required: true, unique: true },
      room_type_id: { type: "number", required: true, references: { table: "room_types", field: "room_type_id" } },
      floor:        { type: "number", required: true, min: 1, integer: true },
      capacity:     { type: "number", required: true, min: 1, integer: true },
      rate:         { type: "number", required: true, min: 0 },

      status:       { type: "text",   required: true, allowed: ["Available", "Reserved", "Occupied", "Cleaning", "Maintenance"], default: "Available" },

      active_status: { type: "text", allowed: ["Active", "Inactive"], default: "Active" }
    }
  },

  guests: {
    pk: "guest_id",
    fields: {
      guest_no:                 { type: "text", required: true, unique: true, pattern: /^G-\d{4,}$/, patternMessage: "Guest No. must look like G-0001." },
      first_name:               { type: "text", required: true },
      last_name:                { type: "text", required: true },
      contact_no:               { type: "text", required: true, pattern: /^(09|\+639)\d{9}$/, patternMessage: "Contact number must be a valid mobile number, like 09123456789." },
      email:                    { type: "text", pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMessage: "Email address is not valid (example: juan@email.com)." },
      address:                  { type: "text" },
      identification_type:      { type: "text" },
      identification_reference: { type: "text" },

      active_status:            { type: "text", allowed: ["Active", "Inactive"], default: "Active" }
    }
  },

  reservations: {
    pk: "reservation_id",
    fields: {
      reservation_no:   { type: "text",   required: true, unique: true },
      guest_id:         { type: "number", required: true, references: { table: "guests", field: "guest_id" } },
      room_id:          { type: "number", required: true, references: { table: "rooms", field: "room_id" } },
      reservation_date: { type: "date",   required: true },
      check_in_date:    { type: "date",   required: true },
      check_out_date:   { type: "date",   required: true },
      number_of_guests: { type: "number", required: true, min: 1, integer: true },
      total_amount:     { type: "number", required: true, min: 0 },
      status:           { type: "text",   required: true, allowed: ["Pending", "Confirmed", "Checked-in", "Checked-out", "Cancelled", "No-show"], default: "Pending" }
    },

    rules: [
      function (r) {
        if (r.check_in_date && r.check_out_date && r.check_out_date <= r.check_in_date) {
          return "check_out_date must be after check_in_date.";
        }
        return null;
      }
    ]
  },

  check_ins: {
    pk: "check_in_id",
    fields: {
      reservation_id:  { type: "number",   required: true, references: { table: "reservations", field: "reservation_id" } },
      actual_check_in: { type: "datetime", required: true },
      room_id:         { type: "number",   required: true, references: { table: "rooms", field: "room_id" } },
      guest_count:     { type: "number",   required: true, min: 1 },
      status:          { type: "text",     required: true, allowed: ["Checked-in"] }
    }
  },

  billing: {
    pk: "bill_id",
    fields: {
      reservation_id:  { type: "number", required: true, references: { table: "reservations", field: "reservation_id" } },
      guest_id:        { type: "number", required: true, references: { table: "guests", field: "guest_id" } },
      room_charges:    { type: "number", required: true, min: 0 },
      service_charges: { type: "number", required: true, min: 0 },
      discounts:       { type: "number", required: true, min: 0 },
      taxes:           { type: "number", required: true, min: 0 },
      total_amount:    { type: "number", required: true, min: 0 },
      amount_paid:     { type: "number", required: true, min: 0 },
      balance:         { type: "number", required: true, min: 0 }
    }
  },

  check_outs: {
    pk: "checkout_id",
    fields: {
      reservation_id: { type: "number",   required: true, references: { table: "reservations", field: "reservation_id" } },
      bill_id:        { type: "number",   required: true, references: { table: "billing", field: "bill_id" } },
      checkout_date:  { type: "datetime", required: true },
      final_amount:   { type: "number",   required: true, min: 0 },
      payment_status: { type: "text",     required: true, allowed: ["Paid", "Balance"] },
      remarks:        { type: "text" }
    }
  },

  users: {
    pk: "user_id",
    fields: {
      username: { type: "text", required: true, unique: true },
      password: { type: "text", required: true },
      role:     { type: "text", required: true, allowed: ["Administrator", "Manager", "Receptionist"] },
      status:   { type: "text", required: true, allowed: ["Active", "Inactive"] }
    }
  }
};
