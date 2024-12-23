import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import TaskManagerPlugin from './main';

export const VIEW_TYPE_TASKS = 'task-manager';

export class TaskView extends ItemView {
    plugin: TaskManagerPlugin;
    private container!: HTMLElement;
    private currentNote: TFile | null;
    private activeTab: 'all' | 'today' | 'todo' | 'overdue' | 'unplanned' | null = null;
    private projects: string[] = [];
    private tags: string[] = ['feature', 'bug', 'improvement']; // Default tags without #
    private priorities = [
        { value: 'high', label: 'High', color: 'red' },
        { value: 'medium', label: 'Medium', color: 'blue' },
        { value: 'low', label: 'Low', color: 'yellow' }
    ];
    private allVaultTags: Set<string> = new Set();
    private projectSelect!: HTMLSelectElement;

    navigation = false;
    options = {
        showRibbon: false
    };

    constructor(leaf: WorkspaceLeaf, plugin: TaskManagerPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.currentNote = this.app.workspace.getActiveFile();
        this.loadProjects();
        // Hide navigation buttons and menu
        this.containerEl.addClass('task-manager-view');
        this.contentEl.addClass('task-manager-content');
        
        // Add full width styles
        this.containerEl.style.width = '100%';
        this.containerEl.style.maxWidth = '100%';
        this.contentEl.style.width = '100%';
        this.contentEl.style.maxWidth = '100%';
        
        this.navigation = false;
        (this.leaf as any).tabHeaderEl?.querySelector('.view-header-nav-buttons')?.remove();
        (this.leaf as any).tabHeaderEl?.querySelector('.view-actions')?.remove();

        // Add styles for clickable project
        const style = document.createElement('style');
        style.textContent = `
            .task-project.clickable {
                cursor: pointer;
                color: var(--link-color);
            }
            .task-project.clickable:hover {
                color: var(--link-color-hover);
            }
        `;
        document.head.appendChild(style);
    }

    private async loadProjects() {
        const files = this.app.vault.getMarkdownFiles();
        this.projects = [];

        for (const file of files) {
            const content = await this.app.vault.cachedRead(file);
            const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
            
            if (frontmatter && frontmatter.type === 'Project') {
                this.projects.push(file.basename);
            }
        }
    }

    private async loadAllTags() {
        this.allVaultTags.clear();
        const files = this.app.vault.getMarkdownFiles();
        
        for (const file of files) {
            const content = await this.app.vault.cachedRead(file);
            const matches = content.match(/🔖\s*(\w+)(?:\s|$)/g) || [];
            matches.forEach(match => {
                const tag = match.replace('🔖', '').trim();
                this.allVaultTags.add(tag);
            });
        }
    }

    getViewType(): string {
        return VIEW_TYPE_TASKS;
    }

    getDisplayText(): string {
        return 'Task Manager';
    }

