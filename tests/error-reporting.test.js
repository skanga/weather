const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const i18nSrc = fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8');

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

(async () => {
    const makeFetchOpenMeteo = new Function('fetchImpl', `
        const fetch = fetchImpl;
        const units = { temp: 'fahrenheit', wind: 'mph', precip: 'inch', pressure: 'inHg' };
        ${functionSource('fetchWithTimeout')}
        ${functionSource('fetchOpenMeteo')}
        return fetchOpenMeteo;
    `);

    {
        const fetchOpenMeteo = makeFetchOpenMeteo(() => Promise.resolve({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            text: async () => 'maintenance',
        }));
        await assert.rejects(
            () => fetchOpenMeteo(47.6062, -122.3321),
            err => err.message.includes('Open-Meteo forecast request failed (HTTP 503 Service Unavailable)')
                && err.status === 503
                && err.responseText === 'maintenance'
        );
    }

    {
        const fetchOpenMeteo = makeFetchOpenMeteo(() => Promise.resolve({
            ok: true,
            json: async () => { throw new Error('bad json'); },
        }));
        await assert.rejects(
            () => fetchOpenMeteo(47.6062, -122.3321),
            /Open-Meteo forecast response was not valid JSON/
        );
    }
})().catch(err => {
    console.error(err);
    process.exit(1);
});

const fetchAllWeatherData = functionSource('fetchAllWeatherData');
assert.match(fetchAllWeatherData, /console\.error\('Weather forecast request failed'/,
    'forecast request failures should log clear console context');
assert.match(fetchAllWeatherData, /console\.error\('Weather render failed'/,
    'render failures should log clear console context');
assert.match(fetchAllWeatherData, /failedToRenderWeather/,
    'render failures should use a distinct user-facing message');

assert.match(functionSource('geocodeFetch'), /Location search failed/,
    'location lookup HTTP failures should identify the location search service');
assert.match(functionSource('fetchAirQuality'), /console\.warn\('Air quality unavailable'/,
    'optional AQI failures should be visible in the console');
assert.match(functionSource('fetchNWSAlerts'), /console\.warn\('NWS alerts unavailable'/,
    'NWS alert failures should be visible in the console');
assert.match(functionSource('fetchOpenWeatherAlerts'), /console\.warn\('OpenWeatherMap alerts unavailable'/,
    'OpenWeatherMap alert failures should be visible in the console');
assert.match(functionSource('loadRadar'), /console\.warn\('Radar unavailable'/,
    'radar failures should be visible in the console');

assert.match(i18nSrc, /locationUnavailable:\s*'[^']*permission[^']*search by city/i,
    'current-location error should tell users permission/location/search next steps');
assert.match(i18nSrc, /failedToLoadWeather:\s*'[^']*forecast[^']*try again/i,
    'forecast-load error should say the forecast request failed and suggest retrying');
assert.match(i18nSrc, /failedToRenderWeather:\s*'[^']*loaded[^']*render/i,
    'render error should distinguish display failure from API failure');
assert.match(i18nSrc, /radarUnavailable:\s*'[^']*Radar[^']*refresh/i,
    'radar error should name radar and suggest refresh/retry');
