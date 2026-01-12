/**
 * Desktop popover management module
 */

import { fmt, renderIcon } from './utils.js';

let currentSelectedStat = null;
let isPopoverOpen = false;

const popover = document.getElementById('stat-popover');

/**
 * Detect if the device should use desktop popover or mobile bottom sheet
 * @returns {boolean} True if should use desktop popover
 */
export const shouldUseDesktopPopover = () => {
    // Check for hover capability and screen width
    const hasHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const isWideScreen = window.innerWidth > 768;
    return hasHover && isWideScreen;
};

/**
 * Position a popover relative to a target element
 * @param {HTMLElement} popoverEl - The popover element
 * @param {HTMLElement} targetEl - The target element to position near
 */
export const positionPopover = (popoverEl, targetEl) => {
    if (!popoverEl || !targetEl) return;

    const offset = 12;
    const padding = 16;

    // Get element and popover dimensions
    const targetRect = targetEl.getBoundingClientRect();
    const popoverRect = popoverEl.getBoundingClientRect();
    const popoverWidth = popoverRect.width || 320; // fallback width
    const popoverHeight = popoverRect.height || 200; // fallback height

    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate center of target element
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    let top, left, caretPosition;

    // Try positioning to the right first (preferred for stat cards)
    if (targetRect.right + offset + popoverWidth + padding <= viewportWidth) {
        left = targetRect.right + offset;
        top = targetCenterY - popoverHeight / 2;
        caretPosition = 'caret-left';
    }
    // Try positioning to the left
    else if (targetRect.left - offset - popoverWidth >= padding) {
        left = targetRect.left - offset - popoverWidth;
        top = targetCenterY - popoverHeight / 2;
        caretPosition = 'caret-right';
    }
    // Try positioning above
    else if (targetRect.top - offset - popoverHeight >= padding) {
        top = targetRect.top - offset - popoverHeight;
        left = targetCenterX - popoverWidth / 2;
        caretPosition = 'caret-bottom';
    }
    // Position below
    else {
        top = targetRect.bottom + offset;
        left = targetCenterX - popoverWidth / 2;
        caretPosition = 'caret-top';
    }

    // Keep within viewport bounds
    if (left < padding) {
        left = padding;
    } else if (left + popoverWidth + padding > viewportWidth) {
        left = viewportWidth - popoverWidth - padding;
    }

    if (top < padding) {
        top = padding;
    } else if (top + popoverHeight + padding > viewportHeight) {
        top = viewportHeight - popoverHeight - padding;
    }

    // Remove previous caret classes
    popoverEl.classList.remove('caret-top', 'caret-bottom', 'caret-left', 'caret-right');
    popoverEl.classList.add(caretPosition);

    // Apply final position
    popoverEl.style.left = `${left}px`;
    popoverEl.style.top = `${top}px`;
};

/**
 * Open the desktop popover with stat data
 * @param {string} statType - Type of stat: 'total', 'average', 'streak', 'year'
 * @param {Object} data - Data object containing all necessary stat information
 * @param {HTMLElement} targetElement - The element that was clicked
 */
export const openStatPopover = (statType, data, targetElement) => {
    currentSelectedStat = statType;
    isPopoverOpen = true;

    // Populate the popover content
    populateStatPopover(statType, data);

    // Show the popover
    popover.style.display = 'block';
    popover.setAttribute('aria-hidden', 'false');

    // Position the popover after a brief moment to ensure dimensions are calculated
    requestAnimationFrame(() => {
        positionPopover(popover, targetElement);
        // Trigger animation
        requestAnimationFrame(() => {
            popover.classList.add('show');
        });
    });

    // Initialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }

    // Track popover opening
    if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({
            path: `stat-popover-opened-${statType}`,
            title: `Stat Popover Opened: ${statType}`,
            event: true
        });
    }
};

/**
 * Close the desktop popover
 */
export const closeStatPopover = () => {
    isPopoverOpen = false;
    popover.classList.remove('show');
    
    // Wait for animation to complete before hiding
    setTimeout(() => {
        if (!isPopoverOpen) {
            popover.style.display = 'none';
            popover.setAttribute('aria-hidden', 'true');
            currentSelectedStat = null;
        }
    }, 200);
};

/**
 * Populate the popover with content based on stat type
 * @param {string} statType - Type of stat
 * @param {Object} data - Data object
 */
