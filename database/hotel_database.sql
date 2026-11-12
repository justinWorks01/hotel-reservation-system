CREATE DATABASE IF NOT EXISTS hotel_reservation_db;
USE hotel_reservation_db;

CREATE TABLE room_types (
  room_type_id  INT AUTO_INCREMENT PRIMARY KEY,
  type_name     VARCHAR(50)   NOT NULL UNIQUE,
  description   VARCHAR(255),
  base_rate     DECIMAL(10,2) NOT NULL CHECK (base_rate >= 0),
  capacity      INT           NOT NULL CHECK (capacity >= 1),
  status        ENUM('Active','Inactive') NOT NULL DEFAULT 'Active'
);

CREATE TABLE rooms (
  room_id       INT AUTO_INCREMENT PRIMARY KEY,
  room_number   VARCHAR(10)   NOT NULL UNIQUE,
  room_type_id  INT           NOT NULL,
  floor         INT           NOT NULL CHECK (floor >= 1),
  capacity      INT           NOT NULL CHECK (capacity >= 1),
  rate          DECIMAL(10,2) NOT NULL CHECK (rate >= 0),
  status        ENUM('Available','Reserved','Occupied','Cleaning','Maintenance') NOT NULL DEFAULT 'Available',
  active_status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  FOREIGN KEY (room_type_id) REFERENCES room_types(room_type_id)
);

CREATE TABLE guests (
  guest_id                 INT AUTO_INCREMENT PRIMARY KEY,
  guest_no                 VARCHAR(20)  NOT NULL UNIQUE CHECK (guest_no REGEXP '^G-[0-9]{4,}$'),
  first_name               VARCHAR(50)  NOT NULL,
  last_name                VARCHAR(50)  NOT NULL,
  contact_no               VARCHAR(20)  NOT NULL CHECK (contact_no REGEXP '^(09|[+]639)[0-9]{9}$'),
  email                    VARCHAR(100) CHECK (email IS NULL OR email = '' OR email REGEXP '^[^ @]+@[^ @]+[.][^ @]+$'),
  address                  VARCHAR(255),
  identification_type      VARCHAR(50),
  identification_reference VARCHAR(100),
  active_status            ENUM('Active','Inactive') NOT NULL DEFAULT 'Active'
);

CREATE TABLE reservations (
  reservation_id   INT AUTO_INCREMENT PRIMARY KEY,
  reservation_no   VARCHAR(20)   NOT NULL UNIQUE,
  guest_id         INT           NOT NULL,
  room_id          INT           NOT NULL,
  reservation_date DATE          NOT NULL,
  check_in_date    DATE          NOT NULL,
  check_out_date   DATE          NOT NULL,
  number_of_guests INT           NOT NULL CHECK (number_of_guests >= 1),
  total_amount     DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
  status           ENUM('Pending','Confirmed','Checked-in','Checked-out','Cancelled','No-show') NOT NULL DEFAULT 'Pending',
  CHECK (check_out_date > check_in_date),
  FOREIGN KEY (guest_id) REFERENCES guests(guest_id),
  FOREIGN KEY (room_id)  REFERENCES rooms(room_id)
);

CREATE TABLE check_ins (
  check_in_id     INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id  INT      NOT NULL,
  actual_check_in DATETIME NOT NULL,
  room_id         INT      NOT NULL,
  guest_count     INT      NOT NULL CHECK (guest_count >= 1),
  status          ENUM('Checked-in') NOT NULL DEFAULT 'Checked-in',
  FOREIGN KEY (reservation_id) REFERENCES reservations(reservation_id),
  FOREIGN KEY (room_id)        REFERENCES rooms(room_id)
);

CREATE TABLE billing (
  bill_id         INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id  INT           NOT NULL,
  guest_id        INT           NOT NULL,
  room_charges    DECIMAL(10,2) NOT NULL CHECK (room_charges >= 0),
  service_charges DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (service_charges >= 0),
  discounts       DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (discounts >= 0),
  taxes           DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (taxes >= 0),
  total_amount    DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
  amount_paid     DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  balance         DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  FOREIGN KEY (reservation_id) REFERENCES reservations(reservation_id),
  FOREIGN KEY (guest_id)       REFERENCES guests(guest_id)
);

CREATE TABLE check_outs (
  checkout_id    INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT           NOT NULL,
  bill_id        INT           NOT NULL,
  checkout_date  DATETIME      NOT NULL,
  final_amount   DECIMAL(10,2) NOT NULL CHECK (final_amount >= 0),
  payment_status ENUM('Paid','Balance') NOT NULL,
  remarks        VARCHAR(255),
  FOREIGN KEY (reservation_id) REFERENCES reservations(reservation_id),
  FOREIGN KEY (bill_id)        REFERENCES billing(bill_id)
);

CREATE TABLE users (
  user_id  INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50)  NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role     ENUM('Administrator','Manager','Receptionist') NOT NULL,
  status   ENUM('Active','Inactive') NOT NULL DEFAULT 'Active'
);
