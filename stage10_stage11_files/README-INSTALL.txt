STAGE 10 AND STAGE 11 INSTALLATION

1. Copy js/stage10.js and js/stage11.js into your project's js folder.
2. Replace your existing index.html with the included index.html.
3. Replace your existing js/app.js with the included js/app.js.
4. Keep all your other existing project files unchanged.
5. Open index.html using VS Code Live Server.

The new sidebar entries are:
- Stage 10 - Confirmation
- Stage 11 - Search & History

IMPORTANT:
These modules rely on the existing project files and helpers:
Database, reservations.js, helpers.js, schema.js, and the existing CSS.
Do not delete reservations.js. Stage 10 and Stage 11 are separate views
that use the same reservation records and localStorage database.

The uploaded README describes Stage 10 as confirmation (Pending -> Confirmed,
recheck before confirming, Cancel and No-show) and Stage 11 as search/history
(reservation number, guest, room, status, and date range).
