/**
 * Shared content generation for stat panels (desktop side panel & mobile bottom sheet)
 * Single source of truth for all stat panel content to ensure consistency
 */

import { fmt, renderIcon } from './utils.js';

/**
 * Generate content configuration for a stat panel
 * @param {string} statType - Type of stat: 'total', 'average', 'streak', 'year'
 * @param {Object} data - Data object containing all stat information
 * @param {Object} options - Display options
 * @param {boolean} options.includeProgressBars - Whether to include progress bar sections
 * @param {boolean} options.includeAchievementCards - Whether to use card-style achievements
 * @returns {Object} Panel content configuration
 */
export const generatePanelContent = (statType, data, options = {}) => {
    const { includeProgressBars = true, includeAchievementCards = true } = options;

    switch (statType) {
        case 'total':
            return generateTotalContent(data, { includeProgressBars, includeAchievementCards });
        case 'average':
            return generateAverageContent(data);
        case 'streak':
            return generateStreakContent(data, { includeAchievementCards });
        case 'year':
            return generateYearContent(data, { includeProgressBars, includeAchievementCards });
        default:
            return null;
    }
};

/**
 * Generate Total Steps panel content
 */
const generateTotalContent = (data, options) => {
    const sections = [
        {
            title: 'Activity Overview',
            icon: 'activity',
            rows: [
                {
                    icon: 'map-pin',
                    label: 'Distance covered',
                    value: `${data.totalKm.toFixed(1)} km (${data.kmToMiles.toFixed(1)} mi)`
                },
                {
                    icon: 'flame',
                    label: 'Estimated calories',
                    value: `${fmt(data.estimatedCalories)} cal`
                },
                {
                    icon: 'calendar',
                    label: 'Tracking period',
                    value: data.periodStr
                }
            ]
        },
        {
            title: 'Records',
            icon: 'trophy',
            rows: [
                {
                    icon: 'crown',
                    label: 'Best day',
                    value: data.bestDayStr
                },
                {
                    icon: data.achievementBadge,
                    isEmoji: true,
                    label: 'Achievement',
                    value: data.achievementLevel
                }
            ]
        },
        {
            title: 'For Perspective',
            icon: 'zap',
            rows: [
                {
                    icon: 'globe',
                    label: 'Earth circumference',
                    value: `${data.worldLaps} laps`
                },
                {
                    icon: 'mountain',
                    label: 'Everest equivalent',
                    value: `${data.everestClimbs}× the height`
                }
            ]
        }
    ];

    // Add weekly progress bar for desktop
    if (options.includeProgressBars) {
        sections.push({
            title: 'This Week',
            icon: 'trending-up',
            progressBar: {
                label: 'Weekly step progress',
                current: data.weeklyTotal || 0,
                target: 70000,
                format: (current, target) => `${fmt(current)} / ${fmt(target)}`
            }
        });
    }

    return {
        title: 'Total Steps',
        timeframe: 'Jan 2026',
        heroValue: fmt(data.total),
        heroLabel: 'steps',
        sections
    };
};

/**
 * Generate Daily Average panel content
 */
