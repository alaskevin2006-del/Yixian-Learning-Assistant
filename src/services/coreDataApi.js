import { supabase, supabaseConfigError } from "./supabaseClient";

export function requireSupabase() {
    if (!supabase) {
        throw new Error(supabaseConfigError || "Supabase 未初始化");
    }
    return supabase;
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
