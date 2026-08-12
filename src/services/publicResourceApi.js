import { requireSupabase } from "./coreDataApi";
import { retrieveContext, searchResources } from "./resourceApi";

const DEFAULT_PUBLIC_RESOURCE_QUERIES = ["高等数学", "线性代数", "大学物理"];

const DEFAULT_PUBLIC_RESOURCE_BUCKET = "public-resources";

const FALLBACK_PUBLIC_RESOURCES = [
    {
        title: "李&周 高等数学 下.pdf",
        subject: "高等数学",
        kind: "课本教材",
        path: "资源/高数资源/李&周 高等数学 下.pdf",
        storagePath: "public/f6a2cffc-8b67-5ca6-b8b1-c64dcbad1600/f6a2cffc-8b67-5ca6-b8b1-c64dcbad1600-61dbd32449.pdf",
    },
    {
        title: "中山大学《高等数学下》2019-2020学年期末试卷.pdf",
        subject: "高等数学",
        kind: "历年试卷",
        path: "资源/高数资源/中山大学《高等数学下》2019-2020学年期末试卷.pdf",
        storagePath: "public/59785944-67b5-50f3-b45e-8b50591a257e/59785944-67b5-50f3-b45e-8b50591a257e-c6215fa61f.pdf",
    },
    {
        title: "中山大学2016-2017学年第2学期《高等数学A下》期末考试试卷.pdf",
        subject: "高等数学",
        kind: "历年试卷",
        path: "资源/高数资源/中山大学2016-2017学年第2学期《高等数学A下》期末考试试卷.pdf",
        storagePath: "public/b330a62a-b71e-5265-9253-b53e634e5fb8/b330a62a-b71e-5265-9253-b53e634e5fb8-b886c6dd3f.pdf",
    },
    {
        title: "中山大学《线性代数》2021-2022学年期末试卷.pdf",
        subject: "线性代数",
        kind: "历年试卷",
        path: "资源/【第3期】中山大学/中山大学《线性代数》2021-2022学年期末试卷.pdf",
        storagePath: "public/13847281-a2fc-5eea-b412-f55ef0d026f2/13847281-a2fc-5eea-b412-f55ef0d026f2-d3c6c2f421.pdf",
    },
    {
        title: "中山大学《线性代数》2023-2024学年第一学期期末试卷.pdf",
        subject: "线性代数",
        kind: "历年试卷",
        path: "资源/【第4期】中山大学/中山大学《线性代数》2023-2024学年第一学期期末试卷.pdf",
        storagePath: "public/cad2ac8c-25dc-5657-a94b-50817cdabdf9/cad2ac8c-25dc-5657-a94b-50817cdabdf9-b945d8db28.pdf",
    },
    {
        title: "中山大学《大学物理》2023-2024学年第一学期期末试卷.pdf",
        subject: "大学物理",
        kind: "历年试卷",
        path: "资源/【第4期】中山大学/中山大学《大学物理》2023-2024学年第一学期期末试卷.pdf",
        storagePath: "public/08cfba49-424f-5416-af1f-4a6001b8b3c1/08cfba49-424f-5416-af1f-4a6001b8b3c1-e33aa07798.pdf",
    },
    {
        title: "中山大学《大学物理》2022-2023学年第一学期期末试卷.pdf",
        subject: "大学物理",
        kind: "历年试卷",
        path: "资源/【第4期】中山大学/中山大学《大学物理》2022-2023学年第一学期期末试卷.pdf",
        storagePath: "public/1bcf9a2d-83b0-50d1-a145-266e0efc4a8a/1bcf9a2d-83b0-50d1-a145-266e0efc4a8a-87a0ef6bf0.pdf",
    },
].map((resource) => ({
    ...resource,
    resourceId: resource.storagePath.split("/")[1] || resource.title,
    chunkId: "",
    scope: "public",
    fileType: "PDF",
    storageBucket: DEFAULT_PUBLIC_RESOURCE_BUCKET,
    canPreview: true,
    canDownload: true,
    canReference: true,
    metadata: {
        subject: resource.subject,
        resourceType: resource.kind,
        originalPath: resource.path,
        storagePath: resource.storagePath,
        storageBucket: DEFAULT_PUBLIC_RESOURCE_BUCKET,
        indexMode: "fallback_file_card",
    },
}));

