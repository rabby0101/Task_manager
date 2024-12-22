let currentNote = app.workspace.getActiveFile();

if (!currentNote) {
    dv.el("div", "No active file detected!", { cls: "notice" });
    return;
}

// Create an input field and button
const container = dv.el("div", "", { cls: "quickEntryContainer" });

container.innerHTML = `
    <div class="quickEntryPanel">
        <input type="text" class="newTaskInput" placeholder="Add a new task">
        <button class="addTaskButton">Add Task</button>
    </div>`;

// Add task functionality
container.querySelector(".addTaskButton").addEventListener("click", () => {
    const taskText = container.querySelector(".newTaskInput").value.trim();
    if (!taskText) {
        new Notice("Task cannot be empty!");
        return;
    }

    // Read and modify the current note
    app.vault.read(currentNote).then((content) => {
        const updatedContent = content + `\n- [ ] ${taskText}`;
        app.vault.modify(currentNote, updatedContent).then(() => {
            new Notice("Task added successfully!");
            container.querySelector(".newTaskInput").value = ""; // Clear input
            refreshTaskList(); // Call the refresh function
        });
    });
});

// Function to refresh the task list
function refreshTaskList() {
    dv.taskList(dv.pages(currentNote.path).file.tasks, { as: "task" }); // Refresh task list
}
