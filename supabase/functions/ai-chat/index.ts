const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TEXT_API_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";

type ChatMode = "answer" | "review";

type ChatMessage = {
  role?: string;
  content?: string;
};

type WebSearchOptions = {
  enabled?: boolean;
  mode?: "auto" | "always";
  topK?: number;
};

type WebCitation = {
  title: string;
  url: string;
  snippet: string;
  source?: string;
};

type RequestBody = {
  message?: string;
  contextText?: string;
  history?: ChatMessage[];
  mode?: ChatMode;
  webSearch?: WebSearchOptions;
  conversationType?: "free" | "subject" | "planning" | "resource" | string;
  subjectId?: string | null;
  subjectInstruction?: string;
  selectedReferences?: unknown[];
  draftContext?: Record<string, unknown> | null;
};

const ANSWER_SYSTEM_PROMPT = `你是学习答疑助手。你的首要目标是把用户当前问题讲懂。

硬性要求：
- 用户问“是什么 / 定义 / 概念 / 不懂 / 直接解释 / 什么意思”时，第一段必须直接解释该概念本身，不要先给学习方法、任务拆解或“先把问题拆成三步”的模板。
- 用户问题目或推导时，可以循序渐进，但也必须先回应题目正在问什么，不能只给泛化步骤。
- 只有在用户明确要求学习规划、复盘或卡点整理时，才输出教练式拆解。
- 回答要清晰、分层、左对齐，使用 markdown。不要输出大段空话，不要强行生成卡点报告。

回答策略：
- 默认给出足够把问题讲清楚的中等长度解释，不要为了简短而省略关键推理、背景或例子。
- 用户明确要求“简短回答”“一句话”“只要结论”等短答时，可以压缩篇幅。
- 资料总结、学习规划、复盘梳理类问题允许结构化展开，使用小标题、列表或步骤把重点讲完整。

推荐结构：
1. 直接回答
2. 核心解释
3. 例子或推导
4. 易混点
5. 下一步建议

如果问题很简单，可以直接回答；如果问题需要解释，保持清晰、完整。`;

const REVIEW_SYSTEM_PROMPT = `你是学习复盘整理器。你的任务不是重新讲课，而是从用户的学习过程里提炼可复习的卡点。每个卡点必须具体，不能写“数学不会”“概念不清”这种空话。每个卡点包含：
- title：具体哪里不会
- coreExplanation：一句话指出真正困惑
- suggestedReviewAction：建议如何复习
输出必须稳定，方便前端解析。只输出合法 JSON 对象，不要代码块，不要前言。`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function env(name: string) {
  return (Deno.env.get(name) || "").trim();
}

function clampTopK(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(Math.max(Math.floor(parsed), 1), 8);
}

function shouldSearchWeb(body: RequestBody) {
  const mode = body.mode === "review" ? "review" : "answer";
  if (mode === "review") return false;
  const options = body.webSearch || {};
  if (options.enabled === false) return false;
  const message = String(body.message || "").trim();
  if (!message) return false;
  if (options.mode === "always") return true;
  if (message.length < 6) return false;
  const lower = message.toLowerCase();
  if (/^(hi|hello|hey|ok|thanks|thank you)$/i.test(lower)) return false;
  return true;
}

function normalizeSearchResult(item: Record<string, unknown>, source: string): WebCitation | null {
  const title = String(item.title || item.name || "").trim();
  const url = String(item.url || item.link || item.href || "").trim();
  const snippet = String(item.content || item.snippet || item.description || item.summary || "").replace(/\s+/g, " ").trim();
  if (!url || (!title && !snippet)) return null;
  return {
    title: title || url,
    url,
    snippet,
    source,
  };
}

async function searchWeb(query: string, options: WebSearchOptions = {}): Promise<WebCitation[]> {
  const tavilyKey = env("TAVILY_API_KEY") || env("WEB_SEARCH_API_KEY");
  if (!tavilyKey) return [];
  const endpoint = env("WEB_SEARCH_URL") || "https://api.tavily.com/search";
  const topK = clampTopK(options.topK);

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

function buildWebContext(citations: WebCitation[]) {
  if (!citations.length) return "";
  const blocks = citations.map((item, index) => {
    const snippet = item.snippet ? `摘要：${item.snippet}` : "";
    return [`[W${index + 1}] ${item.title}`, `URL：${item.url}`, snippet].filter(Boolean).join("\n");
  });
  return `联网搜索补充资料：\n${blocks.join("\n\n")}\n\n使用要求：优先结合用户上传/引用资料和公共资料库；联网搜索只作为补充。若使用联网信息，请在回答中自然标注来源编号（如 W1）。`;
}

function upstreamErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const value = data as { error?: { message?: unknown }, message?: unknown };
  return String(value.error?.message || value.message || "").trim();
}

