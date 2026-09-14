/* ===== START PERSONALLY WRITTEN CODE ===== */

const createDatabaseRouter = require('../lib/database-router');
const router = createDatabaseRouter();

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

// Promise wrapper for db.run: used for INSERT, UPDATE and DELETE operations.
function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDb().run(sql, params, function callback(err) {
            err ? reject(err) : resolve(this);
        });
    });
}

async function writeAudit(action, eventId, details) {
    // Purpose: Stores an organiser or attendee action in the audit log.
    // Inputs: action label, optional event id and human-readable details.
    // Outputs: One new audit_log row.
    await run(
        'INSERT INTO audit_log (action, event_id, details) VALUES (?, ?, ?)',
        [action, eventId || null, details]
    );
}

// Converts form quantity inputs to safe whole numbers.
function toWholeNumber(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+$/.test(text)) return NaN;
    return Number(text);
}

// Converts form price inputs to decimal currency values with at most two places.
function toMoney(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return NaN;
    return Number(text);
}

// Validates the organiser event form before updating SQLite.
function validateEventForm(body) {
    const errors = [];
    const data = {
        title: String(body.title || '').trim(),
        description: String(body.description || '').trim(),
        event_date: String(body.event_date || '').trim().replace('T', ' '),
        full_price_quantity: toWholeNumber(body.full_price_quantity),
        full_price_price: toMoney(body.full_price_price),
        concession_quantity: toWholeNumber(body.concession_quantity),
        concession_price: toMoney(body.concession_price)
    };

    if (!data.title) errors.push('Event title is required.');
    if (!data.description) errors.push('Event description is required.');
    if (!data.event_date) errors.push('Event date and time is required.');
    if (!Number.isInteger(data.full_price_quantity)) errors.push('Full-price ticket quantity must be a whole number.');
    if (Number.isNaN(data.full_price_price)) errors.push('Full-price ticket price must be a valid amount.');
    if (!Number.isInteger(data.concession_quantity)) errors.push('Concession ticket quantity must be a whole number.');
    if (Number.isNaN(data.concession_price)) errors.push('Concession ticket price must be a valid amount.');

    return { errors, data };
}

function isValidEventDateTime(value) {
    // Purpose: Checks that the organiser supplied a real date/time before the event is saved.
    // Inputs: normalised event date string from the form.
    // Outputs: Boolean indicating whether JavaScript can parse it as a valid date/time.
    const parsed = Date.parse(String(value || '').replace(' ', 'T'));
    return !Number.isNaN(parsed);
}

/* ===== END PERSONALLY WRITTEN CODE ===== */

/* ===== START ASSISTED CODE SECTION ===== */
async function getConfirmedTicketSales(eventId) {
    // Purpose: Counts confirmed tickets already sold for an event before organiser edits are saved.
    // Inputs: event id.
    // Outputs: Sold full-price and concession ticket totals.
    const sales = await get(`
        SELECT
            COALESCE(SUM(CASE WHEN booking_tickets.ticket_type = 'full_price' THEN booking_tickets.quantity ELSE 0 END), 0) AS full_price_sold,
            COALESCE(SUM(CASE WHEN booking_tickets.ticket_type = 'concession' THEN booking_tickets.quantity ELSE 0 END), 0) AS concession_sold
        FROM bookings
        JOIN booking_tickets ON booking_tickets.booking_id = bookings.booking_id
        WHERE bookings.event_id = ? AND bookings.status = 'confirmed'
    `, [eventId]);

    return {
        full_price_sold: Number(sales.full_price_sold || 0),
        concession_sold: Number(sales.concession_sold || 0)
    };
}
/* ===== END ASSISTED CODE SECTION ===== */

/* ===== START PERSONALLY WRITTEN CODE ===== */

