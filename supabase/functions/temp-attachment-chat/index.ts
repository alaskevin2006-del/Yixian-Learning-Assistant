import { extractFileText, type ExtractStatus, type ExtractWarning } from "../_shared/fileExtractors.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TEXT_API_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";
const BUCKET_NAME = "resource-files";
const MAX_CHARS_PER_ATTACHMENT = 12000;
const MAX_TOTAL_CHARS = 30000;

const M = {
  unauthorized: "\u672a\u767b\u5f55",
  privateForbidden: "\u4e0d\u5141\u8bb8\u8bfb\u53d6 private \u6b63\u5f0f\u8d44\u6e90\u8def\u5f84\u3002",
  publicForbidden: "\u4e0d\u5141\u8bb8\u8bfb\u53d6 public \u8d44\u6e90\u8def\u5f84\u3002",
  pathForbidden: "storagePath \u4e0d\u5c5e\u4e8e\u5f53\u524d\u7528\u6237\u7684 temp \u8def\u5f84\u3002",
  supabaseMissing: "Supabase \u73af\u5883\u53d8\u91cf\u672a\u914d\u7f6e\u5b8c\u6574\u3002",
  fileNotFound: "\u6587\u4ef6\u4e0d\u5b58\u5728\u6216\u65e0\u6cd5\u8bfb\u53d6\u3002",
  readFailed: "\u8bfb\u53d6\u4e34\u65f6\u9644\u4ef6\u5931\u8d25",
  noSelected: "\u81f3\u5c11\u9700\u8981\u9009\u62e9\u4e00\u4e2a\u9644\u4ef6",
  unnamed: "\u672a\u547d\u540d\u9644\u4ef6",
  truncated: "\u6587\u4ef6\u5185\u5bb9\u8f83\u957f\uff0c\u5df2\u622a\u53d6\u524d\u90e8\u6587\u672c\u7528\u4e8e\u672c\u6b21\u56de\u7b54\u3002",
  noAttachmentsRead: "\u672a\u80fd\u8bfb\u53d6\u4efb\u4f55\u5df2\u9009\u62e9\u9644\u4ef6",
  noUsableText: "\u4e34\u65f6\u9644\u4ef6\u5df2\u4e0a\u4f20\u6210\u529f\uff0c\u4f46\u672c\u6b21\u89e3\u6790\u5931\u8d25\uff1a\u672a\u63d0\u53d6\u5230\u53ef\u4f9b AI \u4f7f\u7528\u7684\u6b63\u6587\u3002\u4e34\u65f6\u9644\u4ef6\u7a33\u5b9a\u652f\u6301 txt / md / docx\uff1bPDF / PPT / PPTX \u5f53\u524d\u6682\u4e0d\u652f\u6301\u7a33\u5b9a\u6b63\u6587\u89e3\u6790\uff0c\u53ef\u80fd\u65e0\u6cd5\u88ab AI \u5b8c\u6574\u8bfb\u53d6\u3002",
  aiKeyInvalid: "AI \u670d\u52a1\u9274\u6743\u5931\u8d25\uff1aAI_API_KEY \u65e0\u6548\u3001\u672a\u914d\u7f6e\u6216\u6743\u9650\u6821\u9a8c\u672a\u901a\u8fc7",
  aiEmpty: "DeepSeek \u672a\u8fd4\u56de\u6709\u6548\u56de\u7b54",
  requestFailed: "temp-attachment-chat \u8bf7\u6c42\u5931\u8d25",
};

type Attachment = {
  id?: string;
  fileName?: string;
  fileType?: string;
  storagePath?: string;
  selected?: boolean;
};

type RequestBody = {
  question?: string;
  attachments?: Attachment[];
  selectedAttachmentIds?: unknown[];
  contextText?: string;
  references?: unknown[];
  webSearch?: {
    enabled?: boolean;
    mode?: "auto" | "always";
    topK?: number;
  };
};

type WebCitation = {
  title: string;
  url: string;
  snippet: string;
  source?: string;
};

