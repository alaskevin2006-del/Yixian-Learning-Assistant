import { useEffect, useState } from "react";

export function SubjectView({
    subject,
    subjectTab,
    setSubjectTab,
    conversations,
    startConversation,
    openConversation,
    resources,
    removeResource,
    reviews,
    updateSubject,
    saveSubject,
    deleteConversation,
    deleteSubject,
    openRenameDialog,
    uploadAttachment,
    webEnabled,
    setWebEnabled,
    openSource,
    openResource,
}) {
    const [openMenu, setOpenMenu] = useState("");
    const [subjectDrawerOpen, setSubjectDrawerOpen] = useState(false);
    const privateSources = resources.filter((item) => item.scope === "private");
    const publicSources = resources.filter((item) => item.scope !== "private");

    useEffect(() => {
        setSubjectDrawerOpen(false);
    }, [subject?.id]);

    return (
        <section className="view" id="view-subject">
            <div className="topbar">
                <div className="top-title">{subject.name}</div>
                <div className="top-actions">
                    <button className="icon-btn" onClick={startConversation} aria-label="开始新对话">&gt;</button>
                    <button className="icon-btn" onClick={() => setSubjectDrawerOpen(true)} aria-label="更多操作">...</button>
                </div>
            </div>
            <div className="content project-hero">
                <div className="project-title">{subject.name}</div>
                <div className="composer subject-quick">
                    <label className="plus-btn">
                        +
                        <input type="file" hidden accept=".txt,.md,.pdf,.docx,.ppt,.pptx" onChange={uploadAttachment} />
                    </label>
                    <input placeholder="在该学科中开始新对话" readOnly onFocus={startConversation} />
                    <button className={`plain-btn ${webEnabled ? "active-soft" : ""}`} onClick={() => setWebEnabled((value) => !value)}>联网</button>
                    <button className="plain-btn" onClick={openSource}>引用</button>
                    <button className="round-btn" onClick={startConversation} aria-label="发送">&gt;</button>
                </div>
                <div className="tabs">
                    {[
                        ["chat", "聊天"],
                        ["source", "来源"],
                        ["reviews", "复盘历史"],
                        ["settings", "学科设置"],
                    ].map(([key, label]) => (
                        <button className={`tab ${subjectTab === key ? "active" : ""}`} key={key} onClick={() => setSubjectTab(key)}>
                            {label}
                        </button>
                    ))}
                </div>
                {subjectTab === "chat" && (
                    <div className="subject-panel list">
                        <button className="list-row" onClick={startConversation}>
                            <div>
                                <strong>新建对话</strong>
                                <div className="muted">点击进入空白聊天界面</div>
                            </div>
                            <span className="muted">现在</span>
                        </button>
                        {conversations.map((conversation) => (
                            <div className="list-row" key={conversation.id}>
                                <button className="list-row-main" onClick={() => openConversation(conversation)}>
                                    <div>
                                        <strong>{conversation.title}</strong>
                                        <div className="muted">自动生成标题 · 待确认复盘</div>
                                    </div>
                                </button>
                                <div className="inline-menu">
                                    <button className="row-menu" onClick={() => setOpenMenu((value) => value === `chat:${conversation.id}` ? "" : `chat:${conversation.id}`)} aria-label="对话操作">...</button>
                                    {openMenu === `chat:${conversation.id}` && (
                                        <div className="inline-menu-popover align-right">
                                            <button onClick={() => { openRenameDialog({ type: "subject", id: conversation.id, title: conversation.title }); setOpenMenu(""); }}>改名</button>
                                            <button className="danger" onClick={() => { deleteConversation(conversation.id); setOpenMenu(""); }}>删除</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {subjectTab === "source" && (
                    <div className="subject-panel source-grid">
                        <div className="card">
                            <div className="library-card-head"><h3>本学科私有来源</h3><span className="muted">{privateSources.length}</span></div>
                            {privateSources.map((item) => (
                                <div className="file-row" key={item.id}>
                                    <span className="file-name"><strong>{item.title}</strong><small>{item.contentPreview || "来自资料库私有资料"}</small></span>
                                    <div className="inline-menu">
                                        <button className="row-menu" onClick={() => setOpenMenu((value) => value === `source-private:${item.id}` ? "" : `source-private:${item.id}`)} aria-label="私有来源操作">...</button>
                                        {openMenu === `source-private:${item.id}` && (
                                            <div className="inline-menu-popover align-right">
                                                <button onClick={() => { openResource(item, "preview"); setOpenMenu(""); }}>打开</button>
                                                <button onClick={() => { openResource(item, "download"); setOpenMenu(""); }}>下载</button>
                                                <button className="danger" onClick={() => { removeResource(item.id, subject.id); setOpenMenu(""); }}>移除引用</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {privateSources.length === 0 && <div className="empty-state">暂无本学科私有来源</div>}
                        </div>
                        <div className="card">
                            <div className="library-card-head"><h3>引用的公共来源</h3><span className="muted">{publicSources.length}</span></div>
                            {publicSources.map((item) => (
                                <div className="file-row" key={item.id}>
                                    <span className="file-name"><strong>{item.title}</strong><small>{item.contentPreview || "公共资料引用"}</small></span>
                                    <div className="inline-menu">
                                        <button className="row-menu" onClick={() => setOpenMenu((value) => value === `source-public:${item.id}` ? "" : `source-public:${item.id}`)} aria-label="公共来源操作">...</button>
                                        {openMenu === `source-public:${item.id}` && (
                                            <div className="inline-menu-popover align-right">
                                                <button onClick={() => { openResource(item); setOpenMenu(""); }}>打开</button>
                                                <button className="danger" onClick={() => { removeResource(item.id, subject.id); setOpenMenu(""); }}>取消引用</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {publicSources.length === 0 && <div className="empty-state">暂无引用的公共来源</div>}
                        </div>
                    </div>
                )}
                {subjectTab === "reviews" && (
                    <div className="subject-panel review-grid">
                        <div className="card">
                            <div className="library-card-head"><h3>用户原始自述</h3><span className="muted">{reviews.length}</span></div>
                            {reviews.slice(0, 8).map((item) => (
                                <div className="review-item compact" key={item.id}>
                                    <strong>{item.keepOriginal === false ? "未保留原文" : (item.original || "暂无原始自述")}</strong>
                                    {item.rawSummary && <small>原始总结：{item.rawSummary}</small>}
                                </div>
                            ))}
                            {reviews.length === 0 && <div className="empty-state">暂无复盘历史</div>}
                        </div>
                        <div className="card">
                            <div className="library-card-head"><h3>润色版本</h3><span className="muted">有限展示</span></div>
                            {reviews.slice(0, 8).map((item) => (
                                <div className="review-item compact" key={item.id}>
                                    <strong>{item.polishedText || item.harvest || "暂无润色内容"}</strong>
                                    <small>{item.status === "confirmed" ? "已保存" : "未确认"}</small>
                                </div>
                            ))}
                            {reviews.length === 0 && <div className="empty-state">暂无润色版本</div>}
                        </div>
                    </div>
                )}
                {subjectTab === "settings" && (
                    <div className="subject-panel settings-panel">
                        <div className="card"><div className="modal-stack">
                            <div className="field-stack"><label>学科名称</label><input className="new-subject-input" value={subject.name} onChange={(event) => updateSubject({ name: event.target.value })} /></div>
                            <div className="field-stack"><label>学科指令</label><div className="muted">设置此学科的背景信息和回复方式，相当于该学科内所有对话共用的提示词。</div><textarea value={subject.instruction || ""} onChange={(event) => updateSubject({ instruction: event.target.value })} /></div>
                            <div><button className="primary-btn" onClick={saveSubject}>保存学科设置</button></div>
                        </div></div>
                    </div>
                )}
            </div>
            {subjectDrawerOpen && (
                <div className="subject-drawer-backdrop" onClick={() => setSubjectDrawerOpen(false)}>
                    <aside className="subject-drawer" onClick={(event) => event.stopPropagation()}>
                        <div className="subject-drawer-head">
                            <div>
                                <strong>更多操作</strong>
                                <div className="muted">当前学科：{subject.name}</div>
                            </div>
                            <button className="icon-btn" onClick={() => setSubjectDrawerOpen(false)} aria-label="关闭">x</button>
                        </div>
                        <div className="subject-drawer-body">
                            <button className="subject-drawer-item" onClick={() => { setSubjectTab("settings"); setSubjectDrawerOpen(false); }}>
                                学科设置
                            </button>
                            <button className="subject-drawer-item danger" onClick={() => { deleteSubject(subject.id); setSubjectDrawerOpen(false); }}>
                                删除学科
                            </button>
                        </div>
                    </aside>
                </div>
            )}
        </section>
    );
}

export function NewSubjectView({ draft, setDraft, createSubject }) {
    return (
        <section className="view" id="view-new-subject">
            <div className="topbar"><div className="top-title">新学科</div></div>
            <div className="content">
                <h1 className="page-title">创建新学科</h1>
                <div className="card"><div className="modal-stack">
                    <div className="field-stack"><label>学科名称</label><input className="new-subject-input" value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="例如：线性代数" /></div>
                    <div className="field-stack"><label>学科指令</label><div className="muted">设置此学科的背景信息和回复方式，相当于该学科内所有对话共用的提示词。</div><textarea value={draft.instruction} onChange={(event) => setDraft((prev) => ({ ...prev, instruction: event.target.value }))} placeholder="例如：这是我的线性代数学科。回答时优先结合本学科资料、课本章节、错题和复盘历史；解释概念时给出步骤、例题和常见误区。" /></div>
                    <div><button className="primary-btn" onClick={createSubject}>创建</button></div>
                </div></div>
            </div>
        </section>
    );
}
