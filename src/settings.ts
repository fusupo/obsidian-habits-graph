import { App, PluginSettingTab, Setting } from 'obsidian';
import type OrgHabitsGraphPlugin from './main';

export interface HabitGraphSettings {
	habitTag: string;
	daysBeforeToday: number;
	daysAfterToday: number;
	showStreakCount: boolean;
	autoOrganizeOnModify: boolean;
}

export const DEFAULT_SETTINGS: HabitGraphSettings = {
	habitTag: 'habit',
	daysBeforeToday: 21,
	daysAfterToday: 7,
	showStreakCount: true,
	autoOrganizeOnModify: true
};

export class HabitGraphSettingTab extends PluginSettingTab {
	plugin: OrgHabitsGraphPlugin;

	constructor(app: App, plugin: OrgHabitsGraphPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Org Habits Graph Settings' });

		new Setting(containerEl)
			.setName('Habit tag')
			.setDesc('Tag used to identify habit tasks (e.g., "habit" for #habit)')
			.addText(text => text
				.setPlaceholder('habit')
				.setValue(this.plugin.settings.habitTag)
				.onChange(async (value) => {
					this.plugin.settings.habitTag = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Days before today')
			.setDesc('Number of past days to show in consistency graph')
			.addText(text => text
				.setPlaceholder('21')
				.setValue(String(this.plugin.settings.daysBeforeToday))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.daysBeforeToday = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Days after today')
			.setDesc('Number of future days to show in consistency graph')
			.addText(text => text
				.setPlaceholder('7')
				.setValue(String(this.plugin.settings.daysAfterToday))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num >= 0) {
						this.plugin.settings.daysAfterToday = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Show streak count')
			.setDesc('Display current streak next to habit name')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showStreakCount)
				.onChange(async (value) => {
					this.plugin.settings.showStreakCount = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-organize on file change')
			.setDesc('Automatically indent completed tasks under active tasks when files are modified')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoOrganizeOnModify)
				.onChange(async (value) => {
					this.plugin.settings.autoOrganizeOnModify = value;
					await this.plugin.saveSettings();
				}));
	}
}
