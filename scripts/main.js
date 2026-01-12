/**
 * Main entry point for Step Tracker app
 */

import { loadStepData, processChartData } from './dataLoader.js';
import { calculateStats, formatLastUpdated } from './stats.js';
import { initHeatmap, setupHeatmapTracking } from './heatmap.js';
import { setupCellTooltips, setupMonthTooltips } from './tooltips.js';
import { shouldUseDesktopPopover, openStatPopover, initPopoverListeners } from './popover.js';
import { openStatSheet, initBottomSheetListeners } from './bottomSheet.js';
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
 * Setup click handlers for stat cards
 * @param {Object} data - Raw step data
 * @param {Object} stats - Calculated statistics
 */
const setupStatCardInteractions = (data, stats) => {
    const statCards = document.querySelectorAll('.stats > div');

    // Helper to format dates
    const formatMaxDay = (dateStr) => {
        const date = new Date(dateStr + 'T00:00:00');
        const formatted = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
        return `${formatted} (${fmt(stats.maxSteps)})`;
    };

    const formatStreakDate = (dateStr) => {
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    };

    const bestDayStr = stats.maxStepDate ? formatMaxDay(stats.maxStepDate) : 'N/A';

    // Period string for total steps
    const dates = Object.keys(data).sort();
    const firstDate = dates[0] ? new Date(dates[0] + 'T00:00:00') : null;
    const lastDate = dates[dates.length - 1] ? new Date(dates[dates.length - 1] + 'T00:00:00') : null;
    let periodStr = 'Jan 2026';
    if (firstDate && lastDate) {
        const first = firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const last = lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        periodStr = `${first}–${last}`;
    }

    // Streak period formatting
    let streakPeriod = 'N/A';
    if (stats.streak > 0 && stats.streakStartDate && stats.streakEndDate) {
        if (stats.streakStartDate === stats.streakEndDate) {
            streakPeriod = formatStreakDate(stats.streakStartDate);
        } else {
            streakPeriod = `${formatStreakDate(stats.streakStartDate)} - ${formatStreakDate(stats.streakEndDate)}`;
        }
    }

    const adherence = stats.dayOfYear > 0 ? Math.round((stats.daysWithGoal / stats.dayOfYear) * 100) : 0;

    // Universal click handler that chooses desktop popover or mobile bottom sheet
    const handleStatClick = (statType, data, element) => {
        if (shouldUseDesktopPopover()) {
            openStatPopover(statType, data, element);
        } else {
            openStatSheet(statType, data);
        }
    };

    // Card 0: Total Steps
    if (statCards[0]) {
        statCards[0].addEventListener('click', () => {
            handleStatClick('total', {
                total: stats.total,
                totalKm: stats.totalKm,
                periodStr,
                bestDayStr
            }, statCards[0]);
        });
    }

    // Card 1: Daily Average
    if (statCards[1]) {
        statCards[1].addEventListener('click', () => {
            handleStatClick('average', {
                dailyAverage: stats.dailyAverage,
                averageKm: stats.averageKm,
                dayCount: Object.keys(data).length,
                bestDayStr
            }, statCards[1]);
        });
    }

    // Card 2: 10k+ Streak
    if (statCards[2]) {
        statCards[2].addEventListener('click', () => {
            handleStatClick('streak', {
                streak: stats.streak,
                streakPeriod,
                streakActive: stats.streak > 0 // simplified active check
            }, statCards[2]);
        });
    }

    // Card 3: Year Progress
    if (statCards[3]) {
        statCards[3].addEventListener('click', () => {
            handleStatClick('year', {
                goalPercentage: stats.goalPercentage,
                daysWithGoal: stats.daysWithGoal,
                dayOfYear: stats.dayOfYear,
                adherence
            }, statCards[3]);
        });
    }
};

/**
 * Initialize the application
 */
const init = async () => {
    try {
        // Initialize event listeners
        initPopoverListeners();
        initBottomSheetListeners();

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

        // Setup interactions after calendar renders
        setTimeout(() => {
            showHeatmap();
            setupCellTooltips(chartData, stats);
            setupMonthTooltips(stats.monthlyTotals);
            setupStatCardInteractions(data, stats);
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