// Purpose: Renders the Organiser Home Page with settings, draft events and published events.
// Inputs: HTTP GET request to /organiser.
// Outputs: organiser/home.ejs populated with data from SQLite.
router.get('/', async (req, res, next) => {
    try {
        // Purpose: Retrieves current site settings for organiser display.
        // Inputs: none.
        // Outputs: One settings row.
        const settings = await get('SELECT * FROM settings WHERE setting_id = 1');

        // Purpose: Retrieves all events for organiser management.
        // Inputs: none.
        // Outputs: Event rows ordered by status and date.
        const events = await all(`
            SELECT *
            FROM events
            ORDER BY status ASC, event_date ASC, created_at DESC
        `);

        res.render('organiser/home', {
            title: 'Organiser Home Page',
            active: 'organiser',
            settings,
            events
        });
    } catch (err) {
        next(err);
    }
});

// Purpose: Creates a new draft event and redirects to its edit page.
// Inputs: HTTP POST request to /organiser/events/new.
// Outputs: New draft event row and redirect to edit page.
router.post('/events/new', async (req, res, next) => {
    try {
        // Purpose: Inserts a blank draft event for the organiser to edit.
        // Inputs: default draft values.
        // Outputs: One new events row.
        const result = await run(`
            INSERT INTO events (
                title, description, event_date, status,
                full_price_quantity, full_price_price,
                concession_quantity, concession_price
            )
            VALUES (?, ?, ?, 'draft', 0, 0, 0, 0)
        `, ['Untitled Event', 'Add event description here.', '2026-05-01 18:00']);

        await writeAudit('CREATE_DRAFT', result.lastID, 'Draft event created.');
        res.redirect(`/organiser/events/${result.lastID}/edit`);
    } catch (err) {
        next(err);
    }
});

// Purpose: Renders the Organiser Edit Event Page for a selected event.
// Inputs: HTTP GET request with event id URL parameter.
// Outputs: organiser/edit_event.ejs populated with the current event data.
router.get('/events/:id/edit', async (req, res, next) => {
    try {
        // Purpose: Retrieves a single event to populate the edit form.
        // Inputs: event id from URL.
        // Outputs: One event row or undefined.
        const event = await get('SELECT * FROM events WHERE event_id = ?', [req.params.id]);
        if (!event) {
            return res.status(404).render('error', {
                title: 'Event not found',
                active: 'organiser',
                message: 'The selected event could not be found.'
            });
        }

        res.render('organiser/edit_event', {
            title: 'Organiser Edit Event Page',
            active: 'organiser',
            event,
            errors: []
        });
    } catch (err) {
        next(err);
    }
});

// Purpose: Validates and saves organiser changes to an event.
// Inputs: HTTP POST form with event title, description, date and ticket details.
// Outputs: Updated events row and redirect to Organiser Home Page, or edit page with validation errors.
router.post('/events/:id/edit', async (req, res, next) => {
    try {
        const currentEvent = await get('SELECT * FROM events WHERE event_id = ?', [req.params.id]);
        if (!currentEvent) {
            return res.status(404).render('error', {
                title: 'Event not found',
                active: 'organiser',
                message: 'The selected event could not be found.'
            });
        }

        const { errors, data } = validateEventForm(req.body);

        if (errors.length === 0 && !isValidEventDateTime(data.event_date)) {
            errors.push('Event date and time must be a valid date and time.');
        }

/* ===== END PERSONALLY WRITTEN CODE ===== */

/* ===== START ASSISTED CODE SECTION ===== */
        if (errors.length === 0) {
            const soldTickets = await getConfirmedTicketSales(req.params.id);

            if (data.full_price_quantity < soldTickets.full_price_sold) {
                errors.push(`Full-price ticket quantity cannot be below the ${soldTickets.full_price_sold} confirmed tickets already sold.`);
            }

            if (data.concession_quantity < soldTickets.concession_sold) {
                errors.push(`Concession ticket quantity cannot be below the ${soldTickets.concession_sold} confirmed tickets already sold.`);
            }
        }
/* ===== END ASSISTED CODE SECTION ===== */

/* ===== START PERSONALLY WRITTEN CODE ===== */

        if (errors.length > 0) {
            return res.status(400).render('organiser/edit_event', {
                title: 'Organiser Edit Event Page',
                active: 'organiser',
                event: { ...currentEvent, ...data },
                errors
            });
        }

        // Purpose: Updates the selected event and refreshes its updated_at timestamp.
        // Inputs: validated form values and event id.
        // Outputs: One updated events row.
        await run(`
            UPDATE events
            SET title = ?,
                description = ?,
                event_date = ?,
                full_price_quantity = ?,
                full_price_price = ?,
                concession_quantity = ?,
                concession_price = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE event_id = ?
        `, [
            data.title,
            data.description,
            data.event_date,
            data.full_price_quantity,
            data.full_price_price,
            data.concession_quantity,
            data.concession_price,
            req.params.id
        ]);

        await writeAudit('EDIT_EVENT', req.params.id, `Event edited: ${data.title}`);
        res.redirect('/organiser/');
    } catch (err) {
        next(err);
    }
});

