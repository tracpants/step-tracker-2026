import { describe, it, expect, beforeEach } from 'vitest';
import { setupHeatmapScrollIndicators } from '../heatmap.js';

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
