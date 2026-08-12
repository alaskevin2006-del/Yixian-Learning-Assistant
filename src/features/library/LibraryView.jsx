import { useMemo, useState } from "react";

const SEARCH_INTENT_GROUPS = [
    ["复习", "备考", "考试", "测验"],
    ["论文", "资料", "阅读", "文献"],
    ["课程", "学科", "课堂", "作业"],
    ["计划", "日程", "任务", "待办"],
];
const MOCK_TEXT_MARKERS = ["示例", "范例", "机器学习"];

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

function isMockResource(item) {
    if (!item) return false;
    const id = String(item?.resourceId || item?.id || "");
    const values = [
        item?.title,
        item?.name,
        item?.fileName,
        item?.metadata?.originalName,
        item?.contentPreview,
        item?.description,
    ].map((value) => String(value || "").toLowerCase());
    return item?.source === "demo"
        || item?.isDemo
        || id.includes("demo")
        || values.some((value) => MOCK_TEXT_MARKERS.some((marker) => value.includes(marker.toLowerCase())));
}

function displayResources(resources = []) {
    return (resources || []).filter((item) => !isMockResource(item));
}

function emptyMessage(label, hasAnyResources, isSearching) {
    if (isSearching) return `没有找到匹配的${label}资料`;
    return hasAnyResources ? `暂无${label}资料` : `暂无${label}资料，请上传资料后再检索`;
}

function resourceKey(item) {
    return String(item?.resourceId || item?.id || item?.storagePath || "");
}

function subjectLinksForResource(resource, subjectResources, subjects) {
    const key = resourceKey(resource);
    if (!key) return [];
    return subjects.flatMap((subject) => (
        (subjectResources?.[subject.id] || [])
            .filter((item) => item?.scope === "private" && String(item.resourceId || item.id || "") === key)
            .map((item) => ({ subject, reference: item }))
    ));
}

