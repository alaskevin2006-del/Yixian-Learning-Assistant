import { Fragment, useEffect, useMemo, useState } from "react";
import AuthPanel from "./components/AuthPanel";
import { AIMessage } from "./components/MarkdownMessage";
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

const DEFAULT_SUBJECTS = [
    {
        id: "subject-demo",
        name: "示例学科",
        instruction: "这是示例学科的长期学习空间。回答时优先结合本学科来源资料、任务、对话记录和复盘历史。",
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

function formatDate() {
    return new Date().toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
    });
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
    const [planningConversations, setPlanningConversations] = useLocalState("flow.planningConversations", [makeConversation("规划对话")]);
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
    });
    const [finishForm, setFinishForm] = useState({ status: "done", note: "" });

    const activeSubject = useMemo(
        () => subjects.find((subject) => subject.id === activeSubjectId) || subjects[0] || DEFAULT_SUBJECTS[0],
        [activeSubjectId, subjects],
    );
    const activePlanningConversation = planningConversations.find((item) => item.id === activePlanningId) || planningConversations[0];
    const planningConversationId = activePlanningConversation?.id || "";
    const currentDrafts = draftsByConversation[planningConversationId] || [];
    const currentSubjectConversations = subjectConversations[activeSubject?.id] || [];
    const currentSubjectResources = subjectResources[activeSubject?.id] || [];
    const currentReviews = subjectReviews[activeSubject?.id] || [];
    const freeConversation = freeConversations.find((item) => item.id === activeFreeId);
    const subjectConversation = currentSubjectConversations.find((item) => item.id === activeSubjectConversationId);
    const chatKey = view === "free-chat"
        ? `free:${activeFreeId || "new"}`
        : `subject:${activeSubjectConversationId || activeSubject?.id}`;
    const visibleMessages = messages[chatKey] || [];

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
                if (subject.id === "subject-vision" || subject.name === "视力学") {
                    changed = true;
                    return {
                        ...subject,
                        id: subject.id === "subject-vision" ? "subject-demo" : subject.id,
                        name: "示例学科",
                        instruction: subject.instruction?.replaceAll?.("视力学", "示例学科") || DEFAULT_SUBJECTS[0].instruction,
                    };
                }
                return subject;
            });
            return changed ? next : prev;
        });
        if (activeSubjectId === "subject-vision") setActiveSubjectId("subject-demo");
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
        const task = {
            id: `task-${uid()}`,
            title: draft.title,
            subject: draft.subject || activeSubject.name,
            date: draft.date || todayKey(),
            start: draft.start || "19:00",
            end: draft.end || "20:00",
            description: draft.description,
            status: "pending",
        };
        setTasks((prev) => [task, ...prev]);
        if (currentUser?.id) {
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
        if (currentUser?.id && activeSubject?.id && !String(activeSubject.id).startsWith("subject-")) {
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
        if (currentUser?.id) {
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
                subjects={subjects}
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
                        conversations={planningConversations}
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
                        messages={messages[`planning:${planningConversationId}`] || []}
                        taskForm={taskForm}
                        setTaskForm={setTaskForm}
                        saveTask={saveTask}
                        tasks={tasks}
                        subjects={subjects}
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
                subjects={subjects}
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

function ActionDialog({ dialog, subjects, close, openRenameDialog, onDeleteSubject, onDeleteConversation, onMoveConversation }) {
    if (!dialog) return null;
    const isSubject = dialog.type === "subject";
    const title = isSubject ? "学科操作" : "最近对话操作";

    return (
        <div className="modal-backdrop" onClick={close}>
            <div className="modal action-modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-head">
                    <span>{title}</span>
                    <button className="icon-btn" onClick={close}>×</button>
                </div>
                <div className="modal-body modal-stack">
                    {isSubject ? (
                        <>
                            <p className="muted">当前学科：{dialog.subject.name}</p>
                            <div className="button-row right">
                                <button className="plain-btn danger-btn" onClick={() => onDeleteSubject(dialog.subject.id)}>删除学科</button>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="muted">当前对话：{dialog.conversation.title}</p>
                            <div className="button-row">
                                <button className="plain-btn" onClick={() => { openRenameDialog({ type: "free", id: dialog.conversation.id, title: dialog.conversation.title }); close(); }}>改名</button>
                                <button className="plain-btn danger-btn" onClick={() => onDeleteConversation(dialog.conversation.id)}>删除对话</button>
                            </div>
                            <div className="modal-stack">
                                <strong>移动至学科</strong>
                                <div className="dialog-action-list">
                                    {subjects.map((subject) => (
                                        <button className="plain-btn" key={subject.id} onClick={() => onMoveConversation(dialog.conversation.id, subject.id)}>
                                            移动到{subject.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function RenameDialog({ dialog, close, submit }) {
    if (!dialog) return null;
    return <RenameDialogContent key={`${dialog.type}:${dialog.id}`} dialog={dialog} close={close} submit={submit} />;
}

function RenameDialogContent({ dialog, close, submit }) {
    const [title, setTitle] = useState(dialog?.title || "");
    return (
        <div className="modal-backdrop" onClick={close}>
            <div className="modal action-modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-head"><span>修改名称</span><button className="icon-btn" onClick={close}>×</button></div>
                <div className="modal-body modal-stack">
                    <input className="new-subject-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="输入对话名称" autoFocus />
                    <div className="button-row right">
                        <button className="plain-btn" onClick={close}>取消</button>
                        <button className="primary-btn" onClick={() => submit(dialog, title)}>保存</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ResourcePreviewModal({ resource, close, addResource, downloadPublicResource }) {
    if (!resource) return null;
    return (
        <div className="modal-backdrop" onClick={close}>
            <div className="modal resource-preview-modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-head">
                    <span>{resource.title || "资料预览"}</span>
                    <button className="icon-btn" onClick={close}>×</button>
                </div>
                <div className="modal-body modal-stack">
                    <div className="muted">{[resource.path, resource.chapter, resource.section].filter(Boolean).join(" / ") || "公共资料"}</div>
                    <div className="resource-preview-content">
                        {resource.loading ? "正在加载资料切片..." : (resource.contentPreview || "暂无可预览内容。")}
                    </div>
                    {Array.isArray(resource.citations) && resource.citations.length > 0 && (
                        <div className="citation-list">
                            {resource.citations.slice(0, 6).map((item, index) => <span key={`${item.chunkId || index}`}>{item.title || `切片 ${index + 1}`}</span>)}
                        </div>
                    )}
                    <div className="button-row right">
                        <button className="plain-btn" onClick={() => downloadPublicResource(resource)}>下载</button>
                        <button className="primary-btn" disabled={resource.canReference === false} onClick={() => { addResource(resource); close(); }}>引用</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PublicUploadModal({ open, uploadJob, uploadPublicResource, close }) {
    if (!open) return null;
    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal">
                <div className="modal-head"><span>上传到公共资料</span><button className="icon-btn" onClick={close}>×</button></div>
                <div className="modal-body modal-stack">
                    <div className="muted">文件会先进入公共资料待处理队列，后续由资料处理流程完成切片、审核和向量入库。</div>
                    <label className="plain-btn upload-button">
                        选择公共资料文件
                        <input type="file" hidden accept=".txt,.md,.pdf,.doc,.docx,.ppt,.pptx,image/*" onChange={uploadPublicResource} />
                    </label>
                    {uploadJob ? (
                        <div className="card no-shadow">
                            <h3>{uploadJob.title}</h3>
                            <p className="muted">{uploadJob.path} / {uploadJob.section}</p>
                            <p className="muted">{uploadJob.contentPreview}</p>
                        </div>
                    ) : (
                        <div className="empty-state">尚未选择文件</div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Sidebar({
    view,
    setView,
    subjects,
    activeSubjectId,
    openSubject,
    freeConversations,
    activeFreeId,
    setActiveFreeId,
    newFreeConversation,
    openActionDialog,
    timer,
    openModal,
    startQuickTimer,
}) {
    const [subjectsOpen, setSubjectsOpen] = useState(true);
    const [freeOpen, setFreeOpen] = useState(true);

    return (
        <aside className="sidebar">
            <div className="brand">
                <div className="brand-title">逸仙学习助手</div>
                <div className="brand-date">{formatDate()}</div>
            </div>
            <div className="nav-scroll">
                <div className="nav-group">
                    <button className={`nav-item ${view === "plan" ? "active" : ""}`} onClick={() => setView("plan")}><span className="nav-label">学习计划</span></button>
                    <button className={`nav-item ${view === "library" ? "active" : ""}`} onClick={() => setView("library")}><span className="nav-label">资料库</span></button>
                </div>
                <div className="nav-gap" />
                <div className="nav-group">
                    <button className="nav-heading" onClick={() => setSubjectsOpen((value) => !value)}><span><span>{subjectsOpen ? "▾" : "▸"}</span><span className="text">学科</span></span></button>
                    <div className={`subject-list ${subjectsOpen ? "" : "collapsed"}`}>
                        <button className={`nav-item ${view === "new-subject" ? "active" : ""}`} onClick={() => setView("new-subject")}><span className="nav-label">+ 新学科</span></button>
                        {subjects.map((subject) => (
                            <div className={`nav-row ${view === "subject" && activeSubjectId === subject.id ? "is-active" : ""}`} key={subject.id}>
                                <button className={`nav-item ${view === "subject" && activeSubjectId === subject.id ? "active" : ""}`} onClick={() => openSubject(subject.id)}><span className="nav-label">{subject.name}</span></button>
                                <button className="row-menu" title="更多操作" onClick={() => openActionDialog({ type: "subject", subject })}>⋯</button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="nav-gap" />
                <div className="nav-group">
                    <button className={`nav-item ${view === "free-chat" && !activeFreeId ? "active" : ""}`} onClick={newFreeConversation}><span className="nav-label">新对话</span></button>
                    <button className="nav-heading recent-heading" onClick={() => setFreeOpen((value) => !value)}><span><span>{freeOpen ? "▾" : "▸"}</span><span className="text">最近对话</span></span></button>
                    <div className={`chat-list ${freeOpen ? "" : "collapsed"}`}>
                        {freeConversations.map((conversation) => (
                            <div className={`nav-row ${view === "free-chat" && activeFreeId === conversation.id ? "is-active" : ""}`} key={conversation.id}>
                                <button
                                    className={`subitem ${view === "free-chat" && activeFreeId === conversation.id ? "active" : ""}`}
                                    onClick={() => {
                                        setActiveFreeId(conversation.id);
                                        setView("free-chat");
                                    }}
                                >
                                    <span className="nav-label">{conversation.title}</span>
                                </button>
                                <button className="row-menu" title="更多操作" onClick={() => openActionDialog({ type: "free", conversation })}>⋯</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="sidebar-footer">
                <div className="learning-mini">
                    <strong>{timer.taskTitle || "当前学习会话"}</strong>
                    <span>{timer.running ? `${timer.subject} · ${timer.elapsed}` : "暂无进行中的计时"}</span>
                    <div className="mini-actions">
                        <button className="mini-btn" onClick={() => openModal("timer")}>计时</button>
                        <button className="mini-btn" onClick={startQuickTimer}>正计时</button>
                        <button className="mini-btn" onClick={() => setView("subject")}>去学科</button>
                    </div>
                </div>
                <button className={`nav-item ${view === "settings" ? "active" : ""}`} onClick={() => setView("settings")}><span className="nav-label">设置</span></button>
            </div>
        </aside>
    );
}

function PlanView({
    planTab,
    setPlanTab,
    conversations,
    activeId,
    setActiveId,
    newConversation,
    drafts,
    confirmDraft,
    deleteDraft,
    deleteConversation,
    openRenameDialog,
    input,
    setInput,
    sendPlanningMessage,
    messages,
    taskForm,
    setTaskForm,
    saveTask,
    tasks,
    subjects,
    startTimer,
    createSubject,
    aiStatus,
    aiError,
}) {
    const [conversationsOpen, setConversationsOpen] = useState(true);
    const [draftsOpen, setDraftsOpen] = useState(true);
    return (
        <section className="view" id="view-plan">
            <div className="plan-frame">
                <div className="plan-tabs">
                    <button className={`plan-tab ${planTab === "ai" ? "active" : ""}`} onClick={() => setPlanTab("ai")}>AI规划</button>
                    <button className={`plan-tab ${planTab === "tasks" ? "active" : ""}`} onClick={() => setPlanTab("tasks")}>任务安排</button>
                    <button className={`plan-tab ${planTab === "schedule" ? "active" : ""}`} onClick={() => setPlanTab("schedule")}>学习日程</button>
                </div>
                {planTab === "ai" && (
                    <div className="planner-layout">
                        <div className="planner-rail">
                            <div className="rail-section">
                                <button className="rail-section-head" onClick={() => setConversationsOpen((value) => !value)}><span>规划对话</span><span className="chevron">{conversationsOpen ? "▾" : "▸"}</span></button>
                                {conversationsOpen && <div className="rail-section-body">
                                    <button className="plain-btn" onClick={newConversation}>新建规划对话</button>
                                    {conversations.map((conversation) => (
                                        <div key={conversation.id} className={`rail-card rail-card-row ${conversation.id === activeId ? "active" : ""}`}>
                                            <button className="rail-card-main" onClick={() => setActiveId(conversation.id)}>
                                                <strong>{conversation.title}</strong>
                                                <div className="muted">AI 规划助手</div>
                                            </button>
                                            <div className="rail-card-actions">
                                                <button className="mini-btn" onClick={() => openRenameDialog({ type: "planning", id: conversation.id, title: conversation.title })}>改名</button>
                                                <button className="mini-btn danger-btn" onClick={() => deleteConversation(conversation.id)}>删除</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>}
                            </div>
                            <div className="rail-section draft-section">
                                <button className="rail-section-head" onClick={() => setDraftsOpen((value) => !value)}><span>任务草案</span><span className="chevron">{draftsOpen ? "▾" : "▸"}</span></button>
                                {draftsOpen && <div className="rail-section-body">
                                    <div className="draft-area">
                                        <div className="draft-list">
                                            {drafts.map((draft) => (
                                                <div className="draft-card" key={draft.id}>
                                                    <strong>{draft.title}</strong>
                                                    <div className="draft-time">{draft.date || "待排期"} {draft.start || ""}{draft.end ? `-${draft.end}` : ""}</div>
                                                    {draft.subject && <div className="tag green">{draft.subject}</div>}
                                                    <div className="draft-desc">{draft.description}</div>
                                                    <div className="draft-actions">
                                                        <button className="mini-btn" disabled={draft.status === "confirmed"} onClick={() => confirmDraft(draft)}>{draft.status === "confirmed" ? "已加入日程" : "确认加入日程"}</button>
                                                        <button className="mini-btn">查看详情</button>
                                                        <button className="mini-btn" onClick={() => deleteDraft(draft)}>删除</button>
                                                    </div>
                                                </div>
                                            ))}
                                            {drafts.length === 0 && <div className="muted">暂无任务草案。</div>}
                                        </div>
                                    </div>
                                </div>}
                            </div>
                        </div>
                        <div className="ai-main">
                            <div className="chat-canvas">
                                <div className="message ai">你可以直接发学习目标、错题、卡点、考试需求、时间约束。我会先生成任务草案，你确认后再加入日程。</div>
                                {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
                                {aiStatus === "loading" && <div className="muted">AI 正在整理规划...</div>}
                                {aiError && <div className="error-text">{aiError}</div>}
                            </div>
                            <Composer value={input} setValue={setInput} onSend={sendPlanningMessage} placeholder="发学习目标、错题、卡点、考试时间或本周可用时间" disabled={aiStatus === "loading"} />
                        </div>
                    </div>
                )}
                {planTab === "tasks" && <TasksPanel form={taskForm} setForm={setTaskForm} saveTask={saveTask} tasks={tasks} subjects={subjects} startTimer={startTimer} createSubject={createSubject} />}
                {planTab === "schedule" && <ScheduleView tasks={tasks} />}
            </div>
        </section>
    );
}

function TasksPanel({ form, setForm, saveTask, tasks, subjects, startTimer, createSubject }) {
    const [taskView, setTaskView] = useState("new");
    const [newSubjectName, setNewSubjectName] = useState("");
    const activeSubjectFilter = taskView.startsWith("subject:") ? taskView.slice("subject:".length) : "";
    const activeSubject = subjects.find((subject) => subject.id === activeSubjectFilter);
    const visibleTasks = tasks.filter((task) => {
        if (taskView === "new" || taskView === "all") return true;
        if (taskView === "uncategorized") return !task.subject;
        if (activeSubject) return task.subject === activeSubject.name;
        return true;
    });
    const viewTitle = taskView === "new"
        ? "新建任务"
        : taskView === "all"
            ? "全部任务"
            : taskView === "uncategorized"
                ? "待归档任务"
                : activeSubject?.name || "学科任务";

    function handleCreateSubject() {
        const createdName = createSubject(newSubjectName);
        if (!createdName) return;
        setForm((prev) => ({ ...prev, subject: createdName }));
        setNewSubjectName("");
    }

    return (
        <div className="task-shell">
            <div className="side-panel">
                <div className="side-section">
                    <div className="side-label">任务视图</div>
                    <button className={`side-pill ${taskView === "new" ? "active" : ""}`} onClick={() => setTaskView("new")}>新建任务</button>
                    <button className={`side-pill ${taskView === "all" ? "active" : ""}`} onClick={() => setTaskView("all")}>全部任务</button>
                    <button className={`side-pill ${taskView === "uncategorized" ? "active" : ""}`} onClick={() => setTaskView("uncategorized")}>待归档任务</button>
                </div>
                <div className="side-section">
                    <div className="side-label">按学科筛选</div>
                    {subjects.map((subject) => (
                        <button className={`side-pill ${taskView === `subject:${subject.id}` ? "active" : ""}`} key={subject.id} onClick={() => setTaskView(`subject:${subject.id}`)}>
                            {subject.name}
                        </button>
                    ))}
                </div>
            </div>
            <div className="task-main">
                {taskView === "new" && <div>
                    <h2>新建任务</h2>
                    <p className="muted">可选择已有学科，也可先新建学科；未选择学科时保存到待归档。</p>
                    <div className="form-grid">
                        <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="任务名，例如：章节复习" />
                        <select className="form-control" value={form.subject} onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}>
                            <option value="">保存到待归档</option>
                            {subjects.map((subject) => <option key={subject.id} value={subject.name}>{subject.name}</option>)}
                        </select>
                        <div className="inline-create">
                            <input value={newSubjectName} onChange={(event) => setNewSubjectName(event.target.value)} placeholder="新学科名称" />
                            <button className="plain-btn" onClick={handleCreateSubject}>新建学科</button>
                        </div>
                        <div className="form-row">
                            <input type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} />
                            <input type="time" value={form.start} onChange={(event) => setForm((prev) => ({ ...prev, start: event.target.value }))} />
                            <input type="time" value={form.end} onChange={(event) => setForm((prev) => ({ ...prev, end: event.target.value }))} />
                        </div>
                        <textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="任务说明，可选：目标、范围、要用的资料、验收方式。" />
                        <div className="align-end"><button className="primary-btn" onClick={saveTask}>保存任务</button></div>
                    </div>
                </div>}
                <div className="task-list">
                    <div className="task-list-head">
                        <h2>{taskView === "new" ? "最近任务" : viewTitle}</h2>
                        <span className="muted">{visibleTasks.length} 个任务</span>
                    </div>
                    {visibleTasks.map((task) => (
                        <div className="list-row" key={task.id}>
                            <div><strong>{task.title}</strong><div className="muted">{task.subject || "待归档"} · {task.date} {task.start}-{task.end}</div></div>
                            <button className="mini-btn" onClick={() => startTimer(task)}>开始</button>
                        </div>
                    ))}
                    {visibleTasks.length === 0 && <div className="empty-state">暂无任务</div>}
                </div>
            </div>
        </div>
    );
}

function ScheduleView({ tasks }) {
    const [weekOffset, setWeekOffset] = useState(0);
    const hours = Array.from({ length: 17 }, (_, index) => index + 7);
    const today = new Date();
    const weekDays = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(today);
        const mondayOffset = (date.getDay() || 7) - 1;
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - mondayOffset + index + weekOffset * 7);
        return date;
    });
    const toDateKey = (day) => {
        const local = new Date(day.getTime() - day.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
    };
    const weekLabel = weekOffset === 0 ? "本周" : weekOffset < 0 ? `${Math.abs(weekOffset)}周前` : `${weekOffset}周后`;

    return (
        <div className="schedule-wrap">
            <div className="schedule-toolbar">
                <button className="plain-btn" onClick={() => setWeekOffset((value) => value - 1)}>上一周</button>
                <div className="week-title">{weekLabel} · {weekDays[0].toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} - {weekDays[6].toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</div>
                <button className="plain-btn" onClick={() => setWeekOffset((value) => value + 1)}>下一周</button>
            </div>
            <div className="calendar-card">
                <div className="calendar-hint">
                    <span>点击日程卡片可查看详情、开始学习或调整时间。</span>
                    <button className="plain-btn">查看全天 24 小时</button>
                </div>
                <div className="week-head">
                    <div />
                    {weekDays.map((day) => (
                        <div className={`day-cell ${day.toDateString() === today.toDateString() ? "today" : ""}`} key={day.toISOString()}>
                            <div><small>{day.toLocaleDateString("zh-CN", { weekday: "short" })}</small>{day.getDate()}</div>
                        </div>
                    ))}
                </div>
                <div className="calendar-body">
                    {hours.map((hour) => (
                        <Fragment key={hour}>
                            <div className="time-label" key={`time-${hour}`}>{String(hour).padStart(2, "0")}:00</div>
                            {weekDays.map((day) => {
                                const dateKey = toDateKey(day);
                                const items = tasks.filter((task) => task.date === dateKey && Number(String(task.start || "19:00").slice(0, 2)) === hour);
                                return (
                                <div className="hour-cell" key={`${dateKey}-${hour}`}>
                                    {items.map((task) => <button className="schedule-task" key={task.id}>{task.title}</button>)}
                                </div>
                                );
                            })}
                        </Fragment>
                    ))}
                </div>
                <div className="legend"><span>学习</span><span>复盘</span><span>建议</span><span>空白时间</span></div>
            </div>
        </div>
    );
}

function LibraryView({ query, setQuery, search, publicResources, privateResources, uploadPrivate, openPublicUpload, openPrivateResource, openPublicResource, downloadPublicResource, referencePublicResource }) {
    return (
        <section className="view" id="view-library">
            <div className="topbar"><div className="top-title">资料库</div><div className="top-actions"><button className="plain-btn">管理分类</button></div></div>
            <div className="content wide-content library-page">
                <h1 className="page-title">资料库</h1>
                <div className="search-bar">
                    <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") search(); }} placeholder="搜索资料名称、学科、标签" />
                    <button className="plain-btn" onClick={search}>搜索</button>
                </div>
                <div className="library-grid">
                    <div className="card">
                        <h3>公共资料</h3>
                        <button className="plain-btn upload-button" onClick={openPublicUpload}>上传到公共资料</button>
                        {publicResources.map((item) => (
                            <div className="file-row" key={`${item.resourceId}-${item.chunkId}`}>
                                <span><strong>{item.title}</strong><small>{item.contentPreview}</small></span>
                                <div className="file-actions"><button className="mini-btn" onClick={() => openPublicResource(item)}>打开</button><button className="mini-btn" disabled={item.canReference === false} onClick={() => referencePublicResource(item)}>引用</button><button className="mini-btn" onClick={() => downloadPublicResource(item)}>下载</button></div>
                            </div>
                        ))}
                        {publicResources.length === 0 && <div className="empty-state">暂无公共资料，请上传资料后再检索</div>}
                    </div>
                    <div className="card">
                        <h3>私有资料</h3>
                        <label className="plain-btn upload-button">
                            上传到私有资料
                            <input type="file" hidden accept=".txt,.md,.pdf,.doc,.docx,.ppt,.pptx,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={uploadPrivate} />
                        </label>
                        {privateResources.map((item) => (
                            <div className="file-row" key={item.id || item.storagePath}>
                                <span>{item.name || item.title}</span>
                                <div className="file-actions">
                                    <button className="mini-btn" onClick={() => openPrivateResource(item)}>打开</button>
                                    <button className="mini-btn" onClick={() => openPrivateResource(item)}>下载</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

function SubjectView({ subject, subjectTab, setSubjectTab, conversations, startConversation, openConversation, resources, removeResource, reviews, updateSubject, saveSubject, deleteConversation, openRenameDialog }) {
    return (
        <section className="view" id="view-subject">
            <div className="topbar"><div className="top-title">{subject.name}</div><div className="top-actions"><button className="icon-btn">↗</button><button className="icon-btn">⋯</button></div></div>
            <div className="content project-hero">
                <div className="project-title">{subject.name}</div>
                <div className="composer subject-quick">
                    <button className="plus-btn">+</button>
                    <input placeholder="在该学科中开始新对话" readOnly onFocus={startConversation} />
                    <button className="plain-btn">联网</button>
                    <button className="plain-btn">引用</button>
                    <button className="round-btn" onClick={startConversation}>▶</button>
                </div>
                <div className="tabs">
                    {[
                        ["chat", "聊天"],
                        ["source", "来源"],
                        ["reviews", "复盘历史"],
                        ["settings", "学科设置"],
                    ].map(([key, label]) => <button className={`tab ${subjectTab === key ? "active" : ""}`} key={key} onClick={() => setSubjectTab(key)}>{label}</button>)}
                </div>
                {subjectTab === "chat" && (
                    <div className="subject-panel list">
                        <button className="list-row" onClick={startConversation}><div><strong>新建对话</strong><div className="muted">点击进入空白聊天界面</div></div><span className="muted">现在</span></button>
                        {conversations.map((conversation) => (
                            <div className="list-row" key={conversation.id}>
                                <button className="list-row-main" onClick={() => openConversation(conversation)}><div><strong>{conversation.title}</strong><div className="muted">自动生成标题 · 待确认复盘</div></div></button>
                                <div className="file-actions">
                                    <button className="mini-btn" onClick={() => openRenameDialog({ type: "subject", id: conversation.id, title: conversation.title })}>改名</button>
                                    <button className="mini-btn danger-btn" onClick={() => deleteConversation(conversation.id)}>删除</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {subjectTab === "source" && (
                    <div className="subject-panel source-grid">
                        <div className="card"><h3>本学科私有来源</h3>{resources.filter((item) => item.scope === "private").map((item) => <div className="file-row" key={item.id}><span>{item.title}</span><div className="file-actions"><button className="mini-btn">打开</button><button className="mini-btn" onClick={() => removeResource(item.id)}>移除</button></div></div>)}</div>
                        <div className="card"><h3>引用的公共来源</h3>{resources.filter((item) => item.scope !== "private").map((item) => <div className="file-row" key={item.id}><span>{item.title}</span><div className="file-actions"><button className="mini-btn">打开</button><button className="mini-btn" onClick={() => removeResource(item.id)}>取消引用</button></div></div>)}</div>
                    </div>
                )}
                {subjectTab === "reviews" && (
                    <div className="subject-panel review-grid">
                        <div className="card"><h3>用户原始自述</h3>{reviews.map((item) => <p key={item.id}>{item.original}</p>)}</div>
                        <div className="card"><h3>收获</h3>{reviews.map((item) => <p key={item.id}>{item.harvest}</p>)}</div>
                    </div>
                )}
                {subjectTab === "settings" && (
                    <div className="subject-panel settings-panel">
                        <div className="card"><div className="modal-stack">
                            <div className="field-stack"><label>学科名称</label><input className="new-subject-input" value={subject.name} onChange={(event) => updateSubject({ name: event.target.value })} /></div>
                            <div className="field-stack"><label>学科指令</label><div className="muted">设置此学科的背景信息和回复方式，相当于该学科内所有对话共用的提示词。</div><textarea value={subject.instruction || ""} onChange={(event) => updateSubject({ instruction: event.target.value })} /></div>
                            <div><button className="primary-btn" onClick={saveSubject}>保存学科设置</button></div>
                        </div></div>
                    </div>
                )}
            </div>
        </section>
    );
}

function ChatView({ title, chatTab, setChatTab, messages, input, setInput, send, openSource, timer, openTimer, finish, reviews, aiStatus, aiError, webEnabled, selectedReferences, onRename }) {
    return (
        <section className="view" id="view-chat">
            <div className="topbar"><div className="top-title">{title}</div><div className="top-actions"><button className="mini-btn" onClick={onRename}>改名</button><button className="mini-btn" onClick={openTimer}>计时</button><button className="icon-btn">⋯</button></div></div>
            <div className="chat-shell">
                <div className="chat-head">
                    <div className="tabs"><button className={`tab ${chatTab === "chat" ? "active" : ""}`} onClick={() => setChatTab("chat")}>聊天</button><button className={`tab ${chatTab === "review" ? "active" : ""}`} onClick={() => setChatTab("review")}>复盘</button></div>
                    <div className="learning-bar"><div><div className="learning-bar-title">{timer.taskTitle || "当前任务"}</div><div className="learning-bar-meta">{timer.running ? `专注中 · ${timer.elapsed}` : "未开始计时"}</div></div><div className="timer-actions"><span className="timer-value">{timer.elapsed}</span><button className="mini-btn" onClick={openTimer}>展开</button><button className="mini-btn" onClick={finish}>结束</button></div></div>
                </div>
                {chatTab === "chat" ? (
                    <div className="chat-panel conversation">
                        {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
                        {aiStatus === "loading" && <div className="muted">AI 正在回答...</div>}
                        {aiError && <div className="error-text">{aiError}</div>}
                    </div>
                ) : (
                    <div className="review-layout"><div className="card"><h3>用户原始自述</h3><p className="muted">可保留原貌，也可由 AI 润色后存档。</p>{reviews.map((item) => <div className="review-item" key={item.id}>{item.original}</div>)}</div><div className="card pending"><h3>待确认收获</h3><p className="muted">用户回复“入库”后先暂存在这里。</p>{reviews.map((item) => <div className="review-item" key={item.id}>{item.harvest}</div>)}<button className="primary-btn">一键确认入库</button></div></div>
                )}
                <Composer value={input} setValue={setInput} onSend={send} placeholder="有问题，尽管问" openSource={openSource} webEnabled={webEnabled} referenceCount={selectedReferences.length} disabled={aiStatus === "loading"} />
            </div>
        </section>
    );
}

function FreeChatView({ title, messages, input, setInput, send, openSource, aiStatus, aiError, webEnabled, selectedReferences, onRename }) {
    return (
        <section className="view" id="view-free-chat">
            <div className="topbar"><div className="top-title">{title}</div><div className="top-actions"><button className="mini-btn" onClick={onRename}>改名</button><button className="icon-btn">⋯</button></div></div>
            <div className="chat-shell free-chat-shell">
                <div className="free-chat-body">
                    {messages.length === 0 && <div className="message ai">这里是新对话入口。你可以直接开始提问、整理资料或临时讨论；发送第一条消息后，它会出现在左侧最近对话中。</div>}
                    {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
                    {aiStatus === "loading" && <div className="muted">AI 正在回答...</div>}
                    {aiError && <div className="error-text">{aiError}</div>}
                </div>
                <Composer value={input} setValue={setInput} onSend={send} placeholder="开始一个新对话" openSource={openSource} webEnabled={webEnabled} referenceCount={selectedReferences.length} disabled={aiStatus === "loading"} />
            </div>
        </section>
    );
}

function NewSubjectView({ draft, setDraft, createSubject }) {
    return (
        <section className="view" id="view-new-subject">
            <div className="topbar"><div className="top-title">新学科</div></div>
            <div className="content">
                <h1 className="page-title">创建新学科</h1>
                <div className="card"><div className="modal-stack">
                    <div className="field-stack"><label>学科名称</label><input className="new-subject-input" value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="例如：线性代数" /></div>
                    <div className="field-stack"><label>学科指令</label><div className="muted">设置此学科的背景信息和回复方式，相当于该学科内所有对话共用的提示词。</div><textarea value={draft.instruction} onChange={(event) => setDraft((prev) => ({ ...prev, instruction: event.target.value }))} placeholder="例如：这是我的线性代数学科..." /></div>
                    <div><button className="primary-btn" onClick={createSubject}>创建</button></div>
                </div></div>
            </div>
        </section>
    );
}

function SettingsView({ currentUser, openAuth }) {
    return (
        <section className="view" id="view-settings">
            <div className="topbar"><div className="top-title">设置</div></div>
            <div className="content">
                <h1 className="page-title">设置</h1>
                <div className="source-grid">
                    <div className="card"><h3>登录</h3><p className="muted">{currentUser ? currentUser.email : "账号状态、退出登录、同步状态。"}</p><button className="primary-btn" onClick={openAuth}>{currentUser ? "账号" : "登录 / 注册"}</button></div>
                    <div className="card"><h3>AI 设置</h3><p className="muted">模型、联网搜索、API Key 状态。</p></div>
                </div>
            </div>
        </section>
    );
}

function Composer({ value, setValue, onSend, placeholder, openSource, webEnabled, onToggleWeb, referenceCount = 0, disabled = false }) {
    return (
        <div className="composer">
            <button className="plus-btn">+</button>
            <input value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !disabled) onSend(); }} placeholder={placeholder} disabled={disabled} />
            <button className={`plain-btn ${webEnabled ? "active-soft" : ""}`} onClick={onToggleWeb} type="button" disabled={!onToggleWeb && webEnabled}>联网</button>
            {openSource && <button className={`plain-btn ${referenceCount ? "active-soft" : ""}`} onClick={openSource} type="button">引用{referenceCount ? ` ${referenceCount}` : ""}</button>}
            <button className="round-btn" onClick={onSend} disabled={disabled || !value.trim()}>▶</button>
        </div>
    );
}

function MessageBubble({ message }) {
    return (
        <div className={`message ${message.role === "user" ? "user" : "ai"}`}>
            {message.role === "assistant" ? <AIMessage content={message.content || ""} /> : message.content}
            {Array.isArray(message.citations) && message.citations.length > 0 && (
                <div className="citation-list">
                    {message.citations.slice(0, 6).map((item, index) => (
                        <span key={`${item.url || item.resourceId || item.chunkId || index}`}>{item.title || item.url || `引用 ${index + 1}`}</span>
                    ))}
                </div>
            )}
        </div>
    );
}

function SourceModal({ open, query, setQuery, search, results, addResource, currentResources, selectedReferences, close }) {
    if (!open) return null;
    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal">
                <div className="modal-head"><span>引用资料库内容</span><button className="icon-btn" onClick={close}>×</button></div>
                <div className="modal-body"><div className="modal-stack">
                    <div className="search-bar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索可引用的资料" /><button className="plain-btn" onClick={search}>搜索</button></div>
                    <div className="card">
                        <h3>当前引用</h3>
                        {selectedReferences.map((item) => <div className="select-row" key={`${item.resourceId}-${item.chunkId || item.id}`}><input type="checkbox" checked readOnly /><span>{item.title}</span><button className="mini-btn">已引用</button></div>)}
                        {selectedReferences.length === 0 && <div className="muted">暂无引用资料。</div>}
                    </div>
                    <div className="card"><h3>当前学科来源</h3>{currentResources.map((item) => <div className="select-row" key={item.id}><input type="checkbox" checked readOnly /><span>{item.title}</span><button className="mini-btn">预览</button></div>)}</div>
                    {results.map((item) => <div className="select-row" key={`${item.resourceId}-${item.chunkId}`}><input type="checkbox" readOnly /><span>{item.title}</span><button className="mini-btn" onClick={() => addResource(item)}>引用</button></div>)}
                    <div className="align-end"><button className="plain-btn" onClick={close}>取消</button><button className="primary-btn" onClick={close}>引用选中资料</button></div>
                </div></div>
            </div>
        </div>
    );
}

function TimerModal({ open, timer, setTimer, close, finish }) {
    if (!open) return null;
    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal">
                <div className="modal-head"><span>当前学习计时</span><button className="icon-btn" onClick={close}>×</button></div>
                <div className="modal-body"><div className="modal-stack">
                    <div><h3>{timer.taskTitle || "当前任务"}</h3><div className="muted">绑定当前任务和当前对话，结束后回写实际学习时间。</div></div>
                    <div className="timer-mode"><button className="active">正计时</button><button disabled>番茄钟</button></div>
                    <div className="timer-display"><span className="muted">本次学习已进行</span><strong>{timer.elapsed}</strong><span className="muted">点击开始后持续累计，结束学习时记录本次时长。</span></div>
                    <div className="button-row"><button className="primary-btn" onClick={() => setTimer((prev) => ({ ...prev, running: !prev.running, startedAt: prev.startedAt || new Date().toISOString() }))}>{timer.running ? "暂停" : "开始"}</button><button className="plain-btn">跳过休息</button><button className="plain-btn" onClick={finish}>结束学习</button></div>
                </div></div>
            </div>
        </div>
    );
}

function TaskDetailModal({ open, task, close }) {
    if (!open) return null;
    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal"><div className="modal-head"><span>任务详情</span><button className="icon-btn" onClick={close}>×</button></div><div className="modal-body"><div className="modal-stack"><div><h3>{task?.title || "当前任务"}</h3><div className="muted">{task?.date || "待排期"}</div></div><div className="card no-shadow"><h3>任务说明</h3><p className="muted">{task?.description || "这里展示任务目标、要求和备注。"}</p></div></div></div></div>
        </div>
    );
}

function FinishModal({ open, timer, finishForm, setFinishForm, close, submit }) {
    if (!open) return null;
    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal"><div className="modal-head"><span>结束学习</span><button className="icon-btn" onClick={close}>×</button></div><div className="modal-body"><div className="modal-stack"><div className="timer-display"><span className="muted">本次学习时长</span><strong>{timer.elapsed}</strong><span className="muted">会记录到任务，并绑定当前学科对话。</span></div><div><h3>任务状态</h3><div className="finish-grid">{[["done", "完成"], ["partial", "部分完成"], ["missed", "未完成"]].map(([status, label]) => <button className={`plain-btn ${finishForm.status === status ? "active-soft" : ""}`} key={status} onClick={() => setFinishForm((prev) => ({ ...prev, status }))}>{label}</button>)}</div></div><div><h3>学习进度</h3><textarea className="finish-note" value={finishForm.note} onChange={(event) => setFinishForm((prev) => ({ ...prev, note: event.target.value }))} placeholder="简单报告本次进度：完成了什么、还剩什么、是否需要调整后续日程。" /></div><div className="button-row"><button className="primary-btn" onClick={submit}>提交进度</button><button className="plain-btn" onClick={() => { setFinishForm((prev) => ({ ...prev, note: "" })); submit(); }}>仅记录时间</button></div></div></div></div>
        </div>
    );
}

function UpdatePlanModal({ open, close, update }) {
    if (!open) return null;
    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal"><div className="modal-head"><span>是否更新规划</span><button className="icon-btn" onClick={close}>×</button></div><div className="modal-body"><div className="modal-stack"><div className="timer-display"><span className="muted">学习记录已保存</span><strong className="question-title">需要调整后续安排吗？</strong><span className="muted">如果选择更新规划，将进入 AI 规划页继续对话。</span></div><div className="button-row right"><button className="plain-btn" onClick={close}>暂不更新</button><button className="primary-btn" onClick={update}>更新规划</button></div></div></div></div>
        </div>
    );
}
