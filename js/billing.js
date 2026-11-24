let billingPanel = null;
let billingSearch = "";
let billingStatusFilter = "All";

const BILLING_DEFAULTS = { tax_rate: "10", tax_base: "Subtotal", room_status_after_checkout: "Cleaning" };
const PAYMENT_METHODS = ["Cash", "Card", "Bank Transfer", "Electronic Payment"];

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function nextCode(table, field, prefix) {
  let highest = 0;
  const pattern = new RegExp("^" + prefix + "-(\\d+)$");
  Database.getAll(table).forEach(function (row) {
    const match = pattern.exec(row[field]);
    if (match && Number(match[1]) > highest) highest = Number(match[1]);
  });
  return prefix + "-" + String(highest + 1).padStart(4, "0");
}

function getSetting(key) {
  const row = Database.getAll("settings").find(function (s) { return s.setting_key === key; });
  return row ? row.setting_value : BILLING_DEFAULTS[key];
}

function saveSetting(key, value) {
  const row = Database.getAll("settings").find(function (s) { return s.setting_key === key; });
  if (row) return Database.update("settings", row.setting_id, { setting_value: String(value) });
  return Database.insert("settings", { setting_key: key, setting_value: String(value) });
}

function getTaxRate() {
  const rate = Number(getSetting("tax_rate"));
  return isNaN(rate) ? Number(BILLING_DEFAULTS.tax_rate) : rate;
}

function computeRoomCharge(r, endOverride) {
  const reservedNights = countNights(r.check_in_date, r.check_out_date);
  const rate = round2(r.total_amount / reservedNights);

  const checkIns = Database.getAll("check_ins").filter(function (c) { return c.reservation_id === r.reservation_id; });
  const checkOuts = Database.getAll("check_outs").filter(function (c) { return c.reservation_id === r.reservation_id; });

  const start = checkIns.length > 0 ? checkIns[checkIns.length - 1].actual_check_in.slice(0, 10) : r.check_in_date;
  const end = endOverride ? endOverride : (checkOuts.length > 0 ? checkOuts[checkOuts.length - 1].checkout_date.slice(0, 10) : r.check_out_date);

  let nights = countNights(start, end);
  if (!(nights >= 1)) nights = 1;

  return { rate: rate, nights: nights, start: start, end: end, amount: round2(rate * nights) };
}

function computeTotals(roomCharges, serviceTotal, discountType, discountValue, taxRate, taxBase) {
  const subtotal = round2(roomCharges + serviceTotal);
  let discount = (discountType === "Percent") ? round2(subtotal * discountValue / 100) : round2(discountValue);
  if (discount > subtotal) discount = subtotal;

  const taxable = (taxBase === "After Discount") ? subtotal - discount : subtotal;
  const taxes = round2(taxable * taxRate / 100);
  const total = round2(subtotal - discount + taxes);

  return { subtotal: subtotal, discount: discount, taxes: taxes, total: total };
}

function getCharges(reservationId) {
  return Database.getAll("additional_charges").filter(function (c) { return c.reservation_id === reservationId; });
}

function sumCharges(reservationId) {
  return round2(getCharges(reservationId).reduce(function (sum, c) { return sum + c.amount; }, 0));
}

function getBillForReservation(reservationId) {
  return Database.getAll("billing").find(function (b) { return b.reservation_id === reservationId; });
}

function previewTotals(bill, overrides) {
  const r = Database.getById("reservations", bill.reservation_id);
  const serviceTotal = (overrides.serviceTotal !== undefined) ? overrides.serviceTotal : sumCharges(r.reservation_id);
  const type = overrides.discountType || bill.discount_type;
  const value = (overrides.discountValue !== undefined) ? overrides.discountValue : bill.discount_value;
  return computeTotals(computeRoomCharge(r).amount, serviceTotal, type, value, getTaxRate(), getSetting("tax_base"));
}

