/**
 * Tests for statPanelContent module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generatePanelContent, renderPanelContent } from '../statPanelContent.js';

// Mock utils module
vi.mock('../utils.js', () => ({
    fmt: (num) => num.toLocaleString(),
    renderIcon: (icon) => `<i data-lucide="${icon}"></i>`
}));

describe('statPanelContent', () => {
    const mockTotalData = {
        total: 150000,
        totalKm: 112.5,
        kmToMiles: 69.9,
        estimatedCalories: 6000,
        periodStr: 'Jan 1–Jan 14, 2026',
        bestDayStr: 'Jan 10 (18,500)',
        worldLaps: '0.003',
        everestClimbs: '12.7',
        weeklyTotal: 45000
    };

    const mockAverageData = {
        dailyAverage: 10714,
        averageKm: '8.0',
        dailyCalories: 429,
        stepsPerMinute: 15,
        trend: 'improving',
        trendPercentage: 12,
        consistencyScore: 86,
        mostActiveDay: 'Sat',
        bestDayStr: 'Jan 10 (18,500)',
        dayCount: 14
    };

    const mockStreakData = {
        streak: 7,
        streakActive: true,
        streakPeriod: 'Jan 8 - Jan 14',
        longestStreak: 10,
        totalGoalDays: 12,
        consistencyScore: 86
    };

    const mockYearData = {
        goalPercentage: 86,
        daysWithGoal: 12,
        dayOfYear: 14,
        adherence: 86,
        daysAheadBehind: -2,
        projectedYearEnd: 3912500
    };

    describe('generatePanelContent', () => {
        describe('total stat type', () => {
            it('generates correct title and hero values', () => {
                const content = generatePanelContent('total', mockTotalData);
                
                expect(content.title).toBe('Total Steps');
                expect(content.timeframe).toBe('Jan 2026');
                expect(content.heroValue).toBe('150,000');
                expect(content.heroLabel).toBe('steps');
            });

            it('includes Activity Overview section with distance and calories', () => {
                const content = generatePanelContent('total', mockTotalData);
                const activitySection = content.sections.find(s => s.title === 'Activity Overview');
                
                expect(activitySection).toBeDefined();
                expect(activitySection.rows).toHaveLength(3);
                expect(activitySection.rows[0].label).toBe('Distance covered');
                expect(activitySection.rows[1].label).toBe('Estimated calories');
            });

            it('uses "For Perspective" section title for fun facts', () => {
                const content = generatePanelContent('total', mockTotalData);
                const funSection = content.sections.find(s => s.title === 'For Perspective');
                
                expect(funSection).toBeDefined();
                expect(funSection.rows.find(r => r.label === 'Earth circumference')).toBeDefined();
                expect(funSection.rows.find(r => r.label === 'Everest equivalent')).toBeDefined();
            });

            it('includes weekly progress bar when includeProgressBars is true', () => {
                const content = generatePanelContent('total', mockTotalData, { includeProgressBars: true });
                const weeklySection = content.sections.find(s => s.title === 'This Week');
                
                expect(weeklySection).toBeDefined();
                expect(weeklySection.progressBar).toBeDefined();
            });

            it('excludes weekly progress bar when includeProgressBars is false', () => {
                const content = generatePanelContent('total', mockTotalData, { includeProgressBars: false });
                const weeklySection = content.sections.find(s => s.title === 'This Week');
                
                expect(weeklySection).toBeUndefined();
            });
        });

        describe('average stat type', () => {
            it('generates correct title and hero values', () => {
                const content = generatePanelContent('average', mockAverageData);
                
                expect(content.title).toBe('Daily Average');
                expect(content.heroLabel).toBe('steps/day');
            });

            it('uses "Daily Metrics" section title', () => {
                const content = generatePanelContent('average', mockAverageData);
                const metricsSection = content.sections.find(s => s.title === 'Daily Metrics');
                
                expect(metricsSection).toBeDefined();
                expect(metricsSection.rows.find(r => r.label === 'Walking pace')).toBeDefined();
            });

            it('uses "10k+ consistency" label for consistency score', () => {
                const content = generatePanelContent('average', mockAverageData);
                const trendsSection = content.sections.find(s => s.title === 'Trends');
                
                expect(trendsSection.rows.find(r => r.label === '10k+ consistency')).toBeDefined();
            });

            it('includes trend highlighting with correct type', () => {
                const content = generatePanelContent('average', mockAverageData);
                const trendsSection = content.sections.find(s => s.title === 'Trends');
                const trendRow = trendsSection.rows.find(r => r.label === '7-day trend');
                
                expect(trendRow.highlight).toBe(true);
                expect(trendRow.highlightType).toBe('success');
            });
        });

        describe('streak stat type', () => {
            it('generates correct title and dynamic hero label', () => {
                const content = generatePanelContent('streak', mockStreakData);
                
                expect(content.title).toBe('10k+ Streak');
                expect(content.heroLabel).toBe('days');
            });

            it('uses singular "day" for streak of 1', () => {
                const content = generatePanelContent('streak', { ...mockStreakData, streak: 1 });
                expect(content.heroLabel).toBe('day');
            });

            it('shows "🔥 Active!" status when streak is active', () => {
                const content = generatePanelContent('streak', mockStreakData);
                const currentSection = content.sections.find(s => s.title === 'Current Streak');
                const statusRow = currentSection.rows.find(r => r.label === 'Status');
                
                expect(statusRow.value).toBe('🔥 Active!');
                expect(statusRow.highlightType).toBe('success');
            });

            it('shows "💤 Broken" status when streak is inactive', () => {
                const content = generatePanelContent('streak', { ...mockStreakData, streakActive: false });
                const currentSection = content.sections.find(s => s.title === 'Current Streak');
                const statusRow = currentSection.rows.find(r => r.label === 'Status');
                
                expect(statusRow.value).toBe('💤 Broken');
                expect(statusRow.highlightType).toBe('danger');
            });

            it('uses "Streak History" section title', () => {
                const content = generatePanelContent('streak', mockStreakData);
                const historySection = content.sections.find(s => s.title === 'Streak History');

                expect(historySection).toBeDefined();
            });
        });

        describe('year stat type', () => {
            it('generates correct title and hero values', () => {
                const content = generatePanelContent('year', mockYearData);
                
                expect(content.title).toBe('Year Progress');
                expect(content.timeframe).toBe('2026 YTD');
                expect(content.heroLabel).toBe('of year goal');
            });

            it('shows missed days with danger highlighting', () => {
                const content = generatePanelContent('year', mockYearData);
                const projectionsSection = content.sections.find(s => s.title === 'Projections');
                const scheduleRow = projectionsSection.rows.find(r => r.label === 'vs perfect streak');
                
                expect(scheduleRow.value).toBe('2 missed 10k+ days');
                expect(scheduleRow.highlightType).toBe('danger');
            });

            it('shows extra days with success highlighting', () => {
                const content = generatePanelContent('year', { ...mockYearData, daysAheadBehind: 3 });
                const projectionsSection = content.sections.find(s => s.title === 'Projections');
                const scheduleRow = projectionsSection.rows.find(r => r.label === 'vs perfect streak');
                
                expect(scheduleRow.value).toBe('3 extra 10k+ days');
                expect(scheduleRow.highlightType).toBe('success');
            });

            it('shows "Perfect!" message when on track', () => {
                const content = generatePanelContent('year', { ...mockYearData, daysAheadBehind: 0 });
                const projectionsSection = content.sections.find(s => s.title === 'Projections');
                const scheduleRow = projectionsSection.rows.find(r => r.label === 'vs perfect streak');
                
                expect(scheduleRow.value).toBe('Perfect! 10k+ every day');
            });
        });

        it('returns null for unknown stat type', () => {
            const content = generatePanelContent('unknown', {});
            expect(content).toBeNull();
        });
    });

    describe('renderPanelContent', () => {
        it('renders sections with correct class prefix', () => {
            const content = generatePanelContent('total', mockTotalData);
            const html = renderPanelContent(content, 'stat-sheet');
            
            expect(html).toContain('stat-sheet-section');
            expect(html).toContain('stat-sheet-section-title');
            expect(html).toContain('stat-sheet-detail-row');
        });

        it('renders highlight classes when row has highlight', () => {
            const content = generatePanelContent('average', mockAverageData);
            const html = renderPanelContent(content, 'stat-side-panel');
            
            expect(html).toContain('highlight success');
        });

        it('renders progress bar when section has progressBar', () => {
            const content = generatePanelContent('total', mockTotalData, { includeProgressBars: true });
            const html = renderPanelContent(content, 'stat-side-panel');
            
            expect(html).toContain('stat-side-panel-progress-bar');
            expect(html).toContain('stat-side-panel-progress-track');
            expect(html).toContain('stat-side-panel-progress-fill');
        });

        it('returns empty string for null content', () => {
            const html = renderPanelContent(null, 'stat-sheet');
            expect(html).toBe('');
        });
    });
});
