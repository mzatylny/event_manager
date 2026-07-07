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
npm run start
```

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
- a small smoke test for the database schema and booking totals

Do not submit `node_modules` or `database.db`. The marker should be able to rebuild the database with `npm run build-db`.

## Code authorship labels

The source files and the source code PDF use these labels:

- `START PERSONALLY WRITTEN CODE` / `END PERSONALLY WRITTEN CODE`
- `START ASSISTED CODE SECTION` / `END ASSISTED CODE SECTION`

The labels are placed directly around the relevant source code sections.
