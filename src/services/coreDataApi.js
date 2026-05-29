import { supabase, supabaseConfigError } from "./supabaseClient";

export function requireSupabase() {
    if (!supabase) {
        throw new Error(supabaseConfigError || "Supabase 未初始化");
    }
    return supabase;
}

function readErrorStatus(error) {
    const status = error?.status ?? error?.statusCode ?? error?.status_code;
    return Number.isFinite(status) ? status : 0;
}

export function isSupabaseAuthError(error) {
    const status = readErrorStatus(error);
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    if (status === 401 || status === 403) return true;
    if (code === "PGRST301") return true;
    return /jwt|not\s+authorized|permission\s+denied/i.test(message);
}

export function isSupabaseTableMissingError(error) {
    const status = readErrorStatus(error);
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    const details = String(error?.details || "");
    if (status === 404) return true;
    if (code === "PGRST205" || code === "42P01") return true;
    return /could not find the table|relation .* does not exist/i.test(`${message} ${details}`);
}

export async function getCurrentUserId(explicitUserId) {
    if (explicitUserId) return explicitUserId;
    const { data, error } = await requireSupabase().auth.getUser();
    if (error) throw error;
    if (!data?.user?.id) throw new Error("请先登录后再同步数据。");
    return data.user.id;
}

export function compactObject(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(([, item]) => item !== undefined),
    );
}

export function oneLine(value, max = 40) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max)}...` : text;
}
