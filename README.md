# CM2040 Event Manager

This project is an Express, EJS and SQLite event manager for the CM2040 Databases, Network and the Web coursework.

## Requirements

- Node.js 22 or 24
- npm 10 or later
- SQLite3 command line tool

## How to run

From the project folder run:

```bash
npm install
npm run build-db
npm run start
```

Optional pre-submission check:

```bash
npm test
```

Continuous integration runs this smoke test on Node.js 22 and 24. It also
performs CodeQL analysis and reports production dependency advisories.

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
- a small smoke test for the database schema and booking totals

Do not submit `node_modules` or `database.db`. They are generated locally and
are intentionally excluded from version control. The marker can rebuild the
database with `npm run build-db`.

## Repository hygiene and dependency status

The previously tracked dependency directory and local SQLite database have been
removed from version control without deleting either local copy. Before the
database was untracked, it was checked for attendee data: it contained two seed
events and no bookings, booking tickets, attendee names or email addresses.

The application stays on the coursework-compatible Express 4 and SQLite3 5
major versions. The lockfile includes available non-breaking dependency fixes.
At the time of this cleanup, `npm audit` still reported seven advisories in the
SQLite3 5 native build toolchain. The automated upgrade requires the breaking
SQLite3 6 major release, so it has deliberately not been forced. CI keeps the
audit visible while Dependabot proposes reviewable updates.

## Code authorship labels

The source files and the source code PDF use these labels:

- `START PERSONALLY WRITTEN CODE` / `END PERSONALLY WRITTEN CODE`
- `START ASSISTED CODE SECTION` / `END ASSISTED CODE SECTION`

The labels are placed directly around the relevant source code sections.
