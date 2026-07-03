const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const inlineScript = indexSrc.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];

function runHeadBootstrap({ search = '', hash = '', storage = {} } = {}) {
    const attrs = {};
    const context = {
        localStorage: {
            getItem(key) {
                return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
            },
        },
        window: {
            matchMedia() {
                return { matches: false };
            },
        },
        URLSearchParams,
        location: { search, hash },
        document: {
            documentElement: {
                setAttribute(name, value) {
                    attrs[name] = value;
                },
            },
        },
    };
    vm.runInNewContext(inlineScript, context);
    return attrs;
}

{
    const attrs = runHeadBootstrap({
        search: '?q=Seattle&lat=47.6062&lon=-122.3321&name=Seattle',
    });
    assert.strictEqual(attrs['data-auto-resume'], 'true',
        'direct lat/lon launch URLs should hide home before app.js renders weather');
}

{
    const attrs = runHeadBootstrap({
        storage: { lastLocation: '{"query":"Seattle","lat":47.6062,"lon":-122.3321}' },
    });
    assert.strictEqual(attrs['data-auto-resume'], 'true',
        'saved lastLocation should keep hiding home on bare launches');
}

{
    const attrs = runHeadBootstrap({
        search: '?q=Seattle',
        storage: { lastLocation: '{"query":"Portland","lat":45.5152,"lon":-122.6784}' },
    });
    assert.strictEqual(attrs['data-auto-resume'], undefined,
        'query-only URLs should not hide home while async geocoding may still be needed');
}
