const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appSrc = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');

function functionSource(name) {
    const match = appSrc.match(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
    assert.ok(match, `${name} should exist`);
    const start = match.index;
    const braceStart = appSrc.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < appSrc.length; i++) {
        if (appSrc[i] === '{') depth++;
        if (appSrc[i] === '}') depth--;
        if (depth === 0) return appSrc.slice(start, i + 1);
    }
    throw new Error(`${name} function body not found`);
}

function makeHelpers() {
    return new Function(`
        const calls = [];
        let fetchResults = [];
        let zipResult = null;

        async function geocodeZip(query, autoPick) {
            calls.push(['zip', query, autoPick]);
            return zipResult;
        }
        async function geocodeFetch(name) {
            calls.push(['fetch', name]);
            return fetchResults.shift();
        }
        function showLocationPicker(results) {
            calls.push(['picker', results.map(r => r.name)]);
            return Promise.resolve(results[1]);
        }
        function t(key) { return key; }

        const STATE_ABBRS = { ca: 'california', tx: 'texas' };
        ${functionSource('matchesStateAbbr')}
        ${functionSource('geocode')}

        return {
            calls,
            geocode,
            setFetchResults(results) { fetchResults = results; },
            setZipResult(result) { zipResult = result; },
        };
    `)();
}

(async () => {
    {
        const helpers = makeHelpers();
        helpers.setZipResult({ name: 'Paris', region: '', country: 'France', lat: 48.8566, lon: 2.3522 });
        const result = await helpers.geocode('75001', false);
        assert.strictEqual(result.name, 'Paris');
        assert.deepStrictEqual(helpers.calls, [['zip', '75001', false]], 'postal matches should bypass city geocoding');
    }

    {
        const helpers = makeHelpers();
        helpers.setFetchResults([{
            results: [
                { name: 'Austin', admin1: 'Minnesota', country: 'United States', latitude: 43.6666, longitude: -92.9746 },
                { name: 'Austin', admin1: 'Texas', country: 'United States', latitude: 30.2672, longitude: -97.7431 },
            ],
        }]);
        const result = await helpers.geocode('Austin TX', false);
        assert.strictEqual(result.region, 'Texas');
        assert.deepStrictEqual(helpers.calls.map(c => c[0]), ['zip', 'fetch'], 'region-filtered city searches should not open the picker');
    }

    {
        const helpers = makeHelpers();
        helpers.setFetchResults([{
            results: [
                { name: 'Springfield', admin1: 'Illinois', country: 'United States', latitude: 39.7817, longitude: -89.6501 },
                { name: 'Springfield', admin1: 'Massachusetts', country: 'United States', latitude: 42.1015, longitude: -72.5898 },
            ],
        }]);
        const result = await helpers.geocode('Springfield', false);
        assert.strictEqual(result.region, 'Massachusetts');
        assert.deepStrictEqual(helpers.calls[2], ['picker', ['Springfield', 'Springfield']], 'ambiguous city searches should use the picker');
    }

    {
        const helpers = makeHelpers();
        helpers.setFetchResults([{
            results: [
                { name: 'Springfield', admin1: 'Illinois', country: 'United States', latitude: 39.7817, longitude: -89.6501 },
                { name: 'Springfield', admin1: 'Massachusetts', country: 'United States', latitude: 42.1015, longitude: -72.5898 },
            ],
        }]);
        const result = await helpers.geocode('Springfield', true);
        assert.strictEqual(result.region, 'Illinois');
        assert.ok(!helpers.calls.some(c => c[0] === 'picker'), 'auto-pick URL loads should not open the picker');
    }

    {
        const helpers = makeHelpers();
        helpers.setFetchResults([{ results: [] }]);
        await assert.rejects(() => helpers.geocode('NoSuchPlace'), /locationNotFound/);
    }
})().catch(err => {
    console.error(err);
    process.exit(1);
});
