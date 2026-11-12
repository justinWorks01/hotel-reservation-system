function escapeHtml(text) {
  if (text === undefined || text === null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPeso(amount) {
  return "₱" + Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatDate(dateText) {
  const date = new Date(dateText + "T00:00:00");
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function toNumber(text) {
  if (text === undefined || text === null || String(text).trim() === "") return "";
  return Number(text);
}

function countNights(checkIn, checkOut) {
  const start = new Date(checkIn + "T00:00:00");
  const end = new Date(checkOut + "T00:00:00");
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function messageHtml(type, content) {
  const list = Array.isArray(content) ? content : [content];
  return '<p class="msg-' + type + '">' + list.map(escapeHtml).join("<br>") + '</p>';
}

function statusBadge(text) {
  return '<span class="status status-' + String(text).toLowerCase() + '">' + escapeHtml(text) + '</span>';
}

function isRoomActive(room) {
  return room.active_status !== "Inactive";
}

function formatDateRange(checkIn, checkOut) {
  const start = new Date(checkIn + "T00:00:00");
  const end = new Date(checkOut + "T00:00:00");
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return start.toLocaleDateString("en-US", { month: "long" }) + " " + start.getDate() +
           "–" + end.getDate() + ", " + start.getFullYear();
  }
  return formatDate(checkIn) + " – " + formatDate(checkOut);
}

function formatDateTime(text) {
  return new Date(text).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function todayText() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + month + "-" + day;
}

function nowLocalText() {
  const d = new Date();
  const pad = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