const generateAverageContent = (data) => {
    const trendIcon = data.trend === 'improving' ? 'trending-up' :
        data.trend === 'declining' ? 'trending-down' : 'minus';
    const trendColor = data.trend === 'improving' ? '#28a745' :
        data.trend === 'declining' ? '#dc3545' : '#6c757d';

    const trendValueText = data.trendPercentage !== 0
        ? `${data.trend} (${data.trendPercentage > 0 ? '+' : ''}${data.trendPercentage}%)`
        : data.trend;

    return {
        title: 'Daily Average',
        timeframe: 'Jan 2026',
        heroValue: fmt(data.dailyAverage),
        heroLabel: 'steps/day',
        sections: [
            {
                title: 'Daily Metrics',
                icon: 'bar-chart-3',
                rows: [
                    {
                        icon: 'map-pin',
                        label: 'Avg distance',
                        value: `${data.averageKm} km/day`
                    },
                    {
                        icon: 'flame',
                        label: 'Avg calories',
                        value: `${data.dailyCalories} cal/day`
                    },
                    {
                        icon: 'clock',
                        label: 'Walking pace',
                        value: `~${data.stepsPerMinute} steps/min`
                    }
                ]
            },
            {
                title: 'Trends',
                icon: 'trending-up',
                rows: [
                    {
                        icon: trendIcon,
                        label: '7-day trend',
                        value: trendValueText,
                        highlight: true,
                        highlightType: data.trend === 'improving' ? 'success' : data.trend === 'declining' ? 'danger' : null,
                        color: trendColor
                    },
                    {
                        icon: 'target',
                        label: '10k+ consistency',
                        value: `${data.consistencyScore}% of days`
                    },
                    {
                        icon: 'calendar-days',
                        label: 'Most active day',
                        value: data.mostActiveDay
                    }
                ]
            },
            {
                title: 'Records',
                icon: 'trophy',
                rows: [
                    {
                        icon: 'crown',
                        label: 'Best single day',
                        value: data.bestDayStr
                    },
                    {
                        icon: 'calendar',
                        label: 'Days tracked',
                        value: `${data.dayCount} days`
                    }
                ]
            }
        ]
    };
};

/**
 * Generate Streak panel content
 */
const generateStreakContent = (data, options) => {
    const sections = [
        {
            title: 'Current Streak',
            icon: 'flame',
            rows: [
                {
                    icon: 'activity',
                    label: 'Status',
                    value: data.streakActive ? '🔥 Active!' : '💤 Broken',
                    highlight: true,
                    highlightType: data.streakActive ? 'success' : 'danger'
                },
                {
                    icon: 'calendar',
                    label: 'Streak period',
                    value: data.streakPeriod
                },
                {
                    icon: 'target',
                    label: 'Daily target',
                    value: '10,000 steps'
                }
            ]
        },
        {
            title: 'Streak History',
            icon: 'trophy',
            rows: [
                {
                    icon: 'crown',
                    label: 'Longest streak',
                    value: `${data.longestStreak} days`
                },
                {
                    icon: 'calendar-check',
                    label: 'Total 10k+ days',
                    value: `${data.totalGoalDays} days`
                },
                {
                    icon: 'percent',
                    label: 'Success rate',
                    value: `${data.consistencyScore}%`
                }
            ]
        }
    ];

    // Add achievement section
    if (options.includeAchievementCards) {
        sections.push({
            title: 'Achievement',
            icon: 'star',
            achievementCard: {
                badge: data.achievementBadge,
                level: data.achievementLevel
            }
        });
    } else {
        sections.push({
            title: 'Achievement',
            icon: 'star',
            rows: [
                {
                    icon: data.achievementBadge,
                    isEmoji: true,
                    label: 'Level',
                    value: data.achievementLevel
                }
            ]
        });
    }

    return {
        title: '10k+ Streak',
        timeframe: 'Jan 2026',
        heroValue: data.streak,
        heroLabel: data.streak === 1 ? 'day' : 'days',
        sections
    };
};

/**
 * Generate Year Progress panel content
 */
