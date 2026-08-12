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

type PlanningAction = "chat" | "generate_drafts";

type PlanningStage = "needs_info" | "ready_to_generate" | "drafts_generated";

type PlanningMeta = {
  stage: PlanningStage;
  missingFields: string[];
  suggestedAction: "answer_questions" | "generate_drafts" | "review_drafts";
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

  /**
   * AI 规划页专用。
   *
   * chat:
   *   默认阶段。AI 应先追问、总结规划，不应直接生成任务草案。
   *
   * generate_drafts:
   *   用户已经明确确认生成任务草案，此时才允许输出 drafts JSON。
   */
  planningAction?: PlanningAction;

  /**
   * 预留给前端后续传结构化规划状态。
   * 当前后端也会基于 message/history/draftContext 做简单信息充分度判断。
   */
  planningState?: {
    goal?: string;
    purpose?: string;
    currentLevel?: string;
    deadline?: string;
    weeklyHours?: string;
    scope?: string;
    preferences?: string;
    confirmed?: boolean;
  } | null;
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

const PLANNING_SYSTEM_PROMPT = `你是 AI 学习规划助手。当前页面是“AI规划”，不是普通知识讲解页，也不是术语百科页。

你的核心任务：
- 引导用户把模糊学习需求变成可执行学习计划。
- 先确认学习目的、当前基础、时间期限、可用时间、学习范围和偏好。
- 信息不足时追问。
- 信息充分时给规划摘要。
- 用户明确确认后才生成任务草案。

最重要的行为边界：
1. 当用户输入“我想学高等数学”“我想学英语”“我想准备考试”“我想学机器学习”这类宽泛学习需求时，不要解释“高等数学是什么”“英语是什么”“机器学习是什么”，不要输出术语定义。
2. 上述输入应被理解为“规划需求”，不是“概念解释需求”。
3. 你的第一反应应该是帮助用户澄清需求，而不是讲课。
4. 只有当用户明确问“什么是 X”“解释一下 X”“X 的定义是什么”“我不懂 X 是什么意思”时，才可以简短解释概念。
5. 即使用户明确要求解释概念，如果当前 conversationType 是 planning，也只能给 1-2 句简短解释，然后立刻回到规划追问。
6. 不要在信息不足时生成任务草案。
7. 不要在用户未确认时输出 drafts JSON。
8. 不要自动加入日程。

推荐回复方式：
- 如果信息不足，直接说“可以。我先确认几个信息，这样生成的学习计划会更准确：”，然后追问 3-5 个问题。
- 如果信息较充分，输出“规划摘要”，并询问“是否现在生成任务草案？”
- 如果用户确认生成，再生成 3-6 个具体任务草案。`;

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

function getPlanningAction(body: RequestBody): PlanningAction {
  return body.planningAction === "generate_drafts" ? "generate_drafts" : "chat";
}

function isPlanningConversation(body: RequestBody) {
  return body.conversationType === "planning";
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
  const snippet = String(item.content || item.snippet || item.description || item.summary || "")
    .replace(/\s+/g, " ")
    .trim();

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

  const data = await response.json().catch(() => ({})) as { results?: unknown[] };
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
  const value = data as { error?: { message?: unknown }; message?: unknown };
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
    .map((item: unknown) => {
      const value = item as { role?: unknown; content?: unknown };
      return {
        role: value?.role === "assistant" ? "assistant" : "user",
        content: String(value?.content || "").trim(),
      };
    })
    .filter((item) => item.content)
    .slice(-20);
}

function subjectInstructionBlock(body: RequestBody) {
  const instruction = String(body.subjectInstruction || "").trim();
  if (!instruction) return "";

  return `当前学科的项目指令如下。它只作用于本学科内的聊天、复盘、来源问答和规划，不作用于普通对话：\n${instruction}`;
}

function hasExplicitDraftGenerationIntent(message: string) {
  const text = String(message || "").trim();
  if (!text) return false;

  const normalized = text.replace(/\s+/g, "");

  const strongPatterns = [
    /生成任务草案/,
    /生成任務草案/,
    /确认生成/,
    /確認生成/,
    /可以生成/,
    /开始生成/,
    /開始生成/,
    /帮我生成.*任务/,
    /幫我生成.*任務/,
    /生成.*学习计划/,
    /生成.*學習計劃/,
    /生成.*计划任务/,
    /生成.*規劃任務/,
    /生成.*草案/,
    /创建.*任务草案/,
    /建立.*任務草案/,
    /把.*生成.*任务/,
    /把.*生成.*任務/,
    /^生成$/,
    /^确认$/,
    /^確認$/,
    /^可以$/,
  ];

  return strongPatterns.some((pattern) => pattern.test(normalized));
}

function hasExplicitConceptQuestionIntent(message: string) {
  const text = String(message || "").trim();
  if (!text) return false;

  const normalized = text.replace(/\s+/g, "");

  const patterns = [
    /什么是.+/,
    /.+是什么/,
    /.+是什么意思/,
    /.+的定义/,
    /定义一下.+/,
    /解释一下.+/,
    /解释.+概念/,
    /我不懂.+是什么意思/,
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}

function isBroadLearningGoal(message: string) {
  const text = String(message || "").trim();
  if (!text) return false;

  const normalized = text.replace(/\s+/g, "");

  const hasLearningVerb = /(想学|想学习|我要学|我要学习|准备学|准备学习|开始学|开始学习|想复习|我要复习|准备复习|想准备|我要准备)/.test(normalized);
  const hasConcreteQuestion = hasExplicitConceptQuestionIntent(normalized);
  const isShortGoal = normalized.length <= 36;

  return hasLearningVerb && isShortGoal && !hasConcreteQuestion;
}

function planningInstructionBlock(body: RequestBody) {
  if (!isPlanningConversation(body)) return "";

  const message = String(body.message || "");
  const draftContext = body.draftContext ? JSON.stringify(body.draftContext, null, 2) : "";
  const planningAction = getPlanningAction(body);
  const broadLearningGoal = isBroadLearningGoal(message);
  const explicitConceptQuestion = hasExplicitConceptQuestionIntent(message);

  const baseRules = [
    "你正在帮助用户做学习规划。当前页面是 AI 规划页，不是普通知识讲解页。",
    "你的目标不是马上给知识讲解，而是引导用户明确目标、基础、时间和范围，然后生成可执行学习任务。",
    "",
    "工作流程：",
    "1. 先判断用户目标是否具体。",
    "2. 如果信息不足，先追问学习目的、当前基础、时间期限、每周可用时间、学习范围、学习偏好。",
    "3. 如果信息较充分，先输出“规划摘要”，并询问用户是否生成任务草案。",
    "4. 只有用户明确确认后，才生成任务草案 JSON。",
    "5. 不要自动加入日程，任务草案仍需用户确认。",
    "",
    "硬性规则：",
    "1. 当用户第一次只输入宽泛目标，例如“我想学高等数学”“我想学英语”“我要准备考试”，禁止生成任务草案。",
    "2. 对宽泛学习目标，不要解释术语定义，不要讲“高等数学是什么”“机器学习是什么”。",
    "3. 信息不足时，你必须追问 3-5 个关键问题。",
    "4. 信息不足时，不要附加 drafts JSON。",
    "5. 不要把 AI 规划页回复写成单纯知识讲解；优先做目标澄清、范围确认和任务拆解。",
    "6. 只有用户明确问“什么是 / 定义 / 解释一下 / 是什么意思”时，才允许简短解释术语。",
    "7. 即使允许解释术语，也最多 1-2 句，然后必须回到规划追问。",
  ].join("\n");

  const intentInstruction = broadLearningGoal
    ? [
      "本轮用户输入被判定为“宽泛学习目标”。",
      "你必须直接进入规划追问。",
      "不要解释该学科或术语的定义。",
      "推荐开头：可以。我先确认几个信息，这样生成的学习计划会更准确：",
    ].join("\n")
    : explicitConceptQuestion
    ? [
      "本轮用户可能在问概念解释。",
      "如果确实需要解释，请只用 1-2 句简短说明，不要展开成课程讲解。",
      "解释后立刻追问规划所需信息。",
    ].join("\n")
    : [
      "如果本轮输入仍然偏宽泛，请优先追问，不要讲课。",
    ].join("\n");

  const draftFormat = [
    "当且仅当允许生成任务草案时，才可以在自然语言回复后附加一个 JSON 对象。",
    "JSON 格式必须严格为：",
    '{"drafts":[{"title":"","subjectName":"","description":"","plannedStart":"","plannedEnd":""}]}',
    "JSON 必须是合法 JSON，不要放进 markdown 代码块。",
    "plannedStart 和 plannedEnd 尽量使用 ISO 时间字符串；如果上下文没有明确日期，可以留空字符串。",
  ].join("\n");

  const actionInstruction = planningAction === "generate_drafts"
    ? [
      "当前用户已经明确确认生成任务草案。",
      "请根据已有上下文生成 3-6 个具体、可执行、时间明确的任务草案。",
      "可以附加 drafts JSON。",
      "自然语言部分应简短说明“已生成草案，可确认后加入日程”。",
    ].join("\n")
    : [
      "当前还处于规划对话阶段，默认禁止生成 drafts JSON。",
      "除非用户本轮消息明确包含“生成任务草案”“确认生成”“可以生成”“帮我生成计划任务”等确认意图，否则不要输出 drafts JSON。",
      "如果信息不足，请追问。",
      "如果信息较充分，请输出规划摘要，并邀请用户点击或回复“生成任务草案”。",
    ].join("\n");

  return [
    baseRules,
    intentInstruction,
    actionInstruction,
    draftFormat,
    draftContext ? `本次规划上下文：\n${draftContext}` : "",
  ].filter(Boolean).join("\n\n");
}

function collectPlanningText(body: RequestBody) {
  const history = normalizeHistory(body.history);
  const planningStateText = body.planningState ? JSON.stringify(body.planningState) : "";
  const draftContextText = body.draftContext ? JSON.stringify(body.draftContext) : "";

  return [
    ...history.map((item) => item.content || ""),
    String(body.message || ""),
    planningStateText,
    draftContextText,
  ]
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

function analyzePlanningReadiness(body: RequestBody): PlanningMeta | null {
  if (!isPlanningConversation(body)) return null;

  const combined = collectPlanningText(body);
  const planningAction = getPlanningAction(body);
  const currentMessage = String(body.message || "");

  const checks = [
    {
      key: "purpose",
      label: "学习目的",
      pattern: /(考试|期末|期中|考研|竞赛|比赛|作业|论文|项目|面试|系统学习|自学|入门|复习|预习|提升|补基础|查漏补缺)/,
    },
    {
      key: "currentLevel",
      label: "当前基础",
      pattern: /(零基础|基础|学过|没学过|薄弱|一般|熟悉|掌握|不会|不懂|卡在|学到|刚开始|已经学|比较熟|比较差)/,
    },
    {
      key: "deadline",
      label: "时间期限",
      pattern: /(今天|明天|后天|本周|这周|下周|两周|三周|一周|一个月|月底|期末|考试时间|截止|deadline|\d+\s*(天|周|星期|个月|月|小时|分钟))/,
    },
    {
      key: "availableTime",
      label: "可用时间",
      pattern: /(每天|每周|周末|晚上|早上|下午|上午|小时|h|分钟|空闲|可用时间|有空|投入|安排|学习时间)/,
    },
    {
      key: "scope",
      label: "学习范围",
      pattern: /(章节|范围|重点|教材|课本|知识点|考纲|大纲|极限|导数|积分|级数|线代|概率|单词|语法|阅读|听力|写作|模型|算法|题型)/,
    },
  ];

  const state = body.planningState || {};
  const stateKnown = new Set<string>();

  if (state.purpose) stateKnown.add("purpose");
  if (state.currentLevel) stateKnown.add("currentLevel");
  if (state.deadline) stateKnown.add("deadline");
  if (state.weeklyHours) stateKnown.add("availableTime");
  if (state.scope) stateKnown.add("scope");

  const missingFields = checks
    .filter((check) => !stateKnown.has(check.key) && !check.pattern.test(combined))
    .map((check) => check.label);

  const knownCount = checks.length - missingFields.length;
  const confirmIntent = hasExplicitDraftGenerationIntent(currentMessage);

  if (planningAction === "generate_drafts" || confirmIntent) {
    return {
      stage: "drafts_generated",
      missingFields,
      suggestedAction: "review_drafts",
    };
  }

  if (knownCount >= 3) {
    return {
      stage: "ready_to_generate",
      missingFields,
      suggestedAction: "generate_drafts",
    };
  }

  return {
    stage: "needs_info",
    missingFields,
    suggestedAction: "answer_questions",
  };
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

function removeDraftJsonFromReply(reply: string) {
  return String(reply || "")
    .replace(/\{[\s\S]*"drafts"[\s\S]*\}\s*$/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function canExtractDrafts(body: RequestBody, reply: string) {
  if (!isPlanningConversation(body)) return false;
  if (!extractDrafts(reply).length) return false;

  if (getPlanningAction(body) === "generate_drafts") return true;

  const currentMessage = String(body.message || "").trim();
  if (hasExplicitDraftGenerationIntent(currentMessage)) return true;

  return false;
}

function getSystemPrompt(body: RequestBody) {
  if (isPlanningConversation(body)) return PLANNING_SYSTEM_PROMPT;
  return ANSWER_SYSTEM_PROMPT;
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
      { role: "system", content: getSystemPrompt(body) },
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

    const planningMeta = analyzePlanningReadiness(body);
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
        temperature: mode === "review" ? 0.2 : 0.25,
        max_tokens: mode === "review" ? 2400 : 2200,
        ...(mode === "review" ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    const data = await response.json().catch(() => ({})) as {
      choices?: Array<{ message?: { content?: string } }>;
    } & Record<string, unknown>;

    if (!response.ok) {
      return deepSeekError(response.status, data);
    }

    const rawReply = String(data?.choices?.[0]?.message?.content || "");
    const draftsAllowed = canExtractDrafts(body, rawReply);
    const drafts = draftsAllowed ? extractDrafts(rawReply) : [];
    const reply = removeDraftJsonFromReply(rawReply);

    return json({
      reply,
      drafts,
      ...(planningMeta ? { planningMeta } : {}),
      ...(webCitations.length > 0 ? { webCitations } : {}),
    });
  } catch (err) {
    return json({
      error: err instanceof Error ? err.message : "AI 请求失败",
      code: "AI_BACKEND_ERROR",
    }, 500);
  }
});