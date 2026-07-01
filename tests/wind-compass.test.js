const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const i18nSrc = fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8');

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

// Wiring: the section must exist in the DOM and the layout list.
assert.ok(htmlSrc.includes('id="wind-section"'), 'wind-section in index.html');
assert.ok(/DEFAULT_SECTION_ORDER[\s\S]*wind-section/.test(appSrc), 'wind-section in DEFAULT_SECTION_ORDER');
assert.ok(/DEFAULT_LAYOUT_LIST[\s\S]*wind-section/.test(appSrc), 'wind-section in DEFAULT_LAYOUT_LIST');
assert.ok(/windFrom:\s*'/.test(i18nSrc), 'windFrom translation key');

// Behavior: needle rotates to the bearing, values round, cardinal is correct.
const out = new Function(`
    const section = { innerHTML: '' };
    const document = { getElementById: (id) => id === 'wind-section' ? section : null };
    function t(k, vars) {
        let s = ({ wind: 'Wind', windFrom: 'From {dir}', gusts: 'Gusts' })[k] || k;
        if (vars) for (const [kk, v] of Object.entries(vars)) s = s.replace('{' + kk + '}', v);
        return s;
    }
    function windUnit() { return 'mph'; }
    ${functionSource(appSrc, 'windDirectionLong')}
    ${functionSource(appSrc, 'renderWind')}
    renderWind({ wind_direction_10m: 90, wind_speed_10m: 9.4, wind_gusts_10m: 13.6 });
    return section.innerHTML;
`)();

assert.ok(out.includes('rotate(270'), 'arrow points downwind (180deg from the source bearing)');
assert.ok(out.includes('From East'), '90deg source maps to full-form East in the readout');
assert.ok(/>9<|9<span/.test(out), 'speed rounds to 9');
assert.ok(out.includes('Gusts 14'), 'gusts round to 14');

// A layout saved before wind-section existed should gain it on load.
const prefs = new Function(`
    const DEFAULT_SECTION_ORDER = ['current-section','wind-section','hourly-section','daily-section','radar-section','sun-section','moon-section'];
    const DEFAULT_CHART_ORDER = ['chart-temp','chart-atmos','chart-precip','chart-wind'];
    const DEFAULT_LAYOUT_LIST = [
        {id:'current-section',col:'left'},{id:'wind-section',col:'right'},
        {id:'hourly-section',col:'wide'},{id:'daily-section',col:'wide'},
        {id:'radar-section',col:'left'},{id:'sun-section',col:'right'},{id:'moon-section',col:'right'}
    ];
    const legacy = { layoutList: [
        {id:'current-section',col:'left'},{id:'hourly-section',col:'wide'},
        {id:'daily-section',col:'wide'},{id:'radar-section',col:'left'},
        {id:'sun-section',col:'right'},{id:'moon-section',col:'right'}
    ], hidden:[], minimized:[], chartOrder:DEFAULT_CHART_ORDER, hiddenCharts:[] };
    function storageGet() { return JSON.stringify(legacy); }
    function storageRemove() {}
    ${functionSource(appSrc, 'loadSectionPrefs')}
    return loadSectionPrefs();
`)();
const ids = prefs.layoutList.map(x => x.id);
assert.ok(ids.includes('wind-section'), 'legacy layout gains wind-section');
assert.strictEqual(ids[1], 'wind-section', 'wind inserted right after current');

// Full-form directions only in the wind widget readout; abbreviations stay
// on the compact Current Conditions line and the compass dial.
const longDir = new Function(`
    ${functionSource(appSrc, 'windDirectionLong')}
    return windDirectionLong;
`)();
assert.strictEqual(longDir(0), 'North', '0deg -> North');
assert.strictEqual(longDir(90), 'East', '90deg -> East');
assert.strictEqual(longDir(225), 'Southwest', '225deg -> Southwest');
assert.strictEqual(longDir(315), 'Northwest', '315deg -> Northwest');

const renderWindSrc = functionSource(appSrc, 'renderWind');
assert.match(renderWindSrc, /windDirectionLong\(/, 'wind widget uses full-form directions');

const renderCurrentSrc = functionSource(appSrc, 'renderCurrent');
assert.match(renderCurrentSrc, /windDirection\(current\.wind_direction_10m\)/, 'Current Conditions keeps abbreviations');
assert.doesNotMatch(renderCurrentSrc, /windDirectionLong/, 'Current Conditions does not use full form');
