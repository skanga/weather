const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const about = fs.readFileSync(path.join(root, 'about', 'index.html'), 'utf8');
const privacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
const city = fs.readFileSync(path.join(root, 'cities', 'new-york-ny', 'index.html'), 'utf8');

assert.doesNotMatch(index, /href="\/about\/"/);
assert.match(index, /href="about\/"/);

for (const html of [about, privacy]) {
    assert.doesNotMatch(html, /href="\/(about\/|privacy\.html|cities\/|")/);
    assert.doesNotMatch(html, /(?:href|src)="\/(?:css|js)\//);
}

assert.match(about, /href="\.\.\/"/);
assert.match(about, /href="\.\.\/privacy\.html"/);
assert.match(about, /href="\.\.\/cities\/new-york-ny\/"/);
assert.match(about, /src="\.\.\/js\/i18n\.js"/);
assert.match(privacy, /href="\.\/"/);
assert.match(privacy, /href="about\/"/);
assert.match(city, /href="\/noadsweather\/css\/style\.css"/);
assert.match(city, /src="\/noadsweather\/js\/i18n\.js"/);
assert.match(city, /src="\/noadsweather\/js\/app\.js"/);
assert.match(city, /href="\/noadsweather\/about\/"/);
