/**
 * Main entry point for Step Tracker app
 */

import { loadStepData, processChartData } from './dataLoader.js';
import { calculateStats, formatLastUpdated } from './stats.js';
import { initHeatmap, setupHeatmapTracking } from './heatmap.js';
import { setupCellTooltips, setupMonthTooltips, setupStatTooltips } from './tooltips.js';
import { fmt } from './utils.js';

// Initialize dayjs plugins
dayjs.extend(dayjs_plugin_utc);
dayjs.extend(dayjs_plugin_timezone);

/**
 * Update DOM elements with calculated statistics
 * @param {Object} stats - Calculated statistics
 */
const updateStatsDisplay = (stats) => {
    document.getElementById("total-steps").innerText = fmt(stats.total);
    document.getElementById("daily-average").innerText = fmt(stats.dailyAverage);
    document.getElementById("current-streak").innerText = stats.streak;
    document.getElementById("goal-percentage").innerText = stats.goalPercentage + "%";

    // Trigger fade-in animation for stats
    document.querySelector('.stats').classList.add('loaded');
};

/**
 * Update last updated timestamp display
 * @param {Date} lastUpdated - Last update timestamp
 */
const updateLastUpdatedDisplay = (lastUpdated) => {
    const timeAgo = formatLastUpdated(lastUpdated);
    if (timeAgo) {
        document.getElementById("last-updated").innerText = "Last updated: " + timeAgo;
    }
};

/**
 * Show the heatmap and hide loading skeleton
 */
const showHeatmap = () => {
    const skeleton = document.getElementById('loading-skeleton');
    const heatmap = document.getElementById('cal-heatmap');
    const legend = document.querySelector('.legend');
    const lastUpdated = document.querySelector('.last-updated');

    if (skeleton) skeleton.classList.add('hidden');
    if (heatmap) heatmap.classList.add('loaded');
    if (legend) legend.classList.add('loaded');
    if (lastUpdated) lastUpdated.classList.add('loaded');
};

/**
 * Initialize the application
 */
const init = async () => {
    try {
        // Load and process data
        const { data, lastUpdated } = await loadStepData();
        const chartData = processChartData(data);

        // Calculate statistics
        const stats = calculateStats(data, chartData);

        // Update UI with stats
        updateStatsDisplay(stats);
        updateLastUpdatedDisplay(lastUpdated);

        // Initialize heatmap
        const cal = initHeatmap(chartData);
        setupHeatmapTracking(cal);

        // Setup tooltips after calendar renders
        setTimeout(() => {
            showHeatmap();
            setupCellTooltips(chartData, stats);
            setupMonthTooltips(stats.monthlyTotals);
            setupStatTooltips(stats);
        }, 500);

    } catch (error) {
        console.error('Error initializing app:', error);
    }
};

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