function paymentStatusFor(paid, total) {
  if (paid <= 0) return "Unpaid";
  return (round2(total - paid) <= 0) ? "Paid" : "Partial";
}

function recalcBill(billId) {
  const bill = Database.getById("billing", billId);
  const r = Database.getById("reservations", bill.reservation_id);
  const stay = computeRoomCharge(r);
  const serviceTotal = sumCharges(r.reservation_id);
  const rate = getTaxRate();
  const t = computeTotals(stay.amount, serviceTotal, bill.discount_type, bill.discount_value, rate, getSetting("tax_base"));
  const balance = Math.max(0, round2(t.total - bill.amount_paid));

  return Database.update("billing", billId, {
    room_charges: stay.amount,
    service_charges: serviceTotal,
    discounts: t.discount,
    tax_rate: rate,
    taxes: t.taxes,
    total_amount: t.total,
    balance: balance,
    payment_status: paymentStatusFor(bill.amount_paid, t.total)
  });
}

function createBillForReservation(reservationId) {
  const r = Database.getById("reservations", reservationId);

  if (r.status !== "Checked-in" && r.status !== "Checked-out") {
    return { ok: false, errors: ["Only checked-in or checked-out reservations can be billed. " + r.reservation_no + " is " + r.status + "."] };
  }
  if (getBillForReservation(reservationId)) {
    return { ok: false, errors: ["Reservation " + r.reservation_no + " already has a bill."] };
  }

  const stay = computeRoomCharge(r);
  const rate = getTaxRate();
  const serviceTotal = sumCharges(reservationId);
  const t = computeTotals(stay.amount, serviceTotal, "Amount", 0, rate, getSetting("tax_base"));

  return Database.insert("billing", {
    bill_no: nextCode("billing", "bill_no", "B"),
    reservation_id: reservationId,
    guest_id: r.guest_id,
    bill_date: todayText(),
    room_charges: stay.amount,
    service_charges: serviceTotal,
    discount_type: "Amount",
    discount_value: 0,
    discount_note: "",
    discounts: t.discount,
    tax_rate: rate,
    taxes: t.taxes,
    total_amount: t.total,
    amount_paid: 0,
    balance: t.total,
    payment_status: "Unpaid"
  });
}

function validateCharge(c) {
  const errors = [];
  if (!c.type) {
    errors.push("Service is required.");
  } else if (SCHEMA.additional_charges.fields.service_type.allowed.indexOf(c.type) === -1) {
    errors.push("Service is not valid.");
  }
  if (c.type === "Other Services" && !c.description.trim()) {
    errors.push("A description is required for Other Services.");
  }
  if (c.quantity === "" || !Number.isInteger(c.quantity) || c.quantity < 1) {
    errors.push("Quantity must be a whole number of at least 1.");
  }
  if (c.price === "" || isNaN(c.price) || c.price <= 0) {
    errors.push("Unit price must be greater than 0.");
  }
  return errors;
}

function validateDiscount(bill, d) {
  const errors = [];
  if (d.type !== "Amount" && d.type !== "Percent") errors.push("Discount type is not valid.");
  if (d.value === "" || isNaN(d.value) || d.value < 0) {
    errors.push("Discount must be 0 or more.");
    return errors;
  }
  const r = Database.getById("reservations", bill.reservation_id);
  const subtotal = round2(computeRoomCharge(r).amount + sumCharges(r.reservation_id));
  if (d.type === "Percent" && d.value > 100) errors.push("A percentage discount cannot be more than 100%.");
  if (d.type === "Amount" && d.value > subtotal) errors.push("Discount cannot be more than the subtotal (" + formatPeso(subtotal) + ").");
  if (d.value > 0 && !d.note.trim()) errors.push("Please give a reason for the discount.");

  if (errors.length === 0) {
    const t = previewTotals(bill, { discountType: d.type, discountValue: d.value });
    if (t.total < bill.amount_paid) {
      errors.push("The new total (" + formatPeso(t.total) + ") would be lower than the amount already paid (" + formatPeso(bill.amount_paid) + ").");
    }
  }
  return errors;
}

