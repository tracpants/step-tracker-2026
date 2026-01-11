/**
 * Statistics calculation module
 */

/**
 * Calculate statistics from step data
 * @param {Object} data - Raw step data
 * @param {Array} chartData - Processed chart data
 * @returns {Object} Calculated statistics
 */
export const calculateStats = (data, chartData) => {
    // Find the day with max steps for highlighting
    let maxSteps = 0;
    let maxStepDate = null;
    chartData.forEach(item => {
        if (item.value > maxSteps) {
            maxSteps = item.value;
            maxStepDate = item.date;
        }
    });

    // Calculate monthly totals for tooltips
    const monthlyTotals = {};
    chartData.forEach(item => {
        const monthKey = item.date.substring(0, 7); // Get YYYY-MM
        if (!monthlyTotals[monthKey]) {
            monthlyTotals[monthKey] = { steps: 0, km: 0, maxDay: null, maxSteps: 0 };
        }
        monthlyTotals[monthKey].steps += item.value;
        monthlyTotals[monthKey].km += item.km;

        // Track the day with the most steps
        if (item.value > monthlyTotals[monthKey].maxSteps) {
            monthlyTotals[monthKey].maxSteps = item.value;
            monthlyTotals[monthKey].maxDay = item.date;
        }
    });

    let total = 0, totalKm = 0, streak = 0, active = true;
    let streakStartDate = null, streakEndDate = null;
    let today = new Date(); today.setHours(0,0,0,0);
    let dayCount = Object.keys(data).length;
    let daysWithGoal = 0; // Count days that hit 10k+

    Object.keys(data).sort().reverse().forEach(dateStr => {
        const entry = data[dateStr];
        let steps = typeof entry === 'object' ? entry.steps : entry;
        let km = typeof entry === 'object' ? entry.km : 0;
        total += steps;
        totalKm += km;

        // Count days with 10k+ steps
        if (steps >= 10000) {
            daysWithGoal++;
        }

        let date = new Date(dateStr + 'T00:00:00'); date.setHours(0,0,0,0);
        if (active && date <= today) {
            if (steps >= 10000) {
                streak++;
                if (streakEndDate === null) streakEndDate = dateStr; // First day we encounter (most recent)
                streakStartDate = dateStr; // Keep updating to get the earliest day
            } else if (date.getTime() !== today.getTime()) {
                active = false;
            }
        }
    });

    const dailyAverage = dayCount > 0 ? Math.round(total / dayCount) : 0;
    const averageKm = dayCount > 0 ? (totalKm / dayCount).toFixed(1) : 0;

    // Calculate day of year (1-366)
    const yearStart = new Date(2026, 0, 1);
    const dayOfYear = Math.ceil((today - yearStart) / (1000 * 60 * 60 * 24)) + 1;
    const goalPercentage = Math.round((daysWithGoal / 365) * 100);

    return {
        total,
        totalKm,
        dailyAverage,
        averageKm,
        streak,
        streakStartDate,
        streakEndDate,
        goalPercentage,
        dayOfYear,
        daysWithGoal,
        maxSteps,
        maxStepDate,
        monthlyTotals
    };
};

/**
 * Format last updated time as human-readable string
 * @param {Date} lastUpdated - Last update timestamp
 * @returns {string} Human-readable time ago string
 */
export const formatLastUpdated = (lastUpdated) => {
    if (!lastUpdated) return null;

    const now = new Date();
    const diffMs = now - lastUpdated;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) {
        return "just now";
    } else if (diffMinutes < 60) {
        return diffMinutes === 1 ? "1 minute ago" : diffMinutes + " minutes ago";
    } else if (diffHours < 24) {
        return diffHours === 1 ? "1 hour ago" : diffHours + " hours ago";
    } else if (diffDays === 1) {
        return "yesterday";
    } else {
        return diffDays + " days ago";
    }
};
