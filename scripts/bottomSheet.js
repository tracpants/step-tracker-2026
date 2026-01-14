/**
 * Mobile bottom sheet management module
 */

import { triggerHapticFeedback } from './utils.js';
import { generatePanelContent, renderPanelContent } from './statPanelContent.js';

let currentSelectedStat = null;
let isSheetOpen = false;

const sheetBackdrop = document.getElementById('stat-sheet-backdrop');
const sheet = document.getElementById('stat-sheet');

// Touch gesture state for swipe-to-dismiss
let touchStartY = 0;
let touchStartTime = 0;
let currentY = 0;
let isDragging = false;

/**
 * Open the bottom sheet with specific stat data
 * @param {string} statType - Type of stat: 'total', 'average', 'streak', 'year'
 * @param {Object} data - Data object containing all necessary stat information
 */
export const openStatSheet = (statType, data) => {
    currentSelectedStat = statType;
    isSheetOpen = true;

    // Reset any transforms from previous swipe gestures
    sheet.style.transform = '';
    sheet.style.transition = '';
    sheetBackdrop.style.opacity = '';
    sheetBackdrop.style.transition = '';

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
 * Handle touch start - begin tracking swipe gesture
 */
const handleTouchStart = (evt) => {
    if (!isSheetOpen) return;

    // Only handle touches on the sheet itself, not interactive elements
    const target = evt.target;
    if (target.closest('button') || target.closest('a')) {
        return;
    }

    // Check if the touch is on the scrollable content
    const sheetContent = sheet.querySelector('.stat-sheet-content');
    const isTouchOnContent = sheetContent && sheetContent.contains(target);

    // If touching scrollable content and it's not at the top, don't handle swipe
    if (isTouchOnContent && sheetContent.scrollTop > 0) {
        return;
    }

    touchStartY = evt.touches[0].clientY;
    touchStartTime = Date.now();
    currentY = 0;
    isDragging = false;
};

/**
 * Handle touch move - track swipe distance and apply transform
 */
const handleTouchMove = (evt) => {
    if (!isSheetOpen || touchStartY === 0) return;

    const touchY = evt.touches[0].clientY;
    const deltaY = touchY - touchStartY;

    // Check if user is on scrollable content
    const sheetContent = sheet.querySelector('.stat-sheet-content');
    const isTouchOnContent = sheetContent && sheetContent.contains(evt.target);

    // Only allow dragging down (positive deltaY)
    if (deltaY < 0) {
        // If scrolling up on content, allow normal scroll behavior
        if (isTouchOnContent) {
            touchStartY = 0;
            currentY = 0;
            isDragging = false;
        }
        return;
    }

    // If content is scrollable and not at top, don't drag sheet
    if (isTouchOnContent && sheetContent.scrollTop > 0) {
        return;
    }

    isDragging = true;
    currentY = deltaY;

    // Apply transform to sheet with resistance effect
    // Reduce the translation by 40% for a smoother feel
    const translateY = deltaY * 0.6;

    // Calculate opacity for backdrop based on drag distance
    // Fade out backdrop as sheet is dragged down
    const maxDrag = 300;
    const backdropOpacity = Math.max(0, 1 - (deltaY / maxDrag));

    // Apply transforms without transition for smooth following
    sheet.style.transition = 'none';
    sheet.style.transform = `translateY(${translateY}px)`;
    sheetBackdrop.style.transition = 'none';
    sheetBackdrop.style.opacity = backdropOpacity;

    // Prevent scrolling when dragging
    if (deltaY > 10) {
        evt.preventDefault();
    }
};

/**
 * Handle touch end - determine if sheet should dismiss or snap back
 */
const handleTouchEnd = (evt) => {
    if (!isSheetOpen || touchStartY === 0) return;

    const touchEndTime = Date.now();
    const timeDelta = touchEndTime - touchStartTime;
    const velocity = currentY / timeDelta; // pixels per millisecond

    // Dismiss thresholds
    const DISTANCE_THRESHOLD = 150; // Dismiss if dragged more than 150px
    const VELOCITY_THRESHOLD = 0.5; // Dismiss if velocity > 0.5 px/ms (fast swipe)

    const shouldDismiss = currentY > DISTANCE_THRESHOLD || velocity > VELOCITY_THRESHOLD;

    if (shouldDismiss && isDragging) {
        // Dismiss the sheet with animation
        sheet.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
        sheet.style.transform = 'translateY(100%)';
        sheetBackdrop.style.transition = 'opacity 0.3s ease';
        sheetBackdrop.style.opacity = '0';

        // Trigger haptic feedback for dismiss
        triggerHapticFeedback('light');

        // Clean up after animation
        setTimeout(() => {
            closeStatSheet();
            resetSheetTransform();
        }, 300);
    } else {
        // Snap back to original position
        resetSheetTransform();
    }

    // Reset touch state
    touchStartY = 0;
    currentY = 0;
    isDragging = false;
};

/**
 * Reset sheet transform to original position
 */
const resetSheetTransform = () => {
    sheet.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
    sheet.style.transform = '';
    sheetBackdrop.style.transition = 'opacity 0.3s ease';
    sheetBackdrop.style.opacity = '';
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

    // Touch gesture support for swipe-to-dismiss
    sheet.addEventListener('touchstart', handleTouchStart, { passive: true });
    sheet.addEventListener('touchmove', handleTouchMove, { passive: false });
    sheet.addEventListener('touchend', handleTouchEnd, { passive: true });

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
