/**
 * Mobile bottom sheet management module
 */

import { fmt, renderIcon } from './utils.js';

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

    // Clear previous content
    detailsEl.innerHTML = '';

    switch (statType) {
        case 'total':
            titleEl.textContent = 'Total Steps';
            timeframeEl.textContent = 'Jan 2026';
            heroValueEl.textContent = fmt(data.total);
            heroLabelEl.textContent = 'steps';

            // Add detail rows
            detailsEl.innerHTML = `
                <div class="stat-sheet-detail-row">
                    <div class="stat-sheet-detail-icon">${renderIcon('map-pin')}</div>
                    <div class="stat-sheet-detail-label">Distance</div>
                    <div class="stat-sheet-detail-value">${data.totalKm.toFixed(1)} km</div>
                </div>
                <div class="stat-sheet-detail-row">
                    <div class="stat-sheet-detail-icon">${renderIcon('calendar')}</div>
                    <div class="stat-sheet-detail-label">Period</div>
                    <div class="stat-sheet-detail-value">${data.periodStr}</div>
                </div>
                <div class="stat-sheet-detail-row">
                    <div class="stat-sheet-detail-icon">${renderIcon('trophy')}</div>
                    <div class="stat-sheet-detail-label">Best day</div>
                    <div class="stat-sheet-detail-value">${data.bestDayStr}</div>
                </div>
            `;
            break;

        case 'average':
            titleEl.textContent = 'Daily Average';
            timeframeEl.textContent = 'Jan 2026';
            heroValueEl.textContent = fmt(data.dailyAverage);
            heroLabelEl.textContent = 'steps/day';

            detailsEl.innerHTML = `
                <div class="stat-sheet-detail-row">
                    <div class="stat-sheet-detail-icon">${renderIcon('map-pin')}</div>
                    <div class="stat-sheet-detail-label">Avg distance</div>
                    <div class="stat-sheet-detail-value">${data.averageKm} km/day</div>
                </div>
                <div class="stat-sheet-detail-row">
                    <div class="stat-sheet-detail-icon">${renderIcon('calendar')}</div>
                    <div class="stat-sheet-detail-label">Days included</div>
                    <div class="stat-sheet-detail-value">${data.dayCount}</div>
                </div>
                <div class="stat-sheet-detail-row">
                    <div class="stat-sheet-detail-icon">${renderIcon('trophy')}</div>
                    <div class="stat-sheet-detail-label">Best day</div>
                    <div class="stat-sheet-detail-value">${data.bestDayStr}</div>
                </div>
            `;
            break;

        case 'streak':
            titleEl.textContent = '10k+ Streak';
            timeframeEl.textContent = 'Jan 2026';
            heroValueEl.textContent = data.streak;
            heroLabelEl.textContent = data.streak === 1 ? 'day' : 'days';

            detailsEl.innerHTML = `
                <div class="stat-sheet-detail-row">
                    <div class="stat-sheet-detail-icon">${renderIcon('calendar')}</div>
                    <div class="stat-sheet-detail-label">Period</div>
                    <div class="stat-sheet-detail-value">${data.streakPeriod}</div>
                </div>
                <div class="stat-sheet-detail-row">
                    <div class="stat-sheet-detail-icon">${renderIcon('activity')}</div>
                    <div class="stat-sheet-detail-label">Status</div>
                    <div class="stat-sheet-detail-value">${data.streakActive ? 'Active' : 'Broken'}</div>
                </div>
                <div class="stat-sheet-detail-row">
                    <div class="stat-sheet-detail-icon">${renderIcon('target')}</div>
                    <div class="stat-sheet-detail-label">Target</div>
                    <div class="stat-sheet-detail-value">10,000 steps</div>
                </div>
            `;
            break;

        case 'year':
            titleEl.textContent = 'Year Progress';
            timeframeEl.textContent = 'YTD';
            heroValueEl.textContent = `${data.goalPercentage}%`;
            heroLabelEl.textContent = 'of year';

            detailsEl.innerHTML = `
                <div class="stat-sheet-detail-row">
                    <div class="stat-sheet-detail-icon">${renderIcon('calendar')}</div>
                    <div class="stat-sheet-detail-label">Days completed</div>
                    <div class="stat-sheet-detail-value">${data.daysWithGoal} / ${data.dayOfYear}</div>
                </div>
                <div class="stat-sheet-detail-row">
                    <div class="stat-sheet-detail-icon">${renderIcon('percent')}</div>
                    <div class="stat-sheet-detail-label">Adherence</div>
                    <div class="stat-sheet-detail-value">${data.adherence}%</div>
                </div>
                <div class="stat-sheet-detail-row">
                    <div class="stat-sheet-detail-icon">${renderIcon('clock')}</div>
                    <div class="stat-sheet-detail-label">Remaining</div>
                    <div class="stat-sheet-detail-value">${365 - data.dayOfYear} days</div>
                </div>
            `;
            break;
    }
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
};