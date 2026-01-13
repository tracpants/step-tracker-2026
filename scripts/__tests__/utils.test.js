import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fmt, renderIcon, getResponsiveCellConfig, renderStatsCard } from '../utils.js';

describe('utils', () => {
  describe('fmt', () => {
    it('formats numbers with commas', () => {
      expect(fmt(1000)).toBe('1,000');
      expect(fmt(10000)).toBe('10,000');
      expect(fmt(1000000)).toBe('1,000,000');
    });

    it('handles small numbers without commas', () => {
      expect(fmt(0)).toBe('0');
      expect(fmt(42)).toBe('42');
      expect(fmt(999)).toBe('999');
    });

    it('handles negative numbers', () => {
      expect(fmt(-1000)).toBe('-1,000');
      expect(fmt(-10000)).toBe('-10,000');
    });
  });

  describe('renderIcon', () => {
    it('returns Lucide icon HTML', () => {
      expect(renderIcon('trophy')).toBe('<i data-lucide="trophy"></i>');
      expect(renderIcon('map-pin')).toBe('<i data-lucide="map-pin"></i>');
    });
  });

  describe('getResponsiveCellConfig', () => {
    let originalInnerWidth;

    beforeEach(() => {
      originalInnerWidth = window.innerWidth;
    });

    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: originalInnerWidth
      });
    });

    it('returns large cells for mobile (≤480px)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 400
      });
      expect(getResponsiveCellConfig()).toEqual({ width: 24, height: 24, gutter: 5 });
    });

    it('returns medium cells for tablets (≤768px)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 600
      });
      expect(getResponsiveCellConfig()).toEqual({ width: 20, height: 20, gutter: 4 });
    });

    it('returns standard cells for desktop (>768px)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024
      });
      expect(getResponsiveCellConfig()).toEqual({ width: 11, height: 11, gutter: 4 });
    });
  });

  describe('renderStatsCard', () => {
    it('renders simple text card', () => {
      const result = renderStatsCard({ simple: 'Test message' });
      expect(result).toContain('stats-card-simple');
      expect(result).toContain('Test message');
    });

    it('renders card with title', () => {
      const result = renderStatsCard({
        title: 'Total Steps',
        stats: []
      });
      expect(result).toContain('stats-card-header');
      expect(result).toContain('Total Steps');
    });

    it('renders card with title and icon', () => {
      const result = renderStatsCard({
        title: 'Total Steps',
        titleIcon: 'footprints',
        stats: []
      });
      expect(result).toContain('stats-card-header');
      expect(result).toContain('data-lucide="footprints"');
      expect(result).toContain('Total Steps');
    });

    it('renders stats rows', () => {
      const result = renderStatsCard({
        title: 'Daily Stats',
        stats: [
          { label: 'Steps', value: '10,000', icon: 'footprints' },
          { label: 'Distance', value: '8.0 km', icon: 'map-pin' }
        ]
      });
      expect(result).toContain('stats-card-body');
      expect(result).toContain('stats-card-row');
      expect(result).toContain('Steps');
      expect(result).toContain('10,000');
      expect(result).toContain('Distance');
      expect(result).toContain('8.0 km');
      expect(result).toContain('data-lucide="footprints"');
      expect(result).toContain('data-lucide="map-pin"');
    });

    it('renders footer when provided', () => {
      const result = renderStatsCard({
        title: 'Test',
        stats: [],
        footer: 'Additional info'
      });
      expect(result).toContain('stats-card-footer');
      expect(result).toContain('Additional info');
    });
  });
});
