const functions = require('@google-cloud/functions-framework');
const { XMLParser } = require('fast-xml-parser');

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '_text',
    removeNSPrefix: false, // keep cap: prefix
    isArray: (name) => name === 'entry' // entries are always an array even if 1
});

const CACHE = new Map(); // key: "lat,lon" (2 decimals) → { at, data }
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_ENTRIES = 1000; // prevent unbounded growth on long-lived instances

// MeteoAlarm country name → URL slug. Keys must match the `country` field
// that Open-Meteo / Zippopotam geocoding return.
const METEOALARM_COUNTRY_SLUGS = {
    'Austria': 'austria',
    'Belgium': 'belgium',
    'Bosnia and Herzegovina': 'bosnia-herzegovina',
    'Bulgaria': 'bulgaria',
    'Croatia': 'croatia',
    'Cyprus': 'cyprus',
    'Czech Republic': 'czech-republic',
    'Denmark': 'denmark',
    'Estonia': 'estonia',
    'Finland': 'finland',
    'France': 'france',
    'Germany': 'germany',
    'Greece': 'greece',
    'Hungary': 'hungary',
    'Iceland': 'iceland',
    'Ireland': 'ireland',
    'Israel': 'israel',
    'Italy': 'italy',
    'Latvia': 'latvia',
    'Lithuania': 'lithuania',
    'Luxembourg': 'luxembourg',
    'Malta': 'malta',
    'Moldova': 'moldova',
    'Montenegro': 'montenegro',
    'Netherlands': 'netherlands',
    'North Macedonia': 'republic-of-north-macedonia',
    'Norway': 'norway',
    'Poland': 'poland',
    'Portugal': 'portugal',
    'Romania': 'romania',
    'Serbia': 'serbia',
    'Slovakia': 'slovakia',
    'Slovenia': 'slovenia',
    'Spain': 'spain',
    'Sweden': 'sweden',
    'Switzerland': 'switzerland',
    'Ukraine': 'ukraine',
    'United Kingdom': 'united-kingdom'
};

function cacheSet(key, data) {
    // Evict oldest (insertion order) if at capacity
    if (CACHE.size >= MAX_CACHE_ENTRIES && !CACHE.has(key)) {
        CACHE.delete(CACHE.keys().next().value);
    }
    CACHE.set(key, { at: Date.now(), data });
}

function titleCase(s) {
    return (s || '').replace(/\b\w/g, c => c.toUpperCase());
}

// Dedupe by (event + description), then keep only the most recent
// alert per event type. Returns filtered array.
function dedupeAndLatest(alerts, getEvent, getDesc, getStart) {
    // Dedupe
    const seen = new Set();
    const unique = [];
    for (const a of alerts) {
        const k = `${getEvent(a) || ''}|${getDesc(a) || ''}`;
        if (seen.has(k)) continue;
        seen.add(k);
        unique.push(a);
    }
    // Latest per event type
    const latestByEvent = new Map();
    for (const a of unique) {
        const key = (getEvent(a) || '').toLowerCase();
        const existing = latestByEvent.get(key);
        if (!existing || (getStart(a) || 0) > (getStart(existing) || 0)) {
            latestByEvent.set(key, a);
        }
    }
    return Array.from(latestByEvent.values());
}

// Coerce a value that may be a string, an object with _text, or null/undefined
// into a plain string. fast-xml-parser returns an object if the element has
// attributes, so we must defend against that across 38 different country feeds.
function xmlText(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return v._text || '';
    return String(v);
}

