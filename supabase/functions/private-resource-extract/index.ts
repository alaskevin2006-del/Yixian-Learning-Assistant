import { extractFileText, type ExtractWarning } from "../_shared/fileExtractors.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET_NAME = "resource-files";
const MAX_PRIVATE_RESOURCE_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_CHARS = 12000;
const HARD_MAX_CHARS = 30000;

type ResourceRow = {
  id?: string;
  scope?: string;
  owner_user_id?: string;
  name?: string;
  type?: string;
  file_type?: string;
  storage_path?: string;
  status?: string;
  can_reference?: boolean;
  metadata?: Record<string, unknown> | null;
};

type DownloadResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; status: number; error: string; code: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function env(name: string, fallback = "") {
  return (Deno.env.get(name) || fallback).trim();
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

async function getOwnedPrivateResource(resourceId: string, userId: string, authHeader: string) {
  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return { error: "Supabase env is missing.", code: "SUPABASE_ENV_MISSING", status: 500 } as const;
  }

  const url = new URL(`${supabaseUrl}/rest/v1/resources`);
  url.searchParams.set("select", "id,scope,owner_user_id,name,type,file_type,storage_path,status,can_reference,metadata");
  url.searchParams.set("id", `eq.${resourceId}`);
  url.searchParams.set("scope", "eq.private");
  url.searchParams.set("owner_user_id", `eq.${userId}`);
  url.searchParams.set("limit", "1");

  const res = await fetch(url, {
    headers: {
      Authorization: authHeader,
      apikey: anonKey,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    return { error: `Resource lookup failed: HTTP ${res.status}`, code: "RESOURCE_LOOKUP_FAILED", status: res.status } as const;
  }

  const rows = await res.json().catch(() => []);
  const resource = Array.isArray(rows) ? rows[0] as ResourceRow | undefined : undefined;
  if (!resource?.id) {
    return { error: "Private resource not found or not owned by current user.", code: "RESOURCE_NOT_FOUND", status: 404 } as const;
  }
  if (resource.can_reference === false) {
    return { error: "This private resource is not referenceable.", code: "RESOURCE_REFERENCE_DISABLED", status: 403 } as const;
  }
  return { resource } as const;
}

function normalizeStoragePath(path: string) {
  return String(path || "").replace(/^\/+/, "");
}

function assertPrivateStoragePath(storagePath: string, userId: string, resourceId: string) {
  const normalized = normalizeStoragePath(storagePath);
  const prefix = `private/${userId}/${resourceId}/`;
  if (!normalized.startsWith(prefix)) {
    return { ok: false, error: "Resource storage path is outside the current user's private resource folder." } as const;
  }
  return { ok: true, path: normalized } as const;
}

function metadataSize(resource: ResourceRow) {
  const size = resource.metadata && typeof resource.metadata === "object" ? Number(resource.metadata.size) : NaN;
  return Number.isFinite(size) && size >= 0 ? size : 0;
}

async function downloadObject(storagePath: string, authHeader: string): Promise<DownloadResult> {
  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return { ok: false, status: 500, error: "Supabase env is missing.", code: "SUPABASE_ENV_MISSING" };
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
    return {
      ok: false,
      status: res.status,
      error: res.status === 404 ? "File not found." : `Storage read failed: HTTP ${res.status}`,
      code: res.status === 404 ? "FILE_NOT_FOUND" : "STORAGE_READ_FAILED",
    };
  }

  const contentLength = Number(res.headers.get("content-length") || 0);
  if (contentLength > MAX_PRIVATE_RESOURCE_BYTES) {
    return { ok: false, status: 413, error: "File is too large to extract.", code: "FILE_TOO_LARGE" };
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_PRIVATE_RESOURCE_BYTES) {
    return { ok: false, status: 413, error: "File is too large to extract.", code: "FILE_TOO_LARGE" };
  }
  return { ok: true, bytes };
}

function clampMaxChars(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_CHARS;
  return Math.min(Math.floor(parsed), HARD_MAX_CHARS);
}

function truncateText(text: string, maxChars: number) {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = getBearerToken(req);
    if (!token) return json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);

    const user = await getCurrentUser(authHeader);
    if (!user) return json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);

    const body = await req.json().catch(() => ({}));
    const resourceId = String(body?.resourceId || body?.resource_id || "").trim();
    if (!resourceId) return json({ error: "resourceId is required", code: "RESOURCE_ID_REQUIRED" }, 400);

    const lookup = await getOwnedPrivateResource(resourceId, user.id, authHeader);
    if ("error" in lookup) return json({ error: lookup.error, code: lookup.code }, lookup.status);

    const { resource } = lookup;
    const pathCheck = assertPrivateStoragePath(String(resource.storage_path || ""), user.id, resourceId);
    if (!pathCheck.ok) return json({ error: pathCheck.error, code: "STORAGE_PATH_FORBIDDEN" }, 403);

    if (metadataSize(resource) > MAX_PRIVATE_RESOURCE_BYTES) {
      return json({ error: "File is too large to extract.", code: "FILE_TOO_LARGE" }, 413);
    }

    const download = await downloadObject(pathCheck.path, authHeader);
    if (!download.ok) return json({ error: download.error, code: download.code }, download.status);

    const extracted = await extractFileText(String(resource.file_type || ""), download.bytes);
    const maxChars = clampMaxChars(body?.maxChars);
    const limited = truncateText(extracted.text, maxChars);
    const warnings: ExtractWarning[] = [...extracted.warnings];
    if (limited.truncated) {
      warnings.push({
        code: "PRIVATE_RESOURCE_TRUNCATED",
        message: "Private resource text was truncated before sending to AI context.",
      });
    }

    return json({
      resource: {
        id: String(resource.id || ""),
        name: String(resource.name || ""),
        fileType: String(resource.file_type || ""),
        storagePath: String(resource.storage_path || ""),
      },
      status: extracted.status,
      text: limited.text,
      charsUsed: limited.text.length,
      truncated: limited.truncated,
      warnings,
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : "private-resource-extract request failed",
      code: "PRIVATE_RESOURCE_EXTRACT_ERROR",
    }, 500);
  }
});
