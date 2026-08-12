import { supabase, supabaseConfigError } from "./supabaseClient";

const BUCKET = "resource-files";
const SIGNED_URL_TTL_SECONDS = 60 * 10;
export const MAX_PRIVATE_RESOURCE_BYTES = 20 * 1024 * 1024;

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

function getStorageExtension(fileName = "", fileType = "other") {
    const lowerName = String(fileName || "").toLowerCase();
    const matched = lowerName.match(/\.([a-z0-9]{1,12})$/);
    if (matched?.[1]) return matched[1];
    if (fileType === "image") return "img";
    if (["pdf", "txt", "md", "docx", "ppt", "pptx"].includes(fileType)) return fileType;
    return "bin";
}

export function getPrivateFileType(fileName = "", mimeType = "") {
    const lowerName = String(fileName || "").toLowerCase();
    const lowerMime = String(mimeType || "").toLowerCase();
    if (lowerName.endsWith(".pdf") || lowerMime === "application/pdf") return "pdf";
    if (lowerName.endsWith(".txt") || lowerMime.startsWith("text/plain")) return "txt";
    if (lowerName.endsWith(".md") || lowerName.endsWith(".markdown")) return "md";
    if (lowerName.endsWith(".docx") || lowerMime.includes("wordprocessingml")) return "docx";
    if (lowerName.endsWith(".ppt") || lowerMime === "application/vnd.ms-powerpoint") return "ppt";
    if (lowerName.endsWith(".pptx") || lowerMime.includes("presentationml")) return "pptx";
    if (lowerMime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(lowerName)) return "image";
    return "other";
}

function normalizeResource(row = {}) {
    return {
        id: String(row.id || ""),
        name: String(row.name || "未命名资源"),
        type: String(row.type || "file"),
        scope: String(row.scope || "private"),
        ownerUserId: String(row.owner_user_id || ""),
        fileType: String(row.file_type || "other"),
        storagePath: String(row.storage_path || ""),
        status: String(row.status || "ready"),
        canPreview: row.can_preview !== false,
        canDownload: row.can_download !== false,
        canReference: row.can_reference !== false,
        summary: String(row.summary || ""),
        tags: Array.isArray(row.tags) ? row.tags : [],
        metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
        createdAt: row.created_at || "",
        updatedAt: row.updated_at || "",
    };
}

function messageOf(error) {
    return String(error?.message || error?.error_description || error || "").trim();
}

function requireEnv(name) {
    const value = import.meta.env[name];
    if (!value) {
        throw new Error(`Missing frontend env var: ${name}`);
    }
    return value;
}

async function getCurrentAccessToken() {
    assertSupabase();
    const { data: { session } = {} } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
        throw new Error("请先登录后再读取我的资源正文");
    }
    return accessToken;
}

function looksLikePermissionError(error) {
    const lower = messageOf(error).toLowerCase();
    return lower.includes("row-level security")
        || lower.includes("violates row-level security")
        || lower.includes("permission denied")
        || lower.includes("not authorized")
        || lower.includes("unauthorized")
        || lower.includes("403");
}

function explainStorageUploadError(error) {
    if (looksLikePermissionError(error)) {
        return new Error("上传失败：当前账号没有 Storage 上传权限，请检查 Supabase Storage policy");
    }
    return new Error(`上传失败：${messageOf(error) || "网络或存储服务异常"}`);
}

function explainResourceInsertError(error) {
    const message = messageOf(error);
    const lower = message.toLowerCase();
    if (lower.includes("invalid input value for enum") && (lower.includes("ppt") || lower.includes("pptx") || lower.includes("file_type"))) {
        return new Error("资源记录写入失败：当前 resources.file_type 枚举未包含 ppt/pptx，请先执行 Supabase migration 更新枚举值");
    }
    if (looksLikePermissionError(error)) {
        return new Error("资源记录写入失败：请检查 resources 表 RLS");
    }
    return new Error(`资源记录写入失败：${message || "未知错误"}`);
}

export async function listPrivateResources(userId) {
    assertSupabase();
    if (!userId) return [];

    const { data, error } = await supabase
        .from("resources")
        .select("id,scope,owner_user_id,name,type,file_type,storage_path,status,can_preview,can_download,can_reference,summary,tags,metadata,created_at,updated_at")
        .eq("scope", "private")
        .eq("owner_user_id", userId)
        .eq("type", "file")
        .order("updated_at", { ascending: false });

    if (error) {
        console.warn("private resources list failed", error);
        throw new Error(`我的资源加载失败：${messageOf(error) || "请检查 resources 表读取权限"}`);
    }
    return Array.isArray(data) ? data.map(normalizeResource) : [];
}

