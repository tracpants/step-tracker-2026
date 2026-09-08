# Vendored browser libraries

These are the third-party libraries `index.html` and `embed.html` load at
runtime, served from this origin instead of a CDN.

They used to come from `d3js.org`, `cdn.jsdelivr.net` and `unpkg.com`. That put
three external origins on the page's critical path: when one of them did not
answer, `dayjs` was undefined while `scripts/main.js` was still being evaluated,
`init()` never ran, and the page sat on its loading skeleton with no heatmap and
no error. Serving them ourselves removes that whole class of outage, and also
lets the site work on networks that block those CDNs.

## Contents

| File | Package | Version |
| --- | --- | --- |
| `d3.v7.min.js` | [d3](https://www.npmjs.com/package/d3) | 7.9.0 |
| `dayjs/dayjs.min.js` | [dayjs](https://www.npmjs.com/package/dayjs) | 1.11.10 |
| `dayjs/plugin/utc.js` | dayjs plugin | 1.11.10 |
| `dayjs/plugin/timezone.js` | dayjs plugin | 1.11.10 |
| `dayjs/plugin/isoWeek.js` | dayjs plugin | 1.11.10 |
| `cal-heatmap/cal-heatmap.min.js` | [cal-heatmap](https://www.npmjs.com/package/cal-heatmap) | 4.2.4 |
| `cal-heatmap/cal-heatmap.css` | cal-heatmap | 4.2.4 |
| `cal-heatmap/plugins/CalendarLabel.min.js` | cal-heatmap plugin | 4.2.4 |
| `confetti.browser.min.js` | [canvas-confetti](https://www.npmjs.com/package/canvas-confetti) | 1.9.2 |
| `lucide.min.js` | [lucide](https://www.npmjs.com/package/lucide) | 0.460.0 |

## Refreshing

Pull the versions you want from npm and copy the browser builds across:

```bash
npm i --no-save d3@7 dayjs@1.11.10 cal-heatmap@4.2.4 canvas-confetti@1.9.2 lucide@0.460.0

cp node_modules/d3/dist/d3.min.js                                  vendor/d3.v7.min.js
cp node_modules/dayjs/dayjs.min.js                                 vendor/dayjs/dayjs.min.js
cp node_modules/dayjs/plugin/{utc,timezone,isoWeek}.js             vendor/dayjs/plugin/
cp node_modules/cal-heatmap/dist/cal-heatmap.min.js                vendor/cal-heatmap/
cp node_modules/cal-heatmap/dist/cal-heatmap.css                   vendor/cal-heatmap/
cp node_modules/cal-heatmap/dist/plugins/CalendarLabel.min.js      vendor/cal-heatmap/plugins/
cp node_modules/canvas-confetti/dist/confetti.browser.js           vendor/confetti.browser.min.js
cp node_modules/lucide/dist/umd/lucide.min.js                      vendor/lucide.min.js
```

Then update the version table above, and bump the `?v=` cache-busting stamps in
`index.html` so returning visitors pick the new files up.

`cal-heatmap` reads `d3` off the global, so `d3.v7.min.js` has to stay loaded
before it. `.github/scripts/check-site-assets.mjs` fails the build if a page
ever points back at a CDN or at a file that was not staged.
