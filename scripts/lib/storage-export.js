/**
 * Build storage-index.json and storage-pages/*.json union exports.
 */

const fs = require('fs');
const path = require('path');
const { computeCompleteness, hasCanonicalSource, hasImage } = require('./completeness');
const { isPlainBoxSize } = require('./data-policy');

function resolveGithubRepo() {
    try {
        const pkgPath = path.join(__dirname, '../../package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const repo = pkg.repository;
        if (typeof repo === 'string') {
            const m = repo.match(/github\.com[/:]([^/]+\/[^/.]+)/i);
            if (m) return m[1].replace(/\.git$/, '');
        }
        if (repo && typeof repo.url === 'string') {
            const m = repo.url.match(/github\.com[/:]([^/]+\/[^/.]+)/i);
            if (m) return m[1].replace(/\.git$/, '');
        }
    } catch (_) {
        /* ignore */
    }
    return process.env.GITHUB_REPOSITORY || 'schieska/dimensions-db';
}

function slugFromRecord(record) {
    if (typeof record.slug === 'string' && record.slug.length >= 3) return record.slug;
    return String(record.id || '')
        .replace(/_/g, '-')
        .replace(/[^a-z0-9-]/gi, '')
        .toLowerCase();
}

function verificationStatusLabel(record) {
    if (record.verification_state) return record.verification_state;
    if (record.status === 'verified') return 'verified';
    if (record.status === 'community') return 'community';
    return 'unverified';
}

function stripSchema(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const { $schema, ...rest } = obj;
    return rest;
}

function loadBrandMap(itemsRootDir) {
    const brands = {};
    const brandFiles = [];
    function walk(dir) {
        if (!fs.existsSync(dir)) return;
        for (const name of fs.readdirSync(dir)) {
            const full = path.join(dir, name);
            const st = fs.statSync(full);
            if (st.isDirectory()) walk(full);
            else if (name === 'brand.json') brandFiles.push(full);
        }
    }
    walk(itemsRootDir);
    for (const bf of brandFiles) {
        try {
            const data = JSON.parse(fs.readFileSync(bf, 'utf8'));
            if (data.id && data.name) brands[data.id] = data.name;
        } catch (_) {
            /* skip */
        }
    }
    return brands;
}

function statusBannerCopy(derivedState, inOpenDatabase, sourceLayer) {
    if (derivedState === 'deprecated') {
        return {
            title: 'Deprecated',
            body: 'This record is deprecated or replaced. Prefer the linked replacement when available.'
        };
    }
    if (derivedState === 'disputed') {
        return {
            title: 'Disputed',
            body: 'One or more critical fields are contested. Do not use for exact-fit decisions until resolved.'
        };
    }
    if (inOpenDatabase) {
        return {
            title: 'In open database',
            body: 'Published in Dimensions DB open exports (database.json / items). Review verification and sources before exact-fit use.'
        };
    }
    return {
        title: 'Known product • not yet in the open database',
        body: 'This catalogue entry exists so you can discover it and contribute geometry. It is not yet promoted into the high-trust open database export.'
    };
}

function buildChecklist(record, comp, sourceLayer) {
    const hasMeasurements = Array.isArray(record.measurements) && record.measurements.length > 0;
    const hasEvidence = Array.isArray(record.evidence) && record.evidence.length > 0;
    return {
        product_identity: !!(record.name && record.brand && record.type),
        official_product_source: hasCanonicalSource(record),
        image: hasImage(record),
        outer_dimensions: isPlainBoxSize(record.outer_size),
        inner_dimensions: isPlainBoxSize(record.inner_size),
        measurement_evidence: hasMeasurements,
        verification:
            record.status === 'verified' ||
            record.verification_state === 'community_verified' ||
            record.verification_state === 'official_verified',
        related_items: true,
        provenance: sourceLayer === 'storage_index' ? !!record.provenance : true,
        collections: Array.isArray(record.collections) && record.collections.length > 0
    };
}

function trustLines(comp, record) {
    const lines = [];
    if (comp.exact_fit_eligible) {
        lines.push('Marked fit-ready for exact-fit use subject to your own margins and verification.');
    } else if (comp.fit_readiness === 'candidate_fit') {
        lines.push('Strong metadata; confirm evidence before treating as exact-fit.');
    } else if (comp.fit_readiness === 'compare_only') {
        lines.push('May support rough comparison; not sufficient for exact-fit without more verification.');
    } else if (comp.fit_readiness === 'browse_only') {
        lines.push('Useful for browsing and contribution; not fit-ready yet.');
    } else {
        lines.push('Not fit-ready: add dimensions and evidence via repository workflows.');
    }
    if (record.sources && record.sources[0] && record.sources[0].kind) {
        lines.push(`Primary source kind: ${record.sources[0].kind}.`);
    }
    return lines;
}

function githubBlob(repo, branch, repoRelativePath) {
    return `https://github.com/${repo}/blob/${branch}/${repoRelativePath}`;
}

function githubHistory(repo, branch, repoRelativePath) {
    return `https://github.com/${repo}/commits/${branch}/${repoRelativePath}`;
}

function issueUrl(repo, template, title) {
    const t = encodeURIComponent(title);
    return `https://github.com/${repo}/issues/new?template=${template}&title=${t}`;
}

function buildActions(repo, branch, id, repoRelativePath, sourceLayer) {
    const titleBase = `[${id}] `;
    const actions = {
        add_dimensions: issueUrl(repo, 'add-dimensions.yml', `${titleBase}Add dimensions`),
        add_official_source: issueUrl(repo, 'add-official-source.yml', `${titleBase}Add official source`),
        report_duplicate: issueUrl(repo, 'report-duplicate.yml', `${titleBase}Report duplicate`),
        report_dispute: issueUrl(repo, 'report-dispute.yml', `${titleBase}Report dispute`),
        discuss: `https://github.com/${repo}/discussions/new?category=measurements`,
        edit_source: githubBlob(repo, branch, repoRelativePath),
        view_history: githubHistory(repo, branch, repoRelativePath)
    };
    if (sourceLayer === 'storage_index') {
        actions.promotion_guide = `https://github.com/${repo}/blob/${branch}/.github/PULL_REQUEST_TEMPLATE/promote-to-open-db.md`;
    }
    return actions;
}

function buildLinks(repo, branch, repoRelativePath, id) {
    return {
        github_repo: `https://github.com/${repo}`,
        contributing: `https://github.com/${repo}/blob/${branch}/contributing.md`,
        raw_item: `https://raw.githubusercontent.com/${repo}/${branch}/${repoRelativePath}`
    };
}

function pickSimilar(allCards, selfId, brandId, limit = 6) {
    const others = allCards.filter(c => c.id !== selfId);
    const sameBrand = others.filter(c => c.brand_id === brandId);
    const rest = others.filter(c => c.brand_id !== brandId);
    const scored = [...sameBrand, ...rest];
    scored.sort((a, b) => {
        if (a.in_open_database !== b.in_open_database) return a.in_open_database ? -1 : 1;
        return b.completeness_score - a.completeness_score;
    });
    const out = [];
    const seen = new Set();
    for (const c of scored) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        out.push({
            id: c.id,
            name: c.name,
            in_open_database: c.in_open_database,
            completeness_score: c.completeness_score,
            fit_readiness: c.fit_readiness,
            page_path: c.page_path
        });
        if (out.length >= limit) break;
    }
    return out;
}

