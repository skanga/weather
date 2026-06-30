const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appSrc = fs.readFileSync(path.resolve(__dirname, '..', 'js/app.js'), 'utf8');

function functionSource(name) {
    const start = appSrc.indexOf(`function ${name}`);
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

const helpers = new Function(`
const homeView = {};
const weatherView = {};
const locationName = { textContent: '' };
const STATE_ABBRS = { ca: 'california' };
${functionSource('showWeather')}
return { showWeather, locationName };
`)();

helpers.showWeather({ name: 'San Jose', region: 'California', country: 'United States' }, 'San Jose');
assert.strictEqual(helpers.locationName.textContent, 'San Jose, CA');

helpers.showWeather({ name: 'San Diego', region: 'CA', country: 'United States' }, '92101');
assert.strictEqual(helpers.locationName.textContent, 'San Diego, CA (92101)');

const seoHelpers = new Function(`
const window = { _seoCity: { lang: 'en', lat: -33.8688, lon: 151.2093, name: 'Sydney', displayName: 'Sydney', country: 'AU', region: 'NSW' } };
const localStorage = { getItem: () => null };
const document = { documentElement: { removeAttribute: () => {} } };
const locationName = { textContent: '' };
const homeView = {};
const weatherView = {};
const STATE_ABBRS = {};
const COUNTRY_NAMES = { AU: 'Australia' };
function setLanguageOverride() {}
function applyTranslations() {}
function setUnitsForCountry() {}
function fetchAllWeatherData() {}
function saveLastLocation() {}
function renderSeoBlurb() {}
function t(key, values) { return key === 'cityPageTitle' ? values.city + ' Weather' : key; }
${functionSource('normalizeCountry')}
${functionSource('showWeather')}
${functionSource('initSeoCity')}
return { initSeoCity, locationName };
`)();

assert.strictEqual(seoHelpers.initSeoCity(), true);
assert.strictEqual(seoHelpers.locationName.textContent, 'Sydney, NSW');
