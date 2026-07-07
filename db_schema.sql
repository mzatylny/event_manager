-- ===== START PERSONALLY WRITTEN CODE =====

-- Enable SQLite foreign key behaviour so related booking records follow event/booking changes.
PRAGMA foreign_keys = ON;

-- Rebuild the database from a clean state each time npm run build-db is executed.
-- The order matters because child tables must be dropped before parent tables.
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS booking_tickets;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS settings;

-- Stores the organiser-facing site name and description shown on organiser and attendee pages.
CREATE TABLE settings (
    setting_id INTEGER PRIMARY KEY CHECK (setting_id = 1),
    site_name TEXT NOT NULL,
    site_description TEXT NOT NULL
);

-- Stores events created by the organiser.
-- status separates draft events from published events.
-- ticket quantity and price columns support the required two ticket types.
CREATE TABLE events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    event_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT,
    full_price_quantity INTEGER NOT NULL DEFAULT 0 CHECK (full_price_quantity >= 0),
    full_price_price REAL NOT NULL DEFAULT 0 CHECK (full_price_price >= 0),
    concession_quantity INTEGER NOT NULL DEFAULT 0 CHECK (concession_quantity >= 0),
    concession_price REAL NOT NULL DEFAULT 0 CHECK (concession_price >= 0)
);

-- Extension table: one row per attendee booking.
-- booking_reference gives attendees a simple reference they can use for lookup/cancellation.
CREATE TABLE bookings (
    booking_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    attendee_name TEXT NOT NULL,
    booking_reference TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
    booked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TEXT,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
);

-- Extension table: stores the ticket lines inside a booking.
-- This keeps full-price and concession tickets separate and supports revenue calculations.
CREATE TABLE booking_tickets (
    booking_ticket_id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    ticket_type TEXT NOT NULL CHECK (ticket_type IN ('full_price', 'concession')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price REAL NOT NULL CHECK (unit_price >= 0),
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE
);

-- Extension table: records important system actions for organiser review.
-- It provides evidence of server-side behaviour in the video/report.
CREATE TABLE audit_log (
    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    event_id INTEGER,
    details TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE SET NULL
);

-- Seed data: initial site settings used immediately after building the database.
INSERT INTO settings (setting_id, site_name, site_description)
VALUES (1, 'Community Event Manager', 'Talks, workshops and local events for everyone.');

-- Seed data: a published event so the attendee flow can be tested immediately.
INSERT INTO events (
    title,
    description,
    event_date,
    status,
    created_at,
    updated_at,
    published_at,
    full_price_quantity,
    full_price_price,
    concession_quantity,
    concession_price
)
VALUES (
    'Introductory Art Talk',
    'A short public talk introducing the current exhibition and the stories behind selected artworks.',
    '2026-05-20 18:00',
    'published',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    30,
    12.00,
    10,
    6.00
);

-- Seed data: a draft event so the organiser draft/publish workflow can be tested immediately.
INSERT INTO events (
    title,
    description,
    event_date,
    status,
    full_price_quantity,
    full_price_price,
    concession_quantity,
    concession_price
)
VALUES (
    'Draft Workshop',
    'This event is still being prepared by the organiser.',
    '2026-06-03 14:00',
    'draft',
    20,
    15.00,
    5,
    8.00
);
-- ===== END PERSONALLY WRITTEN CODE =====
