/**
 * Duplicate and near-duplicate detection across src/items.
 *
 * Usage:
 *   node scripts/duplicate-warn.js           # print warnings, exit 0
 *   node scripts/duplicate-warn.js --strict  # exit 1 on slug / identifier collisions
 *   node scripts/duplicate-warn.js --fail-on-warn  # exit 1 if any warning emitted
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const { isPlainBoxSize } = require('./lib/data-policy');

const SRC_DIR = path.join(__dirname, '../src/items');

function parseArgs(argv) {
    return {
        strict: argv.includes('--strict'),
        failOnWarn: argv.includes('--fail-on-warn')
    };
}

function loadItems() {
    const files = glob.sync('**/*.json', { cwd: SRC_DIR });
    const items = [];
    for (const rel of files) {
        if (rel.includes('_examples') || rel.includes('brand.json')) continue;
        const filePath = path.join(SRC_DIR, rel);
        let data;
        try {
            data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            console.error(`duplicate-warn: skip unreadable ${rel}: ${e.message}`);
            continue;
        }
        const parts = rel.split(/[/\\]/).map(p => p.replace('.json', ''));
        const derivedId = parts.join('_').replace(/\\/g, '_').toLowerCase();
        const id = data.id || derivedId;
        items.push({
            id,
            path: rel.replace(/\\/g, '/'),
            data
        });
    }
    return items;
}

function normalizeUrl(url) {
    try {
        const u = new URL(url);
        u.hash = '';
        const host = u.hostname.toLowerCase();
        let p = u.pathname.replace(/\/+$/, '');
        if (p === '') p = '/';
        return `${u.protocol}//${host}${p}${u.search}`;
    } catch {
        return null;
    }
}

function normalizeName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function tokenSet(str) {
    const s = normalizeName(str);
    if (!s) return new Set();
    return new Set(s.split(' ').filter(Boolean));
}

function jaccard(a, b) {
    if (a.size === 0 && b.size === 0) return 1;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
}

function primaryBox(item) {
    const d = item.data;
    if (isPlainBoxSize(d.inner_size)) return d.inner_size;
    if (isPlainBoxSize(d.outer_size)) return d.outer_size;
    return null;
}

function axesClose(v1, v2) {
    const tol = (a, b) => Math.abs(a - b) <= Math.max(5, 0.02 * Math.max(a, b));
    return tol(v1.x, v2.x) && tol(v1.y, v2.y) && tol(v1.z, v2.z);
}

function flattenIdentifierKeys(identifiers) {
    if (!identifiers || typeof identifiers !== 'object') return [];
    const keys = [];
    for (const field of ['ean', 'upc', 'asin', 'mpn']) {
        const arr = identifiers[field];
        if (!Array.isArray(arr)) continue;
        for (const raw of arr) {
            const v = String(raw).trim();
            if (v) keys.push(`${field}:${v.toLowerCase()}`);
        }
    }
    const skus = identifiers.sku;
    if (Array.isArray(skus)) {
        for (const row of skus) {
            if (row && typeof row.value === 'string') {
                const v = row.value.trim().toLowerCase();
                if (v) keys.push(`sku:${v}`);
            }
        }
    }
    return keys;
}

function collectSourceUrls(data) {
    const urls = [];
    if (!Array.isArray(data.sources)) return urls;
    data.sources.forEach(s => {
        if (s && typeof s.url === 'string') urls.push(s.url);
    });
    return urls;
}

function main() {
    const { strict, failOnWarn } = parseArgs(process.argv.slice(2));
    const items = loadItems();

    let warnCount = 0;
    let strictViolations = 0;

    const emitStrict = msg => {
        console.error(`[duplicate-warn] STRICT: ${msg}`);
        strictViolations++;
        warnCount++;
    };

    const emitWarn = msg => {
        console.error(`[duplicate-warn] WARN: ${msg}`);
        warnCount++;
    };

    /** @type {Map<string, Array<{id:string,path:string}>>} */
    const slugToItems = new Map();
    /** @type {Map<string, Array<{id:string,path:string}>>} */
    const idKeyToItems = new Map();
    /** @type {Map<string, Array<{id:string,path:string}>>} */
    const urlToItems = new Map();

    for (const item of items) {
        const slug = item.data.slug;
        if (typeof slug === 'string' && slug.length > 0) {
            if (!slugToItems.has(slug)) slugToItems.set(slug, []);
            slugToItems.get(slug).push({ id: item.id, path: item.path });
        }

        for (const key of flattenIdentifierKeys(item.data.identifiers)) {
            if (!idKeyToItems.has(key)) idKeyToItems.set(key, []);
            idKeyToItems.get(key).push({ id: item.id, path: item.path });
        }

        for (const raw of collectSourceUrls(item.data)) {
            const nu = normalizeUrl(raw);
            if (!nu) continue;
            if (!urlToItems.has(nu)) urlToItems.set(nu, []);
            urlToItems.get(nu).push({ id: item.id, path: item.path });
        }
    }

    for (const [slug, list] of slugToItems) {
        const uniqIds = new Set(list.map(x => x.id));
        if (uniqIds.size > 1) {
            emitStrict(
                `duplicate slug "${slug}" used by:\n${list.map(x => `    - ${x.id} (${x.path})`).join('\n')}`
            );
        }
    }

    for (const [key, list] of idKeyToItems) {
        const uniqIds = new Set(list.map(x => x.id));
        if (uniqIds.size > 1) {
            emitStrict(
                `duplicate identifier ${key}:\n${list.map(x => `    - ${x.id} (${x.path})`).join('\n')}`
            );
        }
    }

    for (const [u, list] of urlToItems) {
        const uniqIds = new Set(list.map(x => x.id));
        if (uniqIds.size > 1) {
            emitWarn(
                `same source URL (${u}) referenced by:\n${list.map(x => `    - ${x.id} (${x.path})`).join('\n')}`
            );
        }
    }

    const byBrand = new Map();
    for (const item of items) {
        const b = String(item.data.brand || '').toLowerCase();
        if (!byBrand.has(b)) byBrand.set(b, []);
        byBrand.get(b).push(item);
    }

    for (const [, group] of byBrand) {
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const a = group[i];
                const b = group[j];
                if (a.id === b.id) continue;

                const ta = tokenSet(a.data.name);
                const tb = tokenSet(b.data.name);
                const jac = jaccard(ta, tb);
                const ba = primaryBox(a);
                const bb = primaryBox(b);

                if (jac >= 0.85 && ba && bb && axesClose(ba, bb)) {
                    emitWarn(
                        `similar name + dimensions (same brand "${a.data.brand}"):\n` +
                            `    - ${a.id} (${a.path}) "${a.data.name}"\n` +
                            `    - ${b.id} (${b.path}) "${b.data.name}"`
                    );
                }
            }
        }
    }

    if (warnCount === 0) {
        console.error('duplicate-warn: no duplicate signals.');
    }

    if (strictViolations > 0 && strict) {
        process.exit(1);
    }
    if (failOnWarn && warnCount > 0) {
        process.exit(1);
    }
}

main();
