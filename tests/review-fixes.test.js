const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
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

// Balanced-brace block starting at the first '{' at/after `from`.
function braceBlock(src, from) {
    const braceStart = src.indexOf('{', from);
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        if (src[i] === '}') depth--;
        if (depth === 0) return src.slice(braceStart, i + 1);
    }
    throw new Error('unbalanced block');
}

const block = re => appSrc.match(re)[0];

// --- 1. Radar refresh must not stack duplicate control-button listeners ----
assert.match(
    functionSource(appSrc, 'renderRadar'),
    /getElementById\('radar-refresh'\)\.addEventListener\('click', \(\) => renderRadar\(lat, lon\)\)/,
    'refresh should fully re-render (fresh DOM + listeners) instead of reusing the persistent control buttons'
);

// --- 2. API-key change handler must not race a location change -------------
{
    const handlerStart = appSrc.indexOf("openWeatherKeyInput.addEventListener('change'");
    assert.notStrictEqual(handlerStart, -1, 'openweather key input change handler should exist');
    const handlerSrc = braceBlock(appSrc, handlerStart);
    assert.match(handlerSrc, /weatherLoadToken/,
        'API-key change handler must guard its alerts refresh against a raced location change');
}

// --- 3/4. windDirection/windDirectionLong: NaN-safe, full form goes through i18n --
{
    const dir = new Function(`
        function t(key) {
            return ({
                windDirN: 'North', windDirNE: 'Northeast', windDirE: 'East', windDirSE: 'Southeast',
                windDirS: 'South', windDirSW: 'Southwest', windDirW: 'West', windDirNW: 'Northwest',
            })[key] || key;
        }
        ${functionSource(appSrc, 'windDirection')}
        ${functionSource(appSrc, 'windDirectionLong')}
        return { windDirection, windDirectionLong };
    `)();
    assert.strictEqual(dir.windDirection(undefined), '', 'windDirection(undefined) should not render "undefined"');
    assert.strictEqual(dir.windDirectionLong(NaN), '', 'windDirectionLong(NaN) should not render "undefined"');
    assert.strictEqual(dir.windDirection(90), 'E', '90deg still resolves to East abbreviation');
    assert.strictEqual(dir.windDirectionLong(45), 'Northeast', '45deg still resolves via t()');
    assert.strictEqual(dir.windDirectionLong(0), 'North', '0deg still resolves via t()');
}
assert.doesNotMatch(functionSource(appSrc, 'windDirectionLong'), /'Northeast'/,
    'cardinal words should not be hardcoded — they should come from t()');
