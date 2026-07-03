const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appSrc = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');

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

function makeHelpers(settings = {}) {
    return new Function('settings', `
        const forecastDays = [{ style: { background: 'old' } }, { style: { background: 'old' } }];
        const checkboxA = { dataset: { setting: 'showWeatherSummary' }, checked: null };
        const checkboxB = { dataset: { setting: 'showNwsLink' }, checked: null };
        const elements = {
            'weather-summary': { style: {} },
            'theme-toggle': { style: {} },
            'units-toggle': { style: {} },
            'time-toggle': { style: {} },
            'lock-toggle': { style: {} },
            'hidden-sections-bar': { style: {} },
            'hidden-charts-bar': { style: {} },
            'setting-openweather-key': { value: '' },
        };
        const nwsLink = { style: {} };
        const document = {
            activeElement: null,
            getElementById(id) { return elements[id] || null; },
            querySelector(selector) {
                if (selector === '.nws-radar-link') return nwsLink;
                return null;
            },
            querySelectorAll(selector) {
                if (selector === '.forecast-day') return forecastDays;
                if (selector === '#settings-popover input[data-setting]') return [checkboxA, checkboxB];
                return [];
            },
        };
        function getSettingsBool(key) {
            return Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : true;
        }
        function updateDayBackgrounds() { forecastDays.forEach(el => { el.style.background = 'updated'; }); }
        function storageGet(key) { return key === 'openWeatherApiKey' ? 'abc123' : null; }

        ${functionSource('applySettings')}

        return { applySettings, elements, forecastDays, nwsLink, checkboxA, checkboxB, document };
    `)(settings);
}

{
    const helpers = makeHelpers({
        showForecastColors: false,
        showWeatherSummary: false,
        showThemeToggle: false,
        showUnitsBtn: false,
        showTimeBtn: false,
        showLockBtn: false,
        showNwsLink: false,
        showSectionButtons: false,
    });
    helpers.applySettings();
    assert.deepStrictEqual(helpers.forecastDays.map(el => el.style.background), ['transparent', 'transparent']);
    assert.strictEqual(helpers.elements['weather-summary'].style.display, 'none');
    assert.strictEqual(helpers.elements['theme-toggle'].style.display, 'none');
    assert.strictEqual(helpers.elements['units-toggle'].style.display, 'none');
    assert.strictEqual(helpers.elements['time-toggle'].style.display, 'none');
    assert.strictEqual(helpers.elements['lock-toggle'].style.display, 'none');
    assert.strictEqual(helpers.nwsLink.style.display, 'none');
    assert.strictEqual(helpers.elements['hidden-sections-bar'].style.display, 'none');
    assert.strictEqual(helpers.elements['hidden-charts-bar'].style.display, 'none');
    assert.strictEqual(helpers.checkboxA.checked, false);
    assert.strictEqual(helpers.checkboxB.checked, false);
    assert.strictEqual(helpers.elements['setting-openweather-key'].value, 'abc123');
}

{
    const helpers = makeHelpers({
        showForecastColors: true,
        showWeatherSummary: true,
        showNwsLink: true,
        showSectionButtons: true,
    });
    helpers.document.activeElement = helpers.elements['setting-openweather-key'];
    helpers.elements['setting-openweather-key'].value = 'user typing';
    helpers.applySettings();
    assert.deepStrictEqual(helpers.forecastDays.map(el => el.style.background), ['updated', 'updated']);
    assert.strictEqual(helpers.elements['weather-summary'].style.display, '');
    assert.strictEqual(helpers.nwsLink.style.display, '');
    assert.strictEqual(helpers.elements['hidden-sections-bar'].style.display, '');
    assert.strictEqual(helpers.elements['hidden-charts-bar'].style.display, '');
    assert.strictEqual(helpers.elements['setting-openweather-key'].value, 'user typing',
        'focused OpenWeather key input should not be overwritten while typing');
}

const revertBlock = appSrc.match(/document\.getElementById\('settings-revert'\)\.addEventListener\('click', \(\) => \{([\s\S]*?)\n\}\);/);
assert.ok(revertBlock, 'settings revert handler should exist');
assert.match(revertBlock[1], /storageSet\('autoPlayRadar', 'false'\)/);
assert.match(revertBlock[1], /storageSet\('rememberLastCity', 'true'\)/);
assert.match(revertBlock[1], /storageSet\('layoutLocked', 'true'\)/);
assert.match(revertBlock[1], /storageRemove\('sectionPrefs'\)/);
assert.match(revertBlock[1], /if \(_lastLat !== null\) \{\s*fetchAllWeatherData\(_lastLat, _lastLon, _lastCountry, _lastRegion\);/);
