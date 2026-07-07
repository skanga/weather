// Characterization + regression tests for the post-review duplicate-code
// cleanup pass. These pin observable behavior before/after each refactor.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

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

// --- renderHourly must format hour labels exactly like fmtHour -------------
{
    const t = k => k;

    // 12h format
    {
        const section = { innerHTML: '', querySelector: () => null };
        const renderHourly = new Function('document', 't', 'units', 'windUnit', 'weatherInfo', 'isHourNight', 'initDragScroll', `
            ${functionSource('fmtHour')}
            ${functionSource('renderHourly')}
            return renderHourly;
        `)({ getElementById: () => section }, t, { time24h: false }, () => 'km/h', () => ({ icon: '☀️' }), () => false, () => {});

        const noonTomorrow = new Date(Date.now() + 24 * 3600 * 1000);
        noonTomorrow.setHours(12, 0, 0, 0);
        const hourly = {
            time: [noonTomorrow.toISOString()],
            weather_code: [0], wind_speed_10m: [10], temperature_2m: [20], precipitation_probability: [0],
        };
        renderHourly(hourly);
        assert.match(section.innerHTML, />12pm</, '12h format renders noon as 12pm');
    }

    // 24h format
    {
        const section = { innerHTML: '', querySelector: () => null };
        const renderHourly = new Function('document', 't', 'units', 'windUnit', 'weatherInfo', 'isHourNight', 'initDragScroll', `
            ${functionSource('fmtHour')}
            ${functionSource('renderHourly')}
            return renderHourly;
        `)({ getElementById: () => section }, t, { time24h: true }, () => 'km/h', () => ({ icon: '☀️' }), () => false, () => {});

        const noonTomorrow = new Date(Date.now() + 24 * 3600 * 1000);
        noonTomorrow.setHours(12, 0, 0, 0);
        const hourly = {
            time: [noonTomorrow.toISOString()],
            weather_code: [0], wind_speed_10m: [10], temperature_2m: [20], precipitation_probability: [0],
        };
        renderHourly(hourly);
        assert.match(section.innerHTML, />12:00</, '24h format renders noon as 12:00');
    }
}

