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
const pollen = loadProxy('pollen-proxy/index.js');

{
    const req = { headers: { origin: 'https://www.noadsweather.com' } };
    assert.strictEqual(alerts.getCorsOrigin(req), 'https://www.noadsweather.com');
    assert.strictEqual(pollen.getCorsOrigin(req), 'https://www.noadsweather.com');
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

{
    const appSrc = fs.readFileSync(path.resolve(__dirname, '..', 'js/app.js'), 'utf8');
    const body = appSrc.match(/async function loadPollenData[\s\S]*?^}/m)[0];
    assert.match(body, /if \(!res\.ok\) throw new Error\('Pollen request failed'\);[\s\S]*const data = await res\.json\(\);/);
}