type UsedAttachment = {
  id: string;
  fileName: string;
  fileType?: string;
  status: ExtractStatus;
  charsUsed: number;
};

type WarningItem = ExtractWarning & {
  attachmentId?: string;
  fileName?: string;
};

type PathCheck =
  | { ok: true; path: string }
  | { ok: false; status: number; error: string };

type DownloadResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; status: number; error: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function env(name: string, fallback = "") {
  return (Deno.env.get(name) || fallback).trim();
}

function clampTopK(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(Math.max(Math.floor(parsed), 1), 8);
}

function shouldSearchWeb(body: RequestBody) {
  const options = body.webSearch || {};
  if (options.enabled === false) return false;
  const question = String(body.question || "").trim();
  if (!question) return false;
  if (options.mode === "always") return true;
  if (question.length < 6) return false;
  if (/^(hi|hello|hey|ok|thanks|thank you)$/i.test(question.toLowerCase())) return false;
  return true;
}

function normalizeSearchResult(item: Record<string, unknown>, source: string): WebCitation | null {
  const title = String(item.title || item.name || "").trim();
  const url = String(item.url || item.link || item.href || "").trim();
  const snippet = String(item.content || item.snippet || item.description || item.summary || "").replace(/\s+/g, " ").trim();
  if (!url || (!title && !snippet)) return null;
  return { title: title || url, url, snippet, source };
}

