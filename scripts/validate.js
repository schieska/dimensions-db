const fs = require('fs');
const path = require('path');
const glob = require('glob');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const SCHEMAS_DIR = path.join(__dirname, '../schema');
const SRC_DIR = path.join(__dirname, '../src/items');
const INDEX_DIR = path.join(__dirname, '../src/index');
const { checkItemPolicy } = require('./lib/data-policy');
const { hasCanonicalSource, hasImage, hasIdentifier } = require('./lib/completeness');

const ajv = new Ajv({
    strict: false,
    validateSchema: false
});
addFormats(ajv);

const commonSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'common.schema.json'), 'utf8'));
const itemSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'item.schema.json'), 'utf8'));
const indexItemSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'index-item.schema.json'), 'utf8'));

ajv.addSchema(commonSchema);
ajv.addSchema(itemSchema);
ajv.addSchema(indexItemSchema);

const validateItem = ajv.compile(itemSchema);
const validateIndexItem = ajv.compile(indexItemSchema);

function deriveIdFromPath(baseRelPath) {
    const parts = baseRelPath.split(/[/\\]/).map(p => p.replace('.json', ''));
    return parts.join('_').replace(/\\/g, '_').toLowerCase();
}

function checkIndexPublishable(content, relativePath) {
    const errs = [];
    if (!hasCanonicalSource(content)) {
        errs.push(`${relativePath}: Storage Index items need at least one source with a URL`);
    }
    if (!hasImage(content) && !hasIdentifier(content)) {
        errs.push(
            `${relativePath}: Storage Index publishable threshold requires an image or at least one identifier`
        );
    }
    if (!content.provenance || typeof content.provenance !== 'object') {
        errs.push(`${relativePath}: provenance block is required`);
    }
    return errs;
}

function collectLayerIds() {
    const openIds = new Map();
    const indexIds = new Map();

    const openFiles = glob.sync('**/*.json', { cwd: SRC_DIR });
    for (const f of openFiles) {
        if (f.includes('_examples') || f.includes('brand.json')) continue;
        const fp = path.join(SRC_DIR, f);
        let data;
        try {
            data = JSON.parse(fs.readFileSync(fp, 'utf8'));
        } catch {
            continue;
        }
        const id = data.id || deriveIdFromPath(f);
        openIds.set(id, f);
    }

    if (fs.existsSync(INDEX_DIR)) {
        const idxFiles = glob.sync('**/*.json', { cwd: INDEX_DIR });
        for (const f of idxFiles) {
            const fp = path.join(INDEX_DIR, f);
            let data;
            try {
                data = JSON.parse(fs.readFileSync(fp, 'utf8'));
            } catch {
                continue;
            }
            const id = data.id || deriveIdFromPath(f);
            indexIds.set(id, f);
        }
    }

    const collisions = [];
    for (const id of indexIds.keys()) {
        if (openIds.has(id)) {
            collisions.push(
                `ID "${id}" exists in both src/items (${openIds.get(id)}) and src/index (${indexIds.get(id)})`
            );
        }
    }
    return collisions;
}

const args = process.argv.slice(2);
let filesToCheck = [];

if (args.length > 0) {
    filesToCheck = args;
} else {
    filesToCheck = glob.sync('**/*.json', { cwd: SRC_DIR }).map(f => path.join(SRC_DIR, f));
}

console.log(`Validating ${filesToCheck.length} open-database files...`);
let errorCount = 0;

for (const filePath of filesToCheck) {
    if (args.length === 0 && (filePath.includes('_examples') || filePath.includes('brand.json'))) continue;

    const relativePath = path.relative(SRC_DIR, filePath);

    try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const validationContent = { ...content };
        delete validationContent.$schema;

        const valid = validateItem(validationContent);
        if (!valid) {
            console.error(`\u274C Invalid: ${relativePath}`);
            validateItem.errors.forEach(err => {
                console.error(`   - ${err.instancePath} ${err.message}`);
            });
            errorCount++;
        } else {
            const policyErrors = checkItemPolicy(validationContent, relativePath);
            if (policyErrors.length > 0) {
                console.error(`\u274C Policy: ${relativePath}`);
                policyErrors.forEach(msg => console.error(`   - ${msg}`));
                errorCount++;
            } else if (args.length > 0) {
                console.log(`\u2705 Valid: ${relativePath}`);
            }
        }
    } catch (e) {
        console.error(`\u274C Error parsing ${relativePath}: ${e.message}`);
        errorCount++;
    }
}

if (args.length === 0 && fs.existsSync(INDEX_DIR)) {
    const indexFiles = glob.sync('**/*.json', { cwd: INDEX_DIR }).map(f => path.join(INDEX_DIR, f));
    console.log(`Validating ${indexFiles.length} Storage Index files...`);

    for (const filePath of indexFiles) {
        const relativePath = path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/');

        try {
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const validationContent = { ...content };
            delete validationContent.$schema;

            const valid = validateIndexItem(validationContent);
            if (!valid) {
                console.error(`\u274C Invalid index: ${relativePath}`);
                validateIndexItem.errors.forEach(err => {
                    console.error(`   - ${err.instancePath} ${err.message}`);
                });
                errorCount++;
            } else {
                const policyErrors = checkItemPolicy(validationContent, relativePath);
                if (policyErrors.length > 0) {
                    console.error(`\u274C Policy: ${relativePath}`);
                    policyErrors.forEach(msg => console.error(`   - ${msg}`));
                    errorCount++;
                } else {
                    const pub = checkIndexPublishable(validationContent, relativePath);
                    if (pub.length > 0) {
                        console.error(`\u274C Index publishable threshold: ${relativePath}`);
                        pub.forEach(msg => console.error(`   - ${msg}`));
                        errorCount++;
                    }
                }
            }
        } catch (e) {
            console.error(`\u274C Error parsing ${relativePath}: ${e.message}`);
            errorCount++;
        }
    }
}

if (args.length === 0) {
    const collisions = collectLayerIds();
    if (collisions.length > 0) {
        console.error('\u274C Layer ID collisions (src/items vs src/index):');
        collisions.forEach(c => console.error(`   - ${c}`));
        errorCount += collisions.length;
    }
}

if (errorCount > 0) {
    console.error(`\nValidation failed with ${errorCount} errors.`);
    process.exit(1);
}

const checkedOpen =
    args.length === 0
        ? filesToCheck.filter(f => !f.includes('_examples') && !f.includes('brand.json')).length
        : filesToCheck.length;

let msg = `\nAll ${checkedOpen} open-database files passed validation.`;
if (args.length === 0 && fs.existsSync(INDEX_DIR)) {
    const n = glob.sync('**/*.json', { cwd: INDEX_DIR }).length;
    msg += ` ${n} Storage Index file(s) passed.`;
}
console.log(msg);
