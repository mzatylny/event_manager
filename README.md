# CM2040 Event Manager

This project is an Express, EJS and SQLite event manager for the CM2040 Databases, Network and the Web coursework.

## Requirements

- Node.js 16 or later
- npm 8 or later
- SQLite3 command line tool

## How to run

From the project folder run:

```bash
npm install
npm run build-db
# Choose your own strong password; do not commit it.
export ORGANISER_PASSWORD='replace-with-your-own-long-password'
npm run start
```

The server binds to `127.0.0.1` by default. Organiser pages prompt for the username
`organiser` and the password from `ORGANISER_PASSWORD`. `ORGANISER_USERNAME` can override
the username. Without a password, all organiser routes are disabled (HTTP 503);
attendee pages stay available. Organiser forms include CSRF protection. Close your
browser session to clear its cached HTTP Basic credentials.

For access from other computers, explicitly set `HOST` and place the app behind HTTPS:
HTTP Basic credentials must not cross an unencrypted network. `PORT` defaults to 3000;
`DATABASE_PATH` can select a separate existing database.

Database routes share a queue that holds the SQLite connection for each complete
handler, including booking commit or rollback. This prevents concurrent requests from
sharing a transaction. It is intended for this single-process coursework server.

Optional pre-submission check:

```bash
npm test
```

Open the application at:

- Main Home Page: http://localhost:3000/
- Organiser Home Page: http://localhost:3000/organiser
- Site Settings Page: http://localhost:3000/organiser/settings
- Audit Log Page: http://localhost:3000/organiser/audit
- Attendee Home Page: http://localhost:3000/attendee
- Booking Lookup Page: http://localhost:3000/attendee/booking-lookup

## Additional libraries

No additional libraries are used beyond the coursework template dependencies:

- Express
- EJS
- SQLite3

## Extension implemented

The extension is a Smart Booking Management and Audit System. It adds:

- booking references and attendee confirmation pages
- booking lookup by reference
- attendee booking cancellation
- organiser booking dashboard with revenue and remaining capacity
- audit log for important organiser and attendee actions
- transaction-based booking validation to reduce overbooking risk
- unique booking reference checking to avoid rare reference collisions
- organiser validation that prevents ticket totals being reduced below confirmed sales
- database smoke tests and HTTP regressions for access control, CSRF, and concurrent bookings

Do not submit `node_modules` or `database.db`. The marker should be able to rebuild the database with `npm run build-db`.

## Code authorship labels

The source files and the source code PDF use these labels:

- `START PERSONALLY WRITTEN CODE` / `END PERSONALLY WRITTEN CODE`
- `START ASSISTED CODE SECTION` / `END ASSISTED CODE SECTION`

The labels are placed directly around the relevant source code sections.
