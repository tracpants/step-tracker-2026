/**
 * Utility functions for the Step Tracker app
 */

/**
 * Format number with commas for readability
 * @param {number} n - Number to format
 * @returns {string} Formatted number string
 */
export const fmt = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Render a Lucide icon by name
 * @param {string} iconName - Name of the Lucide icon (e.g., 'trophy', 'map-pin')
 * @returns {string} HTML string for the icon
 */
export const renderIcon = (iconName) => {
    return `<i data-lucide="${iconName}"></i>`;
};

/**
 * Get responsive cell dimensions based on screen width
 * @returns {Object} Cell configuration with width, height, and gutter
 */
export const getResponsiveCellConfig = () => {
    const width = window.innerWidth;

    // Mobile phones (≤480px): Larger cells for easier tapping
    if (width <= 480) {
        return { width: 18, height: 18, gutter: 5 };
    }
    // Tablets (≤768px): Medium cells
    else if (width <= 768) {
        return { width: 15, height: 15, gutter: 4 };
    }
    // Desktop: Standard cells
    else {
        return { width: 11, height: 11, gutter: 4 };
    }
};

/**
 * Safe error handling wrapper for async operations
 * @param {Function} fn - Function to execute
 * @param {string} context - Context for error logging
 */
export const safeExecute = async (fn, context = 'operation') => {
    try {
        return await fn();
    } catch (error) {
        console.error(`Error in ${context}:`, error);
        return null;
    }
};

/**
 * Render a reusable stats card for tooltips
 * @param {Object} config - Configuration object
 * @param {string} config.title - Optional header title
 * @param {string} config.titleIcon - Optional icon name for the title
 * @param {Array} config.stats - Array of stat objects {label, value, icon}
 * @param {string} config.footer - Optional footer text
 * @param {string} config.simple - Optional simple text for basic tooltips
 * @returns {string} HTML string for the stats card
 */
export const renderStatsCard = (config) => {
    // Simple mode: just render plain text with padding
    if (config.simple) {
        return `<div class="stats-card-simple">${config.simple}</div>`;
    }

    let html = '';

    // Header
    if (config.title) {
        let titleContent = config.title;
        if (config.titleIcon) {
            titleContent = `${renderIcon(config.titleIcon)} ${config.title}`;
        }
        html += `<div class="stats-card-header">${titleContent}</div>`;
    }

    // Body with stats
    if (config.stats && config.stats.length > 0) {
        html += '<div class="stats-card-body">';
        config.stats.forEach(stat => {
            html += '<div class="stats-card-row">';
            html += `<div class="stats-card-label">`;
            if (stat.icon) {
                html += `<span class="stats-card-icon">${renderIcon(stat.icon)}</span>`;
            }
            html += `<span>${stat.label}</span>`;
            html += '</div>';
            html += `<div class="stats-card-value">${stat.value}</div>`;
            html += '</div>';
        });
        html += '</div>';
    }

    // Footer
    if (config.footer) {
        html += `<div class="stats-card-footer">${config.footer}</div>`;
    }

    return html;
};