/**
 * @param {object} params
 * @param {object} params.record - raw item/index JSON (may include $schema)
 * @param {boolean} params.inOpenDatabase
 * @param {'open_database'|'storage_index'} params.sourceLayer
 * @param {string} params.repoRelativePath - path from repo root using forward slashes
 */
function buildCardAndPage(params) {
    const { record: rawRecord, inOpenDatabase, sourceLayer, repoRelativePath, brandMap, repo, branch } =
        params;
    const record = stripSchema(rawRecord);
    const id = record.id;
    const brandId = String(record.brand || '').toLowerCase();
    const brandName = brandMap[brandId] || brandId;

    const comp = computeCompleteness(record, { inOpenDatabase, sourceLayer });
    const slug = slugFromRecord(record);
    const pagePath = `storage-pages/${id}.json`;

    const primaryImage =
        record.images && record.images[0] && record.images[0].url ? record.images[0].url : null;

    const actions = buildActions(repo, branch, id, repoRelativePath, sourceLayer);
    const links = buildLinks(repo, branch, repoRelativePath, id);

    const card = {
        id,
        slug,
        name: record.name,
        brand_id: brandId,
        brand_name: brandName,
        type: record.type,
        in_open_database: inOpenDatabase,
        derived_state: comp.derived_state,
        verification_status: verificationStatusLabel(record),
        completeness_score: comp.score,
        completeness_class: comp.completeness_class,
        fit_readiness: comp.fit_readiness,
        has_outer_size: isPlainBoxSize(record.outer_size),
        has_inner_size: isPlainBoxSize(record.inner_size),
        image: primaryImage,
        page_path: pagePath,
        badges: comp.badges,
        missing: comp.missing,
        actions,
        source_layer: sourceLayer
    };

    const banner = statusBannerCopy(comp.derived_state, inOpenDatabase, sourceLayer);
    const checklist = buildChecklist(record, comp, sourceLayer);

    const page = {
        id,
        slug,
        name: record.name,
        brand_id: brandId,
        brand_name: brandName,
        type: record.type,
        in_open_database: inOpenDatabase,
        source_layer: sourceLayer,
        derived_state: comp.derived_state,
        status_banner: banner,
        completeness: {
            score: comp.score,
            class: comp.completeness_class,
            segments: comp.segments
        },
        fit_readiness: comp.fit_readiness,
        trust_summary: {
            exact_fit_eligible: comp.exact_fit_eligible,
            lines: trustLines(comp, record)
        },
        checklist,
        missing: comp.missing,
        record,
        similar_items: [],
        actions,
        links
    };

    return { card, page };
}

function finalizeSimilarPages(allCards, pagesById) {
    for (const id of Object.keys(pagesById)) {
        const page = pagesById[id];
        page.similar_items = pickSimilar(allCards, id, page.brand_id, 6);
    }
}

module.exports = {
    resolveGithubRepo,
    loadBrandMap,
    buildCardAndPage,
    finalizeSimilarPages,
    stripSchema
};
