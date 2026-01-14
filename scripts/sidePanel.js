/**
 * Desktop side panel management module
 */

import { generatePanelContent, renderPanelContent } from './statPanelContent.js';

let currentSelectedStat = null;
let isPanelOpen = false;

const panel = document.getElementById('stat-side-panel');
const backdrop = document.getElementById('stat-side-panel-backdrop');

/**
 * Detect if the device should use desktop side panel or mobile bottom sheet
 * @returns {boolean} True if should use desktop side panel
 */
export const shouldUseDesktopSidePanel = () => {
    // Check for hover capability and screen width
    const hasHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const isWideScreen = window.innerWidth > 768;
    return hasHover && isWideScreen;
};

/**
 * Open the desktop side panel with stat data
 * @param {string} statType - Type of stat: 'total', 'average', 'streak', 'year'
 * @param {Object} data - Data object containing all necessary stat information
 */
export const openStatSidePanel = (statType, data) => {
    currentSelectedStat = statType;
    isPanelOpen = true;

    // Populate the panel content
    populateStatSidePanel(statType, data);

    // Show the panel with animation
    requestAnimationFrame(() => {
        backdrop.classList.add('open');
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
    });

    // Initialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }

    // Track panel opening
    if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({
            path: `stat-side-panel-opened-${statType}`,
            title: `Stat Side Panel Opened: ${statType}`,
            event: true
        });
    }
};

/**
 * Close the desktop side panel
 */
export const closeStatSidePanel = () => {
    isPanelOpen = false;
    backdrop.classList.remove('open');
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');

    // Clear selection after animation
    setTimeout(() => {
        if (!isPanelOpen) {
            currentSelectedStat = null;
        }
    }, 300);
};

/**
 * Populate the side panel with content based on stat type
 * @param {string} statType - Type of stat
 * @param {Object} data - Data object
 */
const populateStatSidePanel = (statType, data) => {
    const titleEl = document.getElementById('stat-side-panel-title');
    const timeframeEl = document.getElementById('stat-side-panel-timeframe');
    const heroValueEl = document.getElementById('stat-side-panel-hero-value');
    const heroLabelEl = document.getElementById('stat-side-panel-hero-label');
    const detailsEl = document.getElementById('stat-side-panel-details-content');

    // Generate content using shared module (desktop gets full features)
    const content = generatePanelContent(statType, data, {
        includeProgressBars: true,
        includeAchievementCards: true
    });

    if (!content) {
        console.error('Unknown stat type:', statType);
        return;
    }

    // Set header content
    titleEl.textContent = content.title;
    timeframeEl.textContent = content.timeframe;
    heroValueEl.textContent = content.heroValue;
    heroLabelEl.textContent = content.heroLabel;

    // Render details using shared renderer
    detailsEl.innerHTML = renderPanelContent(content, 'stat-side-panel');
};

/**
 * Initialize side panel event listeners
 */
export const initSidePanelListeners = () => {
    // Backdrop click to close
    if (backdrop) {
        backdrop.addEventListener('click', closeStatSidePanel);
    }

    // Close button click
    const closeButton = document.getElementById('stat-side-panel-close');
    if (closeButton) {
        closeButton.addEventListener('click', closeStatSidePanel);
    }

    // ESC key to close
    document.addEventListener('keydown', (evt) => {
        if (evt.key === 'Escape' && isPanelOpen) {
            closeStatSidePanel();
        }
    });
};