function validatePayment(bill, p) {
  const errors = [];
  if (bill.balance <= 0) {
    errors.push("This bill has no balance to pay.");
    return errors;
  }
  if (p.amount === "" || isNaN(p.amount) || p.amount <= 0) {
    errors.push("Amount paid must be greater than 0.");
  } else if (round2(p.amount) > bill.balance) {
    errors.push("Payment of " + formatPeso(p.amount) + " is more than the balance of " + formatPeso(bill.balance) + ".");
  }
  if (PAYMENT_METHODS.indexOf(p.method) === -1) {
    errors.push("Payment method is required.");
  } else if (p.method !== "Cash" && !p.reference.trim()) {
    errors.push("A reference number is required for " + p.method + " payments.");
  }
  return errors;
}

function showBillingPage(message) {
  let html = "";
  if (message) html += '<div class="message-area">' + message + '</div>';
  if (billingPanel) html += buildBillingPanel();

  let statusOptions = "";
  ["All", "Unpaid", "Partial", "Paid"].forEach(function (s) {
    statusOptions += '<option value="' + s + '"' + (s === billingStatusFilter ? " selected" : "") + '>' +
                     (s === "All" ? "All statuses" : s) + '</option>';
  });

  html += buildUnbilledPanel() +
    '<div class="panel">' +
      '<h2>GUEST BILLS</h2>' +
      '<div class="toolbar">' +
        '<input type="text" id="bill-search" class="input" placeholder="Search bill no., guest, room, reservation..." ' +
          'value="' + escapeHtml(billingSearch) + '" oninput="filterBills()">' +
        '<select id="bill-status-filter" class="input" onchange="filterBills()">' + statusOptions + '</select>' +
        '<button class="btn btn-secondary" onclick="openBillingSettings()">Billing Settings</button>' +
      '</div>' +
      '<table class="data-table">' +
        '<thead><tr><th>Bill</th><th>Guest</th><th>Room</th><th>Stay</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead>' +
        '<tbody id="bill-rows">' + buildBillRows() + '</tbody>' +
      '</table>' +
    '</div>';

  contentArea.innerHTML = html;
}

function buildUnbilledPanel() {
  const waiting = Database.getAll("reservations").filter(function (r) {
    return (r.status === "Checked-in" || r.status === "Checked-out") && !getBillForReservation(r.reservation_id);
  });

  if (waiting.length === 0) return "";

  let rows = "";
  waiting.forEach(function (r) {
    rows += '<tr>' +
      '<td><strong>' + escapeHtml(r.reservation_no) + '</strong></td>' +
      '<td>' + escapeHtml(getReservationGuestName(r)) + '</td>' +
      '<td>Room ' + escapeHtml(getReservationRoomNumber(r)) + '</td>' +
      '<td>' + escapeHtml(formatDateRange(r.check_in_date, r.check_out_date)) + '</td>' +
      '<td>' + statusBadge(r.status) + '</td>' +
      '<td class="actions"><button class="btn-small" onclick="createBill(' + r.reservation_id + ')">Create Bill</button></td>' +
    '</tr>';
  });

  return '<div class="panel">' +
    '<h2>STAYS WITHOUT A BILL</h2>' +
    '<table class="data-table">' +
      '<thead><tr><th>Reservation</th><th>Guest</th><th>Room</th><th>Reserved Dates</th><th>Status</th><th>Action</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>' +
  '</div>';
}

