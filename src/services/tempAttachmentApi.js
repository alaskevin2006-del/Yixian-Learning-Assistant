import { supabase, supabaseConfigError } from "./supabaseClient";

const BUCKET = "resource-files";
const SUPPORTED_TYPES = new Set(["txt", "md", "pdf", "docx", "ppt", "pptx"]);
export const MAX_TEMP_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const TEMP_SESSION_KEY_PREFIX = "temp-attachment-session:";

function assertSupabase() {
    if (!supabase) {
        throw new Error(supabaseConfigError || "Supabase 未初始化");
    }
}

function normalizeFileName(name = "file") {
    return String(name || "file")
        .replace(/[\\/:*?"<>|#%{}^~[\]`]/g, "_")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160) || "file";
}

function getExt(fileName = "") {
    const matched = String(fileName || "").toLowerCase().match(/\.([a-z0-9]{1,12})$/);
    return matched?.[1] || "";
}

function getTempFileType(fileName = "", mimeType = "") {
    const lowerName = String(fileName || "").toLowerCase();
    const lowerMime = String(mimeType || "").toLowerCase();
    if (lowerName.endsWith(".pdf") || lowerMime === "application/pdf") return "pdf";
    if (lowerName.endsWith(".txt") || lowerMime.startsWith("text/plain")) return "txt";
    if (lowerName.endsWith(".md") || lowerName.endsWith(".markdown")) return "md";
    if (lowerName.endsWith(".docx") || lowerMime.includes("wordprocessingml")) return "docx";
    if (lowerName.endsWith(".ppt") || lowerMime === "application/vnd.ms-powerpoint") return "ppt";
    if (lowerName.endsWith(".pptx") || lowerMime.includes("presentationml")) return "pptx";
    return getExt(fileName);
}

function getSessionId(userId) {
    const key = `${TEMP_SESSION_KEY_PREFIX}${userId || "anonymous"}`;
    try {
        const existing = window.sessionStorage.getItem(key);
        if (existing) return existing;
        const next = crypto.randomUUID();
        window.sessionStorage.setItem(key, next);
        return next;
    } catch {
        return crypto.randomUUID();
    }
}

function requireEnv(name) {
    const value = import.meta.env[name];
    if (!value) {
        throw new Error(`缺少前端环境变量：${name}`);
    }
    return value;
}

function tempChatErrorMessage(status, payload) {
    const detail = String(payload?.error || payload?.message || "").trim();
    const code = String(payload?.code || "").trim();
    if (status === 404) return "临时附件 AI 解析服务暂未部署";
    if (code === "NO_USABLE_TEXT") return detail || "上传成功但解析失败：未提取到可用文本。当前文件类型暂不支持完整解析。";
    if (code === "AI_KEY_MISSING") return detail || "AI 服务不可用：AI_API_KEY 未配置。";
    if (code === "AI_AUTH_FAILED" || status === 401 || status === 403) return detail || "AI 服务鉴权失败：AI_API_KEY 无效、未配置或权限校验未通过。";
    if (status >= 500) return `临时附件 AI 解析服务暂不可用${detail ? `：${detail}` : ""}`;
    return detail || `临时附件问答失败：HTTP ${status}`;
}

async function getCurrentAccessToken() {
    if (!supabase) {
        throw new Error(supabaseConfigError || "Supabase 未初始化");
    }
    const { data: { session } = {} } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
        throw new Error("请先登录后使用 AI 服务。");
    }
    return accessToken;
}

export async function uploadTempAttachment(file, currentUser) {
    assertSupabase();
    const userId = currentUser?.id;
    if (!userId) throw new Error("请先登录后再上传临时附件");
    if (!file) throw new Error("请选择要上传的临时附件");
    if (file.size > MAX_TEMP_ATTACHMENT_BYTES) {
        throw new Error("临时附件超过 8 MB，目前暂不支持大文件问答");
    }

    const fileType = getTempFileType(file.name, file.type);
    if (!SUPPORTED_TYPES.has(fileType)) {
        throw new Error("仅支持 txt / md / pdf / docx / ppt / pptx 临时附件");
    }

    const sessionId = getSessionId(userId);
    const fileId = crypto.randomUUID();
    const ext = getExt(file.name) || fileType;
    const storagePath = `temp/${userId}/${sessionId}/${fileId}.${ext}`;

    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, {
            cacheControl: "3600",
            contentType: file.type || undefined,
            upsert: false,
        });

    if (error) {
        console.warn("temp attachment upload failed", error);
        throw new Error(error?.message || "临时附件上传失败");
    }

    return {
        id: fileId,
        sessionId,
        userId,
        name: normalizeFileName(file.name),
        fileType,
        size: file.size,
        mimeType: file.type || "",
        storagePath,
    };
}

export async function askWithTempAttachments({
    question,
    attachments,
    selectedAttachmentIds,
    contextText = "",
    references = [],
    webSearch = { enabled: true, mode: "auto", topK: 5 },
}) {
    const trimmed = String(question || "").trim();
    if (!trimmed) throw new Error("请输入问题");

    const selectedIds = new Set(Array.isArray(selectedAttachmentIds) ? selectedAttachmentIds : []);
    const selected = (Array.isArray(attachments) ? attachments : [])
        .filter((item) => selectedIds.has(item.id))
        .map((item) => ({
            id: item.id,
            sessionId: item.sessionId,
            fileName: item.name,
            name: item.name,
            fileType: item.fileType,
            size: item.size,
            storagePath: item.storagePath,
        }));

    const supabaseUrl = requireEnv("VITE_SUPABASE_URL").replace(/\/$/, "");
    const anonKey = requireEnv("VITE_SUPABASE_ANON_KEY");
    const accessToken = await getCurrentAccessToken();
    const response = await fetch(`${supabaseUrl}/functions/v1/temp-attachment-chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            question: trimmed,
            attachments: selected,
            selectedAttachmentIds: selected.map((item) => item.id),
            contextText: String(contextText || ""),
            references: Array.isArray(references) ? references : [],
            webSearch: webSearch && typeof webSearch === "object" ? webSearch : { enabled: true, mode: "auto", topK: 5 },
        }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        console.warn("temp attachment chat failed", {
            status: response.status,
            payload,
        });
        throw new Error(tempChatErrorMessage(response.status, payload));
    }

    return {
        answer: String(payload?.answer || payload?.markdown || payload?.text || "").trim(),
        citations: Array.isArray(payload?.citations) ? payload.citations : [],
        webCitations: Array.isArray(payload?.webCitations) ? payload.webCitations : [],
    };
}
