let reportsGroup = "reservation";
let reportsId = "daily-reservations";
let reportFilters = {
  from: "", to: "", room: "", roomType: "", guest: "", status: "", gstatus: "", method: "",
  minVisits: "2", asOf: todayText()
};

const REPORT_FILTER_IDS = {
  from: "rp-from", to: "rp-to", room: "rp-room", roomType: "rp-roomtype", guest: "rp-guest",
  status: "rp-status", gstatus: "rp-gstatus", method: "rp-method", minVisits: "rp-minvisits", asOf: "rp-asof"
};

const REPORT_GROUPS = [
  { id: "reservation", label: "Reservation Reports" },
  { id: "guest", label: "Guest Reports" },
  { id: "occupancy", label: "Room Occupancy" },
  { id: "revenue", label: "Revenue and Billing" }
];

function money(amount) { return { money: amount }; }
function badge(status) { return { status: status }; }

function roomNumberById(id) {
  const room = Database.getById("rooms", id);
  return room ? room.room_number : "?";
}

function roomTypeNameByRoom(roomId) {
  const room = Database.getById("rooms", roomId);
  const type = room ? Database.getById("room_types", room.room_type_id) : null;
  return type ? type.type_name : "?";
}

function guestNameById(id) {
  const guest = Database.getById("guests", id);
  return guest ? getGuestName(guest) : "?";
}

