const fs = require('fs');
const path = require('path');
const prompts = require('prompts');
const glob = require('glob');

const SRC_DIR = path.join(__dirname, '../src/items');

/**
 * Very basic scraper to find JSON-LD and OG image tags
 */
async function scrapeUrl(url) {
    if (!url) return null;
    try {
        console.log("🔍 Scraping product data...");
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await response.text();

        const data = {
            name: null,
            brand: null,
            sku: null,
            images: []
        };

        // 1. Try JSON-LD
        const jsonLdRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
        let match;
        while ((match = jsonLdRegex.exec(html)) !== null) {
            try {
                const json = JSON.parse(match[1]);
                const products = Array.isArray(json) ? json : [json];
                const product = products.find(p => p['@type'] === 'Product' || p['@type'] === 'product');

                if (product) {
                    data.name = product.name || data.name;
                    data.brand = (product.brand && product.brand.name) ? product.brand.name : data.brand;
                    data.sku = product.sku || product.mpn || data.sku;

                    if (product.image) {
                        const imgs = Array.isArray(product.image) ? product.image : [product.image];
                        data.images.push(...imgs.map(i => typeof i === 'string' ? i : i.url).filter(Boolean));
                    }
                }
            } catch (e) { }
        }

        // 2. Try OG Tags if JSON-LD missed images
        if (data.images.length === 0) {
            const ogImageRegex = /<meta property="og:image" content="(.*?)"/i;
            const ogMatch = html.match(ogImageRegex);
            if (ogMatch) data.images.push(ogMatch[1]);
        }

        return data;
    } catch (e) {
        console.warn("⚠️ Could not scrape URL:", e.message);
        return null;
    }
}

