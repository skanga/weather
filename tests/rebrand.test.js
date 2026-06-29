const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
    'index.html',
    'privacy.html',
    'about/index.html',
    'README.md',
    'CONTRIBUTING.md',
    'robots.txt',
    'scripts/build-cities.js',
    'js/app.js',
    'js/i18n.js',
    'alerts-proxy/index.js',
    'LICENSE',
    'sitemap.xml',
    'cities/new-york-ny/index.html',
];

for (const relPath of files) {
    const src = fs.readFileSync(path.join(root, relPath), 'utf8');
    assert.doesNotMatch(src, /NoAdsWeather|noadsweather\.com|noadsdude|ko-fi/, relPath);
}

assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /<h1>Weather<\/h1>/);
assert.match(fs.readFileSync(path.join(root, 'scripts/build-cities.js'), 'utf8'), /https:\/\/skanga\.github\.io\/noadsweather/);