function monthLabel(key) {
  return new Date(key + "-01T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function passesReservationFilters(r, f, dateMode, fixedStatus) {
  const room = Database.getById("rooms", r.room_id);
  if (f.room && r.room_id !== Number(f.room)) return false;
  if (f.roomType && (!room || room.room_type_id !== Number(f.roomType))) return false;
  if (f.guest && r.guest_id !== Number(f.guest)) return false;
  if (fixedStatus && r.status !== fixedStatus) return false;
  if (!fixedStatus && f.status && r.status !== f.status) return false;

  if (dateMode === "stay") {
    if (f.from && r.check_out_date < f.from) return false;
    if (f.to && r.check_in_date > f.to) return false;
  }
  if (dateMode === "booking") {
    const bothEmpty = !f.from && !f.to;
    const from = bothEmpty ? todayText() : f.from;
    const to = bothEmpty ? todayText() : f.to;
    if (from && r.reservation_date < from) return false;
    if (to && r.reservation_date > to) return false;
  }
  return true;
}

function reservationListReport(f, fixedStatus, dateMode) {
  const list = Database.getAll("reservations").filter(function (r) {
    return passesReservationFilters(r, f, dateMode, fixedStatus);
  });
  list.sort(function (a, b) {
    return a.check_in_date.localeCompare(b.check_in_date) || a.reservation_id - b.reservation_id;
  });

  let guests = 0;
  let total = 0;
  const rows = list.map(function (r) {
    guests += r.number_of_guests;
    total += r.total_amount;
    return [
      r.reservation_no, formatDate(r.reservation_date), guestNameById(r.guest_id), "Room " + roomNumberById(r.room_id),
      roomTypeNameByRoom(r.room_id), formatDateRange(r.check_in_date, r.check_out_date),
      countNights(r.check_in_date, r.check_out_date), r.number_of_guests, money(r.total_amount), badge(r.status)
    ];
  });
  total = round2(total);

  return {
    columns: ["Reservation", "Booked", "Guest", "Room", "Room Type", "Stay", "Nights", "Guests", "Room Charge", "Status"],
    rows: rows,
    totalRow: rows.length > 0 ? ["TOTAL", "", "", "", "", "", "", guests, money(total), ""] : null,
    summary: [["Reservations", rows.length], ["Guests", guests], ["Room Charges", money(total)]]
  };
}

function reservationsByDateReport(f) {
  const groups = {};
  Database.getAll("reservations").forEach(function (r) {
    if (!passesReservationFilters(r, f, "stay", null)) return;
    const g = groups[r.check_in_date] || (groups[r.check_in_date] = { count: 0, guests: 0, total: 0 });
    g.count += 1;
    g.guests += r.number_of_guests;
    g.total += r.total_amount;
  });

  const keys = Object.keys(groups).sort();
  let count = 0, guests = 0, total = 0;
  const rows = keys.map(function (k) {
    count += groups[k].count;
    guests += groups[k].guests;
    total += groups[k].total;
    return [formatDate(k), groups[k].count, groups[k].guests, money(round2(groups[k].total))];
  });

  return {
    columns: ["Check-in Date", "Reservations", "Guests", "Room Charges"],
    rows: rows,
    totalRow: rows.length > 0 ? ["TOTAL", count, guests, money(round2(total))] : null,
    summary: [["Dates with arrivals", rows.length], ["Reservations", count], ["Room Charges", money(round2(total))]]
  };
}

function guestMasterReport(f) {
  const guests = Database.getAll("guests").filter(function (g) {
    if (f.guest && g.guest_id !== Number(f.guest)) return false;
    if (f.gstatus === "Active" && !isGuestActive(g)) return false;
    if (f.gstatus === "Inactive" && isGuestActive(g)) return false;
    return true;
  });
  guests.sort(function (a, b) { return a.guest_no.localeCompare(b.guest_no, undefined, { numeric: true }); });

  const reservations = Database.getAll("reservations");
  const rows = guests.map(function (g) {
    const mine = reservations.filter(function (r) { return r.guest_id === g.guest_id; });
    const stays = mine.filter(function (r) { return r.status === "Checked-in" || r.status === "Checked-out"; });
    const last = stays.map(function (r) { return r.check_in_date; }).sort().pop();
    return [g.guest_no, getGuestName(g), g.contact_no, g.email || "-", g.address || "-",
            badge(isGuestActive(g) ? "Active" : "Inactive"), mine.length, last ? formatDate(last) : "-"];
  });

  const active = guests.filter(isGuestActive).length;
  return {
    columns: ["Guest No.", "Name", "Contact", "Email", "Address", "Status", "Reservations", "Last Stay"],
    rows: rows,
    totalRow: null,
    summary: [["Guests", guests.length], ["Active", active], ["Inactive", guests.length - active]]
  };
}

function guestHistoryReport(f) {
  const list = Database.getAll("reservations").filter(function (r) {
    return passesReservationFilters(r, f, "stay", null);
  });
  list.sort(function (a, b) {
    return guestNameById(a.guest_id).localeCompare(guestNameById(b.guest_id)) || a.check_in_date.localeCompare(b.check_in_date);
  });

  let total = 0;
  const seen = {};
  const rows = list.map(function (r) {
    total += r.total_amount;
    seen[r.guest_id] = true;
    return [guestNameById(r.guest_id), r.reservation_no, "Room " + roomNumberById(r.room_id),
            formatDateRange(r.check_in_date, r.check_out_date), countNights(r.check_in_date, r.check_out_date),
            money(r.total_amount), badge(r.status)];
  });
  total = round2(total);

  return {
    columns: ["Guest", "Reservation", "Room", "Stay", "Nights", "Room Charge", "Status"],
    rows: rows,
    totalRow: rows.length > 0 ? ["TOTAL", "", "", "", "", money(total), ""] : null,
    summary: [["Guests", Object.keys(seen).length], ["Reservations", rows.length], ["Room Charges", money(total)]]
  };
}

function frequentGuestsReport(f) {
  const minimum = Math.max(1, Math.floor(Number(f.minVisits)) || 1);
  const all = Database.getAll("reservations");
  const stats = {};

  all.forEach(function (r) {
    if (f.from && r.check_out_date < f.from) return;
    if (f.to && r.check_in_date > f.to) return;
    const s = stats[r.guest_id] || (stats[r.guest_id] = { stays: 0, nights: 0, billed: 0, reservations: 0, last: "" });
    if (r.status !== "Cancelled" && r.status !== "No-show") s.reservations += 1;
    if (r.status === "Checked-in" || r.status === "Checked-out") {
      const bill = getBillForReservation(r.reservation_id);
      s.stays += 1;
      s.nights += computeRoomCharge(r).nights;
      s.billed += bill ? bill.total_amount : 0;
      if (r.check_in_date > s.last) s.last = r.check_in_date;
    }
  });

  const ids = Object.keys(stats).filter(function (id) { return stats[id].stays >= minimum; });
  ids.sort(function (a, b) { return stats[b].stays - stats[a].stays || stats[b].billed - stats[a].billed; });

  const rows = ids.map(function (id) {
    const s = stats[id];
    return [guestNameById(Number(id)), s.stays, s.reservations, s.nights, money(round2(s.billed)), formatDate(s.last)];
  });

  return {
    columns: ["Guest", "Stays", "Reservations", "Nights", "Total Billed", "Last Check-in"],
    rows: rows,
    totalRow: null,
    summary: [["Frequent guests", rows.length], ["Minimum stays", minimum]]
  };
}

function currentGuestsReport(f) {
  const list = Database.getAll("reservations").filter(function (r) {
    return passesReservationFilters(r, f, "none", "Checked-in");
  });
  list.sort(function (a, b) {
    return roomNumberById(a.room_id).localeCompare(roomNumberById(b.room_id), undefined, { numeric: true });
  });

  let people = 0;
  const rows = list.map(function (r) {
    const guest = Database.getById("guests", r.guest_id);
    const checkIn = getCheckInRecord(r.reservation_id);
    people += checkIn ? checkIn.guest_count : r.number_of_guests;
    return [guestNameById(r.guest_id), guest ? guest.contact_no : "-", "Room " + roomNumberById(r.room_id),
            roomTypeNameByRoom(r.room_id), checkIn ? formatDateTime(checkIn.actual_check_in) : "-",
            formatDate(r.check_out_date), checkIn ? checkIn.guest_count : r.number_of_guests];
  });

  return {
    columns: ["Guest", "Contact", "Room", "Room Type", "Actual Check-in", "Check-out Due", "Guests"],
    rows: rows,
    totalRow: null,
    summary: [["Guests in house (bookings)", rows.length], ["People staying", people]]
  };
}

function checkedOutGuestsReport(f) {
  const rows = [];
  let billed = 0, paid = 0, balance = 0;

  Database.getAll("check_outs").forEach(function (co) {
    const r = Database.getById("reservations", co.reservation_id);
    const bill = Database.getById("billing", co.bill_id);
    const day = co.checkout_date.slice(0, 10);
    if (f.from && day < f.from) return;
    if (f.to && day > f.to) return;
    if (!passesReservationFilters(r, f, "none", null)) return;

    const stay = computeRoomCharge(r);
    billed += bill.total_amount;
    paid += bill.amount_paid;
    balance += bill.balance;
    rows.push({ sort: co.checkout_date, cells: [
      guestNameById(r.guest_id), "Room " + roomNumberById(r.room_id), formatDate(stay.start), formatDateTime(co.checkout_date),
      stay.nights, money(bill.total_amount), money(bill.amount_paid), money(bill.balance)
    ] });
  });

  rows.sort(function (a, b) { return a.sort.localeCompare(b.sort); });

  return {
    columns: ["Guest", "Room", "Check-in", "Check-out", "Nights", "Total Billed", "Amount Paid", "Balance"],
    rows: rows.map(function (x) { return x.cells; }),
    totalRow: rows.length > 0 ? ["TOTAL", "", "", "", "", money(round2(billed)), money(round2(paid)), money(round2(balance))] : null,
    summary: [["Guests checked out", rows.length], ["Total Billed", money(round2(billed))], ["Outstanding", money(round2(balance))]]
  };
}

function classifyRoom(room, asOf, confirmed) {
  if (room.status === "Maintenance") return "Maintenance";
  if (room.status === "Occupied") return "Occupied";
  if (room.status === "Cleaning") return "Cleaning";
  if (room.status === "Reserved") return "Reserved";
  const booked = confirmed.some(function (r) {
    return r.room_id === room.room_id && r.check_in_date <= asOf && r.check_out_date > asOf;
  });
  return booked ? "Reserved" : "Available";
}

function occupancyReport(f) {
  const asOf = f.asOf || todayText();
  const confirmed = Database.getAll("reservations").filter(function (r) { return r.status === "Confirmed"; });
  const allRooms = Database.getAll("rooms").filter(function (room) {
    return !f.roomType || room.room_type_id === Number(f.roomType);
  });
  const rooms = allRooms.filter(isRoomActive);
  const inactive = allRooms.length - rooms.length;

  const labels = ["Available", "Reserved", "Occupied", "Cleaning", "Maintenance"];
  const emptyCounts = function () { return { Available: 0, Reserved: 0, Occupied: 0, Cleaning: 0, Maintenance: 0, Total: 0 }; };
  const totals = emptyCounts();
  const byType = {};

  rooms.forEach(function (room) {
    const label = classifyRoom(room, asOf, confirmed);
    const t = byType[room.room_type_id] || (byType[room.room_type_id] = emptyCounts());
    t[label] += 1; t.Total += 1;
    totals[label] += 1; totals.Total += 1;
  });

  const rate = function (c) { return c.Total > 0 ? (Math.round(c.Occupied / c.Total * 1000) / 10) + "%" : "0%"; };

  const typeIds = Object.keys(byType).sort(function (a, b) { return Number(a) - Number(b); });
  const rows = typeIds.map(function (id) {
    const type = Database.getById("room_types", Number(id));
    const c = byType[id];
    return [type ? type.type_name : "?", c.Total, c.Available, c.Reserved, c.Occupied, c.Cleaning, c.Maintenance, rate(c)];
  });

  const summary = [["Total Rooms", totals.Total]];
  labels.forEach(function (l) { summary.push([l, totals[l]]); });
  summary.push(["Occupancy Rate", rate(totals)]);
  if (inactive > 0) summary.push(["Inactive rooms (not counted)", inactive]);

  return {
    columns: ["Room Type", "Total", "Available", "Reserved", "Occupied", "Cleaning", "Maintenance", "Occupancy"],
    rows: rows,
    totalRow: rows.length > 0 ? ["TOTAL", totals.Total, totals.Available, totals.Reserved, totals.Occupied, totals.Cleaning, totals.Maintenance, rate(totals)] : null,
    summary: summary
  };
}

function finalizedStays(f) {
  const out = [];
  Database.getAll("check_outs").forEach(function (co) {
    const r = Database.getById("reservations", co.reservation_id);
    const bill = Database.getById("billing", co.bill_id);
    const day = co.checkout_date.slice(0, 10);
    if (f.from && day < f.from) return;
    if (f.to && day > f.to) return;
    if (!passesReservationFilters(r, f, "none", null)) return;
    out.push({ co: co, r: r, bill: bill, day: day });
  });
  return out;
}

function sumBills(stays) {
  const t = { stays: stays.length, room: 0, services: 0, discounts: 0, taxes: 0, total: 0 };
  stays.forEach(function (s) {
    t.room += s.bill.room_charges;
    t.services += s.bill.service_charges;
    t.discounts += s.bill.discounts;
    t.taxes += s.bill.taxes;
    t.total += s.bill.total_amount;
  });
  Object.keys(t).forEach(function (k) { t[k] = round2(t[k]); });
  return t;
}

function revenueRow(label, stays) {
  const t = sumBills(stays);
  return [label, t.stays, money(t.room), money(t.services), money(t.discounts), money(t.taxes), money(t.total)];
}

const REVENUE_COLUMNS = ["Stays", "Room Revenue", "Services", "Discounts", "Taxes", "Total Revenue"];

function revenueSummary(stays) {
  const t = sumBills(stays);
  return [["Room Revenue", money(t.room)], ["Services", money(t.services)], ["Discounts", money(t.discounts)],
          ["Taxes", money(t.taxes)], ["Total Revenue", money(t.total)]];
}

function groupedRevenueReport(f, firstColumn, keyOf, labelOf) {
  const stays = finalizedStays(f);
  const groups = {};
  stays.forEach(function (s) {
    const key = keyOf(s);
    (groups[key] = groups[key] || []).push(s);
  });
  const keys = Object.keys(groups).sort();
  const rows = keys.map(function (k) { return revenueRow(labelOf(k), groups[k]); });
  const all = revenueRow("TOTAL", stays);

  return {
    columns: [firstColumn].concat(REVENUE_COLUMNS),
    rows: rows,
    totalRow: rows.length > 0 ? all : null,
    summary: revenueSummary(stays)
  };
}

function roomRevenueReport(f) {
  const stays = finalizedStays(f);
  const groups = {};
  stays.forEach(function (s) { (groups[s.r.room_id] = groups[s.r.room_id] || []).push(s); });

  const ids = Object.keys(groups);
  ids.sort(function (a, b) { return sumBills(groups[b]).room - sumBills(groups[a]).room; });

  let nightsTotal = 0;
  const rows = ids.map(function (id) {
    const list = groups[id];
    const nights = list.reduce(function (sum, s) { return sum + computeRoomCharge(s.r).nights; }, 0);
    nightsTotal += nights;
    return ["Room " + roomNumberById(Number(id)), roomTypeNameByRoom(Number(id)), list.length, nights, money(sumBills(list).room)];
  });
  const t = sumBills(stays);

  return {
    columns: ["Room", "Room Type", "Stays", "Nights", "Room Revenue"],
    rows: rows,
    totalRow: rows.length > 0 ? ["TOTAL", "", t.stays, nightsTotal, money(t.room)] : null,
    summary: [["Room Revenue", money(t.room)], ["Stays", t.stays], ["Nights sold", nightsTotal]]
  };
}

function serviceRevenueReport(f) {
  const stays = finalizedStays(f);
  const groups = {};
  stays.forEach(function (s) {
    getCharges(s.r.reservation_id).forEach(function (c) {
      const g = groups[c.service_type] || (groups[c.service_type] = { quantity: 0, amount: 0 });
      g.quantity += c.quantity;
      g.amount += c.amount;
    });
  });

  const keys = Object.keys(groups).sort(function (a, b) { return groups[b].amount - groups[a].amount; });
  let quantity = 0, total = 0;
  const rows = keys.map(function (k) {
    quantity += groups[k].quantity;
    total += groups[k].amount;
    return [k, groups[k].quantity, money(round2(groups[k].amount))];
  });

  return {
    columns: ["Service", "Quantity", "Revenue"],
    rows: rows,
    totalRow: rows.length > 0 ? ["TOTAL", quantity, money(round2(total))] : null,
    summary: [["Service Revenue", money(round2(total))], ["Services sold", quantity]]
  };
}

function billsInScope(f) {
  return Database.getAll("billing").filter(function (b) {
    if (f.from && b.bill_date < f.from) return false;
    if (f.to && b.bill_date > f.to) return false;
    const r = Database.getById("reservations", b.reservation_id);
    return passesReservationFilters(r, f, "none", null);
  });
}

function discountReport(f) {
  const bills = billsInScope(f).filter(function (b) { return b.discounts > 0; });
  let subtotal = 0, discounts = 0;
  const rows = bills.map(function (b) {
    const r = Database.getById("reservations", b.reservation_id);
    const sub = round2(b.room_charges + b.service_charges);
    subtotal += sub;
    discounts += b.discounts;
    const kind = b.discount_type === "Percent" ? b.discount_value + "%" : "Amount";
    return [b.bill_no, guestNameById(r.guest_id), "Room " + roomNumberById(r.room_id), money(sub), kind,
            money(b.discounts), b.discount_note || "-", money(b.total_amount)];
  });

  return {
    columns: ["Bill", "Guest", "Room", "Subtotal", "Type", "Discount", "Reason", "Total Billed"],
    rows: rows,
    totalRow: rows.length > 0 ? ["TOTAL", "", "", money(round2(subtotal)), "", money(round2(discounts)), "", ""] : null,
    summary: [["Bills with discounts", rows.length], ["Total Discounts", money(round2(discounts))]]
  };
}

function taxReport(f) {
  const bills = billsInScope(f);
  let taxes = 0, subtotal = 0;
  const rows = bills.map(function (b) {
    const r = Database.getById("reservations", b.reservation_id);
    const sub = round2(b.room_charges + b.service_charges);
    subtotal += sub;
    taxes += b.taxes;
    return [b.bill_no, guestNameById(r.guest_id), "Room " + roomNumberById(r.room_id), money(sub), money(b.discounts),
            (b.tax_rate === undefined ? "-" : b.tax_rate + "%"), money(b.taxes)];
  });

  return {
    columns: ["Bill", "Guest", "Room", "Subtotal", "Discount", "Tax Rate", "Taxes"],
    rows: rows,
    totalRow: rows.length > 0 ? ["TOTAL", "", "", money(round2(subtotal)), "", "", money(round2(taxes))] : null,
    summary: [["Bills", rows.length], ["Total Taxes", money(round2(taxes))]]
  };
}

function outstandingReport(f) {
  const bills = billsInScope(f).filter(function (b) { return b.balance > 0; });
  bills.sort(function (a, b) { return b.balance - a.balance; });
  let total = 0, balance = 0, paid = 0;
  const rows = bills.map(function (b) {
    const r = Database.getById("reservations", b.reservation_id);
    total += b.total_amount; paid += b.amount_paid; balance += b.balance;
    return [b.bill_no, guestNameById(r.guest_id), "Room " + roomNumberById(r.room_id), money(b.total_amount),
            money(b.amount_paid), money(b.balance), badge(b.payment_status), badge(r.status)];
  });

  return {
    columns: ["Bill", "Guest", "Room", "Total", "Paid", "Balance", "Payment", "Stay"],
    rows: rows,
    totalRow: rows.length > 0 ? ["TOTAL", "", "", money(round2(total)), money(round2(paid)), money(round2(balance)), "", ""] : null,
    summary: [["Bills with a balance", rows.length], ["Total Outstanding", money(round2(balance))]]
  };
}

function paymentHistoryReport(f) {
  const payments = Database.getAll("payments").filter(function (p) {
    const day = p.payment_date.slice(0, 10);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (f.method && p.method !== f.method) return false;
    const bill = Database.getById("billing", p.bill_id);
    const r = Database.getById("reservations", bill.reservation_id);
    return passesReservationFilters(r, f, "none", null);
  });
  payments.sort(function (a, b) { return a.payment_date.localeCompare(b.payment_date) || a.payment_id - b.payment_id; });

  let total = 0;
  const byMethod = {};
  const rows = payments.map(function (p) {
    const bill = Database.getById("billing", p.bill_id);
    const r = Database.getById("reservations", bill.reservation_id);
    total += p.amount;
    byMethod[p.method] = round2((byMethod[p.method] || 0) + p.amount);
    return [p.payment_no, formatDateTime(p.payment_date), bill.bill_no, guestNameById(r.guest_id), p.method, p.reference || "-", money(p.amount)];
  });

  const summary = [["Payments", rows.length]];
  Object.keys(byMethod).forEach(function (m) { summary.push([m, money(byMethod[m])]); });
  summary.push(["Total Received", money(round2(total))]);

  return {
    columns: ["Payment", "Date", "Bill", "Guest", "Method", "Reference", "Amount"],
    rows: rows,
    totalRow: rows.length > 0 ? ["TOTAL", "", "", "", "", "", money(round2(total))] : null,
    summary: summary
  };
}

const REPORTS = [
  { id: "daily-reservations", group: "reservation", title: "Daily Reservations", filters: ["from", "to", "room", "roomType", "guest", "status"],
    hint: "Reservations booked on the chosen dates. With no dates chosen, today is used.",
    run: function (f) { return reservationListReport(f, null, "booking"); } },
  { id: "confirmed-reservations", group: "reservation", title: "Confirmed Reservations", filters: ["from", "to", "room", "roomType", "guest"],
    hint: "Confirmed reservations whose stay overlaps the date range.",
    run: function (f) { return reservationListReport(f, "Confirmed", "stay"); } },
  { id: "cancelled-reservations", group: "reservation", title: "Cancelled Reservations", filters: ["from", "to", "room", "roomType", "guest"],
    hint: "Cancelled reservations whose stay overlaps the date range.",
    run: function (f) { return reservationListReport(f, "Cancelled", "stay"); } },
  { id: "checked-in-reservations", group: "reservation", title: "Checked-in Guests", filters: ["from", "to", "room", "roomType", "guest"],
    hint: "Reservations with the status Checked-in.",
    run: function (f) { return reservationListReport(f, "Checked-in", "stay"); } },
  { id: "checked-out-reservations", group: "reservation", title: "Checked-out Guests", filters: ["from", "to", "room", "roomType", "guest"],
    hint: "Reservations with the status Checked-out.",
    run: function (f) { return reservationListReport(f, "Checked-out", "stay"); } },
  { id: "noshow-reservations", group: "reservation", title: "No-show Reservations", filters: ["from", "to", "room", "roomType", "guest"],
    hint: "Reservations marked as no-show.",
    run: function (f) { return reservationListReport(f, "No-show", "stay"); } },
  { id: "reservations-by-date", group: "reservation", title: "Reservations by Date", filters: ["from", "to", "room", "roomType", "guest", "status"],
    hint: "Arrivals grouped by check-in date.",
    run: reservationsByDateReport },

  { id: "guest-master", group: "guest", title: "Guest Master List", filters: ["guest", "gstatus"],
    hint: "Every registered guest with their number of reservations and last stay.",
    run: guestMasterReport },
  { id: "guest-history", group: "guest", title: "Guest Reservation History", filters: ["guest", "from", "to", "status"],
    hint: "Reservations per guest. Choose a guest to see one guest only.",
    run: guestHistoryReport },
  { id: "frequent-guests", group: "guest", title: "Frequent Guests", filters: ["minVisits", "from", "to"],
    hint: "Guests ranked by stays (checked in or checked out). Raise or lower the minimum stays.",
    run: frequentGuestsReport },
  { id: "current-guests", group: "guest", title: "Current Guests", filters: ["room", "roomType", "guest"],
    hint: "Guests who are checked in right now.",
    run: currentGuestsReport },
  { id: "checked-out-guests", group: "guest", title: "Checked-out Guests", filters: ["from", "to", "room", "roomType", "guest"],
    hint: "Guests who have left, with their final bill. The date range is the check-out date.",
    run: checkedOutGuestsReport },

  { id: "room-occupancy", group: "occupancy", title: "Room Occupancy", filters: ["asOf", "roomType"],
    hint: "Room statuses are as of now. The date only decides which available rooms count as Reserved (a confirmed reservation covers that date).",
    run: occupancyReport },

  { id: "daily-revenue", group: "revenue", title: "Daily Revenue", filters: ["from", "to", "room", "roomType", "guest"],
    hint: "Bills of guests who have checked out, grouped by check-out date.",
    run: function (f) {
      return groupedRevenueReport(f, "Date", function (s) { return s.day; }, function (k) { return formatDate(k); });
    } },
  { id: "monthly-revenue", group: "revenue", title: "Monthly Revenue", filters: ["from", "to", "room", "roomType", "guest"],
    hint: "Bills of guests who have checked out, grouped by the month of check-out.",
    run: function (f) {
      return groupedRevenueReport(f, "Month", function (s) { return s.day.slice(0, 7); }, monthLabel);
    } },
  { id: "room-revenue", group: "revenue", title: "Room Revenue", filters: ["from", "to", "room", "roomType", "guest"],
    hint: "Room charges of checked-out stays, per room.",
    run: roomRevenueReport },
  { id: "service-revenue", group: "revenue", title: "Service Revenue", filters: ["from", "to", "room", "roomType", "guest"],
    hint: "Additional services of checked-out stays, per service.",
    run: serviceRevenueReport },
  { id: "discount-report", group: "revenue", title: "Discount Report", filters: ["from", "to", "room", "roomType", "guest"],
    hint: "Bills with a discount. The date range is the bill date.",
    run: discountReport },
  { id: "tax-report", group: "revenue", title: "Tax Report", filters: ["from", "to", "room", "roomType", "guest"],
    hint: "Taxes charged on every bill. The date range is the bill date.",
    run: taxReport },
  { id: "outstanding-balances", group: "revenue", title: "Outstanding Balances", filters: ["from", "to", "room", "roomType", "guest"],
    hint: "Bills that still have a balance, including guests who are still in the hotel. The date range is the bill date.",
    run: outstandingReport },
  { id: "payment-history", group: "revenue", title: "Payment History", filters: ["from", "to", "method", "room", "roomType", "guest"],
    hint: "Every payment received. The date range is the payment date.",
    run: paymentHistoryReport }
];

function findReport(id) {
  return REPORTS.find(function (r) { return r.id === id; });
}

function activeFilters(def) {
  const f = {};
  Object.keys(REPORT_FILTER_IDS).forEach(function (key) {
    f[key] = (def.filters.indexOf(key) !== -1) ? reportFilters[key] : "";
  });
  return f;
}

function optionList(items, selected, allLabel) {
  let html = '<option value="">' + allLabel + '</option>';
  items.forEach(function (item) {
    html += '<option value="' + escapeHtml(item.value) + '"' + (String(item.value) === String(selected) ? " selected" : "") + '>' + escapeHtml(item.label) + '</option>';
  });
  return html;
}

function filterControl(key) {
  const v = reportFilters[key];
  const id = REPORT_FILTER_IDS[key];

  if (key === "from" || key === "to" || key === "asOf") {
    const label = (key === "from") ? "From" : (key === "to") ? "To" : "As of";
    return '<label class="inline-label">' + label + ' <input type="date" id="' + id + '" class="input" value="' + escapeHtml(v) + '" onchange="runReport()"></label>';
  }
  if (key === "minVisits") {
    return '<label class="inline-label">Minimum stays <input type="number" id="' + id + '" class="input" min="1" step="1" value="' + escapeHtml(v) + '" oninput="runReport()"></label>';
  }

  let items = [];
  let allLabel = "";
  if (key === "room") {
    items = Database.getAll("rooms").sort(function (a, b) { return a.room_number.localeCompare(b.room_number, undefined, { numeric: true }); })
      .map(function (r) { return { value: r.room_id, label: "Room " + r.room_number }; });
    allLabel = "All rooms";
  } else if (key === "roomType") {
    items = Database.getAll("room_types").map(function (t) { return { value: t.room_type_id, label: t.type_name }; });
    allLabel = "All room types";
  } else if (key === "guest") {
    items = Database.getAll("guests").sort(function (a, b) { return a.guest_no.localeCompare(b.guest_no, undefined, { numeric: true }); })
      .map(function (g) { return { value: g.guest_id, label: g.guest_no + " - " + getGuestName(g) }; });
    allLabel = "All guests";
  } else if (key === "status") {
    items = SCHEMA.reservations.fields.status.allowed.map(function (s) { return { value: s, label: s }; });
    allLabel = "All statuses";
  } else if (key === "gstatus") {
    items = [{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }];
    allLabel = "All guests";
  } else if (key === "method") {
    items = PAYMENT_METHODS.map(function (m) { return { value: m, label: m }; });
    allLabel = "All payment methods";
  }
  return '<select id="' + id + '" class="input" onchange="runReport()">' + optionList(items, v, allLabel) + '</select>';
}

function describeFilters(def) {
  const f = activeFilters(def);
  const parts = [];
  if (f.from) parts.push("From " + formatDate(f.from));
  if (f.to) parts.push("To " + formatDate(f.to));
  if (def.filters.indexOf("asOf") !== -1) parts.push("As of " + formatDate(f.asOf || todayText()));
  if (f.room) parts.push("Room " + roomNumberById(Number(f.room)));
  if (f.roomType) {
    const type = Database.getById("room_types", Number(f.roomType));
    parts.push(type ? type.type_name : "Room type");
  }
  if (f.guest) parts.push(guestNameById(Number(f.guest)));
  if (f.status) parts.push("Status: " + f.status);
  if (f.gstatus) parts.push("Guests: " + f.gstatus);
  if (f.method) parts.push(f.method);
  return parts.length > 0 ? parts.join(" | ") : "No filters";
}

function renderReportCell(cell) {
  if (cell !== null && typeof cell === "object") {
    if (cell.money !== undefined) return formatPeso(cell.money);
    if (cell.status !== undefined) return statusBadge(cell.status);
  }
  return escapeHtml(cell);
}

function plainReportCell(cell) {
  if (cell !== null && typeof cell === "object") {
    if (cell.money !== undefined) return Number(cell.money).toFixed(2);
    if (cell.status !== undefined) return cell.status;
  }
  return String(cell);
}

function buildReportResults() {
  const def = findReport(reportsId);
  const data = def.run(activeFilters(def));

  let html = '<div class="panel report-print"><h2>' + escapeHtml(def.title.toUpperCase()) + '</h2>' +
    '<p class="hint">' + escapeHtml(describeFilters(def)) + ' &bull; Generated ' + escapeHtml(formatDateTime(nowLocalText())) + '</p>';

  if (data.summary && data.summary.length > 0) {
    html += '<div class="summary-box"><ul class="detail-list">';
    data.summary.forEach(function (line) {
      html += '<li><span>' + escapeHtml(line[0]) + ':</span> ' + renderReportCell(line[1]) + '</li>';
    });
    html += '</ul></div>';
  }

  html += '<div class="table-scroll"><table class="data-table"><thead><tr>';
  data.columns.forEach(function (c) { html += '<th>' + escapeHtml(c) + '</th>'; });
  html += '</tr></thead><tbody>';

  if (data.rows.length === 0) {
    html += '<tr><td colspan="' + data.columns.length + '">No records match the selected filters.</td></tr>';
  } else {
    data.rows.forEach(function (row) {
      html += '<tr>' + row.map(function (cell) { return '<td>' + renderReportCell(cell) + '</td>'; }).join("") + '</tr>';
    });
    if (data.totalRow) {
      html += '<tr class="total-row">' + data.totalRow.map(function (cell) { return '<td>' + renderReportCell(cell) + '</td>'; }).join("") + '</tr>';
    }
  }

  return html + '</tbody></table></div></div>';
}

function showReportsPage() {
  const groupReports = REPORTS.filter(function (r) { return r.group === reportsGroup; });
  const def = findReport(reportsId);

  let tabs = "";
  REPORT_GROUPS.forEach(function (g) {
    tabs += '<button class="btn' + (g.id === reportsGroup ? '' : ' btn-secondary') + '" onclick="selectReportGroup(\'' + g.id + '\')">' + g.label + '</button>';
  });

  let reportOptions = "";
  groupReports.forEach(function (r) {
    reportOptions += '<option value="' + r.id + '"' + (r.id === reportsId ? " selected" : "") + '>' + escapeHtml(r.title) + '</option>';
  });

  contentArea.innerHTML =
    '<div class="panel">' +
      '<h2>REPORTS</h2>' +
      '<div class="tab-bar">' + tabs + '</div>' +
      '<div class="toolbar">' +
        '<label class="inline-label">Report <select id="rp-report" class="input" onchange="selectReport()">' + reportOptions + '</select></label>' +
        def.filters.map(filterControl).join("") +
        '<button class="btn btn-secondary" onclick="window.print()">Print</button>' +
        '<button class="btn btn-secondary" onclick="exportReportCsv()">Export CSV</button>' +
      '</div>' +
      '<p class="hint">' + escapeHtml(def.hint) + '</p>' +
    '</div>' +
    '<div id="rp-results">' + buildReportResults() + '</div>';
}

function selectReportGroup(groupId) {
  reportsGroup = groupId;
  reportsId = REPORTS.find(function (r) { return r.group === groupId; }).id;
  showReportsPage();
}

function selectReport() {
  reportsId = document.getElementById("rp-report").value;
  showReportsPage();
}

function readReportFilters() {
  Object.keys(REPORT_FILTER_IDS).forEach(function (key) {
    const el = document.getElementById(REPORT_FILTER_IDS[key]);
    if (el) reportFilters[key] = el.value;
  });
}

function runReport() {
  readReportFilters();
  document.getElementById("rp-results").innerHTML = buildReportResults();
}

function csvCell(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function buildReportCsv() {
  const def = findReport(reportsId);
  const data = def.run(activeFilters(def));
  const lines = [data.columns.map(csvCell).join(",")];
  data.rows.forEach(function (row) { lines.push(row.map(function (c) { return csvCell(plainReportCell(c)); }).join(",")); });
  if (data.rows.length > 0 && data.totalRow) {
    lines.push(data.totalRow.map(function (c) { return csvCell(plainReportCell(c)); }).join(","));
  }
  return lines.join("\r\n");
}

function exportReportCsv() {
  readReportFilters();
  const blob = new Blob(["\uFEFF" + buildReportCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = reportsId + "-" + todayText() + ".csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
