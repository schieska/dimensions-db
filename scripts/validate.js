const fs = require('fs');
const path = require('path');
const glob = require('glob');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const SCHEMAS_DIR = path.join(__dirname, '../schema');
const SRC_DIR = path.join(__dirname, '../src/items');

// Initialize AJV
const ajv = new Ajv({
    strict: false,
    validateSchema: false
});
addFormats(ajv);

// Load Schemas
const commonSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'common.schema.json'), 'utf8'));
const itemSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'item.schema.json'), 'utf8'));

ajv.addSchema(commonSchema);
const validateItem = ajv.compile(itemSchema);

const args = process.argv.slice(2);
let filesToCheck = [];

if (args.length > 0) {
    // Check specific file(s)
    filesToCheck = args;
} else {
    // Check all files
    filesToCheck = glob.sync('**/*.json', { cwd: SRC_DIR }).map(f => path.join(SRC_DIR, f));
}

console.log(`Validating ${filesToCheck.length} files...`);
let errorCount = 0;

for (const filePath of filesToCheck) {
    // Skip non-item items if globbing all
    if (args.length === 0 && (filePath.includes('_examples') || filePath.includes('brand.json'))) continue;

    const relativePath = path.relative(SRC_DIR, filePath);

    try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Strip $schema
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
            if (args.length > 0) console.log(`\u2705 Valid: ${relativePath}`);
        }
    } catch (e) {
        console.error(`\u274C Error parsing ${relativePath}: ${e.message}`);
        errorCount++;
    }
}

if (errorCount > 0) {
    console.error(`\nValidation failed with ${errorCount} errors.`);
    process.exit(1);
} else {
    console.log(`\nAll ${filesToCheck.length - (args.length === 0 ? 0 : 0)} files passed validation.`);
}
