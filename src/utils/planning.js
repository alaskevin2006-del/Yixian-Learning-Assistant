export const uid = () => Math.random().toString(36).slice(2, 10);
export const today = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};
export const nowDate = () => new Date();

export const addDays = (n, base = new Date()) => {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
};

export const fmt = (d) => {
    if (!d) return "未设置";
    return new Date(d).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
};

export const fmtFull = (d) => new Date(d).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
});

export const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
        : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

export const DAYS = [
    { key: "mon", label: "周一" },
    { key: "tue", label: "周二" },
    { key: "wed", label: "周三" },
    { key: "thu", label: "周四" },
    { key: "fri", label: "周五" },
    { key: "sat", label: "周六" },
    { key: "sun", label: "周日" },
];

export const SLOTS = [
    { key: "morning", label: "上午" },
    { key: "afternoon", label: "下午" },
    { key: "evening", label: "晚上" },
];

export const SLOT_LABELS = {
    morning: "上午",
    afternoon: "下午",
    evening: "晚上",
};

export const SLOT_TIME_RANGES = {
    morning: { startTime: "08:00", endTime: "12:00" },
    afternoon: { startTime: "13:00", endTime: "17:00" },
    evening: { startTime: "18:00", endTime: "22:00" },
};

export function timeToMinutes(timeStr) {
    const t = String(timeStr || "").trim();
    if (!/^\d{1,2}:\d{2}$/.test(t)) return Number.NaN;
    const [h, m] = t.split(":").map((x) => Number(x));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.NaN;
    if (h < 0 || h > 23 || m < 0 || m > 59) return Number.NaN;
    return h * 60 + m;
}

export function getTaskTimeRange(task = {}) {
    const plannedDateValue = task?.plannedDate || task?.planned_date;
    const plannedDate = plannedDateValue
        ? toDateKey(plannedDateValue, { fallback: "", clampPast: false })
        : "";
    if (!plannedDate) return null;

    const explicitStart = String(task?.startTime || task?.start_time || "").trim();
    const explicitEnd = String(task?.endTime || task?.end_time || "").trim();
    const explicitStartMinutes = timeToMinutes(explicitStart);
    const explicitEndMinutes = timeToMinutes(explicitEnd);

    if (
        Number.isFinite(explicitStartMinutes)
        && Number.isFinite(explicitEndMinutes)
        && explicitEndMinutes > explicitStartMinutes
    ) {
        return {
            plannedDate,
            startTime: explicitStart,
            endTime: explicitEnd,
            startMinutes: explicitStartMinutes,
            endMinutes: explicitEndMinutes,
            source: "explicit",
        };
    }

    const slotKey = SLOTS.some((item) => item.key === task?.slot) ? task.slot : "";
    const slotRange = slotKey ? SLOT_TIME_RANGES[slotKey] : null;
    if (!slotRange) return null;

    return {
        plannedDate,
        startTime: slotRange.startTime,
        endTime: slotRange.endTime,
        startMinutes: timeToMinutes(slotRange.startTime),
        endMinutes: timeToMinutes(slotRange.endTime),
        source: "slot",
        slot: slotKey,
    };
}

export function isTaskFinished(task = {}) {
    const status = String(task?.status || "").toLowerCase();
    return Boolean(task?.done) || status === "done" || status === "skipped";
}

export function isTaskActiveNow(task = {}, now = new Date()) {
    if (!task || isTaskFinished(task)) return false;
    const range = getTaskTimeRange(task);
    if (!range) return false;
    const nowDateKey = toDateKey(now, { fallback: today(), clampPast: false });
    if (range.plannedDate !== nowDateKey) return false;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return range.startMinutes <= nowMinutes && nowMinutes < range.endMinutes;
}

