import { App, PluginSettingTab, Setting } from 'obsidian'; // Added Setting import
import TaskManagerPlugin from './main';

export interface TaskManagerSettings {
    taskSection: string;
}

export const DEFAULT_SETTINGS: TaskManagerSettings = {
    taskSection: '## Tasks'
};

export class TaskManagerSettingsTab extends PluginSettingTab {
    plugin: TaskManagerPlugin;

    constructor(app: App, plugin: TaskManagerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Task Manager Settings' });

        new Setting(containerEl)
            .setName('Task Section Heading')
            .setDesc('The section heading under which new tasks will be added (include markdown heading syntax)')
            .addText(text => text
                .setPlaceholder('## Tasks')
                .setValue(this.plugin.settings.taskSection || '## Tasks') // Added fallback
                .onChange(async (value) => {
                    if (!value) value = '## Tasks'; // Ensure we always have a value
                    this.plugin.settings.taskSection = value;
                    await this.plugin.saveSettings();
                }));
    }
}
