const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(html, /data-i18n="searchAnotherCity"/);
assert.match(app, /function renderWeatherSummary/);
assert.match(app, /updated-at/);
assert.match(app, /sumWindy/);
assert.match(app, /precipitation_probability\.slice\(i \* 24/);
assert.match(app, /function formatAlertTime/);
assert.match(app, /alert-meta/);
assert.match(app, /localStorage\.getItem\('layoutLocked'\) !== 'false'/);
assert.match(app, /hourly\.wind_speed_10m\[i\]/);
assert.match(app, /windUnit\(\)/);
assert.match(app, /current: '.*visibility/);
assert.match(app, /current\.visibility/);
assert.match(app, /hourly\.precipitation_probability\[i\]/);
assert.match(app, /t\('visibility'\)/);
assert.match(css, /\.updated-at/);
assert.match(css, /\.alert-meta/);
assert.match(css, /\.hourly-wind/);
assert.match(css, /\.hourly-precip/);