export const ENERGY_LEVELS = [
    { key: "full", label: "满格", emoji: "🔋", color: "#22c55e", suggest: "适合做高难度新内容与难题攻坚" },
    { key: "high", label: "高效", emoji: "⚡", color: "#84cc16", suggest: "适合主线学习，推进核心章节" },
    { key: "normal", label: "平稳", emoji: "🌤️", color: "#eab308", suggest: "适合常规任务、整理笔记、刷题巩固" },
    { key: "low", label: "低谷", emoji: "🌙", color: "#f97316", suggest: "适合复习、整理错题、短时轻任务" },
    { key: "empty", label: "耗尽", emoji: "😴", color: "#ef4444", suggest: "优先休息，不建议继续硬扛难任务" },
];

export const PRIORITY = {
    high: { label: "紧急", color: "#ef4444", weight: 3 },
    medium: { label: "一般", color: "#f59e0b", weight: 2 },
    low: { label: "低优", color: "#6b7280", weight: 1 },
};

export const DIFFICULTY = {
    hard: { label: "困难", weight: 3 },
    medium: { label: "中等", weight: 2 },
    easy: { label: "简单", weight: 1 },
};

export const MASTERY = [
    { key: "new", label: "未学", color: "#d1d5db" },
    { key: "fuzzy", label: "模糊", color: "#ef4444" },
    { key: "understand", label: "理解", color: "#f59e0b" },
    { key: "grasp", label: "掌握", color: "#22c55e" },
    { key: "master", label: "熟练", color: "#3b82f6" },
];

export const BASE_LEVELS = {
    weak: { label: "薄弱", weight: 3, color: "#ef4444" },
    medium: { label: "一般", weight: 2, color: "#f59e0b" },
    strong: { label: "较强", weight: 1, color: "#22c55e" },
};

export const SR_INTERVALS = [1, 3, 7, 14, 30];

export function isAiTask(task) {
    return ["ai", "ai-chat", "ai-import"].includes(task?.source);
}

export function toDateKey(value, { fallback = today(), clampPast = false } = {}) {
    if (!value) return fallback;

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return fallback;
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, "0");
        const d = String(value.getDate()).padStart(2, "0");
        const result = `${y}-${m}-${d}`;
        return clampPast && result < fallback ? fallback : result;
    }

    const raw = String(value).trim();
    if (!raw) return fallback;

    let parsed = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        parsed = new Date(`${raw}T00:00:00`);
    } else {
        parsed = new Date(raw);
    }

    if (Number.isNaN(parsed.getTime())) return fallback;

    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    const result = `${y}-${m}-${d}`;
    return clampPast && result < fallback ? fallback : result;
}

export function normalizePlannedDate(value) {
    return toDateKey(value, { fallback: today(), clampPast: true });
}

export function normalizeRecordDate(value) {
    return toDateKey(value, { fallback: today(), clampPast: false });
}

export function dayNumberFromDateKey(value) {
    const key = toDateKey(value, { fallback: today(), clampPast: false });
    const parts = key.split("-").map((v) => Number(v));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return Math.floor(Date.now() / 86400000);
    const [y, m, d] = parts;
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function diffDays(a, b) {
    return dayNumberFromDateKey(a) - dayNumberFromDateKey(b);
}

export function toDateKeyAtOffset(value, offsetMinutes = 0, { fallback = today(), clampPast = false } = {}) {
    const date = value instanceof Date
        ? value
        : (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim())
            ? new Date(`${String(value).trim()}T00:00:00`)
            : new Date(value));
    if (Number.isNaN(date.getTime())) return fallback;
    const shifted = new Date(date.getTime() + Number(offsetMinutes || 0) * 60000);
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
    const d = String(shifted.getUTCDate()).padStart(2, "0");
    const result = `${y}-${m}-${d}`;
    return clampPast && result < fallback ? fallback : result;
}

export function getWeekdayKey(date) {
    const day = date.getDay();
    return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][day];
}

export function getWeekStartDate(base = new Date()) {
    const d = new Date(base);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    d.setHours(0, 0, 0, 0);
    return d;
}

function isOccupiedSlot(occupiedBlocks, dateKey, slotKey) {
    if (!occupiedBlocks || occupiedBlocks.length === 0) return false;
    return occupiedBlocks.some((item) => item?.date === dateKey && item?.slot === slotKey);
}

