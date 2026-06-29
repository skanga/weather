const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const runtimeFiles = [
    'js/app.js',
    'js/i18n.js',
    'index.html',
    'about/index.html',
    'privacy.html',
    'css/style.css',
];

for (const relPath of runtimeFiles) {
    const src = read(relPath);
    assert.doesNotMatch(src, /pollen|details-section|POLLEN_PROXY|Google Pollen|grass_pollen|birch_pollen|ragweed_pollen/i, relPath);
}

assert.doesNotMatch(read('README.md'), /pollen|Google Pollen|pollen-proxy/i);
assert.doesNotMatch(read('CONTRIBUTING.md'), /pollen/i);
assert.strictEqual(fs.existsSync(path.join(root, 'pollen-proxy')), false);
