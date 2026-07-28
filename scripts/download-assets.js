/**
 * Download required external assets to public/images/.
 * Run: node scripts/download-assets.js
 *
 * Requires network access. Skips files that already exist.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const ASSETS = [
    {
        url: 'https://images.unsplash.com/photo-1507136566046-c830cc9635b3?w=800&q=80',
        dest: 'public/images/car-before.jpg',
    },
];

async function download(url, dest) {
    if (fs.existsSync(dest)) {
        console.log(`SKIP ${dest} — already exists`);
        return;
    }
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode} for ${url}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => { file.close(); console.log(`OK ${dest}`); resolve(); });
        }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
    });
}

(async () => {
    for (const asset of ASSETS) {
        try {
            await download(asset.url, asset.dest);
        } catch (err) {
            console.error(`FAIL ${asset.dest}: ${err.message}`);
        }
    }
})();
