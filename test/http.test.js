/* ===== START ASSISTED CODE SECTION ===== */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const express = require('express');
const organiserAccess = require('../lib/organiser-access');
const createDatabaseRouter = require('../lib/database-router');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'event-manager-test-'));
process.env.DATABASE_PATH = path.join(temporary, 'test.db');
process.env.ORGANISER_PASSWORD = 'test-only-organiser-password';
execFileSync('sqlite3', [process.env.DATABASE_PATH], {
    input: fs.readFileSync(path.join(__dirname, '..', 'db_schema.sql'))
});
const { app, db } = require('../index');
const auth = 'Basic ' + Buffer.from('organiser:' + process.env.ORGANISER_PASSWORD).toString('base64');

function request(server, method, route, data = {}, authorization) {
    const body = new URLSearchParams(data).toString();
    return new Promise((resolve, reject) => {
        const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        if (authorization) headers.Authorization = authorization;
        const req = http.request({
            host: '127.0.0.1', port: server.address().port, path: route, method, headers
        }, res => {
            let text = '';
            res.on('data', chunk => { text += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text }));
        });
        req.on('error', reject);
        req.end(method === 'POST' ? body : undefined);
    });
}
function run(sql) {
    return new Promise((resolve, reject) => db.run(sql, err => err ? reject(err) : resolve()));
}
function get(sql) {
    return new Promise((resolve, reject) => db.get(sql, (err, row) => err ? reject(err) : resolve(row)));
}
function listen(application) {
    return new Promise(resolve => {
        const server = application.listen(0, '127.0.0.1', () => resolve(server));
    });
}
function close(server) {
    return new Promise(resolve => server.close(resolve));
}

async function main() {
    const server = await listen(app);
    try {
        const protectedRoutes = [
            ['GET', '/organiser'], ['GET', '/organiser/settings'],
            ['GET', '/organiser/audit'], ['GET', '/organiser/events/1/bookings'],
            ['GET', '/organiser/events/1/edit'], ['POST', '/organiser/events/new'],
            ['POST', '/organiser/settings'], ['POST', '/organiser/events/1/edit'],
            ['POST', '/organiser/events/2/publish'], ['POST', '/organiser/events/1/delete']
        ];
        for (const [method, route] of protectedRoutes) {
            assert.strictEqual((await request(server, method, route)).status, 401, route);
            assert.strictEqual((await request(server, method, route, {}, 'Basic d3Jvbmc6d3Jvbmc=')).status, 401, route);
        }
        assert.strictEqual((await request(server, 'GET', '/attendee')).status, 200);
        const page = await request(server, 'GET', '/organiser/settings', {}, auth);
        assert.strictEqual(page.status, 200);
        const token = /name="_csrf" value="([a-f0-9]+)"/.exec(page.body)[1];
        const settings = { site_name: 'Protected site', site_description: 'Protected description' };
        for (const invalid of [{}, { _csrf: 'wrong' }, { '_csrf[]': token }]) {
            assert.strictEqual((await request(server, 'POST', '/organiser/settings', { ...settings, ...invalid }, auth)).status, 403);
        }
        assert.strictEqual((await request(server, 'POST', '/organiser/settings', { ...settings, _csrf: token }, auth)).status, 302);
        assert.strictEqual((await get('SELECT site_name FROM settings')).site_name, 'Protected site');
        // Every rendered organiser form must carry the token, including draft actions.
        for (const route of ['/organiser', '/organiser/events/1/edit']) {
            const body = (await request(server, 'GET', route, {}, auth)).body;
            assert.strictEqual((body.match(/<form /g) || []).length, (body.match(/name="_csrf"/g) || []).length);
        }

        await run('UPDATE events SET full_price_quantity = 1, concession_quantity = 0 WHERE event_id = 1');
        const book = name => request(server, 'POST', '/attendee/events/1/book', {
            attendee_name: name, full_price_quantity: 1, concession_quantity: 0
        });
        const contested = await Promise.all([book('First'), book('Second')]);
        assert.deepStrictEqual(contested.map(result => result.status).sort(), [302, 400]);
        assert.strictEqual((await get('SELECT SUM(quantity) AS sold FROM booking_tickets')).sold, 1);
        await run('UPDATE events SET full_price_quantity = 10 WHERE event_id = 1');
        const parallel = await Promise.all(Array.from({ length: 8 }, (_, i) => book('Guest ' + i)));
        assert.ok(parallel.every(result => result.status === 302));
        assert.strictEqual((await get('SELECT COUNT(*) AS total FROM bookings')).total, 9);

        // Force a failure after booking inserts. A concurrent organiser mutation
        // must run after rollback and remain committed in its own operation.
        await run("CREATE TRIGGER fail_booking BEFORE INSERT ON audit_log WHEN NEW.action = 'BOOKING_CREATED' BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
        const expectedError = console.error;
        console.error = () => {};
        let failed;
        try {
            failed = await Promise.all([
                book('Rollback'),
                request(server, 'POST', '/organiser/settings', { ...settings, site_name: 'After rollback', _csrf: token }, auth)
            ]);
        } finally {
            console.error = expectedError;
        }
        assert.deepStrictEqual(failed.map(result => result.status), [500, 302]);
        assert.strictEqual((await get('SELECT COUNT(*) AS total FROM bookings')).total, 9);
        assert.strictEqual((await get('SELECT site_name FROM settings')).site_name, 'After rollback');
        await run('DROP TRIGGER fail_booking');
        assert.strictEqual((await book('Recovery')).status, 302);
    } finally {
        await close(server);
    }

    const disabled = express();
    disabled.use(organiserAccess(), (req, res) => res.send('private'));
    const disabledServer = await listen(disabled);
    try {
        assert.strictEqual((await request(disabledServer, 'GET', '/')).status, 503);
    } finally {
        await close(disabledServer);
    }

    // Disconnecting a client must not release ownership of a running handler.
    let release, started;
    const held = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { started = resolve; });
    const queueApp = express();
    const router = createDatabaseRouter();
    let secondStarted = false;
    router.get('/first', async (req, res) => { started(); await held; res.end(); });
    router.get('/second', (req, res) => { secondStarted = true; res.end(); });
    queueApp.use(router);
    const queueServer = await listen(queueApp);
    try {
        const abandoned = http.get({ host: '127.0.0.1', port: queueServer.address().port, path: '/first' });
        abandoned.on('error', () => {});
        await entered;
        abandoned.destroy();
        const second = request(queueServer, 'GET', '/second');
        await new Promise(resolve => setTimeout(resolve, 30));
        assert.strictEqual(secondStarted, false);
        release();
        assert.strictEqual((await second).status, 200);
    } finally {
        release();
        await close(queueServer);
    }
    console.log('HTTP access, CSRF, concurrency, rollback and disconnect tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    db.close(() => fs.rmSync(temporary, { recursive: true, force: true }));
});
/* ===== END ASSISTED CODE SECTION ===== */
