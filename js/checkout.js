let checkoutPanel = null;
let checkoutSearch = "";

function getRoomStatusAfterCheckout() {
  return getSetting("room_status_after_checkout") === "Available" ? "Available" : "Cleaning";
}

function getCheckInRecord(reservationId) {
  const records = Database.getAll("check_ins").filter(function (c) { return c.reservation_id === reservationId; });
  return records[records.length - 1];
}

function fieldValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

function verifyCheckOut(r, bill, actual) {
  const errors = [];

  if (r.status !== "Checked-in") {
    errors.push("Reservation " + r.reservation_no + " is " + r.status + ". Only checked-in guests can be checked out.");
  }
  if (!bill) {
    errors.push("Create the guest bill before checking out.");
  }

  const checkIn = getCheckInRecord(r.reservation_id);
  if (!actual) {
    errors.push("Actual check-out date and time is required.");
  } else if (isNaN(Date.parse(actual))) {
    errors.push("Actual check-out must be a valid date and time.");
  } else {
    if (Date.parse(actual) > Date.now()) {
      errors.push("Actual check-out cannot be in the future.");
    }
    if (checkIn && Date.parse(actual) < Date.parse(checkIn.actual_check_in)) {
      errors.push("Check-out cannot be earlier than the check-in (" + formatDateTime(checkIn.actual_check_in) + ").");
    }
  }

  return errors;
}

function validateSettlement(projection, data) {
  const errors = [];
  if (projection.balance <= 0) return errors;

  if (data.unpaid) {
    if (!data.remarks.trim()) {
      errors.push("Please explain in the remarks why the balance is left unpaid.");
    }
    return errors;
  }

  const problems = validatePayment({ balance: projection.balance }, data.payment);
  if (problems.length > 0) return problems;

  if (round2(data.payment.amount) < projection.balance) {
    errors.push("Pay the full balance of " + formatPeso(projection.balance) + ", or choose to check out with an unpaid balance.");
  }
  return errors;
}

function performCheckOut(reservationId, data) {
  const r = Database.getById("reservations", reservationId);
  const bill = getBillForReservation(reservationId);

  const errors = verifyCheckOut(r, bill, data.actual);
  if (errors.length > 0) return { ok: false, errors: errors };

  const projection = projectBill(bill, data.actual.slice(0, 10));
  const settlementErrors = validateSettlement(projection, data);
  if (settlementErrors.length > 0) return { ok: false, errors: settlementErrors };

  const room = Database.getById("rooms", r.room_id);
  const previousRoomStatus = room.status;
  const payNow = projection.balance > 0 && !data.unpaid;
  const finalBalance = payNow ? 0 : projection.balance;

  const checkOut = Database.insert("check_outs", {
    reservation_id: reservationId,
    bill_id: bill.bill_id,
    checkout_date: data.actual,
    final_amount: projection.totals.total,
    payment_status: finalBalance > 0 ? "Balance" : "Paid",
    remarks: data.remarks.trim()
  });
  if (!checkOut.ok) return checkOut;

  const undo = function () {
    Database.remove("check_outs", checkOut.record.checkout_id);
    Database.update("reservations", reservationId, { status: "Checked-in" });
    Database.update("rooms", r.room_id, { status: previousRoomStatus });
    recalcBill(bill.bill_id);
  };

  const reservationUpdate = Database.update("reservations", reservationId, { status: "Checked-out" });
  const roomUpdate = Database.update("rooms", r.room_id, { status: getRoomStatusAfterCheckout() });
  if (!reservationUpdate.ok || !roomUpdate.ok) {
    undo();
    return { ok: false, errors: ["The check-out could not be completed. Nothing was changed."] };
  }

  recalcBill(bill.bill_id);

  if (payNow) {
    const paid = applyPayment(bill.bill_id, data.payment);
    if (!paid.ok) {
      undo();
      return { ok: false, errors: paid.errors };
    }
  }

  return { ok: true, record: checkOut.record };
}

function showCheckoutPage(message) {
  let html = "";
  if (message) html += '<div class="message-area">' + message + '</div>';
  if (checkoutPanel) html += buildCheckoutPanel();

  html += '<div class="panel">' +
    '<h2>GUESTS READY FOR CHECK-OUT</h2>' +
    '<div class="toolbar">' +
      '<input type="text" id="co-search" class="input" placeholder="Search room, guest, reservation..." ' +
        'value="' + escapeHtml(checkoutSearch) + '" oninput="filterCheckouts()">' +
    '</div>' +
    '<table class="data-table">' +
      '<thead><tr><th>Room</th><th>Guest</th><th>Reservation</th><th>Actual Check-in</th><th>Check-out Due</th><th>Bill</th><th>Action</th></tr></thead>' +
      '<tbody id="co-rows">' + buildCheckoutRows() + '</tbody>' +
    '</table>' +
  '</div>' + buildCleaningPanel() + buildProcedurePanel();

  contentArea.innerHTML = html;
}

