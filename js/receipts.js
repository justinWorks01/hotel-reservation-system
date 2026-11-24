let receiptPanel = null;
let receiptSearch = "";
let receiptFrom = "";
let receiptTo = "";

function receiptNumber(checkOut) {
  return "REC-" + String(checkOut.checkout_id).padStart(4, "0");
}

function getReceiptData(checkoutId) {
  const checkOut = Database.getById("check_outs", checkoutId);
  const r = Database.getById("reservations", checkOut.reservation_id);
  const bill = Database.getById("billing", checkOut.bill_id);
  const guest = Database.getById("guests", r.guest_id);
  const room = Database.getById("rooms", r.room_id);

  return {
    checkOut: checkOut,
    receiptNo: receiptNumber(checkOut),
    reservation: r,
    bill: bill,
    guestName: guest ? getGuestName(guest) : "?",
    roomNumber: room ? room.room_number : "?",
    stay: computeRoomCharge(r),
    services: getCharges(r.reservation_id),
    payments: Database.getAll("payments").filter(function (p) { return p.bill_id === bill.bill_id; }),
    checkoutDay: checkOut.checkout_date.slice(0, 10)
  };
}

function showReceiptsPage(message) {
  let html = "";
  if (message) html += '<div class="message-area">' + message + '</div>';
  if (receiptPanel) html += buildReceiptPanel();

  html += '<div class="panel">' +
    '<h2>PREVIOUS RECEIPTS</h2>' +
    '<div class="toolbar">' +
      '<input type="text" id="rc-search" class="input" placeholder="Search receipt, guest, room, bill, payment no. or reference..." ' +
        'value="' + escapeHtml(receiptSearch) + '" oninput="filterReceipts()">' +
      '<label class="inline-label">From <input type="date" id="rc-from" class="input" value="' + escapeHtml(receiptFrom) + '" onchange="filterReceipts()"></label>' +
      '<label class="inline-label">To <input type="date" id="rc-to" class="input" value="' + escapeHtml(receiptTo) + '" onchange="filterReceipts()"></label>' +
    '</div>' +
    '<table class="data-table">' +
      '<thead><tr><th>Receipt</th><th>Guest</th><th>Room</th><th>Check-out</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead>' +
      '<tbody id="rc-rows">' + buildReceiptRows() + '</tbody>' +
    '</table>' +
  '</div>';

  contentArea.innerHTML = html;
}

function buildReceiptRows() {
  const keyword = receiptSearch.toLowerCase();

  const rows = Database.getAll("check_outs").map(function (c) { return getReceiptData(c.checkout_id); }).filter(function (d) {
    const paymentText = d.payments.map(function (p) { return p.payment_no + " " + (p.reference || ""); }).join(" ");
    const text = (d.receiptNo + " " + d.guestName + " room " + d.roomNumber + " " + d.reservation.reservation_no + " " +
                  d.bill.bill_no + " " + paymentText).toLowerCase();
    const matchesFrom = !receiptFrom || d.checkoutDay >= receiptFrom;
    const matchesTo = !receiptTo || d.checkoutDay <= receiptTo;
    return text.indexOf(keyword) !== -1 && matchesFrom && matchesTo;
  });

  rows.sort(function (a, b) { return b.checkOut.checkout_id - a.checkOut.checkout_id; });

  if (rows.length === 0) return '<tr><td colspan="9">No receipts found.</td></tr>';

  let html = "";
  rows.forEach(function (d) {
    const id = d.checkOut.checkout_id;
    html += '<tr>' +
      '<td><strong>' + escapeHtml(d.receiptNo) + '</strong></td>' +
      '<td>' + escapeHtml(d.guestName) + '</td>' +
      '<td>Room ' + escapeHtml(d.roomNumber) + '</td>' +
      '<td>' + escapeHtml(formatDateTime(d.checkOut.checkout_date)) + '</td>' +
      '<td>' + formatPeso(d.bill.total_amount) + '</td>' +
      '<td>' + formatPeso(d.bill.amount_paid) + '</td>' +
      '<td>' + formatPeso(d.bill.balance) + '</td>' +
      '<td>' + statusBadge(d.bill.payment_status) + '</td>' +
      '<td class="actions">' +
        '<button class="btn-small" onclick="openReceipt(' + id + ')">View</button> ' +
        '<button class="btn-small" onclick="printReceipt(' + id + ')">Print</button> ' +
        '<button class="btn-small" onclick="downloadReceiptPdf(' + id + ')">PDF</button>' +
      '</td>' +
    '</tr>';
  });
  return html;
}

