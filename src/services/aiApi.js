import { supabase, supabaseConfigError } from "./supabaseClient";

function requireEnv(name) {
    const value = import.meta.env[name];
    if (!value) {
        throw new Error(`缺少前端环境变量：${name}`);
    }
    return value;
}

function normalizeAIError(status, payload = {}) {
    const code = String(payload?.code || "");
    const message = String(payload?.error || payload?.message || "").trim();

    if (code === "AI_AUTH_FAILED" || status === 401 || status === 403) {
        return "平台 AI 服务鉴权失败，请检查 AI_API_KEY 是否有效或已配置。";
    }
    if (code === "AI_BACKEND_UNAVAILABLE" || status === 404 || status === 0) {
        return "AI 后端代理暂不可用。";
    }
    if (code === "AI_RATE_LIMITED" || status === 429) {
        return message || "平台 AI 服务请求过于频繁，请稍后再试。";
    }
    if (code === "AI_KEY_MISSING") {
        return message || "AI_API_KEY 未配置，请检查 Supabase secrets。";
    }
    if (status >= 500) {
        return message || "AI 后端代理暂不可用。";
    }
    return message || `AI 请求失败：HTTP ${status}`;
}

async function readPayload(response) {
    const text = await response.text().catch(() => "");
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { error: text };
    }
}

async function getCurrentAccessToken() {
    if (!supabase) {
        throw new Error(supabaseConfigError || "Supabase 未初始化");
    }
    const { data: { session } = {} } = await supabase.auth.getSession();
    if (!session?.access_token) {
        throw new Error("请先登录后再使用 AI 对话。");
    }
    return session.access_token;
}

export async function chatWithAI({
    message,
    contextText = "",
    history = [],
    mode = "answer",
    webSearch,
    conversationType,
    subjectId,
    subjectInstruction,
    selectedReferences,
    draftContext,
    planningAction,
    planningState,
    returnFullResponse = false,
}) {
    const supabaseUrl = requireEnv("VITE_SUPABASE_URL").replace(/\/$/, "");
    const anonKey = requireEnv("VITE_SUPABASE_ANON_KEY");
    const accessToken = await getCurrentAccessToken();
    const normalizedMode = mode === "review" ? "review" : "answer";
    const normalizedWebSearch = webSearch || {
        enabled: normalizedMode === "answer",
        mode: "auto",
        topK: 5,
    };

    let response;
    try {
        response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: anonKey,
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                message: String(message || ""),
                contextText: String(contextText || ""),
                history: Array.isArray(history) ? history : [],
                mode: normalizedMode,
                conversationType: conversationType || normalizedMode,
                subjectId: subjectId || null,
                subjectInstruction: String(subjectInstruction || ""),
                selectedReferences: Array.isArray(selectedReferences) ? selectedReferences : [],
                draftContext: draftContext && typeof draftContext === "object" ? draftContext : null,
                planningAction,
                planningState: planningState && typeof planningState === "object" ? planningState : null,
                webSearch: normalizedMode === "review" ? { enabled: false } : normalizedWebSearch,
            }),
        });
    } catch {
        throw new Error("AI 后端代理暂不可用。");
    }

    const payload = await readPayload(response);
    if (!response.ok) {
        throw new Error(normalizeAIError(response.status, payload));
    }
    if (typeof payload?.reply !== "string") {
        throw new Error("AI 返回格式异常。");
    }
    if (returnFullResponse) {
        return {
            reply: payload.reply,
            webCitations: Array.isArray(payload?.webCitations) ? payload.webCitations : [],
            citations: Array.isArray(payload?.citations) ? payload.citations : [],
            drafts: Array.isArray(payload?.drafts) ? payload.drafts : [],
            planningMeta: payload?.planningMeta && typeof payload.planningMeta === "object" ? payload.planningMeta : null,
        };
    }
    return payload.reply;
}

export { askWithTempAttachments, uploadTempAttachment } from "./tempAttachmentApi";
