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

        // No settings needed
    }
}
