import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

const messageStyle = {
    width: "100%",
    minWidth: 0,
    display: "block",
    color: "inherit",
    fontSize: "inherit",
    lineHeight: 1.68,
    textAlign: "left",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
};

const headingBase = {
    margin: "0.35em 0 0.28em",
    color: "inherit",
    letterSpacing: 0,
};

function markdownProps(props) {
    const { node, ...rest } = props;
    void node;
    return rest;
}

const components = {
    h1: (props) => (
        <h1 {...markdownProps(props)} style={{ ...headingBase, fontSize: "1.18em", lineHeight: 1.35, fontWeight: 900 }} />
    ),
    h2: (props) => (
        <h2 {...markdownProps(props)} style={{ ...headingBase, fontSize: "1.12em", lineHeight: 1.38, fontWeight: 880 }} />
    ),
    h3: (props) => (
        <h3 {...markdownProps(props)} style={{ ...headingBase, fontSize: "1.06em", lineHeight: 1.42, fontWeight: 850 }} />
    ),
    h4: (props) => (
        <h4 {...markdownProps(props)} style={{ ...headingBase, fontSize: "1em", lineHeight: 1.45, fontWeight: 820 }} />
    ),
    p: (props) => (
        <p {...markdownProps(props)} style={{ margin: "0.34em 0" }} />
    ),
    strong: (props) => (
        <strong {...markdownProps(props)} style={{ fontWeight: 850 }} />
    ),
    ul: (props) => (
        <ul
            {...markdownProps(props)}
            style={{
                margin: "0.34em 0",
                paddingLeft: "1.35em",
                listStylePosition: "outside",
            }}
        />
    ),
    ol: (props) => (
        <ol
            {...markdownProps(props)}
            style={{
                margin: "0.34em 0",
                paddingLeft: "1.45em",
                listStylePosition: "outside",
            }}
        />
    ),
    li: (props) => (
        <li {...markdownProps(props)} style={{ margin: "0.2em 0", paddingLeft: "0.15em" }} />
    ),
    blockquote: (props) => (
        <blockquote
            {...markdownProps(props)}
            style={{
                margin: "0.5em 0",
                padding: "0.35em 0 0.35em 0.8em",
                borderLeft: "3px solid rgba(17,17,17,0.22)",
                color: "#4b5563",
            }}
        />
    ),
    code: ({ node, inline, className, children, ...props }) => {
        void node;
        const text = String(children || "");
        const isBlock = inline === false || Boolean(className) || text.includes("\n");
        if (!isBlock) {
            return (
                <code
                    {...props}
                    className={className}
                    style={{
                        display: "inline",
                        padding: "0.1em 0.35em",
                        borderRadius: 5,
                        background: "rgba(17, 24, 39, 0.08)",
                        color: "inherit",
                        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
                        fontSize: "0.92em",
                    }}
                >
                    {children}
                </code>
            );
        }

        return (
            <code
                {...props}
                className={className}
                style={{
                    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
                    fontSize: "0.92em",
                    lineHeight: 1.6,
                    whiteSpace: "pre",
                }}
            >
                {children}
            </code>
        );
    },
    pre: (props) => (
        <pre
            {...markdownProps(props)}
            style={{
                margin: "0.55em 0",
                padding: "10px 12px",
                borderRadius: 10,
                background: "#1f2937",
                color: "#f9fafb",
                overflowX: "auto",
                whiteSpace: "pre",
                textAlign: "left",
            }}
        />
    ),
};

function safeMarkdownString(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function normalizeMathDelimiters(markdown) {
    let output = "";
    let i = 0;
    let inlineCode = false;
    let fence = false;
    let lineStart = true;

    while (i < markdown.length) {
        if (lineStart && markdown.startsWith("```", i)) {
            fence = !fence;
            output += "```";
            i += 3;
            lineStart = false;
            continue;
        }

        const ch = markdown[i];
        const next = markdown[i + 1];

        if (!fence && ch === "`") {
            inlineCode = !inlineCode;
            output += ch;
            i += 1;
            lineStart = false;
            continue;
        }

        if (!fence && !inlineCode && ch === "\\" && next === "(") {
            output += "$";
            i += 2;
            lineStart = false;
            continue;
        }

        if (!fence && !inlineCode && ch === "\\" && next === ")") {
            output += "$";
            i += 2;
            lineStart = false;
            continue;
        }

        if (!fence && !inlineCode && ch === "\\" && next === "[") {
            output += "$$";
            i += 2;
            lineStart = false;
            continue;
        }

        if (!fence && !inlineCode && ch === "\\" && next === "]") {
            output += "$$";
            i += 2;
            lineStart = false;
            continue;
        }

        output += ch;
        i += 1;
        lineStart = ch === "\n";
    }

    return output;
}

class MarkdownRenderBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error) {
        console.error(error);
    }

    componentDidUpdate(prevProps) {
        if (this.state.hasError && prevProps.fallback !== this.props.fallback) {
            this.setState({ hasError: false });
        }
    }

    render() {
        if (this.state.hasError) {
            return <div style={this.props.style}>{this.props.fallback}</div>;
        }
        return this.props.children;
    }
}

export function MarkdownMessage({ content, style = {} }) {
    const value = safeMarkdownString(content).trim();
    if (!value) return null;
    const renderValue = normalizeMathDelimiters(value);

    const mergedStyle = { ...messageStyle, ...style };

    return (
        <MarkdownRenderBoundary fallback={value} style={mergedStyle}>
            <div style={mergedStyle}>
                <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
                    components={components}
                >
                    {renderValue}
                </ReactMarkdown>
            </div>
        </MarkdownRenderBoundary>
    );
}

export function AIMessage({ content, style = {} }) {
    return <MarkdownMessage content={content} style={style} />;
}