const BLOCKED_PUBLIC_RESOURCE_PATTERNS = [
    "pinecone",
];

const HIGH_MATH_QUERY_RE = /高数|高等数学|微积分|级数|帕塞瓦尔|极限|导数|积分|calculus/i;
const LINEAR_ALGEBRA_QUERY_RE = /线代|线性代数/i;
const PHYSICS_QUERY_RE = /大物|大学物理/i;

function hasRemotePublicResourceEndpoint() {
    return Boolean(import.meta.env.VITE_PUBLIC_RESOURCE_SUPABASE_URL && import.meta.env.VITE_PUBLIC_RESOURCE_ANON_KEY);
}

function metadataOf(resource) {
    return resource?.metadata && typeof resource.metadata === "object" ? resource.metadata : {};
}

function uniqueValues(values) {
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function queryVariants(query) {
    const trimmed = String(query || "").trim();
    const variants = trimmed ? [trimmed] : DEFAULT_PUBLIC_RESOURCE_QUERIES;

    if (HIGH_MATH_QUERY_RE.test(trimmed)) {
        variants.push(
            "高等数学第三版下册",
            "高等数学B下",
            "高数下册帕塞瓦尔",
            "中山大学 高等数学",
        );
    }
    if (LINEAR_ALGEBRA_QUERY_RE.test(trimmed)) {
        variants.push("线性代数", "中山大学 线性代数");
    }
    if (PHYSICS_QUERY_RE.test(trimmed)) {
        variants.push("大学物理", "中山大学 大学物理");
    }

    return uniqueValues(variants);
}

function normalizeText(value) {
    return String(value || "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function resourceSearchText(resource) {
    const metadata = metadataOf(resource);
    return normalizeText([
        resource.title,
        resource.fileName,
        resource.subject,
        resource.kind,
        resource.fileType,
        resource.path,
        resource.chapter,
        resource.section,
        resource.contentPreview,
        metadata.subject,
        metadata.resourceType,
        metadata.kind,
        metadata.originalPath,
        metadata.relativePath,
        metadata.fileName,
        metadata.originalName,
        Array.isArray(resource.tags) ? resource.tags.join(" ") : "",
        Array.isArray(metadata.tags) ? metadata.tags.join(" ") : "",
    ].filter(Boolean).join(" "));
}

function scorePublicResource(resource, query = "") {
    const trimmed = String(query || "").trim();
    if (!trimmed) return Number(resource.score || 0) + (publicResourceOriginalUrl(resource) ? 20 : 0);

    const text = resourceSearchText(resource);
    const normalizedQuery = normalizeText(trimmed);
    const subject = normalizeText(resource.subject || metadataOf(resource).subject);
    const title = normalizeText(resource.title || resource.fileName);
    const path = normalizeText(originalPathOf(resource));
    const variants = queryVariants(trimmed).map(normalizeText);
    let score = 0;

    for (const term of variants) {
        if (!term) continue;
        if (title.includes(term)) score += 80;
        if (subject.includes(term) || term.includes(subject)) score += 55;
        if (path.includes(term)) score += 35;
        if (text.includes(term)) score += 18;
    }

    if (title.includes(normalizedQuery)) score += 80;
    if (text.includes(normalizedQuery)) score += 25;
    if (publicResourceOriginalUrl(resource)) score += 12;
    if (resource.canDownload !== false) score += 4;

    if (HIGH_MATH_QUERY_RE.test(trimmed)) {
        if (subject === "高等数学") score += 90;
        if (title.includes("高等数学") || title.includes("高数")) score += 75;
        if (path.includes("高数资源")) score += 45;
    }
    if (LINEAR_ALGEBRA_QUERY_RE.test(trimmed) && (subject === "线性代数" || title.includes("线性代数"))) score += 80;
    if (PHYSICS_QUERY_RE.test(trimmed) && (subject === "大学物理" || title.includes("大学物理"))) score += 80;

    return score + Number(resource.score || 0);
}

function cleanPreview(resource) {
    const metadata = metadataOf(resource);
    const subject = String(resource.subject || metadata.subject || "").trim();
    const kind = String(resource.kind || metadata.resourceType || metadata.kind || "").trim();
    const year = String(metadata.yearTerm || metadata.year || "").trim();
    const sourcePath = String(metadata.originalPath || metadata.relativePath || resource.path || "").trim();
    const extractionOk = metadata.extractionQuality?.ok !== false && metadata.extractionStatus !== "keyword_only";
    const raw = String(resource.contentPreview || metadata.summary || "").trim();

    if (publicResourceOriginalUrl(resource) && sourcePath) {
        return [
            subject ? `学科：${subject}` : "",
            kind ? `类型：${kind}` : "",
            year ? `年份/学期：${year}` : "",
            `来源：${sourcePath}`,
        ].filter(Boolean).join(" · ");
    }

    if (!extractionOk || metadata.indexMode === "keyword_resource_card" || raw.startsWith("[PDF_PAGE")) {
        return [
            subject ? `学科：${subject}` : "",
            kind ? `类型：${kind}` : "",
            year ? `年份/学期：${year}` : "",
            sourcePath ? `来源：${sourcePath}` : "",
        ].filter(Boolean).join(" · ") || raw;
    }

    return raw;
}

function normalizePublicResource(resource) {
    const metadata = metadataOf(resource);
    return {
        ...resource,
        fileName: resource.fileName || metadata.fileName || metadata.originalName || resource.title || "",
        subject: resource.subject || metadata.subject || "",
        kind: resource.kind || metadata.resourceType || metadata.kind || "",
        tags: Array.isArray(resource.tags) ? resource.tags : (Array.isArray(metadata.tags) ? metadata.tags : []),
        storagePath: resource.storagePath || metadata.storagePath || metadata.storage_path || "",
        storageBucket: resource.storageBucket || metadata.storageBucket || metadata.storage_bucket || DEFAULT_PUBLIC_RESOURCE_BUCKET,
        path: resource.path || metadata.originalPath || metadata.relativePath || metadata.path || "",
        contentPreview: cleanPreview(resource),
        canDownload: resource.canDownload !== false && Boolean(resource.storagePath || metadata.storagePath || metadata.storage_path),
        metadata,
    };
}

async function searchRemotePublicResources(query) {
    const groups = await Promise.all(queryVariants(query).map((term) => (
        searchResources(term, { scope: "public" }).catch(() => [])
    )));
    return mergeResourceResults(...groups, FALLBACK_PUBLIC_RESOURCES, { query });
}

function encodeStoragePath(storagePath) {
    return String(storagePath || "").split("/").map(encodeURIComponent).join("/");
}

export function publicResourceOriginalUrl(resource) {
    const metadata = resource?.metadata && typeof resource.metadata === "object" ? resource.metadata : {};
    const storagePath = String(resource?.storagePath || metadata.storagePath || metadata.storage_path || "").trim();
    if (!storagePath) return "";

    const bucket = String(resource?.storageBucket || metadata.storageBucket || metadata.storage_bucket || DEFAULT_PUBLIC_RESOURCE_BUCKET).trim();
    const supabaseUrl = String(
        import.meta.env.VITE_PUBLIC_RESOURCE_SUPABASE_URL
        || import.meta.env.VITE_SUPABASE_URL
        || "",
    ).replace(/\/$/, "");
    if (!bucket || !supabaseUrl) return "";
    return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeStoragePath(storagePath)}`;
}

function originalPathOf(resource) {
    const metadata = resource?.metadata && typeof resource.metadata === "object" ? resource.metadata : {};
    return String(resource?.path || metadata.originalPath || metadata.relativePath || metadata.sourcePath || "").trim();
}

function normalizeMatchText(value) {
    return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function samePublicResource(left, right) {
    const leftTitle = normalizeMatchText(left?.title || left?.fileName || left?.name);
    const rightTitle = normalizeMatchText(right?.title || right?.fileName || right?.name);
    if (leftTitle && rightTitle && (leftTitle.includes(rightTitle) || rightTitle.includes(leftTitle))) return true;

    const leftPath = normalizeMatchText(originalPathOf(left));
    const rightPath = normalizeMatchText(originalPathOf(right));
    return Boolean(leftPath && rightPath && (leftPath.includes(rightPath) || rightPath.includes(leftPath)));
}

export async function resolvePublicResourceOriginal(resource) {
    const directUrl = publicResourceOriginalUrl(resource);
    if (directUrl) return { url: directUrl, resource };

    const queries = [
        resource?.title,
        resource?.fileName,
        resource?.name,
        originalPathOf(resource),
    ].map((value) => String(value || "").trim()).filter(Boolean).slice(0, 3);

    for (const query of queries) {
        const remoteResults = await searchResources(query, { scope: "public" }).catch(() => []);
        const downloadable = remoteResults.filter((item) => publicResourceOriginalUrl(item));
        const matched = downloadable.find((item) => samePublicResource(resource, item)) || downloadable[0];
        if (matched) return { url: publicResourceOriginalUrl(matched), resource: matched };
    }

    return { url: "", resource };
}

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
    if (hasRemotePublicResourceEndpoint()) {
        const remote = await searchRemotePublicResources(trimmed);
        return mergeResourceResults(pending, remote, { query: trimmed });
    }
    const remote = await listPublicResourceRows(trimmed).catch(() => []);
    return mergeResourceResults(pending, remote);
}

export async function searchPublicResources(query) {
    const trimmed = String(query || "").trim();
    if (!trimmed) return listPublicResources();
    if (hasRemotePublicResourceEndpoint()) {
        const aiMatches = await searchRemotePublicResources(trimmed);
        return mergeResourceResults(listPendingPublicUploads(), aiMatches, { query: trimmed });
    }
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
    const options = groups.at(-1)?.query !== undefined ? groups.pop() : {};
    const query = options.query || "";
    const seen = new Set();
    return groups.flat()
        .map(normalizePublicResource)
        .map((item) => ({ ...item, relevanceScore: scorePublicResource(item, query) }))
        .filter((item) => {
        if (isBlockedPublicResource(item)) return false;
        if (query && item.relevanceScore <= 0) return false;
        const key = `${item.scope || "public"}:${item.resourceId || item.id || item.storagePath || item.title || ""}`;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    })
        .sort((a, b) => Number(b.relevanceScore || 0) - Number(a.relevanceScore || 0));
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
    const pageSize = 500;
    let from = 0;
    let rows = [];

    while (true) {
        const { data, error } = await client
            .from("resources")
            .select(select)
            .eq("scope", "public")
            .eq("type", "file")
            .order("updated_at", { ascending: false })
            .range(from, from + pageSize - 1);

        if (error) throw error;

        const page = data || [];
        rows = rows.concat(page);
        if (page.length < pageSize) break;
        from += pageSize;
    }

    const trimmed = String(query || "").trim();
    const normalized = rows.map(normalizePublicResourceRow);
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
    const normalized = normalizePublicResource(resource);
    const metadata = metadataOf(normalized);
    if (publicResourceOriginalUrl(normalized) && (
        metadata.indexMode === "keyword_resource_card"
        || metadata.extractionStatus === "keyword_only"
        || metadata.extractionQuality?.ok === false
        || !normalized.chunkId
    )) {
        return { ...normalized, loading: false };
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
