import { useState } from "react";
import { Composer, MessageBubble } from "../../components/common/ChatPrimitives";

export function ChatView({
    title,
    chatTab,
    setChatTab,
    messages,
    input,
    setInput,
    send,
    openSource,
    timer,
    openTimer,
    finish,
    reviews,
    confirmReviews,
    reviewDraft,
    setReviewDraft,
    summarizeReviewDraft,
    saveReviewDraft,
    aiStatus,
    aiError,
    webEnabled,
    setWebEnabled,
    selectedReferences,
    uploadAttachment,
    attachmentCount,
    onRename,
    onDelete,
}) {
    const hasPendingReviews = reviews.some((item) => item.status !== "confirmed");
    const [menuOpen, setMenuOpen] = useState(false);
    return (
        <section className="view" id="view-chat">
            <div className="topbar">
                <div className="top-title">{title}</div>
                <div className="top-actions">
                    <div className="inline-menu">
                        <button className="icon-btn" onClick={() => setMenuOpen((value) => !value)} aria-label="聊天操作">⋯</button>
                        {menuOpen && (
                            <div className="inline-menu-popover align-right">
                                <button onClick={() => { onRename?.(); setMenuOpen(false); }}>改名</button>
                                <button className="danger" onClick={() => { onDelete?.(); setMenuOpen(false); }}>删除</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="chat-shell">
                <div className="chat-head">
                    <div className="tabs"><button className={`tab ${chatTab === "chat" ? "active" : ""}`} onClick={() => setChatTab("chat")}>聊天</button><button className={`tab ${chatTab === "review" ? "active" : ""}`} onClick={() => setChatTab("review")}>复盘</button></div>
                    <div className="learning-bar"><div><div className="learning-bar-title">{timer.taskTitle || "当前任务"}</div><div className="learning-bar-meta">{timer.running ? `专注中 · ${timer.elapsed}` : "未开始计时"}</div></div><div className="timer-actions"><span className="timer-value">{timer.elapsed}</span><button className="mini-btn" onClick={openTimer}>展开</button><button className="mini-btn" onClick={finish}>结束</button></div></div>
                </div>
                {chatTab === "chat" ? (
                    <div className="chat-panel conversation">
                        {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
                        {aiStatus === "loading" && <div className="muted">AI 正在回答...</div>}
                        {aiError && <div className="error-text">{aiError}</div>}
                    </div>
                ) : (
                    <div className="review-layout">
                        <div className="card review-editor">
                            <h3>用户原始自述</h3>
                            <p className="muted">记录这次学习的真实表达，再由 AI 总结成可复习版本。</p>
                            <textarea
                                className="review-textarea"
                                value={reviewDraft.original}
                                onChange={(event) => setReviewDraft((prev) => ({ ...prev, original: event.target.value, error: "" }))}
                                placeholder="例如：今天做题时发现自己总把充分条件和必要条件混在一起，尤其看到“当且仅当”就不知道怎么拆。"
                            />
                            <label className="review-check">
                                <input
                                    type="checkbox"
                                    checked={reviewDraft.keepOriginal}
                                    onChange={(event) => setReviewDraft((prev) => ({ ...prev, keepOriginal: event.target.checked }))}
                                />
                                <span>保存原始自述</span>
                            </label>
                            {reviewDraft.error && <div className="error-text">{reviewDraft.error}</div>}
                            <div className="button-row">
                                <button className="primary-btn" disabled={reviewDraft.loading} onClick={summarizeReviewDraft}>{reviewDraft.loading ? "总结中..." : "一键 AI 总结"}</button>
                                <button className="plain-btn" disabled={!reviewDraft.rawSummary && !reviewDraft.polishedText} onClick={saveReviewDraft}>保存复盘</button>
                            </div>
                            <div className="review-history-mini">
                                <h3>最近复盘</h3>
                                {reviews.slice(0, 3).map((item) => <div className="review-item compact" key={item.id}>{item.original || item.harvest}</div>)}
                                {reviews.length === 0 && <div className="muted">暂无复盘历史。</div>}
                            </div>
                        </div>
                        <div className="card review-editor">
                            <h3>AI 总结草稿</h3>
                            <div className="review-version">
                                <label>原始总结版本</label>
                                <textarea
                                    className="review-textarea small"
                                    value={reviewDraft.rawSummary}
                                    onChange={(event) => setReviewDraft((prev) => ({ ...prev, rawSummary: event.target.value }))}
                                    placeholder="AI 会先生成偏原始、保留细节的总结。"
                                />
                            </div>
                            <div className="review-version">
                                <label>润色版本</label>
                                <textarea
                                    className="review-textarea small"
                                    value={reviewDraft.polishedText}
                                    onChange={(event) => setReviewDraft((prev) => ({ ...prev, polishedText: event.target.value }))}
                                    placeholder="AI 会生成更适合进入复盘历史的版本。"
                                />
                            </div>
                            <div className="pending-readonly">
                                <h3>待确认收获</h3>
                                <p className="muted">登录并使用真实学科时，收获会写入 Supabase subject_review_items，确认后标记为已入库。</p>
                                {reviews.filter((item) => item.status !== "confirmed").slice(0, 3).map((item) => <div className="review-item compact" key={item.id}>{item.harvest}</div>)}
                                <button className="plain-btn" disabled={!hasPendingReviews} onClick={confirmReviews}>确认入库</button>
                            </div>
                        </div>
                    </div>
                )}
                <Composer value={input} setValue={setInput} onSend={send} placeholder="有问题，尽管问" openSource={openSource} webEnabled={webEnabled} onToggleWeb={() => setWebEnabled((value) => !value)} referenceCount={selectedReferences.length} uploadAttachment={uploadAttachment} attachmentCount={attachmentCount} disabled={aiStatus === "loading"} />
            </div>
        </section>
    );
}

export function FreeChatView({ title, messages, input, setInput, send, openSource, aiStatus, aiError, webEnabled, setWebEnabled, selectedReferences, uploadAttachment, attachmentCount, onRename, onDelete }) {
    const [menuOpen, setMenuOpen] = useState(false);
    return (
        <section className="view" id="view-free-chat">
            <div className="topbar">
                <div className="top-title">{title}</div>
                <div className="top-actions">
                    <div className="inline-menu">
                        <button className="icon-btn" onClick={() => setMenuOpen((value) => !value)} aria-label="聊天操作">⋯</button>
                        {menuOpen && (
                            <div className="inline-menu-popover align-right">
                                <button onClick={() => { onRename?.(); setMenuOpen(false); }}>改名</button>
                                <button className="danger" onClick={() => { onDelete?.(); setMenuOpen(false); }}>删除</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="chat-shell free-chat-shell">
                <div className="free-chat-body">
                    {messages.length === 0 && <div className="message ai">这里是新对话入口。你可以直接开始提问、整理资料或临时讨论；发送第一条消息后，它会出现在左侧最近对话中。</div>}
                    {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
                    {aiStatus === "loading" && <div className="muted">AI 正在回答...</div>}
                    {aiError && <div className="error-text">{aiError}</div>}
                </div>
                <Composer value={input} setValue={setInput} onSend={send} placeholder="开始一个新对话" openSource={openSource} webEnabled={webEnabled} onToggleWeb={() => setWebEnabled((value) => !value)} referenceCount={selectedReferences.length} uploadAttachment={uploadAttachment} attachmentCount={attachmentCount} disabled={aiStatus === "loading"} />
            </div>
        </section>
    );
}
