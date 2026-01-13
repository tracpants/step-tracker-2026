/**
 * Tooltip management module
 */

import { fmt, renderStatsCard } from './utils.js';

const tooltipEl = document.getElementById('step-tooltip');

const formatDate = (d) => d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
});


let currentTooltipTarget = null;

const positionTooltip = (targetElement) => {
    if (!targetElement) return;

    const offset = 10;
    const padding = 8;

    // Get element and tooltip dimensions
    const targetRect = targetElement.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const tooltipWidth = tooltipRect.width;
    const tooltipHeight = tooltipRect.height;

    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate center of target element
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    // Try to position above first (preferred)
    let top = targetRect.top - tooltipHeight - offset;
    let caretPosition = 'caret-bottom'; // caret points down when tooltip is above

    // If doesn't fit above, flip below
    if (top < padding) {
        top = targetRect.bottom + offset;
        caretPosition = 'caret-top'; // caret points up when tooltip is below
    }

    // Center horizontally on target
    let left = targetCenterX - tooltipWidth / 2;

    // Keep within viewport bounds horizontally
    if (left < padding) {
        left = padding;
    } else if (left + tooltipWidth + padding > viewportWidth) {
        left = viewportWidth - tooltipWidth - padding;
    }

    // Keep within viewport bounds vertically
    if (top + tooltipHeight + padding > viewportHeight) {
        top = viewportHeight - tooltipHeight - padding;
    }

    // Remove previous caret classes
    tooltipEl.classList.remove('caret-top', 'caret-bottom');
    tooltipEl.classList.add(caretPosition);

    // Apply final position
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
};

const showTooltip = (html, targetElement) => {
    currentTooltipTarget = targetElement;
    tooltipEl.innerHTML = html;
    tooltipEl.style.display = 'block';
    tooltipEl.setAttribute('aria-hidden', 'false');

    // Update position after a brief moment to ensure dimensions are calculated
    requestAnimationFrame(() => {
        positionTooltip(targetElement);
        // Trigger animation
        requestAnimationFrame(() => {
            tooltipEl.classList.add('show');
        });
    });

    // Initialize Lucide icons in the tooltip
    if (window.lucide) {
        lucide.createIcons();
    }
};

const hideTooltip = () => {
    tooltipEl.classList.remove('show');
    currentTooltipTarget = null;
    // Wait for animation to complete before hiding
    setTimeout(() => {
        if (!currentTooltipTarget) {
            tooltipEl.style.display = 'none';
            tooltipEl.setAttribute('aria-hidden', 'true');
        }
    }, 200);
};

/**
 * Setup tooltips for heatmap cells
 * @param {Array} chartData - Processed chart data
 * @param {Object} stats - Calculated statistics
 */
