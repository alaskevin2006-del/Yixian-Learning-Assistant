import { useMemo, useState } from "react";

const SEARCH_INTENT_GROUPS = [
    ["复习", "备考", "考试", "测验"],
    ["论文", "资料", "阅读", "文献"],
    ["课程", "学科", "课堂", "作业"],
    ["计划", "日程", "任务", "待办"],
];

function flattenSearchValue(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(flattenSearchValue);
    if (typeof value === "object") return Object.values(value).flatMap(flattenSearchValue);
    return [String(value)];
}

function getSearchFields(item, mode) {
    const keywordFields = [
        item?.title,
        item?.name,
        item?.fileName,
        item?.metadata?.originalName,
        item?.tags,
        item?.type,
        item?.fileType,
        item?.file_type,
        item?.summary,
    ];

    if (mode === "keyword") return keywordFields;

    return [
        ...keywordFields,
        item?.description,
        item?.contentPreview,
        item?.content,
        item?.excerpt,
        item?.snippet,
        item?.path,
        item?.chapter,
        item?.section,
        item?.metadata?.description,
        item?.metadata?.summary,
        item?.metadata?.tags,
        item?.metadata?.contentPreview,
    ];
}

function getSmartTerms(query) {
    const trimmed = String(query || "").trim().toLowerCase();
    if (!trimmed) return [];
    const terms = new Set([trimmed, ...trimmed.split(/\s+/).filter(Boolean)]);

    SEARCH_INTENT_GROUPS.forEach((group) => {
        if (group.some((term) => trimmed.includes(term))) {
            group.forEach((term) => terms.add(term));
        }
    });

    return Array.from(terms).filter(Boolean);
}

function matchesResource(item, query, mode) {
    const trimmed = String(query || "").trim().toLowerCase();
    if (!trimmed) return true;

    const haystack = flattenSearchValue(getSearchFields(item, mode)).join(" ").toLowerCase();
    if (mode === "keyword") return haystack.includes(trimmed);

    return getSmartTerms(trimmed).some((term) => haystack.includes(term));
}

function displayResources(resources = []) {
    const realResources = (resources || []).filter((item) => item?.source !== "demo" && !item?.isDemo);
    return realResources.length > 0 ? realResources : resources;
}

function emptyMessage(label, hasAnyResources, isSearching) {
    if (isSearching) return `没有找到匹配的${label}资料`;
    return hasAnyResources ? `暂无${label}资料` : `暂无${label}资料，请上传资料后再检索`;
}

export function LibraryView({ query, setQuery, publicResources, privateResources, uploadPrivate, openPublicUpload, openPrivateResource, openPublicResource, downloadPublicResource, referencePublicResource }) {
    const [searchMode, setSearchMode] = useState("keyword");
    const searchActive = String(query || "").trim().length > 0;
    const displayPublicResources = useMemo(
        () => displayResources(publicResources),
        [publicResources],
    );
    const displayPrivateResources = useMemo(
        () => displayResources(privateResources),
        [privateResources],
    );
    const filteredPublicResources = useMemo(
        () => (displayPublicResources || []).filter((item) => matchesResource(item, query, searchMode)),
        [displayPublicResources, query, searchMode],
    );
    const filteredPrivateResources = useMemo(
        () => (displayPrivateResources || []).filter((item) => matchesResource(item, query, searchMode)),
        [displayPrivateResources, query, searchMode],
    );

    return (
        <section className="view" id="view-library">
            <div className="topbar"><div className="top-title">资料库</div><div className="top-actions"><button className="plain-btn">管理分类</button></div></div>
            <div className="content wide-content library-page">
                <h1 className="page-title">资料库</h1>
                <div className="search-bar library-search-bar">
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资料名称、类型、标签" />
                    <div className="search-mode-toggle" role="group" aria-label="搜索模式">
                        <button type="button" className={searchMode === "keyword" ? "active" : ""} aria-pressed={searchMode === "keyword"} onClick={() => setSearchMode("keyword")}>关键词搜索</button>
                        <button type="button" className={searchMode === "smart" ? "active" : ""} aria-pressed={searchMode === "smart"} onClick={() => setSearchMode("smart")}>智能搜索</button>
                    </div>
                </div>
                {searchMode === "smart" && <div className="library-search-hint">智能搜索：根据标题、标签和描述综合匹配。</div>}
                <div className="library-grid">
                    <div className="card">
                        <h3>公共资料</h3>
                        <button className="plain-btn upload-button" onClick={openPublicUpload}>上传到公共资料</button>
                        {filteredPublicResources.map((item) => (
                            <div className="file-row" key={`${item.resourceId}-${item.chunkId}`}>
                                <span><strong>{item.title}</strong><small>{item.contentPreview}</small></span>
                                <div className="file-actions"><button className="mini-btn" onClick={() => openPublicResource(item)}>打开</button><button className="mini-btn" disabled={item.canReference === false} onClick={() => referencePublicResource(item)}>引用</button><button className="mini-btn" onClick={() => downloadPublicResource(item)}>下载</button></div>
                            </div>
                        ))}
                        {filteredPublicResources.length === 0 && <div className="empty-state">{emptyMessage("公共", (displayPublicResources || []).length > 0, searchActive)}</div>}
                    </div>
                    <div className="card">
                        <h3>私有资料</h3>
                        <label className="plain-btn upload-button">
                            上传到私有资料
                            <input type="file" hidden accept=".txt,.md,.pdf,.doc,.docx,.ppt,.pptx,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={uploadPrivate} />
                        </label>
                        {filteredPrivateResources.map((item) => (
                            <div className="file-row" key={item.id || item.storagePath}>
                                <span>{item.name || item.title}</span>
                                <div className="file-actions">
                                    <button className="mini-btn" onClick={() => openPrivateResource(item)}>打开</button>
                                    <button className="mini-btn" onClick={() => openPrivateResource(item)}>下载</button>
                                </div>
                            </div>
                        ))}
                        {filteredPrivateResources.length === 0 && <div className="empty-state">{emptyMessage("私有", (displayPrivateResources || []).length > 0, searchActive)}</div>}
                    </div>
                </div>
            </div>
        </section>
    );
}

