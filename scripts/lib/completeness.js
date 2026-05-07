/**
 * Derived completeness / fit-readiness for Storage Index exports (PRD weights).
 */

const { isPlainBoxSize } = require('./data-policy');

function hasCanonicalSource(record) {
    const sources = record.sources;
    if (!Array.isArray(sources)) return false;
    return sources.some(s => s && typeof s.url === 'string' && s.url.length > 0);
}

function hasImage(record) {
    return !!(record.images && record.images[0] && typeof record.images[0].url === 'string');
}

function hasIdentifier(record) {
    const idents = record.identifiers;
    if (!idents || typeof idents !== 'object') return false;
    for (const k of ['ean', 'upc', 'asin', 'mpn']) {
        if (Array.isArray(idents[k]) && idents[k].length > 0) return true;
    }
    if (Array.isArray(idents.sku) && idents.sku.length > 0) return true;
    return false;
}

function scoreIdentity(record) {
    let s = 0;
    if (record.name && String(record.name).trim()) s += 6;
    if (record.brand && String(record.brand).trim()) s += 6;
    if (record.type) s += 6;
    if (hasCanonicalSource(record)) s += 6;
    if (hasImage(record) || hasIdentifier(record)) s += 6;
    return Math.min(30, s);
}

function scoreGeometry(record) {
    let g = 0;
    if (isPlainBoxSize(record.outer_size)) g += 20;
    if (isPlainBoxSize(record.inner_size)) g += 20;
    return Math.min(40, g);
}

/** Evidence segment (max 20): measurements metadata + evidence entries */
function scoreEvidenceSegment(record) {
    let s = 0;
    if (Array.isArray(record.measurements) && record.measurements.length > 0) s += 8;
    const ev = record.evidence;
    if (Array.isArray(ev) && ev.length > 0) {
        s += 6;
        const fieldScoped = ev.some(
            e => e && Array.isArray(e.supports) && e.supports.length > 0
        );
        if (fieldScoped) s += 6;
        else if (ev.some(e => e && e.url)) s += 4;
    }
    return Math.min(20, s);
}

function scoreUtility(record) {
    let u = 0;
    if (Array.isArray(record.collections) && record.collections.length > 0) u += 5;
    if (record.variant && typeof record.variant === 'object') u += 5;
    return Math.min(10, u);
}

function completenessClass(score) {
    if (score <= 24) return 'known_product';
    if (score <= 49) return 'basic_metadata';
    if (score <= 74) return 'partial_data';
    if (score <= 89) return 'review_candidate';
    return 'fit_ready_score';
}

function buildMissing(record, sourceLayer) {
    const missing = [];
    if (!hasCanonicalSource(record)) missing.push('canonical_source_url');
    if (!hasImage(record) && !hasIdentifier(record)) missing.push('image_or_identifier');
    if (!isPlainBoxSize(record.outer_size)) missing.push('outer_size');
    if (!isPlainBoxSize(record.inner_size)) missing.push('inner_size');
    const hasMeasurements = Array.isArray(record.measurements) && record.measurements.length > 0;
    if (!hasMeasurements) missing.push('measurements');
    const ev = record.evidence;
    const hasEvidence = Array.isArray(ev) && ev.length > 0;
    if (!hasEvidence) missing.push('evidence');
    if (sourceLayer === 'storage_index' && !record.provenance) missing.push('provenance');
    return missing;
}

function deriveFitReadiness(score, ctx) {
    const { inOpenDatabase, verificationState, status, disputed, record } = ctx;
    if (disputed) return 'none';
    const verifiedLike =
        status === 'verified' ||
        verificationState === 'community_verified' ||
        verificationState === 'official_verified';

    const innerOk = isPlainBoxSize(record.inner_size);
    const outerOk = isPlainBoxSize(record.outer_size);

    if (inOpenDatabase && score >= 90 && verifiedLike && innerOk && outerOk) return 'fit_ready';
    if (score >= 75) return 'candidate_fit';
    if (score >= 50 && (innerOk || outerOk)) return 'compare_only';
    if (score >= 25) return 'browse_only';
    return 'none';
}

