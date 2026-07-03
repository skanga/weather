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
        let radarLoadToken = 0;
        const calls = [];
        let pastFrames = [];
        let futureFrames = [];
        let futureRejects = false;
        const container = { innerHTML: '' };
        const document = {
            getElementById(id) {
                if (id === 'radar-container') return container;
                return null;
            },
        };
        const console = { warn(...args) { calls.push(['warn', args.join(' ')]); } };
        function t(key) { return key; }
        function isDarkMode() { return false; }
        async function fetchRainviewerPast() {
            calls.push(['past']);
            return pastFrames;
        }
        async function fetchNoadsradarFuture() {
            calls.push(['future']);
            if (futureRejects) throw new Error('future failed');
            return futureFrames;
        }
        const NOADSRADAR_BASE = 'https://noadsradar.example';
        ${functionSource('inConusBounds')}
        ${functionSource('loadRadar')}

        return {
            calls,
            container,
            loadRadar,
            setFrames(past, future) { pastFrames = past; futureFrames = future; },
            setFutureRejects(v) { futureRejects = v; },
        };
    `)();
}

(async () => {
    {
        const helpers = makeHelpers();
        await helpers.loadRadar(47.6062, -122.3321);
        assert.deepStrictEqual([...helpers.calls.map(c => c[0])].sort(), ['future', 'past'],
            'CONUS radar loads should request both past and future frames');
        assert.match(helpers.container.innerHTML, /radarUnavailable/,
            'empty radar frame responses should render an unavailable state');
    }

    {
        const helpers = makeHelpers();
        await helpers.loadRadar(51.5074, -0.1278);
        assert.deepStrictEqual(helpers.calls.map(c => c[0]), ['past'],
            'non-CONUS radar loads should skip NoAdsRadar future frames');
        assert.match(helpers.container.innerHTML, /radarUnavailable/);
    }

    {
        const helpers = makeHelpers();
        helpers.setFutureRejects(true);
        await helpers.loadRadar(47.6062, -122.3321);
        assert.ok(helpers.calls.some(c => c[0] === 'warn'), 'NoAdsRadar failures should be logged and swallowed');
        assert.match(helpers.container.innerHTML, /radarUnavailable/,
            'NoAdsRadar failure should fall back instead of breaking radar rendering');
    }
})().catch(err => {
    console.error(err);
    process.exit(1);
});