function buildCheckoutRows() {
  const keyword = checkoutSearch.toLowerCase();

  const stays = Database.getAll("reservations").filter(function (r) {
    const text = (r.reservation_no + " " + getReservationGuestName(r) + " room " + getReservationRoomNumber(r)).toLowerCase();
    return r.status === "Checked-in" && text.indexOf(keyword) !== -1;
  });

  stays.sort(function (a, b) {
    return getReservationRoomNumber(a).localeCompare(getReservationRoomNumber(b), undefined, { numeric: true });
  });

  if (stays.length === 0) return '<tr><td colspan="7">No guests are waiting to check out.</td></tr>';

  let html = "";
  stays.forEach(function (r) {
    const checkIn = getCheckInRecord(r.reservation_id);
    const bill = getBillForReservation(r.reservation_id);
    html += '<tr>' +
      '<td><strong>Room ' + escapeHtml(getReservationRoomNumber(r)) + '</strong></td>' +
      '<td>' + escapeHtml(getReservationGuestName(r)) + '</td>' +
      '<td>' + escapeHtml(r.reservation_no) + '</td>' +
      '<td>' + (checkIn ? escapeHtml(formatDateTime(checkIn.actual_check_in)) : "-") + '</td>' +
      '<td>' + escapeHtml(formatDate(r.check_out_date)) + '</td>' +
      '<td>' + (bill ? escapeHtml(bill.bill_no) + ' ' + statusBadge(bill.payment_status) : 'No bill yet') + '</td>' +
      '<td class="actions"><button class="btn-small" onclick="startCheckout(' + r.reservation_id + ')">Check Out</button></td>' +
    '</tr>';
  });
  return html;
}

function filterCheckouts() {
  checkoutSearch = document.getElementById("co-search").value;
  document.getElementById("co-rows").innerHTML = buildCheckoutRows();
}

function buildCleaningPanel() {
  const rooms = Database.getAll("rooms").filter(function (room) { return room.status === "Cleaning"; });
  rooms.sort(function (a, b) { return a.room_number.localeCompare(b.room_number, undefined, { numeric: true }); });

  let rows = '<tr><td colspan="3">No rooms are waiting for housekeeping.</td></tr>';
  if (rooms.length > 0) {
    rows = "";
    rooms.forEach(function (room) {
      const type = Database.getById("room_types", room.room_type_id);
      rows += '<tr>' +
        '<td><strong>Room ' + escapeHtml(room.room_number) + '</strong></td>' +
        '<td>' + escapeHtml(type ? type.type_name : "?") + '</td>' +
        '<td class="actions"><button class="btn-small" onclick="markRoomReady(' + room.room_id + ')">Mark as Available</button></td>' +
      '</tr>';
    });
  }

  return '<div class="panel">' +
    '<h2>ROOMS BEING CLEANED</h2>' +
    '<table class="data-table"><thead><tr><th>Room</th><th>Type</th><th>Action</th></tr></thead><tbody>' + rows + '</tbody></table>' +
  '</div>';
}

function markRoomReady(roomId) {
  const room = Database.getById("rooms", roomId);

  if (room.status !== "Cleaning") {
    showCheckoutPage(messageHtml("error", "Room " + room.room_number + " is " + room.status + ", not Cleaning."));
    return;
  }

  const result = Database.update("rooms", roomId, { status: "Available" });
  if (!result.ok) {
    showCheckoutPage(messageHtml("error", result.errors));
    return;
  }
  showCheckoutPage(messageHtml("ok", "Room " + room.room_number + " is clean and now Available."));
}

function buildProcedurePanel() {
  const current = getRoomStatusAfterCheckout();
  return '<div class="panel">' +
    '<h2>HOTEL PROCEDURE</h2>' +
    '<div class="toolbar">' +
      '<label class="inline-label">After check-out, set the room to ' +
        '<select id="co-procedure" class="input">' +
          '<option' + (current === "Cleaning" ? " selected" : "") + '>Cleaning</option>' +
          '<option' + (current === "Available" ? " selected" : "") + '>Available</option>' +
        '</select></label>' +
      '<button class="btn btn-secondary" onclick="saveCheckoutProcedure()">Save</button>' +
    '</div>' +
    '<p class="hint">Cleaning keeps the room off the market until housekeeping marks it as Available.</p>' +
  '</div>';
}

