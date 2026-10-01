import { describeOutcome, diffInstances } from '../utils/instanceDiff';

describe('diffInstances', () => {
	it('reports added and removed dates per list, sorted', () => {
		const diff = diffInstances(
			{ complete_instances: ['2026-09-17', '2026-09-28'], skipped_instances: ['2026-09-14'] },
			{ complete_instances: ['2026-10-01', '2026-09-17', '2026-09-30'], skipped_instances: ['2026-09-14', '2026-09-28'] }
		);
		expect(diff).toEqual({
			complete: { added: ['2026-09-30', '2026-10-01'], removed: ['2026-09-28'] },
			skipped: { added: ['2026-09-28'], removed: [] },
		});
	});

	it('treats lists as sets and tolerates missing or odd values', () => {
		const diff = diffInstances(
			{ complete_instances: ['2026-09-30', '2026-09-30'], skipped_instances: 'nope' },
			{ complete_instances: ['2026-09-30'], skipped_instances: undefined }
		);
		expect(diff).toEqual({ complete: { added: [], removed: [] }, skipped: { added: [], removed: [] } });
	});
});

describe('describeOutcome — the notice names what was really written', () => {
	const none = { added: [] as string[], removed: [] as string[] };

	it('a done click on the clicked day keeps the familiar notice', () => {
		const outcome = describeOutcome('2026-10-01', { complete: { added: ['2026-10-01'], removed: [] }, skipped: none });
		expect(outcome).toEqual({
			matchedClick: true,
			changes: [{ date: '2026-10-01', status: 'done' }],
			message: 'Marked 2026-10-01 done',
		});
	});

	it('done → skipped and skipped → blank', () => {
		expect(describeOutcome('2026-10-01', {
			complete: { added: [], removed: ['2026-10-01'] },
			skipped: { added: ['2026-10-01'], removed: [] },
		}).message).toBe('Marked 2026-10-01 skipped');
		expect(describeOutcome('2026-10-01', { complete: none, skipped: { added: [], removed: ['2026-10-01'] } }).message)
			.toBe('Marked 2026-10-01 cleared');
	});

	it('names the day TaskNotes moved the click to (the #58 bug)', () => {
		const outcome = describeOutcome('2026-10-01', { complete: { added: ['2026-09-30'], removed: [] }, skipped: none });
		expect(outcome.matchedClick).toBe(false);
		expect(outcome.message).toBe('Clicked 2026-10-01, but TaskNotes marked 2026-09-30 done instead. Click 2026-09-30 to change it.');
	});

	it('names a moved skip or clear', () => {
		expect(describeOutcome('2026-10-01', { complete: none, skipped: { added: ['2026-09-28'], removed: [] } }).message)
			.toBe('Clicked 2026-10-01, but TaskNotes marked 2026-09-28 skipped instead. Click 2026-09-28 to change it.');
		expect(describeOutcome('2026-10-01', { complete: { added: [], removed: ['2026-09-30'] }, skipped: none }).message)
			.toBe('Clicked 2026-10-01, but TaskNotes cleared 2026-09-30 instead. Click 2026-09-30 to change it.');
	});

	it('says so when nothing changed', () => {
		expect(describeOutcome('2026-10-01', { complete: none, skipped: none })).toEqual({
			matchedClick: false,
			changes: [],
			message: 'Nothing changed for 2026-10-01.',
		});
	});

	it('lists every day when more than one changed', () => {
		const outcome = describeOutcome('2026-10-01', {
			complete: { added: ['2026-10-01'], removed: ['2026-09-30'] },
			skipped: none,
		});
		expect(outcome.matchedClick).toBe(false);
		expect(outcome.message).toBe('Clicked 2026-10-01; TaskNotes changed 2026-09-30 (cleared), 2026-10-01 (done).');
	});
});