function buildBillRows() {
  const keyword = billingSearch.toLowerCase();

  const bills = Database.getAll("billing").filter(function (b) {
    const r = Database.getById("reservations", b.reservation_id);
    const text = (b.bill_no + " " + r.reservation_no + " " + getReservationGuestName(r) + " room " + getReservationRoomNumber(r)).toLowerCase();
    return text.indexOf(keyword) !== -1 && (billingStatusFilter === "All" || b.payment_status === billingStatusFilter);
  });

  bills.sort(function (a, b) { return b.bill_id - a.bill_id; });

  if (bills.length === 0) return '<tr><td colspan="9">No bills found.</td></tr>';

  let html = "";
  bills.forEach(function (b) {
    const r = Database.getById("reservations", b.reservation_id);
    const stay = computeRoomCharge(r);
    html += '<tr>' +
      '<td><strong>' + escapeHtml(b.bill_no) + '</strong></td>' +
      '<td>' + escapeHtml(getReservationGuestName(r)) + '</td>' +
      '<td>Room ' + escapeHtml(getReservationRoomNumber(r)) + '</td>' +
      '<td>' + escapeHtml(formatDateRange(stay.start, stay.end)) + '</td>' +
      '<td>' + formatPeso(b.total_amount) + '</td>' +
      '<td>' + formatPeso(b.amount_paid) + '</td>' +
      '<td>' + formatPeso(b.balance) + '</td>' +
      '<td>' + statusBadge(b.payment_status) + '</td>' +
      '<td class="actions"><button class="btn-small" onclick="openBill(' + b.bill_id + ')">Open</button></td>' +
    '</tr>';
  });
  return html;
}

function filterBills() {
  billingSearch = document.getElementById("bill-search").value;
  billingStatusFilter = document.getElementById("bill-status-filter").value;
  document.getElementById("bill-rows").innerHTML = buildBillRows();
}

function openBill(id)            { billingPanel = { mode: "bill", id: id, draft: null }; showBillingPage(); }
function openBillingSettings()   { billingPanel = { mode: "settings", id: null, draft: null }; showBillingPage(); }
function closeBillingPanel()     { billingPanel = null; showBillingPage(); }

function createBill(reservationId) {
  const result = createBillForReservation(reservationId);
  if (!result.ok) {
    showBillingPage(notAllowedHtml(result.errors, "CANNOT CREATE BILL"));
    return;
  }
  billingPanel = { mode: "bill", id: result.record.bill_id, draft: null };
  showBillingPage(messageHtml("ok", "Bill " + result.record.bill_no + " created. Room charges: " + formatPeso(result.record.room_charges) + "."));
}

function buildBillingPanel() {
  if (billingPanel.mode === "settings") return buildSettingsPanel();
  return buildBillPanel(billingPanel.id);
}

function billLine(label, amount, extraClass) {
  return '<div class="bill-line ' + (extraClass || "") + '"><span>' + label + '</span><span>' + amount + '</span></div>';
}

function buildBillDocument(bill) {
  const r = Database.getById("reservations", bill.reservation_id);
  const guest = Database.getById("guests", bill.guest_id);
  const stay = computeRoomCharge(r);
  const subtotal = round2(bill.room_charges + bill.service_charges);

  let html = '<div class="bill-box">' +
    '<div class="bill-title">GUEST BILL</div>' +
    '<div class="bill-meta">' +
      'Bill No.: ' + escapeHtml(bill.bill_no) + '<br>' +
      'Guest: ' + escapeHtml(guest ? getGuestName(guest) : "?") + '<br>' +
      'Room: ' + escapeHtml(getReservationRoomNumber(r)) + '<br>' +
      'Stay: ' + escapeHtml(formatDateRange(stay.start, stay.end)) +
    '</div>' +
    billLine('Room Charges <small>(' + formatPeso(stay.rate) + ' &times; ' + stay.nights + ' night' + (stay.nights > 1 ? 's' : '') + ')</small>', formatPeso(bill.room_charges));

  getCharges(r.reservation_id).forEach(function (c) {
    const label = escapeHtml(c.service_type) + (c.description ? ' <small>(' + escapeHtml(c.description) + ')</small>' : '') +
                  (c.quantity > 1 ? ' <small>&times; ' + c.quantity + '</small>' : '');
    html += billLine(label, formatPeso(c.amount));
  });

  html += billLine('Subtotal', formatPeso(subtotal), 'sep');
  html += billLine('Discount' + (bill.discount_note ? ' <small>(' + escapeHtml(bill.discount_note) + ')</small>' : ''), formatPeso(bill.discounts));
  html += billLine('Taxes <small>(' + bill.tax_rate + '%)</small>', formatPeso(bill.taxes));
  html += billLine('TOTAL', formatPeso(bill.total_amount), 'total');
  html += billLine('Amount Paid', formatPeso(bill.amount_paid), 'paid-line');
  html += billLine('Balance', formatPeso(bill.balance), 'paid-line');
  html += billLine('Payment Status', statusBadge(bill.payment_status), 'paid-line');
  return html + '</div>';
}