function filterReceipts() {
  receiptSearch = document.getElementById("rc-search").value;
  receiptFrom = document.getElementById("rc-from").value;
  receiptTo = document.getElementById("rc-to").value;
  document.getElementById("rc-rows").innerHTML = buildReceiptRows();
}

function openReceipt(checkoutId) {
  receiptPanel = { id: checkoutId };
  showPage("receipts");
}

function closeReceipt() {
  receiptPanel = null;
  showReceiptsPage();
}

function printReceipt(checkoutId) {
  receiptPanel = { id: checkoutId };
  showReceiptsPage();
  window.print();
}

function receiptLineHtml(label, value, extraClass) {
  return '<div class="receipt-line ' + (extraClass || "") + '"><span>' + label + '</span><span>' + value + '</span></div>';
}

function buildReceiptPanel() {
  const d = getReceiptData(receiptPanel.id);
  const b = d.bill;
  const subtotal = round2(b.room_charges + b.service_charges);

  let html = '<div class="panel"><div class="receipt-box receipt-print">' +
    '<div class="receipt-title">HOTEL RECEIPT</div>' +
    '<div class="receipt-rule"></div>' +
    receiptLineHtml('Receipt No.:', escapeHtml(d.receiptNo)) +
    receiptLineHtml('Guest:', escapeHtml(d.guestName)) +
    receiptLineHtml('Room:', escapeHtml(d.roomNumber)) +
    receiptLineHtml('Reservation:', escapeHtml(d.reservation.reservation_no)) +
    receiptLineHtml('Bill No.:', escapeHtml(b.bill_no)) +
    receiptLineHtml('Stay:', escapeHtml(formatDateRange(d.stay.start, d.stay.end))) +
    '<div class="receipt-rule"></div>' +
    receiptLineHtml('Room Charges', formatPeso(b.room_charges));

  d.services.forEach(function (c) {
    html += receiptLineHtml(escapeHtml(c.service_type) + (c.quantity > 1 ? ' x' + c.quantity : ''), formatPeso(c.amount));
  });

  html += receiptLineHtml('Subtotal', formatPeso(subtotal)) +
    receiptLineHtml('Discount', formatPeso(b.discounts)) +
    receiptLineHtml('Taxes (' + b.tax_rate + '%)', formatPeso(b.taxes)) +
    '<div class="receipt-rule"></div>' +
    receiptLineHtml('Total Bill:', formatPeso(b.total_amount), 'strong') +
    receiptLineHtml('Amount Paid:', formatPeso(b.amount_paid)) +
    receiptLineHtml('Balance:', formatPeso(b.balance)) +
    receiptLineHtml('Payment Status:', escapeHtml(b.payment_status.toUpperCase()), 'strong') +
    receiptLineHtml('Check-out:', escapeHtml(formatDate(d.checkoutDay)));

  if (d.payments.length > 0) {
    html += '<div class="receipt-rule"></div>';
    d.payments.forEach(function (p) {
      html += receiptLineHtml(escapeHtml(p.payment_no + ' ' + p.method), formatPeso(p.amount));
    });
  }

  html += '<div class="receipt-rule"></div>' +
    '<div class="receipt-thanks">Thank you for staying with us!</div>' +
  '</div>' +
  '<button class="btn" onclick="window.print()">Print Receipt</button> ' +
  '<button class="btn" onclick="downloadReceiptPdf(' + receiptPanel.id + ')">Download PDF</button> ' +
  '<button class="btn btn-secondary" onclick="closeReceipt()">Close</button></div>';

  return html;
}