// Purpose: Publishes a draft event and timestamps its publication date.
// Inputs: HTTP POST request with event id URL parameter.
// Outputs: Updated event status and redirect to Organiser Home Page.
router.post('/events/:id/publish', async (req, res, next) => {
    try {
        const event = await get('SELECT * FROM events WHERE event_id = ?', [req.params.id]);
        if (!event) {
            return res.status(404).render('error', {
                title: 'Event not found',
                active: 'organiser',
                message: 'The selected event could not be found.'
            });
        }

        // Purpose: Changes an event from draft to published and sets publication time.
        // Inputs: event id.
        // Outputs: One updated events row.
        await run(`
            UPDATE events
            SET status = 'published',
                published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
                updated_at = CURRENT_TIMESTAMP
            WHERE event_id = ?
        `, [req.params.id]);

        await writeAudit('PUBLISH_EVENT', req.params.id, `Event published: ${event.title}`);
        res.redirect('/organiser/');
    } catch (err) {
        next(err);
    }
});

// Purpose: Deletes an event and reloads organiser data.
// Inputs: HTTP POST request with event id URL parameter.
// Outputs: Deleted event row and redirect to Organiser Home Page.
router.post('/events/:id/delete', async (req, res, next) => {
    try {
        const event = await get('SELECT * FROM events WHERE event_id = ?', [req.params.id]);
        if (!event) {
            return res.redirect('/organiser/');
        }

        // Purpose: Deletes event data; related bookings and ticket lines are removed through foreign key cascade.
        // Inputs: event id.
        // Outputs: Removed events row.
        await run('DELETE FROM events WHERE event_id = ?', [req.params.id]);
        await writeAudit('DELETE_EVENT', null, `Event deleted: ${event.title} (id ${event.event_id})`);
        res.redirect('/organiser/');
    } catch (err) {
        next(err);
    }
});

// Purpose: Renders the Site Settings Page.
// Inputs: HTTP GET request to /organiser/settings.
// Outputs: organiser/settings.ejs populated with current settings.
router.get('/settings', async (req, res, next) => {
    try {
        // Purpose: Retrieves the current site name and description.
        // Inputs: none.
        // Outputs: One settings row.
        const settings = await get('SELECT * FROM settings WHERE setting_id = 1');
        res.render('organiser/settings', {
            title: 'Site Settings Page',
            active: 'organiser',
            settings,
            errors: []
        });
    } catch (err) {
        next(err);
    }
});

// Purpose: Updates the site name and description.
// Inputs: HTTP POST form with site_name and site_description.
// Outputs: Updated settings row and redirect to Organiser Home Page.
router.post('/settings', async (req, res, next) => {
    try {
        const siteName = String(req.body.site_name || '').trim();
        const siteDescription = String(req.body.site_description || '').trim();
        const errors = [];

        if (!siteName) errors.push('Site name is required.');
        if (!siteDescription) errors.push('Site description is required.');

        if (errors.length > 0) {
            return res.status(400).render('organiser/settings', {
                title: 'Site Settings Page',
                active: 'organiser',
                settings: { site_name: siteName, site_description: siteDescription },
                errors
            });
        }

        // Purpose: Stores the organiser's site settings in SQLite.
        // Inputs: validated site name and description.
        // Outputs: One updated settings row.
        await run(`
            UPDATE settings
            SET site_name = ?, site_description = ?
            WHERE setting_id = 1
        `, [siteName, siteDescription]);

        await writeAudit('UPDATE_SETTINGS', null, 'Site settings updated.');
        res.redirect('/organiser/');
    } catch (err) {
        next(err);
    }
});

