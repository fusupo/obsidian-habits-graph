/**
 * Date utility functions for timezone-independent date handling.
 *
 * All dates are normalized to UTC to ensure consistent behavior across timezones.
 * This prevents date shifts for users in different timezones and eliminates DST issues.
 *
 * @module dateUtils
 */

/**
 * Parse an ISO date string (YYYY-MM-DD) as a UTC date.
 *
 * Unlike `new Date(dateStr)` which interprets the date in local timezone,
 * this function always creates a Date object representing midnight UTC.
 *
 * @param dateStr - ISO date string in YYYY-MM-DD format
 * @returns Date object set to midnight UTC on the specified date
 * @throws Error if the date string format is invalid
 *
 * @example
 * const date = parseISODate('2024-01-15');
 * // Returns: Date representing 2024-01-15 00:00:00 UTC
 */
export function parseISODate(dateStr: string): Date {
	const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) {
		throw new Error(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD`);
	}

	const [, year, month, day] = match;
	const date = new Date(Date.UTC(
		parseInt(year, 10),
		parseInt(month, 10) - 1, // Month is 0-indexed
		parseInt(day, 10)
	));

	// Validate the date is actually valid (e.g., not 2024-02-31)
	if (isNaN(date.getTime())) {
		throw new Error(`Invalid date: ${dateStr}`);
	}

	return date;
}

/**
 * Format a Date object as an ISO date string (YYYY-MM-DD) in UTC.
 *
 * Replaces the fragile `.toISOString().split('T')[0]` pattern with
 * a robust implementation that explicitly uses UTC components.
 *
 * @param date - Date object to format
 * @returns ISO date string in YYYY-MM-DD format
 *
 * @example
 * const date = new Date(Date.UTC(2024, 0, 15));
 * formatISODate(date); // Returns: '2024-01-15'
 */
export function formatISODate(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Get the current date as midnight UTC.
 *
 * This ensures "today" is consistent for all users regardless of timezone.
 * A user at 11pm PST will get the same "today" as a user at 2am EST.
 *
 * @returns Date object representing today at midnight UTC
 *
 * @example
 * const today = getTodayUTC();
 * // Returns: Date representing current calendar day at 00:00:00 UTC
 */
export function getTodayUTC(): Date {
	const now = new Date();
	return new Date(Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate()
	));
}

/**
 * Compare two dates to check if they represent the same calendar day in UTC.
 *
 * Replaces direct Date.getTime() comparisons with UTC-aware day comparison.
 *
 * @param date1 - First date to compare
 * @param date2 - Second date to compare
 * @returns true if both dates represent the same UTC calendar day
 *
 * @example
 * const date1 = parseISODate('2024-01-15');
 * const date2 = new Date(Date.UTC(2024, 0, 15, 12, 0, 0));
 * isSameDay(date1, date2); // Returns: true
 */
export function isSameDay(date1: Date, date2: Date): boolean {
	return date1.getUTCFullYear() === date2.getUTCFullYear() &&
		date1.getUTCMonth() === date2.getUTCMonth() &&
		date1.getUTCDate() === date2.getUTCDate();
}

/**
 * Add a number of days to a date, preserving UTC midnight.
 *
 * Creates a new Date object without mutating the input.
 *
 * @param date - Starting date
 * @param days - Number of days to add (can be negative)
 * @returns New Date object with days added
 *
 * @example
 * const date = parseISODate('2024-01-15');
 * const nextWeek = addDays(date, 7);
 * formatISODate(nextWeek); // Returns: '2024-01-22'
 */
export function addDays(date: Date, days: number): Date {
	const result = new Date(Date.UTC(
		date.getUTCFullYear(),
		date.getUTCMonth(),
		date.getUTCDate() + days
	));
	return result;
}
