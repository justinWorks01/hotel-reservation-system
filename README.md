# Hotel Reservation System

Software Engineering - Construction Phase (one continuous project).

## Technologies
- HTML, CSS, JavaScript (no framework needed)
- Database: browser localStorage, designed with the tables from Stage 2
  (an equivalent SQL script is in `database/hotel_database.sql`)

## Folder Structure
```
hotel-reservation-system/
├── index.html            <- main page (layout)
├── README.md
├── css/
│   └── style.css         <- all styling
├── js/
│   ├── schema.js         <- database design: tables, keys, constraints (Stage 2)
│   ├── database.js       <- connection + insert/update/delete with validation
│   ├── database-page.js  <- "Database" page: data dictionary, sample data, tests
│   └── app.js            <- menu, pages, dashboard, logout
├── database/
│   └── hotel_database.sql  <- SQL version of the same design
└── images/
```

## How to Run
Open `index.html` in a web browser (or use the VS Code "Live Server" extension).
Open the **Database** menu to load sample data and run the constraint tests.

## Entity Relationship Diagram
```mermaid
erDiagram
  room_types   ||--o{ rooms        : "has"
  guests       ||--o{ reservations : "makes"
  rooms        ||--o{ reservations : "is reserved in"
  reservations ||--o| check_ins    : "becomes"
  rooms        ||--o{ check_ins    : "hosts"
  reservations ||--o{ billing      : "is billed in"
  guests       ||--o{ billing      : "pays"
  reservations ||--o| check_outs   : "ends with"
  billing      ||--o| check_outs   : "settled by"
```
(The `users` table is separate; it is used for login and roles.)
