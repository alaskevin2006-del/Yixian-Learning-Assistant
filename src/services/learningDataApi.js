import { supabase } from "./supabaseClient";

const TABLES = {
    tasks: "learning_tasks",
    sessions: "study_sessions",
    blockages: "learning_blockages",
    reviews: "learning_reviews",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FIELD_ALIASES = {
    clientId: "client_id",
    userId: "user_id",
    taskId: "task_id",
    taskClientId: "task_client_id",
    linkedTaskId: "task_client_id",
    linkedTaskIds: "task_client_id",
    subjectId: "subject_id",
    draftId: "draft_id",
    conversationId: "conversation_id",
    coreExplanation: "description",
    type: "task_type",
    taskType: "task_type",
    plannedDate: "planned_date",
    estMinutes: "est_minutes",
    reviewCount: "review_count",
    startAt: "started_at",
    startedAt: "started_at",
    endAt: "ended_at",
    endedAt: "ended_at",
    studyDate: "study_date",
    resolvedAt: "resolved_at",
    reviewType: "review_type",
    completedAt: "completed_at",
    createdAt: "client_created_at",
    updatedAt: "client_updated_at",
};

const TABLE_FIELDS = {
    [TABLES.tasks]: new Set([
        "id",
        "user_id",
        "client_id",
        "title",
        "subject",
        "subject_id",
        "draft_id",
        "conversation_id",
        "task_type",
        "status",
        "priority",
        "difficulty",
        "mastery",
        "planned_date",
        "slot",
        "est_minutes",
        "source",
        "done",
        "blocked",
        "review_count",
        "client_created_at",
        "client_updated_at",
        "metadata",
    ]),
    [TABLES.sessions]: new Set([
        "id",
        "user_id",
        "client_id",
        "task_id",
        "task_client_id",
        "subject",
        "subject_id",
        "conversation_id",
        "minutes",
        "started_at",
        "ended_at",
        "study_date",
        "note",
        "mastery",
        "client_created_at",
        "client_updated_at",
        "metadata",
    ]),
    [TABLES.blockages]: new Set([
        "id",
        "user_id",
        "client_id",
        "task_id",
        "task_client_id",
        "subject",
        "subject_id",
        "title",
        "description",
        "status",
        "severity",
        "resolved_at",
        "client_created_at",
        "client_updated_at",
        "metadata",
    ]),
    [TABLES.reviews]: new Set([
        "id",
        "user_id",
        "client_id",
        "task_id",
        "task_client_id",
        "subject",
        "subject_id",
        "title",
        "review_type",
        "planned_date",
        "completed_at",
        "note",
        "score",
        "client_created_at",
        "client_updated_at",
        "metadata",
    ]),
};

function requireSupabase() {
    if (!supabase) {
        throw new Error("Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
    }
    return supabase;
}

async function getUserId(explicitUserId) {
    if (explicitUserId) return explicitUserId;
    const client = requireSupabase();
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (!data?.user?.id) throw new Error("Please sign in before syncing learning data.");
    return data.user.id;
}

function isUuid(value) {
    return UUID_RE.test(String(value || ""));
}

function normalizeFieldName(key) {
    return FIELD_ALIASES[key] || key;
}

function compactObject(value) {
    return Object.fromEntries(
        Object.entries(value).filter(([, item]) => item !== undefined),
    );
}

function normalizePayload(table, payload, userId) {
    const allowedFields = TABLE_FIELDS[table];
    const input = payload && typeof payload === "object" ? payload : {};
    const normalized = {};
    const metadata = { ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}) };

    Object.entries(input).forEach(([key, value]) => {
        if (value === undefined) return;
        const field = normalizeFieldName(key);
        if (field === "id" && value && !isUuid(value)) {
            normalized.client_id = String(value);
            return;
        }
        if (allowedFields.has(field)) {
            normalized[field] = value;
            return;
        }
        metadata[key] = value;
    });

    if (userId && !normalized.user_id) normalized.user_id = userId;
    if (Object.keys(metadata).length > 0) normalized.metadata = metadata;

    return compactObject(normalized);
}

