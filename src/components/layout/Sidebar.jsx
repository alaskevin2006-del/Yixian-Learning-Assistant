import { useState } from "react";

function formatDate() {
    return new Date().toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
    });
}

export function Sidebar({
    view,
    setView,
    subjects,
    activeSubjectId,
    openSubject,
    freeConversations,
    activeFreeId,
    setActiveFreeId,
    newFreeConversation,
    openActionDialog,
    timer,
    openModal,
    startQuickTimer,
}) {
    const [subjectsOpen, setSubjectsOpen] = useState(true);
    const [freeOpen, setFreeOpen] = useState(true);

    return (
        <aside className="sidebar">
            <div className="brand">
                <div className="brand-title">逸仙学习助手</div>
                <div className="brand-date">{formatDate()}</div>
            </div>
            <div className="nav-scroll">
                <div className="nav-group">
                    <button className={`nav-item ${view === "plan" ? "active" : ""}`} onClick={() => setView("plan")}><span className="nav-label">学习计划</span></button>
                    <button className={`nav-item ${view === "library" ? "active" : ""}`} onClick={() => setView("library")}><span className="nav-label">资料库</span></button>
                </div>
                <div className="nav-gap" />
                <div className="nav-group">
                    <button className="nav-heading" onClick={() => setSubjectsOpen((value) => !value)}><span><span>{subjectsOpen ? "▾" : "▸"}</span><span className="text">学科</span></span></button>
                    <div className={`subject-list ${subjectsOpen ? "" : "collapsed"}`}>
                        <button className={`nav-item ${view === "new-subject" ? "active" : ""}`} onClick={() => setView("new-subject")}><span className="nav-label">+ 新学科</span></button>
                        {subjects.map((subject) => (
                            <div className={`nav-row ${view === "subject" && activeSubjectId === subject.id ? "is-active" : ""}`} key={subject.id}>
                                <button className={`nav-item ${view === "subject" && activeSubjectId === subject.id ? "active" : ""}`} onClick={() => openSubject(subject.id)}><span className="nav-label">{subject.name}</span></button>
                                <button className="row-menu" title="更多操作" onClick={() => openActionDialog({ type: "subject", subject })}>⋯</button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="nav-gap" />
                <div className="nav-group">
                    <button className={`nav-item ${view === "free-chat" && !activeFreeId ? "active" : ""}`} onClick={newFreeConversation}><span className="nav-label">新对话</span></button>
                    <button className="nav-heading recent-heading" onClick={() => setFreeOpen((value) => !value)}><span><span>{freeOpen ? "▾" : "▸"}</span><span className="text">最近对话</span></span></button>
                    <div className={`chat-list ${freeOpen ? "" : "collapsed"}`}>
                        {freeConversations.map((conversation) => (
                            <div className={`nav-row ${view === "free-chat" && activeFreeId === conversation.id ? "is-active" : ""}`} key={conversation.id}>
                                <button
                                    className={`subitem ${view === "free-chat" && activeFreeId === conversation.id ? "active" : ""}`}
                                    onClick={() => {
                                        setActiveFreeId(conversation.id);
                                        setView("free-chat");
                                    }}
                                >
                                    <span className="nav-label">{conversation.title}</span>
                                </button>
                                <button className="row-menu" title="更多操作" onClick={() => openActionDialog({ type: "free", conversation })}>⋯</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="sidebar-footer">
                <div className="learning-mini">
                    <strong>{timer.taskTitle || "当前学习会话"}</strong>
                    <span>{timer.running ? `${timer.subject} · ${timer.elapsed}` : "暂无进行中的计时"}</span>
                    <div className="mini-actions">
                        <button className="mini-btn" onClick={() => { startQuickTimer(); openModal("timer"); }}>计时</button>
                        <button className="mini-btn" onClick={() => setView("subject")}>去学习</button>
                    </div>
                </div>
                <button className={`nav-item ${view === "settings" ? "active" : ""}`} onClick={() => setView("settings")}><span className="nav-label">设置</span></button>
            </div>
        </aside>
    );
}

