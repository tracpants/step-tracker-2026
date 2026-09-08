import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The site once went dark like this: dayjs was served from a CDN and did not
 * load, so `dayjs.extend(...)` threw at the top of main.js, module evaluation
 * aborted before init() existed, and the page kept showing its loading skeleton
 * with no heatmap and no explanation. These tests pin the contract that came
 * out of that: whatever is missing, the visitor is told something.
 */

const SKELETON_MARKUP = `
    <div class="stats">
        <div><span id="total-steps">-</span></div>
        <div><span id="daily-average">-</span></div>
        <div><span id="current-streak">-</span></div>
        <div><span id="goal-percentage">-</span></div>
    </div>
    <div id="loading-skeleton" class="loading-skeleton">
        <div class="skeleton-cell"></div>
    </div>
    <div class="heatmap-wrapper"><div id="cal-heatmap"></div></div>
    <div class="legend"></div>
    <div class="last-updated"><span id="last-updated">Last updated: -</span></div>
`;

/** Import main.js fresh, letting its self-invoked init() run to completion. */
const bootApp = async () => {
    vi.resetModules();
    await import('../main.js');
    // init() is async and not exported; let its microtasks settle
    await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('app boot with missing libraries', () => {
    beforeEach(() => {
        document.body.innerHTML = SKELETON_MARKUP;
        vi.spyOn(console, 'error').mockImplementation(() => {});
        delete window.d3;
        delete window.dayjs;
        delete window.CalHeatmap;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('replaces the loading skeleton with an error instead of hanging', async () => {
        await bootApp();

        const skeleton = document.getElementById('loading-skeleton');
        const error = skeleton.querySelector('.load-error');

        expect(error).not.toBeNull();
        expect(error.textContent).toMatch(/couldn't load/i);
        // The skeleton cells must be gone - a spinner with an error hidden
        // behind it still reads as a dead page
        expect(skeleton.querySelector('.skeleton-cell')).toBeNull();
    });

    it('names the resources, not the data, when a library is what is missing', async () => {
        await bootApp();

        const error = document.querySelector('.load-error');
        expect(error.textContent).toMatch(/resources/i);
        expect(error.textContent).not.toMatch(/step data/i);
    });

    it('logs the libraries that failed to load', async () => {
        await bootApp();

        const logged = console.error.mock.calls.map((args) => String(args[1])).join(' ');
        expect(logged).toContain('d3');
        expect(logged).toContain('dayjs');
        expect(logged).toContain('CalHeatmap');
    });

    it('does not blow up when the skeleton is not in the DOM', async () => {
        document.getElementById('loading-skeleton').remove();

        await expect(bootApp()).resolves.toBeUndefined();
    });
});
