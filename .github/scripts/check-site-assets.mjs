/**
 * Guard against the failure that took the site down: a page asset that the
 * browser cannot fetch.
 *
 * The heatmap page pulled d3, dayjs, cal-heatmap and lucide from three CDNs.
 * When one of them did not answer, `dayjs.extend(...)` threw while main.js was
 * still being evaluated, init() never ran, and the page sat on its loading
 * skeleton forever - no heatmap, no error, just an empty graph.
 *
 * So: every <script src> and <link href> in the staged site must be same-origin
 * and must resolve to a file that was actually staged.
 *
 * Usage: node .github/scripts/check-site-assets.mjs <site-dir>
 */
import fs from 'node:fs';
import path from 'node:path';

const siteDir = process.argv[2];
if (!siteDir) {
    console.error('Usage: check-site-assets.mjs <site-dir>');
    process.exit(2);
}

// Analytics is deliberately third-party and deliberately non-blocking: it is
// async, and nothing on the page reads from it.
const ALLOWED_EXTERNAL = [/(^|\/\/)gc\.zgo\.at\//];

const ASSET_PATTERN = /<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;

const isExternal = (url) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url);

const problems = [];

const pages = fs.readdirSync(siteDir).filter((f) => f.endsWith('.html'));
if (pages.length === 0) problems.push('no HTML pages found in ' + siteDir);

for (const page of pages) {
    const html = fs.readFileSync(path.join(siteDir, page), 'utf8');

    for (const [, rawUrl] of html.matchAll(ASSET_PATTERN)) {
        // Anchors and inline data are not fetched as page assets
        if (rawUrl.startsWith('#') || rawUrl.startsWith('data:')) continue;

        if (isExternal(rawUrl)) {
            if (!ALLOWED_EXTERNAL.some((re) => re.test(rawUrl))) {
                problems.push(`${page}: third-party asset ${rawUrl}`);
            }
            continue;
        }

        // Strip the cache-busting query and any fragment before hitting disk
        const relative = rawUrl.split(/[?#]/)[0].replace(/^\.?\//, '');
        if (!relative) continue;

        if (!fs.existsSync(path.join(siteDir, relative))) {
            problems.push(`${page}: ${rawUrl} was not staged`);
        }
    }
}

if (problems.length) {
    console.error('Page assets that would fail to load in a browser:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
}

console.log(`Checked ${pages.length} page(s): every script and stylesheet is same-origin and staged.`);
