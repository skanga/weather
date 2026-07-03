const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appSrc = fs.readFileSync(path.join(__dirname, '..', 'js/app.js'), 'utf8');

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

const body = functionSource(appSrc, 'fetchAllWeatherData');

// Layout should be applied once per terminal path of the main meteo load:
// success, forecast request failure, or render failure after data arrives.
// It should not be redundantly applied after independent async renders (AQI,
// alerts, radar all render into sections that were already placed).
const calls = (body.match(/applySectionPreferences\(\)/g) || []).length;
assert.strictEqual(calls, 3, `applySectionPreferences() should be called exactly three times (success + two error paths), found ${calls}`);

// Both error paths must apply layout so empty dependent sections are hidden.
assert.match(
    body,
    /failedToLoadWeather[\s\S]*?applySectionPreferences\(\)/,
    'the forecast request failure path must apply layout'
);
assert.match(
    body,
    /failedToRenderWeather[\s\S]*?applySectionPreferences\(\)/,
    'the weather render failure path must apply layout'
);

// On forecast failure the dependent sections (wind/hourly/daily/sun/moon) are
// left empty. Since sections carry card chrome, an empty one must be hidden
// rather than render as a blank box.
const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'css/style.css'), 'utf8');
assert.match(cssSrc, /section:empty\s*\{[^}]*display:\s*none/, 'empty weather sections are hidden');

console.log('apply-section-prefs-once: all assertions passed');
