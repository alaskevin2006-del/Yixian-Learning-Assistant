import { Component, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error(error, info);
    this.setState({ error, info });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearCache = () => {
    try {
      localStorage.clear();
    } catch (error) {
      console.error(error);
    }
    try {
      sessionStorage.clear();
    } catch (error) {
      console.error(error);
    }
    window.location.reload();
  };

  getDebugText = () => {
    const { error, info } = this.state;
    return [
      `message: ${error?.message || ""}`,
      `stack: ${error?.stack || ""}`,
      `componentStack: ${info?.componentStack || ""}`,
      `href: ${window.location?.href || ""}`,
      `userAgent: ${navigator.userAgent || ""}`,
    ].join("\n\n");
  };

  handleCopyError = async () => {
    const text = this.getDebugText();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        this.setState({ copied: true });
        return;
      }
    } catch {
      void 0;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      this.setState({ copied: true });
    } catch {
      this.setState({ copied: false });
    } finally {
      document.body.removeChild(textarea);
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 20,
          background: "#f7f7f8",
          color: "#111111",
          textAlign: "left",
          boxSizing: "border-box",
        }}
      >
        <section
          style={{
            width: "min(560px, 100%)",
            borderRadius: 16,
            background: "#ffffff",
            border: "1px solid rgba(198,198,198,0.28)",
            boxShadow: "0 18px 55px rgba(26,28,28,0.12)",
            padding: 22,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 20, lineHeight: 1.35, fontWeight: 900, color: "#111111" }}>
            页面加载失败
          </h1>
          <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.7, color: "#374151" }}>
            页面加载失败，请刷新重试。如果仍然失败，请联系开发者。
          </p>
          {this.state.error?.message && (
            <pre
              style={{
                margin: "14px 0 0",
                padding: 10,
                borderRadius: 10,
                background: "#f3f4f6",
                color: "#4b5563",
                fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
                fontSize: 12,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                border: "1px solid #111111",
                borderRadius: 10,
                background: "#111111",
                color: "#ffffff",
                padding: "10px 14px",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              刷新页面
            </button>
            <button
              type="button"
              onClick={this.handleClearCache}
              style={{
                border: "1px solid rgba(198,198,198,0.55)",
                borderRadius: 10,
                background: "#ffffff",
                color: "#111111",
                padding: "10px 14px",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              清除本地缓存后重试
            </button>
            <button
              type="button"
              onClick={this.handleCopyError}
              style={{
                border: "1px solid rgba(198,198,198,0.55)",
                borderRadius: 10,
                background: "#ffffff",
                color: "#111111",
                padding: "10px 14px",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {this.state.copied ? "已复制错误信息" : "复制错误信息"}
            </button>
          </div>
        </section>
      </main>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