    async onOpen() {
        await this.loadAllTags();
        const { containerEl } = this;
        
        // Initialize with 'all' as default tab
        this.activeTab = 'all';
        
        this.container = containerEl.createDiv({
            cls: 'quickEntryContainer',
            attr: { style: 'width: 100%; max-width: 100%;' }
        });
        
        const today = new Date();
        const dateString = today.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });

        this.container.innerHTML = `
            <div class="today-container">
                <div class="today" data-tab="today">
                    <div class="today-header">Today</div>
                    <div class="today-date">${dateString}</div>
                </div>
            </div>
            <div class="task-tabs">
                <div class="task-tab" data-tab="todo">
                    To Do
                    <span class="task-count" data-tab-count="todo">0</span>
                </div>
                <div class="task-tab" data-tab="overdue">
                    Overdue
                    <span class="task-count" data-tab-count="overdue">0</span>
                </div>
                <div class="task-tab" data-tab="unplanned">
                    Unplanned
                    <span class="task-count" data-tab-count="unplanned">0</span>
                </div>
            </div>
            <div class="task-input-form">
                <div class="metadata-section" style="overflow-x: auto; white-space: nowrap; scrollbar-width: none; -ms-overflow-style: none;">
                    <div class="metadata-row" style="display: inline-flex; gap: 10px; padding-bottom: 5px;">
                        <select class="project-select">
                            <option value="">Select Project</option>
                            ${this.projects.map(p => `<option value="${p}">${p}</option>`).join('')}
                        </select>
                        <select class="priority-select">
                            <option value="">Priority</option>
                            ${this.priorities.map(p => 
                                `<option value="${p.value}">${p.label}</option>`
                            ).join('')}
                        </select>
                        <div class="tag-input-container">
                            <input type="text" class="tag-input" placeholder="Add tags..." list="tag-suggestions">
                            <datalist id="tag-suggestions">
                                ${[...this.allVaultTags].map(t => `<option value="${t}">`).join('')}
                            </datalist>
                            <div class="selected-tags"></div>
                        </div>
                        <input type="date" class="due-date">
                    </div>
                </div>
                <div class="text-input-section">
                    <input type="text" class="task-input" placeholder="What needs to be done?">
                </div>
            </div>
            <div class="taskList"></div>
        `;

        // Add style to hide webkit scrollbar
        const style = document.createElement('style');
        style.textContent = `
            .metadata-section::-webkit-scrollbar {
                display: none;
            }
        `;
        document.head.appendChild(style);

        this.registerDomEvents();
        this.registerTaskInputEvents();
        
        // Remove initial refresh call
        // Just update the counts without showing tasks
        this.updateTabCounts();
    }

    async onunload(): Promise<void> {
        // Any cleanup code here
        return Promise.resolve();
    }

    private async updateProjectSelect() {
        const projectSelect = this.container.querySelector('.project-select') as HTMLSelectElement;
        if (!projectSelect) return;

        projectSelect.innerHTML = `
            <option value="">Select Project</option>
            ${this.projects.map(p => `<option value="${p}">${p}</option>`).join('')}
        `;
    }

    private registerDomEvents() {
        const addButton = this.container.querySelector('.addTaskButton');
        addButton?.addEventListener('click', () => this.addTask());

        // Modified tab click handling for toggle functionality
        const todayTab = this.container.querySelector('.today');
        const regularTabs = Array.from(this.container.querySelectorAll('.task-tab'));
        const allTabs = [...regularTabs];
        if (todayTab) allTabs.push(todayTab);

        allTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const clickedTab = e.currentTarget as HTMLElement;
                const tabType = clickedTab.dataset.tab as 'all' | 'today' | 'todo' | 'overdue' | 'unplanned';
                
                if (!tabType) return;
                
                // If clicking the active tab, deactivate it
                if (this.activeTab === tabType) {
                    clickedTab.classList.remove('active');
                    this.activeTab = null; // Set to null when deactivating
                    this.clearTaskList(); // Clear the task list
                    return;
                }
                
                // Otherwise, activate the clicked tab
                allTabs.forEach(t => t.classList.remove('active'));
                clickedTab.classList.add('active');
                this.activeTab = tabType;
                this.refreshTaskList();
            });
        });

        // Add project refresh when focusing the select
        const projectSelect = this.container.querySelector('.project-select');
        projectSelect?.addEventListener('focus', async () => {
            await this.loadProjects();
            await this.updateProjectSelect();
        });
    }

    private registerTaskInputEvents() {
        const taskInput = this.container.querySelector('.task-input') as HTMLInputElement;  // Changed from .newTaskInput
        const projectSelect = this.container.querySelector('.project-select') as HTMLSelectElement;
        const prioritySelect = this.container.querySelector('.priority-select') as HTMLSelectElement;
        const dueDateInput = this.container.querySelector('.due-date') as HTMLInputElement;
        const selectedTagsContainer = this.container.querySelector('.selected-tags') as HTMLDivElement;

        taskInput?.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const selectedTags = Array.from(selectedTagsContainer.children).map(
                    tagEl => tagEl.textContent?.replace('🔖', '').replace('×', '').trim() || ''
                ).filter(tag => tag);

                await this.createTask(
                    taskInput.value,
                    projectSelect.value,
                    prioritySelect.value,
                    selectedTags,
                    dueDateInput.value
                );
                this.updateTodayCount();
            }
        });

        // Add tag select handling
        const tagSelect = this.container.querySelector('.tag-select') as HTMLSelectElement;
        tagSelect?.addEventListener('change', (e) => {
            const select = e.target as HTMLSelectElement;
            if (select.value === "") {
                const newTag = prompt("Enter new tag name:");
                if (newTag) {
                    this.addNewTag(newTag);
                }
                select.value = newTag || "";
            }
        });

        const tagInput = this.container.querySelector('.tag-input') as HTMLInputElement;
        const selectedTags: Set<string> = new Set();

        tagInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && tagInput.value) {
                e.preventDefault();
                const tag = tagInput.value.trim();
                if (tag && !selectedTags.has(tag)) {
                    selectedTags.add(tag);
                    if (!this.allVaultTags.has(tag)) {
                        this.allVaultTags.add(tag);
                        const datalist = this.container.querySelector('#tag-suggestions');
                        if (datalist) {
                            const option = document.createElement('option');
                            option.value = tag;
                            datalist.appendChild(option);
                        }
                    }
                    const tagEl = createEl('span', {
                        cls: 'selected-tag',
                        text: `🔖 ${tag}`
                    });
                    const removeBtn = createEl('span', {
                        cls: 'remove-tag',
                        text: '×'
                    });
                    removeBtn.addEventListener('click', () => {
                        selectedTags.delete(tag);
                        tagEl.remove();
                    });
                    tagEl.appendChild(removeBtn);
                    selectedTagsContainer.appendChild(tagEl);
                }
                tagInput.value = '';
            }
        });
    }

    private addNewTag(tag: string) {
        const cleanTag = tag.trim().toLowerCase().replace(/\s+/g, '-');
        if (!this.tags.includes(cleanTag)) {
            this.tags.push(cleanTag);
            const tagSelect = this.container.querySelector('.tag-select') as HTMLSelectElement;
            const option = document.createElement('option');
            option.value = cleanTag;
            option.text = `🏷️ ${cleanTag}`;
            tagSelect.add(option);
        }
    }

    private async createTask(
        text: string, 
        projectName: string,
        priority: string,
        tags: string[], 
        dueDate: string
    ) {
        if (!text.trim()) {
            new Notice('Task text cannot be empty');
            return;
        }

        try {
            const projectFile = this.app.vault.getMarkdownFiles().find(
                file => file.basename === projectName
            );

            if (!projectFile) {
                new Notice('Please select a project');
                return;
            }

            const priorityLabel = this.priorities.find(p => p.value === priority)?.label || '';
            const metadata = [
                dueDate ? `📅 ${dueDate}` : '',
                priorityLabel ? `(${priorityLabel})` : '',
                ...tags.map(tag => `🔖 ${tag}`)  // Add 🔖 icon to each tag
            ].filter(Boolean).join(' ');

            const taskLine = `- [ ] ${text.trim()} ${metadata}`;
            const content = await this.app.vault.read(projectFile);

            // Find or create Tasks section (using hardcoded '## Tasks')
            const contentLines = content.split('\n');
            const taskSectionIndex = contentLines.findIndex(line => line.trim() === '## Tasks');
            
            if (taskSectionIndex === -1) {
                // If Tasks section doesn't exist, create it at the end
                contentLines.push('', '## Tasks', taskLine);
            } else {
                // Insert task after the Tasks heading
                contentLines.splice(taskSectionIndex + 1, 0, taskLine);
            }

            await this.app.vault.modify(projectFile, contentLines.join('\n'));
            new Notice('Task added to project!');
            this.clearInputs();
            await this.refreshTaskList();
            this.updateTodayCount();
        } catch (error) {
            console.error('Error creating task:', error);
            new Notice('Failed to create task');
        }
    }

    private clearInputs() {
        const inputs = this.container.querySelectorAll('input, select') as NodeListOf<HTMLInputElement | HTMLSelectElement>;
        const selectedTagsContainer = this.container.querySelector('.selected-tags');
        
        inputs.forEach(input => {
            if (input.type === 'select-multiple') {
                (input as HTMLSelectElement).selectedIndex = -1;
            } else {
                input.value = '';
            }
        });

        if (selectedTagsContainer) {
            selectedTagsContainer.innerHTML = '';
        }
    }

    private async addTask() {
        if (!this.currentNote) {
            new Notice('No active file selected');
            return;
        }

        const input = this.container.querySelector('.newTaskInput') as HTMLInputElement | null;
        if (!input) return;

        const taskText = input.value.trim();
        
        if (!taskText) {
            new Notice('Task cannot be empty!');
            return;
        }

        const content = await this.app.vault.read(this.currentNote);
        const today = new Date().toISOString().split('T')[0];
        const updatedContent = content + `\n- [ ] ${taskText} 📅 ${today}`;
        
        await this.app.vault.modify(this.currentNote, updatedContent);
        new Notice('Task added successfully!');
        input.value = '';
        await this.refreshTaskList();
        this.updateTodayCount();
    }

    private renderTaskElement({ text: task, file }: { text: string, file: TFile }) {
        const taskEl = createDiv('task-item');
        const isChecked = task.includes('[x]');
        const taskText = task.replace(/^- \[(x| )\] /, '');
        
        taskEl.innerHTML = `
            <div class="task-content">
                <div class="task-main-row">
                    <input type="checkbox" ${isChecked ? 'checked' : ''}>
                    <span class="task-text">${this.formatTaskText(taskText)}</span>
                </div>
                <div class="task-metadata-row">
                    <span class="task-project clickable">${file.basename}</span>
                    ${this.formatTaskMetadata(task)}
                </div>
            </div>
            <div class="task-actions">
                <button class="task-edit-btn">Edit</button>
                <button class="task-delete-btn">Delete</button>
            </div>
        `;
        
        // Add click handler for project name
        const projectSpan = taskEl.querySelector('.task-project');
        projectSpan?.addEventListener('click', () => {
            this.app.workspace.getLeaf().openFile(file);
        });

        const checkbox = taskEl.querySelector('input');
        checkbox?.addEventListener('change', () => this.toggleTask(task, isChecked, file));

        const editBtn = taskEl.querySelector('.task-edit-btn');
        editBtn?.addEventListener('click', () => this.editTask(taskEl, task, file));

        const deleteBtn = taskEl.querySelector('.task-delete-btn');
        deleteBtn?.addEventListener('click', () => this.deleteTask(task, file));
        
        return taskEl;
    }

    private async editTask(taskEl: HTMLElement, originalTask: string, file: TFile) {
        // Create edit form
        const editForm = createDiv({ cls: 'task-edit-form task-input-form' });
        const originalText = this.formatTaskText(originalTask.replace(/^- \[(x| )\] /, ''));
        const isChecked = originalTask.includes('[x]');
        
        editForm.innerHTML = `
            <div class="metadata-section" style="overflow-x: auto; white-space: nowrap; scrollbar-width: none; -ms-overflow-style: none;">
                <div class="metadata-row" style="display: inline-flex; gap: 10px; padding-bottom: 5px;">
                    <select class="edit-project-select project-select">
                        <option value="">Select Project</option>
                        ${this.projects.map(p => 
                            `<option value="${p}" ${file.basename === p ? 'selected' : ''}>
                                ${p}
                            </option>`
                        ).join('')}
                    </select>
                    <select class="edit-priority-select priority-select">
                        <option value="">Priority</option>
                        ${this.priorities.map(p => 
                            `<option value="${p.value}" ${originalTask.includes(p.label) ? 'selected' : ''}>
                                ${p.label}
                            </option>`
                        ).join('')}
                    </select>
                    <div class="tag-input-container">
                        <input type="text" class="edit-tag-input tag-input" placeholder="Add tags..." list="edit-tag-suggestions">
                        <datalist id="edit-tag-suggestions">
                            ${[...this.allVaultTags].map(t => `<option value="${t}">`).join('')}
                        </datalist>
                        <div class="edit-selected-tags selected-tags">
                            ${this.getExistingTags(originalTask).map(tag => 
                                `<span class="selected-tag">🔖 ${tag}<span class="remove-tag">×</span></span>`
                            ).join('')}
                        </div>
                    </div>
                    <input type="date" class="edit-due-date due-date" value="${this.getExistingDate(originalTask)}">
                </div>
            </div>
            <div class="text-input-section">
                <input type="text" class="edit-task-input task-input" value="${originalText}" placeholder="What needs to be done?">
            </div>
            <div class="edit-actions" style="display: flex; gap: 10px; margin-top: 10px;">
                <button class="save-edit" style="flex: 1;">Save</button>
                <button class="cancel-edit" style="flex: 1;">Cancel</button>
            </div>
        `;

        // Replace task content with edit form
        const originalContent = taskEl.innerHTML;
        taskEl.innerHTML = '';
        taskEl.appendChild(editForm);

        // Add CSS to hide scrollbar and match new task form style
        const style = document.createElement('style');
        style.textContent = `
            .task-edit-form .metadata-section::-webkit-scrollbar {
                display: none;
            }
            .task-edit-form {
                background: var(--background-primary);
                padding: 10px;
                border-radius: 5px;
                margin-bottom: 10px;
            }
            .task-edit-form input,
            .task-edit-form select {
                height: 30px;
                padding: 0 8px;
                border-radius: 4px;
                border: 1px solid var(--background-modifier-border);
            }
            .task-edit-form .edit-actions button {
                padding: 6px 12px;
                border-radius: 4px;
                border: 1px solid var(--background-modifier-border);
                background: var(--interactive-normal);
                color: var(--text-normal);
                cursor: pointer;
            }
            .task-edit-form .edit-actions button:hover {
                background: var(--interactive-hover);
            }
            .task-edit-form .tag-input-container {
                position: relative;
                min-width: 120px;
            }
        `;
        document.head.appendChild(style);

        // Setup edit form handlers
        this.setupEditFormHandlers(editForm, taskEl, originalContent, originalTask, file, isChecked);
    }

    private setupEditFormHandlers(
        editForm: HTMLElement, 
        taskEl: HTMLElement, 
        originalContent: string,
        originalTask: string,
        file: TFile,
        isChecked: boolean
    ) {
        const saveBtn = editForm.querySelector('.save-edit');
        const cancelBtn = editForm.querySelector('.cancel-edit');
        const tagInput = editForm.querySelector('.edit-tag-input') as HTMLInputElement;
        const selectedTagsContainer = editForm.querySelector('.edit-selected-tags') as HTMLElement;

        // Tag input handler
        tagInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && tagInput.value) {
                e.preventDefault();
                const tag = tagInput.value.trim();
                this.addTagToEdit(tag, selectedTagsContainer);
                tagInput.value = '';
            }
        });

        // Setup existing tag removal
        selectedTagsContainer?.querySelectorAll('.remove-tag').forEach(btn => {
            btn.addEventListener('click', () => {
                (btn.parentElement as HTMLElement).remove();
            });
        });

        // Save handler
        saveBtn?.addEventListener('click', async () => {
            const newText = (editForm.querySelector('.edit-task-input') as HTMLInputElement).value;
            const priority = (editForm.querySelector('.edit-priority-select') as HTMLSelectElement).value;
            const dueDate = (editForm.querySelector('.edit-due-date') as HTMLInputElement).value;
            const tags = Array.from(selectedTagsContainer.children).map(
                tagEl => tagEl.textContent?.replace('🔖', '').replace('×', '').trim() || ''
            ).filter(tag => tag);

            await this.updateTask(originalTask, newText, priority, tags, dueDate, file, isChecked);
            await this.refreshTaskList();
            this.updateTodayCount();
        });

        // Cancel handler
        cancelBtn?.addEventListener('click', () => {
            taskEl.innerHTML = originalContent;
        });
    }

    private addTagToEdit(tag: string, container: HTMLElement) {
        if (!tag || Array.from(container.children).some(child => 
            child.textContent?.replace('🔖', '').replace('×', '').trim() === tag
        )) return;
        
        const tagEl = this.createEl('span', {
            cls: 'selected-tag',
            text: `🔖 ${tag}`
        });
        
        const removeBtn = this.createEl('span', {
            cls: 'remove-tag',
            text: '×'
        });
        
        removeBtn.addEventListener('click', () => tagEl.remove());
        tagEl.appendChild(removeBtn);
        container.appendChild(tagEl);
    }

    private async updateTask(
        originalTask: string,
        newText: string,
        priority: string,
        tags: string[],
        dueDate: string,
        file: TFile,
        isChecked: boolean
    ) {
        try {
            const editForm = document.querySelector('.task-edit-form');
            const newProjectName = (editForm?.querySelector('.edit-project-select') as HTMLSelectElement)?.value;
            const newProjectFile = this.app.vault.getMarkdownFiles().find(f => f.basename === newProjectName);
            
            if (!newProjectFile) {
                new Notice('Invalid project selected');
                return;
            }

            // If project changed, remove from old file and add to new file
            if (newProjectFile.path !== file.path) {
                // Remove from old file
                let oldContent = await this.app.vault.read(file);
                const oldLines = oldContent.split('\n');
                const oldTaskIndex = oldLines.findIndex(line => line.includes(originalTask));
                if (oldTaskIndex !== -1) {
                    oldLines.splice(oldTaskIndex, 1);
                    await this.app.vault.modify(file, oldLines.join('\n'));
                }

                // Add to new file
                let newContent = await this.app.vault.read(newProjectFile);
                const newLines = newContent.split('\n');
                const taskSectionIndex = newLines.findIndex(line => line.trim() === '## Tasks');
                
                const priorityLabel = this.priorities.find(p => p.value === priority)?.label || '';
                const metadata = [
                    dueDate ? `📅 ${dueDate}` : '',
                    priorityLabel ? `(${priorityLabel})` : '',
                    ...tags.map(tag => `🔖 ${tag}`)
                ].filter(Boolean).join(' ');

                const newTaskLine = `- [${isChecked ? 'x' : ' '}] ${newText.trim()} ${metadata}`;
                
                if (taskSectionIndex === -1) {
                    newLines.push('', '## Tasks', newTaskLine);
                } else {
                    newLines.splice(taskSectionIndex + 1, 0, newTaskLine);
                }
                
                await this.app.vault.modify(newProjectFile, newLines.join('\n'));
            } else {
                // Update in same file
                const content = await this.app.vault.read(file);
                const lines = content.split('\n');
                const taskIndex = lines.findIndex(line => line.includes(originalTask));

                if (taskIndex !== -1) {
                    const priorityLabel = this.priorities.find(p => p.value === priority)?.label || '';
                    const metadata = [
                        dueDate ? `📅 ${dueDate}` : '',
                        priorityLabel ? `(${priorityLabel})` : '',
                        ...tags.map(tag => `🔖 ${tag}`)
                    ].filter(Boolean).join(' ');

                    lines[taskIndex] = `- [${isChecked ? 'x' : ' '}] ${newText.trim()} ${metadata}`;
                    await this.app.vault.modify(file, lines.join('\n'));
                }
            }

            await this.refreshTaskList();
            new Notice('Task updated successfully');
            this.updateTodayCount();
        } catch (error) {
            console.error('Error updating task:', error);
            new Notice('Failed to update task');
        }
    }

    private getExistingTags(task: string): string[] {
        const matches = task.match(/🔖\s*(\w+)/g) || [];
        // Use Set to remove duplicates and then convert back to array
        return [...new Set(matches.map(match => match.replace('🔖', '').trim()))];
    }

    private getExistingDate(task: string): string {
        const match = task.match(/📅 (\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : '';
    }

    private async refreshTaskList() {
        const taskListContainer = this.container.querySelector('.taskList');
        if (!taskListContainer) {
            console.error('Task list container not found');
            return;
        }

        taskListContainer.empty();
        
        // If no tab is active (null), don't show any tasks
        if (this.activeTab === null) {
            return;
        }

        try {
            let allTasks: {text: string, file: TFile}[] = [];
            const projectFiles = this.app.vault.getMarkdownFiles()
                .filter(file => {
                    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
                    return frontmatter?.type === 'Project';
                });

            // Collect tasks from all project files
            for (const file of projectFiles) {
                const content = await this.app.vault.read(file);
                const lines = content.split('\n');
                const taskSectionIndex = lines.findIndex(line => line.trim() === '## Tasks');
                
                if (taskSectionIndex !== -1) {
                    const tasks = lines.slice(taskSectionIndex + 1)
                        .filter(line => line.match(/^- \[(x| )\]/))
                        .map(task => ({ text: task, file }));
                    allTasks = allTasks.concat(tasks);
                }
            }

            // Calculate counts for each tab
            const today = new Date().toISOString().split('T')[0];
            const counts = {
                today: allTasks.filter(({ text: task }) => task.includes(`📅 ${today}`)).length,
                todo: allTasks.filter(({ text: task }) => 
                    !task.includes('[x]') && 
                    task.match(/📅 \d{4}-\d{2}-\d{2}/)  // Has a date
                ).length,
                overdue: allTasks.filter(({ text: task }) => {
                    const dateMatch = task.match(/📅 (\d{4}-\d{2}-\d{2})/);
                    return dateMatch && !task.includes('[x]') && dateMatch[1] < today;
                }).length,
                unplanned: allTasks.filter(({ text: task }) => 
                    !task.match(/📅 \d{4}-\d{2}-\d{2}/) && 
                    !task.includes('[x]')  // Add this condition to filter out completed tasks
                ).length
            };

            // Update count displays
            Object.entries(counts).forEach(([tab, count]) => {
                const countEl = this.container.querySelector(`[data-tab-count="${tab}"]`);
                if (countEl) countEl.textContent = count.toString();
            });

            // Filter tasks based on active tab
            switch (this.activeTab) {
                case 'today':
                    allTasks = allTasks.filter(({ text: task }) => task.includes(`📅 ${today}`));
                    break;
                case 'todo':
                    // Updated to show all tasks with dates that aren't completed
                    allTasks = allTasks.filter(({ text: task }) => 
                        !task.includes('[x]') && 
                        task.match(/📅 \d{4}-\d{2}-\d{2}/)  // Has a date
                    );
                    break;
                case 'overdue':
                    allTasks = allTasks.filter(({ text: task }) => {
                        const dateMatch = task.match(/📅 (\d{4}-\d{2}-\d{2})/);
                        if (dateMatch && !task.includes('[x]')) {
                            return dateMatch[1] < today;
                        }
                        return false;
                    });
                    break;
                case 'unplanned':
                    allTasks = allTasks.filter(({ text: task }) => 
                        !task.match(/📅 \d{4}-\d{2}-\d{2}/) && 
                        !task.includes('[x]')  // Add this condition to filter out completed tasks
                    );
                    break;
            }

            // Render tasks
            const taskElements = allTasks.map(task => this.renderTaskElement(task));

            taskElements.forEach(taskEl => taskListContainer.appendChild(taskEl));
        } catch (error) {
            console.error("Error refreshing task list:", error);
            taskListContainer.innerHTML = '<div class="notice">Error loading tasks. Please try again.</div>';
        }
    }

    // Add new method to clear task list
    private clearTaskList() {
        const taskListContainer = this.container.querySelector('.taskList');
        if (taskListContainer) {
            taskListContainer.empty();
        }
    }

    // Add new method to update tab counts without showing tasks
    private async updateTabCounts() {
        const today = new Date().toISOString().split('T')[0];
        try {
            let allTasks: {text: string, file: TFile}[] = [];
            const projectFiles = this.app.vault.getMarkdownFiles()
                .filter(file => {
                    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
                    return frontmatter?.type === 'Project';
                });

            // Collect tasks for counting
            for (const file of projectFiles) {
                const content = await this.app.vault.read(file);
                const lines = content.split('\n');
                const taskSectionIndex = lines.findIndex(line => line.trim() === '## Tasks');
                
                if (taskSectionIndex !== -1) {
                    const tasks = lines.slice(taskSectionIndex + 1)
                        .filter(line => line.match(/^- \[(x| )\]/))
                        .map(task => ({ text: task, file }));
                    allTasks = allTasks.concat(tasks);
                }
            }

            // Update counts
            const counts = {
                today: allTasks.filter(({ text: task }) => task.includes(`📅 ${today}`)).length,
                // Updated todo count to match new filter
                todo: allTasks.filter(({ text: task }) => 
                    !task.includes('[x]') && 
                    task.match(/📅 \d{4}-\d{2}-\d{2}/)  // Has a date
                ).length,
                overdue: allTasks.filter(({ text: task }) => {
                    const dateMatch = task.match(/📅 (\d{4}-\d{2}-\d{2})/);
                    return dateMatch && !task.includes('[x]') && dateMatch[1] < today;
                }).length,
                unplanned: allTasks.filter(({ text: task }) => 
                    !task.match(/📅 \d{4}-\d{2}-\d{2}/) && 
                    !task.includes('[x]')
                ).length
            };

            // Update count displays
            Object.entries(counts).forEach(([tab, count]) => {
                const countEl = this.container.querySelector(`[data-tab-count="${tab}"]`);
                if (countEl) countEl.textContent = count.toString();
            });
        } catch (error) {
            console.error("Error updating tab counts:", error);
        }
    }

    private formatTaskText(text: string): string {
        // Remove all metadata (date, priority, tags) from task text
        return text
            .replace(/📅 \d{4}-\d{2}-\d{2}/, '')
            .replace(/\((High|Medium|Low)\)/, '')
            .replace(/🔖 \w+/g, '')
            .trim();
    }

    private formatTaskMetadata(task: string): string {
        const tagMatches = task.match(/🔖\s*(\w+)/g) || [];
        const dueDateMatch = task.match(/📅 (\d{4}-\d{2}-\d{2})/);
        const dueDate = dueDateMatch ? dueDateMatch[1] : '';
        const priorityMatch = task.match(/\((High|Medium|Low)\)/);
        const priority = priorityMatch ? priorityMatch[1] : '';

        return `<div class="task-metadata">
            ${priority ? `<span class="task-priority priority-${priority.toLowerCase()}">${priority}</span>` : ''}
            ${tagMatches.map(tag => {
                const cleanTag = tag.replace('🔖', '').trim();
                return `<span class="task-tag">🔖 ${cleanTag}</span>`;
            }).join('')}
            ${dueDate ? `<span class="task-date">${dueDate}</span>` : ''}
        </div>`;
    }

    private async toggleTask(taskLine: string, currentState: boolean, projectFile: TFile) {
        try {
            const content = await this.app.vault.read(projectFile);
            const lines = content.split('\n');
            const taskIndex = lines.findIndex(line => line.includes(taskLine));

            if (taskIndex !== -1) {
                lines[taskIndex] = lines[taskIndex].replace(
                    currentState ? '[x]' : '[ ]',
                    currentState ? '[ ]' : '[x]'
                );
                await this.app.vault.modify(projectFile, lines.join('\n'));
                await this.refreshTaskList(); // Added await
                this.updateTodayCount();
            }
        } catch (error) {
            console.error('Error toggling task:', error);
            new Notice('Failed to toggle task');
        }
    }

    private async deleteTask(taskLine: string, file: TFile) {
        const confirm = window.confirm('Are you sure you want to delete this task?');
        if (!confirm) return;

        try {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            const taskIndex = lines.findIndex(line => line.includes(taskLine));

            if (taskIndex !== -1) {
                lines.splice(taskIndex, 1);
                await this.app.vault.modify(file, lines.join('\n'));
                await this.refreshTaskList();
                new Notice('Task deleted successfully');
                this.updateTodayCount();
            }
        } catch (error) {
            console.error('Error deleting task:', error);
            new Notice('Failed to delete task');
        }
    }

    private createEl(tag: string, options: { cls?: string, text?: string } = {}): HTMLElement {
        const el = document.createElement(tag);
        if (options.cls) el.className = options.cls;
        if (options.text) el.textContent = options.text;
        return el;
    }

    private async updateTodayCount() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Find all tasks due today across all project files
        const allFiles = this.app.vault.getMarkdownFiles();
        let todayCount = 0;

        for (const file of allFiles) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache || !cache.listItems) continue;

            const tasks = cache.listItems.filter(async item => {
                // Get the actual line content from the file's sections
                const sections = cache.sections || [];
                const section = sections.find(s => s.position.start.line === item.position.start.line);
                if (!section) return false;

                const fileContent = await this.app.vault.read(file);
                const taskContent = fileContent.slice(section.position.start.offset, section.position.end.offset) || '';
                if (!item.task) return false;
                
                const dateMatch = taskContent.match(/📅 (\d{4}-\d{2}-\d{2})/);
                if (!dateMatch) return false;
                
                const taskDate = new Date(dateMatch[1]);
                taskDate.setHours(0, 0, 0, 0);
                return taskDate.getTime() === today.getTime();
            });
            
            todayCount += tasks.length;
        }

        // Update only the today count in the Today tab
        const todayCountEl = this.container.querySelector('[data-tab-count="today"]');
        if (todayCountEl) {
            todayCountEl.textContent = todayCount.toString();
        }
    }

    private handleTaskChange() {
        this.updateTodayCount();
    }

    public handleCreateTask() {
        const taskInput = this.container.querySelector('.task-input') as HTMLInputElement;
        const projectSelect = this.container.querySelector('.project-select') as HTMLSelectElement;
        const prioritySelect = this.container.querySelector('.priority-select') as HTMLSelectElement;
        const dueDateInput = this.container.querySelector('.due-date') as HTMLInputElement;
        const selectedTagsContainer = this.container.querySelector('.selected-tags') as HTMLDivElement;

        if (!taskInput || !projectSelect || !prioritySelect || !dueDateInput || !selectedTagsContainer) {
            new Notice('Required elements not found');
            return;
        }

        const selectedTags = Array.from(selectedTagsContainer.children).map(
            tagEl => tagEl.textContent?.replace('🔖', '').replace('×', '').trim() || ''
        ).filter(tag => tag);

        this.createTask(
            taskInput.value,
            projectSelect.value,
            prioritySelect.value,
            selectedTags,
            dueDateInput.value
        );
        this.updateTodayCount();
    }

    async refresh() {
        // Clear existing tasks
        this.containerEl.querySelector('.task-list')?.empty();
        
        // Re-load tasks
        await this.loadTasks();
        
        // Re-render view
        await this.render();
    }

    private async render() {
        // Clear existing content
        this.containerEl.empty();
        
        // Re-create the container
        this.container = this.containerEl.createDiv({
            cls: 'quickEntryContainer',
            attr: { style: 'width: 100%; max-width: 100%;' }
        });
        
        // Re-initialize the view
        await this.onOpen();
    }

    private async loadTasks() {
        // Your existing task loading logic
        // ...existing code...
    }
}
