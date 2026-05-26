#!/usr/bin/env node
// Build script for noadsweather.com SEO city landing pages.
// Reads scripts/cities.json + js/i18n.js TRANSLATIONS and writes static
// HTML files to cities/{slug}/index.html. Also generates sitemap.xml.
//
// Run from repo root:  node scripts/build-cities.js
//
// The script is idempotent — running it twice produces identical output.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://noadsweather.com';
const CITIES_JSON = path.join(__dirname, 'cities.json');
const TEMPLATE_HTML = path.join(ROOT, 'index.html');
const I18N_JS = path.join(ROOT, 'js', 'i18n.js');
const CITIES_DIR = path.join(ROOT, 'cities');
const SITEMAP_XML = path.join(ROOT, 'sitemap.xml');

// --- Load inputs ------------------------------------------------------------

const cities = JSON.parse(fs.readFileSync(CITIES_JSON, 'utf8'));
const templateHtml = fs.readFileSync(TEMPLATE_HTML, 'utf8');
const translations = loadTranslations();

console.log(`Loaded ${cities.length} cities.`);

// --- Generate pages ---------------------------------------------------------

let pagesWritten = 0;
const allPageUrls = [{ url: SITE_URL + '/', priority: '1.0' }];
const variantGroups = []; // for hreflang sitemap entries

for (const city of cities) {
    const native = buildPage(city, city.nativeLang, city.slug);
    pagesWritten += writePage(native);

    if (city.nativeLang !== 'en') {
        const en = buildPage(city, 'en', city.enSlug);
        pagesWritten += writePage(en);
        variantGroups.push({ native, en });
        allPageUrls.push({ url: native.canonical, priority: '0.7' });
        allPageUrls.push({ url: en.canonical,     priority: '0.7' });
    } else {
        allPageUrls.push({ url: native.canonical, priority: '0.7' });
    }
}

console.log(`Wrote ${pagesWritten} pages.`);

// --- Generate sitemap -------------------------------------------------------

writeSitemap(allPageUrls, variantGroups);
console.log('Wrote sitemap.xml');

// === Helpers ================================================================

function loadTranslations() {
    // i18n.js defines `const TRANSLATIONS = { en: {...}, es: {...}, ... }`
    // We evaluate it in a sandbox-ish way by reading the file and `Function`-ing it.
    const src = fs.readFileSync(I18N_JS, 'utf8');
    // Extract just the TRANSLATIONS object literal. We use a Function wrapper
    // rather than vm.runInThisContext to avoid side effects.
    const fn = new Function(src + '; return TRANSLATIONS;');
    return fn();
}

function buildPage(city, lang, slug) {
    const cityName = city.displayName[lang] || city.displayName.en;
    const titleTemplate = translations[lang].cityPageTitle;
    const blurbTemplate = translations[lang].cityPageSeoBlurb;
    const title = titleTemplate.replace('{city}', cityName);
    const description = blurbTemplate.replace(/{city}/g, cityName);
    const canonical = `${SITE_URL}/cities/${slug}/`;

    const seoCity = {
        slug,
        lang,
        lat: city.lat,
        lon: city.lon,
        name: city.displayName.en, // canonical English name for Open-Meteo / NWS lookups
        displayName: cityName,
        country: city.country,
        region: city.region || '',
    };

    const otherCities = pickOtherCities(city, lang, cities);

    return {
        slug,
        lang,
        canonical,
        title,
        description,
        seoCity,
        otherCities,
        // For hreflang we need both URLs (native + en variant)
        nativeUrl: `${SITE_URL}/cities/${city.slug}/`,
        enUrl: city.enSlug ? `${SITE_URL}/cities/${city.enSlug}/` : null,
        isNativeEn: city.nativeLang === 'en',
    };
}

function writePage(page) {
    const html = renderTemplate(page);
    const dir = path.join(CITIES_DIR, page.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    return 1;
}

function renderTemplate(page) {
    let html = templateHtml;

    // 1. html lang attribute
    html = html.replace(/<html\s+lang="[^"]*">/, `<html lang="${escapeAttr(page.lang)}">`);

    // 2. title
    html = html.replace(/<title>[^<]*<\/title>/,
        `<title>${escapeHtml(page.title)} — NoAdsWeather</title>`);

    // 3. meta description
    html = html.replace(/<meta\s+name="description"\s+content="[^"]*">/,
        `<meta name="description" content="${escapeAttr(page.description)}">`);

    // 4. Inject canonical + hreflang + window._seoCity into <head>, just
    //    before the existing stylesheet link so it appears before app.js loads.
    const headInjection = buildHeadInjection(page);
    html = html.replace('<link rel="stylesheet" href="css/style.css">',
        headInjection + '\n    <link rel="stylesheet" href="/css/style.css">');

    // 5. Make script paths absolute so they resolve from /cities/{slug}/
    html = html.replace(/<script src="js\/i18n\.js"><\/script>/,
        '<script src="/js/i18n.js"></script>');
    html = html.replace(/<script src="js\/app\.js"><\/script>/,
        '<script src="/js/app.js"></script>');

    // Populate <nav id="other-cities">
    const otherCitiesHtml = page.otherCities
        .map(o => `<li><a href="/cities/${escapeAttr(o.slug)}/">${escapeHtml(o.name)}</a></li>`)
        .join('\n                    ');
    const otherCitiesHeading = otherCitiesHeadingText(page.lang);
    // Regex tolerates either LF or CRLF line endings in the source template.
    html = html.replace(
        /<nav id="other-cities" hidden>\r?\n\s*<h3 id="other-cities-heading"><\/h3>\r?\n\s*<ul><\/ul>\r?\n\s*<\/nav>/,
        `<nav id="other-cities">\n                <h3>${escapeHtml(otherCitiesHeading)}</h3>\n                <ul>\n                    ${otherCitiesHtml}\n                </ul>\n            </nav>`
    );

    return html;
}

