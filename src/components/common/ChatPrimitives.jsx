import { AIMessage } from "../MarkdownMessage";

export function Composer({ value, setValue, onSend, placeholder, openSource, webEnabled, onToggleWeb, referenceCount = 0, disabled = false }) {
    return (
        <div className="composer">
            <button className="plus-btn">+</button>
            <input value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !disabled) onSend(); }} placeholder={placeholder} disabled={disabled} />
            <button className={`plain-btn ${webEnabled ? "active-soft" : ""}`} onClick={onToggleWeb} type="button" disabled={!onToggleWeb && webEnabled}>联网</button>
            {openSource && <button className={`plain-btn ${referenceCount ? "active-soft" : ""}`} onClick={openSource} type="button">引用{referenceCount ? ` ${referenceCount}` : ""}</button>}
            <button className="round-btn" onClick={onSend} disabled={disabled || !value.trim()}>▶</button>
        </div>
    );
}



export function MessageBubble({ message }) {
    return (
        <div className={`message ${message.role === "user" ? "user" : "ai"}`}>
            {message.role === "assistant" ? <AIMessage content={message.content || ""} /> : message.content}
            {Array.isArray(message.citations) && message.citations.length > 0 && (
                <div className="citation-list">
                    {message.citations.slice(0, 6).map((item, index) => (
                        <span key={`${item.url || item.resourceId || item.chunkId || index}`}>{item.title || item.url || `引用 ${index + 1}`}</span>
                    ))}
                </div>
            )}
        </div>
    );
}

