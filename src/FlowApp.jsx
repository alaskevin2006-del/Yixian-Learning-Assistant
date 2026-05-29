import { useEffect, useMemo, useState } from "react";
import AuthPanel from "./components/AuthPanel";
import { Sidebar } from "./components/layout/Sidebar";
import { ActionDialog, FinishModal, PublicUploadModal, RenameDialog, ResourcePreviewModal, SourceModal, TaskDetailModal, TimerModal, UpdatePlanModal } from "./components/modals/FlowModals";
import { ChatView, FreeChatView } from "./features/chat/ChatViews";
import { LibraryView } from "./features/library/LibraryView";
import { PlanView } from "./features/planning/PlanView";
import { NewSubjectView, SubjectView } from "./features/subjects/SubjectViews";
import { SettingsView } from "./features/settings/SettingsView";
import { chatWithAI } from "./services/aiApi";
import { supabase } from "./services/supabaseClient";
import { retrieveContext } from "./services/resourceApi";
import { usePublicResourceLibrary } from "./hooks/usePublicResourceLibrary";
import {
    addConversationMessage,
    createConversation,
    listConversationMessages,
    listConversations,
    updateConversation,
} from "./services/conversationApi";
import {
    createLearningReview,
    createLearningTask,
    createStudySession,
    listLearningTasks,
    updateLearningTask,
} from "./services/learningDataApi";
import {
    archiveSubject,
    createSubject as createSubjectRecord,
    listSubjects,
    updateSubject as updateSubjectRecord,
} from "./services/subjectApi";
import {
    addSubjectResource as addSubjectResourceRecord,
    listSubjectResources,
    removeSubjectResource as removeSubjectResourceRecord,
} from "./services/subjectResourceApi";
import { listSubjectReviews, upsertSubjectReview } from "./services/reviewApi";
import { listPlanningDrafts, updatePlanningDraft, upsertPlanningDraft } from "./services/planningDraftApi";
import {
    createPrivateResourceSignedUrl,
    listPrivateResources,
    uploadPrivateResource,
} from "./services/privateResourceApi";
import "./FlowApp.css";

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const todayKey = () => new Date().toISOString().slice(0, 10);
const DEMO_SOURCE = "demo";
const DEMO_SUBJECT_ID = "subject-demo";
const DEMO_SUBJECT_NAME = "范例：机器学习导论";
const DEMO_PLAN_THEME = "范例：机器学习导论期末复习";
const DEMO_PLANNING_ID = "conv-demo-ml-final";
const DEMO_SUBJECT_CONVERSATION_ID = "subject-conv-demo-ml-final";
const DEMO_GOAL = "两周内完成机器学习导论期末复习，重点掌握监督学习、模型评估、神经网络基础，并完成一份复习总结。";

const DEFAULT_SUBJECTS = [
    {
        id: DEMO_SUBJECT_ID,
        name: DEMO_SUBJECT_NAME,
        instruction: "范例学科空间：围绕机器学习导论期末复习，回答时优先结合监督学习、模型评估、神经网络基础、往年题和复习总结资料。",
        source: DEMO_SOURCE,
        isDemo: true,
    },
];

function readLocal(key, fallback) {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function writeLocal(key, value) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Best effort local state.
    }
}

function useLocalState(key, fallback) {
    const [value, setValue] = useState(() => readLocal(key, fallback));
    useEffect(() => writeLocal(key, value), [key, value]);
    return [value, setValue];
}

