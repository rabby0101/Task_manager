import { Plugin, WorkspaceLeaf } from 'obsidian';
import { TaskView, VIEW_TYPE_TASKS } from './TaskView';

export default class TaskManagerPlugin extends Plugin {
    async onload() {
        this.registerView(
            VIEW_TYPE_TASKS,
            (leaf) => {
                const view = new TaskView(leaf);
                
                // Set up input sequence after view is initialized
                view.onload = async () => {
                    const setupInputSequence = () => {
                        const inputs = [
                            '.project-select',
                            '.priority-select',
                            '.tag-input',
                            '.due-date',
                            '.task-input'
                        ];
                        
                        inputs.forEach((selector, index) => {
                            const el = view.containerEl.querySelector(selector);
                            if (el instanceof HTMLElement) {
                                el.setAttribute('tabindex', index.toString());
                                
                                el.addEventListener('keydown', (e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const nextEl = view.containerEl.querySelector(
                                            `[tabindex="${index + 1}"]`
                                        ) as HTMLElement;
                                        if (nextEl) {
                                            nextEl.focus();
                                        } else if (index === inputs.length - 1) {
                                            // If it's the last input, trigger task creation
                                            view.handleCreateTask();
                                        }
                                    }
                                });
                            }
                        });
                    };

                    // Setup sequence once DOM is ready
                    setTimeout(setupInputSequence, 0);
                };
                
                return view;
            }
        );

        this.addRibbonIcon('checkbox-glyph', 'Task Manager', () => {
            this.activateView();
        });

        this.registerMarkdownCodeBlockProcessor('task-manager', (source, el, ctx) => {
            const container = el.createDiv('task-manager-embed');
            const view = new TaskView(this.app.workspace.getLeaf(false));
            view.onOpen().then(() => {
                container.appendChild(view.containerEl);
            });
        });
    }

    async onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_TASKS);
    }

    async activateView() {
        const { workspace } = this.app;
        
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_TASKS)[0];
        
        if (!leaf) {
            const newLeaf = workspace.getRightLeaf(false);
            if (newLeaf) {
                leaf = newLeaf;
                await leaf.setViewState({
                    type: VIEW_TYPE_TASKS,
                    active: true,
                });
            }
        }
        
        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }
}