const populateStatPopover = (statType, data) => {
    const titleEl = document.getElementById('stat-popover-title');
    const timeframeEl = document.getElementById('stat-popover-timeframe');
    const heroValueEl = document.getElementById('stat-popover-hero-value');
    const heroLabelEl = document.getElementById('stat-popover-hero-label');
    const detailsEl = document.getElementById('stat-popover-details-content');

    // Clear previous content
    detailsEl.innerHTML = '';

    switch (statType) {
        case 'total':
            titleEl.textContent = 'Total Steps';
            timeframeEl.textContent = 'Jan 2026';
            heroValueEl.textContent = fmt(data.total);
            heroLabelEl.textContent = 'steps';

            detailsEl.innerHTML = `
                <div class="stat-popover-detail-row">
                    <div class="stat-popover-detail-icon">${renderIcon('map-pin')}</div>
                    <div class="stat-popover-detail-label">Distance</div>
                    <div class="stat-popover-detail-value">${data.totalKm.toFixed(1)} km</div>
                </div>
                <div class="stat-popover-detail-row">
                    <div class="stat-popover-detail-icon">${renderIcon('calendar')}</div>
                    <div class="stat-popover-detail-label">Period</div>
                    <div class="stat-popover-detail-value">${data.periodStr}</div>
                </div>
                <div class="stat-popover-detail-row">
                    <div class="stat-popover-detail-icon">${renderIcon('trophy')}</div>
                    <div class="stat-popover-detail-label">Best day</div>
                    <div class="stat-popover-detail-value">${data.bestDayStr}</div>
                </div>
            `;
            break;

        case 'average':
            titleEl.textContent = 'Daily Average';
            timeframeEl.textContent = 'Jan 2026';
            heroValueEl.textContent = fmt(data.dailyAverage);
            heroLabelEl.textContent = 'steps/day';

            detailsEl.innerHTML = `
                <div class="stat-popover-detail-row">
                    <div class="stat-popover-detail-icon">${renderIcon('map-pin')}</div>
                    <div class="stat-popover-detail-label">Avg distance</div>
                    <div class="stat-popover-detail-value">${data.averageKm} km/day</div>
                </div>
                <div class="stat-popover-detail-row">
                    <div class="stat-popover-detail-icon">${renderIcon('calendar')}</div>
                    <div class="stat-popover-detail-label">Days included</div>
                    <div class="stat-popover-detail-value">${data.dayCount}</div>
                </div>
                <div class="stat-popover-detail-row">
                    <div class="stat-popover-detail-icon">${renderIcon('trophy')}</div>
                    <div class="stat-popover-detail-label">Best day</div>
                    <div class="stat-popover-detail-value">${data.bestDayStr}</div>
                </div>
            `;
            break;

        case 'streak':
            titleEl.textContent = '10k+ Streak';
            timeframeEl.textContent = 'Jan 2026';
            heroValueEl.textContent = data.streak;
            heroLabelEl.textContent = data.streak === 1 ? 'day' : 'days';

            detailsEl.innerHTML = `
                <div class="stat-popover-detail-row">
                    <div class="stat-popover-detail-icon">${renderIcon('calendar')}</div>
                    <div class="stat-popover-detail-label">Period</div>
                    <div class="stat-popover-detail-value">${data.streakPeriod}</div>
                </div>
                <div class="stat-popover-detail-row">
                    <div class="stat-popover-detail-icon">${renderIcon('activity')}</div>
                    <div class="stat-popover-detail-label">Status</div>
                    <div class="stat-popover-detail-value">${data.streakActive ? 'Active' : 'Broken'}</div>
                </div>
                <div class="stat-popover-detail-row">
                    <div class="stat-popover-detail-icon">${renderIcon('target')}</div>
                    <div class="stat-popover-detail-label">Target</div>
                    <div class="stat-popover-detail-value">10,000 steps</div>
                </div>
            `;
            break;

        case 'year':
            titleEl.textContent = 'Year Progress';
            timeframeEl.textContent = 'YTD';
            heroValueEl.textContent = `${data.goalPercentage}%`;
            heroLabelEl.textContent = 'of year';

            detailsEl.innerHTML = `
                <div class="stat-popover-detail-row">
                    <div class="stat-popover-detail-icon">${renderIcon('calendar')}</div>
                    <div class="stat-popover-detail-label">Days completed</div>
                    <div class="stat-popover-detail-value">${data.daysWithGoal} / ${data.dayOfYear}</div>
                </div>
                <div class="stat-popover-detail-row">
                    <div class="stat-popover-detail-icon">${renderIcon('percent')}</div>
                    <div class="stat-popover-detail-label">Adherence</div>
                    <div class="stat-popover-detail-value">${data.adherence}%</div>
                </div>
                <div class="stat-popover-detail-row">
                    <div class="stat-popover-detail-icon">${renderIcon('clock')}</div>
                    <div class="stat-popover-detail-label">Remaining</div>
                    <div class="stat-popover-detail-value">${365 - data.dayOfYear} days</div>
                </div>
            `;
            break;
    }
};

/**
 * Initialize popover event listeners
 */
export const initPopoverListeners = () => {
    // Click outside to close popover
    document.addEventListener('click', (evt) => {
        if (isPopoverOpen && !popover.contains(evt.target)) {
            // Check if the click was on a stat card - if so, don't close
            const statCard = evt.target.closest('.stats > div');
            if (!statCard) {
                closeStatPopover();
            }
        }
    });

    // ESC key to close popover
    document.addEventListener('keydown', (evt) => {
        if (evt.key === 'Escape' && isPopoverOpen) {
            closeStatPopover();
        }
    });

    // Handle window resize to reposition popover
    window.addEventListener('resize', () => {
        if (isPopoverOpen && currentSelectedStat) {
            // Find the currently selected stat card and reposition
            const statCards = document.querySelectorAll('.stats > div');
            const statIndex = ['total', 'average', 'streak', 'year'].indexOf(currentSelectedStat);
            if (statIndex >= 0 && statCards[statIndex]) {
                positionPopover(popover, statCards[statIndex]);
            }
        }
    });
};