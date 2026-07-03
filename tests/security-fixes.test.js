const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function functionSource(src, name) {
    const start = src.indexOf(`function ${name}`);
    assert.notStrictEqual(start, -1, `${name} should exist`);
    const braceStart = src.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        if (src[i] === '}') depth--;
        if (depth === 0) return src.slice(start, i + 1);
    }
    throw new Error(`${name} function body not found`);
}

{
    const helpers = new Function(`
        ${functionSource(appSrc, 'titleCase')}
        ${functionSource(appSrc, 'dedupeAlerts')}
        ${functionSource(appSrc, 'mapOpenWeatherAlerts')}
        return { mapOpenWeatherAlerts };
    `)();
    const nowSec = 1_700_000_000;

    const features = helpers.mapOpenWeatherAlerts({
        alerts: [
            { event: 'flood warning', description: 'Active A', sender_name: 'Agency', start: nowSec - 60, end: nowSec + 60, tags: ['Flood'] },
            { event: 'flood warning', description: 'Active A', sender_name: 'Agency', start: nowSec - 60, end: nowSec + 60, tags: ['Flood'] },
            { event: 'wind warning', description: 'Expired', start: nowSec - 120, end: nowSec - 60 },
        ],
    }, nowSec);

    assert.deepStrictEqual(features, [{
        properties: {
            event: 'Flood Warning',
            headline: 'Flood Warning - Agency',
            description: 'Active A',
            severity: 'Severe',
            senderName: 'Agency',
            start: nowSec - 60,
            end: nowSec + 60,
            tags: ['Flood'],
        },
    }]);
}

{
    const helpers = new Function(`
        ${functionSource(appSrc, 'buildOpenWeatherAlertsUrl')}
        return { buildOpenWeatherAlertsUrl };
    `)();
    const url = helpers.buildOpenWeatherAlertsUrl(10.5, -20.25, 'key/with+chars');
    assert.strictEqual(
        url,
        'https://api.openweathermap.org/data/3.0/onecall?lat=10.5&lon=-20.25&exclude=current%2Cminutely%2Chourly%2Cdaily&appid=key%2Fwith%2Bchars'
    );
}

{
    assert.doesNotMatch(appSrc, /User-Agent/, 'browser fetches must not set forbidden User-Agent header');
    assert.match(indexSrc, /use your current location, coordinates are sent/);
    assert.match(indexSrc, /city geocoding, weather forecasts, and air quality data/);
    assert.match(indexSrc, /US location labels and severe weather alerts/);
    assert.doesNotMatch(indexSrc, /https:\/\/[b-d]\.basemaps\.cartocdn\.com/);
}
