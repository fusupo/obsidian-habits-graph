import { parseISODateOrNull, formatISODate } from '../utils/dateUtils';

describe('parseISODateOrNull', () => {
	it('parses a bare YYYY-MM-DD date', () => {
		const date = parseISODateOrNull('2025-01-15');
		expect(date).not.toBeNull();
		expect(formatISODate(date as Date)).toBe('2025-01-15');
	});

	it('accepts datetime strings, discarding the time portion', () => {
		const date = parseISODateOrNull('2025-01-15T09:00');
		expect(date).not.toBeNull();
		expect(formatISODate(date as Date)).toBe('2025-01-15');
	});

	it('returns null for undefined and empty string', () => {
		expect(parseISODateOrNull(undefined)).toBeNull();
		expect(parseISODateOrNull('')).toBeNull();
	});

	it('returns null for values with no leading ISO date', () => {
		expect(parseISODateOrNull('next tuesday')).toBeNull();
		expect(parseISODateOrNull('15-01-2025')).toBeNull();
		expect(parseISODateOrNull('someday')).toBeNull();
	});
});
