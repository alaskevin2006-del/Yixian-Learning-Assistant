import { PRIORITY, today } from "./planning.js";

export const TASK_STATUS = {
    pending: { key: "pending", label: "待办", color: "#6b7280", bg: "#f3f4f6" },
    doing: { key: "doing", label: "进行中", color: "#1d4ed8", bg: "#dbeafe" },
    done: { key: "done", label: "已完成", color: "#166534", bg: "#dcfce7" },
    overdue: { key: "overdue", label: "已逾期", color: "#b91c1c", bg: "#fee2e2" },
};

export function getTaskStatus(task, todayKey = today()) {
    if (task?.done) return TASK_STATUS.done;
    if (String(task?.status || "").toLowerCase() === "doing") return TASK_STATUS.doing;
    const planned = String(task?.plannedDate || "");
    if (planned && planned < todayKey) return TASK_STATUS.overdue;
    return TASK_STATUS.pending;
}

export function build24HourTicks() {
    return Array.from({ length: 25 }, (_, index) => index);
}

export function toggleExpandedSubject(currentSubject, nextSubject) {
    if (!nextSubject) return "";
    return currentSubject === nextSubject ? "" : nextSubject;
}

export function sortTasksForExecution(tasks = [], todayKey = today()) {
    return (tasks || []).slice().sort((a, b) => {
        const statusA = getTaskStatus(a, todayKey).key;
        const statusB = getTaskStatus(b, todayKey).key;
        const statusWeight = { overdue: 4, doing: 3, pending: 2, done: 1 };
        if (statusWeight[statusA] !== statusWeight[statusB]) return statusWeight[statusB] - statusWeight[statusA];
        if ((a.deadline || "") !== (b.deadline || "")) return (a.deadline || "9999-99-99").localeCompare(b.deadline || "9999-99-99");
        return (PRIORITY[b.priority || "medium"]?.weight || 2) - (PRIORITY[a.priority || "medium"]?.weight || 2);
    });
}

export function buildSubjectSummaries({ tasks = [], weekDateKeys = [] } = {}) {
    const map = new Map();
    const weekSet = new Set(weekDateKeys || []);
    (tasks || []).forEach((task) => {
        const subject = String(task?.subject || "未分类");
        const date = String(task?.plannedDate || "");
        if (!weekSet.has(date)) return;
        if (!map.has(subject)) {
            map.set(subject, { subject, total: 0, completed: 0 });
        }
        const row = map.get(subject);
        row.total += 1;
        if (task?.done) row.completed += 1;
    });

    return Array.from(map.values()).map((row) => ({
        ...row,
        progress: row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0,
    })).sort((a, b) => b.total - a.total || a.subject.localeCompare(b.subject, "zh-CN"));
}