async function createItem(defaults = {}) {
    console.log(`\n--- ${defaults.id ? `Creating Component: ${defaults.id}` : 'Creating New Item'} ---`);

    // 1. URL Seeding
    let seeded = null;
    if (!defaults.id) {
        const seed = await prompts({
            type: 'text',
            name: 'url',
            message: 'Paste product URL to auto-fill? (Leave empty to start clean):'
        });
        if (seed.url) {
            seeded = await scrapeUrl(seed.url);
            if (seeded) {
                defaults.name = seeded.name || defaults.name;
                defaults.brand = seeded.brand ? seeded.brand.toLowerCase() : defaults.brand;
                defaults.source = seed.url;
            }
        }
    }

    // Scan for existing brands
    const brands = fs.readdirSync(SRC_DIR).filter(f => fs.statSync(path.join(SRC_DIR, f)).isDirectory() && !f.startsWith('_'));

    // Scan for all existing items to allow linking parts
    const existingItems = glob.sync('**/*.json', { cwd: SRC_DIR })
        .filter(f => !f.includes('_examples') && !f.includes('brand.json'))
        .map(f => {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'));
                return {
                    title: `${data.name} (${data.id || f})`,
                    value: data.id || f.replace(/\\/g, '/').replace('.json', '')
                };
            } catch (e) { return null; }
        }).filter(Boolean);

    // Contributor Logic
    const CONFIG_FILE = path.join(__dirname, '../.contributor-config.json');
    let contributor = '';

    if (fs.existsSync(CONFIG_FILE)) {
        try {
            const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            if (config.handle) contributor = config.handle;
        } catch (e) { }
    }

    if (!contributor) {
        const contributorResponse = await prompts({
            type: 'text',
            name: 'handle',
            message: 'What is your contributor handle? (e.g. @username) [Press Enter to skip]:'
        });
        if (contributorResponse.handle) {
            contributor = contributorResponse.handle;
            fs.writeFileSync(CONFIG_FILE, JSON.stringify({ handle: contributor }, null, 2));
            console.log(`Saved handle to ${CONFIG_FILE}`);
        }
    }

    const response = await prompts([
        {
            type: 'autocomplete',
            name: 'brand',
            message: 'Select Brand:',
            initial: defaults.brand || undefined,
            choices: brands.map(b => ({ title: b, value: b })),
            suggest: async (input, choices) => {
                const results = choices.filter(i => i.title.toLowerCase().includes(input.toLowerCase()));
                if (input && !results.find(r => r.title === input)) {
                    results.push({ title: `Create new: "${input}"`, value: input });
                }
                return results;
            }
        },
        {
            type: 'autocomplete',
            name: 'productLine',
            message: 'Product Line / Series:',
            initial: defaults.productLine || undefined,
            choices: (prev, values) => {
                const brandPath = path.join(SRC_DIR, values.brand);
                if (fs.existsSync(brandPath)) {
                    const lines = fs.readdirSync(brandPath).filter(f => {
                        const fullPath = path.join(brandPath, f);
                        return fs.statSync(fullPath).isDirectory();
                    });
                    const choices = lines.map(l => ({ title: l, value: l }));
                    if (!lines.includes('general')) {
                        choices.unshift({ title: 'general (No specific line)', value: 'general' });
                    }
                    return choices;
                }
                return [{ title: 'general (No specific line)', value: 'general' }];
            },
            suggest: async (input, choices) => {
                const results = choices.filter(i => i.title.toLowerCase().includes(input.toLowerCase()));
                if (input && !results.find(r => r.title === input)) {
                    results.push({ title: `Create new: "${input}"`, value: input });
                }
                return results;
            },
            format: val => val ? val.toLowerCase().replace(/\s+/g, '-') : 'general'
        },
        {
            type: 'text',
            name: 'name',
            message: 'Item Name:',
            initial: defaults.name || undefined,
            validate: value => value.length < 2 ? 'Name is too short' : true
        },
        {
            type: 'select',
            name: 'type',
            message: 'Item Type:',
            initial: defaults.type === 'drawer' ? 1 : 0,
            choices: [
                { title: 'Container (Box, Bin)', value: 'container' },
                { title: 'Drawer', value: 'drawer' },
                { title: 'Tray / Insert', value: 'tray' },
                { title: 'Cabinet / Unit (Furniture)', value: 'furniture' },
                { title: 'Component / Part', value: 'component' },
                { title: 'Other', value: 'other' }
            ]
        },
        {
            type: 'multiselect',
            name: 'visibility',
            message: 'Index Visibility:',
            hint: 'Space: Toggle, Enter: Confirm',
            choices: [
                { title: 'Product (Main commercial unit)', value: 'product', selected: defaults.type !== 'drawer' && defaults.type !== 'component' },
                { title: 'Standalone (Can be used/sold separately)', value: 'standalone', selected: true },
                { title: 'Component (Internal part or sub-component)', value: 'component', selected: defaults.type === 'drawer' || defaults.type === 'component' }
            ],
            min: 1
        },
        {
            type: (prev, values) => ['container', 'drawer', 'tray', 'insert'].includes(values.type) ? null : 'confirm',
            name: 'hasInnerSpace',
            message: 'Does this item have inner storage space?',
            initial: (prev, values) => values.type === 'furniture'
        },
        {
            type: (prev, values) => {
                const hasSpace = ['container', 'drawer', 'tray', 'insert'].includes(values.type) || values.hasInnerSpace;
                return hasSpace ? 'number' : null;
            },
            name: 'inner_x',
            message: 'Inner Width (X) in mm (Leave empty to skip):',
            float: true,
        },
        {
            type: (prev, values) => values.inner_x ? 'number' : null,
            name: 'inner_y',
            message: 'Inner Depth (Y) in mm:',
            float: true,
            validate: val => val > 0 ? true : 'Must be > 0'
        },
        {
            type: (prev, values) => values.inner_x ? 'number' : null,
            name: 'inner_z',
            message: 'Inner Height (Z) in mm:',
            float: true,
            validate: val => val > 0 ? true : 'Must be > 0'
        },
        {
            type: (prev, values) => (['container', 'drawer', 'tray', 'insert'].includes(values.type) || values.hasInnerSpace) ? 'confirm' : null,
            name: 'hasOuterSize',
            message: (prev, values) => values.inner_x ? 'Add outer dimensions too?' : 'Add outer dimensions?',
            initial: (prev, values) => !values.inner_x,
        },
        {
            type: (prev, values) => values.hasOuterSize ? 'number' : null,
            name: 'outer_x',
            message: 'Outer Width (X) in mm:',
            float: true,
            validate: val => val > 0 ? true : 'Must be > 0'
        },
        {
            type: (prev, values) => values.hasOuterSize ? 'number' : null,
            name: 'outer_y',
            message: 'Outer Depth (Y) in mm:',
            float: true,
            validate: val => val > 0 ? true : 'Must be > 0'
        },
        {
            type: (prev, values) => values.hasOuterSize ? 'number' : null,
            name: 'outer_z',
            message: 'Outer Height (Z) in mm:',
            float: true,
            validate: val => val > 0 ? true : 'Must be > 0'
        },
        {
            type: 'select',
            name: 'measure_tool',
            message: 'How did you measure it?',
            choices: [
                { title: 'Digital Caliper', value: 'caliper' },
                { title: 'Tape Measure', value: 'tape' },
                { title: 'Ruler', value: 'ruler' },
                { title: 'Manufacturer Data', value: 'manufacturer' },
                { title: 'Other', value: 'other' }
            ]
        },
        {
            type: 'text',
            name: 'source',
            message: 'Source URL (optional):',
            initial: defaults.source || undefined,
            format: val => (val && val.length > 0 && !val.match(/^https?:\/\//)) ? 'https://' + val : val
        },
        {
            type: 'confirm',
            name: 'addParts',
            message: 'Does this item contain other items? (e.g. Drawers, Bins)',
            initial: false
        }
    ]);

    if (!response.brand || !response.name) {
        console.log("Cancelled.");
        return;
    }

    // Handle Parts Loop
    const parts = [];
    if (response.addParts) {
        let adding = true;
        while (adding) {
            const partResp = await prompts([
                {
                    type: 'autocomplete',
                    name: 'ref',
                    message: 'Select component (or type to predict ID for new part):',
                    choices: existingItems,
                    suggest: async (input, choices) => {
                        const results = choices.filter(i => i.title.toLowerCase().includes(input.toLowerCase()));
                        if (input && !results.find(r => r.value === input)) {
                            results.push({ title: `New Part ID: "${input}" (Will prompt to create later)`, value: input });
                        }
                        return results;
                    }
                },
                {
                    type: 'number',
                    name: 'qty',
                    message: 'Quantity:',
                    initial: 1,
                    min: 1
                },
                {
                    type: 'confirm',
                    name: 'another',
                    message: 'Add another component?',
                    initial: false
                }
            ]);

            if (partResp.ref) {
                parts.push({ ref: partResp.ref, qty: partResp.qty });
                if (!partResp.another) adding = false;
            } else {
                adding = false;
            }
        }
    }

    // Process scraping results for initial values
    let finalIdentifiers = {};
    if (seeded && seeded.sku) {
        finalIdentifiers.mpn = [seeded.sku];
    }

    let finalImages = null;
    if (seeded && seeded.images && seeded.images.length > 0) {
        finalImages = seeded.images.map(url => ({
            kind: 'product',
            url: url
        }));
    }

    // Finalize Data
    const safeName = response.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const productLineDir = response.productLine ? response.productLine : 'general';
    const targetDir = path.join(SRC_DIR, response.brand, productLineDir);
    const targetFile = path.join(targetDir, `${safeName}.json`);

    const itemData = {
        "$schema": "../../../schema/item.schema.json",
        "id": defaults.id || `${response.brand}_${response.productLine || 'gen'}_${safeName}`.replace(/[^a-z0-9_]+/g, '_'),
        "type": response.type,
        "origin": seeded ? "retail" : null,
        "name": response.name,
        "brand": response.brand,
        "description": null,
        "translations": null,
        "inner_size": response.inner_x ? { x: response.inner_x, y: response.inner_y, z: response.inner_z } : { x: 0, y: 0, z: 0 },
        "outer_size": response.hasOuterSize ? { x: response.outer_x, y: response.outer_y, z: response.outer_z } : null,
        "visibility": response.visibility,
        "materials": [],
        "features": [],
        "parts": parts.length > 0 ? parts : null,
        "added_by": contributor ? `gh:${contributor.replace('gh:', '')}` : null,
        "sources": [
            {
                "kind": response.measure_tool === 'manufacturer' ? 'manufacturer' : 'physical',
                "url": response.source || null
            }
        ],
        "measurements": [
            {
                "by": contributor ? `gh:${contributor.replace('gh:', '')}` : "unknown",
                "type": "initial",
                "method": response.measure_tool === 'manufacturer' ? 'manufacturer-spec' : 'manual',
                "tool": response.measure_tool === 'manufacturer' ? 'unknown' : response.measure_tool,
                "date": new Date().toISOString().split('T')[0]
            }
        ],
        "tolerance_mm": null,
        "accuracy": response.measure_tool === 'manufacturer' ? 'medium' : null,
        "status": "draft",
        "identifiers": Object.keys(finalIdentifiers).length > 0 ? finalIdentifiers : {
            "ean": [],
            "upc": [],
            "mpn": [],
            "asin": []
        },
        "variant_of": null,
        "variant": null,
        "images": finalImages || [],
        "deprecated": false,
        "replaced_by": null,
        "updated_at": new Date().toISOString().split('T')[0]
    };

    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetFile, JSON.stringify(itemData, null, 4));
    console.log(`\nSuccess! Created: ${targetFile}`);

    // Ghost Part Creation
    const ghosts = parts.filter(p => !existingItems.find(ei => ei.value === p.ref));
    if (ghosts.length > 0) {
        console.log(`\nYou referenced ${ghosts.length} components that don't exist yet:`);
        ghosts.forEach(g => console.log(` - ${g.ref}`));

        const createNow = await prompts({
            type: 'confirm',
            name: 'value',
            message: 'Create these now?',
            initial: true
        });

        if (createNow.value) {
            for (const ghost of ghosts) {
                const idParts = ghost.ref.split('_');
                await createItem({
                    id: ghost.ref,
                    brand: idParts[0] || response.brand,
                    productLine: idParts[1] || response.productLine,
                    type: ghost.ref.includes('drawer') ? 'drawer' : 'component'
                });
            }
        }
    }
}

async function main() {
    console.log("Welcome to the Smarter Item Creator!\n");
    await createItem();
}

main().catch(console.error);
