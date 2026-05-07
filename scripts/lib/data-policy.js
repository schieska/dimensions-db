/**
 * Shared validation policy (URLs, bounding boxes). Used by validate.js.
 */

const SHORTENER_HOSTNAMES = new Set([
    'bit.ly',
    't.co',
    'tinyurl.com',
    'goo.gl',
    'ow.ly',
    'is.gd',
    'buff.ly',
    'tiny.cc',
    'amzn.to',
    'rb.gy',
    'cutt.ly',
    'short.link',
    'rebrand.ly',
    'youtu.be'
]);

const MM_MIN = 0.5;
const MM_MAX = 20000;

function isPlainBoxSize(obj) {
    return (
        obj &&
        typeof obj.x === 'number' &&
        typeof obj.y === 'number' &&
        typeof obj.z === 'number' &&
        !obj.levels &&
        !obj.polygon
    );
}

function normalizeHostname(host) {
    const h = host.toLowerCase();
    return h.startsWith('www.') ? h.slice(4) : h;
}

function isBlockedShortener(host) {
    const h = normalizeHostname(host);
    if (SHORTENER_HOSTNAMES.has(h)) return true;
    return false;
}

function validateUrl(url, contextLabel, errors) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        errors.push(`${contextLabel}: malformed URL`);
        return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.push(`${contextLabel}: only http(s) URLs are allowed (got ${parsed.protocol})`);
    }
    if (parsed.username || parsed.password) {
        errors.push(`${contextLabel}: URLs must not embed credentials`);
    }
    if (isBlockedShortener(parsed.hostname)) {
        errors.push(`${contextLabel}: shortened URL hostnames are not allowed (${parsed.hostname})`);
    }
}

function collectUrlsFromItem(item) {
    const out = [];
    const sources = item.sources;
    if (Array.isArray(sources)) {
        sources.forEach((s, i) => {
            if (s && typeof s.url === 'string') out.push([`sources[${i}].url`, s.url]);
        });
    }
    const images = item.images;
    if (Array.isArray(images)) {
        images.forEach((im, i) => {
            if (im && typeof im.url === 'string') out.push([`images[${i}].url`, im.url]);
        });
    }
    const evidence = item.evidence;
    if (Array.isArray(evidence)) {
        evidence.forEach((ev, i) => {
            if (ev && typeof ev.url === 'string') out.push([`evidence[${i}].url`, ev.url]);
        });
    }
    return out;
}

function checkSizeAxes(size, pathPrefix, errors) {
    if (!isPlainBoxSize(size)) return;
    for (const axis of ['x', 'y', 'z']) {
        const v = size[axis];
        if (v <= MM_MIN || v > MM_MAX) {
            errors.push(
                `${pathPrefix}.${axis} must be between ${MM_MIN} and ${MM_MAX} mm (got ${v})`
            );
        }
    }
}

/**
 * @param {object} item - raw item (no $schema strip needed here)
 * @param {string} relativePath - for error messages
 * @returns {string[]} policy violation messages
 */
function checkItemPolicy(item, relativePath) {
    const errors = [];
    const prefix = relativePath || item.id || '(item)';

    collectUrlsFromItem(item).forEach(([label, url]) => {
        validateUrl(url, `${prefix}: ${label}`, errors);
    });

    checkSizeAxes(item.inner_size, `${prefix}: inner_size`, errors);
    checkSizeAxes(item.outer_size, `${prefix}: outer_size`, errors);

    const inner = item.inner_size;
    const outer = item.outer_size;
    if (isPlainBoxSize(inner) && isPlainBoxSize(outer)) {
        for (const axis of ['x', 'y', 'z']) {
            if (inner[axis] > outer[axis]) {
                errors.push(
                    `${prefix}: inner_size.${axis} (${inner[axis]}) must not exceed outer_size.${axis} (${outer[axis]})`
                );
            }
        }
    }

    return errors;
}

module.exports = {
    checkItemPolicy,
    collectUrlsFromItem,
    isPlainBoxSize,
    normalizeHostname,
    SHORTENER_HOSTNAMES,
    MM_MIN,
    MM_MAX
};
