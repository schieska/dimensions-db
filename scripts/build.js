const fs = require('fs');
const path = require('path');
const glob = require('glob');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const SCHEMAS_DIR = path.join(__dirname, '../schema');
const SRC_DIR = path.join(__dirname, '../src/items');
const DIST_DIR = path.join(__dirname, '../dist');

// Ensure dist dir exists
if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR);
}

// Initialize AJV
const ajv = new Ajv({
    strict: false,
    validateSchema: false // Don't validate the schema itself against meta-schema to avoid remote fetch issues
});
addFormats(ajv);

// Load Schemas
const commonSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'common.schema.json'), 'utf8'));
const itemSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'item.schema.json'), 'utf8'));
const brandSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'brand.schema.json'), 'utf8'));
// const contributorSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'contributor.schema.json'), 'utf8'));
const distIndexSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'dist-index.schema.json'), 'utf8'));
const distItemSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'dist-item.schema.json'), 'utf8'));

// Add schemas to AJV
ajv.addSchema(commonSchema);
// ajv.addSchema(brandSchema); 
// ajv.addSchema(contributorSchema);
ajv.addSchema(itemSchema);

const validateItem = ajv.compile(itemSchema);
const validateDistItem = ajv.compile(distItemSchema);
const validateDistIndex = ajv.compile(distIndexSchema);

function toInches(mm) {
    return parseFloat((mm / 25.4).toFixed(3));
}

function convertSizeToInches(sizeObj) {
    if (!sizeObj) return null;
    const newSize = { ...sizeObj };
    // Convert standard x, y, z
    if (typeof newSize.x === 'number') newSize.x = toInches(newSize.x);
    if (typeof newSize.y === 'number') newSize.y = toInches(newSize.y);
    if (typeof newSize.z === 'number') newSize.z = toInches(newSize.z);

    // Convert corner_radius if present
    if (typeof newSize.corner_radius === 'number') newSize.corner_radius = toInches(newSize.corner_radius);

    // Convert levels for loft
    if (Array.isArray(newSize.levels)) {
        newSize.levels = newSize.levels.map(level => {
            const newLevel = { ...level };
            if (typeof newLevel.z === 'number') newLevel.z = toInches(newLevel.z);
            // TODO: Convert polygon points if they exist
            return newLevel;
        });
    }

    return newSize;
}

// Main Build Process
const indexItems = [];
const fullItems = [];
const files = glob.sync('**/*.json', { cwd: SRC_DIR });
const DIST_ITEMS_DIR = path.join(DIST_DIR, 'items');

// Ensure dist/items dir exists
if (!fs.existsSync(DIST_ITEMS_DIR)) {
    fs.mkdirSync(DIST_ITEMS_DIR, { recursive: true });
}

console.log(`Found ${files.length} item files.`);

for (const file of files) {
    if (file.includes('_examples') || file.includes('brand.json')) continue;

    const filePath = path.join(SRC_DIR, file);
    let content;
    try {
        content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error(`Error parsing JSON file: ${file}`, e);
        process.exit(1);
    }

    // Generate ID if missing (from folder structure)
    // Folder structure: brand/product-line/item.json
    const parts = file.split(path.sep).map(p => p.replace('.json', ''));
    const derivedId = parts.join('_').replace(/\\/g, '_').toLowerCase(); // Fix for windows path separator if needed

    if (!content.id) {
        content.id = derivedId;
    }

    // Remove $schema if present (not part of the data model)
    const validationContent = { ...content };
    delete validationContent.$schema;

    // Validate against source schema
    const valid = validateItem(validationContent);
    if (!valid) {
        console.error(`Validation failed for ${file}:`, validateItem.errors);
        // process.exit(1); // Fail hard on validation errors
    }

    // Prepare distribution items with parts
    const distItem = {
        id: content.id,
        type: content.type,
        name: content.name,
        brand: content.brand,
        origin: content.origin || null,
        inner_size_mm: content.inner_size || null,
        inner_size_in: convertSizeToInches(content.inner_size),
        outer_size_mm: content.outer_size || null,
        outer_size_in: convertSizeToInches(content.outer_size),
        visibility: content.visibility || null,
        materials: content.materials || null,
        features: content.features || null,
        parts: content.parts || null,
        referenced_by_count: 0,
        added_by: content.added_by || null,
        status: content.status || null,
        accuracy: content.accuracy || null,
        identifiers: content.identifiers || null
    };

    fullItems.push(distItem);
}

// Calculate reference counts
fullItems.forEach(parent => {
    if (parent.parts) {
        parent.parts.forEach(part => {
            const child = fullItems.find(i => i.id === part.ref);
            if (child) {
                child.referenced_by_count++;
            }
        });
    }
});

// Write distribution files
for (const distItem of fullItems) {
    // Validate Dist Item
    const validDist = validateDistItem(distItem);
    if (!validDist) {
        console.error(`Dist Item Validation Failed for ${distItem.id}:`, validateDistItem.errors);
    }

    // Write individual item file
    fs.writeFileSync(
        path.join(DIST_ITEMS_DIR, `${distItem.id}.json`),
        JSON.stringify(distItem, null, 2)
    );

    // Add lightweight entry to index
    indexItems.push({
        id: distItem.id,
        type: distItem.type,
        name: distItem.name,
        brand: distItem.brand,
        visibility: distItem.visibility,
        path: `items/${distItem.id}.json`
    });
}

const index = {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    items: indexItems
};

// Validate Dist Index (Minimal)
const validIndex = validateDistIndex(index);
if (!validIndex) {
    console.error("Dist Index Validation Failed:", validateDistIndex.errors);
    process.exit(1);
}

// Write DB and Index
fs.writeFileSync(path.join(DIST_DIR, 'index.json'), JSON.stringify(index, null, 2));

const database = {
    version: "1.0.0",
    generated_at: index.generated_at,
    items: fullItems
};
fs.writeFileSync(path.join(DIST_DIR, 'database.json'), JSON.stringify(database, null, 2));

// Write Meta (for quick cache checking)
const meta = {
    version: "1.0.0",
    generated_at: index.generated_at,
    item_count: indexItems.length
};
fs.writeFileSync(path.join(DIST_DIR, 'meta.json'), JSON.stringify(meta, null, 2));

console.log(`Build complete. Generated:
- dist/meta.json (Cache check)
- dist/index.json (Lightweight index, ${indexItems.length} items)
- dist/database.json (Full database)
- dist/items/ (*.json individual files)`);
