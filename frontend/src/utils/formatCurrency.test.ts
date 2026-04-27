import { describe, expect, it } from 'vitest';
import { formatUsd } from './formatCurrency';

describe('formatUsd', () => {
  it('formats numbers', () => {
    expect(formatUsd(12.4)).toBe('$12.40');
    expect(formatUsd(0)).toBe('$0.00');
  });

  it('handles empty', () => {
    expect(formatUsd(null)).toBe('—');
    expect(formatUsd(undefined)).toBe('—');
    expect(formatUsd('')).toBe('—');
  });

  it('parses string numbers', () => {
    expect(formatUsd('99.5')).toBe('$99.50');
  });
});
