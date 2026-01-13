/**
 * Data loading module for Step Tracker
 */

/**
 * Fetch data from a URL with cache busting
 * @param {string} url - URL to fetch from
 * @returns {Promise<Object>} Promise resolving to JSON data
 */
const fetchData = (url) => fetch(url + '?t=' + Date.now()).then(r => r.json());

/**
 * Load step data from R2 or local fallback
 * @returns {Promise<Object>} Promise resolving to processed data with metadata
 */
export const loadStepData = async () => {
    // Determine data source - R2 or local with fallback
    const primaryUrl = window.CONFIG?.R2_DATA_URL || './steps_data.json';
    const fallbackUrl = './steps_data.json';

    // Try R2 first, fall back to local if it fails
    const jsonData = primaryUrl !== fallbackUrl ?
        await fetchData(primaryUrl).catch(err => {
            console.log('R2 fetch failed, falling back to local data:', err.message);
            return fetchData(fallbackUrl);
        }) :
        await fetchData(primaryUrl);

    // Handle new structure with metadata, or legacy flat structure
    let data, lastUpdated;
    if (jsonData && typeof jsonData === 'object' && 'data' in jsonData && 'metadata' in jsonData) {
        // New structure
        data = jsonData.data;
        lastUpdated = jsonData.metadata.lastUpdated ? new Date(jsonData.metadata.lastUpdated) : null;
    } else {
        // Legacy structure - treat entire content as data
        data = jsonData;
        lastUpdated = null;
    }

    return { data, lastUpdated };
};

/**
 * Process raw data into chart format
 * @param {Object} data - Raw step data (date: steps mapping)
 * @returns {Array} Chart data array with date, value, and km fields
 */
export const processChartData = (data) => {
    // Convert data to array format expected by cal-heatmap
    // Handle both old format (integer) and new format (object with steps and km)
    const chartData = [];
    Object.keys(data).forEach(dateStr => {
        const entry = data[dateStr];
        const steps = typeof entry === 'object' ? entry.steps : entry;
        chartData.push({
            date: dateStr,
            value: steps,
            km: typeof entry === 'object' ? entry.km : 0
        });
    });

    // Ensure today's date is in chartData even if not in data yet
    // This ensures current day shows the legend's 0-step color instead of empty/black
    const todayInTz = dayjs().tz(window.CONFIG?.TIMEZONE || dayjs.tz.guess());
    const todayStr = todayInTz.format('YYYY-MM-DD');
    const todayYear = todayInTz.year();

    // Only add today if it's not already in the data and is within 2026
    if (!data[todayStr] && todayYear === 2026) {
        chartData.push({
            date: todayStr,
            value: 0,
            km: 0
        });
    }

    return chartData;
};