function deepSeekError(status: number, data: unknown) {
  const detail = upstreamErrorMessage(data);
  if (status === 401 || status === 403) {
    return json({
      error: "平台 AI 服务鉴权失败：AI_API_KEY 无效、未配置或 ai-chat 鉴权失败。",
      code: "AI_AUTH_FAILED",
      upstreamStatus: status,
      detail,
    }, 401);
  }
  if (status === 429) {
    return json({
      error: detail || "平台 AI 服务请求过于频繁，请稍后再试。",
      code: "AI_RATE_LIMITED",
      upstreamStatus: status,
    }, 429);
  }
  if (status >= 500) {
    return json({
      error: detail || "DeepSeek 服务暂不可用，请稍后再试。",
      code: "AI_UPSTREAM_UNAVAILABLE",
      upstreamStatus: status,
    }, 502);
  }
  return json({
    error: detail || `DeepSeek API 请求失败：HTTP ${status}`,
    code: "AI_UPSTREAM_ERROR",
    upstreamStatus: status,
  }, 502);
}

function normalizeHistory(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) return [];
  return history
    .map((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: String(item?.content || "").trim(),
    }))
    .filter((item) => item.content)
    .slice(-20);
}

function subjectInstructionBlock(body: RequestBody) {
  const instruction = String(body.subjectInstruction || "").trim();
  if (!instruction) return "";
  return `当前学科的项目指令如下。它只作用于本学科内的聊天、复盘、来源问答和规划，不作用于普通对话：\n${instruction}`;
}

function planningInstructionBlock(body: RequestBody) {
  if (body.conversationType !== "planning") return "";
  const draftContext = body.draftContext ? JSON.stringify(body.draftContext, null, 2) : "";
  return [
    "你正在帮助用户做学习规划。若需要生成任务草案，请在自然语言回复后附加一个 JSON 对象，格式为：",
    '{"drafts":[{"title":"","subjectName":"","description":"","plannedStart":"","plannedEnd":""}]}',
    "任务草案要具体、可执行、时间明确；不要直接加入日程，等待用户确认。",
    draftContext ? `本次规划上下文：\n${draftContext}` : "",
  ].filter(Boolean).join("\n");
}

function extractDrafts(reply: string) {
  const text = String(reply || "");
  const match = text.match(/\{[\s\S]*"drafts"[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed?.drafts) ? parsed.drafts : [];
  } catch {
    return [];
  }
}

function buildMessages(body: RequestBody, webContextText = "") {
  const mode = body.mode === "review" ? "review" : "answer";
  const message = String(body.message || "").trim();
  const baseContextText = String(body.contextText || "").trim();
  const scopedInstructions = body.conversationType === "free"
    ? ""
    : [subjectInstructionBlock(body), planningInstructionBlock(body)].filter(Boolean).join("\n\n");
  const contextText = [scopedInstructions, baseContextText, webContextText].filter(Boolean).join("\n\n");
  const history = normalizeHistory(body.history);

  if (!message) {
    throw new Error("message 不能为空");
  }

  if (mode === "review") {
    return {
      mode,
      messages: [
        { role: "system", content: REVIEW_SYSTEM_PROMPT },
        {
          role: "user",
          content: `请根据这次学习过程生成复盘草稿。输出必须是这个 JSON 结构：{
  "segments": [{"title": "", "subject": "", "progressNote": ""}],
  "candidateBlockages": [{"title": "", "coreExplanation": "", "reason": "", "suggestedReviewAction": ""}],
  "mistakes": ["短句错因"],
  "reflections": ["短句心得"]
}

${contextText ? `补充上下文：\n${contextText}\n\n` : ""}本次学习过程：${message}`,
        },
      ],
    };
  }

  return {
    mode,
    messages: [
      { role: "system", content: ANSWER_SYSTEM_PROMPT },
      ...(contextText ? [{ role: "system", content: contextText }] : []),
      ...history,
      { role: "user", content: message },
    ],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const apiKey = env("AI_API_KEY");
    if (!apiKey) {
      return json({
        error: "AI_API_KEY 未配置，请在 Supabase secrets 中设置 AI_API_KEY。",
        code: "AI_KEY_MISSING",
      }, 500);
    }

    const body = await req.json().catch(() => ({})) as RequestBody;
    const webCitations = shouldSearchWeb(body)
      ? await searchWeb(String(body.message || "").trim(), body.webSearch || {}).catch((err) => {
        console.warn("web search error", err);
        return [] as WebCitation[];
      })
      : [];
    const { mode, messages } = buildMessages(body, buildWebContext(webCitations));
    const response = await fetch(TEXT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: env("AI_MODEL") || DEFAULT_MODEL,
        messages,
        temperature: mode === "review" ? 0.2 : 0.3,
        max_tokens: mode === "review" ? 2400 : 2200,
        ...(mode === "review" ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return deepSeekError(response.status, data);
    }

    const reply = data?.choices?.[0]?.message?.content || "";
    return json({
      reply,
      drafts: extractDrafts(reply),
      ...(webCitations.length > 0 ? { webCitations } : {}),
    });
  } catch (err) {
    return json({
      error: err instanceof Error ? err.message : "AI 请求失败",
      code: "AI_BACKEND_ERROR",
    }, 500);
  }
});
