/**
 * Statistics calculation module
 */

/**
 * Calculate steps for the current ISO week (Mon–Sun) in the configured timezone.
 *
 * Data keys are expected to be local dates in `YYYY-MM-DD`.
 *
 * @param {Object} data - Raw step data
 * @param {Object} [options]
 * @param {string} [options.timezone] - IANA timezone name
 * @param {string|Date} [options.now] - Override current time (for tests)
 * @returns {{ weeklyTotal: number, weekStart: string, weekEnd: string }}
 */
export const calculateWeeklyProgress = (data, options = {}) => {
    const timezone = options.timezone || window.CONFIG?.TIMEZONE || dayjs.tz.guess();
    const now = options.now ? dayjs(options.now) : dayjs();

    const weekStart = now.tz(timezone).startOf('isoWeek');
    const weekEnd = now.tz(timezone).endOf('isoWeek');
    const weekStartStr = weekStart.format('YYYY-MM-DD');
    const weekEndStr = weekEnd.format('YYYY-MM-DD');

    const weeklyTotal = Object.keys(data).reduce((sum, dateStr) => {
        if (dateStr >= weekStartStr && dateStr <= weekEndStr) {
            const entry = data[dateStr];
            const steps = typeof entry === 'object' ? entry.steps : entry;
            return sum + (steps || 0);
        }
        return sum;
    }, 0);

    return {
        weeklyTotal,
        weekStart: weekStartStr,
        weekEnd: weekEndStr
    };
};

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

    // Calculate extended metrics
    const extendedStats = calculateExtendedStats(data, chartData, {
        total, totalKm, dailyAverage, streak, daysWithGoal, dayOfYear
    });

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
        monthlyTotals,
        ...extendedStats
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

/**
 * Calculate extended statistics for enhanced popover/sheet displays
 * @param {Object} data - Raw step data
 * @param {Array} chartData - Processed chart data
 * @param {Object} baseStats - Basic calculated stats
 * @returns {Object} Extended statistics
 */
const calculateExtendedStats = (data, chartData, baseStats) => {
    const sortedDates = Object.keys(data).sort();
    const recentDays = sortedDates.slice(-7); // Last 7 days for trends
    const today = new Date(); today.setHours(0,0,0,0);
    
    // Calorie estimation (rough: ~0.04 calories per step)
    const estimatedCalories = Math.round(baseStats.total * 0.04);
    const dailyCalories = Math.round(baseStats.dailyAverage * 0.04);

    // Step pace analysis (steps per minute during active time, assuming ~12 hours active)
    const assumedActiveHours = 12;
    const stepsPerMinute = Math.round(baseStats.dailyAverage / (assumedActiveHours * 60));

    // Trend calculation (recent 7 days vs previous 7 days)
    let trend = 'stable';
    let trendPercentage = 0;
    if (sortedDates.length >= 14) {
        const recent7 = sortedDates.slice(-7);
        const previous7 = sortedDates.slice(-14, -7);
        
        const recentAvg = recent7.reduce((sum, date) => {
            const entry = data[date];
            return sum + (typeof entry === 'object' ? entry.steps : entry);
        }, 0) / 7;
        
        const previousAvg = previous7.reduce((sum, date) => {
            const entry = data[date];
            return sum + (typeof entry === 'object' ? entry.steps : entry);
        }, 0) / 7;
        
        trendPercentage = Math.round(((recentAvg - previousAvg) / previousAvg) * 100);
        if (trendPercentage > 5) trend = 'improving';
        else if (trendPercentage < -5) trend = 'declining';
    }

    // Consistency score (percentage of days with 10k+ steps)
    const consistencyScore = baseStats.dayOfYear > 0 
        ? Math.round((baseStats.daysWithGoal / baseStats.dayOfYear) * 100)
        : 0;

    // Longest streak calculation
    let longestStreak = 0;
    let currentLongestStreak = 0;
    sortedDates.forEach(dateStr => {
        const entry = data[dateStr];
        const steps = typeof entry === 'object' ? entry.steps : entry;
        
        if (steps >= 10000) {
            currentLongestStreak++;
            longestStreak = Math.max(longestStreak, currentLongestStreak);
        } else {
            currentLongestStreak = 0;
        }
    });

    // Days ahead/behind schedule for year goal (assuming goal is 10k+ every day)
    const expectedDaysCompleted = baseStats.dayOfYear; // Should have 10k+ every day so far
    const daysAheadBehind = baseStats.daysWithGoal - expectedDaysCompleted;

    // Projected year-end total
    const projectedYearEnd = baseStats.dayOfYear > 0 
        ? Math.round((baseStats.total / baseStats.dayOfYear) * 365)
        : 0;

    // Most active day of week analysis
    const dayOfWeekCounts = {};
    const dayOfWeekSteps = {};
    sortedDates.forEach(dateStr => {
        const date = new Date(dateStr + 'T00:00:00');
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const entry = data[dateStr];
        const steps = typeof entry === 'object' ? entry.steps : entry;
        
        if (!dayOfWeekCounts[dayName]) {
            dayOfWeekCounts[dayName] = 0;
            dayOfWeekSteps[dayName] = 0;
        }
        dayOfWeekCounts[dayName]++;
        dayOfWeekSteps[dayName] += steps;
    });

    let mostActiveDay = 'N/A';
    let highestAverage = 0;
    Object.keys(dayOfWeekSteps).forEach(day => {
        const avg = dayOfWeekSteps[day] / dayOfWeekCounts[day];
        if (avg > highestAverage) {
            highestAverage = avg;
            mostActiveDay = day;
        }
    });

    // Fun equivalent distances
    const kmToMiles = baseStats.totalKm * 0.621371;
    const worldLaps = (baseStats.totalKm / 40075).toFixed(3); // Earth circumference ~40,075 km
    const everestClimbs = (baseStats.totalKm / 8.848).toFixed(1); // Mount Everest height ~8.848 km

    return {
        // Health & Performance
        estimatedCalories,
        dailyCalories,
        stepsPerMinute,
        
        // Trends & Analysis
        trend,
        trendPercentage,
        consistencyScore,
        mostActiveDay,
        
        // Streaks & Records
        longestStreak,
        totalGoalDays: baseStats.daysWithGoal,
        
        // Year Progress Extended
        daysAheadBehind,
        projectedYearEnd,
        
        // Fun Stats
        kmToMiles,
        worldLaps,
        everestClimbs
    };
};
