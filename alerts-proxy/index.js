const functions = require('@google-cloud/functions-framework');

const CACHE = new Map(); // key: "lat,lon" (2 decimals) → { at, data }
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_ENTRIES = 1000; // prevent unbounded growth on long-lived instances

// Weak browser-origin filter. This is not quota protection: non-browser
// callers can spoof Origin/Referer. Real abuse control belongs at the
// platform/API layer. OPTIONS preflight is whitelisted earlier because
// browsers may omit Origin on preflight.
const ALLOWED_HOSTS = new Set(['noadsweather.com', 'www.noadsweather.com']);
const DEFAULT_CORS_ORIGIN = 'https://noadsweather.com';

function getCorsOrigin(req) {
    const origin = req.headers.origin || '';
    try {
        const host = new URL(origin).hostname;
        if (ALLOWED_HOSTS.has(host)) return origin;
    } catch (e) { /* malformed/missing Origin — use default */ }
    return DEFAULT_CORS_ORIGIN;
}

function isAllowedRequest(req) {
    const origin = req.headers.origin || '';
    const referer = req.headers.referer || '';
    try {
        if (origin) {
            const host = new URL(origin).hostname;
            if (ALLOWED_HOSTS.has(host)) return true;
        }
        if (referer) {
            const host = new URL(referer).hostname;
            if (ALLOWED_HOSTS.has(host)) return true;
        }
    } catch (e) { /* malformed URL — fall through to deny */ }
    return false;
}

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

// Dedupe exact repeated alerts without hiding distinct active alerts that
// happen to share the same event type.
function dedupeAlerts(alerts, getEvent, getDesc) {
    const seen = new Set();
    const unique = [];
    for (const a of alerts) {
        const k = `${getEvent(a) || ''}|${getDesc(a) || ''}`;
        if (seen.has(k)) continue;
        seen.add(k);
        unique.push(a);
    }
    return unique;
}

function activeCachedAlerts(cached) {
    if (!cached || !cached.data || !Array.isArray(cached.data.features)) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    const features = cached.data.features.filter(f => {
        const end = f.properties && f.properties.end;
        return !end || end >= nowSec;
    });
    return features.length ? { features } : null;
}

functions.http('alerts', async (req, res) => {
    // CORS
    res.set('Access-Control-Allow-Origin', getCorsOrigin(req));
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '3600');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (!isAllowedRequest(req)) { res.status(403).json({ error: 'Forbidden' }); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const { lat, lon } = req.body || {};
    if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        res.status(400).json({ error: 'valid lat/lon required' });
        return;
    }

    const cacheKey = `owm:${lat.toFixed(2)},${lon.toFixed(2)}`;
    const cached = CACHE.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        res.json(cached.data);
        return;
    }

    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
        console.error('alerts-proxy: OPENWEATHER_API_KEY not set');
        res.status(500).json({ error: 'API key not configured' });
        return;
    }

    // Note: OWM's `lang` param does not translate alerts — alerts come in the
    // issuing agency's language regardless. Omitted here; we rely on the
    // client-side "Translate" link for cross-language reading.
    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=current,minutely,hourly,daily&appid=${apiKey}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const upstream = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!upstream.ok) {
            // Note: deliberately omit cacheKey (contains lat/lon) so coordinates
            // aren't persisted alongside Cloud Run's auto-captured remoteIp.
            console.error(`alerts-proxy: upstream status ${upstream.status}`);
            const fallback = activeCachedAlerts(cached);
            if (fallback) { res.json(fallback); return; }
            res.json({ features: [] });
            return;
        }

        const data = await upstream.json();
        const alerts = data.alerts || [];

        const nowSec = Math.floor(Date.now() / 1000);
        const active = alerts.filter(a => !a.end || a.end >= nowSec);

        const filtered = dedupeAlerts(
            active,
            a => a.event,
            a => a.description
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
        const fallback = activeCachedAlerts(cached);
        if (fallback) { res.json(fallback); return; }
        res.json({ features: [] });
    }
});

module.exports = { activeCachedAlerts, dedupeAlerts, getCorsOrigin, isAllowedRequest };
