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

const helpers = new Function(`
    const labels = {
        uvLow: '(Low)',
        uvModerate: '(Moderate)',
        uvHigh: '(High)',
        uvVeryHigh: '(Very High)',
        uvExtreme: '(Extreme)'
    };
    const t = key => labels[key] || key;
    ${functionSource(appSrc, 'uvLabel')}
    return { uvLabel };
`)();

assert.deepStrictEqual(helpers.uvLabel(8), { text: '(Very High)', color: '#dc2626' });
assert.deepStrictEqual(helpers.uvLabel(11), { text: '(Extreme)', color: '#7c3aed' });

const renderCurrent = functionSource(appSrc, 'renderCurrent');
assert.match(renderCurrent, /style="color:\$\{uvInfo\.color\};"/);

// Label/value demarcation must target the grid the markup actually uses
// (not the dead .current-detail-col selector): muted label + colon + bold value.
const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'css/style.css'), 'utf8');
assert.match(cssSrc, /\.current-details-grid \.detail-label\s*\{[^}]*color:\s*var\(--text-muted\)/, 'label is muted');
assert.match(cssSrc, /\.current-details-grid \.detail-label::after\s*\{[^}]*content:\s*':'/, 'label has a colon');
assert.match(cssSrc, /\.current-details-grid \.detail-value\s*\{[^}]*font-weight:\s*600/, 'value is emphasized');

const detailsGridRule = cssSrc.match(/\.current-details-grid\s*\{([^}]*)\}/);
assert.ok(detailsGridRule, 'current details grid rule should exist');
assert.match(detailsGridRule[1], /border-top:\s*1px solid rgba\(209,\s*213,\s*219,\s*0\.55\)\s*;/, 'details grid is separated from summary');
assert.match(detailsGridRule[1], /padding-top:\s*0\.75rem\s*;/, 'details grid divider has breathing room');