function buildBillPanel(id) {
  const bill = Database.getById("billing", id);
  const r = Database.getById("reservations", bill.reservation_id);
  const locked = (r.status === "Checked-out");
  const d = billingPanel.draft || {};
  const pick = function (value, fallback) { return (value === undefined) ? fallback : value; };

  let serviceOptions = '<option value="">-- Select service --</option>';
  SCHEMA.additional_charges.fields.service_type.allowed.forEach(function (s) {
    serviceOptions += '<option' + (s === d.type ? " selected" : "") + '>' + escapeHtml(s) + '</option>';
  });

  let chargeRows = "";
  getCharges(r.reservation_id).forEach(function (c) {
    chargeRows += '<tr>' +
      '<td>' + escapeHtml(c.service_type) + '</td>' +
      '<td>' + escapeHtml(c.description) + '</td>' +
      '<td>' + c.quantity + '</td>' +
      '<td>' + formatPeso(c.unit_price) + '</td>' +
      '<td>' + formatPeso(c.amount) + '</td>' +
      '<td>' + (locked ? '' : '<button class="btn-small btn-secondary" onclick="removeCharge(' + c.charge_id + ')">Remove</button>') + '</td>' +
    '</tr>';
  });
  if (!chargeRows) chargeRows = '<tr><td colspan="6">No additional services yet.</td></tr>';

  let paymentRows = "";
  Database.getAll("payments").filter(function (p) { return p.bill_id === id; }).forEach(function (p) {
    paymentRows += '<tr>' +
      '<td>' + escapeHtml(p.payment_no) + '</td>' +
      '<td>' + escapeHtml(formatDateTime(p.payment_date)) + '</td>' +
      '<td>' + escapeHtml(p.method) + '</td>' +
      '<td>' + escapeHtml(p.reference || "-") + '</td>' +
      '<td>' + formatPeso(p.amount) + '</td>' +
    '</tr>';
  });
  if (!paymentRows) paymentRows = '<tr><td colspan="5">No payments recorded yet.</td></tr>';

  let methodOptions = '<option value="">-- Select method --</option>';
  PAYMENT_METHODS.forEach(function (m) {
    methodOptions += '<option' + (m === d.payMethod ? " selected" : "") + '>' + escapeHtml(m) + '</option>';
  });

  let html = '<div class="panel">' + buildBillDocument(bill);

  if (locked) {
    html += '<p class="hint">The guest has checked out, so charges and discounts are locked. Payments can still be recorded.</p>';
  } else {
    html += '<h3 class="section-title">Additional Services</h3>' +
      '<table class="data-table"><thead><tr><th>Service</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th><th></th></tr></thead><tbody>' + chargeRows + '</tbody></table>' +
      '<div class="form-grid" style="margin-top:12px">' +
        '<div class="form-group"><label>Service</label><select id="bc-type" class="input">' + serviceOptions + '</select></div>' +
        '<div class="form-group"><label>Description (optional)</label><input type="text" id="bc-desc" class="input" value="' + escapeHtml(pick(d.desc, "")) + '"></div>' +
        '<div class="form-group"><label>Quantity</label><input type="number" id="bc-qty" class="input" min="1" step="1" value="' + escapeHtml(pick(d.qty, "1")) + '"></div>' +
        '<div class="form-group"><label>Unit Price (&#8369;)</label><input type="number" id="bc-price" class="input" min="0" step="0.01" value="' + escapeHtml(pick(d.price, "")) + '"></div>' +
      '</div>' +
      '<button class="btn" onclick="addCharge()">Add Service</button>' +
      '<h3 class="section-title">Discount</h3>' +
      '<div class="form-grid">' +
        '<div class="form-group"><label>Type</label><select id="bd-type" class="input">' +
          '<option' + (pick(d.discountType, bill.discount_type) === "Amount" ? " selected" : "") + '>Amount</option>' +
          '<option' + (pick(d.discountType, bill.discount_type) === "Percent" ? " selected" : "") + '>Percent</option></select></div>' +
        '<div class="form-group"><label>Value</label><input type="number" id="bd-value" class="input" min="0" step="0.01" value="' + escapeHtml(pick(d.discountValue, bill.discount_value)) + '"></div>' +
        '<div class="form-group"><label>Reason</label><input type="text" id="bd-note" class="input" value="' + escapeHtml(pick(d.discountNote, bill.discount_note || "")) + '"></div>' +
      '</div>' +
      '<button class="btn" onclick="applyDiscount()">Apply Discount</button> ' +
      '<button class="btn btn-secondary" onclick="recalculateBill(' + id + ')">Recalculate Bill</button>';
  }

  html += '<h3 class="section-title">Payment</h3>' +
    '<ul class="detail-list">' +
      '<li><span>Total Bill:</span> ' + formatPeso(bill.total_amount) + '</li>' +
      '<li><span>Amount Paid:</span> ' + formatPeso(bill.amount_paid) + '</li>' +
      '<li><span>Balance:</span> ' + formatPeso(bill.balance) + '</li>' +
      '<li><span>Payment Status:</span> ' + statusBadge(bill.payment_status) + '</li>' +
    '</ul>';

  if (bill.balance > 0) {
    html += '<div class="form-grid">' +
        '<div class="form-group"><label>Amount Paid (&#8369;)</label><input type="number" id="bp-amount" class="input" min="0" step="0.01" value="' + escapeHtml(pick(d.payAmount, bill.balance)) + '"></div>' +
        '<div class="form-group"><label>Payment Method</label><select id="bp-method" class="input">' + methodOptions + '</select></div>' +
        '<div class="form-group"><label>Reference No.</label><input type="text" id="bp-ref" class="input" placeholder="Card, bank or e-payment reference" value="' + escapeHtml(pick(d.payRef, "")) + '"></div>' +
      '</div>' +
      '<button class="btn" onclick="recordPayment()">Record Payment</button> ';
  }

  html += '<h3 class="section-title">Payment History</h3>' +
    '<table class="data-table"><thead><tr><th>Payment</th><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead><tbody>' + paymentRows + '</tbody></table>' +
    '<p style="margin-top:16px"><button class="btn btn-secondary" onclick="closeBillingPanel()">Close</button></p>' +
  '</div>';

  return html;
}

