const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.resolve(__dirname, '..', 'css', 'style.css'), 'utf8');

assert.match(
    css,
    /@media\s*\(max-width:\s*600px\)[\s\S]*\.weather-col:empty\s*\{[\s\S]*min-height:\s*0\s*;/,
    'empty weather columns should collapse on mobile'
);
