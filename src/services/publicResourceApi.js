import { requireSupabase } from "./coreDataApi";
import { retrieveContext, searchResources } from "./resourceApi";

const BLOCKED_PUBLIC_RESOURCE_PATTERNS = [
    "高等数学下册",
    "高数",
    "pinecone",
];

export function listPendingPublicUploads() {
    return [];
}

export function queuePublicResourceUpload(file) {
    return {
        resourceId: `public-upload-${Date.now().toString(36)}`,
        chunkId: "",
        scope: "public",
        title: file?.name || "未命名公共资料",
        fileType: String(file?.name || "").split(".").pop()?.toUpperCase() || "FILE",
        path: "公共资料 / 待处理上传",
        chapter: "待处理",
        section: "等待公共资料处理流程",
        contentPreview: "文件已进入本地待处理队列。接入公共资料切片、审核、向量入库后会替换为真实公共资料记录。",
        canPreview: true,
        canDownload: false,
        canReference: false,
        uploadStatus: "pending_processing",
        createdAt: new Date().toISOString(),
    };
}

export async function listPublicResources(query = "") {
    const pending = listPendingPublicUploads();
    const trimmed = String(query || "").trim();
    const remote = await listPublicResourceRows(trimmed).catch(() => []);
    return mergeResourceResults(pending, remote);
}

export async function searchPublicResources(query) {
    const trimmed = String(query || "").trim();
    if (!trimmed) return listPublicResources();
    const aiMatches = await searchResources(trimmed, { scope: "public" }).catch(() => []);
    const rowMatches = await listPublicResourceRows(trimmed).catch(() => []);
    const pendingMatches = listPendingPublicUploads().filter((item) => {
        const haystack = [item.title, item.path, item.contentPreview].join(" ").toLowerCase();
        return haystack.includes(trimmed.toLowerCase());
    });
    return mergeResourceResults(pendingMatches, aiMatches, rowMatches);
}

function normalizePublicResourceRow(row = {}) {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const title = String(row.name || metadata.originalName || metadata.fileName || "公共资料");
    return {
        id: String(row.id || ""),
        resourceId: String(row.id || ""),
        chunkId: "",
        scope: "public",
        title,
        fileType: String(row.file_type || metadata.fileType || "file").toUpperCase(),
        path: String(metadata.path || metadata.folder || title),
        chapter: String(metadata.chapter || ""),
        section: String(metadata.section || ""),
        contentPreview: String(row.summary || metadata.summary || ""),
        canPreview: row.can_preview !== false,
        canDownload: row.can_download !== false,
        canReference: row.can_reference !== false,
        tags: Array.isArray(row.tags) ? row.tags : [],
        metadata,
        createdAt: row.created_at || "",
        updatedAt: row.updated_at || "",
    };
}

function mergeResourceResults(...groups) {
    const seen = new Set();
    return groups.flat().filter((item) => {
        if (isBlockedPublicResource(item)) return false;
        const key = `${item.scope || "public"}:${item.resourceId || item.id || ""}:${item.chunkId || ""}`;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function isBlockedPublicResource(resource = {}) {
    const text = [
        resource.title,
        resource.path,
        resource.chapter,
        resource.section,
        resource.contentPreview,
        resource.resourceId,
        resource.chunkId,
        resource.metadata?.originalName,
        resource.metadata?.fileName,
        resource.metadata?.path,
        resource.metadata?.folder,
    ].filter(Boolean).join(" ").toLowerCase();

    return BLOCKED_PUBLIC_RESOURCE_PATTERNS.some((pattern) => text.includes(pattern.toLowerCase()));
}

async function listPublicResourceRows(query = "") {
    const client = requireSupabase();
    const select = "id,name,type,scope,file_type,summary,tags,metadata,can_preview,can_download,can_reference,created_at,updated_at";
    let request = client
        .from("resources")
        .select(select)
        .eq("scope", "public")
        .eq("type", "file")
        .order("updated_at", { ascending: false })
        .limit(query ? 200 : 50);

    const { data, error } = await request;
    if (error) throw error;

    const trimmed = String(query || "").trim();
    const normalized = (data || []).map(normalizePublicResourceRow);
    if (!trimmed) return normalized;

    const lower = trimmed.toLowerCase();
    return normalized.filter((item) => {
        const tagText = (item.tags || []).join(" ").toLowerCase();
        const metadataText = [
            item.metadata?.originalName,
            item.metadata?.fileName,
            item.metadata?.path,
            item.metadata?.folder,
        ].join(" ").toLowerCase();
        return [item.title, item.contentPreview, item.path].join(" ").toLowerCase().includes(lower)
            || tagText.includes(lower)
            || metadataText.includes(lower);
    });
}

export async function previewPublicResource(resource) {
    if (!resource || resource.uploadStatus) {
        return { ...resource, loading: false };
    }
    const context = await retrieveContext(resource.title || resource.contentPreview || "资料", {
        references: [{ resourceId: resource.resourceId, chunkId: resource.chunkId }],
        scope: "public",
        maxChars: 3200,
    }).catch(() => ({ contextText: resource.contentPreview || "", citations: [] }));
    return {
        ...resource,
        contentPreview: context.contextText || resource.contentPreview || "",
        citations: context.citations || [],
        loading: false,
    };
}

export function publicResourceMarkdown(resource) {
    return [
        `# ${resource?.title || "公共资料"}`,
        "",
        resource?.path ? `路径：${resource.path}` : "",
        resource?.chapter || resource?.section ? `章节：${[resource.chapter, resource.section].filter(Boolean).join(" / ")}` : "",
        "",
        resource?.contentPreview || "当前公共资料不提供原文件下载，可通过打开或引用查看切片内容。",
    ].filter(Boolean).join("\n");
}