export function collectCurrentWeekFreeSlots(schedule, occupiedBlocks = []) {
    const result = [];
    const weekStart = getWeekStartDate(new Date());
    const todayKey = today();

    for (let i = 0; i < 7; i += 1) {
        const date = addDays(i, weekStart);
        const dateKey = toDateKey(date, { fallback: todayKey });
        if (dateKey < todayKey) continue;
        const dayKey = getWeekdayKey(date);
        SLOTS.forEach((slot) => {
            if (schedule?.[`${dayKey}-${slot.key}`] === "free" && !isOccupiedSlot(occupiedBlocks, dateKey, slot.key)) {
                result.push({
                    date: dateKey,
                    slot: slot.key,
                    label: `${fmt(date)} ${SLOT_LABELS[slot.key]}`,
                });
            }
        });
    }

    return result;
}

export function countDesiredWeeklyTasks(subjects = []) {
    return subjects.reduce((sum, subject) => {
        const baseQuota = Number(subject.weeklyHours || 0) > 0
            ? Number(subject.weeklyHours)
            : (subject.base === "weak" ? 4 : subject.base === "medium" ? 3 : 2);
        return sum + Math.max(2, Math.min(baseQuota, 7));
    }, 0);
}

export function getWeeklyPlanMeta(profile, occupiedBlocks = []) {
    const subjects = (profile?.subjects || []).slice();
    const freeSlots = collectCurrentWeekFreeSlots(profile?.schedule || {}, occupiedBlocks);
    const desiredTasks = countDesiredWeeklyTasks(subjects);
    const shortage = Math.max(desiredTasks - freeSlots.length, 0);

    return {
        subjectCount: subjects.length,
        freeSlotCount: freeSlots.length,
        desiredTasks,
        shortage,
        isCompressed: freeSlots.length > 0 && shortage > 0,
        hasFreeSlots: freeSlots.length > 0,
    };
}

