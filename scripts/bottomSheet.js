/**
 * Mobile bottom sheet management module
 */

import { triggerHapticFeedback } from './utils.js';
import { generatePanelContent, renderPanelContent } from './statPanelContent.js';

let currentSelectedStat = null;
let isSheetOpen = false;

const sheetBackdrop = document.getElementById('stat-sheet-backdrop');
const sheet = document.getElementById('stat-sheet');

/**
 * Open the bottom sheet with specific stat data
 * @param {string} statType - Type of stat: 'total', 'average', 'streak', 'year'
 * @param {Object} data - Data object containing all necessary stat information
 */
export const openStatSheet = (statType, data) => {
    currentSelectedStat = statType;
    isSheetOpen = true;

    // Trigger haptic feedback for sheet opening
    triggerHapticFeedback('light');

    // Populate the sheet content based on stat type
    populateStatSheet(statType, data);

    // Show the sheet with animation
    requestAnimationFrame(() => {
        sheetBackdrop.classList.add('open');
        sheet.classList.add('open');
        sheet.setAttribute('aria-hidden', 'false');
    });

    // Initialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }

    // Track sheet opening
    if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({
            path: `stat-sheet-opened-${statType}`,
            title: `Stat Sheet Opened: ${statType}`,
            event: true
        });
    }
};

/**
 * Close the bottom sheet
 */
export const closeStatSheet = () => {
    isSheetOpen = false;
    sheetBackdrop.classList.remove('open');
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');

    // Clear selection after animation
    setTimeout(() => {
        if (!isSheetOpen) {
            currentSelectedStat = null;
        }
    }, 300);
};

/**
 * Populate the sheet with content based on stat type
 * @param {string} statType - Type of stat
 * @param {Object} data - Data object
 */
const populateStatSheet = (statType, data) => {
    const titleEl = document.getElementById('stat-sheet-title');
    const timeframeEl = document.getElementById('stat-sheet-timeframe');
    const heroValueEl = document.getElementById('stat-sheet-hero-value');
    const heroLabelEl = document.getElementById('stat-sheet-hero-label');
    const detailsEl = document.getElementById('stat-sheet-details');

    // Generate content using shared module (mobile gets minimal features)
    const content = generatePanelContent(statType, data, {
        includeProgressBars: false,
        includeAchievementCards: false
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
    detailsEl.innerHTML = renderPanelContent(content, 'stat-sheet');
};

/**
 * Initialize bottom sheet event listeners
 */
export const initBottomSheetListeners = () => {
    // Backdrop click to close
    sheetBackdrop.addEventListener('click', closeStatSheet);

    // Close button click to close
    const sheetCloseButton = document.getElementById('stat-sheet-close');
    if (sheetCloseButton) {
        sheetCloseButton.addEventListener('click', closeStatSheet);
    }

    // Keyboard navigation support
    document.addEventListener('keydown', (evt) => {
        if (isSheetOpen && evt.key === 'Escape') {
            closeStatSheet();
        }
    });

    // Focus management - focus close button when sheet opens
    const originalFocusedElement = document.activeElement;
    const focusCloseButton = () => {
        if (isSheetOpen && sheetCloseButton) {
            sheetCloseButton.focus();
        }
    };

    // Store the originally focused element when sheet opens
    sheet.addEventListener('transitionend', () => {
        if (isSheetOpen) {
            focusCloseButton();
        } else {
            // Return focus to the originally focused element when sheet closes
            if (originalFocusedElement && originalFocusedElement.focus) {
                originalFocusedElement.focus();
            }
        }
    });
};
