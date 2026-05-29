import { compactObject, getCurrentUserId, requireSupabase } from "./coreDataApi";

function normalizeSubject(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name || "未命名学科",
        instruction: row.instruction || "",
        archivedAt: row.archived_at || "",
        createdAt: row.created_at || "",
        updatedAt: row.updated_at || "",
        metadata: row.metadata || {},
    };
}

function subjectPayload(subject, userId) {
    const name = String(subject?.name || "").trim();
    if (!name) throw new Error("学科名称不能为空。");
    return compactObject({
        user_id: userId,
        name,
        instruction: String(subject?.instruction || ""),
        metadata: subject?.metadata && typeof subject.metadata === "object" ? subject.metadata : {},
    });
}

export async function listSubjects(options = {}) {
    const userId = await getCurrentUserId(options.userId);
    const { data, error } = await requireSupabase()
        .from("subjects")
        .select("*")
        .eq("user_id", userId)
        .is("archived_at", null)
        .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeSubject).filter(Boolean);
}

export async function createSubject(subject, options = {}) {
    const userId = await getCurrentUserId(options.userId);
    const { data, error } = await requireSupabase()
        .from("subjects")
        .insert(subjectPayload(subject, userId))
        .select()
        .single();
    if (error) throw error;
    return normalizeSubject(data);
}

export async function updateSubject(subject, options = {}) {
    const userId = await getCurrentUserId(options.userId);
    const id = String(subject?.id || "").trim();
    if (!id) throw new Error("缺少学科 id。");
    const { data, error } = await requireSupabase()
        .from("subjects")
        .update(subjectPayload(subject, userId))
        .eq("user_id", userId)
        .eq("id", id)
        .select()
        .single();
    if (error) throw error;
    return normalizeSubject(data);
}

export async function upsertSubject(subject, options = {}) {
    if (subject?.id) return updateSubject(subject, options);
    const userId = await getCurrentUserId(options.userId);
    const { data, error } = await requireSupabase()
        .from("subjects")
        .upsert(subjectPayload(subject, userId), { onConflict: "user_id,name" })
        .select()
        .single();
    if (error) throw error;
    return normalizeSubject(data);
}

export async function archiveSubject(id, options = {}) {
    const userId = await getCurrentUserId(options.userId);
    const { data, error } = await requireSupabase()
        .from("subjects")
        .update({ archived_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("id", id)
        .select()
        .single();
    if (error) throw error;
    return normalizeSubject(data);
}
