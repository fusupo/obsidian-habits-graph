import { openTaskNote } from '../utils/noteOpener';
import { Notice, TFile } from 'obsidian';
import type { App, WorkspaceLeaf } from 'obsidian';

jest.mock('obsidian', () => {
	const actual = jest.requireActual('../../__mocks__/obsidian');
	return { ...actual, Notice: jest.fn() };
});

interface FakeAppHandles {
	app: App;
	setActiveLeaf: jest.Mock;
	openFile: jest.Mock;
	leaves: WorkspaceLeaf[];
}

function makeFile(path: string): TFile {
	return Object.assign(new TFile(), { path });
}

function makeApp(options: {
	file?: TFile | null;
	openPaths?: string[];
	extraLeaves?: unknown[];
}): FakeAppHandles {
	const setActiveLeaf = jest.fn();
	const openFile = jest.fn().mockResolvedValue(undefined);
	const leaves = [
		...(options.openPaths ?? []).map(path => ({ view: { file: { path } } })),
		...(options.extraLeaves ?? [])
	] as WorkspaceLeaf[];

	const app = {
		vault: {
			getAbstractFileByPath: jest.fn().mockReturnValue(options.file ?? null)
		},
		workspace: {
			getLeavesOfType: jest.fn().mockReturnValue(leaves),
			setActiveLeaf,
			getLeaf: jest.fn().mockReturnValue({ openFile })
		}
	} as unknown as App;

	return { app, setActiveLeaf, openFile, leaves };
}

describe('openTaskNote', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('missing file guard', () => {
		it('shows a Notice and does not open anything when the path does not resolve', async () => {
			const { app, setActiveLeaf, openFile } = makeApp({ file: null });

			await openTaskNote(app, 'habits/deleted.md');

			expect(Notice).toHaveBeenCalledWith('TaskNote not found: habits/deleted.md');
			expect(setActiveLeaf).not.toHaveBeenCalled();
			expect(openFile).not.toHaveBeenCalled();
		});

		it('treats a non-TFile result (e.g. a folder) as missing', async () => {
			const { app, openFile } = makeApp({});
			(app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue({ path: 'habits' });

			await openTaskNote(app, 'habits');

			expect(Notice).toHaveBeenCalledWith('TaskNote not found: habits');
			expect(openFile).not.toHaveBeenCalled();
		});
	});

	describe('reuse existing leaf', () => {
		it('focuses the leaf that already has the note open instead of opening a new tab', async () => {
			const file = makeFile('habits/workout.md');
			const { app, setActiveLeaf, openFile, leaves } = makeApp({
				file,
				openPaths: ['journal/today.md', 'habits/workout.md']
			});

			await openTaskNote(app, 'habits/workout.md');

			expect(setActiveLeaf).toHaveBeenCalledWith(leaves[1], { focus: true });
			expect(openFile).not.toHaveBeenCalled();
			expect(Notice).not.toHaveBeenCalled();
		});

		it('ignores leaves whose view has no file (e.g. empty tabs) without crashing', async () => {
			const file = makeFile('habits/workout.md');
			const { app, openFile } = makeApp({
				file,
				extraLeaves: [{ view: {} }, { view: { file: null } }, {}]
			});

			await openTaskNote(app, 'habits/workout.md');

			expect(openFile).toHaveBeenCalledWith(file);
		});
	});

	describe('open in new tab', () => {
		it('opens the file in a new tab when it is not open anywhere', async () => {
			const file = makeFile('habits/workout.md');
			const { app, setActiveLeaf, openFile } = makeApp({
				file,
				openPaths: ['journal/today.md']
			});

			await openTaskNote(app, 'habits/workout.md');

			expect(app.workspace.getLeaf).toHaveBeenCalledWith('tab');
			expect(openFile).toHaveBeenCalledWith(file);
			expect(setActiveLeaf).not.toHaveBeenCalled();
			expect(Notice).not.toHaveBeenCalled();
		});

		it('opens a new tab when no markdown leaves exist at all', async () => {
			const file = makeFile('habits/workout.md');
			const { app, openFile } = makeApp({ file });

			await openTaskNote(app, 'habits/workout.md');

			expect(openFile).toHaveBeenCalledWith(file);
		});
	});
});
