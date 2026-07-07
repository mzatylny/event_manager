/* ===== START PERSONALLY WRITTEN CODE ===== */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Returns the SQLite database connection stored globally by index.js.
function getDb() {
    return global.db;
}

// Promise wrapper for db.get: used when a query should return one row.
function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDb().get(sql, params, (err, row) => err ? reject(err) : resolve(row));
    });
}

// Promise wrapper for db.all: used when a query should return multiple rows.
function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDb().all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
    });
}

// Promise wrapper for db.run: used for INSERT, UPDATE, DELETE and transactions.
function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDb().run(sql, params, function callback(err) {
            err ? reject(err) : resolve(this);
        });
    });
}

async function writeAudit(action, eventId, details) {
    // Purpose: Stores attendee booking actions in the audit log.
    // Inputs: action label, optional event id and details string.
    // Outputs: One new audit_log row.
    await run(
        'INSERT INTO audit_log (action, event_id, details) VALUES (?, ?, ?)',
        [action, eventId || null, details]
    );
}

// Validates quantity fields as non-negative whole numbers before booking.
function toWholeNumber(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+$/.test(text)) return NaN;
    return Number(text);
}

// Generates a short booking reference for attendee lookup.
function makeBookingReference() {
    return 'BK-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function makeUniqueBookingReference(maxAttempts = 5) {
    // Purpose: Generates a public booking reference and checks it is not already used.
    // Inputs: maximum number of attempts.
    // Outputs: One unused booking reference, or an error if all attempts collide.
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const reference = makeBookingReference();
        const existing = await get('SELECT booking_id FROM bookings WHERE booking_reference = ?', [reference]);
        if (!existing) return reference;
    }

    throw new Error('Could not generate a unique booking reference.');
}

async function getPublishedEventWithAvailability(eventId) {
    // Purpose: Retrieves one published event and calculates confirmed ticket sales.
    // Inputs: event id from URL.
    // Outputs: Event data with remaining ticket values.
    const event = await get(`
        SELECT
            events.*,
            COALESCE(SUM(CASE WHEN bookings.status = 'confirmed' AND booking_tickets.ticket_type = 'full_price' THEN booking_tickets.quantity ELSE 0 END), 0) AS full_price_sold,
            COALESCE(SUM(CASE WHEN bookings.status = 'confirmed' AND booking_tickets.ticket_type = 'concession' THEN booking_tickets.quantity ELSE 0 END), 0) AS concession_sold
        FROM events
        LEFT JOIN bookings ON bookings.event_id = events.event_id
        LEFT JOIN booking_tickets ON booking_tickets.booking_id = bookings.booking_id
        WHERE events.event_id = ? AND events.status = 'published'
        GROUP BY events.event_id
    `, [eventId]);

    if (!event) return null;
    event.full_price_remaining = event.full_price_quantity - event.full_price_sold;
    event.concession_remaining = event.concession_quantity - event.concession_sold;
    return event;
}

// Purpose: Renders the Attendee Home Page with published events only.
// Inputs: HTTP GET request to /attendee.
// Outputs: attendee/home.ejs populated with current settings and ordered published events.
router.get('/', async (req, res, next) => {
    try {
        // Purpose: Retrieves current site settings for attendee display.
        // Inputs: none.
        // Outputs: One settings row.
        const settings = await get('SELECT * FROM settings WHERE setting_id = 1');

        // Purpose: Retrieves published events ordered by event date.
        // Inputs: none.
        // Outputs: Published event rows for attendees.
        const events = await all(`
            SELECT *
            FROM events
            WHERE status = 'published'
            ORDER BY event_date ASC
        `);

        res.render('attendee/home', {
            title: 'Attendee Home Page',
            active: 'attendee',
            settings,
            events
        });
    } catch (err) {
        next(err);
    }
});

// Purpose: Renders the attendee booking lookup page.
// Inputs: HTTP GET request to /attendee/booking-lookup.
// Outputs: attendee/lookup.ejs with an empty lookup form.
router.get('/booking-lookup', (req, res) => {
    res.render('attendee/lookup', {
        title: 'Booking Lookup',
        active: 'attendee',
        errors: []
    });
});

