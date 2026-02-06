const fs = require('fs');
const path = require('path');

async function scrapeUrl(url) {
    if (!url) return null;
    try {
        console.log(`🔍 Scraping ${url}...`);
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await response.text();

        const data = {
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

const urls = [
    "https://www.ikea.com/nl/en/p/alex-drawer-unit-on-castors-white-80485423/",
    "https://www.ikea.com/nl/en/p/helmer-drawer-unit-on-castors-black-20341970/",
    "https://www.ikea.com/nl/en/p/micke-drawer-unit-on-castors-white-90213078/",
    "https://www.ikea.com/nl/en/p/alex-storage-unit-white-50563752/",
    "https://www.ikea.com/nl/en/p/friidrott-drawer-unit-on-castors-white-60609071/"
];

async function main() {
    for (const url of urls) {
        const data = await scrapeUrl(url);
        if (data && data.images.length > 0) {
            console.log(`URL: ${url}`);
            console.log(`Images: ${JSON.stringify(data.images, null, 2)}`);
        }
    }
}

main();
