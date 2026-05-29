export function filterTasksForPanel(tasks = [], subjects = [], options = {}) {
    const {
        taskView = "new",
        query = "",
        level = "all",
    } = options;
    const activeSubjectId = taskView.startsWith("subject:") ? taskView.slice("subject:".length) : "";
    const activeSubject = subjects.find((subject) => subject.id === activeSubjectId);
    const normalizedQuery = String(query || "").trim().toLowerCase();

    return (tasks || []).filter((task) => {
        if (taskView === "uncategorized" && task.subject) return false;
        if (activeSubject && task.subject !== activeSubject.name) return false;
        if (level === "with-subject" && !task.subject) return false;
        if (level === "uncategorized" && task.subject) return false;

        if (!normalizedQuery) return true;
        return [
            task.title,
            task.subject,
            task.description,
            task.date,
            task.start,
            task.end,
        ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
    });
}
