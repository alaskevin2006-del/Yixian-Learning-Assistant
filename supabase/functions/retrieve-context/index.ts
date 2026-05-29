const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SearchScope = "public" | "private" | "all";

type Reference = {
  resourceId?: string;
  chunkId?: string;
  id?: string;
};

type RequestBody = {
  query?: string;
  references?: Reference[];
  scope?: SearchScope;
  filters?: Record<string, unknown>;
  resourceIds?: string[];
  subjectId?: string;
  topK?: number;
  maxChars?: number;
};

type PineconeHit = {
  _id?: string;
  _score?: number;
  fields?: Record<string, unknown>;
  namespace?: string;
};

type ResourceChunk = {
  id: string;
  resource_id: string;
  scope?: string | null;
  title?: string | null;
  content?: string | null;
  content_preview?: string | null;
  embedding_text?: string | null;
  chunk_index?: number | null;
  subject?: string | null;
  chapter?: string | null;
  section?: string | null;
  page_start?: number | null;
  page_end?: number | null;
  metadata?: Record<string, unknown> | null;
  resources?: Resource | null;
};

type Resource = {
  id: string;
  name?: string | null;
  scope?: string | null;
  owner_user_id?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function env(name: string, fallback = "") {
  return Deno.env.get(name) || fallback;
}

function clampTopK(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 6;
  return Math.max(1, Math.min(20, Math.floor(parsed)));
}

function maxChars(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 6000;
  return Math.max(800, Math.min(12000, Math.floor(parsed)));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getPineconeHost() {
  const directHost = env("PINECONE_INDEX_HOST");
  if (directHost) return directHost.replace(/^https?:\/\//, "");

  const indexName = env("PINECONE_INDEX_NAME");
  const apiKey = env("PINECONE_API_KEY");
  if (!indexName || !apiKey) throw new Error("Missing Pinecone configuration");

  const res = await fetch(`https://api.pinecone.io/indexes/${encodeURIComponent(indexName)}`, {
    headers: {
      "Api-Key": apiKey,
      "X-Pinecone-Api-Version": "2026-04",
    },
  });
  if (!res.ok) throw new Error(`Pinecone describe index failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!data?.host) throw new Error("Pinecone describe index response missing host");
  return String(data.host).replace(/^https?:\/\//, "");
}

async function getUserId(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return "";

  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return "";

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: anonKey,
    },
  });
  if (!res.ok) return "";
  const data = await res.json();
  return String(data?.id || "");
}

function namespacesFor(scope: SearchScope, userId: string) {
  const publicNamespace = env("PINECONE_PUBLIC_NAMESPACE", "public_resources");
  const privatePrefix = env("PINECONE_PRIVATE_NAMESPACE_PREFIX", "private_");

  if (scope === "public") return [publicNamespace];
  if (scope === "private") return userId ? [`${privatePrefix}${userId}`] : [];
  return userId ? [publicNamespace, `${privatePrefix}${userId}`] : [publicNamespace];
}

function toPineconeFilter(filters: Record<string, unknown> = {}, scope: SearchScope) {
  const filter: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    if (["resourceId", "resource_id"].includes(key)) {
      filter.resource_id = Array.isArray(value) ? { "$in": value.map(String) } : { "$eq": String(value) };
    }
    else if (Array.isArray(value)) filter[key] = { "$in": value };
    else filter[key] = { "$eq": value };
  }
  if (scope !== "all") filter.scope = { "$eq": scope };
  return Object.keys(filter).length ? filter : undefined;
}

async function searchNamespace(host: string, namespace: string, body: RequestBody) {
  const textField = env("PINECONE_TEXT_FIELD", "text");
  const fields = Array.from(new Set([
    textField,
    "text",
    "content",
    "embedding_text",
    "content_preview",
    "chunk_id",
    "resource_id",
    "scope",
    "title",
    "subject",
    "chapter",
    "section",
  ]));
  const res = await fetch(`https://${host}/records/namespaces/${encodeURIComponent(namespace)}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Api-Key": env("PINECONE_API_KEY"),
      "X-Pinecone-Api-Version": "2026-04",
    },
    body: JSON.stringify({
      query: {
        inputs: { text: body.query },
        top_k: clampTopK(body.topK),
        filter: toPineconeFilter(body.filters, body.scope || "all"),
      },
      fields,
    }),
  });
  if (!res.ok) throw new Error(`Pinecone search failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return ((data?.result?.hits || []) as PineconeHit[]).map((hit) => ({ ...hit, namespace }));
}

async function fetchChunksByIds(chunkIds: string[]) {
  const validChunkIds = [...new Set(chunkIds.filter(isUuid))];
  if (!validChunkIds.length) return [];
  const url = resourceChunkUrl();
  url.searchParams.set("id", `in.(${validChunkIds.join(",")})`);
  return await supabaseGet(url);
}

async function fetchChunksByResourceIds(resourceIds: string[], limitPerResource = 4) {
  const validResourceIds = [...new Set(resourceIds.filter(isUuid))];
  if (!validResourceIds.length) return [];
  const url = resourceChunkUrl();
  url.searchParams.set("resource_id", `in.(${validResourceIds.join(",")})`);
  url.searchParams.set("order", "chunk_index.asc");
  url.searchParams.set("limit", String(Math.max(1, validResourceIds.length * limitPerResource)));
  return await supabaseGet(url);
}

async function searchResourceReferences(host: string, namespaces: string[], body: RequestBody, resourceIds: string[]) {
  const validResourceIds = [...new Set(resourceIds.filter(isUuid))];
  const query = String(body.query || "").trim();
  if (!query || !validResourceIds.length) return [];

  const topK = clampTopK(body.topK);
  const searches = await Promise.all(validResourceIds.flatMap((resourceId) => (
    namespaces.map((namespace) => searchNamespace(host, namespace, {
      ...body,
      topK,
      filters: {
        ...(body.filters || {}),
        resourceId,
      },
    }))
  )));
  return searches
    .flat()
    .sort((a, b) => Number(b._score || 0) - Number(a._score || 0))
    .slice(0, topK);
}

function resourceChunkUrl() {
  const supabaseUrl = env("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("Missing Supabase URL");
  const select = [
    "id",
    "resource_id",
    "scope",
    "title",
    "content",
    "content_preview",
    "embedding_text",
    "chunk_index",
    "subject",
    "chapter",
    "section",
    "page_start",
    "page_end",
    "metadata",
    "resources(id,name,scope,owner_user_id,summary,tags,metadata)",
  ].join(",");
  const url = new URL(`${supabaseUrl}/rest/v1/resource_chunks`);
  url.searchParams.set("select", select);
  return url;
}

async function supabaseGet(url: URL) {
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) throw new Error("Missing Supabase service role key");
  const res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase chunk lookup failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as ResourceChunk[];
}

function titleOf(chunk?: ResourceChunk, resource?: Resource | null) {
  return String(resource?.name || chunk?.title || "Untitled resource");
}

function chunkScope(chunk: ResourceChunk) {
  return String(chunk.resources?.scope || chunk.scope || "public");
}

function canReadChunk(chunk: ResourceChunk, scope: SearchScope, userId: string) {
  const effectiveScope = chunkScope(chunk);
  if (effectiveScope === "public") return scope === "public" || scope === "all";
  if (effectiveScope !== "private") return false;
  if (!userId) return false;
  if (scope !== "private" && scope !== "all") return false;
  return String(chunk.resources?.owner_user_id || "") === userId;
}

function filterReadableChunks(chunks: ResourceChunk[], scope: SearchScope, userId: string) {
  return chunks.filter((chunk) => canReadChunk(chunk, scope, userId));
}

function previewText(text: string, max = 420) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function relevanceUsage(chunks: ResourceChunk[], scores: Map<string, number>) {
  const scored = chunks
    .map((chunk) => scores.get(chunk.id))
    .filter((score): score is number => Number.isFinite(score));
  const bestScore = scored.length ? Math.max(...scored) : null;
  const minScore = Number(env("RETRIEVE_CONTEXT_MIN_SCORE", "0.2"));
  const threshold = Number.isFinite(minScore) ? minScore : 0.2;
  return {
    bestScore,
    minScore: threshold,
    lowRelevance: bestScore == null || bestScore < threshold,
    reason: chunks.length === 0
      ? "no readable matching chunks"
      : bestScore == null
        ? "explicit references without semantic score"
        : bestScore < threshold
          ? "semantic score below threshold"
          : "ok",
  };
}

function buildContext(chunks: ResourceChunk[], scores: Map<string, number>, limit: number) {
  const blocks: string[] = [];
  const citations: unknown[] = [];
  let used = 0;

  for (const chunk of chunks) {
    const text = String(chunk.content || chunk.embedding_text || chunk.content_preview || "").replace(/\s+/g, " ").trim();
    if (!text) continue;

    const title = titleOf(chunk, chunk.resources);
    const block = `[${blocks.length + 1}] ${title} / chunk ${chunk.chunk_index ?? chunk.id}\n${text}`;
    if (used + block.length > limit && blocks.length > 0) break;

    blocks.push(block);
    used += block.length;
    citations.push({
      index: blocks.length,
      resourceId: chunk.resource_id,
      chunkId: chunk.id,
      title,
      contentPreview: previewText(text),
      chapter: chunk.chapter || null,
      section: chunk.section || null,
      pageStart: chunk.page_start || null,
      pageEnd: chunk.page_end || null,
      score: scores.get(chunk.id) || null,
      metadata: {
        ...(chunk.metadata || {}),
        subject: chunk.subject || null,
        chapter: chunk.chapter || null,
        section: chunk.section || null,
        pageStart: chunk.page_start || null,
        pageEnd: chunk.page_end || null,
      },
    });
  }

  return {
    contextText: blocks.join("\n\n"),
    citations,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as RequestBody;
    const references = Array.isArray(body.references) ? body.references : [];
    const explicitChunkIds = references.map((ref) => String(ref.chunkId || ref.id || "")).filter(Boolean);
    const explicitResourceIds = [
      ...references.map((ref) => String(ref.resourceId || "")).filter(Boolean),
      ...(Array.isArray(body.resourceIds) ? body.resourceIds.map(String) : []),
    ];
    const query = String(body.query || "").trim();
    const scope: SearchScope = body.scope === "private" || body.scope === "all" ? body.scope : "public";
    const userId = await getUserId(req);
    const namespaces = namespacesFor(scope, userId);

    let chunks: ResourceChunk[] = [];
    const scores = new Map<string, number>();

    if (explicitChunkIds.length || explicitResourceIds.length) {
      if ((scope === "private" || scope === "all") && !namespaces.length) {
        return json({ contextText: "", citations: [], usage: { reason: "private scope requires auth" } });
      }

      const validExplicitResourceIds = [...new Set(explicitResourceIds.filter(isUuid))];
      const resourceOnlyIds = validExplicitResourceIds.filter((resourceId) => (
        !references.some((ref) => String(ref.resourceId || "") === resourceId && String(ref.chunkId || ref.id || "").trim())
      ));

      const host = query && resourceOnlyIds.length ? await getPineconeHost() : "";
      const [byChunk, semanticHits, byResourceFallback] = await Promise.all([
        fetchChunksByIds(explicitChunkIds),
        host ? searchResourceReferences(host, namespaces, {
          ...body,
          scope,
          filters: {
            ...(body.filters || {}),
            ...(body.subjectId ? { subject_id: body.subjectId } : {}),
          },
        }, resourceOnlyIds) : Promise.resolve([]),
        !query && resourceOnlyIds.length ? fetchChunksByResourceIds(resourceOnlyIds) : Promise.resolve([]),
      ]);

      const semanticChunkIds = semanticHits.map((hit) => String(hit.fields?.chunk_id || hit._id || "")).filter(Boolean);
      for (const hit of semanticHits) {
        const chunkId = String(hit.fields?.chunk_id || hit._id || "");
        if (chunkId) scores.set(chunkId, Number(hit._score || 0));
      }

      const bySemantic = await fetchChunksByIds(semanticChunkIds);
      for (const chunk of byChunk) {
        if (!scores.has(chunk.id)) scores.set(chunk.id, 1);
      }
      const byId = new Map([...byChunk, ...bySemantic, ...byResourceFallback].map((chunk) => [chunk.id, chunk]));
      chunks = [...byId.values()].sort((a, b) => {
        const scoreDelta = (scores.get(b.id) || 0) - (scores.get(a.id) || 0);
        if (scoreDelta !== 0) return scoreDelta;
        const left = `${a.resource_id}:${String(a.chunk_index ?? 0).padStart(8, "0")}`;
        const right = `${b.resource_id}:${String(b.chunk_index ?? 0).padStart(8, "0")}`;
        return left.localeCompare(right);
      });
    } else {
      if (!query) return json({ error: "query or references is required" }, 400);

      if (!namespaces.length) return json({ contextText: "", citations: [], usage: { reason: "private scope requires auth" } });

      const host = await getPineconeHost();
      const filters = {
        ...(body.filters || {}),
        ...(body.subjectId ? { subject_id: body.subjectId } : {}),
        ...(explicitResourceIds.length > 0 ? { resourceId: explicitResourceIds } : {}),
      };
      const hits = (await Promise.all(namespaces.map((namespace) => searchNamespace(host, namespace, { ...body, scope, filters }))))
        .flat()
        .sort((a, b) => Number(b._score || 0) - Number(a._score || 0))
        .slice(0, clampTopK(body.topK));

      const chunkIds = hits.map((hit) => String(hit.fields?.chunk_id || hit._id || "")).filter(Boolean);
      for (const hit of hits) {
        const chunkId = String(hit.fields?.chunk_id || hit._id || "");
        if (chunkId) scores.set(chunkId, Number(hit._score || 0));
      }
      chunks = await fetchChunksByIds(chunkIds);
      chunks.sort((a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0));
    }

    chunks = filterReadableChunks(chunks, scope, userId);
    const context = buildContext(chunks, scores, maxChars(body.maxChars));
    return json({ ...context, chunkCount: chunks.length, usage: relevanceUsage(chunks, scores) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