// Purpose: Accepts a booking reference and redirects to its detail page.
// Inputs: HTTP POST form with booking_reference.
// Outputs: Redirect to attendee booking page or validation error.
router.post('/booking-lookup', (req, res) => {
    const bookingReference = String(req.body.booking_reference || '').trim().toUpperCase();
    if (!bookingReference) {
        return res.status(400).render('attendee/lookup', {
            title: 'Booking Lookup',
            active: 'attendee',
            errors: ['Booking reference is required.']
        });
    }
    res.redirect(`/attendee/bookings/${encodeURIComponent(bookingReference)}`);
});

// Purpose: Renders one attendee event page with ticket types, prices and availability.
// Inputs: HTTP GET request with event id URL parameter.
// Outputs: attendee/event.ejs populated with event details and booking form.
router.get('/events/:id', async (req, res, next) => {
    try {
        const event = await getPublishedEventWithAvailability(req.params.id);
        if (!event) {
            return res.status(404).render('error', {
                title: 'Event not found',
                active: 'attendee',
                message: 'This event is not available for booking.'
            });
        }

        res.render('attendee/event', {
            title: 'Attendee Event Page',
            active: 'attendee',
            event,
            errors: [],
            formValues: {}
        });
    } catch (err) {
        next(err);
    }
});

// Purpose: Creates a booking with transaction-based ticket availability checks.
// Inputs: HTTP POST form with attendee name and requested full/concession ticket quantities.
// Outputs: New booking and booking_tickets rows, then redirect to confirmation page.
router.post('/events/:id/book', async (req, res, next) => {
    let transactionStarted = false;

    try {
        const attendeeName = String(req.body.attendee_name || '').trim();
        const fullQty = toWholeNumber(req.body.full_price_quantity);
        const concessionQty = toWholeNumber(req.body.concession_quantity);
        const formValues = {
            attendee_name: attendeeName,
            full_price_quantity: req.body.full_price_quantity,
            concession_quantity: req.body.concession_quantity
        };

/* ===== END PERSONALLY WRITTEN CODE ===== */

/* ===== START ASSISTED CODE SECTION ===== */

        // Purpose: Starts an immediate transaction so availability is checked and inserted atomically.
        // Inputs: none.
        // Outputs: SQLite write transaction.
        await run('BEGIN IMMEDIATE TRANSACTION');
        transactionStarted = true;

        const event = await getPublishedEventWithAvailability(req.params.id);
        if (!event) {
            await run('ROLLBACK');
            transactionStarted = false;
            return res.status(404).render('error', {
                title: 'Event not found',
                active: 'attendee',
                message: 'This event is not available for booking.'
            });
        }

        const errors = [];
        if (!attendeeName) errors.push('Your name is required.');
        if (!Number.isInteger(fullQty)) errors.push('Full-price quantity must be a whole number.');
        if (!Number.isInteger(concessionQty)) errors.push('Concession quantity must be a whole number.');
        if (Number.isInteger(fullQty) && Number.isInteger(concessionQty) && fullQty + concessionQty < 1) {
            errors.push('You must book at least one ticket.');
        }
        if (Number.isInteger(fullQty) && fullQty > event.full_price_remaining) {
            errors.push('Not enough full-price tickets are available.');
        }
        if (Number.isInteger(concessionQty) && concessionQty > event.concession_remaining) {
            errors.push('Not enough concession tickets are available.');
        }

        if (errors.length > 0) {
            await run('ROLLBACK');
            transactionStarted = false;
            return res.status(400).render('attendee/event', {
                title: 'Attendee Event Page',
                active: 'attendee',
                event,
                errors,
                formValues
            });
        }

/* ===== END ASSISTED CODE SECTION ===== */

/* ===== START PERSONALLY WRITTEN CODE ===== */

        const bookingReference = await makeUniqueBookingReference();

        // Purpose: Creates a confirmed booking record.
        // Inputs: event id, attendee name and generated reference.
        // Outputs: One new bookings row.
        const bookingResult = await run(`
            INSERT INTO bookings (event_id, attendee_name, booking_reference, status)
            VALUES (?, ?, ?, 'confirmed')
        `, [event.event_id, attendeeName, bookingReference]);

        if (fullQty > 0) {
            // Purpose: Stores the full-price ticket line for the booking.
            // Inputs: booking id, ticket type, quantity and price.
            // Outputs: One new booking_tickets row.
            await run(`
                INSERT INTO booking_tickets (booking_id, ticket_type, quantity, unit_price)
                VALUES (?, 'full_price', ?, ?)
            `, [bookingResult.lastID, fullQty, event.full_price_price]);
        }

        if (concessionQty > 0) {
            // Purpose: Stores the concession ticket line for the booking.
            // Inputs: booking id, ticket type, quantity and price.
            // Outputs: One new booking_tickets row.
            await run(`
                INSERT INTO booking_tickets (booking_id, ticket_type, quantity, unit_price)
                VALUES (?, 'concession', ?, ?)
            `, [bookingResult.lastID, concessionQty, event.concession_price]);
        }

        await writeAudit('BOOKING_CREATED', event.event_id, `Booking ${bookingReference} created for ${attendeeName}.`);

        // Purpose: Commits the booking after all inserts succeed.
        // Inputs: current transaction.
        // Outputs: Persisted booking and ticket rows.
        await run('COMMIT');
        transactionStarted = false;

        res.redirect(`/attendee/bookings/${encodeURIComponent(bookingReference)}`);
    } catch (err) {
        if (transactionStarted) {
            try {
                await run('ROLLBACK');
            } catch (rollbackErr) {
                console.error('Rollback failed:', rollbackErr);
            }
        }
        next(err);
    }
});

