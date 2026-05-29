import { retrieveContext } from "./resourceApi";

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
    if (!String(query || "").trim()) return pending;
    return pending;
}

export async function searchPublicResources(query) {
    const trimmed = String(query || "").trim();
    if (!trimmed) return listPublicResources();
    const pendingMatches = listPendingPublicUploads().filter((item) => {
        const haystack = [item.title, item.path, item.contentPreview].join(" ").toLowerCase();
        return haystack.includes(trimmed.toLowerCase());
    });
    return pendingMatches;
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
