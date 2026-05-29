const SEARCH_TOP_K = 8;
const RETRIEVE_TOP_K = 5;

function requireEnv(name) {
    const value = import.meta.env[name];
    if (!value) {
        throw new Error(`缺少前端环境变量：${name}`);
    }
    return value;
}

function normalizeResult(result) {
    const metadata = result?.metadata && typeof result.metadata === "object" ? result.metadata : {};
    const chapter = String(metadata.chapter || result?.chapter || "");
    const section = String(metadata.section || result?.section || "");
    const pathFallback = [metadata.path, chapter, section].map((v) => String(v || "").trim()).filter(Boolean).join(" / ");
    const previewFallback = String(result?.summary || metadata.summary || "").trim();
    return {
        resourceId: String(result?.resourceId || result?.resource_id || ""),
        fileId: String(result?.fileId || result?.resourceId || result?.resource_id || ""),
        chunkId: String(result?.chunkId || result?.chunk_id || ""),
        scope: result?.scope === "private" ? "private" : "public",
        title: String(result?.title || "未命名资源"),
        fileType: String(result?.fileType || result?.file_type || ""),
        path: String(result?.path || metadata.path || pathFallback || ""),
        chapter,
        section,
        pageStart: result?.pageStart ?? result?.page_start ?? metadata.pageStart ?? metadata.page_start ?? null,
        pageEnd: result?.pageEnd ?? result?.page_end ?? metadata.pageEnd ?? metadata.page_end ?? null,
        contentPreview: String(result?.contentPreview || result?.content_preview || result?.snippet || previewFallback || ""),
        score: Number(result?.score || 0),
        canPreview: result?.canPreview ?? true,
        canDownload: result?.canDownload ?? false,
        canReference: result?.canReference ?? true,
    };
}

function searchErrorMessage(status, payload) {
    const detail = String(payload?.error || payload?.message || "").trim();
    if (status === 401 || status === 403) {
        return "公共资源搜索失败：search-resources Edge Function 权限校验未通过";
    }
    if (status === 404) {
        return "公共资源搜索失败：请检查 search-resources Edge Function 是否已部署";
    }
    if (status >= 500) {
        return `公共资源搜索失败：请检查 search-resources Edge Function 是否已部署${detail ? `（${detail}）` : ""}`;
    }
    return `公共资源搜索失败：${detail || `HTTP ${status}`}`;
}

export async function searchResources(query, options = {}) {
    const trimmed = String(query || "").trim();
    if (!trimmed) return [];

    const supabaseUrl = requireEnv("VITE_SUPABASE_URL").replace(/\/$/, "");
    const anonKey = requireEnv("VITE_SUPABASE_ANON_KEY");
    const response = await fetch(`${supabaseUrl}/functions/v1/search-resources`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
            query: trimmed,
            scope: options.scope || "public",
            topK: SEARCH_TOP_K,
            ...(options.subjectId ? { subjectId: options.subjectId } : {}),
            ...(Array.isArray(options.resourceIds) ? { resourceIds: options.resourceIds } : {}),
        }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        console.warn("public resource search failed", {
            status: response.status,
            payload,
            query: trimmed,
        });
        throw new Error(searchErrorMessage(response.status, payload));
    }
    return Array.isArray(payload?.results) ? payload.results.map(normalizeResult) : [];
}

function normalizeCitation(citation) {
    const metadata = citation?.metadata && typeof citation.metadata === "object" ? citation.metadata : {};
    return {
        title: String(citation?.title || metadata.title || "引用资料"),
        chunkId: String(citation?.chunkId || citation?.chunk_id || ""),
        resourceId: String(citation?.resourceId || citation?.resource_id || ""),
        contentPreview: String(citation?.contentPreview || citation?.content_preview || citation?.snippet || citation?.text || "").trim(),
        chapter: String(citation?.chapter || metadata.chapter || ""),
        section: String(citation?.section || metadata.section || ""),
        pageStart: citation?.pageStart ?? citation?.page_start ?? metadata.pageStart ?? metadata.page_start ?? null,
        pageEnd: citation?.pageEnd ?? citation?.page_end ?? metadata.pageEnd ?? metadata.page_end ?? null,
        score: Number(citation?.score || 0),
    };
}

export async function retrieveContext(query) {
    const options = arguments.length > 1 && arguments[1] && typeof arguments[1] === "object" ? arguments[1] : {};
    const trimmed = String(query || "").trim();
    const hasReferences = Array.isArray(options.references) && options.references.length > 0;
    if (!trimmed && !hasReferences) return { contextText: "", citations: [] };
    const supabaseUrl = requireEnv("VITE_SUPABASE_URL").replace(/\/$/, "");
    const anonKey = requireEnv("VITE_SUPABASE_ANON_KEY");
    const response = await fetch(`${supabaseUrl}/functions/v1/retrieve-context`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
            query: trimmed,
            scope: "public",
            topK: Number(options.topK || RETRIEVE_TOP_K),
            ...(Array.isArray(options.references) ? { references: options.references } : {}),
            ...(options.scope ? { scope: options.scope } : {}),
            ...(options.subjectId ? { subjectId: options.subjectId } : {}),
            ...(Array.isArray(options.resourceIds) ? { resourceIds: options.resourceIds } : {}),
            ...(options.maxChars ? { maxChars: options.maxChars } : {}),
        }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        console.warn("resource context retrieval failed", {
            status: response.status,
            payload,
            query: trimmed,
        });
        throw new Error(payload?.error || `资料引用请求失败：HTTP ${response.status}`);
    }
    return {
        contextText: String(payload?.contextText || ""),
        citations: Array.isArray(payload?.citations) ? payload.citations.map(normalizeCitation) : [],
        usage: payload?.usage && typeof payload.usage === "object" ? payload.usage : {},
        chunkCount: Number(payload?.chunkCount || 0),
    };
}
