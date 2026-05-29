import { compactObject, getCurrentUserId, requireSupabase } from "./coreDataApi";

function normalizeReview(row) {
    if (!row) return null;
    return {
        id: row.id,
        subjectId: row.subject_id,
        conversationId: row.conversation_id || "",
        sourceMessageId: row.source_message_id || "",
        originalText: row.original_text || "",
        polishedText: row.polished_text || "",
        harvestText: row.harvest_text || "",
        status: row.status || "pending",
        metadata: row.metadata || {},
        createdAt: row.created_at || "",
        updatedAt: row.updated_at || "",
    };
}

export async function listSubjectReviews(subjectId, options = {}) {
    const userId = await getCurrentUserId(options.userId);
    const { data, error } = await requireSupabase()
        .from("subject_review_items")
        .select("*")
        .eq("user_id", userId)
        .eq("subject_id", subjectId)
        .order("updated_at", { ascending: false })
        .limit(options.limit || 60);
    if (error) throw error;
    return (data || []).map(normalizeReview).filter(Boolean);
}

export async function upsertSubjectReview(review, options = {}) {
    const userId = await getCurrentUserId(options.userId);
    const row = compactObject({
        id: review?.id,
        user_id: userId,
        subject_id: review?.subjectId,
        conversation_id: review?.conversationId || null,
        source_message_id: review?.sourceMessageId || null,
        original_text: String(review?.originalText || ""),
        polished_text: String(review?.polishedText || ""),
        harvest_text: String(review?.harvestText || ""),
        status: review?.status || "pending",
        metadata: review?.metadata && typeof review.metadata === "object" ? review.metadata : {},
    });
    if (!row.subject_id) throw new Error("缺少学科。");
    const { data, error } = await requireSupabase()
        .from("subject_review_items")
        .upsert(row)
        .select()
        .single();
    if (error) throw error;
    return normalizeReview(data);
}