assert.match(functionSource(appSrc, 'windDirectionLong'), /t\(/,
    'windDirectionLong should go through the i18n t() helper');
assert.match(i18nSrc, /windDirNE:\s*'Northeast'/, 'en translations should define the new wind-direction keys');

// Every supported locale should have its own translation for the wind-direction
// keys, not just English with everyone else silently falling back.
{
    const T = new Function(i18nSrc + '; return TRANSLATIONS;')();
    const dirKeys = ['windDirN', 'windDirNE', 'windDirE', 'windDirSE', 'windDirS', 'windDirSW', 'windDirW', 'windDirNW'];
    for (const lang of Object.keys(T)) {
        if (lang === 'en') continue;
        for (const key of dirKeys) {
            assert.ok(T[lang][key], `${lang}.${key} should be translated`);
        }
        // A couple of words legitimately coincide with English (e.g. German/Dutch
        // "West"), but a locale where every single one matches means it's an
        // untranslated copy-paste, not real translation.
        const matchesEnglish = dirKeys.filter(key => T[lang][key] === T.en[key]).length;
        assert.ok(matchesEnglish < dirKeys.length, `${lang} should not be a full copy of the English wind-direction text`);
    }
}

// --- 5. Missing UV index should be omitted, not mislabeled "Extreme" -------
{
    const T = new Function(i18nSrc + '; return TRANSLATIONS;')();
    const t = k => (T.en && T.en[k]) || k;
    const el = { innerHTML: '' };
    const rc = new Function('document', 't', 'units', 'isImperial', 'isNightTime', `
        ${block(/const WEATHER_ICONS = \{[\s\S]*?\n\};/)}
        ${block(/const AQI_POLLUTANTS = \{[\s\S]*?\};/)}
        ${functionSource(appSrc, 'tempUnit')} ${functionSource(appSrc, 'windUnit')} ${functionSource(appSrc, 'fmtVisibility')}
        ${functionSource(appSrc, 'weatherInfo')} ${functionSource(appSrc, 'windDirection')} ${functionSource(appSrc, 'uvLabel')}
        ${functionSource(appSrc, 'aqiLabel')} ${functionSource(appSrc, 'dominantPollutant')} ${functionSource(appSrc, 'renderCurrent')}
        return renderCurrent;
    `)({ getElementById: () => el }, t,
        { temp: 'celsius', wind: 'kmh', time24h: false }, () => false, () => false);

    rc({
        weather_code: 0, temperature_2m: 20, apparent_temperature: 20, relative_humidity_2m: 50,
        dew_point_2m: 10, wind_speed_10m: 5, wind_direction_10m: 180, wind_gusts_10m: 8,
        visibility: 10000, uv_index: undefined,
    }, null);

    assert.ok(!el.innerHTML.includes(t('uvIndex')), 'missing UV index should be omitted from the details grid');
    assert.ok(!el.innerHTML.includes('NaN'), 'missing UV index should never render NaN');
}

// --- 6. _lastCountry/_lastRegion must not carry over a stale value ---------
{
    const src = functionSource(appSrc, 'fetchAllWeatherData');
    assert.match(src, /_lastCountry = country \|\| '';/, 'country should not fall back to a stale previous value');
    assert.match(src, /_lastRegion = region \|\| '';/, 'region should not fall back to a stale previous value');
}

// --- 7. Chart drag must clean up on pointercancel, not just pointerup ------
{
    const src = functionSource(appSrc, 'initChartDrag');
    assert.match(src, /addEventListener\('pointercancel', onUp\)/, 'chart drag should listen for pointercancel too');
    assert.match(src, /removeEventListener\('pointercancel', onUp\)/, 'chart drag cleanup should remove the pointercancel listener');
}

// --- 8. AQI/NWS/OpenWeather fetches must use the timeout wrapper -----------
assert.match(functionSource(appSrc, 'fetchAirQuality'), /fetchWithTimeout\(/, 'fetchAirQuality should use fetchWithTimeout');
assert.match(functionSource(appSrc, 'fetchNWSAlerts'), /fetchWithTimeout\(/, 'fetchNWSAlerts should use fetchWithTimeout');
assert.match(functionSource(appSrc, 'fetchOpenWeatherAlerts'), /fetchWithTimeout\(/, 'fetchOpenWeatherAlerts should use fetchWithTimeout');

// --- 9. buildTileGrid must not set a doomed-by-outerHTML onerror handler ---
{
    const src = functionSource(appSrc, 'buildTileGrid');
    assert.doesNotMatch(src, /\.onerror\s*=/,
        'buildTileGrid should not assign onerror itself — it is discarded by outerHTML serialization and re-attached by the caller');
}

// --- 10. t() must not treat a locale-defined empty string as "missing" -----
{
    const t1 = new Function(`
        const TRANSLATIONS = { en: { greeting: 'Hello' }, fr: { greeting: 'Bonjour', empty: '' } };
        function getCurrentLang() { return 'fr'; }
        ${functionSource(i18nSrc, 't')}
        return t;
    `)();
    assert.strictEqual(t1('empty'), '', 'a locale-defined empty string should render blank, not fall back to the key/English');
    assert.strictEqual(t1('greeting'), 'Bonjour', 'a real translation still wins');

    const t2 = new Function(`
        const TRANSLATIONS = { en: { greeting: 'Hello' }, fr: {} };
        function getCurrentLang() { return 'fr'; }
        ${functionSource(i18nSrc, 't')}
        return t;
    `)();
    assert.strictEqual(t2('greeting'), 'Hello', 'missing-in-locale key still falls back to English');
    assert.strictEqual(t2('unknownKey'), 'unknownKey', 'entirely unknown key still falls back to the key itself');
}

console.log('review-fixes: all assertions passed');