function deriveDerivedState(score, ctx) {
    const { inOpenDatabase, disputed, deprecated, verificationState, record } = ctx;
    if (deprecated) return 'deprecated';
    if (disputed || verificationState === 'disputed') return 'disputed';
    if (inOpenDatabase) return 'in_open_database';

    const hasGeom = isPlainBoxSize(record.outer_size) || isPlainBoxSize(record.inner_size);
    const hasMeasurements = Array.isArray(record.measurements) && record.measurements.length > 0;
    const ev = record.evidence;
    const hasEvidence = Array.isArray(ev) && ev.length > 0;

    if (score >= 75 && hasGeom && hasMeasurements && hasEvidence) return 'ready_for_review';
    if (hasGeom && !hasEvidence) return 'needs_verification';
    if (hasGeom && score >= 50) return 'partial_data';
    if (hasGeom) return 'partial_data';
    if (!hasGeom && score <= 49) return 'known_product';
    return 'basic_metadata';
}

function primaryBadge(derivedState, inOpenDatabase) {
    if (derivedState === 'deprecated') return 'Deprecated';
    if (derivedState === 'disputed') return 'Disputed';
    if (derivedState === 'ready_for_review') return 'Ready for review';
    if (derivedState === 'needs_verification') return 'Needs verification';
    if (derivedState === 'partial_data') return 'Partial data';
    if (inOpenDatabase || derivedState === 'in_open_database') return 'In open database';
    return 'Known product';
}

function buildBadges(primary, missing, fitReadiness) {
    const badges = [primary];
    if (missing.includes('outer_size')) badges.push('Needs outer size');
    if (missing.includes('inner_size')) badges.push('Needs inner size');
    if (missing.includes('evidence')) badges.push('Needs evidence');
    if (fitReadiness === 'fit_ready') badges.push('Fit-ready');
    return badges;
}

function cappedFitReadiness(fit, inOpenDatabase) {
    if (!inOpenDatabase && fit === 'fit_ready') return 'candidate_fit';
    return fit;
}

/**
 * @param {object} record - item or index record (no $schema)
 * @param {{ inOpenDatabase: boolean, sourceLayer: 'open_database'|'storage_index' }} opts
 */
function computeCompleteness(record, opts) {
    const sourceLayer = opts.sourceLayer;
    const inOpenDatabase = opts.inOpenDatabase;

    const disputed =
        (Array.isArray(record.disputed_fields) && record.disputed_fields.length > 0) ||
        record.verification_state === 'disputed';
    const deprecated =
        record.deprecated === true ||
        record.verification_state === 'deprecated' ||
        !!record.replaced_by;

    const identity = scoreIdentity(record);
    const geometry = scoreGeometry(record);
    const evidence = scoreEvidenceSegment(record);
    const utility = scoreUtility(record);
    const score = Math.min(100, Math.round(identity + geometry + evidence + utility));

    const cls = completenessClass(score);
    const missing = buildMissing(record, sourceLayer);

    const ctx = {
        record,
        inOpenDatabase,
        disputed,
        deprecated,
        verificationState: record.verification_state || null,
        status: record.status || null
    };

    let fitReadiness = deriveFitReadiness(score, ctx);
    fitReadiness = cappedFitReadiness(fitReadiness, inOpenDatabase);

    const derivedState = deriveDerivedState(score, ctx);
    const primary = primaryBadge(derivedState, inOpenDatabase);
    const badges = buildBadges(primary, missing, fitReadiness);

    const innerOk = isPlainBoxSize(record.inner_size);
    const outerOk = isPlainBoxSize(record.outer_size);
    const verifiedLike =
        record.status === 'verified' ||
        record.verification_state === 'community_verified' ||
        record.verification_state === 'official_verified';

    const exactFitEligible =
        inOpenDatabase &&
        fitReadiness === 'fit_ready' &&
        !disputed &&
        !deprecated &&
        innerOk &&
        outerOk &&
        verifiedLike;

    return {
        score,
        completeness_class: cls,
        segments: {
            identity,
            geometry,
            evidence,
            utility
        },
        missing,
        fit_readiness: fitReadiness,
        derived_state: derivedState,
        badges,
        exact_fit_eligible: !!exactFitEligible
    };
}

module.exports = {
    computeCompleteness,
    hasCanonicalSource,
    hasImage,
    hasIdentifier,
    completenessClass,
    buildMissing
};
