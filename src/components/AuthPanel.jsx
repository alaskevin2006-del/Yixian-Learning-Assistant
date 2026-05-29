import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "../services/supabaseClient";

function authErrorMessage(message = "") {
    const text = String(message || "").trim();
    const lower = text.toLowerCase();
    if (!text) return "操作失败：未知错误";
    if (lower.includes("invalid login credentials")) return "邮箱或密码错误，或该邮箱尚未注册。";
    if (lower.includes("email not confirmed")) return "请先前往邮箱完成确认，再回来登录。";
    if (lower.includes("user already registered") || lower.includes("already registered") || lower.includes("already exists")) {
        return "该邮箱已注册，请直接登录。";
    }
    if (
        lower.includes("too many requests") ||
        lower.includes("rate limit") ||
        lower.includes("request rate limit reached") ||
        lower.includes("over_email_send_rate_limit")
    ) {
        return "请求过于频繁，请稍后再试。";
    }
    if (
        lower.includes("failed to fetch") ||
        lower.includes("fetch failed") ||
        lower.includes("network")
    ) {
        return "网络连接失败，请刷新后重试。";
    }
    return `操作失败：${text}`;
}

export default function AuthPanel({ open, onClose, mode = "login", setMode, session, currentUser }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [phase, setPhase] = useState("idle");
    const [activeAction, setActiveAction] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const isRegister = mode === "register";
    const isLoading = phase === "loading" || submitting;

    const resetPanel = () => {
        setEmail("");
        setPassword("");
        setStatus("");
        setError("");
        setPhase("idle");
        setActiveAction("");
        setSubmitting(false);
    };

    useEffect(() => {
        if (open) resetPanel();
    }, [open]);

    const statusLabel = useMemo(() => {
        if (currentUser || session) return "已登录";
        if (phase === "loading") return activeAction === "register" ? "注册中…" : activeAction === "login" ? "登录中…" : "处理中…";
        if (phase === "success") {
            if (activeAction === "login") return "登录成功";
            if (activeAction === "register") return status.includes("已登录") ? "注册成功，已登录" : "注册成功，请按提示继续";
            if (activeAction === "logout") return "已退出登录";
            return "操作成功";
        }
        if (phase === "error") return activeAction === "register" ? "注册失败" : activeAction === "login" ? "登录失败" : "操作失败";
        return "未登录";
    }, [activeAction, currentUser, phase, session, status]);

    if (!open) return null;

    const submit = async (event) => {
        event.preventDefault();
        if (isLoading) return;
        setStatus("");
        setError("");
        if (!supabase) {
            setPhase("error");
            setError(supabaseConfigError || "Supabase 尚未配置。");
            return;
        }
        const cleanEmail = email.trim();
        if (!cleanEmail || !password) {
            setPhase("error");
            setError("请输入邮箱和密码。");
            return;
        }
        if (String(password).length < 6) {
            setPhase("error");
            setError("密码长度过短，请至少输入 6 位。");
            return;
        }
        setSubmitting(true);
        setPhase("loading");
        setActiveAction(isRegister ? "register" : "login");
        try {
            const action = isRegister
                ? supabase.auth.signUp({ email: cleanEmail, password })
                : supabase.auth.signInWithPassword({ email: cleanEmail, password });
            const { data, error: authError } = await action;
            if (authError) throw authError;
            if (isRegister && !data?.session) {
                setPhase("success");
                setStatus("注册成功。如果系统要求邮箱确认，请前往邮箱完成确认后再登录。");
            } else {
                setPhase("success");
                setStatus(isRegister ? "注册成功，已登录。" : "登录成功。");
                setEmail("");
                setPassword("");
            }
        } catch (err) {
            setPhase("error");
            setError(authErrorMessage(err?.message));
        } finally {
            setSubmitting(false);
            setPhase((prev) => (prev === "loading" ? "idle" : prev));
        }
    };

    const signOut = async () => {
        if (!supabase) return;
        if (isLoading) return;
        setSubmitting(true);
        setError("");
        setStatus("");
        setPhase("loading");
        setActiveAction("logout");
        const { error: signOutError } = await supabase.auth.signOut();
        setSubmitting(false);
        if (signOutError) {
            setPhase("error");
            setError(authErrorMessage(signOutError.message));
        }
        else {
            setPhase("success");
            setStatus("已退出登录。");
            onClose?.();
        }
    };

    const handleClose = () => {
        resetPanel();
        onClose?.();
    };

    const switchMode = (nextMode) => {
        if (isLoading) return;
        setStatus("");
        setError("");
        setPhase("idle");
        setActiveAction("");
        setMode(nextMode);
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="账号"
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 120,
                background: "rgba(17,17,17,0.38)",
                display: "grid",
                placeItems: "center",
                padding: 18,
            }}
            onClick={handleClose}
        >
            <div
                style={{
                    width: "min(420px, 100%)",
                    borderRadius: 18,
                    background: "#ffffff",
                    padding: 18,
                    boxShadow: "0 24px 80px rgba(0,0,0,0.24)",
                    display: "grid",
                    gap: 14,
                }}
                onClick={(event) => event.stopPropagation()}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 18, fontWeight: 900 }}>账号</div>
                        <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
                            {currentUser ? `当前已登录：${currentUser.email}` : "登录后可使用 AI 服务并保存学习数据。"}
                        </div>
                    </div>
                    <button type="button" onClick={handleClose} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, color: "#6b7280" }}>×</button>
                </div>

                {currentUser ? (
                    <button
                        type="button"
                        onClick={signOut}
                        disabled={submitting}
                        style={{
                            border: "1px solid rgba(198,198,198,0.45)",
                            borderRadius: 12,
                            background: "#111111",
                            color: "#ffffff",
                            padding: "11px 12px",
                            fontFamily: "inherit",
                            fontSize: 13,
                            fontWeight: 850,
                            cursor: submitting ? "not-allowed" : "pointer",
                        }}
                    >
                        {submitting ? "处理中..." : "退出登录"}
                    </button>
                ) : (
                    <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <button type="button" onClick={() => switchMode("login")} disabled={isLoading} style={tabStyle(!isRegister, isLoading)}>登录</button>
                            <button type="button" onClick={() => switchMode("register")} disabled={isLoading} style={tabStyle(isRegister, isLoading)}>注册</button>
                        </div>
                        <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="邮箱"
                            autoComplete="email"
                            disabled={isLoading}
                            style={{ ...inputStyle, opacity: isLoading ? 0.7 : 1 }}
                        />
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="密码"
                            autoComplete={isRegister ? "new-password" : "current-password"}
                            disabled={isLoading}
                            style={{ ...inputStyle, opacity: isLoading ? 0.7 : 1 }}
                        />
                        <button type="submit" disabled={isLoading} style={{ ...submitStyle, opacity: isLoading ? 0.7 : 1, cursor: isLoading ? "not-allowed" : "pointer" }}>
                            {isLoading ? (isRegister ? "注册中…" : "登录中…") : isRegister ? "注册" : "登录"}
                        </button>
                    </form>
                )}

                <div style={{ fontSize: 11, color: statusLabel === "已登录" ? "#166534" : phase === "error" ? "#b91c1c" : "#6b7280", fontWeight: 800 }}>
                    登录状态：{statusLabel}
                </div>
                {status && <div style={{ fontSize: 12, color: "#166534", lineHeight: 1.6, fontWeight: 800 }}>{status}</div>}
                {error && <div style={{ fontSize: 12, color: "#b91c1c", lineHeight: 1.6, fontWeight: 800 }}>{error}</div>}
            </div>
        </div>
    );
}

function tabStyle(active, disabled = false) {
    return {
        border: "1px solid rgba(198,198,198,0.36)",
        borderRadius: 10,
        background: active ? "#111111" : "#ffffff",
        color: active ? "#ffffff" : "#374151",
        padding: "9px 10px",
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: 850,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
    };
}

const inputStyle = {
    border: "1px solid rgba(198,198,198,0.45)",
    borderRadius: 12,
    padding: "11px 12px",
    fontFamily: "inherit",
    fontSize: 13,
    outline: "none",
};

const submitStyle = {
    border: "none",
    borderRadius: 12,
    background: "#111111",
    color: "#ffffff",
    padding: "11px 12px",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 850,
    cursor: "pointer",
};