function pdfPeso(amount) {
  return "PHP " + Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function receiptLines(d) {
  const width = 44;
  const bar = "-".repeat(width);
  const row = function (label, value) {
    return label + " ".repeat(Math.max(1, width - label.length - value.length)) + value;
  };
  const b = d.bill;
  const title = "HOTEL RECEIPT";

  const lines = [
    " ".repeat(Math.floor((width - title.length) / 2)) + title,
    bar,
    "Receipt No.: " + d.receiptNo,
    "Guest: " + d.guestName,
    "Room: " + d.roomNumber,
    "Reservation: " + d.reservation.reservation_no,
    "Bill No.: " + b.bill_no,
    "Stay: " + formatDateRange(d.stay.start, d.stay.end).replace(/\u2013/g, "-"),
    bar,
    row("Room Charges", pdfPeso(b.room_charges))
  ];

  d.services.forEach(function (c) {
    lines.push(row(c.service_type + (c.quantity > 1 ? " x" + c.quantity : ""), pdfPeso(c.amount)));
  });

  lines.push(row("Subtotal", pdfPeso(round2(b.room_charges + b.service_charges))));
  lines.push(row("Discount", pdfPeso(b.discounts)));
  lines.push(row("Taxes (" + b.tax_rate + "%)", pdfPeso(b.taxes)));
  lines.push(bar);
  lines.push(row("Total Bill:", pdfPeso(b.total_amount)));
  lines.push(row("Amount Paid:", pdfPeso(b.amount_paid)));
  lines.push(row("Balance:", pdfPeso(b.balance)));
  lines.push("Payment Status: " + b.payment_status.toUpperCase());
  lines.push("Check-out: " + formatDate(d.checkoutDay));

  if (d.payments.length > 0) {
    lines.push(bar);
    d.payments.forEach(function (p) {
      lines.push(row(p.payment_no + " " + p.method, pdfPeso(p.amount)));
    });
  }

  lines.push(bar);
  lines.push("Thank you for staying with us!");
  return lines;
}

function pdfSafe(text) {
  return String(text)
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildPdf(lines) {
  const perPage = 50;
  const pages = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  if (pages.length === 0) pages.push([""]);

  const fontNumber = 3 + pages.length * 2;
  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [" + pages.map(function (p, i) { return (3 + i * 2) + " 0 R"; }).join(" ") + "] /Count " + pages.length + " >>";

  pages.forEach(function (pageLines, i) {
    const pageNumber = 3 + i * 2;
    const contentNumber = pageNumber + 1;
    let stream = "BT\n/F1 11 Tf\n14 TL\n50 780 Td\n";
    pageLines.forEach(function (line) {
      stream += "(" + pdfSafe(line) + ") Tj\nT*\n";
    });
    stream += "ET";
    objects[pageNumber] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents " + contentNumber +
      " 0 R /Resources << /Font << /F1 " + fontNumber + " 0 R >> >> >>";
    objects[contentNumber] = "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream";
  });
  objects[fontNumber] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>";

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let n = 1; n <= fontNumber; n++) {
    offsets[n] = pdf.length;
    pdf += n + " 0 obj\n" + objects[n] + "\nendobj\n";
  }

  const xrefAt = pdf.length;
  pdf += "xref\n0 " + (fontNumber + 1) + "\n0000000000 65535 f \n";
  for (let n = 1; n <= fontNumber; n++) {
    pdf += String(offsets[n]).padStart(10, "0") + " 00000 n \n";
  }
  pdf += "trailer\n<< /Size " + (fontNumber + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefAt + "\n%%EOF";
  return pdf;
}

function downloadReceiptPdf(checkoutId) {
  const d = getReceiptData(checkoutId);
  const blob = new Blob([buildPdf(receiptLines(d))], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "Receipt-" + d.receiptNo + ".pdf";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
