import { compactObject, getCurrentUserId, requireSupabase } from "./coreDataApi";

function normalizeRelation(row) {
    if (!row) return null;
    return {
        id: row.id,
        subjectId: row.subject_id,
        resourceId: row.resource_id,
        scope: row.resource_scope || "public",
        relation: row.relation || "reference",
        metadata: row.metadata || {},
        createdAt: row.created_at || "",
    };
}

export async function listSubjectResources(subjectId, options = {}) {
    const userId = await getCurrentUserId(options.userId);
    const { data, error } = await requireSupabase()
        .from("subject_resources")
        .select("*")
        .eq("user_id", userId)
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeRelation).filter(Boolean);
}

export async function addSubjectResource(subjectId, resource, options = {}) {
    const userId = await getCurrentUserId(options.userId);
    const row = compactObject({
        user_id: userId,
        subject_id: subjectId,
        resource_id: String(resource?.resourceId || resource?.id || "").trim(),
        resource_scope: resource?.scope === "private" ? "private" : "public",
        relation: resource?.relation || (resource?.scope === "private" ? "own" : "reference"),
        metadata: resource?.metadata && typeof resource.metadata === "object" ? resource.metadata : {
            title: resource?.title || "",
            fileType: resource?.fileType || resource?.file_type || "",
        },
    });
    if (!row.resource_id) throw new Error("缺少资料 ID。");
    const { data, error } = await requireSupabase()
        .from("subject_resources")
        .upsert(row, { onConflict: "user_id,subject_id,resource_id,resource_scope" })
        .select()
        .single();
    if (error) throw error;
    return normalizeRelation(data);
}

export async function removeSubjectResource(id, options = {}) {
    const userId = await getCurrentUserId(options.userId);
    const { error } = await requireSupabase()
        .from("subject_resources")
        .delete()
        .eq("user_id", userId)
        .eq("id", id);
    if (error) throw error;
}
