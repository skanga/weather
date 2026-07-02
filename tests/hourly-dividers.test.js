const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.resolve(__dirname, '..', 'css', 'style.css'), 'utf8');

const hourlyScroll = css.match(/\.hourly-scroll\s*\{([^}]*)\}/);
assert.ok(hourlyScroll, 'hourly scroll rule should exist');
assert.match(hourlyScroll[1], /gap:\s*0\s*;/, 'hourly strip should use borders instead of gaps');

const hourlyItem = css.match(/\.hourly-item\s*\{([^}]*)\}/);
assert.ok(hourlyItem, 'hourly item rule should exist');
assert.match(hourlyItem[1], /min-width:\s*58px\s*;/, 'hourly items should leave room for border padding');
assert.match(hourlyItem[1], /border-right:\s*1px solid rgba\(209,\s*213,\s*219,\s*0\.45\)\s*;/, 'hourly items should have a faint divider');
assert.match(hourlyItem[1], /padding:\s*0 0\.45rem\s*;/, 'hourly items should preserve spacing without flex gap');

assert.match(css, /\.hourly-item:last-child\s*\{[^}]*border-right:\s*none\s*;/, 'last hourly item should not have a trailing divider');