function isoToUnixSec(s) {
    if (!s) return null;
    const t = Date.parse(s);
    return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

// Fetches + normalizes MeteoAlarm alerts. Returns { features, ok } where `ok`
// signals upstream success. Handler uses `ok` to decide whether to cache.
async function fetchMeteoAlarm(country, region) {
    const slug = METEOALARM_COUNTRY_SLUGS[country];
    if (!slug) return { features: [], ok: true };

    const url = `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-${slug}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let xml;
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) {
            console.error(`alerts-proxy: meteoalarm ${slug} status ${res.status}`);
            return { features: [], ok: false };
        }
        xml = await res.text();
    } catch (err) {
        console.error('alerts-proxy: meteoalarm fetch error:', err?.name, err?.message);
        return { features: [], ok: false };
    }

    let parsed;
    try {
        parsed = xmlParser.parse(xml);
    } catch (err) {
        console.error('alerts-proxy: meteoalarm xml parse error:', err?.message);
        return { features: [], ok: false };
    }

    const entries = parsed?.feed?.entry || [];

    const raw = entries.map(e => {
        const areaDesc = xmlText(e['cap:areaDesc']);
        return {
            event: xmlText(e['cap:event']),
            severity: xmlText(e['cap:severity']) || 'Unknown',
            areaDesc,
            description: xmlText(e.title), // MeteoAlarm's title is the one-liner summary
            onsetSec: isoToUnixSec(xmlText(e['cap:onset'])),
            expiresSec: isoToUnixSec(xmlText(e['cap:expires']))
        };
    });

    const nowSec = Math.floor(Date.now() / 1000);
    const active = raw.filter(a => !a.expiresSec || a.expiresSec >= nowSec);

    let regionFiltered = active;
    if (region) {
        const r = region.toLowerCase();
        const matches = active.filter(a => {
            const d = (a.areaDesc || '').toLowerCase();
            if (!d) return false;
            return r.includes(d) || d.includes(r);
        });
        if (matches.length > 0) regionFiltered = matches;
    }

    const filtered = dedupeAndLatest(
        regionFiltered,
        a => a.event,
        a => a.description,
        a => a.onsetSec
    );

    const features = filtered.map(a => {
        const event = titleCase(a.event);
        return {
            properties: {
                event,
                headline: a.areaDesc ? `${event} — ${a.areaDesc}` : event,
                description: a.description,
                severity: a.severity,
                senderName: 'MeteoAlarm',
                start: a.onsetSec,
                end: a.expiresSec,
                tags: []
            }
        };
    });

    return { features, ok: true };
}

functions.http('alerts', async (req, res) => {
    // CORS
    res.set('Access-Control-Allow-Origin', 'https://noadsweather.com');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '3600');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const { lat, lon, country, region } = req.body || {};
    if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        res.status(400).json({ error: 'valid lat/lon required' });
        return;
    }

    // Route: MeteoAlarm countries use the Atom feed, others use OpenWeatherMap
    const useMeteoAlarm = country && METEOALARM_COUNTRY_SLUGS[country];
    const cacheKey = useMeteoAlarm
        ? `ma:${country.toLowerCase()}:${(region || '').toLowerCase()}`
        : `owm:${lat.toFixed(2)},${lon.toFixed(2)}`;

    const cached = CACHE.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        res.json(cached.data);
        return;
    }

    if (useMeteoAlarm) {
        try {
            const result = await fetchMeteoAlarm(country, region);
            if (result.ok) {
                // Only cache successful fetches — on upstream failure, preserve
                // any existing cached data so a transient outage doesn't wipe it.
                const payload = { features: result.features };
                cacheSet(cacheKey, payload);
                res.json(payload);
                return;
            }
            // Upstream failed: serve stale cache if available, else empty
            if (cached) { res.json(cached.data); return; }
            res.json({ features: [] });
            return;
        } catch (err) {
            console.error('alerts-proxy: meteoalarm handler error:', err?.message);
            if (cached) { res.json(cached.data); return; }
            res.json({ features: [] });
            return;
        }
    }

    // === OpenWeatherMap path (existing) ===
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
        console.error('alerts-proxy: OPENWEATHER_API_KEY not set');
        res.status(500).json({ error: 'API key not configured' });
        return;
    }

    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=current,minutely,hourly,daily&appid=${apiKey}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const upstream = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!upstream.ok) {
            console.error(`alerts-proxy: upstream status ${upstream.status} for ${cacheKey}`);
            // Serve stale cache if we have it
            if (cached) { res.json(cached.data); return; }
            res.json({ features: [] });
            return;
        }

        const data = await upstream.json();
        const alerts = data.alerts || [];

        const nowSec = Math.floor(Date.now() / 1000);
        const active = alerts.filter(a => !a.end || a.end >= nowSec);

        const filtered = dedupeAndLatest(
            active,
            a => a.event,
            a => a.description,
            a => a.start
        );

        const features = filtered.map(a => {
            const event = titleCase(a.event);
            return {
                properties: {
                    event,
                    headline: a.sender_name ? `${event} — ${a.sender_name}` : event,
                    description: a.description,
                    severity: 'Severe',
                    senderName: a.sender_name,
                    start: a.start,
                    end: a.end,
                    tags: a.tags || []
                }
            };
        });

        const result = { features };
        cacheSet(cacheKey, result);
        res.json(result);
    } catch (err) {
        console.error('alerts-proxy: upstream error:', err?.name, err?.message);
        if (cached) { res.json(cached.data); return; }
        res.json({ features: [] });
    }
});
