/* Stage 10 - Reservation Confirmation
   Uses the existing Database, validation, and display helpers from the project.
   Load after reservations.js.
*/
function showStage10Page(message) {
  const rows = Database.getAll("reservations")
    .filter(r => ["Pending", "Confirmed"].includes(r.status))
    .sort((a, b) => b.reservation_id - a.reservation_id);

  let html = '<div class="panel"><h2>STAGE 10 - RESERVATION CONFIRMATION</h2>';
  if (message) html += '<div class="message-area">' + message + '</div>';
  html += '<p>Review pending reservations, confirm valid bookings, cancel bookings, or record no-shows.</p>';
  html += '<table class="data-table"><thead><tr>' +
    '<th>Reservation</th><th>Guest</th><th>Room</th><th>Dates</th><th>Status</th><th>Actions</th>' +
    '</tr></thead><tbody>';

  if (!rows.length) {
    html += '<tr><td colspan="6">No pending or confirmed reservations.</td></tr>';
  }

  rows.forEach(r => {
    let actions = '<button class="btn-small" onclick="viewReservation(' + r.reservation_id + ')">View</button> ';
    if (r.status === "Pending") {
      actions += '<button class="btn-small" onclick="stage10Confirm(' + r.reservation_id + ')">Confirm</button> ';
    }
    if (r.status === "Confirmed") {
      actions += '<button class="btn-small btn-secondary" onclick="stage10NoShow(' + r.reservation_id + ')">No-show</button> ';
    }
    actions += '<button class="btn-small btn-secondary" onclick="stage10Cancel(' + r.reservation_id + ')">Cancel</button>';

    html += '<tr><td><strong>' + escapeHtml(r.reservation_no) + '</strong></td>' +
      '<td>' + escapeHtml(getReservationGuestName(r)) + '</td>' +
      '<td>Room ' + escapeHtml(getReservationRoomNumber(r)) + '</td>' +
      '<td>' + escapeHtml(formatDateRange(r.check_in_date, r.check_out_date)) + '</td>' +
      '<td>' + statusBadge(r.status) + '</td><td class="actions">' + actions + '</td></tr>';
  });

  html += '</tbody></table></div>';
  contentArea.innerHTML = html;
}

function stage10Confirm(id) {
  const r = Database.getById("reservations", id);
  if (!r || r.status !== "Pending") {
    showStage10Page(messageHtml("error", "Only Pending reservations can be confirmed."));
    return;
  }
  const errors = validateReservation(inputFromRecord(r), id, false);
  if (errors.length) {
    showStage10Page(notAllowedHtml(errors, "CANNOT CONFIRM " + r.reservation_no));
    return;
  }
  const result = Database.update("reservations", id, { status: "Confirmed" });
  showStage10Page(result.ok
    ? messageHtml("ok", "Reservation " + r.reservation_no + " is now Confirmed.")
    : messageHtml("error", result.errors));
}

function stage10Cancel(id) {
  const r = Database.getById("reservations", id);
  if (!r || !["Pending", "Confirmed"].includes(r.status)) return;
  if (!confirm("Cancel reservation " + r.reservation_no + "?")) return;
  const result = Database.update("reservations", id, { status: "Cancelled" });
  showStage10Page(result.ok
    ? messageHtml("ok", "Reservation " + r.reservation_no + " is now Cancelled.")
    : messageHtml("error", result.errors));
}

function stage10NoShow(id) {
  const r = Database.getById("reservations", id);
  if (!r || r.status !== "Confirmed") return;
  if (r.check_in_date > todayText()) {
    showStage10Page(messageHtml("error", "A no-show can only be recorded on or after the check-in date (" +
      formatDate(r.check_in_date) + ")."));
    return;
  }
  if (!confirm("Mark reservation " + r.reservation_no + " as a no-show?")) return;
  const result = Database.update("reservations", id, { status: "No-show" });
  showStage10Page(result.ok
    ? messageHtml("ok", "Reservation " + r.reservation_no + " is now No-show.")
    : messageHtml("error", result.errors));
}