export async function uploadPrivateResource(file, userId) {
    assertSupabase();
    if (!userId) throw new Error("请先登录后再上传私人资料");
    if (!file) throw new Error("请选择要上传的文件");
    if (file.size > MAX_PRIVATE_RESOURCE_BYTES) {
        throw new Error("文件超过 20 MB，目前暂不支持大文件上传");
    }

    const resourceId = crypto.randomUUID();
    const displayName = normalizeFileName(file.name);
    const fileType = getPrivateFileType(file.name, file.type);
    const storageExt = getStorageExtension(file.name, fileType);
    const storageFileName = `${resourceId}.${storageExt}`;
    const storagePath = `private/${userId}/${resourceId}/${storageFileName}`;

    const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, {
            cacheControl: "3600",
            contentType: file.type || undefined,
            upsert: false,
        });

    if (uploadError) {
        console.warn("private resource storage upload failed", uploadError);
        throw explainStorageUploadError(uploadError);
    }

    const row = {
        id: resourceId,
        scope: "private",
        owner_user_id: userId,
        type: "file",
        name: displayName,
        file_type: fileType,
        storage_path: storagePath,
        status: "ready",
        can_preview: true,
        can_download: true,
        can_reference: true,
        summary: "",
        tags: ["个人资料", fileType],
        metadata: {
            originalName: file.name,
            storageFileName,
            size: file.size,
            mimeType: file.type || "",
            uploadedFrom: "ResourcePage",
        },
    };

    const { data, error: insertError } = await supabase
        .from("resources")
        .insert(row)
        .select("id,scope,owner_user_id,name,type,file_type,storage_path,status,can_preview,can_download,can_reference,summary,tags,metadata,created_at,updated_at")
        .single();

    if (insertError) {
        const explained = explainResourceInsertError(insertError);
        console.warn("private resource uploaded but resources insert failed", {
            storagePath,
            insertError,
        });
        throw new Error(`文件已上传但资源记录写入失败：${explained.message.replace(/^资源记录写入失败：/, "")}`);
    }

    return normalizeResource(data || row);
}

export async function saveMarkdownPrivateResource({ title, markdown, userId, folderName = "AI 回答归档" }) {
    assertSupabase();
    if (!userId) throw new Error("请先登录后再保存 Markdown 笔记");
    const content = String(markdown || "").trim();
    if (!content) throw new Error("当前回答为空，无法保存");

    const resourceId = crypto.randomUUID();
    const displayTitle = normalizeFileName(title || content.split(/\r?\n/).find(Boolean) || "AI 回答笔记");
    const safeFolderName = normalizeFileName(folderName || "AI 回答归档");
    const storageFileName = `${resourceId}.md`;
    const storagePath = `private/${userId}/${resourceId}/${storageFileName}`;
    const file = new File([content], storageFileName, { type: "text/markdown;charset=utf-8" });

    const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, {
            cacheControl: "3600",
            contentType: "text/markdown;charset=utf-8",
            upsert: false,
        });

    if (uploadError) {
        console.warn("markdown private resource storage upload failed", uploadError);
        throw explainStorageUploadError(uploadError);
    }

    const row = {
        id: resourceId,
        scope: "private",
        owner_user_id: userId,
        type: "file",
        name: displayTitle.endsWith(".md") ? displayTitle : `${displayTitle}.md`,
        file_type: "md",
        storage_path: storagePath,
        status: "ready",
        can_preview: true,
        can_download: true,
        can_reference: true,
        summary: oneLineSummary(content),
        tags: ["个人资料", "Markdown", safeFolderName],
        metadata: {
            originalName: `${displayTitle}.md`,
            storageFileName,
            size: file.size,
            mimeType: "text/markdown",
            folderName: safeFolderName,
            savedFrom: "ResourcePageTempAttachmentAnswer",
        },
    };

    const { data, error: insertError } = await supabase
        .from("resources")
        .insert(row)
        .select("id,scope,owner_user_id,name,type,file_type,storage_path,status,can_preview,can_download,can_reference,summary,tags,metadata,created_at,updated_at")
        .single();

    if (insertError) {
        const explained = explainResourceInsertError(insertError);
        console.warn("markdown private resource uploaded but resources insert failed", {
            storagePath,
            insertError,
        });
        throw new Error(`Markdown 已上传但资源记录写入失败：${explained.message.replace(/^资源记录写入失败：/, "")}`);
    }

    return normalizeResource(data || row);
}

