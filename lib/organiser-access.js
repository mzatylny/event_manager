/* ===== START ASSISTED CODE SECTION ===== */
const crypto = require('crypto');

function equalSecret(actual, expected) {
    const digest = value => crypto.createHash('sha256').update(value).digest();
    return crypto.timingSafeEqual(digest(actual), digest(expected));
}

function organiserAccess({ username = 'organiser', password } = {}) {
    const csrfToken = crypto.randomBytes(32).toString('hex');
    return (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        if (!password) {
            return res.status(503).send('Organiser access is disabled. Set ORGANISER_PASSWORD on the server.');
        }
        const header = req.get('authorization') || '';
        const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header);
        const credential = match ? Buffer.from(match[1], 'base64').toString('utf8') : '';
        const separator = credential.indexOf(':');
        const suppliedUser = separator < 0 ? '' : credential.slice(0, separator);
        const suppliedPassword = separator < 0 ? '' : credential.slice(separator + 1);
        const validUser = equalSecret(suppliedUser, username);
        const validPassword = equalSecret(suppliedPassword, password);
        if (!match || separator < 0 || !validUser || !validPassword) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Event Manager organiser", charset="UTF-8"');
            return res.status(401).send('Organiser credentials required.');
        }
        // Basic credentials are sent automatically by browsers, so mutations
        // also require an unpredictable token from an authenticated form.
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            const suppliedToken = req.body && req.body._csrf;
            if (typeof suppliedToken !== 'string' || !equalSecret(suppliedToken, csrfToken)) {
                return res.status(403).send('Invalid form token. Reload the organiser page and try again.');
            }
        }
        res.locals.csrfToken = csrfToken;
        next();
    };
}

module.exports = organiserAccess;
/* ===== END ASSISTED CODE SECTION ===== */
