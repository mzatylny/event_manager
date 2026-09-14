/* ===== START ASSISTED CODE SECTION ===== */
const express = require('express');

// Every route using global.db shares this queue. Hold it until the entire handler
// settles, including COMMIT/ROLLBACK, even if its HTTP client disconnects early.
let pending = Promise.resolve();

function createDatabaseRouter() {
    const router = express.Router();
    for (const method of ['get', 'post']) {
        const register = router[method];
        router[method] = function (path, handler) {
            return register.call(router, path, (req, res, next) => {
                const current = pending.then(() => handler(req, res, next));
                pending = current.catch(() => {});
                current.catch(next);
            });
        };
    }
    return router;
}

module.exports = createDatabaseRouter;
/* ===== END ASSISTED CODE SECTION ===== */
