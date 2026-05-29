import { compactObject, getCurrentUserId, oneLine, requireSupabase } from "./coreDataApi";

function normalizeConversation(row) {
    if (!row) return null;
    return {
        id: row.id,
        subjectId: row.subject_id || "",
        type: row.type || "subject",
        title: row.title || "新对话",
        status: row.status || "active",
        lastMessageAt: row.last_message_at || "",
        createdAt: row.created_at || "",
        updatedAt: row.updated_at || "",
        metadata: row.metadata || {},
    };
}

function normalizeMessage(row) {
    if (!row) return null;
    return {
        id: row.id,
        conversationId: row.conversation_id,
        role: row.role,
        content: row.content || "",
        text: row.content || "",
        citations: Array.isArray(row.citations) ? row.citations : [],
        attachments: Array.isArray(row.attachments) ? row.attachments : [],
        metadata: row.metadata || {},
        createdAt: row.created_at || "",
    };
}

export async function listConversations(options = {}) {
    const userId = await getCurrentUserId(options.userId);
    let query = requireSupabase()
        .from("conversations")
        .select("*")
        .eq("user_id", userId)
        .eq("type", options.type || "subject")
        .eq("status", options.status || "active")
        .order("updated_at", { ascending: false });
    if (options.subjectId) query = query.eq("subject_id", options.subjectId);
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(normalizeConversation).filter(Boolean);
}

export async function createConversation(payload = {}, options = {}) {
    const userId = await getCurrentUserId(options.userId);
    const row = compactObject({
        user_id: userId,
        subject_id: payload.subjectId || null,
        type: payload.type || "subject",
        title: payload.title || "新对话",
        status: payload.status || "active",
        last_message_at: new Date().toISOString(),
        metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
    });
    const { data, error } = await requireSupabase()
        .from("conversations")
        .insert(row)
        .select()
        .single();
    if (error) throw error;
    return normalizeConversation(data);
}

export async function updateConversation(id, patch = {}, options = {}) {
    const userId = await getCurrentUserId(options.userId);
    const row = compactObject({
        subject_id: patch.subjectId,
        type: patch.type,
        title: patch.title,
        status: patch.status,
        last_message_at: patch.lastMessageAt,
        metadata: patch.metadata,
    });
    const { data, error } = await requireSupabase()
        .from("conversations")
        .update(row)
        .eq("user_id", userId)
        .eq("id", id)
        .select()
        .single();
    if (error) throw error;
    return normalizeConversation(data);
}

export async function listConversationMessages(conversationId, options = {}) {
    const userId = await getCurrentUserId(options.userId);
    const { data, error } = await requireSupabase()
        .from("conversation_messages")
        .select("*")
        .eq("user_id", userId)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map(normalizeMessage).filter(Boolean);
}

export async function addConversationMessage(conversationId, message = {}, options = {}) {
    const userId = await getCurrentUserId(options.userId);
    const content = String(message.content ?? message.text ?? "").trim();
    if (!content) throw new Error("消息内容不能为空。");
    const row = {
        user_id: userId,
        conversation_id: conversationId,
        role: message.role === "user" || message.role === "assistant" || message.role === "system" ? message.role : "assistant",
        content,
        citations: Array.isArray(message.citations) ? message.citations : [],
        attachments: Array.isArray(message.attachments) ? message.attachments : [],
        metadata: message.metadata && typeof message.metadata === "object" ? message.metadata : {},
    };
    const { data, error } = await requireSupabase()
        .from("conversation_messages")
        .insert(row)
        .select()
        .single();
    if (error) throw error;

    await updateConversation(conversationId, {
        title: message.role === "user" ? oneLine(content, 18) : undefined,
        lastMessageAt: new Date().toISOString(),
    }, { userId }).catch(() => null);

    return normalizeMessage(data);
}
