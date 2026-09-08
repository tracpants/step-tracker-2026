import { describe, it, expect, beforeEach } from 'vitest';
import { setupHeatmapScrollIndicators, scrollHeatmapToToday } from '../heatmap.js';

/**
 * Build the heatmap markup from index.html and give the scroller a
 * scrollable geometry (happy-dom does no layout, so the metrics the
 * indicator logic reads have to be supplied).
 */
const buildHeatmap = ({ scrollLeft, scrollWidth, clientWidth }) => {
  document.body.innerHTML = `
    <div class="heatmap-scroll-frame">
      <div class="heatmap-wrapper"><div id="cal-heatmap"></div></div>
    </div>`;

  const wrapper = document.querySelector('.heatmap-wrapper');
  Object.defineProperties(wrapper, {
    scrollLeft: { value: scrollLeft, writable: true, configurable: true },
    scrollWidth: { value: scrollWidth, configurable: true },
    clientWidth: { value: clientWidth, configurable: true },
  });

  return { wrapper, frame: document.querySelector('.heatmap-scroll-frame') };
};

const scrollTo = (wrapper, scrollLeft) => {
  wrapper.scrollLeft = scrollLeft;
  wrapper.dispatchEvent(new Event('scroll'));
};

describe('setupHeatmapScrollIndicators', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // The indicators only run on mobile-sized viewports
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  });

  it('marks only the right edge as scrollable at the start of the range', () => {
    const { wrapper, frame } = buildHeatmap({ scrollLeft: 0, scrollWidth: 1200, clientWidth: 370 });

    setupHeatmapScrollIndicators();
    scrollTo(wrapper, 0);

    expect(frame.classList.contains('scrollable-left')).toBe(false);
    expect(frame.classList.contains('scrollable-right')).toBe(true);
  });

  it('marks both edges as scrollable mid-range', () => {
    const { wrapper, frame } = buildHeatmap({ scrollLeft: 0, scrollWidth: 1200, clientWidth: 370 });

    setupHeatmapScrollIndicators();
    scrollTo(wrapper, 400);

    expect(frame.classList.contains('scrollable-left')).toBe(true);
    expect(frame.classList.contains('scrollable-right')).toBe(true);
  });

  it('marks only the left edge as scrollable at the end of the range', () => {
    const { wrapper, frame } = buildHeatmap({ scrollLeft: 0, scrollWidth: 1200, clientWidth: 370 });

    setupHeatmapScrollIndicators();
    scrollTo(wrapper, 830);

    expect(frame.classList.contains('scrollable-left')).toBe(true);
    expect(frame.classList.contains('scrollable-right')).toBe(false);
  });

  // The fades are drawn on the static frame; on the scroller itself they
  // would be positioned against the scrolled content and drift inland.
  it('puts the indicator classes on the frame, never on the scroller', () => {
    const { wrapper, frame } = buildHeatmap({ scrollLeft: 0, scrollWidth: 1200, clientWidth: 370 });

    setupHeatmapScrollIndicators();
    scrollTo(wrapper, 400);

    expect(frame.className).toContain('scrollable-');
    expect(wrapper.className).toBe('heatmap-wrapper');
  });
});

/**
 * Build a heatmap of month domains, each holding day cells, with the layout
 * metrics happy-dom cannot produce. Cells carry the D3 datum Cal-Heatmap binds
 * (`__data__.t`), months carry the label element the month tooltips use.
 *
 * Every cell is CELL_WIDTH wide and laid out left to right from the container
 * origin, so a cell's page position is its index times its width.
 */
const CELL_WIDTH = 30;

const buildYear = ({ clientWidth, days }) => {
  document.body.innerHTML = `
    <div class="heatmap-scroll-frame">
      <div class="heatmap-wrapper"><div id="cal-heatmap"></div></div>
    </div>`;

  const wrapper = document.querySelector('.heatmap-wrapper');
  const root = document.getElementById('cal-heatmap');
  const scrollWidth = days.length * CELL_WIDTH;

  Object.defineProperties(wrapper, {
    scrollLeft: { value: 0, writable: true, configurable: true },
    scrollWidth: { value: scrollWidth, configurable: true },
    clientWidth: { value: clientWidth, configurable: true },
  });
  wrapper.getBoundingClientRect = () => ({ left: 0, width: clientWidth });

  // One label per month, in calendar order, as Cal-Heatmap renders them
  const months = new Set(days.map((day) => day.slice(0, 7)));
  [...months].sort().forEach((month) => {
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('class', 'ch-domain-text');
    label.dataset.month = month;
    root.appendChild(label);
  });

  days.forEach((day, index) => {
    const cell = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    cell.setAttribute('class', 'ch-subdomain-bg');
    // Cal-Heatmap renders each cell at viewer-local midnight
    cell.__data__ = { t: new Date(`${day}T00:00:00`).getTime() };
    // Position within the content, offset by however far it has scrolled
    cell.getBoundingClientRect = () => ({
      left: index * CELL_WIDTH - wrapper.scrollLeft,
      width: CELL_WIDTH,
    });
    root.appendChild(cell);
  });

  return wrapper;
};