function oneLineSummary(text, max = 180) {
    const summary = String(text || "").replace(/\s+/g, " ").trim();
    return summary.length > max ? `${summary.slice(0, max - 1)}...` : summary;
}

export async function getOwnedPrivateResource(resourceId, userId) {
    assertSupabase();
    if (!userId) throw new Error("请先登录");
    if (!resourceId) throw new Error("缺少资源 ID");

    const { data, error } = await supabase
        .from("resources")
        .select("id,scope,owner_user_id,name,type,file_type,storage_path,status,can_preview,can_download,can_reference,summary,tags,metadata,created_at,updated_at")
        .eq("id", resourceId)
        .eq("scope", "private")
        .eq("owner_user_id", userId)
        .single();

    if (error) {
        console.warn("private resource lookup failed", error);
        throw new Error(`资源读取失败：${messageOf(error) || "请检查 resources 表 RLS"}`);
    }
    return normalizeResource(data);
}

export async function createPrivateResourceSignedUrl(resourceId, userId, mode = "preview") {
    const resource = await getOwnedPrivateResource(resourceId, userId);
    if (!resource.storagePath) throw new Error("该资源没有可访问的存储路径");
    if (mode === "download" && !resource.canDownload) throw new Error("该资源不允许下载");
    if (mode !== "download" && !resource.canPreview) throw new Error("该资源不允许预览");

    const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(resource.storagePath, SIGNED_URL_TTL_SECONDS, {
            download: mode === "download" ? resource.name : false,
        });

    if (error) {
        console.warn("private resource signed url failed", error);
        throw new Error("安全访问链接生成失败：请检查 Storage 权限或稍后重试");
    }
    if (!data?.signedUrl) throw new Error("安全访问链接生成失败：Storage 未返回 signed URL");
    return { resource, signedUrl: data.signedUrl };
}

export async function deletePrivateResource(resourceId, userId) {
    const resource = await getOwnedPrivateResource(resourceId, userId);
    if (resource.storagePath) {
        const { error: storageError } = await supabase.storage
            .from(BUCKET)
            .remove([resource.storagePath]);
        if (storageError) {
            console.warn("private resource storage delete failed", storageError);
        }
    }

    const { error } = await supabase
        .from("resources")
        .delete()
        .eq("id", resource.id)
        .eq("scope", "private")
        .eq("owner_user_id", userId);

    if (error) {
        console.warn("private resource row delete failed", error);
        throw new Error("删除私有资料失败：请检查当前账号权限");
    }
    return resource;
}

export async function readPrivateTextPreview(resourceId, userId, options = {}) {
    void userId;
    return extractPrivateResourceText(resourceId, options);
}


function privateExtractErrorMessage(status, payload) {
    const detail = String(payload?.error || payload?.message || "").trim();
    const code = String(payload?.code || "").trim();
    if (status === 404 && code !== "RESOURCE_NOT_FOUND") return "Private resource extraction service is not deployed.";
    if (code === "FILE_TOO_LARGE" || status === 413) return "File is too large to extract.";
    if (code === "RESOURCE_NOT_FOUND") return "Resource not found or not owned by current user.";
    if (code === "RESOURCE_REFERENCE_DISABLED") return "This resource cannot be referenced by AI.";
    if (status === 401 || status === 403) return detail || "No permission to read this private resource.";
    if (status >= 500) return `Private resource extraction service is unavailable${detail ? `: ${detail}` : ""}`;
    return detail || `Private resource extraction failed: HTTP ${status}`;
}

export async function extractPrivateResourceText(resourceId, { maxChars = 12000 } = {}) {
    assertSupabase();
    if (!resourceId) throw new Error("Missing resource ID");

    const supabaseUrl = requireEnv("VITE_SUPABASE_URL").replace(/\/$/, "");
    const anonKey = requireEnv("VITE_SUPABASE_ANON_KEY");
    const accessToken = await getCurrentAccessToken();
    const response = await fetch(`${supabaseUrl}/functions/v1/private-resource-extract`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            resourceId,
            maxChars,
        }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        console.warn("private resource extract failed", {
            status: response.status,
            payload,
        });
        throw new Error(privateExtractErrorMessage(response.status, payload));
    }

    return {
        resource: payload?.resource || null,
        text: String(payload?.text || ""),
        status: String(payload?.status || ""),
        warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
        charsUsed: Number(payload?.charsUsed || 0),
        truncated: Boolean(payload?.truncated),
    };
}