function oneLine(value, max = 24) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max)}...` : text;
}

function makeConversation(title = "新对话") {
    return {
        id: `conv-${uid()}`,
        title,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

function isBlankConversationTitle(title = "") {
    return ["新对话", "规划对话", "新建规划对话"].includes(String(title || "").trim());
}

function localDateKey(offsetDays = 0) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offsetDays);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function timeRangeFor(index) {
    const ranges = [
        ["09:00", "10:30"],
        ["10:30", "12:00"],
        ["14:00", "15:30"],
        ["15:30", "17:00"],
        ["19:00", "20:30"],
        ["20:30", "22:00"],
    ];
    return ranges[index % ranges.length];
}

function isDemoItem(item = {}) {
    const id = String(item?.id || item?.resourceId || item?.resource_id || "");
    return item?.source === DEMO_SOURCE
        || item?.isDemo === true
        || id === DEMO_SUBJECT_ID
        || id.startsWith("conv-demo-")
        || id.startsWith("subject-conv-demo-")
        || id.startsWith("draft-demo-")
        || id.startsWith("task-demo-")
        || id.startsWith("resource-demo-");
}

function displayItems(items = [], demoItems = []) {
    const list = Array.isArray(items) ? items : [];
    const realItems = list.filter((item) => !isDemoItem(item));
    if (realItems.length > 0) return realItems;
    return list.length > 0 ? list : demoItems;
}

function demoTimestamp(offsetDays = 0, time = "09:00") {
    return `${localDateKey(offsetDays)}T${time}:00`;
}

function demoPlanningConversations() {
    return [{
        id: DEMO_PLANNING_ID,
        title: DEMO_PLAN_THEME,
        createdAt: demoTimestamp(-1, "09:00"),
        updatedAt: demoTimestamp(0, "09:20"),
        source: DEMO_SOURCE,
        isDemo: true,
    }];
}

function demoSubjectConversations() {
    return [{
        id: DEMO_SUBJECT_CONVERSATION_ID,
        title: "范例：薄弱知识点诊断",
        createdAt: demoTimestamp(-1, "20:00"),
        updatedAt: demoTimestamp(0, "20:20"),
        source: DEMO_SOURCE,
        isDemo: true,
    }];
}

function demoPlanningMessages() {
    return [
        {
            id: "msg-demo-planning-user-goal",
            role: "user",
            content: DEMO_GOAL,
        },
        {
            id: "msg-demo-planning-assistant-breakdown",
            role: "assistant",
            content: "可以拆成五个环节：先梳理监督学习核心概念，再复习线性回归与逻辑回归；中段完成模型评估指标对比表；最后用一套往年题检验掌握度，并把错题与薄弱点整理成复习总结。",
        },
        {
            id: "msg-demo-planning-user-weakness",
            role: "user",
            content: "我对 precision、recall、F1 和 ROC-AUC 的适用场景容易混淆，神经网络反向传播也只记得公式。",
        },
        {
            id: "msg-demo-planning-assistant-plan",
            role: "assistant",
            content: "我会把模型评估单独安排成对比表任务，并把神经网络基础放在轻量回顾时段。每个任务都保留可交付成果，方便你在任务安排和学习日程里直接开始计时。",
        },
    ];
}

function demoSubjectMessages() {
    return [
        {
            id: "msg-demo-subject-user",
            role: "user",
            content: "我已经看完监督学习讲义，但还不能判断不同评估指标该怎么选。",
        },
        {
            id: "msg-demo-subject-assistant",
            role: "assistant",
            content: "建议从分类任务目标出发：类别不均衡时优先看 precision、recall 和 F1；需要比较排序能力时看 ROC-AUC；如果考试要求解释业务代价，可以补充混淆矩阵说明。",
        },
    ];
}

function demoPlanningDrafts(conversationId = DEMO_PLANNING_ID) {
    const subject = DEMO_SUBJECT_NAME;
    return [
        {
            id: "draft-demo-supervised-concepts",
            conversationId,
            title: "范例：整理监督学习核心概念",
            date: localDateKey(0),
            start: "09:00",
            end: "10:30",
            subject,
            time: `${localDateKey(0)} 09:00-10:30`,
            description: "梳理特征、标签、训练集、验证集、泛化误差、过拟合与正则化，输出一页复习提纲。",
            status: "draft",
            source: DEMO_SOURCE,
            isDemo: true,
        },
        {
            id: "draft-demo-regression-review",
            conversationId,
            title: "范例：复习线性回归与逻辑回归",
            date: localDateKey(1),
            start: "15:00",
            end: "16:30",
            subject,
            time: `${localDateKey(1)} 15:00-16:30`,
            description: "对比损失函数、决策边界、梯度下降和常见正则项，补齐推导与应用场景。",
            status: "draft",
            source: DEMO_SOURCE,
            isDemo: true,
        },
        {
            id: "draft-demo-metrics-table",
            conversationId,
            title: "范例：完成模型评估指标对比表",
            date: localDateKey(2),
            start: "20:00",
            end: "21:00",
            subject,
            time: `${localDateKey(2)} 20:00-21:00`,
            description: "制作 accuracy、precision、recall、F1、ROC-AUC 的适用场景、优缺点和考试例题对照表。",
            status: "draft",
            source: DEMO_SOURCE,
            isDemo: true,
        },
        {
            id: "draft-demo-past-paper",
            conversationId,
            title: "范例：做一套往年题",
            date: localDateKey(3),
            start: "14:30",
            end: "16:30",
            subject,
            time: `${localDateKey(3)} 14:30-16:30`,
            description: "按考试时间完成一套样题，标注不确定题目和需要回看讲义的位置。",
            status: "draft",
            source: DEMO_SOURCE,
            isDemo: true,
        },
        {
            id: "draft-demo-mistake-summary",
            conversationId,
            title: "范例：总结错题与薄弱点",
            date: localDateKey(0),
            start: "22:30",
            end: "23:10",
            subject,
            time: `${localDateKey(0)} 22:30-23:10`,
            description: "把往年题错因归类到概念、公式、建模和计算四类，并生成最后一轮复习清单。",
            status: "draft",
            source: DEMO_SOURCE,
            isDemo: true,
        },
    ];
}

function demoLearningTasks() {
    const subject = DEMO_SUBJECT_NAME;
    return [
        {
            id: "task-demo-supervised-concepts",
            title: "范例：整理监督学习核心概念",
            subject,
            date: localDateKey(0),
            start: "09:00",
            end: "10:30",
            description: "输出一页监督学习概念提纲，标注容易混淆的定义。",
            status: "doing",
            priority: "high",
            plannedDate: localDateKey(0),
            startTime: "09:00",
            endTime: "10:30",
            source: DEMO_SOURCE,
            isDemo: true,
        },
        {
            id: "task-demo-regression-review",
            title: "范例：复习线性回归与逻辑回归",
            subject,
            date: localDateKey(1),
            start: "15:00",
            end: "16:30",
            description: "整理两类模型的目标函数、训练方式和考试高频问法。",
            status: "pending",
            priority: "high",
            plannedDate: localDateKey(1),
            startTime: "15:00",
            endTime: "16:30",
            source: DEMO_SOURCE,
            isDemo: true,
        },
        {
            id: "task-demo-metrics-table",
            title: "范例：完成模型评估指标对比表",
            subject,
            date: localDateKey(2),
            start: "20:00",
            end: "21:00",
            description: "用表格对比 accuracy、precision、recall、F1、ROC-AUC。",
            status: "pending",
            priority: "medium",
            plannedDate: localDateKey(2),
            startTime: "20:00",
            endTime: "21:00",
            source: DEMO_SOURCE,
            isDemo: true,
        },
        {
            id: "task-demo-past-paper",
            title: "范例：做一套往年题",
            subject,
            date: localDateKey(3),
            start: "14:30",
            end: "16:30",
            description: "模拟考试节奏完成样题，并记录不会的题型。",
            status: "pending",
            priority: "high",
            plannedDate: localDateKey(3),
            startTime: "14:30",
            endTime: "16:30",
            source: DEMO_SOURCE,
            isDemo: true,
        },
        {
            id: "task-demo-mistake-summary",
            title: "范例：总结错题与薄弱点",
            subject,
            date: localDateKey(0),
            start: "22:30",
            end: "23:10",
            description: "轻量复盘错题原因，形成最后一轮复习清单。",
            status: "pending",
            priority: "medium",
            plannedDate: localDateKey(0),
            startTime: "22:30",
            endTime: "23:10",
            source: DEMO_SOURCE,
            isDemo: true,
        },
    ];
}

function demoSubjectResources() {
    return [
        {
            id: "resource-demo-supervised-learning",
            scope: "public",
            title: "范例：课程讲义：监督学习基础",
            resourceId: "resource-demo-supervised-learning",
            chunkId: "lecture-01",
            contentPreview: "监督学习的基本流程：数据划分、特征工程、模型训练、验证集调参与泛化误差评估。",
            fileType: "PDF",
            source: DEMO_SOURCE,
            isDemo: true,
        },
        {
            id: "resource-demo-metrics-note",
            scope: "public",
            title: "范例：笔记：模型评估指标",
            resourceId: "resource-demo-metrics-note",
            chunkId: "note-01",
            contentPreview: "混淆矩阵、accuracy、precision、recall、F1 与 ROC-AUC 的选择逻辑和考试答题模板。",
            fileType: "MD",
            source: DEMO_SOURCE,
            isDemo: true,
        },
        {
            id: "resource-demo-past-paper",
            scope: "public",
            title: "范例：往年题：机器学习导论期末样题",
            resourceId: "resource-demo-past-paper",
            chunkId: "exam-01",
            contentPreview: "包含监督学习、线性模型、模型评估和神经网络基础的综合样题。",
            fileType: "PDF",
            source: DEMO_SOURCE,
            isDemo: true,
        },
        {
            id: "resource-demo-neural-network-sheet",
            scope: "public",
            title: "范例：总结：神经网络基础速查表",
            resourceId: "resource-demo-neural-network-sheet",
            chunkId: "summary-01",
            contentPreview: "前向传播、损失函数、反向传播、激活函数和过拟合控制的速查清单。",
            fileType: "MD",
            source: DEMO_SOURCE,
            isDemo: true,
        },
    ];
}

function demoSubjectReviews() {
    return [{
        id: "review-demo-ml-final",
        original: "范例：模型评估指标容易混淆，尤其是不平衡分类场景下 precision 与 recall 的取舍。",
        harvest: "范例：用业务目标判断指标，先看漏报/误报代价，再选择 F1、ROC-AUC 或混淆矩阵解释。",
        status: "confirmed",
        conversationId: DEMO_SUBJECT_CONVERSATION_ID,
        source: DEMO_SOURCE,
        isDemo: true,
    }];
}

function dateFromValue(value) {
    if (!value) return "";
    const text = String(value);
    const match = text.match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : "";
}

function timeFromValue(value) {
    if (!value) return "";
    const text = String(value);
    const match = text.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
    return match ? match[0] : "";
}

function toLocalTask(row) {
    const meta = row?.metadata || {};
    const slot = String(row?.slot || meta.slot || "");
    const [slotStart = "", slotEnd = ""] = slot.split("-");
    return {
        id: row?.client_id || row?.clientId || row?.id || `task-${uid()}`,
        remoteId: row?.id || "",
        title: row?.title || meta.title || "学习任务",
        subject: row?.subject || meta.subject || "",
        subjectId: row?.subject_id || row?.subjectId || "",
        date: row?.planned_date || row?.plannedDate || meta.date || todayKey(),
        start: meta.start || meta.startTime || slotStart || "19:00",
        end: meta.end || meta.endTime || slotEnd || "20:00",
        description: row?.description || meta.description || "",
        status: row?.status || "pending",
        plannedDate: row?.planned_date || row?.plannedDate || meta.date || todayKey(),
        source: row?.source || meta.source || "sync",
    };
}

function toLocalDraft(row, subjects = []) {
    const meta = row?.metadata || {};
    const subject = subjects.find((item) => item.id === row?.subjectId || item.id === row?.subject_id);
    const plannedStart = row?.plannedStart || row?.planned_start || "";
    const plannedEnd = row?.plannedEnd || row?.planned_end || "";
    const date = dateFromValue(plannedStart) || meta.date || todayKey();
    const start = timeFromValue(plannedStart) || meta.start || "19:00";
    const end = timeFromValue(plannedEnd) || meta.end || "20:00";
    return {
        id: row?.id || `draft-${uid()}`,
        conversationId: row?.conversationId || row?.planning_conversation_id || "",
        title: row?.title || "学习任务",
        date,
        start,
        end,
        subject: meta.subject || subject?.name || "",
        subjectId: row?.subjectId || row?.subject_id || "",
        time: `${date} ${start}-${end}`,
        description: row?.description || "",
        status: row?.status || "draft",
        remoteId: row?.id || "",
    };
}

function toLocalResource(row) {
    const meta = row?.metadata || {};
    return {
        id: row?.id || `resource-${uid()}`,
        scope: row?.scope || row?.resource_scope || "public",
        title: meta.title || row?.title || row?.resourceId || row?.resource_id || "资料",
        resourceId: row?.resourceId || row?.resource_id || row?.id || "",
        chunkId: meta.chunkId || "",
        contentPreview: meta.contentPreview || "",
        fileType: meta.fileType || "",
    };
}

function toLocalReview(row) {
    return {
        id: row?.id || `review-${uid()}`,
        original: row?.originalText || row?.original_text || "",
        harvest: row?.harvestText || row?.harvest_text || row?.polishedText || row?.polished_text || "",
        status: row?.status || "pending",
        conversationId: row?.conversationId || row?.conversation_id || "",
    };
}

function splitPlanningText(text) {
    const source = String(text || "").trim();
    if (!source) return [];
    const dayBlocks = source.match(/(?:第[一二三四五六七八九十\d]+天|Day\s*\d+)[\s\S]*?(?=(?:第[一二三四五六七八九十\d]+天|Day\s*\d+)|$)/gi) || [];
    if (dayBlocks.length > 1) return dayBlocks;
    const bulletLines = source
        .split(/\n+/)
        .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.、]|[一二三四五六七八九十]+[、.])\s*/, "").trim())
        .filter((line) => line.length >= 10 && /目标|小时|复习|练习|题|概念|方法|总结|安排|学习|掌握|完成/.test(line));
    if (bulletLines.length > 1) return bulletLines.slice(0, 6);
    if (/两天|2天|二天/.test(source)) return ["第一天：基础概念与核心方法", "第二天：综合练习与复盘巩固"];
    return [source];
}

export default function FlowApp() {
    const [view, setView] = useLocalState("flow.view", "plan");
    const [planTab, setPlanTab] = useLocalState("flow.planTab", "ai");
    const [subjectTab, setSubjectTab] = useLocalState("flow.subjectTab", "chat");
    const [chatTab, setChatTab] = useLocalState("flow.chatTab", "chat");
    const [subjects, setSubjects] = useLocalState("flow.subjects", DEFAULT_SUBJECTS);
    const [activeSubjectId, setActiveSubjectId] = useLocalState("flow.activeSubjectId", DEFAULT_SUBJECTS[0].id);
    const [freeConversations, setFreeConversations] = useLocalState("flow.freeConversations", []);
    const [subjectConversations, setSubjectConversations] = useLocalState("flow.subjectConversations", {});
    const [planningConversations, setPlanningConversations] = useLocalState("flow.planningConversations", demoPlanningConversations());
    const [activeFreeId, setActiveFreeId] = useLocalState("flow.activeFreeId", "");
    const [activePlanningId, setActivePlanningId] = useLocalState("flow.activePlanningId", DEMO_PLANNING_ID);
    const [activeSubjectConversationId, setActiveSubjectConversationId] = useLocalState("flow.activeSubjectConversationId", "");
    const [messages, setMessages] = useLocalState("flow.messages", {});
    const [draftsByConversation, setDraftsByConversation] = useLocalState("flow.draftsByConversation", {});
    const [tasks, setTasks] = useLocalState("flow.tasks", []);
    const [subjectResources, setSubjectResources] = useLocalState("flow.subjectResources", {});
    const [subjectReviews, setSubjectReviews] = useLocalState("flow.subjectReviews", {});
    const [privateResources, setPrivateResources] = useState([]);
    const [modal, setModal] = useState("");
    const [actionDialog, setActionDialog] = useState(null);
    const [renameDialog, setRenameDialog] = useState(null);
    const [sourceQuery, setSourceQuery] = useState("");
    const [sourceResults, setSourceResults] = useState([]);
    const [selectedReferences, setSelectedReferences] = useLocalState("flow.selectedReferences", []);
    const webEnabled = true;
    const setWebEnabled = () => {};
    const [aiStatus, setAiStatus] = useState("idle");
    const [aiError, setAiError] = useState("");
    const {
        publicResources,
        libraryQuery,
        setLibraryQuery,
        previewResource,
        setPreviewResource,
        publicUploadOpen,
        setPublicUploadOpen,
        publicUploadJob,
        searchLibrary,
        openPublicResource,
        downloadPublicResource,
        uploadPublicResource,
    } = usePublicResourceLibrary();
    const [authOpen, setAuthOpen] = useState(false);
    const [authMode, setAuthMode] = useState("login");
    const [session, setSession] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [input, setInput] = useState("");
    const [taskForm, setTaskForm] = useState({
        title: "",
        subject: "",
        date: todayKey(),
        start: "19:00",
        end: "20:00",
        description: "",
    });
    const [newSubject, setNewSubject] = useState({ name: "", instruction: "" });
    const [notice, setNotice] = useState("");
    const [timer, setTimer] = useState({
        running: false,
        startedAt: "",
        elapsed: "00:00",
        taskTitle: "",
        subject: "",
        taskId: "",
        taskRemoteId: "",
        subjectId: "",
        isDemoTask: false,
    });
    const [finishForm, setFinishForm] = useState({ status: "done", note: "" });

    const displaySubjects = displayItems(subjects, DEFAULT_SUBJECTS);
    const displayPlanningConversations = displayItems(planningConversations, demoPlanningConversations());
    const activeSubject = useMemo(
        () => displaySubjects.find((subject) => subject.id === activeSubjectId) || displaySubjects[0] || DEFAULT_SUBJECTS[0],
        [activeSubjectId, displaySubjects],
    );
    const activePlanningConversation = displayPlanningConversations.find((item) => item.id === activePlanningId) || displayPlanningConversations[0];
    const planningConversationId = activePlanningConversation?.id || "";
    const storedDrafts = draftsByConversation[planningConversationId] || [];
    const currentDrafts = isDemoItem(activePlanningConversation)
        ? displayItems(storedDrafts, demoPlanningDrafts(planningConversationId))
        : storedDrafts;
    const storedSubjectConversations = subjectConversations[activeSubject?.id] || [];
    const currentSubjectConversations = isDemoItem(activeSubject)
        ? displayItems(storedSubjectConversations, demoSubjectConversations())
        : storedSubjectConversations;
    const storedSubjectResources = subjectResources[activeSubject?.id] || [];
    const currentSubjectResources = isDemoItem(activeSubject)
        ? displayItems(storedSubjectResources, demoSubjectResources())
        : storedSubjectResources;
    const storedReviews = subjectReviews[activeSubject?.id] || [];
    const currentReviews = isDemoItem(activeSubject)
        ? displayItems(storedReviews, demoSubjectReviews())
        : storedReviews;
    const displayTasks = displayItems(tasks, demoLearningTasks());
    const freeConversation = freeConversations.find((item) => item.id === activeFreeId);
    const subjectConversation = currentSubjectConversations.find((item) => item.id === activeSubjectConversationId);
    const chatKey = view === "free-chat"
        ? `free:${activeFreeId || "new"}`
        : `subject:${activeSubjectConversationId || activeSubject?.id}`;
    const visibleMessages = messages[chatKey]
        || (isDemoItem(subjectConversation) ? demoSubjectMessages() : []);
    const planningMessages = messages[`planning:${planningConversationId}`]
        || (isDemoItem(activePlanningConversation) ? demoPlanningMessages() : []);

    useEffect(() => {
        setFreeConversations((prev) => prev.filter((conversation) => (
            !isBlankConversationTitle(conversation.title) || (messages[`free:${conversation.id}`] || []).length > 0
        )));
        setSubjectConversations((prev) => Object.fromEntries(Object.entries(prev).map(([subjectId, list]) => [
            subjectId,
            (list || []).filter((conversation) => (
                !isBlankConversationTitle(conversation.title) || (messages[`subject:${conversation.id}`] || []).length > 0
            )),
        ])));
        setPlanningConversations((prev) => prev.filter((conversation) => (
            !isBlankConversationTitle(conversation.title)
            || (messages[`planning:${conversation.id}`] || []).length > 0
            || (draftsByConversation[conversation.id] || []).length > 0
        )));
    // Run once on startup to clear stale empty local rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!activePlanningId && planningConversations[0]) {
            setActivePlanningId(planningConversations[0].id);
        }
    }, [activePlanningId, planningConversations, setActivePlanningId]);

    useEffect(() => {
        setSubjects((prev) => {
            let changed = false;
            const next = prev.map((subject) => {
                if (subject.id === "subject-vision" || subject.name === "视力学" || subject.name === "示例学科" || isDemoItem(subject)) {
                    changed = true;
                    return {
                        ...DEFAULT_SUBJECTS[0],
                        id: DEMO_SUBJECT_ID,
                    };
                }
                return subject;
            });
            return changed ? next : prev;
        });
        if (activeSubjectId === "subject-vision") setActiveSubjectId(DEMO_SUBJECT_ID);
    }, [activeSubjectId, setActiveSubjectId, setSubjects]);

    useEffect(() => {
        if (!supabase) return undefined;
        let active = true;
        supabase.auth.getSession().then(({ data }) => {
            if (!active) return;
            setSession(data?.session || null);
            setCurrentUser(data?.session?.user || null);
        });
        const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            setSession(nextSession || null);
            setCurrentUser(nextSession?.user || null);
        });
        return () => {
            active = false;
            data?.subscription?.unsubscribe?.();
        };
    }, []);

    useEffect(() => {
        if (!timer.running || !timer.startedAt) return undefined;
        const id = window.setInterval(() => {
            const seconds = Math.max(0, Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000));
            const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
            const ss = String(seconds % 60).padStart(2, "0");
            setTimer((prev) => ({ ...prev, elapsed: `${mm}:${ss}` }));
        }, 1000);
        return () => window.clearInterval(id);
    }, [timer.running, timer.startedAt]);

    useEffect(() => {
        if (!currentUser) return;
        listPrivateResources(currentUser.id)
            .then(setPrivateResources)
            .catch(() => setPrivateResources([]));
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser?.id) return;
        let alive = true;
        Promise.all([
            listSubjects({ userId: currentUser.id }).catch(() => []),
            listConversations({ userId: currentUser.id, type: "free", limit: 20 }).catch(() => []),
            listConversations({ userId: currentUser.id, type: "planning", limit: 20 }).catch(() => []),
        ]).then(async ([subjectRows, freeRows, planningRows]) => {
            if (!alive) return;
            if (subjectRows.length) {
                setSubjects(subjectRows.map((item) => ({
                    id: item.id,
                    name: item.name,
                    instruction: item.instruction || "",
                })));
                if (!subjectRows.some((item) => item.id === activeSubjectId)) {
                    setActiveSubjectId(subjectRows[0].id);
                }
            }
            if (freeRows.length) {
                setFreeConversations(freeRows.filter((item) => !isBlankConversationTitle(item.title)).map((item) => ({
                    id: item.id,
                    title: item.title || "最近对话",
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                })));
            }
            if (planningRows.length) {
                setPlanningConversations(planningRows.filter((item) => !isBlankConversationTitle(item.title)).map((item) => ({
                    id: item.id,
                    title: item.title || "规划对话",
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                })));
                if (!activePlanningId) setActivePlanningId(planningRows[0].id);
            }
        });
        return () => { alive = false; };
    }, [activePlanningId, activeSubjectId, currentUser?.id, setActivePlanningId, setActiveSubjectId, setFreeConversations, setPlanningConversations, setSubjects]);

    useEffect(() => {
        if (!currentUser?.id) return;
        listLearningTasks({ userId: currentUser.id, limit: 200 })
            .then((rows) => {
                if (!rows.length) return;
                setTasks(rows.map(toLocalTask));
            })
            .catch(() => null);
    }, [currentUser?.id, setTasks]);

    useEffect(() => {
        if (!currentUser?.id || !activeSubject?.id || String(activeSubject.id).startsWith("subject-")) return;
        let alive = true;
        Promise.all([
            listConversations({ userId: currentUser.id, type: "subject", subjectId: activeSubject.id, limit: 40 }).catch(() => []),
            listSubjectResources(activeSubject.id, { userId: currentUser.id }).catch(() => []),
            listSubjectReviews(activeSubject.id, { userId: currentUser.id }).catch(() => []),
        ]).then(([conversationRows, resourceRows, reviewRows]) => {
            if (!alive) return;
            setSubjectConversations((prev) => ({
                ...prev,
                [activeSubject.id]: conversationRows.map((item) => ({
                    id: item.id,
                    title: item.title,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                })),
            }));
            setSubjectResources((prev) => ({
                ...prev,
                [activeSubject.id]: resourceRows.map(toLocalResource),
            }));
            setSubjectReviews((prev) => ({
                ...prev,
                [activeSubject.id]: reviewRows.map(toLocalReview),
            }));
        });
        return () => { alive = false; };
    }, [activeSubject?.id, currentUser?.id, setSubjectConversations, setSubjectResources, setSubjectReviews]);

    useEffect(() => {
        if (!currentUser?.id || !planningConversationId || String(planningConversationId).startsWith("conv-")) return;
        listPlanningDrafts(planningConversationId, { userId: currentUser.id })
            .then((rows) => {
                setDraftsByConversation((prev) => ({
                    ...prev,
                    [planningConversationId]: rows.map((row) => toLocalDraft(row, subjects)),
                }));
            })
            .catch(() => null);
    }, [currentUser?.id, planningConversationId, setDraftsByConversation, subjects]);

    useEffect(() => {
        if (!currentUser?.id || !activeFreeId) return;
        listConversationMessages(activeFreeId, { userId: currentUser.id })
            .then((rows) => {
                if (!rows.length) return;
                setMessages((prev) => ({
                    ...prev,
                    [`free:${activeFreeId}`]: rows.map((item) => ({
                        id: item.id,
                        role: item.role,
                        content: item.content || item.text || "",
                        citations: item.citations || [],
                    })),
                }));
            })
            .catch(() => null);
    }, [activeFreeId, currentUser?.id, setMessages]);

    useEffect(() => {
        if (!currentUser?.id || !activeSubjectConversationId) return;
        listConversationMessages(activeSubjectConversationId, { userId: currentUser.id })
            .then((rows) => {
                if (!rows.length) return;
                setMessages((prev) => ({
                    ...prev,
                    [`subject:${activeSubjectConversationId}`]: rows.map((item) => ({
                        id: item.id,
                        role: item.role,
                        content: item.content || item.text || "",
                        citations: item.citations || [],
                    })),
                }));
            })
            .catch(() => null);
    }, [activeSubjectConversationId, currentUser?.id, setMessages]);

    useEffect(() => {
        if (!currentUser?.id || !planningConversationId) return;
        listConversationMessages(planningConversationId, { userId: currentUser.id })
            .then((rows) => {
                if (!rows.length) return;
                setMessages((prev) => ({
                    ...prev,
                    [`planning:${planningConversationId}`]: rows.map((item) => ({
                        id: item.id,
                        role: item.role,
                        content: item.content || item.text || "",
                        citations: item.citations || [],
                    })),
                }));
            })
            .catch(() => null);
    }, [currentUser?.id, planningConversationId, setMessages]);

    function openAuth() {
        setAuthMode("login");
        setAuthOpen(true);
    }

    function isLocalConversationId(id) {
        return String(id || "").startsWith("conv-") || String(id || "").startsWith("subject-conv-");
    }

    async function ensureRemoteConversation(kind, id, title, subjectId = "") {
        if (!currentUser?.id) return id;
        if (id && !isLocalConversationId(id)) return id;
        const remote = await createConversation({
            type: kind,
            subjectId: kind === "subject" ? subjectId : null,
            title: title || (kind === "planning" ? "规划对话" : "新对话"),
        }, { userId: currentUser.id }).catch(() => null);
        if (!remote?.id) return id;
        const next = {
            id: remote.id,
            title: remote.title || title,
            createdAt: remote.createdAt,
            updatedAt: remote.updatedAt,
        };
        if (kind === "free") {
            setFreeConversations((prev) => prev.map((item) => (item.id === id ? next : item)));
            setActiveFreeId(remote.id);
            setMessages((prev) => {
                const oldKey = `free:${id}`;
                const newKey = `free:${remote.id}`;
                if (!prev[oldKey]) return prev;
                const nextMessages = { ...prev, [newKey]: prev[oldKey] };
                delete nextMessages[oldKey];
                return nextMessages;
            });
        } else if (kind === "subject") {
            setSubjectConversations((prev) => ({
                ...prev,
                [subjectId]: (prev[subjectId] || []).map((item) => (item.id === id ? next : item)),
            }));
            setActiveSubjectConversationId(remote.id);
            setMessages((prev) => {
                const oldKey = `subject:${id}`;
                const newKey = `subject:${remote.id}`;
                if (!prev[oldKey]) return prev;
                const nextMessages = { ...prev, [newKey]: prev[oldKey] };
                delete nextMessages[oldKey];
                return nextMessages;
            });
        } else if (kind === "planning") {
            setPlanningConversations((prev) => prev.map((item) => (item.id === id ? next : item)));
            setActivePlanningId(remote.id);
            setDraftsByConversation((prev) => {
                const oldDrafts = prev[id] || [];
                const nextDrafts = { ...prev, [remote.id]: oldDrafts.map((item) => ({ ...item, conversationId: remote.id })) };
                delete nextDrafts[id];
                return nextDrafts;
            });
            setMessages((prev) => {
                const oldKey = `planning:${id}`;
                const newKey = `planning:${remote.id}`;
                if (!prev[oldKey]) return prev;
                const nextMessages = { ...prev, [newKey]: prev[oldKey] };
                delete nextMessages[oldKey];
                return nextMessages;
            });
        }
        return remote.id;
    }

    function openSubject(subjectId) {
        setActiveSubjectId(subjectId);
        setView("subject");
        setSubjectTab("chat");
    }

    function deleteSubject(subjectId) {
        setSubjects((prev) => {
            const next = prev.filter((subject) => subject.id !== subjectId);
            if (activeSubjectId === subjectId && next[0]) setActiveSubjectId(next[0].id);
            return next.length ? next : DEFAULT_SUBJECTS;
        });
        if (currentUser?.id && !String(subjectId).startsWith("subject-")) {
            archiveSubject(subjectId, { userId: currentUser.id }).catch(() => null);
        }
    }

    function newPlanningConversation() {
        const conversation = makeConversation("规划对话");
        setPlanningConversations((prev) => [conversation, ...prev]);
        setActivePlanningId(conversation.id);
        setDraftsByConversation((prev) => ({ ...prev, [conversation.id]: [] }));
    }

    function deletePlanningConversation(id) {
        setPlanningConversations((prev) => {
            const next = prev.filter((item) => item.id !== id);
            if (activePlanningId === id) setActivePlanningId(next[0]?.id || "");
            return next;
        });
        setDraftsByConversation((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
        setMessages((prev) => {
            const next = { ...prev };
            delete next[`planning:${id}`];
            return next;
        });
        if (currentUser?.id && !isLocalConversationId(id)) {
            updateConversation(id, { status: "deleted" }, { userId: currentUser.id }).catch(() => null);
        }
    }

    function newFreeConversation() {
        const isUnstarted = (conversationId) => (messages[`free:${conversationId}`] || []).length === 0;
        if (activeFreeId && isUnstarted(activeFreeId)) {
            setView("free-chat");
            return;
        }
        const existingDraft = freeConversations.find((conversation) => isUnstarted(conversation.id));
        if (existingDraft) {
            setActiveFreeId(existingDraft.id);
            setView("free-chat");
            return;
        }
        const conversation = makeConversation("新对话");
        setFreeConversations((prev) => [conversation, ...prev]);
        setActiveFreeId(conversation.id);
        setMessages((prev) => ({ ...prev, [`free:${conversation.id}`]: [] }));
        setView("free-chat");
    }

    function deleteFreeConversation(id) {
        setFreeConversations((prev) => prev.filter((item) => item.id !== id));
        setMessages((prev) => {
            const next = { ...prev };
            delete next[`free:${id}`];
            return next;
        });
        if (activeFreeId === id) setActiveFreeId("");
        if (currentUser?.id && !isLocalConversationId(id)) {
            updateConversation(id, { status: "deleted" }, { userId: currentUser.id }).catch(() => null);
        }
    }

    function deleteSubjectConversation(id) {
        setSubjectConversations((prev) => Object.fromEntries(Object.entries(prev).map(([subjectId, list]) => [
            subjectId,
            (list || []).filter((item) => item.id !== id),
        ])));
        setMessages((prev) => {
            const next = { ...prev };
            delete next[`subject:${id}`];
            return next;
        });
        if (activeSubjectConversationId === id) setActiveSubjectConversationId("");
        if (currentUser?.id && !isLocalConversationId(id)) {
            updateConversation(id, { status: "deleted" }, { userId: currentUser.id }).catch(() => null);
        }
    }

    function moveFreeConversationToSubject(conversationId, subjectId) {
        const conversation = freeConversations.find((item) => item.id === conversationId);
        if (!conversation) return;
        const moved = {
            ...conversation,
            id: isLocalConversationId(conversation.id) ? `subject-conv-${uid()}` : conversation.id,
            title: conversation.title || "最近对话",
        };
        setSubjectConversations((prev) => ({
            ...prev,
            [subjectId]: [moved, ...(prev[subjectId] || [])],
        }));
        setMessages((prev) => ({
            ...prev,
            [`subject:${moved.id}`]: prev[`free:${conversationId}`] || [],
        }));
        setFreeConversations((prev) => prev.filter((item) => item.id !== conversationId));
        if (activeFreeId === conversationId) setActiveFreeId("");
        setActiveSubjectId(subjectId);
        setActiveSubjectConversationId(moved.id);
        setView("chat");
        if (currentUser?.id && !isLocalConversationId(conversationId)) {
            updateConversation(conversationId, { type: "subject", subjectId, lastMessageAt: new Date().toISOString() }, { userId: currentUser.id }).catch(() => null);
        }
    }

    function startSubjectConversation() {
        const isUnstarted = (conversationId) => (messages[`subject:${conversationId}`] || []).length === 0;
        if (activeSubjectConversationId && isUnstarted(activeSubjectConversationId)) {
            setView("chat");
            return;
        }
        const existingDraft = currentSubjectConversations.find((conversation) => isUnstarted(conversation.id));
        if (existingDraft) {
            setActiveSubjectConversationId(existingDraft.id);
            setView("chat");
            return;
        }
        const conversation = makeConversation(`${activeSubject.name}对话`);
        setSubjectConversations((prev) => ({
            ...prev,
            [activeSubject.id]: [conversation, ...(prev[activeSubject.id] || [])],
        }));
        setActiveSubjectConversationId(conversation.id);
        setView("chat");
    }

    function renameConversation(kind, id, title) {
        const nextTitle = oneLine(title, 28);
        if (!nextTitle) return;
        if (kind === "free") {
            setFreeConversations((prev) => prev.map((item) => (item.id === id ? { ...item, title: nextTitle } : item)));
        } else if (kind === "planning") {
            setPlanningConversations((prev) => prev.map((item) => (item.id === id ? { ...item, title: nextTitle } : item)));
        } else if (kind === "subject") {
            setSubjectConversations((prev) => Object.fromEntries(Object.entries(prev).map(([subjectId, list]) => [
                subjectId,
                (list || []).map((item) => (item.id === id ? { ...item, title: nextTitle } : item)),
            ])));
        }
        if (currentUser?.id && !String(id).startsWith("conv-") && !String(id).startsWith("subject-conv-")) {
            updateConversation(id, { title: nextTitle, lastMessageAt: new Date().toISOString() }, { userId: currentUser.id }).catch(() => null);
        }
    }

    function autoNameConversation(kind, id, text) {
        const title = kind === "free"
            ? freeConversations.find((item) => item.id === id)?.title
            : kind === "planning"
                ? planningConversations.find((item) => item.id === id)?.title
                : Object.values(subjectConversations).flat().find((item) => item.id === id)?.title;
        if (!title || isBlankConversationTitle(title)) {
            renameConversation(kind, id, text);
        }
    }

    function createSubjectFromForm() {
        const name = newSubject.name.trim();
        if (!name) return;
        const subject = {
            id: `subject-${uid()}`,
            name,
            instruction: newSubject.instruction.trim(),
        };
        setSubjects((prev) => [subject, ...prev]);
        setActiveSubjectId(subject.id);
        if (currentUser?.id) {
            createSubjectRecord({ name, instruction: newSubject.instruction.trim() }, { userId: currentUser.id })
                .then((saved) => {
                    setSubjects((prev) => prev.map((item) => (item.id === subject.id ? { ...item, id: saved.id } : item)));
                    setActiveSubjectId(saved.id);
                })
                .catch(() => null);
        }
        setNewSubject({ name: "", instruction: "" });
        setSubjectTab("chat");
        setView("subject");
    }

    function updateActiveSubject(patch) {
        setSubjects((prev) => prev.map((subject) => (
            subject.id === activeSubject.id ? { ...subject, ...patch } : subject
        )));
    }

    function saveActiveSubjectSettings() {
        if (!currentUser?.id || !activeSubject?.id || String(activeSubject.id).startsWith("subject-")) return;
        updateSubjectRecord(activeSubject, { userId: currentUser.id })
            .then((saved) => {
                setSubjects((prev) => prev.map((item) => (item.id === saved.id ? { ...item, ...saved } : item)));
                setNotice("学科设置已保存");
            })
            .catch((error) => setNotice(error?.message || "学科设置保存失败"));
    }

    async function saveConversationMessage(conversationId, message) {
        if (!currentUser?.id || !conversationId || isLocalConversationId(conversationId)) return;
        await addConversationMessage(conversationId, message, { userId: currentUser.id }).catch(() => null);
    }

    async function buildReferenceContext(text) {
        const references = selectedReferences.filter((item) => item?.resourceId || item?.chunkId);
        if (!references.length) return { contextText: "", citations: [] };
        return retrieveContext(text, {
            references,
            scope: "all",
            subjectId: activeSubject?.id,
            maxChars: 6000,
        }).catch(() => ({ contextText: "", citations: [] }));
    }

    function draftsFromAI(rawDrafts, conversationId, fallbackText, replyText = "", defaultSubject = activeSubject?.name) {
        const source = Array.isArray(rawDrafts) && rawDrafts.length
            ? rawDrafts
            : splitPlanningText(replyText || fallbackText).map((part, index) => ({
                title: oneLine(part || fallbackText || "学习任务", 30),
                description: part || fallbackText || "",
                plannedStart: `${localDateKey(index)}T${timeRangeFor(index)[0]}`,
                plannedEnd: `${localDateKey(index)}T${timeRangeFor(index)[1]}`,
            }));
        return source.map((item, index) => {
            const [fallbackStart, fallbackEnd] = timeRangeFor(index);
            const start = timeFromValue(item?.start || item?.startTime || item?.plannedStart) || fallbackStart;
            const end = timeFromValue(item?.end || item?.endTime || item?.plannedEnd) || fallbackEnd;
            const date = item?.date || item?.plannedDate || dateFromValue(item?.plannedStart) || localDateKey(Math.floor(index / 3));
            return {
                id: `draft-${uid()}`,
                conversationId,
                title: oneLine(item?.title || item?.name || fallbackText || "学习任务", 30),
                date,
                start,
                end,
                subject: item?.subjectName || item?.subject || defaultSubject || "",
                time: `${date} ${start}-${end}`,
                description: item?.description || item?.note || item?.content || fallbackText || "",
                status: "draft",
            };
        });
    }

    async function sendMessage() {
        const text = input.trim();
        if (!text || aiStatus === "loading") return;
        let key = chatKey;
        let conversationId = view === "free-chat" ? activeFreeId : activeSubjectConversationId;
        if (view === "free-chat" && !activeFreeId) {
            const remote = currentUser?.id
                ? await createConversation({ type: "free", title: oneLine(text, 18) }, { userId: currentUser.id }).catch(() => null)
                : null;
            const conversation = remote ? {
                id: remote.id,
                title: remote.title || oneLine(text),
                createdAt: remote.createdAt,
                updatedAt: remote.updatedAt,
            } : makeConversation(oneLine(text));
            setFreeConversations((prev) => [conversation, ...prev]);
            setActiveFreeId(conversation.id);
            conversationId = conversation.id;
            key = `free:${conversation.id}`;
        }
        if (view === "chat" && !activeSubjectConversationId) {
            const remote = currentUser?.id
                ? await createConversation({ type: "subject", subjectId: activeSubject.id, title: `${activeSubject.name}对话` }, { userId: currentUser.id }).catch(() => null)
                : null;
            const conversation = remote ? {
                id: remote.id,
                title: remote.title || `${activeSubject.name}对话`,
                createdAt: remote.createdAt,
                updatedAt: remote.updatedAt,
            } : makeConversation(`${activeSubject.name}对话`);
            setSubjectConversations((prev) => ({
                ...prev,
                [activeSubject.id]: [conversation, ...(prev[activeSubject.id] || [])],
            }));
            setActiveSubjectConversationId(conversation.id);
            conversationId = conversation.id;
            key = `subject:${conversation.id}`;
        }
        if (view === "free-chat" && isLocalConversationId(conversationId)) {
            conversationId = await ensureRemoteConversation("free", conversationId, oneLine(text, 18));
            key = `free:${conversationId}`;
        }
        if (view === "chat" && isLocalConversationId(conversationId)) {
            conversationId = await ensureRemoteConversation("subject", conversationId, `${activeSubject.name} 对话`, activeSubject.id);
            key = `subject:${conversationId}`;
        }
        const userMessage = { id: `msg-${uid()}`, role: "user", content: text };
        const history = (messages[key] || []).map((item) => ({ role: item.role, content: item.content || "" }));
        setMessages((prev) => ({
            ...prev,
            [key]: [
                ...(prev[key] || []),
                userMessage,
            ],
        }));
        setInput("");
        setAiStatus("loading");
        setAiError("");
        await saveConversationMessage(conversationId, userMessage);
        try {
            const context = await buildReferenceContext(text);
            const result = await chatWithAI({
                message: text,
                history,
                contextText: context.contextText,
                mode: "answer",
                conversationType: view === "free-chat" ? "free" : "subject",
                subjectId: view === "chat" ? activeSubject?.id : null,
                subjectInstruction: view === "chat" ? activeSubject?.instruction : "",
                selectedReferences,
                webSearch: { enabled: true, mode: "always", topK: 5 },
                returnFullResponse: true,
            });
            const assistantMessage = {
                id: `msg-${uid()}`,
                role: "assistant",
                content: result.reply,
                citations: [...(context.citations || []), ...(result.webCitations || [])],
            };
            autoNameConversation(view === "free-chat" ? "free" : "subject", conversationId, text);
            setMessages((prev) => ({
                ...prev,
                [key]: [...(prev[key] || []), assistantMessage],
            }));
            await saveConversationMessage(conversationId, assistantMessage);
        } catch (error) {
            const message = error?.message || "AI 请求失败";
            setAiError(message);
            setMessages((prev) => ({
                ...prev,
                [key]: [...(prev[key] || []), { id: `msg-${uid()}`, role: "assistant", content: `AI 请求失败：${message}` }],
            }));
        } finally {
            setAiStatus("idle");
        }
    }

    async function sendPlanningMessage() {
        const text = input.trim();
        if (!text || aiStatus === "loading") return;
        let conversationId = planningConversationId;
        if (!conversationId) {
            const remote = currentUser?.id
                ? await createConversation({ type: "planning", title: "规划对话" }, { userId: currentUser.id }).catch(() => null)
                : null;
            const conversation = remote ? {
                id: remote.id,
                title: remote.title || "规划对话",
                createdAt: remote.createdAt,
                updatedAt: remote.updatedAt,
            } : makeConversation("规划对话");
            setPlanningConversations((prev) => [conversation, ...prev]);
            setActivePlanningId(conversation.id);
            conversationId = conversation.id;
        }
        if (isLocalConversationId(conversationId)) {
            conversationId = await ensureRemoteConversation("planning", conversationId, "规划对话");
        }
        const key = `planning:${conversationId}`;
        const userMessage = { id: `msg-${uid()}`, role: "user", content: text };
        const history = (messages[key] || []).map((item) => ({ role: item.role, content: item.content || "" }));
        setMessages((prev) => ({
            ...prev,
            [key]: [
                ...(prev[key] || []),
                userMessage,
            ],
        }));
        setInput("");
        setAiStatus("loading");
        setAiError("");
        await saveConversationMessage(conversationId, userMessage);
        try {
            const result = await chatWithAI({
                message: text,
                history,
                conversationType: "planning",
                draftContext: { existingDraftCount: (draftsByConversation[conversationId] || []).length },
                webSearch: { enabled: true, mode: "always", topK: 5 },
                returnFullResponse: true,
            });
            const assistantMessage = { id: `msg-${uid()}`, role: "assistant", content: result.reply };
            const nextDrafts = draftsFromAI(result.drafts, conversationId, text, result.reply, activeSubject.name);
            autoNameConversation("planning", conversationId, text);
            setMessages((prev) => ({
                ...prev,
                [key]: [...(prev[key] || []), assistantMessage],
            }));
            setDraftsByConversation((prev) => ({
                ...prev,
                [conversationId]: [...nextDrafts, ...(prev[conversationId] || [])],
            }));
            if (currentUser?.id && !isLocalConversationId(conversationId)) {
                nextDrafts.forEach((draft) => {
                    const subject = subjects.find((item) => item.name === draft.subject);
                    upsertPlanningDraft({
                        conversationId,
                        subjectId: subject?.id || null,
                        title: draft.title,
                        description: draft.description,
                        plannedStart: `${draft.date}T${draft.start}:00`,
                        plannedEnd: `${draft.date}T${draft.end}:00`,
                        status: draft.status,
                        metadata: { clientId: draft.id, subject: draft.subject, date: draft.date, start: draft.start, end: draft.end },
                    }, { userId: currentUser.id }).catch(() => null);
                });
            }
            await saveConversationMessage(conversationId, assistantMessage);
        } catch (error) {
            const message = error?.message || "AI 规划请求失败";
            setAiError(message);
            setDraftsByConversation((prev) => ({
                ...prev,
                [conversationId]: [...draftsFromAI([], conversationId, text, "", activeSubject.name), ...(prev[conversationId] || [])],
            }));
            setMessages((prev) => ({
                ...prev,
                [key]: [...(prev[key] || []), { id: `msg-${uid()}`, role: "assistant", content: `AI 规划失败，已先生成本地任务草案：${message}` }],
            }));
        } finally {
            setAiStatus("idle");
        }
    }

    function confirmDraft(draft) {
        const fromDemo = isDemoItem(draft);
        const task = {
            id: `task-${uid()}`,
            title: draft.title,
            subject: draft.subject || activeSubject.name,
            date: draft.date || todayKey(),
            start: draft.start || "19:00",
            end: draft.end || "20:00",
            description: draft.description,
            status: "pending",
            source: fromDemo ? "manual" : "planning-draft",
        };
        setTasks((prev) => [task, ...prev]);
        if (currentUser?.id && !fromDemo) {
            const subject = subjects.find((item) => item.name === task.subject);
            createLearningTask({
                ...task,
                clientId: task.id,
                subjectId: subject?.id || null,
                conversationId: isLocalConversationId(draft.conversationId) ? null : draft.conversationId,
                plannedDate: task.date,
                slot: `${task.start}-${task.end}`,
                source: "planning-draft",
                metadata: { description: task.description, start: task.start, end: task.end },
            }, { userId: currentUser.id })
                .then((saved) => {
                    setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, remoteId: saved.id } : item)));
                    if (!String(draft.id).startsWith("draft-")) {
                        updatePlanningDraft(draft.id, { status: "confirmed", createdTaskId: saved.id }, { userId: currentUser.id }).catch(() => null);
                    }
                })
                .catch(() => null);
        }
        setDraftsByConversation((prev) => ({
            ...prev,
            [draft.conversationId]: (prev[draft.conversationId] || []).map((item) => (
                item.id === draft.id ? { ...item, status: "confirmed" } : item
            )),
        }));
    }

    function deleteDraft(draft) {
        setDraftsByConversation((prev) => ({
            ...prev,
            [draft.conversationId]: (prev[draft.conversationId] || []).filter((item) => item.id !== draft.id),
        }));
    }

    function createSubjectQuick(name) {
        const subjectName = name.trim();
        if (!subjectName) return "";
        const existing = subjects.find((subject) => subject.name === subjectName);
        if (existing) {
            setActiveSubjectId(existing.id);
            return existing.name;
        }
        const subject = {
            id: `subject-${uid()}`,
            name: subjectName,
            instruction: "",
        };
        setSubjects((prev) => [subject, ...prev]);
        setActiveSubjectId(subject.id);
        if (currentUser?.id) {
            createSubjectRecord({ name: subjectName, instruction: "" }, { userId: currentUser.id })
                .then((saved) => {
                    setSubjects((prev) => prev.map((item) => (item.id === subject.id ? { ...item, id: saved.id } : item)));
                    setActiveSubjectId(saved.id);
                })
                .catch(() => null);
        }
        return subject.name;
    }

    function saveTask() {
        if (!taskForm.title.trim()) return;
        const subjectName = taskForm.subject.trim();
        if (subjectName && !subjects.some((subject) => subject.name === subjectName)) {
            createSubjectQuick(subjectName);
        }
        const task = {
            id: `task-${uid()}`,
            title: taskForm.title.trim(),
            subject: subjectName,
            date: taskForm.date,
            start: taskForm.start,
            end: taskForm.end,
            description: taskForm.description,
            status: "pending",
            plannedDate: taskForm.date,
            startTime: taskForm.start,
            endTime: taskForm.end,
            source: "manual",
        };
        setTasks((prev) => [task, ...prev]);
        if (currentUser?.id) {
            const subject = subjects.find((item) => item.name === task.subject);
            createLearningTask({
                ...task,
                clientId: task.id,
                subjectId: subject?.id || null,
                plannedDate: task.date,
                slot: `${task.start}-${task.end}`,
                metadata: { description: task.description, start: task.start, end: task.end },
            }, { userId: currentUser.id })
                .then((saved) => setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, remoteId: saved.id } : item))))
                .catch(() => null);
        }
        setTaskForm({
            title: "",
            subject: "",
            date: todayKey(),
            start: "19:00",
            end: "20:00",
            description: "",
        });
    }

    function startTimer(task) {
        setTimer({
            running: true,
            startedAt: new Date().toISOString(),
            elapsed: "00:00",
            taskTitle: task?.title || "当前学习",
            subject: task?.subject || activeSubject.name,
            taskId: task?.id || "",
            taskRemoteId: task?.remoteId || "",
            subjectId: task?.subjectId || activeSubject.id,
            isDemoTask: isDemoItem(task),
        });
        setFinishForm({ status: "done", note: "" });
        setModal("timer");
    }

    function startQuickTimer() {
        setTimer((prev) => ({
            ...prev,
            running: true,
            startedAt: new Date().toISOString(),
            elapsed: "00:00",
            taskTitle: prev.taskTitle || "当前学习",
            subject: prev.subject || activeSubject.name,
            subjectId: prev.subjectId || activeSubject.id,
            isDemoTask: false,
        }));
        setModal("timer");
    }

    async function searchSources() {
        const query = sourceQuery.trim();
        if (!query) return;
        setSourceResults([]);
    }

    async function uploadPrivate(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!currentUser) {
            openAuth();
            return;
        }
        try {
            const saved = await uploadPrivateResource(file, currentUser.id);
            setPrivateResources((prev) => [saved, ...prev]);
        } catch (error) {
            setNotice(error?.message || "上传失败");
        } finally {
            event.target.value = "";
        }
    }

    async function openPrivateResource(resource) {
        try {
            const { signedUrl } = await createPrivateResourceSignedUrl(resource.id || resource.resourceId, currentUser?.id);
            window.open(signedUrl, "_blank", "noopener,noreferrer");
        } catch {
            setNotice("无法打开该资料");
        }
    }

    function addSubjectResource(resource) {
        const item = {
            id: `resource-${uid()}`,
            scope: resource.scope || "public",
            title: resource.title || resource.name || "资料",
            resourceId: resource.resourceId || resource.id || "",
            chunkId: resource.chunkId || "",
            contentPreview: resource.contentPreview || resource.summary || "",
        };
        setSelectedReferences((prev) => [item, ...prev.filter((old) => old.resourceId !== item.resourceId || old.chunkId !== item.chunkId)]);
        setSubjectResources((prev) => ({
            ...prev,
            [activeSubject.id]: [item, ...(prev[activeSubject.id] || [])],
        }));
        if (!isDemoItem(resource) && currentUser?.id && activeSubject?.id && !String(activeSubject.id).startsWith("subject-")) {
            addSubjectResourceRecord(activeSubject.id, item, { userId: currentUser.id })
                .then((saved) => {
                    setSubjectResources((prev) => ({
                        ...prev,
                        [activeSubject.id]: (prev[activeSubject.id] || []).map((old) => (old.id === item.id ? { ...item, id: saved.id } : old)),
                    }));
                })
                .catch(() => null);
        }
        setModal("");
    }

    function removeSubjectResource(id) {
        setSubjectResources((prev) => ({
            ...prev,
            [activeSubject.id]: (prev[activeSubject.id] || []).filter((item) => item.id !== id),
        }));
        if (currentUser?.id && !String(id).startsWith("resource-")) {
            removeSubjectResourceRecord(id, { userId: currentUser.id }).catch(() => null);
        }
    }

    function minutesFromElapsed(value) {
        const [mm = "0", ss = "0"] = String(value || "0:00").split(":");
        return Math.max(1, Number(mm) + (Number(ss) > 0 ? 1 : 0));
    }

    async function submitStudyFinish() {
        const endedAt = new Date().toISOString();
        const minutes = minutesFromElapsed(timer.elapsed);
        const taskStatus = finishForm.status === "done" ? "done" : finishForm.status;
        if (timer.taskId) {
            setTasks((prev) => prev.map((task) => (
                task.id === timer.taskId ? { ...task, status: taskStatus, done: taskStatus === "done" } : task
            )));
        }
        if (currentUser?.id && !timer.isDemoTask) {
            const subject = subjects.find((item) => item.id === timer.subjectId || item.name === timer.subject);
            const session = {
                clientId: `session-${uid()}`,
                taskId: timer.taskRemoteId || null,
                taskClientId: timer.taskId || null,
                subject: timer.subject,
                subjectId: subject?.id || null,
                conversationId: isLocalConversationId(activeSubjectConversationId) ? null : activeSubjectConversationId || null,
                minutes,
                startedAt: timer.startedAt || endedAt,
                endedAt,
                studyDate: todayKey(),
                note: finishForm.note,
                metadata: { taskTitle: timer.taskTitle, status: finishForm.status },
            };
            createStudySession(session, { userId: currentUser.id }).catch(() => null);
            if (timer.taskRemoteId || timer.taskId) {
                updateLearningTask(timer.taskRemoteId || timer.taskId, {
                    status: taskStatus,
                    done: taskStatus === "done",
                    metadata: { finishNote: finishForm.note, finishedAt: endedAt },
                }, { userId: currentUser.id }).catch(() => null);
            }
            if (finishForm.note.trim()) {
                createLearningReview({
                    clientId: `review-${uid()}`,
                    taskId: timer.taskRemoteId || null,
                    taskClientId: timer.taskId || null,
                    subject: timer.subject,
                    subjectId: subject?.id || null,
                    title: timer.taskTitle,
                    reviewType: "study-finish",
                    completedAt: endedAt,
                    note: finishForm.note,
                    metadata: { minutes, status: finishForm.status },
                }, { userId: currentUser.id }).catch(() => null);
                if (subject?.id) {
                    upsertSubjectReview({
                        subjectId: subject.id,
                        conversationId: isLocalConversationId(activeSubjectConversationId) ? null : activeSubjectConversationId || null,
                        originalText: finishForm.note,
                        harvestText: finishForm.note,
                        status: "confirmed",
                        metadata: { taskTitle: timer.taskTitle, minutes },
                    }, { userId: currentUser.id }).catch(() => null);
                }
            }
        }
        setTimer((prev) => ({ ...prev, running: false }));
        setModal("update-plan");
    }

    return (
        <div className="app">
            <Sidebar
                view={view}
                setView={setView}
                subjects={displaySubjects}
                activeSubjectId={activeSubjectId}
                openSubject={openSubject}
                freeConversations={freeConversations}
                activeFreeId={activeFreeId}
                setActiveFreeId={setActiveFreeId}
                newFreeConversation={newFreeConversation}
                openActionDialog={setActionDialog}
                timer={timer}
                openModal={setModal}
                startQuickTimer={startQuickTimer}
            />

            <main className="main">
                {notice && <div className="notice">{notice}<button onClick={() => setNotice("")}>×</button></div>}
                {view === "plan" && (
                    <PlanView
                        planTab={planTab}
                        setPlanTab={setPlanTab}
                        conversations={displayPlanningConversations}
                        activeId={planningConversationId}
                        setActiveId={setActivePlanningId}
                        newConversation={newPlanningConversation}
                        drafts={currentDrafts}
                        confirmDraft={confirmDraft}
                        deleteDraft={deleteDraft}
                        deleteConversation={deletePlanningConversation}
                        openRenameDialog={setRenameDialog}
                        input={input}
                        setInput={setInput}
                        sendPlanningMessage={sendPlanningMessage}
                        messages={planningMessages}
                        taskForm={taskForm}
                        setTaskForm={setTaskForm}
                        saveTask={saveTask}
                        tasks={displayTasks}
                        subjects={displaySubjects}
                        startTimer={startTimer}
                        createSubject={createSubjectQuick}
                        aiStatus={aiStatus}
                        aiError={aiError}
                    />
                )}
                {view === "library" && (
                    <LibraryView
                        query={libraryQuery}
                        setQuery={setLibraryQuery}
                        search={searchLibrary}
                        publicResources={publicResources}
                        privateResources={privateResources}
                        uploadPrivate={uploadPrivate}
                        openPublicUpload={() => setPublicUploadOpen(true)}
                        openPrivateResource={openPrivateResource}
                        openPublicResource={openPublicResource}
                        downloadPublicResource={downloadPublicResource}
                        referencePublicResource={addSubjectResource}
                    />
                )}
                {view === "subject" && (
                    <SubjectView
                        subject={activeSubject}
                        subjectTab={subjectTab}
                        setSubjectTab={setSubjectTab}
                        conversations={currentSubjectConversations}
                        startConversation={startSubjectConversation}
                        openConversation={(conversation) => {
                            setActiveSubjectConversationId(conversation.id);
                            setView("chat");
                        }}
                        resources={currentSubjectResources}
                        removeResource={removeSubjectResource}
                        reviews={currentReviews}
                        updateSubject={updateActiveSubject}
                        saveSubject={saveActiveSubjectSettings}
                        deleteConversation={deleteSubjectConversation}
                        openRenameDialog={setRenameDialog}
                    />
                )}
                {view === "chat" && (
                    <ChatView
                        title={`${activeSubject.name} / ${(subjectConversation?.title || "新对话")}`}
                        chatTab={chatTab}
                        setChatTab={setChatTab}
                        messages={visibleMessages}
                        input={input}
                        setInput={setInput}
                        send={sendMessage}
                        openSource={() => setModal("source")}
                        timer={timer}
                        openTimer={() => setModal("timer")}
                        finish={() => setModal("finish")}
                        reviews={currentReviews}
                        aiStatus={aiStatus}
                        aiError={aiError}
                        webEnabled={webEnabled}
                        setWebEnabled={setWebEnabled}
                        selectedReferences={selectedReferences}
                        onRename={() => activeSubjectConversationId && setRenameDialog({ type: "subject", id: activeSubjectConversationId, title: subjectConversation?.title || "新对话" })}
                    />
                )}
                {view === "free-chat" && (
                    <FreeChatView
                        title={freeConversation?.title || "新对话"}
                        messages={visibleMessages}
                        input={input}
                        setInput={setInput}
                        send={sendMessage}
                        openSource={() => setModal("source")}
                        aiStatus={aiStatus}
                        aiError={aiError}
                        webEnabled={webEnabled}
                        setWebEnabled={setWebEnabled}
                        selectedReferences={selectedReferences}
                        onRename={() => activeFreeId && setRenameDialog({ type: "free", id: activeFreeId, title: freeConversation?.title || "新对话" })}
                    />
                )}
                {view === "new-subject" && (
                    <NewSubjectView
                        draft={newSubject}
                        setDraft={setNewSubject}
                        createSubject={createSubjectFromForm}
                    />
                )}
                {view === "settings" && (
                    <SettingsView currentUser={currentUser} openAuth={openAuth} />
                )}
            </main>

            <SourceModal
                open={modal === "source"}
                query={sourceQuery}
                setQuery={setSourceQuery}
                search={searchSources}
                results={sourceResults}
                addResource={addSubjectResource}
                currentResources={currentSubjectResources}
                selectedReferences={selectedReferences}
                close={() => setModal("")}
            />
            <TimerModal
                open={modal === "timer"}
                timer={timer}
                setTimer={setTimer}
                close={() => setModal("")}
                finish={() => setModal("finish")}
            />
            <TaskDetailModal
                open={modal === "task-detail"}
                task={tasks[0]}
                close={() => setModal("")}
            />
            <FinishModal
                open={modal === "finish"}
                timer={timer}
                finishForm={finishForm}
                setFinishForm={setFinishForm}
                close={() => setModal("")}
                submit={submitStudyFinish}
            />
            <UpdatePlanModal
                open={modal === "update-plan"}
                close={() => setModal("")}
                update={() => {
                    setModal("");
                    setView("plan");
                    setPlanTab("ai");
                }}
            />
            <AuthPanel
                open={authOpen}
                onClose={() => setAuthOpen(false)}
                mode={authMode}
                setMode={setAuthMode}
                session={session}
                currentUser={currentUser}
            />
            <ResourcePreviewModal resource={previewResource} close={() => setPreviewResource(null)} addResource={addSubjectResource} downloadPublicResource={downloadPublicResource} />
            <PublicUploadModal
                open={publicUploadOpen}
                uploadJob={publicUploadJob}
                uploadPublicResource={uploadPublicResource}
                close={() => setPublicUploadOpen(false)}
            />
            <ActionDialog
                dialog={actionDialog}
                subjects={displaySubjects}
                close={() => setActionDialog(null)}
                openRenameDialog={setRenameDialog}
                onDeleteSubject={(subjectId) => {
                    deleteSubject(subjectId);
                    setActionDialog(null);
                }}
                onDeleteConversation={(conversationId) => {
                    deleteFreeConversation(conversationId);
                    setActionDialog(null);
                }}
                onMoveConversation={(conversationId, subjectId) => {
                    moveFreeConversationToSubject(conversationId, subjectId);
                    setActionDialog(null);
                }}
            />
            <RenameDialog
                dialog={renameDialog}
                close={() => setRenameDialog(null)}
                submit={(dialog, title) => {
                    renameConversation(dialog.type, dialog.id, title);
                    setRenameDialog(null);
                }}
            />
        </div>
    );
}