function buildHeadInjection(page) {
    const lines = [
        `    <link rel="canonical" href="${escapeAttr(page.canonical)}">`,
    ];
    // hreflang only relevant if there's a sibling variant
    if (page.enUrl) {
        lines.push(`    <link rel="alternate" hreflang="${escapeAttr(page.lang)}" href="${escapeAttr(page.nativeUrl)}">`);
        lines.push(`    <link rel="alternate" hreflang="en" href="${escapeAttr(page.enUrl)}">`);
        lines.push(`    <link rel="alternate" hreflang="x-default" href="${escapeAttr(page.enUrl)}">`);
    } else if (page.isNativeEn) {
        lines.push(`    <link rel="alternate" hreflang="en" href="${escapeAttr(page.canonical)}">`);
        lines.push(`    <link rel="alternate" hreflang="x-default" href="${escapeAttr(page.canonical)}">`);
    }
    lines.push('    <script>');
    lines.push(`        window._seoCity = ${JSON.stringify(page.seoCity).replace(/</g, '\\u003c')};`);
    lines.push('    </script>');
    return lines.join('\n');
}

function writeSitemap(urls, variantGroups) {
    // Simple sitemap; hreflang annotations on the variant pages
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ];
    for (const u of urls) {
        lines.push('  <url>');
        lines.push(`    <loc>${escapeXml(u.url)}</loc>`);
        // For pages that are part of a variant group, emit alternate links
        const vg = variantGroups.find(g => g.native.canonical === u.url || g.en.canonical === u.url);
        if (vg) {
            lines.push(`    <xhtml:link rel="alternate" hreflang="${escapeAttr(vg.native.lang)}" href="${escapeXml(vg.native.canonical)}"/>`);
            lines.push(`    <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(vg.en.canonical)}"/>`);
            lines.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(vg.en.canonical)}"/>`);
        }
        lines.push('    <changefreq>monthly</changefreq>');
        lines.push(`    <priority>${u.priority}</priority>`);
        lines.push('  </url>');
    }
    lines.push('</urlset>');
    fs.writeFileSync(SITEMAP_XML, lines.join('\n') + '\n', 'utf8');
}

function pickOtherCities(currentCity, currentLang, allCities) {
    // Pick up to 6 other cities for the internal link block.
    // Prefer same continent / nearby coords for relevance.
    const others = allCities
        .filter(c => c.slug !== currentCity.slug)
        .map(c => ({
            ...c,
            distance: haversine(currentCity.lat, currentCity.lon, c.lat, c.lon),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 6);

    // Choose URL + display name for the current page's language preference.
    return others.map(o => {
        // Use the variant matching the current page's language if it exists,
        // otherwise fall back to native, then English.
        let slug = o.slug;
        let name = o.displayName[currentLang] || o.displayName[o.nativeLang] || o.displayName.en;
        if (currentLang === 'en' && o.enSlug) {
            slug = o.enSlug;
            name = o.displayName.en;
        }
        return { slug, name };
    });
}

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat/2) ** 2 +
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
              Math.sin(dLon/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function otherCitiesHeadingText(lang) {
    const headings = {
        en: 'Other cities',
        es: 'Otras ciudades',
        fr: 'Autres villes',
        de: 'Andere Städte',
        it: 'Altre città',
        pt: 'Outras cidades',
        nl: 'Andere steden',
        pl: 'Inne miasta',
        sv: 'Andra städer',
        ru: 'Другие города',
        ja: '他の都市',
        zh: '其他城市',
        ko: '다른 도시',
        ar: 'مدن أخرى',
        hi: 'अन्य शहर',
    };
    return headings[lang] || headings.en;
}

// === Tiny escape helpers ====================================================

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
}

function escapeAttr(s) { return escapeHtml(s); }
function escapeXml(s) { return escapeHtml(s); }