function saveCheckoutProcedure() {
  const value = document.getElementById("co-procedure").value;
  if (value !== "Cleaning" && value !== "Available") {
    showCheckoutPage(messageHtml("error", "Room status after check-out is not valid."));
    return;
  }
  saveSetting("room_status_after_checkout", value);
  showCheckoutPage(messageHtml("ok", "After check-out, rooms are now set to " + value + "."));
}

function startCheckout(id) {
  checkoutPanel = { id: id, draft: null, lastBalance: null };
  showCheckoutPage();
}

function closeCheckoutPanel() {
  checkoutPanel = null;
  showCheckoutPage();
}

function createBillForCheckout() {
  const result = createBillForReservation(checkoutPanel.id);
  if (!result.ok) {
    showCheckoutPage(notAllowedHtml(result.errors, "CANNOT CREATE BILL"));
    return;
  }
  showCheckoutPage(messageHtml("ok", "Bill " + result.record.bill_no + " created. Review the charges below."));
}

function draftToData(d) {
  return {
    actual: d.actual,
    unpaid: d.unpaid === true,
    remarks: d.remarks || "",
    payment: { amount: toNumber(d.payAmount), method: d.payMethod || "", reference: d.payRef || "" }
  };
}

function buildCheckoutSettle(r, bill, d) {
  const day = (d.actual && !isNaN(Date.parse(d.actual))) ? d.actual.slice(0, 10) : r.check_out_date;
  const projection = projectBill(bill, day);
  const t = projection.totals;

  if (d.payAmount === "" || d.payAmount === undefined || String(d.payAmount) === String(checkoutPanel.lastBalance)) {
    d.payAmount = String(projection.balance);
  }
  checkoutPanel.lastBalance = projection.balance;

  let methodOptions = '<option value="">-- Select method --</option>';
  PAYMENT_METHODS.forEach(function (m) {
    methodOptions += '<option' + (m === d.payMethod ? " selected" : "") + '>' + escapeHtml(m) + '</option>';
  });

  let html = '<div class="summary-box"><ul class="detail-list">' +
    '<li><span>Nights stayed:</span> ' + projection.stay.nights + ' (' + escapeHtml(formatDateRange(projection.stay.start, projection.stay.end)) + ')</li>' +
    '<li><span>Room Charges:</span> ' + formatPeso(projection.stay.amount) + '</li>' +
    '<li><span>Additional Services:</span> ' + formatPeso(sumCharges(r.reservation_id)) + '</li>' +
    '<li><span>Discount:</span> ' + formatPeso(t.discount) + '</li>' +
    '<li><span>Taxes:</span> ' + formatPeso(t.taxes) + '</li>' +
    '<li><span>Total Bill:</span> <strong>' + formatPeso(t.total) + '</strong></li>' +
    '<li><span>Amount Paid:</span> ' + formatPeso(bill.amount_paid) + '</li>' +
    '<li><span>Outstanding Balance:</span> <strong>' + formatPeso(projection.balance) + '</strong></li>' +
  '</ul></div>';

  if (projection.balance > 0) {
    html += '<div class="form-grid">' +
        '<div class="form-group"><label>Final Payment (&#8369;)</label><input type="number" id="co-amount" class="input" min="0" step="0.01" value="' + escapeHtml(d.payAmount) + '" oninput="refreshCheckoutForm()"></div>' +
        '<div class="form-group"><label>Payment Method</label><select id="co-method" class="input" onchange="refreshCheckoutForm()">' + methodOptions + '</select></div>' +
        '<div class="form-group"><label>Reference No.</label><input type="text" id="co-ref" class="input" value="' + escapeHtml(d.payRef || "") + '" oninput="refreshCheckoutForm()"></div>' +
      '</div>' +
      '<p><label><input type="checkbox" id="co-unpaid"' + (d.unpaid ? " checked" : "") + ' onchange="refreshCheckoutForm()"> Check out with an unpaid balance (explain in the remarks)</label></p>';
  }

  const errors = verifyCheckOut(r, bill, d.actual).concat(validateSettlement(projection, draftToData(d)));
  html += '<div class="summary-box">';
  if (errors.length > 0) {
    html += notAllowedHtml(errors, "CHECK-OUT NOT ALLOWED");
  } else {
    html += '<p class="msg-ok">Everything is in order. Ready to check out.</p>';
  }
  return html + '</div>';
}