function normalizeListOptions(options = {}) {
    return {
        limit: Number.isFinite(options.limit) ? options.limit : 100,
        orderBy: options.orderBy || "updated_at",
        ascending: Boolean(options.ascending),
        filters: options.filters && typeof options.filters === "object" ? options.filters : {},
    };
}

async function listRows(table, options = {}) {
    const userId = await getUserId(options.userId);
    const { limit, orderBy, ascending, filters } = normalizeListOptions(options);
    let query = requireSupabase()
        .from(table)
        .select("*")
        .eq("user_id", userId)
        .order(orderBy, { ascending })
        .limit(limit);

    Object.entries(filters).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        query = query.eq(normalizeFieldName(key), value);
    });

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

async function createRow(table, payload, options = {}) {
    const userId = await getUserId(options.userId);
    const row = normalizePayload(table, payload, userId);
    if (table === TABLES.tasks) {
        console.info("[learning-sync] insert payload", row);
    } else if (table === TABLES.sessions) {
        console.info("[learning-sync] study session insert payload", row);
    } else if (table === TABLES.blockages) {
        console.info("[learning-sync] blockage insert payload", row);
    } else if (table === TABLES.reviews) {
        console.info("[learning-sync] review insert payload", row);
    }
    const { data, error } = await requireSupabase()
        .from(table)
        .insert(row)
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function upsertRow(table, payload, options = {}) {
    const userId = await getUserId(options.userId);
    const row = normalizePayload(table, payload, userId);
    const onConflict = options?.onConflict || "user_id,client_id";
    if (table === TABLES.sessions) {
        console.info("[learning-sync] study session upsert payload", row);
    } else if (table === TABLES.reviews) {
        console.info("[learning-sync] review upsert payload", row);
    } else {
        console.info("[learning-sync] upsert payload", row);
    }

    const { data, error } = await requireSupabase()
        .from(table)
        .upsert(row, { onConflict })
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function updateRow(table, idOrClientId, patch, options = {}) {
    const userId = await getUserId(options.userId);
    const value = String(idOrClientId || "").trim();
    if (!value) throw new Error("A row id or client_id is required for update.");

    const idColumn = isUuid(value) ? "id" : "client_id";
    const row = normalizePayload(table, patch, userId);
    delete row.id;
    delete row.client_id;
    delete row.user_id;

    const { data, error } = await requireSupabase()
        .from(table)
        .update(row)
        .eq("user_id", userId)
        .eq(idColumn, value)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export function listLearningTasks(options) {
    return listRows(TABLES.tasks, options);
}

export function createLearningTask(task, options) {
    return createRow(TABLES.tasks, task, options);
}

export function updateLearningTask(idOrClientId, patch, options) {
    return updateRow(TABLES.tasks, idOrClientId, patch, options);
}

export function listStudySessions(options) {
    return listRows(TABLES.sessions, options);
}

export function createStudySession(session, options) {
    return upsertRow(TABLES.sessions, session, { ...options, onConflict: "user_id,client_id" });
}

export function updateStudySession(idOrClientId, patch, options) {
    return updateRow(TABLES.sessions, idOrClientId, patch, options);
}

export function listLearningBlockages(options) {
    return listRows(TABLES.blockages, options);
}

export function createLearningBlockage(blockage, options) {
    return createRow(TABLES.blockages, blockage, options);
}

export function updateLearningBlockage(idOrClientId, patch, options) {
    return updateRow(TABLES.blockages, idOrClientId, patch, options);
}

export function listLearningReviews(options) {
    return listRows(TABLES.reviews, options);
}

export function createLearningReview(review, options) {
    return upsertRow(TABLES.reviews, review, { ...options, onConflict: "user_id,client_id" });
}

export function updateLearningReview(idOrClientId, patch, options) {
    return updateRow(TABLES.reviews, idOrClientId, patch, options);
}
