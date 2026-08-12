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
import { askWithTempAttachments, uploadTempAttachment } from "./services/tempAttachmentApi";
import { supabase } from "./services/supabaseClient";
import { retrieveContext } from "./services/resourceApi";
import { useLocalState } from "./hooks/useLocalState";
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
    deletePrivateResource as deletePrivateResourceRecord,
    listPrivateResources,
    uploadPrivateResource,
} from "./services/privateResourceApi";
import "./FlowApp.css";

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const todayKey = () => new Date().toISOString().slice(0, 10);
const EMPTY_SUBJECT = { id: "", name: "", instruction: "" };
const MOCK_TEXT_MARKERS = ["示例", "范例", "机器学习"];
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

function hasMockMarker(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return false;
    return MOCK_TEXT_MARKERS.some((marker) => text.includes(marker.toLowerCase()));
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
        || id.startsWith("resource-demo-")
        || [
            item?.title,
            item?.name,
            item?.subject,
            item?.description,
            item?.content,
            item?.contentPreview,
            item?.original,
            item?.harvest,
        ].some(hasMockMarker);
}

function displayItems(items = [], demoItems = []) {
    const list = Array.isArray(items) ? items : [];
    return list.filter((item) => !isDemoItem(item));
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

function hasTimezone(value) {
    return /(?:z|[+-]\d{2}:?\d{2})$/i.test(String(value || ""));
}

function datePartFromValue(value) {
    if (!value) return "";
    if (hasTimezone(value)) {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        }
    }
    return dateFromValue(value);
}

function timePartFromValue(value) {
    if (!value) return "";
    if (hasTimezone(value)) {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
        }
    }
    return timeFromValue(value);
}

function localDateTimeWithOffset(date, time) {
    const datePart = date || todayKey();
    const timePart = time || "00:00";
    const offsetMinutes = -new Date(`${datePart}T${timePart}:00`).getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMinutes);
    const hh = String(Math.floor(abs / 60)).padStart(2, "0");
    const mm = String(abs % 60).padStart(2, "0");
    return `${datePart}T${timePart}:00${sign}${hh}:${mm}`;
}

function mergeById(remoteItems, localItems, isLocalItem) {
    const seen = new Set(remoteItems.flatMap((item) => [item.id, item.remoteId, item.clientId].filter(Boolean)));
    const preservedLocal = (localItems || []).filter((item) => isLocalItem(item) && !seen.has(item.id));
    return [...remoteItems, ...preservedLocal];
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
    const date = datePartFromValue(plannedStart) || meta.date || todayKey();
    const start = timePartFromValue(plannedStart) || meta.start || "19:00";
    const end = timePartFromValue(plannedEnd) || meta.end || "20:00";
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
        rawSummary: row?.metadata?.rawSummary || row?.metadata?.originalSummary || "",
        polishedText: row?.polishedText || row?.polished_text || "",
        harvest: row?.harvestText || row?.harvest_text || row?.polishedText || row?.polished_text || "",
        status: row?.status || "pending",
        conversationId: row?.conversationId || row?.conversation_id || "",
        keepOriginal: row?.metadata?.keepOriginal !== false,
        metadata: row?.metadata || {},
        createdAt: row?.createdAt || row?.created_at || "",
        updatedAt: row?.updatedAt || row?.updated_at || "",
    };
}

function parseReviewResult(reply, fallbackOriginal) {
    const text = String(reply || "").trim();
    let parsed = null;
    try {
        parsed = JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                parsed = JSON.parse(match[0]);
            } catch {
                parsed = null;
            }
        }
    }
    if (!parsed || typeof parsed !== "object") {
        return {
            rawSummary: text || fallbackOriginal,
            polishedText: text || fallbackOriginal,
        };
    }
    const blockages = Array.isArray(parsed.candidateBlockages)
        ? parsed.candidateBlockages.map((item) => [item.title, item.coreExplanation, item.suggestedReviewAction].filter(Boolean).join("：")).filter(Boolean)
        : [];
    const segments = Array.isArray(parsed.segments)
        ? parsed.segments.map((item) => [item.title, item.progressNote].filter(Boolean).join("：")).filter(Boolean)
        : [];
    const rawSummary = String(
        parsed.originalSummary
        || parsed.rawSummary
        || parsed.summary
        || [...segments, ...blockages, ...(parsed.mistakes || [])].join("\n")
        || fallbackOriginal
    ).trim();
    const polishedText = String(
        parsed.polishedSummary
        || parsed.polishedText
        || parsed.harvestText
        || [...blockages, ...(parsed.reflections || [])].join("\n")
        || rawSummary
    ).trim();
    return { rawSummary, polishedText };
}

function hasHarvestSaveIntent(text) {
    const normalized = String(text || "").replace(/\s+/g, "");
    return /(收获|复盘|入库|存档|保存|沉淀)/.test(normalized)
        && /(放到复盘|放进复盘|进入复盘|加入复盘|核心收获|形成.*收获|入库|存档|保存)/.test(normalized);
}

