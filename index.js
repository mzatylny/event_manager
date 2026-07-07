/* ===== START PERSONALLY WRITTEN CODE ===== */

const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const organiserRoutes = require('./routes/organiser');
const attendeeRoutes = require('./routes/attendee');

// Create the Express application and configure the coursework web server.
const app = express();
const port = 3000;

// Use EJS for server-side rendered pages from the views folder.
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));

// Add small security headers without changing the coursework page flow.
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Open the SQLite database created by npm run build-db.
const db = new sqlite3.Database(path.join(__dirname, 'database.db'), (err) => {
    if (err) {
        console.error('Could not connect to database:', err.message);
        process.exit(1);
    }
});

db.run('PRAGMA foreign_keys = ON');
global.db = db;

// Shared formatter used by EJS views to display ticket prices and revenue.
app.locals.formatMoney = function formatMoney(value) {
    return '£' + Number(value || 0).toFixed(2);
};

app.locals.formatDateTime = function formatDateTime(value) {
    if (!value) return 'Not set';
    return String(value).replace('T', ' ').slice(0, 16);
};

// Purpose: Renders the default Main Home Page.
// Inputs: HTTP GET request to /.
// Outputs: Main Home Page with links to organiser and attendee sections.
app.get('/', (req, res) => {
    res.render('home', { title: 'Event Manager Home', active: 'home' });
});

// Mount route modules so organiser and attendee pages remain separated.
app.use('/organiser', organiserRoutes);
app.use('/attendee', attendeeRoutes);

app.use((req, res) => {
    res.status(404).render('error', {
        title: 'Page not found',
        active: 'home',
        message: 'The requested page could not be found.'
    });
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render('error', {
        title: 'Server error',
        active: 'home',
        message: 'Something went wrong while processing the request.'
    });
});

app.listen(port, () => {
    console.log(`Event Manager running at http://localhost:${port}`);
});
/* ===== END PERSONALLY WRITTEN CODE ===== */
