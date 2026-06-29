const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');

function loadProxy(relPath) {
    const filename = path.resolve(__dirname, '..', relPath);
    const mod = new Module(filename);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(path.dirname(filename));
    mod.require = (id) => {
        if (id === '@google-cloud/functions-framework') {
            return { http: () => {} };
        }
        return require(id);
    };
    mod._compile(fs.readFileSync(filename, 'utf8'), filename);
    return mod.exports;
}

const alerts = loadProxy('alerts-proxy/index.js');

{
    const req = { headers: { origin: 'https://www.noadsweather.com' } };
    assert.strictEqual(alerts.getCorsOrigin(req), 'https://www.noadsweather.com');
}

{
    const req = { headers: { origin: 'https://skanga.github.io' } };
    assert.strictEqual(alerts.getCorsOrigin(req), 'https://skanga.github.io');
    assert.strictEqual(alerts.isAllowedRequest(req), true);
}

{
    const nowSec = Math.floor(Date.now() / 1000);
    const cached = {
        data: {
            features: [
                { properties: { event: 'Active', end: nowSec + 60 } },
                { properties: { event: 'Expired', end: nowSec - 60 } },
            ],
        },
    };
    assert.deepStrictEqual(alerts.activeCachedAlerts(cached), {
        features: [{ properties: { event: 'Active', end: nowSec + 60 } }],
    });
}

{
    const deduped = alerts.dedupeAlerts(
        [
            { event: 'Flood', description: 'A', start: 1 },
            { event: 'Flood', description: 'B', start: 2 },
            { event: 'Flood', description: 'A', start: 3 },
        ],
        a => a.event,
        a => a.description
    );
    assert.deepStrictEqual(deduped.map(a => a.description), ['A', 'B']);
}
