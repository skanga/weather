const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

const inlineScript = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];

function runHeadBootstrap({ search = '', hash = '', storage = {} } = {}) {
    const attrs = {};
    vm.runInNewContext(inlineScript, {
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
    });
    return attrs;
}

assert.match(html, /<div id="home-view" class="view">/, 'home starts as the visible first screen');
assert.match(html, /<div id="weather-view" class="view" hidden>/, 'weather screen starts hidden until app.js has a location');
assert.match(html, /<form id="search-form" role="search">/, 'search form is available on the first screen');
assert.match(html, /id="search-input"/, 'city input is present on the first screen');
assert.match(html, /<button type="submit"[^>]*data-i18n="searchButton"/, 'search submit button is present on the first screen');

assert.match(
    css,
    /html\[data-auto-resume\]\s+#home-view\s*\{\s*display:\s*none;\s*\}/,
    'auto-resume launches hide the home/search view before app.js renders weather'
);

assert.strictEqual(
    runHeadBootstrap({ search: '?q=Seattle&lat=47.6062&lon=-122.3321' })['data-auto-resume'],
    'true',
    'direct coordinate launches should gate the first paint'
);
assert.strictEqual(
    runHeadBootstrap({
        storage: { lastLocation: '{"query":"Seattle","lat":47.6062,"lon":-122.3321}' },
    })['data-auto-resume'],
    'true',
    'bare launches with saved location should gate the first paint'
);
assert.strictEqual(
    runHeadBootstrap({ search: '?q=Seattle' })['data-auto-resume'],
    undefined,
    'query-only launches should not hide the search screen while async lookup is needed'
);
