import { compactObject, getCurrentUserId, requireSupabase } from "./coreDataApi";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidOrUndefined(value) {
    const text = String(value || "").trim();
    return UUID_RE.test(text) ? text : undefined;
}

function normalizeDraft(row) {
    if (!row) return null;
    return {
        id: row.id,
        conversationId: row.planning_conversation_id,
        subjectId: row.subject_id || "",
        title: row.title || "未命名任务",
        description: row.description || "",
        plannedStart: row.planned_start || "",
        plannedEnd: row.planned_end || "",
        status: row.status || "draft",
        sourceMessageId: row.source_message_id || "",
        createdTaskId: row.created_task_id || "",
        metadata: row.metadata || {},
        createdAt: row.created_at || "",
        updatedAt: row.updated_at || "",
    };
}

export async function listPlanningDrafts(conversationId, options = {}) {
    const userId = await getCurrentUserId(options.userId);
    const { data, error } = await requireSupabase()
        .from("planning_drafts")
        .select("*")
        .eq("user_id", userId)
        .eq("planning_conversation_id", conversationId)
        .neq("status", "deleted")
        .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeDraft).filter(Boolean);
}

export async function upsertPlanningDraft(draft, options = {}) {
    const userId = await getCurrentUserId(options.userId);
    const row = compactObject({
        id: uuidOrUndefined(draft?.id),
        user_id: userId,
        planning_conversation_id: draft?.conversationId || draft?.planningConversationId,
        subject_id: draft?.subjectId || null,
        title: String(draft?.title || "").trim(),
        description: String(draft?.description || ""),
        planned_start: draft?.plannedStart || null,
        planned_end: draft?.plannedEnd || null,
        status: draft?.status || "draft",
        source_message_id: draft?.sourceMessageId || null,
        created_task_id: draft?.createdTaskId || null,
        metadata: draft?.metadata && typeof draft.metadata === "object" ? draft.metadata : {},
    });
    if (!row.planning_conversation_id) throw new Error("缺少规划对话。");
    if (!row.title) throw new Error("任务草案标题不能为空。");
    const { data, error } = await requireSupabase()
        .from("planning_drafts")
        .upsert(row)
        .select()
        .single();
    if (error) throw error;
    return normalizeDraft(data);
}

export async function updatePlanningDraft(id, patch = {}, options = {}) {
    const userId = await getCurrentUserId(options.userId);
    const row = compactObject({
        subject_id: patch.subjectId,
        title: patch.title,
        description: patch.description,
        planned_start: patch.plannedStart,
        planned_end: patch.plannedEnd,
        status: patch.status,
        created_task_id: patch.createdTaskId,
        metadata: patch.metadata,
    });
    const { data, error } = await requireSupabase()
        .from("planning_drafts")
        .update(row)
        .eq("user_id", userId)
        .eq("id", id)
        .select()
        .single();
    if (error) throw error;
    return normalizeDraft(data);
}
