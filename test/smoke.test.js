/* ===== START ASSISTED CODE SECTION ===== */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const tempDb = path.join(projectRoot, 'test_database.db');

function query(sql) {
    return execFileSync('sqlite3', [tempDb, sql], { cwd: projectRoot }).toString().trim();
}

try {
    if (fs.existsSync(tempDb)) fs.rmSync(tempDb);
    const schema = fs.readFileSync(path.join(projectRoot, 'db_schema.sql'));
    execFileSync('sqlite3', [tempDb], { input: schema, cwd: projectRoot });

    const tableCount = query("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('settings','events','bookings','booking_tickets','audit_log');");
    assert.strictEqual(tableCount, '5', 'all required database tables should be created');

    const settingsCount = query('SELECT COUNT(*) FROM settings WHERE setting_id = 1;');
    assert.strictEqual(settingsCount, '1', 'settings seed row should exist');

    const publishedCount = query("SELECT COUNT(*) FROM events WHERE status = 'published';");
    const draftCount = query("SELECT COUNT(*) FROM events WHERE status = 'draft';");
    assert.ok(Number(publishedCount) >= 1, 'at least one published event should be seeded');
    assert.ok(Number(draftCount) >= 1, 'at least one draft event should be seeded');

    execFileSync('sqlite3', [tempDb, "INSERT INTO bookings (event_id, attendee_name, booking_reference, status) VALUES (1, 'Test Attendee', 'BK-TEST0001', 'confirmed');"], { cwd: projectRoot });
    execFileSync('sqlite3', [tempDb, "INSERT INTO booking_tickets (booking_id, ticket_type, quantity, unit_price) VALUES (1, 'full_price', 2, 12.00);"], { cwd: projectRoot });

    const soldTickets = query("SELECT COALESCE(SUM(booking_tickets.quantity), 0) FROM bookings JOIN booking_tickets ON booking_tickets.booking_id = bookings.booking_id WHERE bookings.event_id = 1 AND bookings.status = 'confirmed';");
    assert.strictEqual(soldTickets, '2', 'confirmed ticket totals should be calculable');

    console.log('Smoke tests passed.');
} finally {
    if (fs.existsSync(tempDb)) fs.rmSync(tempDb);
}
/* ===== END ASSISTED CODE SECTION ===== */
