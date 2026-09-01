/**
 * Utility functions for the Step Tracker app
 */

/**
 * The calendar year this tracker displays. Sourced from config.js so the
 * yearly rollover is a one-line change there.
 */
export const TRACKING_YEAR = Number(globalThis.window?.CONFIG?.YEAR) || 2026;

/**
 * Number of days in the tracking year (handles leap years)
 */
export const DAYS_IN_TRACKING_YEAR =
    (TRACKING_YEAR % 4 === 0 && TRACKING_YEAR % 100 !== 0) || TRACKING_YEAR % 400 === 0 ? 366 : 365;

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

    // Mobile phones (≤480px): Larger cells for easier tapping (minimum 24px for accessibility)
    if (width <= 480) {
        return { width: 24, height: 24, gutter: 5 };
    }
    // Tablets (≤768px): Medium cells
    else if (width <= 768) {
        return { width: 20, height: 20, gutter: 4 };
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
 * Detect if the device is mobile (no hover capability or narrow screen)
 * @returns {boolean} True if device is mobile
 */
export const isMobileDevice = () => {
    // Check for hover capability and screen width
    const hasHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const isNarrowScreen = window.innerWidth <= 768;
    return !hasHover || isNarrowScreen;
};

/**
 * Trigger haptic feedback if available (iOS Safari, Chrome Android)
 * @param {string} type - Type of haptic: 'light', 'medium', 'heavy'
 */
export const triggerHapticFeedback = (type = 'light') => {
    if ('vibrate' in navigator && isMobileDevice()) {
        // Simple vibration patterns for different feedback types
        const patterns = {
            light: [10],
            medium: [20],
            heavy: [30]
        };
        navigator.vibrate(patterns[type] || patterns.light);
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
            // Icon column (20px)
            if (stat.icon) {
                html += `<div class="stats-card-icon">${renderIcon(stat.icon)}</div>`;
            } else {
                html += '<div class="stats-card-icon"></div>';
            }
            // Label column (1fr)
            html += `<div class="stats-card-label">${stat.label}</div>`;
            // Value column (auto)
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

/**
 * Elements inside a dialog that can receive keyboard focus
 */
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keep Tab focus inside a container. Call from a keydown handler while the
 * container is open, otherwise focus escapes into the page behind it.
 * @param {HTMLElement} container - Dialog element to trap focus within
 * @param {KeyboardEvent} evt - The keydown event
 */
export const trapFocus = (container, evt) => {
    if (evt.key !== 'Tab' || !container) return;

    const focusable = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) {
        evt.preventDefault();
        return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (evt.shiftKey && document.activeElement === first) {
        evt.preventDefault();
        last.focus();
    } else if (!evt.shiftKey && document.activeElement === last) {
        evt.preventDefault();
        first.focus();
    }
};

// Owners currently holding the body scroll lock, so two overlapping dialogs
// cannot unlock the page out from under each other
const scrollLockOwners = new Set();
let savedScrollY = 0;

/**
 * Freeze background scrolling while a dialog is open
 * @param {string} owner - Identifier for the dialog requesting the lock
 */
export const lockBodyScroll = (owner) => {
    if (scrollLockOwners.has(owner)) return;

    if (scrollLockOwners.size === 0) {
        savedScrollY = window.scrollY;
        document.body.style.top = `-${savedScrollY}px`;
        document.body.classList.add('scroll-locked');
    }
    scrollLockOwners.add(owner);
};

/**
 * Release the scroll lock and restore the previous scroll position
 * @param {string} owner - Identifier passed to lockBodyScroll
 */
export const unlockBodyScroll = (owner) => {
    if (!scrollLockOwners.delete(owner)) return;
    if (scrollLockOwners.size > 0) return;

    document.body.classList.remove('scroll-locked');
    document.body.style.top = '';
    window.scrollTo(0, savedScrollY);
};
