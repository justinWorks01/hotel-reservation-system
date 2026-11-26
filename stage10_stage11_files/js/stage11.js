/* Stage 11 - Reservation Search and History
   Uses the existing reservation, guest, room, and formatting helpers.
*/
let stage11Search = "";
let stage11Status = "All";
let stage11From = "";
let stage11To = "";

function showStage11Page() {
  const statuses = ["All"].concat(SCHEMA.reservations.fields.status.allowed);
  let options = statuses.map(s =>
    '<option value="' + escapeHtml(s) + '"' + (s === stage11Status ? ' selected' : '') + '>' +
    (s === "All" ? "All statuses" : escapeHtml(s)) + '</option>'
  ).join("");

  contentArea.innerHTML =
    '<div class="panel"><h2>STAGE 11 - RESERVATION SEARCH AND HISTORY</h2>' +
    '<div class="toolbar">' +
    '<input id="s11-search" class="input" type="text" placeholder="Search reservation number, guest, or room..." value="' +
      escapeHtml(stage11Search) + '" oninput="filterStage11()">' +
    '<select id="s11-status" class="input" onchange="filterStage11()">' + options + '</select>' +
    '<label class="inline-label">From <input id="s11-from" class="input" type="date" value="' +
      escapeHtml(stage11From) + '" onchange="filterStage11()"></label>' +
    '<label class="inline-label">To <input id="s11-to" class="input" type="date" value="' +
      escapeHtml(stage11To) + '" onchange="filterStage11()"></label>' +
    '</div>' +
    '<table class="data-table"><thead><tr><th>Reservation</th><th>Guest</th><th>Room</th>' +
    '<th>Dates</th><th>Guests</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>' +
    '<tbody id="s11-rows">' + buildStage11Rows() + '</tbody></table></div>';
}

function buildStage11Rows() {
  const keyword = stage11Search.toLowerCase();
  const rows = Database.getAll("reservations").filter(r => {
    const searchable = (r.reservation_no + " " + getReservationGuestName(r) +
      " room " + getReservationRoomNumber(r)).toLowerCase();
    return searchable.includes(keyword) &&
      (stage11Status === "All" || r.status === stage11Status) &&
      (!stage11From || r.check_out_date >= stage11From) &&
      (!stage11To || r.check_in_date <= stage11To);
  }).sort((a, b) => b.reservation_id - a.reservation_id);

  if (!rows.length) return '<tr><td colspan="8">No reservations found.</td></tr>';

  return rows.map(r =>
    '<tr><td><strong>' + escapeHtml(r.reservation_no) + '</strong></td>' +
    '<td>' + escapeHtml(getReservationGuestName(r)) + '</td>' +
    '<td>Room ' + escapeHtml(getReservationRoomNumber(r)) + '</td>' +
    '<td>' + escapeHtml(formatDateRange(r.check_in_date, r.check_out_date)) + '</td>' +
    '<td>' + r.number_of_guests + '</td><td>' + formatPeso(r.total_amount) + '</td>' +
    '<td>' + statusBadge(r.status) + '</td>' +
    '<td><button class="btn-small" onclick="viewReservation(' + r.reservation_id + ')">View</button></td></tr>'
  ).join("");
}

function filterStage11() {
  stage11Search = document.getElementById("s11-search").value;
  stage11Status = document.getElementById("s11-status").value;
  stage11From = document.getElementById("s11-from").value;
  stage11To = document.getElementById("s11-to").value;
  document.getElementById("s11-rows").innerHTML = buildStage11Rows();
}
