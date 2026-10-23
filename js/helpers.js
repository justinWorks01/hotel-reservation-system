/* ==========================================
   HELPER FUNCTIONS (js/helpers.js)
   Small tools used by many pages.
   ========================================== */

// Makes text safe to show inside HTML (stops typed "<" or quotes from breaking the page)
function escapeHtml(text) {
  if (text === undefined || text === null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 3500 -> "₱3,500"
function formatPeso(amount) {
  return "₱" + Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// "2026-09-10" -> "September 10, 2026"
function formatDate(dateText) {
  const date = new Date(dateText + "T00:00:00");
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// Form inputs always give text. This turns it into a number.
// An empty box stays "" so the "required" rule can catch it.
function toNumber(text) {
  if (text === undefined || text === null || String(text).trim() === "") return "";
  return Number(text);
}

// Number of nights between two dates ("YYYY-MM-DD")
function countNights(checkIn, checkOut) {
  const start = new Date(checkIn + "T00:00:00");
  const end = new Date(checkOut + "T00:00:00");
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

// Makes a green (type "ok") or red (type "error") message.
// "content" can be a text or a list of texts.
function messageHtml(type, content) {
  const list = Array.isArray(content) ? content : [content];
  return '<p class="msg-' + type + '">' + list.map(escapeHtml).join("<br>") + '</p>';
}

// Colored label for a status, e.g. Available, Active, Maintenance
function statusBadge(text) {
  return '<span class="status status-' + String(text).toLowerCase() + '">' + escapeHtml(text) + '</span>';
}

// A room is active unless it was deactivated
function isRoomActive(room) {
  return room.active_status !== "Inactive";
}
