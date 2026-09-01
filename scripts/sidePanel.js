/**
 * Desktop side panel management module
 */

import { generatePanelContent, renderPanelContent } from './statPanelContent.js';
import { isMobileDevice, trapFocus, lockBodyScroll, unlockBodyScroll } from './utils.js';

let currentSelectedStat = null;
let isPanelOpen = false;

// Element focused before the panel opened, restored on close
let lastFocusedElement = null;

const panel = document.getElementById('stat-side-panel');
const backdrop = document.getElementById('stat-side-panel-backdrop');

/**
 * Detect if the device should use desktop side panel or mobile bottom sheet
 * @returns {boolean} True if should use desktop side panel
 */
export const shouldUseDesktopSidePanel = () => !isMobileDevice();

/**
 * Open the desktop side panel with stat data
 * @param {string} statType - Type of stat: 'total', 'average', 'streak', 'year'
 * @param {Object} data - Data object containing all necessary stat information
 */
export const openStatSidePanel = (statType, data) => {
    currentSelectedStat = statType;
    isPanelOpen = true;
    lastFocusedElement = document.activeElement;
    lockBodyScroll('stat-side-panel');

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
    unlockBodyScroll('stat-side-panel');
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
        includeProgressBars: true
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

    // ESC to close, Tab kept inside the panel while it is open
    document.addEventListener('keydown', (evt) => {
        if (!isPanelOpen) return;

        if (evt.key === 'Escape') {
            closeStatSidePanel();
        } else {
            trapFocus(panel, evt);
        }
    });

    // Focus management - focus the close button when the panel opens, restore
    // focus to whatever was focused before it opened when it closes
    if (panel) {
        panel.addEventListener('transitionend', (evt) => {
            // transitionend bubbles, so ignore transitions on the panel's contents
            if (evt.target !== panel || evt.propertyName !== 'transform') return;

            if (isPanelOpen) {
                if (closeButton) {
                    closeButton.focus();
                }
            } else if (lastFocusedElement && lastFocusedElement.focus) {
                lastFocusedElement.focus();
            }
        });
    }
};
