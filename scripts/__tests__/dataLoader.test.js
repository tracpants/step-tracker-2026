import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadStepData, processChartData } from '../dataLoader.js';

// Mock dayjs globally
global.dayjs = vi.fn(() => ({
  tz: vi.fn(() => ({
    format: vi.fn(() => '2026-01-11'),
    year: vi.fn(() => 2026)
  }))
}));
global.dayjs.extend = vi.fn();

describe('dataLoader', () => {
  describe('loadStepData', () => {
    let originalFetch;
    let originalConfig;

    beforeEach(() => {
      originalFetch = global.fetch;
      originalConfig = global.window?.CONFIG;
      global.window = { CONFIG: {} };
    });

    afterEach(() => {
      global.fetch = originalFetch;
      if (originalConfig) {
        global.window.CONFIG = originalConfig;
      }
      vi.clearAllMocks();
    });

    it('loads data from local source when no R2 URL configured', async () => {
      const mockData = {
        data: { '2026-01-01': { steps: 10000, km: 8.0 } },
        metadata: { lastUpdated: '2026-01-11T10:00:00Z' }
      };

      global.fetch = vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve(mockData)
        })
      );

      const result = await loadStepData();

      expect(result.data).toEqual(mockData.data);
      expect(result.lastUpdated).toBeInstanceOf(Date);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('./steps_data.json?t=')
      );
    });

    it('loads data from R2 URL when configured', async () => {
      global.window.CONFIG = {
        R2_DATA_URL: 'https://example.com/steps_data.json'
      };

      const mockData = {
        data: { '2026-01-01': { steps: 10000, km: 8.0 } },
        metadata: { lastUpdated: '2026-01-11T10:00:00Z' }
      };

      global.fetch = vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve(mockData)
        })
      );

      const result = await loadStepData();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://example.com/steps_data.json?t=')
      );
      expect(result.data).toEqual(mockData.data);
    });

    it('falls back to local source when R2 fails', async () => {
      global.window.CONFIG = {
        R2_DATA_URL: 'https://example.com/steps_data.json'
      };

      const localData = {
        data: { '2026-01-01': { steps: 5000, km: 4.0 } },
        metadata: { lastUpdated: '2026-01-11T09:00:00Z' }
      };

      global.fetch = vi.fn()
        // First call to R2 fails
        .mockImplementationOnce(() => Promise.reject(new Error('Network error')))
        // Second call to local succeeds
        .mockImplementationOnce(() =>
          Promise.resolve({
            json: () => Promise.resolve(localData)
          })
        );

      const result = await loadStepData();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.data).toEqual(localData.data);
    });

    it('handles legacy data format without metadata', async () => {
      const legacyData = {
        '2026-01-01': 10000,
        '2026-01-02': 12000
      };

      global.fetch = vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve(legacyData)
        })
      );

      const result = await loadStepData();

      expect(result.data).toEqual(legacyData);
      expect(result.lastUpdated).toBeNull();
    });

    it('handles new data format with metadata', async () => {
      const newData = {
        data: {
          '2026-01-01': { steps: 10000, km: 8.0 }
        },
        metadata: {
          lastUpdated: '2026-01-11T10:00:00Z'
        }
      };

      global.fetch = vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve(newData)
        })
      );

      const result = await loadStepData();

      expect(result.data).toEqual(newData.data);
      expect(result.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('processChartData', () => {
    beforeEach(() => {
      global.window = { CONFIG: { TIMEZONE: 'Australia/Sydney' } };
    });

    it('converts object data to chart format', () => {
      const data = {
        '2026-01-01': { steps: 10000, km: 8.0 },
        '2026-01-02': { steps: 12000, km: 9.6 }
      };

      const result = processChartData(data);

      expect(result).toContainEqual({
        date: '2026-01-01',
        value: 10000,
        km: 8.0
      });
      expect(result).toContainEqual({
        date: '2026-01-02',
        value: 12000,
        km: 9.6
      });
    });

    it('handles legacy number format', () => {
      const data = {
        '2026-01-01': 10000,
        '2026-01-02': 12000
      };

      const result = processChartData(data);

      expect(result).toContainEqual({
        date: '2026-01-01',
        value: 10000,
        km: 0
      });
      expect(result).toContainEqual({
        date: '2026-01-02',
        value: 12000,
        km: 0
      });
    });

    it('adds current day with zero steps if not in data', () => {
      const data = {
        '2026-01-01': { steps: 10000, km: 8.0 }
      };

      const result = processChartData(data);

      // Should include today (mocked as 2026-01-11)
      const todayEntry = result.find(entry => entry.date === '2026-01-11');
      expect(todayEntry).toBeDefined();
      expect(todayEntry.value).toBe(0);
      expect(todayEntry.km).toBe(0);
    });

    it('does not duplicate today if already in data', () => {
      const data = {
        '2026-01-11': { steps: 5000, km: 4.0 }
      };

      const result = processChartData(data);

      const todayEntries = result.filter(entry => entry.date === '2026-01-11');
      expect(todayEntries).toHaveLength(1);
      expect(todayEntries[0].value).toBe(5000);
    });
  });
});
