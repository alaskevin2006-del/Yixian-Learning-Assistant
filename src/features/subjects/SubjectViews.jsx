export function SubjectView({ subject, subjectTab, setSubjectTab, conversations, startConversation, openConversation, resources, removeResource, reviews, updateSubject, saveSubject, deleteConversation, openRenameDialog }) {
    return (
        <section className="view" id="view-subject">
            <div className="topbar"><div className="top-title">{subject.name}</div><div className="top-actions"><button className="icon-btn">↗</button><button className="icon-btn">⋯</button></div></div>
            <div className="content project-hero">
                <div className="project-title">{subject.name}</div>
                <div className="composer subject-quick">
                    <button className="plus-btn">+</button>
                    <input placeholder="在该学科中开始新对话" readOnly onFocus={startConversation} />
                    <button className="plain-btn">联网</button>
                    <button className="plain-btn">引用</button>
                    <button className="round-btn" onClick={startConversation}>▶</button>
                </div>
                <div className="tabs">
                    {[
                        ["chat", "聊天"],
                        ["source", "来源"],
                        ["reviews", "复盘历史"],
                        ["settings", "学科设置"],
                    ].map(([key, label]) => <button className={`tab ${subjectTab === key ? "active" : ""}`} key={key} onClick={() => setSubjectTab(key)}>{label}</button>)}
                </div>
                {subjectTab === "chat" && (
                    <div className="subject-panel list">
                        <button className="list-row" onClick={startConversation}><div><strong>新建对话</strong><div className="muted">点击进入空白聊天界面</div></div><span className="muted">现在</span></button>
                        {conversations.map((conversation) => (
                            <div className="list-row" key={conversation.id}>
                                <button className="list-row-main" onClick={() => openConversation(conversation)}><div><strong>{conversation.title}</strong><div className="muted">自动生成标题 · 待确认复盘</div></div></button>
                                <div className="file-actions">
                                    <button className="mini-btn" onClick={() => openRenameDialog({ type: "subject", id: conversation.id, title: conversation.title })}>改名</button>
                                    <button className="mini-btn danger-btn" onClick={() => deleteConversation(conversation.id)}>删除</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {subjectTab === "source" && (
                    <div className="subject-panel source-grid">
                        <div className="card"><h3>本学科私有来源</h3>{resources.filter((item) => item.scope === "private").map((item) => <div className="file-row" key={item.id}><span>{item.title}</span><div className="file-actions"><button className="mini-btn">打开</button><button className="mini-btn" onClick={() => removeResource(item.id)}>移除</button></div></div>)}</div>
                        <div className="card"><h3>引用的公共来源</h3>{resources.filter((item) => item.scope !== "private").map((item) => <div className="file-row" key={item.id}><span>{item.title}</span><div className="file-actions"><button className="mini-btn">打开</button><button className="mini-btn" onClick={() => removeResource(item.id)}>取消引用</button></div></div>)}</div>
                    </div>
                )}
                {subjectTab === "reviews" && (
                    <div className="subject-panel review-grid">
                        <div className="card"><h3>用户原始自述</h3>{reviews.map((item) => <p key={item.id}>{item.original}</p>)}</div>
                        <div className="card"><h3>收获</h3>{reviews.map((item) => <p key={item.id}>{item.harvest}</p>)}</div>
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
                    <div className="field-stack"><label>学科指令</label><div className="muted">设置此学科的背景信息和回复方式，相当于该学科内所有对话共用的提示词。</div><textarea value={draft.instruction} onChange={(event) => setDraft((prev) => ({ ...prev, instruction: event.target.value }))} placeholder="例如：这是我的线性代数学科..." /></div>
                    <div><button className="primary-btn" onClick={createSubject}>创建</button></div>
                </div></div>
            </div>
        </section>
    );
}