// renderHourly should delegate to fmtHour rather than recompute the label inline.
assert.match(functionSource('renderHourly'), /fmtHour\(/, 'renderHourly should reuse fmtHour instead of duplicating its logic');

// --- avgTempMinRange is the single source of truth for day-background colors --
{
    const helpers = new Function(`
        ${functionSource('avgTempMinRange')}
        return { avgTempMinRange };
    `)();
    assert.deepStrictEqual(helpers.avgTempMinRange([10, 15, 20]), { min: 10, max: 20, range: 10 });
    // All-equal temps must guard the divisor to 1, not 0.
    assert.deepStrictEqual(helpers.avgTempMinRange([15, 15, 15]), { min: 15, max: 15, range: 1 });
}

// renderDaily and updateDayBackgrounds should both go through the shared helper
// instead of each recomputing (or, in renderDaily's loop, re-recomputing) min/max.
assert.match(functionSource('renderDaily'), /avgTempMinRange\(avgTemps\)/, 'renderDaily should use the shared helper');
assert.match(functionSource('updateDayBackgrounds'), /avgTempMinRange\(avgTemps\)/, 'updateDayBackgrounds should use the shared helper');
assert.doesNotMatch(functionSource('renderDaily'), /Math\.min\(\.\.\.avgTemps\)/,
    'renderDaily should not recompute min/max on every day-header iteration');

// --- renderDaily should compute each axis's labels once, not twice --------
{
    const src = functionSource('renderDaily');
    const calls = src.match(/(?<!function )makeLabels\(/g) || [];
    assert.strictEqual(calls.length, 4, 'renderDaily should call makeLabels once per chart (4 charts), not once per axis (8)');
}

// --- renderSunMoon: moonrise/moonset order swaps correctly, template not duplicated --
{
    function runSunMoon(moonIsUp) {
        const doc = {
            _moon: { innerHTML: '' }, _sun: { innerHTML: '' },
            getElementById(id) { return id === 'moon-section' ? this._moon : this._sun; },
        };
        const renderSunMoon = new Function('document', 't', 'fmtTimeUnit', 'getLocaleForDate', 'getMoonPhase', 'getMoonTimes', `
            ${functionSource('renderSunMoon')}
            return renderSunMoon;
        `)(
            doc,
            k => k,
            d => (d ? 'T' : ''),
            () => 'en',
            () => ({ icon: '🌗', name: 'phase-name' }),
            () => ({ rise: new Date('2024-01-01T10:00:00Z'), set: new Date('2024-01-01T22:00:00Z'), moonIsUp })
        );
        renderSunMoon({ sunrise: ['2024-01-01T06:00:00'], sunset: ['2024-01-01T18:00:00'] }, 0, 0, 0);
        return doc._moon.innerHTML;
    }

    const upHtml = runSunMoon(true);
    assert.ok(upHtml.indexOf('moonset') < upHtml.indexOf('phase') && upHtml.indexOf('phase') < upHtml.lastIndexOf('moonrise'),
        'moon up: moonset (the next event) renders before the phase, moonrise after');

    const downHtml = runSunMoon(false);
    assert.ok(downHtml.indexOf('moonrise') < downHtml.indexOf('phase') && downHtml.indexOf('phase') < downHtml.lastIndexOf('moonset'),
        'moon down: moonrise renders before the phase, moonset after');
}

// The moonrise/moonset markup should be written once and reused, not copy-pasted
// into both the "first" and "last" branches.
{
    const src = functionSource('renderSunMoon');
    const moonriseOccurrences = (src.match(/'moonrise'/g) || []).length;
    const moonsetOccurrences = (src.match(/'moonset'/g) || []).length;
    assert.strictEqual(moonriseOccurrences, 1, 'moonrise markup should be written once');
    assert.strictEqual(moonsetOccurrences, 1, 'moonset markup should be written once');
}

// --- Language UI: multi-flag rendering should come from data, not per-language branches --
{
    function runLangUI(curLang) {
        const langBtn = { innerHTML: '', addEventListener() {} };
        const langList = { innerHTML: '', querySelectorAll: () => [] };
        const doc = {
            addEventListener() {},
            getElementById(id) {
                if (id === 'language-btn') return langBtn;
                if (id === 'language-popover') return { hidden: true };
                if (id === 'language-list') return langList;
                return null;
            },
        };
        const testFlags = {
            en: [{ path: '/img/flags/en.png', alt: 'US' }, { path: '/img/flags/gb.png', alt: 'UK' }],
            pt: [{ path: '/img/flags/pt-br.png', alt: 'BR' }, { path: '/img/flags/pt-eu.png', alt: 'PT' }],
            fr: [{ path: '/img/flags/fr.png', alt: '' }],
        };
        const testNames = { en: 'English', pt: 'Português', fr: 'Français' };
        const initLanguageUI = new Function('document', 'getCurrentLang', 'assetUrl', 'LANGUAGE_FLAGS', 'LANGUAGE_NAMES', 't', `
            ${functionSource('initLanguageUI')}
            return initLanguageUI;
        `)(doc, () => curLang, p => p, testFlags, testNames, k => k);
        initLanguageUI();
        return { langBtn, langList };
    }

    const multi = runLangUI('en');
    assert.strictEqual((multi.langBtn.innerHTML.match(/<img/g) || []).length, 2, 'button shows two flags for a dual-flag language');
    assert.match(multi.langBtn.innerHTML, /alt="US"/);
    assert.match(multi.langBtn.innerHTML, /alt="UK"/);
    assert.match(multi.langList.innerHTML, /<span class="lang-flags">/, 'list wraps multi-flag entries in lang-flags');

    const single = runLangUI('fr');
    assert.strictEqual((single.langBtn.innerHTML.match(/<img/g) || []).length, 1, 'button shows one flag for a single-flag language');
    // en and pt (dual-flag) get wrapped; fr (single-flag) uses the plain lang-flag img.
    assert.strictEqual((single.langList.innerHTML.match(/<span class="lang-flags">/g) || []).length, 2,
        'only the dual-flag languages (en, pt) get wrapped');
    assert.match(single.langList.innerHTML, /<img src="\/img\/flags\/fr\.png" class="lang-flag"/, 'single-flag language uses the plain lang-flag img');
}

// The per-language special cases should be gone — flags come from the data table.
assert.doesNotMatch(appSrc, /curLang === 'en'/, 'language button should not special-case English flags');
assert.doesNotMatch(appSrc, /code === 'en'/, 'language list should not special-case English flags');
assert.doesNotMatch(appSrc, /curLang === 'pt'/, 'language button should not special-case Portuguese flags');
assert.doesNotMatch(appSrc, /code === 'pt'/, 'language list should not special-case Portuguese flags');

// --- computeChartRanges/drawAllCharts should share sliced arrays, not each re-slice --
{
    const helpers = new Function(`
        ${functionSource('computeChartRanges')}
        return { computeChartRanges };
    `)();
    const hourly = {
        temperature_2m: [10, 12, 14, 16],
        apparent_temperature: [9, 11, 13, 15],
        dew_point_2m: [5, 6, 7, 8],
        precipitation: [0, 1, 0, 2],
        wind_speed_10m: [3, 4, 5, 6],
    };
    const r = helpers.computeChartRanges(hourly, 4);
    assert.deepStrictEqual(r.temp.series, { temp: [10, 12, 14, 16], feels: [9, 11, 13, 15], dew: [5, 6, 7, 8] },
        'computeChartRanges should expose the sliced temp series for reuse');
    assert.deepStrictEqual(r.precip.series, [0, 1, 0, 2], 'computeChartRanges should expose the sliced precip series for reuse');
    assert.deepStrictEqual(r.wind.series, [3, 4, 5, 6], 'computeChartRanges should expose the sliced wind series for reuse');
}

{
    const src = functionSource('drawAllCharts');
    const sliceCalls = (src.match(/\.slice\(0, hours\)/g) || []).length;
    assert.strictEqual(sliceCalls, 5,
        'drawAllCharts should reuse r.temp.series/r.precip.series/r.wind.series instead of re-slicing temp/feels/dew/precip/wind (only cloud/precipChance/humidity/pressure/dirs still need their own slice)');
    assert.match(src, /r\.temp\.series/, 'drawAllCharts should read the temp chart data from r.temp.series');
    assert.match(src, /r\.precip\.series/, 'drawAllCharts should read precip data from r.precip.series');
    assert.match(src, /r\.wind\.series/, 'drawAllCharts should read wind data from r.wind.series');
}

// --- Tile retry-on-error logic should be one shared helper, not duplicated --
{
    const helpers = new Function(`
        ${functionSource('attachTileRetry')}
        return { attachTileRetry };
    `)();

    function fakeImg() {
        return { src: '', dataset: { retries: '0' }, style: {} };
    }

    // Simulate the global setTimeout so retries run synchronously and in order.
    const originalSetTimeout = global.setTimeout;
    const scheduled = [];
    global.setTimeout = (fn, ms) => scheduled.push({ fn, ms });
    try {
        const img = fakeImg();
        helpers.attachTileRetry(img, 'https://example.test/tile.png');

        img.onerror(); // 1st failure
        assert.strictEqual(img.dataset.retries, '1');
        assert.strictEqual(scheduled.length, 1);
        assert.strictEqual(scheduled[0].ms, 1000);
        scheduled.shift().fn(); // run the retry
        assert.match(img.src, /tile\.png\?r=1$/);

        img.onerror(); // 2nd failure
        assert.strictEqual(img.dataset.retries, '2');
        scheduled.shift().fn();
        assert.match(img.src, /r=2$/);

        img.onerror(); // 3rd failure
        assert.strictEqual(img.dataset.retries, '3');
        scheduled.shift().fn();
        assert.match(img.src, /r=3$/);

        img.onerror(); // 4th failure — give up
        assert.strictEqual(img.style.visibility, 'hidden');
        assert.strictEqual(scheduled.length, 0, 'no further retry should be scheduled once given up');
    } finally {
        global.setTimeout = originalSetTimeout;
    }
}

// Both tile-loading call sites should delegate to the shared helper instead of
// each hand-rolling the same retry/backoff logic.
{
    const eagerAttach = appSrc.slice(appSrc.indexOf("querySelectorAll('img[src]:not([data-src])')"));
    assert.match(eagerAttach.slice(0, 300), /attachTileRetry\(/, 'eager tile loading should use the shared retry helper');
    assert.match(functionSource('loadFrame'), /attachTileRetry\(/, 'loadFrame should use the shared retry helper');
    const onerrorCount = (appSrc.match(/\.onerror = function/g) || []).length;
    assert.strictEqual(onerrorCount, 1, 'the retry-on-error closure should be written once, not duplicated per call site');
}

// --- Drag-start/end visual bookkeeping shared between the two drag handlers --
{
    const helpers = new Function(`
        ${functionSource('startDragVisual')}
        ${functionSource('endDragVisual')}
        return { startDragVisual, endDragVisual };
    `)();

    function fakeEl() {
        const classes = new Set();
        return {
            style: {},
            classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
        };
    }

    const el = fakeEl();
    helpers.startDragVisual(el, 10, 20, 300);
    assert.ok(el.classList.contains('section-dragging'));
    assert.strictEqual(el.style.position, 'fixed');
    assert.strictEqual(el.style.top, '10px');
    assert.strictEqual(el.style.left, '20px');
    assert.strictEqual(el.style.width, '300px');
    assert.strictEqual(el.style.zIndex, '999');

    helpers.endDragVisual(el);
    assert.ok(!el.classList.contains('section-dragging'));
    assert.strictEqual(el.style.position, '');
    assert.strictEqual(el.style.top, '');
    assert.strictEqual(el.style.left, '');
    assert.strictEqual(el.style.width, '');
    assert.strictEqual(el.style.zIndex, '');
}

assert.match(functionSource('initSectionDrag'), /startDragVisual\(/, 'initSectionDrag should reuse the shared drag-visual helper');
assert.match(functionSource('initSectionDrag'), /endDragVisual\(/, 'initSectionDrag should reuse the shared drag-visual helper');
assert.match(functionSource('initChartDrag'), /startDragVisual\(/, 'initChartDrag should reuse the shared drag-visual helper');
assert.match(functionSource('initChartDrag'), /endDragVisual\(/, 'initChartDrag should reuse the shared drag-visual helper');

console.log('cleanup-pass: all assertions passed');
