/**
 * Heatmap rendering module
 */

import { getResponsiveCellConfig } from './utils.js';

/**
 * Initialize and paint the calendar heatmap
 * @param {Array} chartData - Processed chart data
 * @returns {CalHeatmap} The calendar heatmap instance
 */
export const initHeatmap = (chartData) => {
    const cal = new CalHeatmap();
    const cellConfig = getResponsiveCellConfig();

    cal.paint({
        data: {
            source: chartData,
            x: 'date',
            y: 'value',
        },
        date: { start: new Date('2026-01-01') },
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

    return cal;
};

/**
 * Setup click tracking for heatmap cells
 * @param {CalHeatmap} cal - Calendar heatmap instance
 */
export const setupHeatmapTracking = (cal) => {
    cal.on('click', function(event, timestamp, value) {
        console.log('Clicked:', timestamp, value);

        // Track heatmap cell interactions
        if (window.goatcounter && window.goatcounter.count && value > 0) {
            const clickedDate = new Date(timestamp);
            const dateStr = dayjs(clickedDate)
                .tz(window.CONFIG?.TIMEZONE || dayjs.tz.guess())
                .format('YYYY-MM-DD');

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