function readChargeForm() {
  return {
    type: document.getElementById("bc-type").value,
    desc: document.getElementById("bc-desc").value,
    qty: document.getElementById("bc-qty").value,
    price: document.getElementById("bc-price").value
  };
}

function readDiscountForm() {
  return {
    discountType: document.getElementById("bd-type").value,
    discountValue: document.getElementById("bd-value").value,
    discountNote: document.getElementById("bd-note").value
  };
}

function readPaymentForm() {
  return {
    payAmount: document.getElementById("bp-amount").value,
    payMethod: document.getElementById("bp-method").value,
    payRef: document.getElementById("bp-ref").value
  };
}

function billIsLocked(bill) {
  return Database.getById("reservations", bill.reservation_id).status === "Checked-out";
}

function addCharge() {
  const bill = Database.getById("billing", billingPanel.id);
  const raw = readChargeForm();

  if (billIsLocked(bill)) {
    showBillingPage(messageHtml("error", "The guest has checked out. Charges can no longer be added."));
    return;
  }

  const charge = { type: raw.type, description: raw.desc, quantity: toNumber(raw.qty), price: toNumber(raw.price) };
  const errors = validateCharge(charge);
  if (errors.length > 0) {
    billingPanel.draft = raw;
    showBillingPage(notAllowedHtml(errors, "CANNOT ADD SERVICE"));
    return;
  }

  const saved = Database.insert("additional_charges", {
    reservation_id: bill.reservation_id,
    service_type: charge.type,
    description: charge.description.trim(),
    quantity: charge.quantity,
    unit_price: charge.price,
    amount: round2(charge.quantity * charge.price),
    charge_date: todayText()
  });
  if (!saved.ok) {
    billingPanel.draft = raw;
    showBillingPage(notAllowedHtml(saved.errors, "CANNOT ADD SERVICE"));
    return;
  }

  recalcBill(bill.bill_id);
  billingPanel.draft = null;
  showBillingPage(messageHtml("ok", charge.type + " (" + formatPeso(saved.record.amount) + ") added to the bill."));
}

