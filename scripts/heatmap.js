/**
 * Heatmap rendering module
 */

import { getResponsiveCellConfig, isMobileDevice, TRACKING_YEAR } from './utils.js';

/**
 * Initialize and paint the calendar heatmap
 * @param {Array} chartData - Processed chart data
 * @returns {{cal: CalHeatmap, ready: Promise}} The heatmap instance and a
 *   promise that resolves once the initial paint has rendered
 */
export const initHeatmap = (chartData) => {
    const cal = new CalHeatmap();
    const cellConfig = getResponsiveCellConfig();

    const ready = cal.paint({
        data: {
            source: chartData,
            x: 'date',
            y: 'value',
        },
        // Cal-Heatmap resolves the start instant in UTC, so a local-time
        // Jan 1 lands in the previous December for timezones ahead of UTC
        date: { start: new Date(Date.UTC(TRACKING_YEAR, 0, 1)) },
        range: 12,
        scale: {
            color: {
                type: 'threshold',
                range: ['#14432a', '#166b34', '#37a446', '#4dd05a'],
                domain: [3000, 6000, 10000],
            },
        },
        domain: {
            type: 'month',
            gutter: cellConfig.gutter,
            label: { text: 'MMM', textAlign: 'middle', position: 'top' },
        },
        subDomain: {
            type: 'ghDay',
            radius: 2,
            width: cellConfig.width,
            height: cellConfig.height,
            gutter: cellConfig.gutter,
            empty: '#000000'
        },
        itemSelector: '#cal-heatmap',
    });

    return { cal, ready: Promise.resolve(ready) };
};

/**
 * Setup click tracking for heatmap cells
 * @param {CalHeatmap} cal - Calendar heatmap instance
 */
export const setupHeatmapTracking = (cal) => {
    cal.on('click', function(event, timestamp, value) {
        // Track heatmap cell interactions
        if (window.goatcounter && window.goatcounter.count && value > 0) {
            let stepCategory = 'low-steps'; // 0-2999
            if (value >= 10000) stepCategory = 'goal-achieved';
            else if (value >= 6000) stepCategory = 'moderate-steps';
            else if (value >= 3000) stepCategory = 'low-moderate-steps';

            window.goatcounter.count({
                path: `heatmap-cell-clicked-${stepCategory}`,
                title: `Heatmap Cell Clicked: ${value} steps (${stepCategory})`,
                event: true
            });
        }
    });
};

/**
 * Setup scroll indicators for mobile heatmap
 */
export const setupHeatmapScrollIndicators = () => {
    if (!isMobileDevice()) return; // Only on mobile devices

    const wrapper = document.querySelector('.heatmap-wrapper');
    if (!wrapper) return;

    // The fades live on the static frame around the scroller so they stay at
    // the visible edges while the heatmap scrolls underneath them
    const frame = wrapper.closest('.heatmap-scroll-frame') || wrapper;

    const updateScrollIndicators = () => {
        const { scrollLeft, scrollWidth, clientWidth } = wrapper;

        // Show left indicator if we can scroll left
        frame.classList.toggle('scrollable-left', scrollLeft > 10);

        // Show right indicator if we can scroll right
        frame.classList.toggle('scrollable-right', scrollLeft + clientWidth < scrollWidth - 10);
    };

    // Update indicators on scroll
    wrapper.addEventListener('scroll', updateScrollIndicators);
    
    // Update indicators when content loads or window resizes
    window.addEventListener('resize', updateScrollIndicators);
    
    // Initial check
    setTimeout(updateScrollIndicators, 100);
};

/**
 * Format a Date as YYYY-MM-DD in the viewer's local time.
 * Cal-Heatmap renders cells at viewer-local midnight, so cell timestamps have
 * to be read back as local dates (same reasoning as tooltips.js).
 * @param {Date} date - Date to format
 * @returns {string} Local date string
 */
const toLocalDateStr = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * Today's date in the tracker's configured timezone, as YYYY-MM-DD.
 * The tracker reports Garmin days in that timezone, so that is the day to
 * bring into view, not the viewer's own calendar day.
 * @param {Date} now - Current instant
 * @returns {string} Date string in the configured timezone
 */
const todayInTrackingTz = (now) => {
    const timeZone = window.CONFIG?.TIMEZONE;
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now);
    const part = (type) => parts.find((p) => p.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
};

/**
 * Find the heatmap cell for a given date.
 * Cal-Heatmap is built on D3, which stores each cell's datum on the element as
 * `__data__` (what `d3.select(cell).datum()` reads); `t` is the cell timestamp.
 * @param {string} dateStr - Target date as YYYY-MM-DD
 * @returns {Element|null} The matching cell, or null
 */
const findCellForDate = (dateStr) => {
    const cells = document.querySelectorAll('#cal-heatmap rect.ch-subdomain-bg');

    for (const cell of cells) {
        const timestamp = cell.__data__?.t;
        if (!timestamp) continue;
        if (toLocalDateStr(new Date(timestamp)) === dateStr) return cell;
    }

    return null;
};

/**
 * Where today sits across the visible width, as a fraction. Past the middle,
 * so the view leans on the days already walked rather than empty future cells.
 */
const TODAY_VIEWPORT_POSITION = 0.7;

/**
 * Scroll the heatmap horizontally to bring a target element into view
 * @param {Element} wrapper - The scrolling container
 * @param {Element} target - Element to bring into view
 */
const scrollTargetIntoView = (wrapper, target) => {
    const wrapperRect = wrapper.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    // Distance from the start of the scrollable content to the target
    const targetOffset = wrapper.scrollLeft + (targetRect.left - wrapperRect.left);
    const desired = targetOffset - (wrapper.clientWidth - targetRect.width) * TODAY_VIEWPORT_POSITION;
    const maxScroll = wrapper.scrollWidth - wrapper.clientWidth;

    wrapper.scrollLeft = Math.max(0, Math.min(desired, maxScroll));
};

/**
 * Bring today into view on load.
 *
 * The heatmap always starts at January, so on narrow screens the current day
 * sits off the right edge and has to be scrolled to by hand. Only scrolls when
 * the year overflows its container, which makes this a no-op on desktop.
 *
 * @param {Date} [now] - Current instant, injectable for tests
 * @returns {boolean} True if the heatmap was scrolled
 */
export const scrollHeatmapToToday = (now = new Date()) => {
    const wrapper = document.querySelector('.heatmap-wrapper');
    if (!wrapper) return false;

    // Nothing to bring into view when the whole year already fits
    if (wrapper.scrollWidth <= wrapper.clientWidth) return false;

    const todayStr = todayInTrackingTz(now);
    const [year, month] = todayStr.split('-').map(Number);

    // Outside the tracked year there is no "today" to scroll to
    if (year !== TRACKING_YEAR) return false;

    // Fall back to the month label when the cell carries no datum, so a
    // Cal-Heatmap internals change degrades to the right month instead of
    // leaving the view stuck on January
    const target =
        findCellForDate(todayStr) ||
        document.querySelectorAll('#cal-heatmap .ch-domain-text')[month - 1];
    if (!target) return false;

    scrollTargetIntoView(wrapper, target);
    return true;
};
