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
        date: { start: new Date(TRACKING_YEAR, 0, 1) },
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

    const updateScrollIndicators = () => {
        const { scrollLeft, scrollWidth, clientWidth } = wrapper;
        
        // Show left indicator if we can scroll left
        if (scrollLeft > 10) {
            wrapper.classList.add('scrollable-left');
        } else {
            wrapper.classList.remove('scrollable-left');
        }
        
        // Show right indicator if we can scroll right
        if (scrollLeft + clientWidth < scrollWidth - 10) {
            wrapper.classList.add('scrollable-right');
        } else {
            wrapper.classList.remove('scrollable-right');
        }
    };

    // Update indicators on scroll
    wrapper.addEventListener('scroll', updateScrollIndicators);
    
    // Update indicators when content loads or window resizes
    window.addEventListener('resize', updateScrollIndicators);
    
    // Initial check
    setTimeout(updateScrollIndicators, 100);
};
