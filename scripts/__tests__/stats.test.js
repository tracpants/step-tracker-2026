import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculateStats, formatLastUpdated } from '../stats.js';

describe('stats', () => {
  describe('calculateStats', () => {
    let mockData;
    let mockChartData;

    beforeEach(() => {
      // Mock data for a week in 2026
      mockData = {
        '2026-01-01': { steps: 12000, km: 9.6 },
        '2026-01-02': { steps: 15000, km: 12.0 },
        '2026-01-03': { steps: 8000, km: 6.4 },
        '2026-01-04': { steps: 10500, km: 8.4 },
        '2026-01-05': { steps: 11000, km: 8.8 }
      };

      mockChartData = [
        { date: '2026-01-01', value: 12000, km: 9.6 },
        { date: '2026-01-02', value: 15000, km: 12.0 },
        { date: '2026-01-03', value: 8000, km: 6.4 },
        { date: '2026-01-04', value: 10500, km: 8.4 },
        { date: '2026-01-05', value: 11000, km: 8.8 }
      ];
    });

    it('calculates total steps correctly', () => {
      const stats = calculateStats(mockData, mockChartData);
      expect(stats.total).toBe(56500);
    });

    it('calculates total km correctly', () => {
      const stats = calculateStats(mockData, mockChartData);
      expect(stats.totalKm).toBe(45.2);
    });

    it('calculates daily average correctly', () => {
      const stats = calculateStats(mockData, mockChartData);
      expect(stats.dailyAverage).toBe(11300); // 56500 / 5 = 11300
    });

    it('calculates average km correctly', () => {
      const stats = calculateStats(mockData, mockChartData);
      expect(stats.averageKm).toBe('9.0'); // 45.2 / 5 = 9.04 rounded to 9.0
    });

    it('identifies max step day', () => {
      const stats = calculateStats(mockData, mockChartData);
      expect(stats.maxStepDate).toBe('2026-01-02');
      expect(stats.maxSteps).toBe(15000);
    });

    it('counts days with 10k+ steps', () => {
      const stats = calculateStats(mockData, mockChartData);
      expect(stats.daysWithGoal).toBe(4); // Jan 1, 2, 4, 5
    });

    it('calculates monthly totals', () => {
      const stats = calculateStats(mockData, mockChartData);
      expect(stats.monthlyTotals['2026-01']).toBeDefined();
      expect(stats.monthlyTotals['2026-01'].steps).toBe(56500);
      expect(stats.monthlyTotals['2026-01'].km).toBe(45.2);
      expect(stats.monthlyTotals['2026-01'].maxDay).toBe('2026-01-02');
      expect(stats.monthlyTotals['2026-01'].maxSteps).toBe(15000);
    });

    it('handles empty data', () => {
      const stats = calculateStats({}, []);
      expect(stats.total).toBe(0);
      expect(stats.totalKm).toBe(0);
      expect(stats.dailyAverage).toBe(0);
      expect(stats.averageKm).toBe(0); // Returns number 0 when no data
      expect(stats.streak).toBe(0);
      expect(stats.daysWithGoal).toBe(0);
    });

    it('handles legacy data format (numbers instead of objects)', () => {
      const legacyData = {
        '2026-01-01': 12000,
        '2026-01-02': 15000
      };
      const legacyChartData = [
        { date: '2026-01-01', value: 12000, km: 0 },
        { date: '2026-01-02', value: 15000, km: 0 }
      ];

      const stats = calculateStats(legacyData, legacyChartData);
      expect(stats.total).toBe(27000);
      expect(stats.totalKm).toBe(0);
    });
  });

  describe('formatLastUpdated', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-11T12:00:00Z'));
    });

    it('returns "just now" for updates within a minute', () => {
      const lastUpdated = new Date('2026-01-11T11:59:30Z');
      expect(formatLastUpdated(lastUpdated)).toBe('just now');
    });

    it('returns minutes for updates within an hour', () => {
      const lastUpdated = new Date('2026-01-11T11:45:00Z');
      expect(formatLastUpdated(lastUpdated)).toBe('15 minutes ago');
    });

    it('returns singular "minute" for 1 minute', () => {
      const lastUpdated = new Date('2026-01-11T11:59:00Z');
      expect(formatLastUpdated(lastUpdated)).toBe('1 minute ago');
    });

    it('returns hours for updates within a day', () => {
      const lastUpdated = new Date('2026-01-11T09:00:00Z');
      expect(formatLastUpdated(lastUpdated)).toBe('3 hours ago');
    });

    it('returns singular "hour" for 1 hour', () => {
      const lastUpdated = new Date('2026-01-11T11:00:00Z');
      expect(formatLastUpdated(lastUpdated)).toBe('1 hour ago');
    });

    it('returns "yesterday" for updates 1 day ago', () => {
      const lastUpdated = new Date('2026-01-10T10:00:00Z');
      expect(formatLastUpdated(lastUpdated)).toBe('yesterday');
    });

    it('returns days for updates more than 1 day ago', () => {
      const lastUpdated = new Date('2026-01-08T12:00:00Z');
      expect(formatLastUpdated(lastUpdated)).toBe('3 days ago');
    });

    it('returns null for null input', () => {
      expect(formatLastUpdated(null)).toBeNull();
    });
  });
});
