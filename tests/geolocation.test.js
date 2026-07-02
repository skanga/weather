const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appSrc = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const i18nSrc = fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8');

function functionSource(name) {
    let start = appSrc.indexOf(`function ${name}`);
    assert.notStrictEqual(start, -1, `${name} should exist`);
    if (appSrc.slice(start - 6, start) === 'async ') start -= 6;
    const braceStart = appSrc.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < appSrc.length; i++) {
        if (appSrc[i] === '{') depth++;
        if (appSrc[i] === '}') depth--;
        if (depth === 0) return appSrc.slice(start, i + 1);
    }
    throw new Error(`${name} function body not found`);
}

assert.ok(htmlSrc.includes('id="current-location-btn"'), 'home view should offer current location');
assert.ok(i18nSrc.includes('useMyLocation'), 'button label should be translatable');

(async () => {
    let requested;
    const resolver = new Function(`
let requested;
async function fetchWithTimeout(url, options, ms) {
    requested = { url, options, ms };
    return {
        ok: true,
        async json() {
            return {
                properties: {
                    relativeLocation: { properties: { city: 'San Francisco', state: 'CA' } }
                }
            };
        }
    };
}
${functionSource('resolveCurrentLocation')}
return {
    resolveCurrentLocation,
    get requested() { return requested; }
};
`)();

    const resolved = await resolver.resolveCurrentLocation(37.7749, -122.4194);
    requested = resolver.requested;
    assert.strictEqual(requested.url, 'https://api.weather.gov/points/37.7749,-122.4194');
    assert.strictEqual(requested.ms, 5000);
    assert.deepStrictEqual(resolved, {
        name: 'San Francisco',
        region: 'CA',
        country: 'United States',
        lat: 37.7749,
        lon: -122.4194,
    });

    let success;
    let options;
    const helpers = new Function(`
let unitsCountry;
let urlArgs;
let showArgs;
let fetchArgs;
let saveArgs;
const currentLocationBtn = { disabled: false, textContent: 'Use my location' };
const searchError = { hidden: false, textContent: 'old error' };
function t(key) {
    return {
        searching: 'Searching...',
        useMyLocation: 'Use my location',
        locationUnavailable: 'Location unavailable.'
    }[key] || key;
}
async function resolveCurrentLocation(lat, lon) {
    return { name: 'San Francisco', region: 'CA', country: 'United States', lat, lon };
}
function setUnitsForCountry(country) { unitsCountry = country; }
function updateURL(query, location) { urlArgs = [query, location]; }
function showWeather(location, query) { showArgs = [location, query]; }
function fetchAllWeatherData(lat, lon, country, region) { fetchArgs = [lat, lon, country, region]; }
function saveLastLocation(query, location) { saveArgs = [query, location]; }
${functionSource('useCurrentLocation')}
return {
    useCurrentLocation,
    currentLocationBtn,
    searchError,
    get calls() { return { unitsCountry, urlArgs, showArgs, fetchArgs, saveArgs }; }
};
`)();

    helpers.useCurrentLocation({
        geolocation: {
            getCurrentPosition(onSuccess, _onError, opts) {
                success = onSuccess;
                options = opts;
            }
        }
    });

    assert.strictEqual(helpers.currentLocationBtn.disabled, true);
    assert.strictEqual(helpers.searchError.hidden, true);
    assert.strictEqual(options.timeout, 10000);
    assert.strictEqual(options.maximumAge, 600000);

    await success({ coords: { latitude: 37.7749, longitude: -122.4194 } });

    assert.strictEqual(helpers.currentLocationBtn.disabled, false);
    assert.strictEqual(helpers.currentLocationBtn.textContent, 'Use my location');
    assert.strictEqual(helpers.calls.unitsCountry, 'United States');
    assert.deepStrictEqual(helpers.calls.fetchArgs, [37.7749, -122.4194, 'United States', 'CA']);
    assert.strictEqual(helpers.calls.urlArgs[0], 'Current Location');
    assert.deepStrictEqual(helpers.calls.urlArgs[1], {
        name: 'San Francisco',
        region: 'CA',
        country: 'United States',
        lat: 37.7749,
        lon: -122.4194,
    });
    assert.strictEqual(helpers.calls.showArgs[0], helpers.calls.urlArgs[1]);
    assert.strictEqual(helpers.calls.saveArgs[0], 'Current Location');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
