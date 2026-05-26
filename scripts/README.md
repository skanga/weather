# Build Scripts

## build-cities.js

Generates SEO landing pages for the cities listed in `cities.json`.

Run from the repo root:

```bash
node scripts/build-cities.js
```

Outputs:
- `cities/{slug}/index.html` for each city × language combination
- `sitemap.xml` at repo root

The script is idempotent — running it twice produces identical output. There
is no `npm` or `yarn`; the script uses only Node built-ins.

## Editing the city list

`cities.json` is the source of truth. Each entry has:

- `slug` — URL slug for the native-language page (e.g. `lisboa`, `austin-tx`)
- `enSlug` — URL slug for the English variant (only if `nativeLang !== 'en'`)
- `displayName` — object mapping language code to the city name in that language
- `lat`, `lon` — coordinates (used at runtime to fetch weather)
- `country`, `region` — ISO country code and region/state (used for units)
- `nativeLang` — language code from i18n.js (en, es, fr, de, it, pt, nl, pl,
  sv, ru, ja, zh, ko, ar, hi)

After editing, re-run the build script and commit both `cities.json` and the
regenerated `cities/` directory and `sitemap.xml`.

## Drift check

Make sure committed files match `cities.json` at any time:

```bash
node scripts/build-cities.js
git diff --exit-code cities sitemap.xml
```

Exit code 0 = no drift. Non-zero = regenerate and commit the diff.

## Adding a new translation key for landing pages

If you add a translation key used by the build script (e.g. a new heading),
add it to all 15 languages in `js/i18n.js` first, then update
`scripts/build-cities.js` to consume it.

## Contract: js/i18n.js must remain side-effect-free

The build script loads `js/i18n.js` via `new Function(src + '; return TRANSLATIONS;')`
to extract translations at build time. This means `i18n.js` must not touch
`window`, `document`, or `navigator` at the top level — only inside function
bodies. There's a comment at the top of `i18n.js` documenting this.