async function getBookingByReference(reference) {
    // Purpose: Retrieves booking details, event details and ticket lines by booking reference.
    // Inputs: booking reference from URL or form.
    // Outputs: Booking object, ticket rows and total amount.
    const booking = await get(`
        SELECT
            bookings.*,
            events.title,
            events.description,
            events.event_date
        FROM bookings
        JOIN events ON events.event_id = bookings.event_id
        WHERE bookings.booking_reference = ?
    `, [reference]);

    if (!booking) return null;

    const tickets = await all(`
        SELECT
            ticket_type,
            quantity,
            unit_price,
            quantity * unit_price AS line_total
        FROM booking_tickets
        WHERE booking_id = ?
        ORDER BY ticket_type
    `, [booking.booking_id]);

    const bookingTotal = tickets.reduce((sum, ticket) => sum + Number(ticket.line_total || 0), 0);
    return { booking, tickets, bookingTotal };
}

// Purpose: Shows booking confirmation or lookup result by reference.
// Inputs: HTTP GET request with booking reference URL parameter.
// Outputs: attendee/confirmation.ejs with booking details, ticket lines and total.
router.get('/bookings/:reference', async (req, res, next) => {
    try {
        const result = await getBookingByReference(req.params.reference.toUpperCase());
        if (!result) {
            return res.status(404).render('error', {
                title: 'Booking not found',
                active: 'attendee',
                message: 'No booking was found for this reference.'
            });
        }

        res.render('attendee/confirmation', {
            title: 'Booking Confirmation',
            active: 'attendee',
            ...result
        });
    } catch (err) {
        next(err);
    }
});

// Purpose: Cancels an existing booking by reference.
// Inputs: HTTP POST request with booking reference URL parameter.
// Outputs: Updated booking status and redirect to booking confirmation page.
router.post('/bookings/:reference/cancel', async (req, res, next) => {
    try {
        const reference = req.params.reference.toUpperCase();
        const result = await getBookingByReference(reference);

        if (!result) {
            return res.status(404).render('error', {
                title: 'Booking not found',
                active: 'attendee',
                message: 'No booking was found for this reference.'
            });
        }

        if (result.booking.status === 'confirmed') {
            // Purpose: Changes a booking status to cancelled and timestamps the cancellation.
            // Inputs: booking reference.
            // Outputs: One updated bookings row.
            await run(`
                UPDATE bookings
                SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP
                WHERE booking_reference = ?
            `, [reference]);

            await writeAudit('BOOKING_CANCELLED', result.booking.event_id, `Booking ${reference} was cancelled.`);
        }

        res.redirect(`/attendee/bookings/${encodeURIComponent(reference)}`);
    } catch (err) {
        next(err);
    }
});

module.exports = router;

/* ===== END PERSONALLY WRITTEN CODE ===== */