function removeCharge(chargeId) {
  const charge = Database.getById("additional_charges", chargeId);
  const bill = getBillForReservation(charge.reservation_id);

  if (billIsLocked(bill)) {
    showBillingPage(messageHtml("error", "The guest has checked out. Charges can no longer be removed."));
    return;
  }

  const newServiceTotal = round2(sumCharges(charge.reservation_id) - charge.amount);
  const t = previewTotals(bill, { serviceTotal: newServiceTotal });
  if (t.total < bill.amount_paid) {
    showBillingPage(notAllowedHtml(["The new total (" + formatPeso(t.total) + ") would be lower than the amount already paid (" + formatPeso(bill.amount_paid) + ")."], "CANNOT REMOVE SERVICE"));
    return;
  }

  Database.remove("additional_charges", chargeId);
  recalcBill(bill.bill_id);
  showBillingPage(messageHtml("ok", charge.service_type + " removed from the bill."));
}

function applyDiscount() {
  const bill = Database.getById("billing", billingPanel.id);
  const raw = readDiscountForm();

  if (billIsLocked(bill)) {
    showBillingPage(messageHtml("error", "The guest has checked out. The discount can no longer be changed."));
    return;
  }

  const d = { type: raw.discountType, value: toNumber(raw.discountValue), note: raw.discountNote };
  const errors = validateDiscount(bill, d);
  if (errors.length > 0) {
    billingPanel.draft = raw;
    showBillingPage(notAllowedHtml(errors, "CANNOT APPLY DISCOUNT"));
    return;
  }

  const result = Database.update("billing", bill.bill_id, {
    discount_type: d.type,
    discount_value: d.value,
    discount_note: d.value > 0 ? d.note.trim() : ""
  });
  if (!result.ok) {
    billingPanel.draft = raw;
    showBillingPage(notAllowedHtml(result.errors, "CANNOT APPLY DISCOUNT"));
    return;
  }

  recalcBill(bill.bill_id);
  billingPanel.draft = null;
  showBillingPage(messageHtml("ok", "Discount applied."));
}

function recalculateBill(id) {
  recalcBill(id);
  showBillingPage(messageHtml("ok", "Bill recalculated using the current stay and billing settings."));
}