export const setupCellTooltips = (chartData, stats) => {
    const yearStart = new Date(2026, 0, 1);
    const yearEnd = new Date(2026, 11, 31);

    const cells = document.querySelectorAll('#cal-heatmap rect.ch-subdomain-bg');
    console.log('Found subdomain cells:', cells.length);

    // Pre-index data for O(1) lookup - store full entry with km
    const dataByDate = new Map(chartData.map(d => [d.date, { steps: d.value, km: d.km }]));

    cells.forEach((cell) => {
        // Cal-Heatmap binds a datum per cell (D3). Use that timestamp for correct date mapping.
        const d = (typeof d3 !== 'undefined') ? d3.select(cell).datum() : null;
        const cellDate = d?.t ? new Date(d.t) : null;
        if (!cellDate) return;
        cellDate.setHours(0,0,0,0);

        // Use local date (CONFIG.TIMEZONE) for matching steps_data.json keys.
        const dateStr = dayjs(cellDate)
            .tz(window.CONFIG?.TIMEZONE || dayjs.tz.guess())
            .format('YYYY-MM-DD');
        const isBeforeYear = cellDate < yearStart;
        const isAfterYear = cellDate > yearEnd;

        if (isBeforeYear || isAfterYear) {
            cell.style.fill = '#0d1117';
            cell.style.opacity = '1.0';
            // Keep a title as a fallback, but rely on custom tooltip for consistency
            cell.setAttribute('title', 'Outside year range');
            cell.style.pointerEvents = 'none';
            return;
        }

        // Check if date is in the future - disable tooltips for future dates
        const todayDate = new Date();
        todayDate.setHours(0,0,0,0);
        const isFutureDate = cellDate > todayDate;

        const dayData = dataByDate.get(dateStr) ?? { steps: 0, km: 0 };
        const steps = dayData.steps;
        const km = dayData.km;
        const isMaxDay = dateStr === stats.maxStepDate;

        // Build tooltip using StatsCard component
        const statsArray = [];

        // Add steps stat
        statsArray.push({
            icon: 'footprints',
            label: 'Steps',
            value: steps ? fmt(steps) : 'No steps'
        });

        // Add distance stat if available
        if (km > 0) {
            statsArray.push({
                icon: 'map-pin',
                label: 'Distance',
                value: `${km} km`
            });
        }

        // Add personal best badge for max day
        if (isMaxDay) {
            statsArray.push({
                icon: 'trophy',
                label: 'Personal Best',
                value: ''
            });
        }

        const tooltipHtml = renderStatsCard({
            title: formatDate(cellDate),
            titleIcon: null,
            stats: statsArray
        });

        // Highlight max step day with a gold outline (SVG-friendly)
        if (isMaxDay) {
            cell.classList.add('is-max-day');
            // Set explicitly too (helps if styles get overridden by library updates)
            cell.setAttribute('stroke', '#ffd700');
            cell.setAttribute('stroke-width', '2');
            cell.setAttribute('paint-order', 'stroke');
            // Avoid glow/shadows here because SVG may clip filters at the cell bounds

            // Add confetti celebration on click
            cell.style.cursor = 'pointer';
            cell.addEventListener('click', (evt) => {
                const rect = cell.getBoundingClientRect();
                const x = (rect.left + rect.width / 2) / window.innerWidth;
                const y = (rect.top + rect.height / 2) / window.innerHeight;

                // Track personal best interaction
                if (window.goatcounter && window.goatcounter.count) {
                    window.goatcounter.count({
                        path: 'personal-best-clicked',
                        title: `Personal Best Day Clicked: ${steps} steps on ${formatDate(cellDate)}`,
                        event: true
                    });
                }

                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { x, y },
                    colors: ['#ffd700', '#ffed4e', '#ffaa00', '#ff8800'],
                    ticks: 200,
                    gravity: 1.2,
                    scalar: 1.2
                });
            });
        }

        // Skip tooltips for future dates
        if (isFutureDate) {
            return;
        }

        // Fallback title (some environments still show this) - use plain text
        const plainTextTitle = `${isMaxDay ? 'Personal Best! ' : ''}${steps ? fmt(steps) : 'No'} steps${km > 0 ? ` (${km} km)` : ''} on ${formatDate(cellDate)}`;
        cell.setAttribute('title', plainTextTitle);

        // Custom tooltip handlers - use target element for positioning
        cell.addEventListener('mouseenter', () => showTooltip(tooltipHtml, cell));
        cell.addEventListener('mouseleave', hideTooltip);
        // Support touch devices
        cell.addEventListener('touchstart', (evt) => {
            evt.preventDefault();
            showTooltip(tooltipHtml, cell);
        });
    });

    // If you leave the SVG entirely, hide tooltip
    const svg = document.querySelector('#cal-heatmap svg');
    if (svg) svg.addEventListener('mouseleave', hideTooltip);

    // Tap outside to dismiss
    document.addEventListener('click', (evt) => {
        if (currentTooltipTarget && !tooltipEl.contains(evt.target) && !currentTooltipTarget.contains(evt.target)) {
            hideTooltip();
        }
    });
};

/**
 * Setup tooltips for month labels
 * @param {Object} monthlyTotals - Monthly statistics
 */
export const setupMonthTooltips = (monthlyTotals) => {
    const monthLabels = document.querySelectorAll('#cal-heatmap .ch-domain-text');
    console.log('Found month labels:', monthLabels.length);

    monthLabels.forEach((label, index) => {
        // Calculate which month this label represents (0-indexed, starting from January 2026)
        const monthIndex = index; // 0 = Jan, 1 = Feb, etc.
        const year = 2026;
        const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`; // Format: YYYY-MM

        // Check if this month has data
        const monthData = monthlyTotals[monthKey];

        if (monthData && monthData.steps > 0) {
            // This month has steps data, add tooltip
            const monthName = new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

            // Build stats array for the month
            const monthStats = [
                {
                    icon: 'footprints',
                    label: 'Total Steps',
                    value: fmt(monthData.steps)
                },
                {
                    icon: 'map-pin',
                    label: 'Total Distance',
                    value: `${monthData.km.toFixed(1)} km`
                }
            ];

            // Add day with most steps if available
            if (monthData.maxDay && monthData.maxSteps > 0) {
                const maxDayDate = new Date(monthData.maxDay + 'T00:00:00');
                const maxDayFormatted = maxDayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                monthStats.push({
                    icon: 'trophy',
                    label: 'Best Day',
                    value: `${maxDayFormatted} (${fmt(monthData.maxSteps)} steps)`
                });
            }

            const monthTooltipHtml = renderStatsCard({
                title: monthName,
                titleIcon: 'calendar',
                stats: monthStats
            });

            label.addEventListener('mouseenter', () => {
                // Track month tooltip interaction
                if (window.goatcounter && window.goatcounter.count) {
                    window.goatcounter.count({
                        path: 'month-tooltip-viewed',
                        title: `Month Tooltip Viewed: ${monthName}`,
                        event: true
                    });
                }
                showTooltip(monthTooltipHtml, label);
            });
            label.addEventListener('mouseleave', hideTooltip);
            label.addEventListener('click', () => showTooltip(monthTooltipHtml, label));
            label.style.cursor = 'help';
        }
    });
};

