const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SearchScope = "public" | "private" | "all";

type RequestBody = {
  query?: string;
  scope?: SearchScope;
  filters?: Record<string, unknown>;
  resourceIds?: string[];
  subjectId?: string;
  topK?: number;
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
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
  resources?: Resource | null;
};

type Resource = {
  id: string;
  name?: string | null;
  scope?: string | null;
  file_type?: string | null;
  storage_path?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
  can_preview?: boolean | null;
  can_download?: boolean | null;
  can_reference?: boolean | null;
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
  if (!Number.isFinite(parsed)) return 8;
  return Math.max(1, Math.min(30, Math.floor(parsed)));
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

async function fetchChunks(chunkIds: string[]) {
  const validChunkIds = [...new Set(chunkIds.filter(isUuid))];
  if (!validChunkIds.length) return [];

  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase service configuration");

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
    "tags",
    "metadata",
    "resources(id,name,scope,file_type,storage_path,summary,tags,metadata,can_preview,can_download,can_reference)",
  ].join(",");
  const url = new URL(`${supabaseUrl}/rest/v1/resource_chunks`);
  url.searchParams.set("id", `in.(${validChunkIds.join(",")})`);
  url.searchParams.set("select", select);

  const res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase chunk lookup failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as ResourceChunk[];
}

function truncate(text: string, max = 180) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function titleOf(chunk?: ResourceChunk, resource?: Resource | null, fields?: Record<string, unknown>) {
  return String(resource?.name || chunk?.title || fields?.title || "Untitled resource");
}

function contentPreviewOf(chunk?: ResourceChunk, fields?: Record<string, unknown>) {
  const textField = env("PINECONE_TEXT_FIELD", "text");
  return String(
    chunk?.content_preview ||
      (chunk?.content ? truncate(chunk.content) : "") ||
      (chunk?.embedding_text ? truncate(chunk.embedding_text) : "") ||
      fields?.content_preview ||
      (fields?.embedding_text ? truncate(String(fields.embedding_text)) : "") ||
      (fields?.[textField] ? truncate(String(fields[textField])) : "") ||
      (fields?.text ? truncate(String(fields.text)) : "") ||
      (fields?.content ? truncate(String(fields.content)) : "") ||
      "",
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as RequestBody;
    const query = String(body.query || "").trim();
    if (!query) return json({ error: "query is required" }, 400);

    const scope: SearchScope = body.scope === "private" || body.scope === "all" ? body.scope : "public";
    const userId = await getUserId(req);
    const namespaces = namespacesFor(scope, userId);
    if (!namespaces.length) return json({ results: [], usage: { reason: "private scope requires auth" } });

    const filters = {
      ...(body.filters || {}),
      ...(Array.isArray(body.resourceIds) && body.resourceIds.length > 0 ? { resourceId: body.resourceIds } : {}),
      ...(body.subjectId ? { subject_id: body.subjectId } : {}),
    };
    const host = await getPineconeHost();
    const searches = await Promise.all(namespaces.map((namespace) => searchNamespace(host, namespace, { ...body, scope, filters })));
    const hits = searches.flat().sort((a, b) => Number(b._score || 0) - Number(a._score || 0)).slice(0, clampTopK(body.topK));
    const chunkIds = hits.map((hit) => String(hit.fields?.chunk_id || hit._id || "")).filter(Boolean);
    const chunks = await fetchChunks(chunkIds);
    const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

    const results = hits.map((hit) => {
      const chunkId = String(hit.fields?.chunk_id || hit._id || "");
      const chunk = chunkById.get(chunkId);
      const resource = chunk?.resources;
      const resourceScope = String(resource?.scope || chunk?.scope || hit.fields?.scope || "public");
      const contentPreview = contentPreviewOf(chunk, hit.fields);

      return {
        resourceId: chunk?.resource_id || hit.fields?.resource_id || "",
        fileId: chunk?.resource_id || hit.fields?.resource_id || "",
        chunkId,
        scope: resourceScope,
        title: titleOf(chunk, resource, hit.fields),
        contentPreview,
        summary: resource?.summary || contentPreview,
        snippet: contentPreview,
        score: hit._score || 0,
        canPreview: resource?.can_preview ?? true,
        canDownload: resource?.can_download ?? false,
        canReference: resource?.can_reference ?? true,
        fileType: resource?.file_type || "",
        storagePath: resource?.storage_path || "",
        tags: resource?.tags || chunk?.tags || [],
        metadata: {
          ...(resource?.metadata || {}),
          ...(chunk?.metadata || {}),
          pineconeNamespace: hit.namespace,
          subject: chunk?.subject || hit.fields?.subject || null,
          chapter: chunk?.chapter || hit.fields?.chapter || null,
          section: chunk?.section || hit.fields?.section || null,
          pageStart: chunk?.page_start || null,
          pageEnd: chunk?.page_end || null,
        },
      };
    });

    return json({ results, query, scope, topK: clampTopK(body.topK) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