// Every day of 2026 up to and including the given date, as local dates so the
// generated days match the local-midnight cells regardless of the host timezone
const daysThrough = (lastDay) => {
  const pad = (n) => String(n).padStart(2, '0');
  const days = [];
  for (let d = new Date(2026, 0, 1); ; d.setDate(d.getDate() + 1)) {
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    days.push(day);
    if (day === lastDay) return days;
  }
};

describe('scrollHeatmapToToday', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.CONFIG = { TIMEZONE: 'Australia/Sydney', YEAR: 2026 };
  });

  it('brings today into view, past the middle so history stays visible', () => {
    const days = daysThrough('2026-12-31');
    const wrapper = buildYear({ clientWidth: 370, days });

    // Midday in Sydney on 2026-06-15
    expect(scrollHeatmapToToday(new Date('2026-06-15T02:00:00Z'))).toBe(true);

    // Today is genuinely inside the visible window
    const cellLeft = days.indexOf('2026-06-15') * CELL_WIDTH - wrapper.scrollLeft;
    expect(cellLeft).toBeGreaterThanOrEqual(0);
    expect(cellLeft + CELL_WIDTH).toBeLessThanOrEqual(370);

    // ...and sits in the back half, leaving more walked days than empty ones
    expect(cellLeft).toBeGreaterThan(370 / 2);
  });

  it('uses the tracker timezone, not the viewer clock, to pick the day', () => {
    // 2026-06-14 23:00 UTC is already 2026-06-15 in Sydney
    const days = daysThrough('2026-12-31');
    const wrapper = buildYear({ clientWidth: 370, days });

    scrollHeatmapToToday(new Date('2026-06-14T23:00:00Z'));

    // The 15th is in view; the 14th, one cell to its left, would be too far right
    const cellLeft = days.indexOf('2026-06-15') * CELL_WIDTH - wrapper.scrollLeft;
    expect(cellLeft).toBeGreaterThanOrEqual(0);
    expect(cellLeft + CELL_WIDTH).toBeLessThanOrEqual(370);
    expect(cellLeft).toBeGreaterThan(370 / 2);
  });

  it('clamps to the end of the range for dates late in the year', () => {
    const days = daysThrough('2026-12-31');
    const wrapper = buildYear({ clientWidth: 370, days });

    scrollHeatmapToToday(new Date('2026-12-30T02:00:00Z'));

    expect(wrapper.scrollLeft).toBe(days.length * CELL_WIDTH - 370);
  });

  it('leaves the view alone when the whole year already fits', () => {
    const days = daysThrough('2026-01-31');
    const wrapper = buildYear({ clientWidth: days.length * CELL_WIDTH + 100, days });

    expect(scrollHeatmapToToday(new Date('2026-01-20T02:00:00Z'))).toBe(false);
    expect(wrapper.scrollLeft).toBe(0);
  });

  it('does nothing outside the tracked year', () => {
    const days = daysThrough('2026-12-31');
    const wrapper = buildYear({ clientWidth: 370, days });

    expect(scrollHeatmapToToday(new Date('2027-03-04T02:00:00Z'))).toBe(false);
    expect(wrapper.scrollLeft).toBe(0);
  });

  it('falls back to the month label when cells carry no datum', () => {
    const days = daysThrough('2026-12-31');
    const wrapper = buildYear({ clientWidth: 370, days });
    document.querySelectorAll('#cal-heatmap rect.ch-subdomain-bg')
      .forEach((cell) => { delete cell.__data__; });

    // Place the June label where June's cells sit
    const juneLabel = document.querySelector('[data-month="2026-06"]');
    const juneStart = days.indexOf('2026-06-01') * CELL_WIDTH;
    juneLabel.getBoundingClientRect = () => ({ left: juneStart - wrapper.scrollLeft, width: 0 });

    expect(scrollHeatmapToToday(new Date('2026-06-15T02:00:00Z'))).toBe(true);

    const labelLeft = juneStart - wrapper.scrollLeft;
    expect(labelLeft).toBeGreaterThanOrEqual(0);
    expect(labelLeft).toBeLessThanOrEqual(370);
  });

  it('does nothing when the heatmap is missing', () => {
    document.body.innerHTML = '';
    expect(scrollHeatmapToToday(new Date('2026-06-15T02:00:00Z'))).toBe(false);
  });
});
