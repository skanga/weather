const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appSrc = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');

function functionSource(name) {
    let start = appSrc.indexOf(`function ${name}`);
    if (start === -1) start = appSrc.indexOf(`async function ${name}`);
    assert.notStrictEqual(start, -1, `${name} should exist`);
    const braceStart = appSrc.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < appSrc.length; i++) {
        if (appSrc[i] === '{') depth++;
        if (appSrc[i] === '}') depth--;
        if (depth === 0) return appSrc.slice(start, i + 1);
    }
    throw new Error(`${name} function body not found`);
}

function makeHelpers({ search = '', hash = '', storage = {}, remember = true } = {}) {
    return new Function('search', 'hash', 'initialStorage', 'remember', `
        const calls = [];
        const store = { ...initialStorage };
        const window = { location: { search, hash } };
        const document = {
            documentElement: {
                removeAttribute(name) { calls.push(['removeAttribute', name]); },
            },
        };
        const searchInput = { value: '' };
        const searchForm = {
            dispatchEvent(event) { calls.push(['dispatch', event.type]); },
        };
        function Event(type) { this.type = type; }
        let autoPickNextSearch = false;

        function storageGet(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; }
        function getSettingsBool(key) {
            if (key === 'rememberLastCity') return remember;
            return true;
        }
        function renderRecentLocations() { calls.push(['recent']); }
        function setUnitsForCountry(country) { calls.push(['units', country]); }
        function showWeather(location, query) { calls.push(['weather', query, location.name]); }
        function fetchAllWeatherData(lat, lon, country, region) { calls.push(['fetch', lat, lon, country, region]); }
        function saveLastLocation(query, location) { calls.push(['save', query, location.name]); }

        ${functionSource('getLocationFromURL')}
        ${functionSource('getLocationFromStorage')}
        ${functionSource('loadFromURL')}

        return {
            calls,
            searchInput,
            get autoPickNextSearch() { return autoPickNextSearch; },
            getLocationFromStorage,
            loadFromURL,
        };
    `)(search, hash, storage, remember);
}

(async () => {
    {
        const helpers = makeHelpers({ storage: { lastLocation: '{bad json' } });
        assert.strictEqual(helpers.getLocationFromStorage(), null, 'invalid saved locations should be ignored');
    }

    {
        const helpers = makeHelpers({
            storage: { lastLocation: '{"query":"Seattle","name":"Seattle","region":"Washington","country":"United States","lat":47.6062,"lon":-122.3321}' },
            remember: false,
        });
        await helpers.loadFromURL();
        assert.deepStrictEqual(helpers.calls, [
            ['removeAttribute', 'data-auto-resume'],
            ['recent'],
        ], 'rememberLastCity=false should show search/recent locations on bare launches');
    }

    {
        const helpers = makeHelpers({
            storage: { lastLocation: '{"query":"Seattle","name":"Seattle","region":"Washington","country":"United States","lat":47.6062,"lon":-122.3321}' },
        });
        await helpers.loadFromURL();
        assert.deepStrictEqual(helpers.calls, [
            ['removeAttribute', 'data-auto-resume'],
            ['units', 'United States'],
            ['weather', 'Seattle', 'Seattle'],
            ['fetch', 47.6062, -122.3321, 'United States', 'Washington'],
            ['save', 'Seattle', 'Seattle'],
        ], 'bare launches with saved locations should restore weather without geocoding');
    }

    {
        const helpers = makeHelpers({ search: '?q=Seattle' });
        await helpers.loadFromURL();
        assert.strictEqual(helpers.searchInput.value, 'Seattle');
        assert.strictEqual(helpers.autoPickNextSearch, true);
        assert.deepStrictEqual(helpers.calls, [
            ['removeAttribute', 'data-auto-resume'],
            ['dispatch', 'submit'],
        ], 'query-only URL loads should dispatch one auto-picking search');
    }
})().catch(err => {
    console.error(err);
    process.exit(1);
});
