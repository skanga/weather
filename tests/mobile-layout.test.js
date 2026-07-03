const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.resolve(__dirname, '..', 'css', 'style.css'), 'utf8');

const mobileBlock = css.match(/@media\s*\(max-width:\s*600px\)\s*\{[\s\S]*?\.section-controls/);
assert.ok(mobileBlock, 'mobile weather layout block should exist');

const emptyColumnRule = mobileBlock[0].match(/\.weather-col:empty\s*\{([^}]*)\}/);
assert.ok(emptyColumnRule, 'mobile empty weather column rule should exist');
assert.match(
    emptyColumnRule[1],
    /display:\s*none\s*;/,
    'empty weather columns should not take mobile flex gap space'
);

const searchInputRule = css.match(/#search-input\s*\{([^}]*)\}/);
assert.ok(searchInputRule, 'search input rule should exist');
assert.match(
    searchInputRule[1],
    /min-width:\s*0\s*;/,
    'search input should be allowed to shrink beside the search button on mobile'
);

assert.doesNotMatch(
    css,
    /@media\s*\(max-width:\s*600px\)\s*\{[\s\S]*?#search-form\s*\{[^}]*flex-direction:\s*column\s*;/,
    'mobile search form should keep the city box and search button on one row'
);
