export function LibraryView({ query, setQuery, search, publicResources, privateResources, uploadPrivate, openPublicUpload, openPrivateResource, openPublicResource, downloadPublicResource, referencePublicResource }) {
    return (
        <section className="view" id="view-library">
            <div className="topbar"><div className="top-title">资料库</div><div className="top-actions"><button className="plain-btn">管理分类</button></div></div>
            <div className="content wide-content library-page">
                <h1 className="page-title">资料库</h1>
                <div className="search-bar">
                    <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") search(); }} placeholder="搜索资料名称、学科、标签" />
                    <button className="plain-btn" onClick={search}>搜索</button>
                </div>
                <div className="library-grid">
                    <div className="card">
                        <h3>公共资料</h3>
                        <button className="plain-btn upload-button" onClick={openPublicUpload}>上传到公共资料</button>
                        {publicResources.map((item) => (
                            <div className="file-row" key={`${item.resourceId}-${item.chunkId}`}>
                                <span><strong>{item.title}</strong><small>{item.contentPreview}</small></span>
                                <div className="file-actions"><button className="mini-btn" onClick={() => openPublicResource(item)}>打开</button><button className="mini-btn" disabled={item.canReference === false} onClick={() => referencePublicResource(item)}>引用</button><button className="mini-btn" onClick={() => downloadPublicResource(item)}>下载</button></div>
                            </div>
                        ))}
                        {publicResources.length === 0 && <div className="empty-state">暂无公共资料，请上传资料后再检索</div>}
                    </div>
                    <div className="card">
                        <h3>私有资料</h3>
                        <label className="plain-btn upload-button">
                            上传到私有资料
                            <input type="file" hidden accept=".txt,.md,.pdf,.doc,.docx,.ppt,.pptx,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={uploadPrivate} />
                        </label>
                        {privateResources.map((item) => (
                            <div className="file-row" key={item.id || item.storagePath}>
                                <span>{item.name || item.title}</span>
                                <div className="file-actions">
                                    <button className="mini-btn" onClick={() => openPrivateResource(item)}>打开</button>
                                    <button className="mini-btn" onClick={() => openPrivateResource(item)}>下载</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