export function normalizeTaskText(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[·•\-—_]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function normalizeTaskInput(task = {}, fallbackSource = "manual") {
    return {
        ...task,
        id: task.id || uid(),
        title: String(task.title || "").trim(),
        subject: String(task.subject || "").trim(),
        deadline: task.deadline ? normalizePlannedDate(task.deadline) : "",
        plannedDate: normalizePlannedDate(task.plannedDate || today()),
        slot: SLOTS.some((item) => item.key === task.slot) ? task.slot : "evening",
        priority: PRIORITY[task.priority] ? task.priority : "medium",
        difficulty: DIFFICULTY[task.difficulty] ? task.difficulty : "medium",
        done: Boolean(task.done),
        blocked: Boolean(task.blocked),
        source: task.source || fallbackSource,
        createdAt: task.createdAt || today(),
    };
}

export function createTaskFingerprint(task) {
    const normalized = normalizeTaskInput(task, task?.source || "manual");
    return [
        normalizeTaskText(normalized.subject),
        normalizeTaskText(normalized.title),
        normalized.plannedDate || "",
        normalized.slot || "",
    ].join("|");
}

export function mergeUniqueTasks(existingTasks = [], incomingTasks = [], { replacePendingAiImport = false, fallbackSource = "manual" } = {}) {
    const baseTasks = replacePendingAiImport
        ? existingTasks.filter((task) => task.source !== "ai-import" || task.done)
        : existingTasks.slice();

    const seen = new Set(baseTasks.map((task) => createTaskFingerprint(task)));
    const merged = baseTasks.slice();

    incomingTasks.forEach((task) => {
        const normalized = normalizeTaskInput(task, task?.source || fallbackSource);
        if (!normalized.title) return;
        const key = createTaskFingerprint(normalized);
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(normalized);
    });

    return merged;
}

export function defaultSchedule() {
    const schedule = {};
    DAYS.forEach((d, dayIndex) => {
        SLOTS.forEach((slot) => {
            const defaultBusy = dayIndex < 5 && slot.key !== "evening";
            schedule[`${d.key}-${slot.key}`] = defaultBusy ? "busy" : "free";
        });
    });
    return schedule;
}

export function scheduleLabel(v) {
    return v === "busy" ? "有课/忙" : "可安排";
}

export function nextScheduleState(v) {
    return v === "busy" ? "free" : "busy";
}

export function getEnergyInfo(key) {
    return ENERGY_LEVELS.find((e) => e.key === key) || ENERGY_LEVELS[2];
}

export function getMasteryLabel(key) {
    return MASTERY.find((m) => m.key === key)?.label || key;
}

export function getIntakeCompletion(profile) {
    let score = 0;
    if (profile.examGoal?.trim()) score += 1;
    if (profile.shortGoal?.trim()) score += 1;
    if (profile.longGoal?.trim()) score += 1;
    if ((profile.subjects || []).length > 0) score += 2;
    const freeCount = Object.values(profile.schedule || {}).filter((v) => v === "free").length;
    if (freeCount > 0) score += 2;
    return Math.min(100, Math.round((score / 7) * 100));
}

export function getSubjectPriority(subject) {
    const baseScore = BASE_LEVELS[subject.base || "medium"]?.weight || 2;
    const weekly = Number(subject.weeklyHours || 0);
    const target = Number(subject.targetScore || 0);
    let score = baseScore * 14 + Math.min(weekly, 8) * 4 + Math.min(Math.max(target - 60, 0), 40) / 4;
    if (subject.examDate) {
        const days = diffDays(subject.examDate, today());
        if (days <= 7) score += 24;
        else if (days <= 14) score += 16;
        else if (days <= 30) score += 10;
    }
    return score;
}

export function collectFreeSlots(schedule, days = 7, occupiedBlocks = []) {
    const result = [];
    for (let i = 0; i < days; i += 1) {
        const date = addDays(i);
        const dayKey = getWeekdayKey(date);
        const dateKey = toDateKey(date, { fallback: today(), clampPast: false });
        SLOTS.forEach((slot) => {
            if (schedule?.[`${dayKey}-${slot.key}`] === "free" && !isOccupiedSlot(occupiedBlocks, dateKey, slot.key)) {
                result.push({
                    date: dateKey,
                    slot: slot.key,
                    label: `${fmt(date)} ${SLOT_LABELS[slot.key]}`,
                });
            }
        });
    }
    return result;
}

export function buildMonthlyPlan(profile, issues = []) {
    const subjects = (profile.subjects || []).slice().sort((a, b) => getSubjectPriority(b) - getSubjectPriority(a));
    return subjects.map((subject) => {
        const weakCount = issues.filter((i) => i.subject === subject.name && i.status !== "resolved").length;
        const focus = weakCount > 0 ? `优先解决 ${weakCount} 个卡点/错题` : (subject.focus || "基础梳理 + 题型训练");
        const daysLeft = subject.examDate ? diffDays(subject.examDate, today()) : null;

        let stage1 = "完成章节摸底与基础知识清点";
        let stage2 = "围绕题型做专项训练";
        let stage3 = "错题回炉 + 模拟冲刺";

        if (subject.base === "weak") {
            stage1 = "优先补基础，建立知识框架";
            stage2 = "典型例题 + 高频题型巩固";
            stage3 = "错题重做 + 查漏补缺";
        }

        if (daysLeft !== null && daysLeft <= 14) {
            stage1 = "快速回顾高频考点";
            stage2 = "真题 / 模拟卷限时训练";
            stage3 = "考前复盘与易错点回炉";
        }

        return {
            id: subject.id,
            subject: subject.name,
            level: BASE_LEVELS[subject.base || "medium"].label,
            targetScore: subject.targetScore || "—",
            examDate: subject.examDate || "",
            focus,
            stages: [
                { name: "第 1 阶段", content: stage1 },
                { name: "第 2 阶段", content: stage2 },
                { name: "第 3 阶段", content: stage3 },
            ],
        };
    });
}

export function taskTemplate(subject, index, issueText) {
    if (issueText) return `解决卡点：${issueText}`;
    const templates = [
        "章节摸底与知识框架梳理",
        "核心知识点精讲 + 笔记整理",
        "典型例题训练",
        "作业/真题专项突破",
        "错题复盘与归纳",
        "阶段性自测",
    ];
    return `${subject.name} · ${templates[index % templates.length]}`;
}

export function buildWeeklyTaskSuggestions(profile, issues = [], currentEnergy = "normal", occupiedBlocks = []) {
    const subjects = (profile.subjects || []).slice().sort((a, b) => getSubjectPriority(b) - getSubjectPriority(a));
    const freeSlots = collectCurrentWeekFreeSlots(profile.schedule || {}, occupiedBlocks);
    const unresolved = issues.filter((i) => i.status !== "resolved");
    const issueBySubject = unresolved.reduce((acc, item) => {
        if (!acc[item.subject]) acc[item.subject] = [];
        acc[item.subject].push(item);
        return acc;
    }, {});

    if (subjects.length === 0 || freeSlots.length === 0) return [];

    const quotas = {};
    subjects.forEach((s) => {
        const baseQuota = Number(s.weeklyHours || 0) > 0 ? Number(s.weeklyHours) : (s.base === "weak" ? 4 : s.base === "medium" ? 3 : 2);
        quotas[s.id] = Math.max(2, Math.min(baseQuota, 7));
    });

    const tasks = [];
    let subjectIndex = 0;
    let loopGuard = 0;

    freeSlots.forEach((slot, slotIndex) => {
        loopGuard = 0;
        while (subjects.length > 0 && quotas[subjects[subjectIndex % subjects.length].id] <= 0 && loopGuard < subjects.length + 1) {
            subjectIndex += 1;
            loopGuard += 1;
        }

        const subject = subjects[subjectIndex % subjects.length];
        if (!subject || quotas[subject.id] <= 0) return;

        const issueText = issueBySubject[subject.name]?.length ? issueBySubject[subject.name].shift()?.content : "";
        const basePriority = getSubjectPriority(subject);
        const hardPreferred = slot.slot === "morning";
        const lowEnergy = currentEnergy === "low" || currentEnergy === "empty";

        let difficulty = hardPreferred ? "hard" : slot.slot === "afternoon" ? "medium" : "easy";
        if (subject.base === "strong" && difficulty === "hard") difficulty = "medium";
        if (lowEnergy && difficulty === "hard") difficulty = "medium";

        let priority = "medium";
        if (basePriority >= 40) priority = "high";
        else if (basePriority <= 18) priority = "low";

        tasks.push({
            id: uid(),
            title: taskTemplate(subject, slotIndex, issueText),
            subject: subject.name,
            priority,
            difficulty,
            deadline: subject.examDate || "",
            plannedDate: slot.date,
            slot: slot.slot,
            done: false,
            source: "ai",
            blocked: false,
            createdAt: today(),
            masteryExpected: subject.base === "weak" ? "understand" : "grasp",
            note: issueText ? `来自卡点反馈：${issueText}` : (subject.focus || ""),
        });

        quotas[subject.id] -= 1;
        subjectIndex += 1;
    });

    return tasks;
}

export function getEnergyAdvice(level) {
    const current = getEnergyInfo(level);
    if (level === "full" || level === "high") {
        return {
            shouldRest: false,
            tips: ["优先推进主线章节", "趁状态好先做最难的一项", current.suggest],
        };
    }
    if (level === "normal") {
        return {
            shouldRest: false,
            tips: ["先做一项 30~60 分钟的明确任务", "可以切换到整理或巩固任务", current.suggest],
        };
    }
    if (level === "low") {
        return {
            shouldRest: true,
            tips: ["先休息 10~20 分钟", "改做复习、错题整理、笔记归纳", current.suggest],
        };
    }
    return {
        shouldRest: true,
        tips: ["先恢复状态，再安排任务", "不建议硬扛高难度内容", current.suggest],
    };
}

export function recommendWhatToDo(tasks, currentEnergy) {
    const pending = tasks.filter((t) => !t.done);
    const advice = getEnergyAdvice(currentEnergy);

    if (pending.length === 0) {
        return {
            action: advice.shouldRest ? "rest" : "free",
            message: advice.shouldRest ? "先休息一下" : "今天的计划已经很完整了",
            energyAdvice: advice,
            alternativeTasks: [],
            task: null,
        };
    }

    const scored = pending.map((task) => {
        let score = (PRIORITY[task.priority || "medium"]?.weight || 2) * 10 + (DIFFICULTY[task.difficulty || "medium"]?.weight || 2) * 4;

        if (task.deadline) {
            const days = diffDays(task.deadline, today());
            if (days <= 3) score += 16;
            else if (days <= 7) score += 10;
            else if (days <= 14) score += 5;
        }

        if (task.plannedDate === today()) score += 10;
        if (task.slot === "morning" && (currentEnergy === "full" || currentEnergy === "high")) score += 8;
        if (task.slot === "evening" && (currentEnergy === "low" || currentEnergy === "normal")) score += 4;
        if ((currentEnergy === "low" || currentEnergy === "empty") && task.difficulty === "hard") score -= 12;
        if (task.blocked) score -= 6;

        return { task, score };
    }).sort((a, b) => b.score - a.score);

    const task = scored[0]?.task || null;
    return {
        action: advice.shouldRest && task?.difficulty === "hard" ? "lightWork" : "work",
        message: task ? `建议先做：${task.title}` : "暂无合适任务",
        energyAdvice: advice,
        alternativeTasks: scored.slice(1, 4).map((x) => x.task),
        task,
    };
}

export function replanPendingTasks(tasks, schedule, currentEnergy, occupiedBlocks = []) {
    const pending = tasks.filter((t) => !t.done).sort((a, b) => {
        const p = (PRIORITY[b.priority || "medium"]?.weight || 2) - (PRIORITY[a.priority || "medium"]?.weight || 2);
        if (p !== 0) return p;
        return (DIFFICULTY[b.difficulty || "medium"]?.weight || 2) - (DIFFICULTY[a.difficulty || "medium"]?.weight || 2);
    });

    const freeSlots = collectFreeSlots(schedule, 10, occupiedBlocks);
    const lowEnergy = currentEnergy === "low" || currentEnergy === "empty";
    const assignmentMap = {};
    let pointer = 0;

    pending.forEach((task) => {
        let selectedSlot = freeSlots[pointer];
        if (!selectedSlot) return;

        if (lowEnergy && task.difficulty === "hard") {
            const betterSlotIndex = freeSlots.findIndex((slot, idx) => idx >= pointer && slot.slot !== "evening");
            if (betterSlotIndex >= 0) {
                selectedSlot = freeSlots[betterSlotIndex];
                pointer = betterSlotIndex;
            }
        }

        assignmentMap[task.id] = {
            plannedDate: selectedSlot.date,
            slot: selectedSlot.slot,
        };
        pointer += 1;
    });

    return tasks.map((task) => {
        if (task.done || !assignmentMap[task.id]) return task;
        return {
            ...task,
            plannedDate: assignmentMap[task.id].plannedDate,
            slot: assignmentMap[task.id].slot,
        };
    });
}

export function selectNextTask({
    tasks,
    currentEnergy,
    schedule,
    occupiedBlocks = [],
    profileSignals = {},
    now = new Date(),
}) {
    const dateKey = toDateKey(now, { fallback: today(), clampPast: false });
    const dayKey = getWeekdayKey(now);
    const hour = now.getHours() + now.getMinutes() / 60;

    const candidates = hour < 6
        ? ["morning", "afternoon", "evening"]
        : hour < 12
            ? ["morning", "afternoon", "evening"]
            : hour < 18
                ? ["afternoon", "evening"]
                : hour < 23
                    ? ["evening"]
                    : [];

    const isSlotFree = (slotKey) => schedule?.[`${dayKey}-${slotKey}`] === "free" && !isOccupiedSlot(occupiedBlocks, dateKey, slotKey);
    const slotKey = candidates.find((k) => isSlotFree(k)) || "";

    const pending = (tasks || []).filter((t) => !t.done && t.plannedDate);
    const advice = getEnergyAdvice(currentEnergy);

    if (!slotKey) {
        return {
            action: advice.shouldRest ? "rest" : "free",
            message: advice.shouldRest ? "先休息一下" : "当前没有可用学习时段",
            energyAdvice: advice,
            alternativeTasks: [],
            task: null,
        };
    }

    const todaySlotTasks = pending.filter((t) => t.plannedDate === dateKey && (t.slot || "evening") === slotKey);
    const todayTasks = pending.filter((t) => t.plannedDate === dateKey);
    const pool = todaySlotTasks.length > 0 ? todaySlotTasks : (todayTasks.length > 0 ? todayTasks : pending);

    if (pool.length === 0) {
        return {
            action: advice.shouldRest ? "rest" : "free",
            message: advice.shouldRest ? "先休息一下" : "暂无可执行任务",
            energyAdvice: advice,
            alternativeTasks: [],
            task: null,
        };
    }

    const bySubject = profileSignals?.bySubject || {};
    const scored = pool.map((task) => {
        let score = (PRIORITY[task.priority || "medium"]?.weight || 2) * 10 + (DIFFICULTY[task.difficulty || "medium"]?.weight || 2) * 4;

        if (task.deadline) {
            const days = diffDays(task.deadline, dateKey);
            if (days <= 3) score += 16;
            else if (days <= 7) score += 10;
            else if (days <= 14) score += 5;
        }

        if (task.plannedDate === today()) score += 10;
        if (task.slot === "morning" && (currentEnergy === "full" || currentEnergy === "high")) score += 8;
        if (task.slot === "evening" && (currentEnergy === "low" || currentEnergy === "normal")) score += 4;
        if ((currentEnergy === "low" || currentEnergy === "empty") && task.difficulty === "hard") score -= 12;
        if (task.blocked) score -= 6;

        const subjectSignal = bySubject[task.subject || "未分类"];
        if (subjectSignal?.blockage) score -= 4;

        return { task, score };
    }).sort((a, b) => b.score - a.score);

    const chosen = scored[0]?.task || null;
    return {
        action: advice.shouldRest && chosen?.difficulty === "hard" ? "lightWork" : "work",
        message: chosen ? `建议先做：${chosen.title}` : "暂无合适任务",
        energyAdvice: advice,
        alternativeTasks: scored.slice(1, 4).map((x) => x.task),
        task: chosen,
    };
}

export function createReviewItem(subject, topic) {
    const nextDate = addDays(SR_INTERVALS[0]);
    return {
        id: uid(),
        topic,
        subject,
        learnDate: today(),
        nextDate: toDateKey(nextDate, { fallback: today(), clampPast: false }),
        count: 0,
        done: false,
    };
}

export function playBellSound() {
    if (typeof window === "undefined") return;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    try {
        const ctx = new AudioCtx();
        const tones = [880, 1174, 1568];
        const now = ctx.currentTime;

        tones.forEach((freq, index) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, now + index * 0.16);
            gain.gain.setValueAtTime(0.0001, now + index * 0.16);
            gain.gain.exponentialRampToValueAtTime(0.18, now + index * 0.16 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.16 + 0.22);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + index * 0.16);
            osc.stop(now + index * 0.16 + 0.24);
        });

        setTimeout(() => {
            if (ctx.state !== "closed") ctx.close();
        }, 1200);
    } catch {
        return;
    }
}

export function getSubjectSummary(records) {
    const map = {};
    records.forEach((r) => {
        const key = r.subject || "未分类";
        if (!map[key]) map[key] = { subject: key, minutes: 0, sessions: 0 };
        map[key].minutes += Number(r.minutes || 0);
        map[key].sessions += 1;
    });
    return Object.values(map).sort((a, b) => b.minutes - a.minutes);
}

export function getLastNDaysStudyData(records, days = 7) {
    return Array.from({ length: days }, (_, index) => {
        const date = addDays(index - (days - 1));
        const dateStr = normalizeRecordDate(date);
        const minutes = records
            .filter((item) => normalizeRecordDate(item.date) === dateStr)
            .reduce((sum, item) => sum + Number(item.minutes || 0), 0);

        return {
            date: dateStr,
            label: `${date.getMonth() + 1}/${date.getDate()}`,
            minutes,
        };
    });
}