function buildCheckoutPanel() {
  const r = Database.getById("reservations", checkoutPanel.id);
  const bill = getBillForReservation(r.reservation_id);
  const checkIn = getCheckInRecord(r.reservation_id);
  const d = checkoutPanel.draft || { actual: nowLocalText(), unpaid: false, remarks: "", payAmount: "", payMethod: "", payRef: "" };

  let html = '<div class="panel"><h2>CHECK-OUT</h2>' +
    '<h3 class="section-title">1. Review Reservation</h3>' +
    '<ul class="detail-list">' +
      '<li><span>Reservation:</span> ' + escapeHtml(r.reservation_no) + '</li>' +
      '<li><span>Guest:</span> ' + escapeHtml(getReservationGuestName(r)) + '</li>' +
      '<li><span>Room:</span> ' + escapeHtml(getReservationRoomNumber(r)) + '</li>' +
      '<li><span>Reserved Stay:</span> ' + escapeHtml(formatDateRange(r.check_in_date, r.check_out_date)) + '</li>' +
      '<li><span>Actual Check-in:</span> ' + (checkIn ? escapeHtml(formatDateTime(checkIn.actual_check_in)) : "-") + '</li>' +
    '</ul>' +
    '<h3 class="section-title">2. Review Charges</h3>';

  if (!bill) {
    html += '<p class="msg-error">This stay has no bill yet.</p>' +
      '<button class="btn" onclick="createBillForCheckout()">Create Bill</button> ' +
      '<button class="btn btn-secondary" onclick="closeCheckoutPanel()">Cancel</button></div>';
    return html;
  }

  const payments = Database.getAll("payments").filter(function (p) { return p.bill_id === bill.bill_id; });
  let paymentRows = '<tr><td colspan="4">No payments recorded yet.</td></tr>';
  if (payments.length > 0) {
    paymentRows = "";
    payments.forEach(function (p) {
      paymentRows += '<tr><td>' + escapeHtml(p.payment_no) + '</td><td>' + escapeHtml(formatDateTime(p.payment_date)) + '</td>' +
        '<td>' + escapeHtml(p.method) + '</td><td>' + formatPeso(p.amount) + '</td></tr>';
    });
  }

  html += buildBillDocument(bill) +
    '<h3 class="section-title">3. Review Payments</h3>' +
    '<table class="data-table"><thead><tr><th>Payment</th><th>Date</th><th>Method</th><th>Amount</th></tr></thead><tbody>' + paymentRows + '</tbody></table>' +
    '<h3 class="section-title">4. Settle Balance</h3>' +
    '<div class="form-grid"><div class="form-group"><label>Actual Check-out</label>' +
      '<input type="datetime-local" id="co-actual" class="input" value="' + escapeHtml(d.actual) + '" onchange="refreshCheckoutForm()"></div></div>' +
    '<p class="hint">The check-out time starts at the current date and time. Change it to the guest\'s real departure; the room charges follow the nights actually stayed.</p>' +
    '<div id="co-settle">' + buildCheckoutSettle(r, bill, d) + '</div>' +
    '<h3 class="section-title">5. Confirm Check-out</h3>' +
    '<div class="form-grid"><div class="form-group"><label>Remarks (optional)</label>' +
      '<input type="text" id="co-remarks" class="input" value="' + escapeHtml(d.remarks) + '" oninput="refreshCheckoutForm()"></div></div>' +
    '<button class="btn" onclick="confirmCheckout()">Confirm Check-out</button> ' +
    '<button class="btn btn-secondary" onclick="closeCheckoutPanel()">Cancel</button>' +
  '</div>';
  return html;
}

function readCheckoutForm() {
  const unpaidBox = document.getElementById("co-unpaid");
  return {
    actual: fieldValue("co-actual"),
    payAmount: fieldValue("co-amount"),
    payMethod: fieldValue("co-method"),
    payRef: fieldValue("co-ref"),
    unpaid: !!(unpaidBox && unpaidBox.checked === true),
    remarks: fieldValue("co-remarks")
  };
}

function refreshCheckoutForm() {
  const r = Database.getById("reservations", checkoutPanel.id);
  const bill = getBillForReservation(r.reservation_id);
  const d = readCheckoutForm();
  document.getElementById("co-settle").innerHTML = buildCheckoutSettle(r, bill, d);
}

function confirmCheckout() {
  const id = checkoutPanel.id;
  const r = Database.getById("reservations", id);
  const d = readCheckoutForm();

  const result = performCheckOut(id, draftToData(d));
  if (!result.ok) {
    checkoutPanel.draft = d;
    showCheckoutPage(notAllowedHtml(result.errors, "CHECK-OUT NOT ALLOWED"));
    return;
  }

  checkoutPanel = null;
  const roomStatus = getRoomStatusAfterCheckout();
  showCheckoutPage(
    messageHtml("ok", getReservationGuestName(r) + " is checked out of Room " + getReservationRoomNumber(r) +
      ". Reservation " + r.reservation_no + ": Checked-out. Room status: " + roomStatus + ".") +
    '<p><button class="btn" onclick="openReceipt(' + result.record.checkout_id + ')">View Receipt</button></p>'
  );
}