export function LibraryView({
    query,
    setQuery,
    publicResources,
    privateResources,
    subjects,
    subjectResources,
    activeSubjectId,
    uploadPrivate,
    openPublicUpload,
    openPrivateResource,
    openPublicResource,
    downloadPublicResource,
    referencePublicResource,
    referencePrivateResource,
    removeSubjectResource,
    deletePrivateResource,
}) {
    const [searchMode, setSearchMode] = useState("keyword");
    const [privateCategory, setPrivateCategory] = useState("all");
    const [openMenu, setOpenMenu] = useState("");
    const searchActive = String(query || "").trim().length > 0;
    const activeSubject = subjects.find((subject) => subject.id === activeSubjectId);
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
        () => (displayPrivateResources || [])
            .filter((item) => matchesResource(item, query, searchMode))
            .filter((item) => {
                const links = subjectLinksForResource(item, subjectResources, subjects);
                if (privateCategory === "all") return true;
                if (privateCategory === "unfiled") return links.length === 0;
                if (privateCategory.startsWith("subject:")) return links.some((link) => link.subject.id === privateCategory.slice("subject:".length));
                return true;
            }),
        [displayPrivateResources, privateCategory, query, searchMode, subjectResources, subjects],
    );
    const categorizedPrivateCount = useMemo(() => {
        const counts = { all: displayPrivateResources.length, unfiled: 0 };
        subjects.forEach((subject) => {
            counts[`subject:${subject.id}`] = 0;
        });
        displayPrivateResources.forEach((item) => {
            const links = subjectLinksForResource(item, subjectResources, subjects);
            if (links.length === 0) counts.unfiled += 1;
            links.forEach((link) => {
                counts[`subject:${link.subject.id}`] = (counts[`subject:${link.subject.id}`] || 0) + 1;
            });
        });
        return counts;
    }, [displayPrivateResources, subjectResources, subjects]);

    return (
        <section className="view" id="view-library">
            <div className="topbar"><div className="top-title">资料库</div><div className="top-actions" /></div>
            <div className="content wide-content library-page">
                <h1 className="page-title">资料库</h1>
                <div className="search-bar library-search-bar">
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资料名称、类型、标签" />
                    <button type="button" className={`plain-btn ${searchMode === "smart" ? "active-soft" : ""}`} aria-pressed={searchMode === "smart"} onClick={() => setSearchMode((mode) => mode === "smart" ? "keyword" : "smart")}>智能搜索</button>
                </div>
                {searchMode === "smart" && <div className="library-search-hint">智能搜索：根据标题、标签和描述综合匹配。</div>}
                <div className="library-grid">
                    <div className="card">
                        <h3>公共资料</h3>
                        <button className="plain-btn upload-button" onClick={openPublicUpload}>上传到公共资料</button>
                        <div className="library-list-scroll">
                            {filteredPublicResources.map((item) => (
                                <div className="file-row" key={`${item.resourceId}-${item.chunkId}`}>
                                    <span className="file-name"><strong>{item.title}</strong><small>{item.contentPreview}</small></span>
                                    <div className="inline-menu">
                                        <button className="row-menu" onClick={() => setOpenMenu((value) => value === `public:${item.resourceId}:${item.chunkId}` ? "" : `public:${item.resourceId}:${item.chunkId}`)} aria-label="公共资料操作">⋯</button>
                                        {openMenu === `public:${item.resourceId}:${item.chunkId}` && (
                                            <div className="inline-menu-popover align-right">
                                                <button onClick={() => { openPublicResource(item); setOpenMenu(""); }}>打开</button>
                                                <button disabled={item.canReference === false} onClick={() => { referencePublicResource(item); setOpenMenu(""); }}>引用</button>
                                                <button onClick={() => { downloadPublicResource(item); setOpenMenu(""); }}>下载</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {filteredPublicResources.length === 0 && <div className="empty-state">{emptyMessage("公共", (displayPublicResources || []).length > 0, searchActive)}</div>}
                        </div>
                    </div>
                    <div className="card">
                        <div className="library-card-head">
                            <h3>私有资料</h3>
                            <span className="muted">{filteredPrivateResources.length} / {displayPrivateResources.length}</span>
                        </div>
                        <label className="plain-btn upload-button">
                            上传到私有资料
                            <input type="file" hidden accept=".txt,.md,.pdf,.doc,.docx,.ppt,.pptx,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={uploadPrivate} />
                        </label>
                        <div className="resource-category-bar" aria-label="私有资料分类">
                            <button className={privateCategory === "all" ? "active" : ""} onClick={() => setPrivateCategory("all")}>全部 <span>{categorizedPrivateCount.all}</span></button>
                            <button className={privateCategory === "unfiled" ? "active" : ""} onClick={() => setPrivateCategory("unfiled")}>未归档 <span>{categorizedPrivateCount.unfiled}</span></button>
                            {subjects.map((subject) => (
                                <button className={privateCategory === `subject:${subject.id}` ? "active" : ""} key={subject.id} onClick={() => setPrivateCategory(`subject:${subject.id}`)}>
                                    {subject.name} <span>{categorizedPrivateCount[`subject:${subject.id}`] || 0}</span>
                                </button>
                            ))}
                        </div>
                        <div className="library-list-scroll">
                            {filteredPrivateResources.map((item) => {
                                const links = subjectLinksForResource(item, subjectResources, subjects);
                                const activeLink = links.find((link) => link.subject.id === activeSubjectId);
                                const menuKey = `private:${resourceKey(item)}`;
                                return (
                                <div className="file-row" key={item.id || item.storagePath}>
                                    <span className="file-name">
                                        <strong>{item.name || item.title}</strong>
                                        <small>{links.length > 0 ? `已引用：${links.map((link) => link.subject.name).join("、")}` : "未归档 / 未关联学科"}</small>
                                    </span>
                                    <div className="inline-menu">
                                        <button className="row-menu" onClick={() => setOpenMenu((value) => value === menuKey ? "" : menuKey)} aria-label="私有资料操作">⋯</button>
                                        {openMenu === menuKey && (
                                            <div className="inline-menu-popover align-right">
                                                <button onClick={() => { openPrivateResource(item, "preview"); setOpenMenu(""); }}>打开</button>
                                                <button onClick={() => { openPrivateResource(item, "download"); setOpenMenu(""); }}>下载</button>
                                                {activeSubject && !activeLink && <button onClick={() => { referencePrivateResource(item); setOpenMenu(""); }}>引用到当前学科</button>}
                                                {activeLink && <button onClick={() => { removeSubjectResource(activeLink.reference.id, activeSubjectId); setOpenMenu(""); }}>从当前学科移除</button>}
                                                <button className="danger" onClick={() => { deletePrivateResource(item); setOpenMenu(""); }}>删除</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );})}
                            {filteredPrivateResources.length === 0 && <div className="empty-state">{emptyMessage("私有", (displayPrivateResources || []).length > 0, searchActive)}</div>}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