export default function FlowApp() {
    const [view, setView] = useLocalState("flow.view", "plan");
    const [planTab, setPlanTab] = useLocalState("flow.planTab", "ai");
    const [subjectTab, setSubjectTab] = useLocalState("flow.subjectTab", "chat");
    const [chatTab, setChatTab] = useLocalState("flow.chatTab", "chat");
    const [subjects, setSubjects] = useLocalState("flow.subjects", []);
    const [activeSubjectId, setActiveSubjectId] = useLocalState("flow.activeSubjectId", "");
    const [freeConversations, setFreeConversations] = useLocalState("flow.freeConversations", []);
    const [subjectConversations, setSubjectConversations] = useLocalState("flow.subjectConversations", {});
    const [planningConversations, setPlanningConversations] = useLocalState("flow.planningConversations", []);
    const [activeFreeId, setActiveFreeId] = useLocalState("flow.activeFreeId", "");
    const [activePlanningId, setActivePlanningId] = useLocalState("flow.activePlanningId", "");
    const [activeSubjectConversationId, setActiveSubjectConversationId] = useLocalState("flow.activeSubjectConversationId", "");
    const [messages, setMessages] = useLocalState("flow.messages", {});
    const [draftsByConversation, setDraftsByConversation] = useLocalState("flow.draftsByConversation", {});
    const [tasks, setTasks] = useLocalState("flow.tasks", []);
    const [subjectResources, setSubjectResources] = useLocalState("flow.subjectResources", {});
    const [subjectReviews, setSubjectReviews] = useLocalState("flow.subjectReviews", {});
    const [privateResources, setPrivateResources] = useState([]);
    const [modal, setModal] = useState("");
    const [detailTask, setDetailTask] = useState(null);
    const [actionDialog, setActionDialog] = useState(null);
    const [renameDialog, setRenameDialog] = useState(null);
    const [sourceQuery, setSourceQuery] = useState("");
    const [sourceResults, setSourceResults] = useState([]);
    const [selectedReferences, setSelectedReferences] = useLocalState("flow.selectedReferences", []);
    const [webEnabled, setWebEnabled] = useLocalState("flow.webEnabled", true);
    const [tempAttachments, setTempAttachments] = useLocalState("flow.tempAttachments", []);
    const [selectedAttachmentIds, setSelectedAttachmentIds] = useLocalState("flow.selectedAttachmentIds", []);
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
        mode: "stopwatch",
        pomodoroPhase: "focus",
    });
    const [finishForm, setFinishForm] = useState({ status: "done", note: "" });
    const [reviewDraft, setReviewDraft] = useState({
        original: "",
        rawSummary: "",
        polishedText: "",
        keepOriginal: true,
        loading: false,
        error: "",
    });

    const displaySubjects = displayItems(subjects);
    const displayPlanningConversations = displayItems(planningConversations);
    const activeSubject = useMemo(
        () => displaySubjects.find((subject) => subject.id === activeSubjectId) || displaySubjects[0] || EMPTY_SUBJECT,
        [activeSubjectId, displaySubjects],
    );
    const activePlanningConversation = displayPlanningConversations.find((item) => item.id === activePlanningId) || displayPlanningConversations[0];
    const planningConversationId = activePlanningConversation?.id || "";
    const storedDrafts = draftsByConversation[planningConversationId] || [];
    const currentDrafts = displayItems(storedDrafts);
    const storedSubjectConversations = subjectConversations[activeSubject?.id] || [];
    const currentSubjectConversations = displayItems(storedSubjectConversations);
    const storedSubjectResources = subjectResources[activeSubject?.id] || [];
    const currentSubjectResources = displayItems(storedSubjectResources);
    const sidebarSubjectConversations = useMemo(() => Object.fromEntries(displaySubjects.map((subject) => {
        const stored = subjectConversations[subject.id] || [];
        return [
            subject.id,
            displayItems(stored),
        ];
    })), [displaySubjects, subjectConversations]);
    const storedReviews = subjectReviews[activeSubject?.id] || [];
    const currentReviews = displayItems(storedReviews);
    const displayTasks = displayItems(tasks);
    const freeConversation = freeConversations.find((item) => item.id === activeFreeId);
    const subjectConversation = currentSubjectConversations.find((item) => item.id === activeSubjectConversationId);
    const chatKey = view === "free-chat"
        ? `free:${activeFreeId || "new"}`
        : `subject:${activeSubjectConversationId || activeSubject?.id}`;
    const visibleMessages = displayItems(messages[chatKey] || []);
    const planningMessages = displayItems(messages[`planning:${planningConversationId}`] || []);

    useEffect(() => {
        setSubjects((prev) => displayItems(prev));
        setFreeConversations((prev) => prev.filter((conversation) => (
            !isDemoItem(conversation) && (!isBlankConversationTitle(conversation.title) || (messages[`free:${conversation.id}`] || []).length > 0)
        )));
        setSubjectConversations((prev) => Object.fromEntries(Object.entries(prev).map(([subjectId, list]) => [
            subjectId,
            displayItems((list || []).filter((conversation) => (
                !isBlankConversationTitle(conversation.title) || (messages[`subject:${conversation.id}`] || []).length > 0
            ))),
        ])));
        setPlanningConversations((prev) => prev.filter((conversation) => (
            !isDemoItem(conversation) && (
            !isBlankConversationTitle(conversation.title)
            || (messages[`planning:${conversation.id}`] || []).length > 0
            || (draftsByConversation[conversation.id] || []).length > 0
            )
        )));
        setDraftsByConversation((prev) => Object.fromEntries(Object.entries(prev).map(([conversationId, list]) => [
            conversationId,
            displayItems(list),
        ])));
        setTasks((prev) => displayItems(prev));
        setSubjectResources((prev) => Object.fromEntries(Object.entries(prev).map(([subjectId, list]) => [subjectId, displayItems(list)])));
        setSubjectReviews((prev) => Object.fromEntries(Object.entries(prev).map(([subjectId, list]) => [subjectId, displayItems(list)])));
        setMessages((prev) => Object.fromEntries(Object.entries(prev).map(([key, list]) => [key, displayItems(list)])));
    // Run once on startup to clear stale empty local rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!activePlanningId && planningConversations[0]) {
            setActivePlanningId(planningConversations[0].id);
        }
    }, [activePlanningId, planningConversations, setActivePlanningId]);

    useEffect(() => {
        if (activeSubjectId && !displaySubjects.some((subject) => subject.id === activeSubjectId)) {
            setActiveSubjectId(displaySubjects[0]?.id || "");
        }
        if (activePlanningId && !displayPlanningConversations.some((conversation) => conversation.id === activePlanningId)) {
            setActivePlanningId(displayPlanningConversations[0]?.id || "");
        }
        if (activeFreeId && !freeConversations.some((conversation) => !isDemoItem(conversation) && conversation.id === activeFreeId)) {
            setActiveFreeId("");
        }
    }, [
        activeFreeId,
        activePlanningId,
        activeSubjectId,
        displayPlanningConversations,
        displaySubjects,
        freeConversations,
        setActiveFreeId,
        setActivePlanningId,
        setActiveSubjectId,
    ]);

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
            if (timer.mode === "pomodoro") {
                const phase = timer.pomodoroPhase || "focus";
                const limit = phase === "rest" ? 5 * 60 : 25 * 60;
                if (seconds >= limit) {
                    setTimer((prev) => ({
                        ...prev,
                        pomodoroPhase: phase === "rest" ? "focus" : "rest",
                        startedAt: new Date().toISOString(),
                        elapsed: "00:00",
                    }));
                    return;
                }
            }
            const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
            const ss = String(seconds % 60).padStart(2, "0");
            setTimer((prev) => ({ ...prev, elapsed: `${mm}:${ss}` }));
        }, 1000);
        return () => window.clearInterval(id);
    }, [timer.running, timer.startedAt, timer.mode, timer.pomodoroPhase]);

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
                const remoteSubjects = subjectRows.map((item) => ({
                    id: item.id,
                    name: item.name,
                    instruction: item.instruction || "",
                }));
                setSubjects((prev) => mergeById(remoteSubjects, prev, (item) => String(item.id || "").startsWith("subject-")));
                if (!subjectRows.some((item) => item.id === activeSubjectId)) {
                    setActiveSubjectId(subjectRows[0].id);
                }
            }
            if (freeRows.length) {
                const remoteFree = freeRows.filter((item) => !isBlankConversationTitle(item.title)).map((item) => ({
                    id: item.id,
                    title: item.title || "最近对话",
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                }));
                setFreeConversations((prev) => mergeById(remoteFree, prev, (item) => isLocalConversationId(item.id)));
            }
            if (planningRows.length) {
                const remotePlanning = planningRows.filter((item) => !isBlankConversationTitle(item.title)).map((item) => ({
                    id: item.id,
                    title: item.title || "规划对话",
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                }));
                setPlanningConversations((prev) => mergeById(remotePlanning, prev, (item) => isLocalConversationId(item.id)));
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
                const remoteTasks = rows.map(toLocalTask);
                setTasks((prev) => mergeById(remoteTasks, prev, (item) => !item.remoteId));
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
        if (!currentUser?.id || !activeFreeId || isLocalConversationId(activeFreeId)) return;
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
        if (!currentUser?.id || !activeSubjectConversationId || isLocalConversationId(activeSubjectConversationId)) return;
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
        if (!currentUser?.id || !planningConversationId || isLocalConversationId(planningConversationId)) return;
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

    function openSubjectConversation(subjectId, conversationId) {
        setActiveSubjectId(subjectId);
        setActiveSubjectConversationId(conversationId);
        setSubjectTab("chat");
        setView("chat");
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
        const isUnstarted = (conversationId) => (
            (messages[`planning:${conversationId}`] || []).length === 0
            && (draftsByConversation[conversationId] || []).length === 0
        );
        if (planningConversationId && isUnstarted(planningConversationId)) {
            setPlanTab("ai");
            return;
        }
        const existingDraft = planningConversations.find((conversation) => isUnstarted(conversation.id));
        if (existingDraft) {
            setActivePlanningId(existingDraft.id);
            setPlanTab("ai");
            return;
        }
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

    function startSubjectConversation(subjectId = activeSubject.id) {
        const subject = displaySubjects.find((item) => item.id === subjectId) || activeSubject;
        const subjectConversationsForStart = sidebarSubjectConversations[subjectId] || [];
        const isUnstarted = (conversationId) => (messages[`subject:${conversationId}`] || []).length === 0;
        if (activeSubjectId === subjectId && activeSubjectConversationId && isUnstarted(activeSubjectConversationId)) {
            setView("chat");
            return;
        }
        const existingDraft = subjectConversationsForStart.find((conversation) => isUnstarted(conversation.id));
        if (existingDraft) {
            setActiveSubjectId(subjectId);
            setActiveSubjectConversationId(existingDraft.id);
            setView("chat");
            return;
        }
        const conversation = makeConversation(`${subject.name}对话`);
        setSubjectConversations((prev) => ({
            ...prev,
            [subjectId]: [conversation, ...(prev[subjectId] || [])],
        }));
        setActiveSubjectId(subjectId);
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
        if (!currentUser?.id || !activeSubject?.id) return;
        const save = String(activeSubject.id).startsWith("subject-")
            ? createSubjectRecord({ name: activeSubject.name, instruction: activeSubject.instruction || "" }, { userId: currentUser.id })
            : updateSubjectRecord(activeSubject, { userId: currentUser.id });
        save
            .then((saved) => {
                setSubjects((prev) => prev.map((item) => (item.id === activeSubject.id || item.id === saved.id ? { ...item, ...saved } : item)));
                setActiveSubjectId(saved.id);
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

    async function uploadChatAttachment(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!currentUser) {
            openAuth();
            event.target.value = "";
            return;
        }
        try {
            const uploaded = await uploadTempAttachment(file, currentUser);
            setTempAttachments((prev) => [uploaded, ...prev]);
            setSelectedAttachmentIds((prev) => [uploaded.id, ...prev.filter((id) => id !== uploaded.id)]);
            setNotice("附件已加入本次 AI 对话");
        } catch (error) {
            setNotice(error?.message || "附件上传失败");
        } finally {
            event.target.value = "";
        }
    }

    function selectedTempAttachments() {
        const selected = new Set(selectedAttachmentIds);
        return tempAttachments.filter((item) => selected.has(item.id));
    }

    function hasDraftGenerationIntent(text) {
        const normalized = String(text || "").replace(/\s+/g, "");
        return [
            /生成任务草案/,
            /确认生成/,
            /可以生成/,
            /开始生成/,
            /帮我生成.*任务/,
            /生成.*计划任务/,
            /生成.*学习计划/,
            /生成.*任务/,
            /生成.*草案/,
            /生成.*日程/,
            /^生成$/,
            /^确认$/,
            /^可以$/,
        ].some((pattern) => pattern.test(normalized));
    }

    function hasScheduleAddIntent(text) {
        const normalized = String(text || "").replace(/\s+/g, "");
        return [
            /加入日程/,
            /加到日程/,
            /添加到日程/,
            /放进日程/,
            /放入日程/,
            /同步到日程/,
            /加入任务/,
            /加到任务/,
            /添加到任务/,
            /创建任务/,
            /生成并加入日程/,
            /生成.*并.*加入日程/,
            /生成.*并.*加到日程/,
            /生成.*后.*加入日程/,
            /生成.*后.*加到日程/,
            /安排进日程/,
            /一键加入/,
            /全部加入/,
            /全都加入/,
        ].some((pattern) => pattern.test(normalized));
    }

    async function askAIWithOptionalAttachments({ text, history, context, conversationType, subjectId, subjectInstruction, draftContext }) {
        const isPlanning = conversationType === "planning";
        const planningAction = isPlanning && (hasDraftGenerationIntent(text) || hasScheduleAddIntent(text)) ? "generate_drafts" : "chat";
        const webSearch = isPlanning
            ? { enabled: false, mode: "auto", topK: 5 }
            : { enabled: webEnabled, mode: webEnabled ? "always" : "auto", topK: 5 };
        const attachments = selectedTempAttachments();
        if (attachments.length) {
            const question = isPlanning
                ? [
                    text,
                    "",
                    "当前是 AI 规划页。请先根据附件和引用资料帮助用户澄清学习目标、基础、期限、可用时间和学习范围。",
                    planningAction === "generate_drafts"
                        ? "用户已经确认生成任务草案，可以在自然语言回复后附加 drafts JSON。"
                        : "当前默认禁止生成 drafts JSON；如果信息不足请追问，如果信息较充分请先给规划摘要并询问是否生成任务草案。",
                ].join("\n")
                : text;
            const result = await askWithTempAttachments({
                question,
                attachments,
                selectedAttachmentIds,
                contextText: context.contextText,
                references: selectedReferences,
                webSearch,
            });
            return {
                reply: result.answer,
                citations: [...(context.citations || []), ...(result.citations || [])],
                webCitations: result.webCitations || [],
                drafts: isPlanning && planningAction === "generate_drafts" ? extractDraftsFromText(result.answer) : [],
            };
        }
        return chatWithAI({
            message: text,
            history,
            contextText: context.contextText,
            mode: "answer",
            conversationType,
            subjectId,
            subjectInstruction,
            selectedReferences,
            draftContext,
            planningAction,
            webSearch,
            returnFullResponse: true,
        });
    }

    function extractDraftsFromText(text) {
        const match = String(text || "").match(/\{[\s\S]*"drafts"[\s\S]*\}/);
        if (!match) return [];
        try {
            const parsed = JSON.parse(match[0]);
            return Array.isArray(parsed?.drafts) ? parsed.drafts : [];
        } catch {
            return [];
        }
    }

    function draftsFromAI(rawDrafts, conversationId, fallbackText, defaultSubject = activeSubject?.name) {
        if (!Array.isArray(rawDrafts) || rawDrafts.length === 0) return [];

        const source = rawDrafts;
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

    function taskFromDraft(draft) {
        const fromDemo = isDemoItem(draft);
        return {
            id: `task-${uid()}`,
            title: draft.title,
            subject: draft.subject || activeSubject.name,
            subjectId: draft.subjectId || activeSubject.id,
            date: draft.date || todayKey(),
            start: draft.start || "19:00",
            end: draft.end || "20:00",
            description: draft.description,
            status: "pending",
            source: fromDemo ? "manual" : "planning-draft",
            plannedDate: draft.date || todayKey(),
            startTime: draft.start || "19:00",
            endTime: draft.end || "20:00",
            slot: `${draft.start || "19:00"}-${draft.end || "20:00"}`,
            draftId: fromDemo ? "" : draft.id,
        };
    }

    function persistTaskFromDraft(task, draft) {
        const fromDemo = isDemoItem(draft);
        if (!currentUser?.id || fromDemo) return;

        const subject = subjects.find((item) => item.name === task.subject);
        createLearningTask({
            ...task,
            clientId: task.id,
            subjectId: subject?.id || null,
            draftId: draft.id,
            conversationId: isLocalConversationId(draft.conversationId) ? null : draft.conversationId,
            plannedDate: task.date,
            slot: `${task.start}-${task.end}`,
            source: "planning-draft",
            metadata: { description: task.description, start: task.start, end: task.end, draftClientId: draft.id },
        }, { userId: currentUser.id })
            .then((saved) => {
                setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, remoteId: saved.id } : item)));
                if (!String(draft.id).startsWith("draft-")) {
                    updatePlanningDraft(draft.id, { status: "confirmed", createdTaskId: saved.id }, { userId: currentUser.id }).catch(() => null);
                }
            })
            .catch(() => null);
    }

    function confirmDrafts(drafts, options = {}) {
        const uniqueDrafts = [];
        const seen = new Set();
        (drafts || []).forEach((draft) => {
            if (!draft || draft.status === "confirmed") return;
            const key = draft.id || `${draft.title}:${draft.date}:${draft.start}`;
            if (seen.has(key)) return;
            seen.add(key);
            uniqueDrafts.push(draft);
        });

        if (!uniqueDrafts.length) return [];

        const tasksToAdd = uniqueDrafts.map(taskFromDraft);
        setTasks((prev) => [...tasksToAdd, ...prev]);
        tasksToAdd.forEach((task, index) => persistTaskFromDraft(task, uniqueDrafts[index]));

        setDraftsByConversation((prev) => {
            const next = { ...prev };
            uniqueDrafts.forEach((draft) => {
                const conversationId = draft.conversationId;
                next[conversationId] = (next[conversationId] || []).map((item) => (
                    item.id === draft.id ? { ...item, status: "confirmed" } : item
                ));
            });
            return next;
        });

        if (options.openSchedule) setPlanTab("schedule");
        return tasksToAdd;
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
            const result = await askAIWithOptionalAttachments({
                text,
                history,
                context,
                conversationType: view === "free-chat" ? "free" : "subject",
                subjectId: view === "chat" ? activeSubject?.id : null,
                subjectInstruction: view === "chat" ? activeSubject?.instruction : "",
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
            if (view === "chat" && hasHarvestSaveIntent(text)) {
                addPendingReviewFromChat({
                    userText: text,
                    assistantText: result.reply,
                    conversationId,
                });
            }
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
        const autoAddToSchedule = hasScheduleAddIntent(text);
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

        const existingDrafts = (draftsByConversation[conversationId] || []).filter((draft) => draft.status !== "confirmed");
        if (autoAddToSchedule && existingDrafts.length > 0 && !hasDraftGenerationIntent(text)) {
            const addedTasks = confirmDrafts(existingDrafts, { openSchedule: true });
            const assistantMessage = {
                id: `msg-${uid()}`,
                role: "assistant",
                content: addedTasks.length
                    ? `已将 ${addedTasks.length} 个任务草案加入日程。你可以在「学习日程」里查看和调整时间。`
                    : "当前没有可加入日程的任务草案。",
            };
            setMessages((prev) => ({
                ...prev,
                [key]: [...(prev[key] || []), assistantMessage],
            }));
            await saveConversationMessage(conversationId, assistantMessage);
            setAiStatus("idle");
            return;
        }

        try {
            const context = await buildReferenceContext(text);
            const result = await askAIWithOptionalAttachments({
                text,
                history,
                context,
                conversationType: "planning",
                draftContext: { existingDraftCount: (draftsByConversation[conversationId] || []).length },
            });
            const nextDrafts = draftsFromAI(result.drafts, conversationId, text, activeSubject.name);
            const addedTasks = autoAddToSchedule ? confirmDrafts(nextDrafts, { openSchedule: true }) : [];
            const assistantMessage = {
                id: `msg-${uid()}`,
                role: "assistant",
                content: [
                    result.reply,
                    addedTasks.length
                        ? `已按你的指令将 ${addedTasks.length} 个任务加入日程。你可以在「学习日程」里查看和调整。`
                        : "",
                ].filter(Boolean).join("\n\n"),
            };
            const draftsToStore = autoAddToSchedule
                ? nextDrafts.map((draft) => ({ ...draft, status: "confirmed" }))
                : nextDrafts;
            autoNameConversation("planning", conversationId, text);
            setMessages((prev) => ({
                ...prev,
                [key]: [...(prev[key] || []), assistantMessage],
            }));
            setDraftsByConversation((prev) => ({
                ...prev,
                [conversationId]: [...draftsToStore, ...(prev[conversationId] || [])],
            }));
            if (currentUser?.id && !isLocalConversationId(conversationId)) {
                draftsToStore.forEach((draft) => {
                    const subject = subjects.find((item) => item.name === draft.subject);
                    upsertPlanningDraft({
                        conversationId,
                        subjectId: subject?.id || null,
                        title: draft.title,
                        description: draft.description,
                        plannedStart: localDateTimeWithOffset(draft.date, draft.start),
                        plannedEnd: localDateTimeWithOffset(draft.date, draft.end),
                        status: draft.status,
                        metadata: { clientId: draft.id, subject: draft.subject, date: draft.date, start: draft.start, end: draft.end },
                    }, { userId: currentUser.id })
                        .then((saved) => {
                            if (!saved?.id) return;
                            setDraftsByConversation((prev) => ({
                                ...prev,
                                [conversationId]: (prev[conversationId] || []).map((item) => (
                                    item.id === draft.id ? { ...item, id: saved.id, remoteId: saved.id } : item
                                )),
                            }));
                        })
                        .catch(() => null);
                });
            }
            await saveConversationMessage(conversationId, assistantMessage);
        } catch (error) {
            const message = error?.message || "AI 规划请求失败";
            setAiError(message);
            setMessages((prev) => ({
                ...prev,
                [key]: [...(prev[key] || []), { id: `msg-${uid()}`, role: "assistant", content: `AI 规划失败：${message}` }],
            }));
        } finally {
            setAiStatus("idle");
        }
    }

    function confirmDraft(draft) {
        confirmDrafts([draft], { openSchedule: true });
    }

    function confirmCurrentDrafts() {
        const drafts = draftsByConversation[planningConversationId] || [];
        const addedTasks = confirmDrafts(drafts, { openSchedule: true });
        if (addedTasks.length) {
            setNotice(`已将 ${addedTasks.length} 个任务草案加入日程`);
        }
    }

    function deleteDraft(draft) {
        setDraftsByConversation((prev) => ({
            ...prev,
            [draft.conversationId]: (prev[draft.conversationId] || []).filter((item) => item.id !== draft.id),
        }));
        if (currentUser?.id && draft?.id && !String(draft.id).startsWith("draft-")) {
            updatePlanningDraft(draft.id, { status: "deleted" }, { userId: currentUser.id }).catch(() => null);
        }
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
            mode: timer.mode || "stopwatch",
            pomodoroPhase: timer.pomodoroPhase || "focus",
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
            mode: prev.mode || "stopwatch",
            pomodoroPhase: prev.pomodoroPhase || "focus",
        }));
        setModal("timer");
    }

    function goToCurrentStudy() {
        const subjectId = timer.subjectId || subjects.find((subject) => subject.name === timer.subject)?.id || activeSubject?.id;
        if (timer.taskId || timer.taskRemoteId) {
            if (subjectId) {
                openSubject(subjectId);
                return;
            }
            setView("plan");
            setPlanTab("tasks");
            return;
        }
        newFreeConversation();
    }

    function openCurrentTaskDetail() {
        const task = tasks.find((item) => (
            item.id === timer.taskId
            || item.remoteId === timer.taskRemoteId
        ));
        setDetailTask(task || {
            title: timer.taskTitle || "当前学习",
            subject: timer.subject || activeSubject.name,
            description: timer.taskId || timer.taskRemoteId ? "暂无更多任务说明。" : "暂无进行中的学习任务。",
        });
        setModal("task-detail");
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

    async function openPrivateResource(resource, mode = "preview") {
        try {
            const { signedUrl } = await createPrivateResourceSignedUrl(resource.resourceId || resource.id, currentUser?.id, mode);
            window.open(signedUrl, "_blank", "noopener,noreferrer");
        } catch {
            setNotice("无法打开该资料");
        }
    }

    async function deletePrivateResource(resource) {
        if (!currentUser?.id) {
            openAuth();
            return;
        }
        try {
            await deletePrivateResourceRecord(resource.resourceId || resource.id, currentUser.id);
            const ids = new Set([resource.id, resource.resourceId].filter(Boolean).map(String));
            setPrivateResources((prev) => prev.filter((item) => !ids.has(String(item.id))));
            setSubjectResources((prev) => Object.fromEntries(Object.entries(prev).map(([subjectId, list]) => [
                subjectId,
                (list || []).filter((item) => !ids.has(String(item.resourceId || item.id))),
            ])));
        } catch (error) {
            setNotice(error?.message || "删除私有资料失败");
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

    function removeSubjectResource(id, subjectId = activeSubject.id) {
        setSubjectResources((prev) => ({
            ...prev,
            [subjectId]: (prev[subjectId] || []).filter((item) => item.id !== id),
        }));
        if (currentUser?.id && !String(id).startsWith("resource-")) {
            removeSubjectResourceRecord(id, { userId: currentUser.id }).catch(() => null);
        }
    }

    function openSubjectResource(resource, mode = "preview") {
        if (!resource) return;
        if (resource.scope === "private") {
            openPrivateResource(resource, mode);
            return;
        }
        openPublicResource(resource);
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

    function confirmCurrentReviews() {
        if (!activeSubject?.id) return;
        const pending = currentReviews.filter((item) => item.status !== "confirmed");
        if (!pending.length) return;
        const markConfirmed = () => {
            setSubjectReviews((prev) => ({
                ...prev,
                [activeSubject.id]: (prev[activeSubject.id] || []).map((item) => (
                    item.status === "confirmed" ? item : { ...item, status: "confirmed" }
                )),
            }));
        };
        if (!currentUser?.id || String(activeSubject.id).startsWith("subject-")) {
            markConfirmed();
            setNotice("复盘收获已在本地确认；登录并使用真实学科后才会写入 Supabase");
            return;
        }
        if (currentUser?.id && !String(activeSubject.id).startsWith("subject-")) {
            Promise.allSettled(pending.map((item) => (
                upsertSubjectReview({
                    id: String(item.id || "").startsWith("review-") ? undefined : item.id,
                    subjectId: activeSubject.id,
                    conversationId: item.conversationId || null,
                    originalText: item.original || item.originalText || "",
                    polishedText: item.polishedText || "",
                    harvestText: item.harvest || item.harvestText || item.polishedText || "",
                    status: "confirmed",
                    metadata: item.metadata || {},
                }, { userId: currentUser.id })
            ))).then((results) => {
                if (results.some((result) => result.status === "rejected")) {
                    setNotice("复盘确认失败：请检查 Supabase subject_review_items 表和 RLS 权限");
                    return;
                }
                markConfirmed();
                setNotice("复盘收获已确认入库");
            });
        }
    }

    function addPendingReviewFromChat({ userText, assistantText, conversationId }) {
        if (!activeSubject?.id) return;
        const harvest = String(assistantText || "").trim();
        if (!harvest) return;
        const item = {
            id: `review-${uid()}`,
            original: userText,
            rawSummary: "",
            polishedText: harvest,
            harvest,
            status: "pending",
            conversationId: isLocalConversationId(conversationId) ? "" : conversationId || "",
            keepOriginal: true,
            metadata: {
                source: "chat-harvest-intent",
                storageTable: "subject_review_items",
                conversationTitle: subjectConversation?.title || "",
            },
            createdAt: new Date().toISOString(),
        };
        setSubjectReviews((prev) => ({
            ...prev,
            [activeSubject.id]: [item, ...(prev[activeSubject.id] || [])],
        }));
        setChatTab("review");
        setNotice("已放入待确认收获，保存位置：Supabase subject_review_items");
        if (currentUser?.id && !String(activeSubject.id).startsWith("subject-")) {
            upsertSubjectReview({
                subjectId: activeSubject.id,
                conversationId: item.conversationId || null,
                originalText: userText,
                polishedText: harvest,
                harvestText: harvest,
                status: "pending",
                metadata: item.metadata,
            }, { userId: currentUser.id })
                .then((saved) => {
                    if (!saved?.id) return;
                    setSubjectReviews((prev) => ({
                        ...prev,
                        [activeSubject.id]: (prev[activeSubject.id] || []).map((review) => (
                            review.id === item.id ? toLocalReview(saved) : review
                        )),
                    }));
                    setNotice("待确认收获已写入 Supabase subject_review_items");
                })
                .catch((error) => {
                    setSubjectReviews((prev) => ({
                        ...prev,
                        [activeSubject.id]: (prev[activeSubject.id] || []).filter((review) => review.id !== item.id),
                    }));
                    setNotice(error?.message || "收获写入失败：请检查 Supabase subject_review_items 表");
                });
        } else {
            setNotice("已本地暂存为待确认收获；登录并使用真实学科后才会写入 Supabase");
        }
    }

    async function summarizeReviewDraft() {
        const original = reviewDraft.original.trim();
        if (!original) {
            setReviewDraft((prev) => ({ ...prev, error: "请先输入原始自述。" }));
            return;
        }
        setReviewDraft((prev) => ({ ...prev, loading: true, error: "" }));
        try {
            const reply = await chatWithAI({
                message: original,
                mode: "review",
                conversationType: "review",
                subjectId: activeSubject?.id,
                subjectInstruction: activeSubject?.instruction || "",
                contextText: [
                    `当前学科：${activeSubject?.name || ""}`,
                    subjectConversation?.title ? `当前对话：${subjectConversation.title}` : "",
                    timer?.taskTitle ? `当前任务：${timer.taskTitle}` : "",
                ].filter(Boolean).join("\n"),
                history: [],
                selectedReferences,
            });
            const parsed = parseReviewResult(reply, original);
            setReviewDraft((prev) => ({
                ...prev,
                rawSummary: parsed.rawSummary,
                polishedText: parsed.polishedText,
                loading: false,
                error: "",
            }));
        } catch (error) {
            setReviewDraft((prev) => ({
                ...prev,
                loading: false,
                error: error?.message || "AI 总结失败",
            }));
        }
    }

    function saveReviewDraft() {
        const original = reviewDraft.original.trim();
        const rawSummary = reviewDraft.rawSummary.trim();
        const polishedText = reviewDraft.polishedText.trim();
        if (!activeSubject?.id || !original || (!rawSummary && !polishedText)) {
            setReviewDraft((prev) => ({ ...prev, error: "请先输入原始自述并生成或填写总结。" }));
            return;
        }
        const item = {
            id: `review-${uid()}`,
            original,
            rawSummary,
            polishedText,
            harvest: polishedText || rawSummary,
            status: "pending",
            conversationId: isLocalConversationId(activeSubjectConversationId) ? "" : activeSubjectConversationId || "",
            keepOriginal: reviewDraft.keepOriginal,
            metadata: {
                rawSummary,
                keepOriginal: reviewDraft.keepOriginal,
                source: "manual-review-draft",
                conversationTitle: subjectConversation?.title || "",
            },
            createdAt: new Date().toISOString(),
        };
        setSubjectReviews((prev) => ({
            ...prev,
            [activeSubject.id]: [item, ...(prev[activeSubject.id] || [])],
        }));
        if (currentUser?.id && !String(activeSubject.id).startsWith("subject-")) {
            upsertSubjectReview({
                subjectId: activeSubject.id,
                conversationId: item.conversationId || null,
                originalText: reviewDraft.keepOriginal ? original : "",
                polishedText,
                harvestText: polishedText || rawSummary,
                status: "pending",
                metadata: item.metadata,
            }, { userId: currentUser.id })
                .then((saved) => {
                    if (!saved?.id) return;
                    setSubjectReviews((prev) => ({
                        ...prev,
                        [activeSubject.id]: (prev[activeSubject.id] || []).map((review) => (
                            review.id === item.id ? toLocalReview(saved) : review
                        )),
                    }));
                })
                .catch((error) => {
                    setSubjectReviews((prev) => ({
                        ...prev,
                        [activeSubject.id]: (prev[activeSubject.id] || []).filter((review) => review.id !== item.id),
                    }));
                    setNotice(error?.message || "复盘保存失败：请检查 Supabase subject_review_items 表");
                });
        } else {
            setNotice("复盘已本地暂存；登录并使用真实学科后才会写入 Supabase");
        }
        setReviewDraft({
            original: "",
            rawSummary: "",
            polishedText: "",
            keepOriginal: true,
            loading: false,
            error: "",
        });
        if (currentUser?.id && !String(activeSubject.id).startsWith("subject-")) {
            setNotice("复盘已保存到待确认收获，确认后进入 Supabase subject_review_items");
        }
    }

    return (
        <div className="app">
            <Sidebar
                view={view}
                setView={setView}
                subjects={displaySubjects}
                activeSubjectId={activeSubjectId}
                activeSubjectConversationId={activeSubjectConversationId}
                openSubject={openSubject}
                subjectConversationsById={sidebarSubjectConversations}
                openSubjectConversation={openSubjectConversation}
                startSubjectConversation={startSubjectConversation}
                freeConversations={freeConversations}
                activeFreeId={activeFreeId}
                setActiveFreeId={setActiveFreeId}
                newFreeConversation={newFreeConversation}
                openActionDialog={setActionDialog}
                timer={timer}
                openModal={setModal}
                startQuickTimer={startQuickTimer}
                goStudy={goToCurrentStudy}
                openTaskDetail={openCurrentTaskDetail}
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
                        confirmAllDrafts={confirmCurrentDrafts}
                        deleteDraft={deleteDraft}
                        openTaskDetail={(task) => {
                            setDetailTask(task);
                            setModal("task-detail");
                        }}
                        deleteConversation={deletePlanningConversation}
                        openRenameDialog={setRenameDialog}
                        input={input}
                        setInput={setInput}
                        sendPlanningMessage={sendPlanningMessage}
                        messages={planningMessages}
                        openSource={() => setModal("source")}
                        selectedReferences={selectedReferences}
                        webEnabled={webEnabled}
                        setWebEnabled={setWebEnabled}
                        uploadAttachment={uploadChatAttachment}
                        attachmentCount={selectedAttachmentIds.length}
                        taskForm={taskForm}
                        setTaskForm={setTaskForm}
                        saveTask={saveTask}
                        tasks={displayTasks}
                        subjects={displaySubjects}
                        startTimer={startTimer}
                        createSubject={createSubjectQuick}
                        openNewSubject={() => setView("new-subject")}
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
                        subjects={displaySubjects}
                        subjectResources={subjectResources}
                        activeSubjectId={activeSubject?.id || ""}
                        uploadPrivate={uploadPrivate}
                        openPublicUpload={() => setPublicUploadOpen(true)}
                        openPrivateResource={openPrivateResource}
                        openPublicResource={openPublicResource}
                        downloadPublicResource={downloadPublicResource}
                        referencePublicResource={addSubjectResource}
                        referencePrivateResource={addSubjectResource}
                        removeSubjectResource={removeSubjectResource}
                        deletePrivateResource={deletePrivateResource}
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
                        deleteSubject={deleteSubject}
                        openRenameDialog={setRenameDialog}
                        uploadAttachment={uploadChatAttachment}
                        webEnabled={webEnabled}
                        setWebEnabled={setWebEnabled}
                        openSource={() => setModal("source")}
                        openResource={openSubjectResource}
                    />
                )}
                {view === "chat" && (
                    <ChatView
                        title={`${activeSubject?.name || "未选择学科"} / ${(subjectConversation?.title || "新对话")}`}
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
                        confirmReviews={confirmCurrentReviews}
                        reviewDraft={reviewDraft}
                        setReviewDraft={setReviewDraft}
                        summarizeReviewDraft={summarizeReviewDraft}
                        saveReviewDraft={saveReviewDraft}
                        aiStatus={aiStatus}
                        aiError={aiError}
                        webEnabled={webEnabled}
                        setWebEnabled={setWebEnabled}
                        selectedReferences={selectedReferences}
                        uploadAttachment={uploadChatAttachment}
                        attachmentCount={selectedAttachmentIds.length}
                        onRename={() => activeSubjectConversationId && setRenameDialog({ type: "subject", id: activeSubjectConversationId, title: subjectConversation?.title || "新对话" })}
                        onDelete={() => {
                            if (!activeSubjectConversationId) return;
                            deleteSubjectConversation(activeSubjectConversationId);
                            setView("subject");
                        }}
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
                        uploadAttachment={uploadChatAttachment}
                        attachmentCount={selectedAttachmentIds.length}
                        onRename={() => activeFreeId && setRenameDialog({ type: "free", id: activeFreeId, title: freeConversation?.title || "新对话" })}
                        onDelete={() => {
                            if (!activeFreeId) return;
                            deleteFreeConversation(activeFreeId);
                            setView("free-chat");
                        }}
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
                previewResource={openSubjectResource}
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
                task={detailTask || displayTasks[0] || null}
                close={() => setModal("")}
                startTimer={(task) => {
                    setModal("");
                    startTimer(task);
                }}
                addToSchedule={(task) => {
                    if (task?.status !== "draft") return;
                    confirmDraft(task);
                    setDetailTask((prev) => prev ? { ...prev, status: "confirmed" } : prev);
                    setModal("");
                }}
                editTask={(task) => {
                    setTaskForm({
                        title: task?.title || "",
                        subject: task?.subject || "",
                        date: task?.date || task?.plannedDate || todayKey(),
                        start: task?.start || task?.startTime || "19:00",
                        end: task?.end || task?.endTime || "20:00",
                        description: task?.description || "",
                    });
                    setModal("");
                    setView("plan");
                    setPlanTab("tasks");
                }}
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
                onDeleteConversation={(conversationId, kind = "free") => {
                    if (kind === "subject") {
                        deleteSubjectConversation(conversationId);
                    } else {
                        deleteFreeConversation(conversationId);
                    }
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