const generateYearContent = (data, options) => {
    const scheduleIcon = data.daysAheadBehind >= 0 ? 'trending-up' : 'trending-down';
    const scheduleColor = data.daysAheadBehind >= 0 ? '#28a745' : '#dc3545';

    let scheduleText;
    if (data.daysAheadBehind > 0) {
        scheduleText = `${data.daysAheadBehind} extra 10k+ days`;
    } else if (data.daysAheadBehind < 0) {
        scheduleText = `${Math.abs(data.daysAheadBehind)} missed 10k+ days`;
    } else {
        scheduleText = 'Perfect! 10k+ every day';
    }

    const sections = [
        {
            title: 'Progress',
            icon: 'calendar',
            rows: [
                {
                    icon: 'check-circle',
                    label: '10k+ days completed',
                    value: `${data.daysWithGoal} / ${data.dayOfYear}`
                },
                {
                    icon: 'percent',
                    label: 'Goal adherence',
                    value: `${data.adherence}%`
                },
                {
                    icon: 'clock',
                    label: 'Days remaining in year',
                    value: `${365 - data.dayOfYear} days`
                }
            ]
        },
        {
            title: 'Projections',
            icon: 'target',
            rows: [
                {
                    icon: scheduleIcon,
                    label: 'vs perfect streak',
                    value: scheduleText,
                    highlight: true,
                    highlightType: data.daysAheadBehind >= 0 ? 'success' : 'danger',
                    color: scheduleColor
                },
                {
                    icon: 'trending-up',
                    label: 'Projected year total',
                    value: `${fmt(data.projectedYearEnd)} steps`
                }
            ]
        }
    ];

    // Add achievement section
    if (options.includeAchievementCards) {
        sections.push({
            title: 'Achievement',
            icon: 'star',
            achievementCard: {
                badge: data.achievementBadge,
                level: data.achievementLevel
            }
        });
    } else {
        sections.push({
            title: 'Achievement',
            icon: 'star',
            rows: [
                {
                    icon: data.achievementBadge,
                    isEmoji: true,
                    label: 'Level',
                    value: data.achievementLevel
                }
            ]
        });
    }

    // Add year progress bar for desktop
    if (options.includeProgressBars) {
        sections.push({
            title: 'Year at a Glance',
            icon: 'bar-chart-3',
            progressBar: {
                label: '10k+ days this year',
                current: data.daysWithGoal,
                target: 365,
                format: (current, target) => `${current} / ${target} days`
            }
        });
    }

    return {
        title: 'Year Progress',
        timeframe: '2026 YTD',
        heroValue: `${data.goalPercentage}%`,
        heroLabel: 'of year goal',
        sections
    };
};

/**
 * Render panel content to HTML string
 * @param {Object} content - Content configuration from generatePanelContent
 * @param {string} classPrefix - CSS class prefix ('stat-sheet' or 'stat-side-panel')
 * @returns {string} HTML string for the details section
 */
export const renderPanelContent = (content, classPrefix) => {
    if (!content || !content.sections) return '';

    return content.sections.map(section => {
        let sectionHtml = `
            <div class="${classPrefix}-section">
                <div class="${classPrefix}-section-title">
                    ${renderIcon(section.icon)} ${section.title}
                </div>`;

        // Render rows
        if (section.rows) {
            sectionHtml += section.rows.map(row => {
                const highlightClass = row.highlight
                    ? ` highlight${row.highlightType ? ' ' + row.highlightType : ''}`
                    : '';
                const colorStyle = row.color ? ` style="color: ${row.color}"` : '';
                const iconHtml = row.isEmoji ? row.icon : renderIcon(row.icon);

                return `
                    <div class="${classPrefix}-detail-row${highlightClass}">
                        <div class="${classPrefix}-detail-icon"${row.color ? colorStyle : ''}>${iconHtml}</div>
                        <div class="${classPrefix}-detail-label">${row.label}</div>
                        <div class="${classPrefix}-detail-value"${colorStyle}>${row.value}</div>
                    </div>`;
            }).join('');
        }

        // Render progress bar
        if (section.progressBar) {
            const pb = section.progressBar;
            const percentage = Math.min((pb.current / pb.target) * 100, 100);
            sectionHtml += `
                <div class="${classPrefix}-progress-bar">
                    <div class="${classPrefix}-progress-label">${pb.label}</div>
                    <div class="${classPrefix}-progress-track">
                        <div class="${classPrefix}-progress-fill" style="width: ${percentage}%"></div>
                    </div>
                    <div class="${classPrefix}-progress-text">${pb.format(pb.current, pb.target)}</div>
                </div>`;
        }

        // Render achievement card
        if (section.achievementCard) {
            const ac = section.achievementCard;
            sectionHtml += `
                <div class="${classPrefix}-achievement-card">
                    <div class="${classPrefix}-achievement-badge">${ac.badge}</div>
                    <div class="${classPrefix}-achievement-level">${ac.level}</div>
                </div>`;
        }

        sectionHtml += '</div>';
        return sectionHtml;
    }).join('');
};