// Purpose: Renders the extension audit log page.
// Inputs: HTTP GET request to /organiser/audit.
// Outputs: organiser/audit.ejs with logged organiser and attendee actions.
router.get('/audit', async (req, res, next) => {
    try {
        // Purpose: Retrieves audit rows and associated event titles when available.
        // Inputs: none.
        // Outputs: Audit log rows ordered newest first.
        const auditRows = await all(`
            SELECT audit_log.*, events.title AS event_title
            FROM audit_log
            LEFT JOIN events ON events.event_id = audit_log.event_id
            ORDER BY audit_log.created_at DESC, audit_log.audit_id DESC
        `);

        res.render('organiser/audit', {
            title: 'Audit Log',
            active: 'organiser',
            auditRows
        });
    } catch (err) {
        next(err);
    }
});

// Purpose: Renders the extension booking dashboard for a single event.
// Inputs: HTTP GET request with event id URL parameter.
// Outputs: organiser/bookings.ejs with ticket totals, revenue and booking rows.
router.get('/events/:id/bookings', async (req, res, next) => {
    try {
        // Purpose: Retrieves event statistics using joins and aggregate calculations.
        // Inputs: event id.
        // Outputs: One event row with sold counts and revenue.
        const event = await get(`
            SELECT
                events.*,
                COALESCE(SUM(CASE WHEN bookings.status = 'confirmed' AND booking_tickets.ticket_type = 'full_price' THEN booking_tickets.quantity ELSE 0 END), 0) AS full_price_sold,
                COALESCE(SUM(CASE WHEN bookings.status = 'confirmed' AND booking_tickets.ticket_type = 'concession' THEN booking_tickets.quantity ELSE 0 END), 0) AS concession_sold,
                COALESCE(SUM(CASE WHEN bookings.status = 'confirmed' THEN booking_tickets.quantity * booking_tickets.unit_price ELSE 0 END), 0) AS revenue
            FROM events
            LEFT JOIN bookings ON bookings.event_id = events.event_id
            LEFT JOIN booking_tickets ON booking_tickets.booking_id = bookings.booking_id
            WHERE events.event_id = ?
            GROUP BY events.event_id
        `, [req.params.id]);

        if (!event) {
            return res.status(404).render('error', {
                title: 'Event not found',
                active: 'organiser',
                message: 'The selected event could not be found.'
            });
        }

        event.full_price_remaining = event.full_price_quantity - event.full_price_sold;
        event.concession_remaining = event.concession_quantity - event.concession_sold;

        // Purpose: Retrieves all bookings for the selected event with ticket count and booking total.
        // Inputs: event id.
        // Outputs: Booking rows with aggregate ticket totals.
        const bookings = await all(`
            SELECT
                bookings.*,
                COALESCE(SUM(booking_tickets.quantity), 0) AS ticket_count,
                COALESCE(SUM(booking_tickets.quantity * booking_tickets.unit_price), 0) AS booking_total
            FROM bookings
            LEFT JOIN booking_tickets ON booking_tickets.booking_id = bookings.booking_id
            WHERE bookings.event_id = ?
            GROUP BY bookings.booking_id
            ORDER BY bookings.booked_at DESC
        `, [req.params.id]);

        res.render('organiser/bookings', {
            title: 'Organiser Booking Dashboard',
            active: 'organiser',
            event,
            bookings
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

/* ===== END PERSONALLY WRITTEN CODE ===== */