async function searchWeb(query: string, options: RequestBody["webSearch"] = {}): Promise<WebCitation[]> {
  const tavilyKey = env("TAVILY_API_KEY") || env("WEB_SEARCH_API_KEY");
  if (!tavilyKey) return [];
  const endpoint = env("WEB_SEARCH_URL") || "https://api.tavily.com/search";
  const topK = clampTopK(options?.topK);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tavilyKey}`,
    },
    body: JSON.stringify({
      api_key: tavilyKey,
      query,
      max_results: topK,
      search_depth: "basic",
      include_answer: false,
      include_raw_content: false,
    }),
  });
  if (!response.ok) {
    console.warn("web search failed", response.status, await response.text().catch(() => ""));
    return [];
  }
  const data = await response.json().catch(() => ({}));
  const rawResults = Array.isArray(data?.results) ? data.results : [];
  return rawResults
    .map((item: unknown) => normalizeSearchResult((item || {}) as Record<string, unknown>, "web"))
    .filter((item: WebCitation | null): item is WebCitation => Boolean(item))
    .slice(0, topK);
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function getCurrentUser(authHeader: string) {
  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return null;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: anonKey,
    },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const id = String(data?.id || "").trim();
  return id ? { id } : null;
}

function assertTempPath(storagePath: string, userId: string): PathCheck {
  const normalized = storagePath.replace(/^\/+/, "");
  if (normalized.startsWith("private/")) {
    return { ok: false, status: 403, error: M.privateForbidden };
  }
  if (normalized.startsWith("public/")) {
    return { ok: false, status: 403, error: M.publicForbidden };
  }
  if (!normalized.startsWith(`temp/${userId}/`)) {
    return { ok: false, status: 403, error: M.pathForbidden };
  }
  return { ok: true, path: normalized };
}

function fileTypeOf(attachment: Attachment) {
  const explicit = String(attachment.fileType || "").toLowerCase().replace(/^\./, "");
  if (explicit) return explicit;
  const name = String(attachment.fileName || attachment.storagePath || "");
  return name.includes(".") ? name.split(".").pop()?.toLowerCase() || "" : "";
}

function noUsableTextMessage(warnings: WarningItem[], usedAttachments: UsedAttachment[]) {
  const details = usedAttachments
    .map((attachment) => {
      const type = attachment.fileType || fileTypeOf({ fileName: attachment.fileName }) || M.unnamed;
      const reasons = warnings
        .filter((item) => item.attachmentId === attachment.id || item.fileName === attachment.fileName)
        .map((item) => `${item.code}: ${item.message}`)
        .join("\uff1b");
      return `${attachment.fileName}\uff08${type}\uff0c${attachment.status}\uff09\uff1a${reasons || "\u672a\u63d0\u53d6\u5230\u53ef\u7528\u6587\u672c"}`;
    })
    .join("\n");
  return details ? `${M.noUsableText}\n${details}` : M.noUsableText;
}

async function downloadObject(storagePath: string, authHeader: string): Promise<DownloadResult> {
  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return { ok: false, status: 500, error: M.supabaseMissing };
  }

  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  const url = `${supabaseUrl}/storage/v1/object/${BUCKET_NAME}/${encodedPath}`;
  const res = await fetch(url, {
    headers: {
      Authorization: authHeader,
      apikey: anonKey,
    },
  });

  if (!res.ok) {
    if (res.status === 404) return { ok: false, status: 404, error: M.fileNotFound };
    return { ok: false, status: res.status, error: `${M.readFailed}: HTTP ${res.status}` };
  }

  return { ok: true, bytes: new Uint8Array(await res.arrayBuffer()) };
}

function truncateForContext(text: string, limit: number) {
  if (text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit), truncated: true };
}

function selectAttachments(body: RequestBody) {
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  if (Array.isArray(body.selectedAttachmentIds)) {
    const selectedIds = new Set(body.selectedAttachmentIds.map((id) => String(id)));
    return attachments.filter((attachment) => (
      selectedIds.has(String(attachment.id || "")) ||
      selectedIds.has(String(attachment.storagePath || ""))
    ));
  }
  return attachments.filter((attachment) => attachment?.selected === true);
}

function buildSupplementaryContext(body: RequestBody, webCitations: WebCitation[] = []) {
  const contextText = String(body.contextText || "").trim();
  const references = Array.isArray(body.references) ? body.references : [];
  const referenceLines = references
    .map((item, index) => {
      const ref = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const title = String(ref.title || ref.label || "\u5f15\u7528\u8d44\u6599").trim();
      const scope = String(ref.scope || "").trim();
      const resourceId = String(ref.resourceId || ref.fileId || "").trim();
      const chunkId = String(ref.chunkId || "").trim();
      return [
        `${index + 1}. ${title}`,
        scope ? `\u6765\u6e90\uff1a${scope}` : "",
        resourceId ? `resourceId: ${resourceId}` : "",
        chunkId ? `chunkId: ${chunkId}` : "",
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  return [
    contextText ? `\u3010\u516c\u5171\u8d44\u6599/\u624b\u52a8\u5f15\u7528/\u8054\u7f51\u68c0\u7d22\u8865\u5145\u3011\n${contextText}` : "",
    referenceLines ? `\u3010\u5f15\u7528\u6765\u6e90\u5217\u8868\u3011\n${referenceLines}` : "",
    webCitations.length ? `\u3010\u8054\u7f51\u641c\u7d22\u7ed3\u679c\u3011\n${webCitations.map((item, index) => [
      `${index + 1}. ${item.title}`,
      item.url,
      item.snippet,
    ].filter(Boolean).join("\n")).join("\n\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

function buildPrompt(question: string, contexts: Array<{ fileName: string; text: string; status: ExtractStatus }>, supplementaryContext = "") {
  const attachmentText = contexts
    .map((item, index) => [
      `\u9644\u4ef6 ${index + 1}\uff1a${item.fileName}`,
      `\u89e3\u6790\u72b6\u6001\uff1a${item.status}`,
      item.text || "\u672a\u63d0\u53d6\u5230\u53ef\u7528\u6587\u672c\u3002",
    ].join("\n"))
    .join("\n\n---\n\n");

  return [
    {
      role: "system",
      content: [
        "\u4f60\u662f\u8d44\u6599\u95ee\u7b54\u52a9\u624b\u3002",
        "\u4f60\u9700\u8981\u878d\u5408\u5df2\u89e3\u6790\u4e34\u65f6\u9644\u4ef6\u3001\u516c\u5171\u8d44\u6599/\u624b\u52a8\u5f15\u7528/\u8054\u7f51\u68c0\u7d22\u8865\u5145\u4e0a\u4e0b\u6587\u6765\u56de\u7b54\u3002",
        "\u56de\u7b54\u5fc5\u987b\u660e\u786e\u6807\u51fa\u54ea\u4e9b\u5185\u5bb9\u6765\u81ea\u9644\u4ef6\uff0c\u54ea\u4e9b\u6765\u81ea\u516c\u5171\u8d44\u6599/\u5f15\u7528/\u8054\u7f51\u8865\u5145\u3002",
        "\u5982\u679c\u9644\u4ef6\u89e3\u6790\u5931\u8d25\u6216\u5185\u5bb9\u4e0d\u8db3\uff0c\u8981\u660e\u786e\u8bf4\u660e\u3002",
        "\u4e0d\u8981\u7f16\u9020\u9644\u4ef6\u4e0d\u5b58\u5728\u7684\u5185\u5bb9\uff1bPDF / PPT / PPTX \u53ea\u80fd\u8bf4\u57fa\u4e8e\u6210\u529f\u63d0\u53d6\u7684\u6587\u672c\u7247\u6bb5\uff0c\u4e0d\u8981\u58f0\u79f0\u5df2\u5b8c\u6574\u9605\u8bfb\u539f\u6587\u4ef6\u3002",
        "\u5982\u679c\u7528\u6237\u8981\u6c42\u6574\u7406\u7b14\u8bb0\uff0c\u53ef\u4ee5\u8f93\u51fa Markdown\u3002",
        "\u56de\u7b54\u5e94\u5c3d\u91cf\u7ed3\u6784\u5316\u3001\u7b80\u6d01\u3001\u53ef\u7528\u4e8e\u5b66\u4e60\u3002",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `\u7528\u6237\u95ee\u9898\uff1a\n${question}`,
        `\u5df2\u89e3\u6790\u4e34\u65f6\u9644\u4ef6\u5185\u5bb9\uff1a\n${attachmentText}`,
        supplementaryContext ? supplementaryContext : "",
      ].filter(Boolean).join("\n\n"),
    },
  ];
}

function parseAiAnswer(content: string) {
  const normalized = content.trim();
  const keyPoints = normalized
    .split(/\n+/)
    .map((line) => line.replace(/^[-*#\d.\s]+/, "").trim())
    .filter((line) => line.length >= 6)
    .slice(0, 5);
  const summary = keyPoints[0] || normalized.replace(/\s+/g, " ").slice(0, 120);
  return { answer: normalized, summary, keyPoints };
}

function upstreamErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const value = data as { error?: { message?: unknown }; message?: unknown };
  return String(value.error?.message || value.message || "").trim();
}

async function callDeepSeek(question: string, contexts: Array<{ fileName: string; text: string; status: ExtractStatus }>, supplementaryContext = "") {
  const apiKey = env("AI_API_KEY");
  if (!apiKey) {
    return json({ error: M.aiKeyInvalid, code: "AI_KEY_MISSING" }, 500);
  }

  const response = await fetch(TEXT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: env("AI_MODEL", DEFAULT_MODEL),
      messages: buildPrompt(question, contexts, supplementaryContext),
      temperature: 0.2,
      max_tokens: 1600,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return json({ error: M.aiKeyInvalid, code: "AI_AUTH_FAILED", upstreamStatus: response.status }, 401);
    }
    return json({
      error: upstreamErrorMessage(data) || `DeepSeek API \u8c03\u7528\u5931\u8d25\uff1aHTTP ${response.status}`,
      code: "AI_UPSTREAM_ERROR",
      upstreamStatus: response.status,
    }, 502);
  }

  const content = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!content) {
    return json({ error: M.aiEmpty, code: "AI_EMPTY_RESPONSE" }, 502);
  }

  return parseAiAnswer(content);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = getBearerToken(req);
    if (!token) return json({ error: M.unauthorized, code: "UNAUTHORIZED" }, 401);

    const user = await getCurrentUser(authHeader);
    if (!user) return json({ error: M.unauthorized, code: "UNAUTHORIZED" }, 401);

    const body = await req.json().catch(() => ({})) as RequestBody;
    const question = String(body.question || "").trim();
    if (!question) return json({ error: "question is required", code: "QUESTION_REQUIRED" }, 400);
    if (!Array.isArray(body.attachments) || body.attachments.length === 0) {
      return json({ error: "attachments is required", code: "ATTACHMENTS_REQUIRED" }, 400);
    }

    const selectedAttachments = selectAttachments(body);
    if (!selectedAttachments.length) {
      return json({ error: M.noSelected, code: "NO_SELECTED_ATTACHMENTS" }, 400);
    }

    const warnings: WarningItem[] = [];
    const usedAttachments: UsedAttachment[] = [];
    const contexts: Array<{ fileName: string; text: string; status: ExtractStatus }> = [];
    let remainingTotalChars = MAX_TOTAL_CHARS;

    for (const attachment of selectedAttachments) {
      const id = String(attachment.id || attachment.storagePath || "");
      const fileName = String(attachment.fileName || M.unnamed);
      const fileType = fileTypeOf(attachment);
      const storagePath = String(attachment.storagePath || "").trim();
      if (!storagePath) return json({ error: "attachment.storagePath is required", code: "STORAGE_PATH_REQUIRED" }, 400);

      const pathCheck = assertTempPath(storagePath, user.id);
      if (!pathCheck.ok) return json({ error: pathCheck.error, code: "STORAGE_PATH_FORBIDDEN" }, pathCheck.status);

      const download = await downloadObject(pathCheck.path, authHeader);
      if (!download.ok) {
        if (download.status === 404) {
          warnings.push({ code: "FILE_NOT_FOUND", message: download.error, attachmentId: id, fileName });
          usedAttachments.push({ id, fileName, fileType, status: "failed", charsUsed: 0 });
          continue;
        }
        return json({ error: download.error, code: "STORAGE_READ_FAILED" }, download.status);
      }

      const extracted = await extractFileText(fileType, download.bytes);
      for (const item of extracted.warnings) {
        warnings.push({ ...item, attachmentId: id, fileName });
      }

      const perFile = truncateForContext(extracted.text, MAX_CHARS_PER_ATTACHMENT);
      if (perFile.truncated) {
        warnings.push({ code: "ATTACHMENT_TRUNCATED", message: M.truncated, attachmentId: id, fileName });
      }

      const totalLimited = truncateForContext(perFile.text, Math.max(0, remainingTotalChars));
      if (perFile.text && totalLimited.text.length < perFile.text.length) {
        warnings.push({ code: "TOTAL_CONTEXT_TRUNCATED", message: M.truncated, attachmentId: id, fileName });
      }

      remainingTotalChars -= totalLimited.text.length;
      contexts.push({ fileName, text: totalLimited.text, status: extracted.status });
      usedAttachments.push({ id, fileName, fileType, status: extracted.status, charsUsed: totalLimited.text.length });
    }

    if (!usedAttachments.length) {
      return json({ error: M.noAttachmentsRead, code: "NO_ATTACHMENTS_READ" }, 404);
    }
    const webCitations = shouldSearchWeb(body)
      ? await searchWeb(question, body.webSearch || {}).catch((err) => {
        console.warn("web search error", err);
        return [] as WebCitation[];
      })
      : [];
    const supplementaryContext = buildSupplementaryContext(body, webCitations);
    if (!contexts.some((item) => item.text.trim()) && !supplementaryContext.trim()) {
      return json({
        error: noUsableTextMessage(warnings, usedAttachments),
        code: "NO_USABLE_TEXT",
        warnings,
        usedAttachments,
      }, 422);
    }

    const aiResult = await callDeepSeek(question, contexts, supplementaryContext);
    if (aiResult instanceof Response) return aiResult;

    return json({
      ...aiResult,
      warnings,
      usedAttachments,
      ...(webCitations.length > 0 ? { webCitations } : {}),
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : M.requestFailed,
      code: "TEMP_ATTACHMENT_CHAT_ERROR",
    }, 500);
  }
});