function applyPayment(billId, p) {
  const bill = Database.getById("billing", billId);
  const errors = validatePayment(bill, p);
  if (errors.length > 0) return { ok: false, errors: errors };

  const amount = round2(p.amount);
  const saved = Database.insert("payments", {
    payment_no: nextCode("payments", "payment_no", "P"),
    bill_id: billId,
    amount: amount,
    method: p.method,
    reference: p.reference.trim(),
    payment_date: nowLocalText()
  });
  if (!saved.ok) return saved;

  const paid = round2(bill.amount_paid + amount);
  const updated = Database.update("billing", billId, {
    amount_paid: paid,
    balance: Math.max(0, round2(bill.total_amount - paid)),
    payment_status: paymentStatusFor(paid, bill.total_amount)
  });
  if (!updated.ok) {
    Database.remove("payments", saved.record.payment_id);
    return updated;
  }

  return { ok: true, record: saved.record, bill: updated.record };
}

function projectBill(bill, checkoutDay) {
  const r = Database.getById("reservations", bill.reservation_id);
  const stay = computeRoomCharge(r, checkoutDay);
  const totals = computeTotals(stay.amount, sumCharges(r.reservation_id), bill.discount_type, bill.discount_value, getTaxRate(), getSetting("tax_base"));
  return { stay: stay, totals: totals, balance: Math.max(0, round2(totals.total - bill.amount_paid)) };
}

function recordPayment() {
  const bill = Database.getById("billing", billingPanel.id);
  const raw = readPaymentForm();
  const p = { amount: toNumber(raw.payAmount), method: raw.payMethod, reference: raw.payRef };

  const result = applyPayment(bill.bill_id, p);
  if (!result.ok) {
    billingPanel.draft = raw;
    showBillingPage(notAllowedHtml(result.errors, "PAYMENT NOT RECORDED"));
    return;
  }

  billingPanel.draft = null;
  showBillingPage(messageHtml("ok", "Payment " + result.record.payment_no + " of " + formatPeso(result.record.amount) + " recorded. Balance: " +
    formatPeso(result.bill.balance) + ". Status: " + result.bill.payment_status.toUpperCase() + "."));
}

function buildSettingsPanel() {
  const base = getSetting("tax_base");
  return '<div class="panel">' +
    '<h2>BILLING SETTINGS</h2>' +
    '<div class="form-grid">' +
      '<div class="form-group"><label>Tax Rate (%)</label>' +
        '<input type="number" id="bs-rate" class="input" min="0" max="100" step="0.01" value="' + escapeHtml(getSetting("tax_rate")) + '"></div>' +
      '<div class="form-group"><label>Tax is computed on</label>' +
        '<select id="bs-base" class="input">' +
          '<option value="Subtotal"' + (base === "Subtotal" ? " selected" : "") + '>Subtotal (before discount)</option>' +
          '<option value="After Discount"' + (base === "After Discount" ? " selected" : "") + '>Amount after discount</option>' +
        '</select></div>' +
    '</div>' +
    '<p class="hint">Set these according to your hotel policy and the regulations that apply to you. A new rate is used when a bill is created or recalculated.</p>' +
    '<button class="btn" onclick="saveBillingSettings()">Save Settings</button> ' +
    '<button class="btn btn-secondary" onclick="closeBillingPanel()">Cancel</button>' +
  '</div>';
}

function saveBillingSettings() {
  const rate = toNumber(document.getElementById("bs-rate").value);
  const base = document.getElementById("bs-base").value;
  const errors = [];

  if (rate === "" || isNaN(rate) || rate < 0 || rate > 100) errors.push("Tax rate must be a number from 0 to 100.");
  if (base !== "Subtotal" && base !== "After Discount") errors.push("Tax base is not valid.");

  if (errors.length > 0) {
    showBillingPage(notAllowedHtml(errors, "SETTINGS NOT SAVED"));
    return;
  }

  saveSetting("tax_rate", rate);
  saveSetting("tax_base", base);
  billingPanel = null;
  showBillingPage(messageHtml("ok", "Billing settings saved. Tax rate: " + rate + "%."));
}
