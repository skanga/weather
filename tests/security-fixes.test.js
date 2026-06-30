const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');

function loadProxy(relPath) {
    const filename = path.resolve(__dirname, '..', relPath);
    const mod = new Module(filename);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(path.dirname(filename));
    const handlers = {};
    mod.require = (id) => {
        if (id === '@google-cloud/functions-framework') {
            return { http: (name, handler) => { handlers[name] = handler; } };
        }
        return require(id);
    };
    mod._compile(fs.readFileSync(filename, 'utf8'), filename);
    mod.exports.__handlers = handlers;
    return mod.exports;
}

const alerts = loadProxy('alerts-proxy/index.js');

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

{
    const originalFetch = global.fetch;
    const originalNow = Date.now;
    const originalKey = process.env.OPENWEATHER_API_KEY;
    process.env.OPENWEATHER_API_KEY = 'test-key';

    let nowMs = 1_700_000_000_000;
    Date.now = () => nowMs;
    let fetchCalls = 0;
    global.fetch = async () => {
        fetchCalls++;
        return {
            ok: true,
            json: async () => ({
                alerts: [{
                    event: 'Flood',
                    description: 'Expired soon',
                    sender_name: 'Test',
                    start: Math.floor(nowMs / 1000) - 60,
                    end: Math.floor(nowMs / 1000) + 60,
                }],
            }),
        };
    };

    function makeRes() {
        return {
            body: undefined,
            statusCode: 200,
            set() {},
            status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; return this; },
            send(body) { this.body = body; return this; },
        };
    }

    const req = {
        method: 'POST',
        headers: { origin: 'https://skanga.github.io' },
        body: { lat: 10, lon: 20 },
    };

    const first = makeRes();
    const second = makeRes();

    (async () => {
        try {
            await alerts.__handlers.alerts(req, first);
            nowMs += 120_000;
            await alerts.__handlers.alerts(req, second);

            assert.strictEqual(fetchCalls, 1);
            assert.deepStrictEqual(second.body, { features: [] });
        } finally {
            global.fetch = originalFetch;
            Date.now = originalNow;
            if (originalKey === undefined) delete process.env.OPENWEATHER_API_KEY;
            else process.env.OPENWEATHER_API_KEY = originalKey;
        }
    })();
}
