export function SettingsView({ currentUser, openAuth }) {
    return (
        <section className="view" id="view-settings">
            <div className="topbar"><div className="top-title">设置</div></div>
            <div className="content">
                <h1 className="page-title">设置</h1>
                <div className="source-grid">
                    <div className="card"><h3>登录</h3><p className="muted">{currentUser ? currentUser.email : "账号状态、退出登录、同步状态。"}</p><button className="primary-btn" onClick={openAuth}>{currentUser ? "账号" : "登录 / 注册"}</button></div>
                    <div className="card"><h3>AI 设置</h3><p className="muted">模型、联网搜索、API Key 状态。</p></div>
                </div>
            </div>
        </section>
    );
}

