import { useState } from "react";

export function ActionDialog({ dialog, subjects, close, openRenameDialog, onDeleteSubject, onDeleteConversation, onMoveConversation }) {
    if (!dialog) return null;
    const isSubject = dialog.type === "subject";
    const title = isSubject ? "学科操作" : "最近对话操作";

    return (
        <div className="modal-backdrop" onClick={close}>
            <div className="modal action-modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-head">
                    <span>{title}</span>
                    <button className="icon-btn" onClick={close}>×</button>
                </div>
                <div className="modal-body modal-stack">
                    {isSubject ? (
                        <>
                            <p className="muted">当前学科：{dialog.subject.name}</p>
                            <div className="button-row right">
                                <button className="plain-btn danger-btn" onClick={() => onDeleteSubject(dialog.subject.id)}>删除学科</button>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="muted">当前对话：{dialog.conversation.title}</p>
                            <div className="button-row">
                                <button className="plain-btn" onClick={() => { openRenameDialog({ type: "free", id: dialog.conversation.id, title: dialog.conversation.title }); close(); }}>改名</button>
                                <button className="plain-btn danger-btn" onClick={() => onDeleteConversation(dialog.conversation.id)}>删除对话</button>
                            </div>
                            <div className="modal-stack">
                                <strong>移动至学科</strong>
                                <div className="dialog-action-list">
                                    {subjects.map((subject) => (
                                        <button className="plain-btn" key={subject.id} onClick={() => onMoveConversation(dialog.conversation.id, subject.id)}>
                                            移动到{subject.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}



export function RenameDialog({ dialog, close, submit }) {
    if (!dialog) return null;
    return <RenameDialogContent key={`${dialog.type}:${dialog.id}`} dialog={dialog} close={close} submit={submit} />;
}



function RenameDialogContent({ dialog, close, submit }) {
    const [title, setTitle] = useState(dialog?.title || "");
    return (
        <div className="modal-backdrop" onClick={close}>
            <div className="modal action-modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-head"><span>修改名称</span><button className="icon-btn" onClick={close}>×</button></div>
                <div className="modal-body modal-stack">
                    <input className="new-subject-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="输入对话名称" autoFocus />
                    <div className="button-row right">
                        <button className="plain-btn" onClick={close}>取消</button>
                        <button className="primary-btn" onClick={() => submit(dialog, title)}>保存</button>
                    </div>
                </div>
            </div>
        </div>
    );
}



export function ResourcePreviewModal({ resource, close, addResource, downloadPublicResource }) {
    if (!resource) return null;
    return (
        <div className="modal-backdrop" onClick={close}>
            <div className="modal resource-preview-modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-head">
                    <span>{resource.title || "资料预览"}</span>
                    <button className="icon-btn" onClick={close}>×</button>
                </div>
                <div className="modal-body modal-stack">
                    <div className="muted">{[resource.path, resource.chapter, resource.section].filter(Boolean).join(" / ") || "公共资料"}</div>
                    <div className="resource-preview-content">
                        {resource.loading ? "正在加载资料切片..." : (resource.contentPreview || "暂无可预览内容。")}
                    </div>
                    {Array.isArray(resource.citations) && resource.citations.length > 0 && (
                        <div className="citation-list">
                            {resource.citations.slice(0, 6).map((item, index) => <span key={`${item.chunkId || index}`}>{item.title || `切片 ${index + 1}`}</span>)}
                        </div>
                    )}
                    <div className="button-row right">
                        <button className="plain-btn" onClick={() => downloadPublicResource(resource)}>下载</button>
                        <button className="primary-btn" disabled={resource.canReference === false} onClick={() => { addResource(resource); close(); }}>引用</button>
                    </div>
                </div>
            </div>
        </div>
    );
}



export function PublicUploadModal({ open, uploadJob, uploadPublicResource, close }) {
    if (!open) return null;
    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal">
                <div className="modal-head"><span>上传到公共资料</span><button className="icon-btn" onClick={close}>×</button></div>
                <div className="modal-body modal-stack">
                    <div className="muted">文件会先进入公共资料待处理队列，后续由资料处理流程完成切片、审核和向量入库。</div>
                    <label className="plain-btn upload-button">
                        选择公共资料文件
                        <input type="file" hidden accept=".txt,.md,.pdf,.doc,.docx,.ppt,.pptx,image/*" onChange={uploadPublicResource} />
                    </label>
                    {uploadJob ? (
                        <div className="card no-shadow">
                            <h3>{uploadJob.title}</h3>
                            <p className="muted">{uploadJob.path} / {uploadJob.section}</p>
                            <p className="muted">{uploadJob.contentPreview}</p>
                        </div>
                    ) : (
                        <div className="empty-state">尚未选择文件</div>
                    )}
                </div>
            </div>
        </div>
    );
}



export function LegacySourceModal({ open, query, setQuery, search, results, addResource, currentResources, selectedReferences, close }) {
    if (!open) return null;
    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal">
                <div className="modal-head"><span>引用资料库内容</span><button className="icon-btn" onClick={close}>×</button></div>
                <div className="modal-body"><div className="modal-stack">
                    <div className="search-bar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索可引用的资料" /><button className="plain-btn" onClick={search}>搜索</button></div>
                    <div className="card">
                        <h3>当前引用</h3>
                        {selectedReferences.map((item) => <div className="select-row" key={`${item.resourceId}-${item.chunkId || item.id}`}><input type="checkbox" checked readOnly /><span>{item.title}</span><button className="mini-btn">已引用</button></div>)}
                        {selectedReferences.length === 0 && <div className="muted">暂无引用资料。</div>}
                    </div>
                    <div className="card"><h3>当前学科来源</h3>{currentResources.map((item) => <div className="select-row" key={item.id}><input type="checkbox" checked readOnly /><span>{item.title}</span><button className="mini-btn">预览</button></div>)}</div>
                    {results.map((item) => <div className="select-row" key={`${item.resourceId}-${item.chunkId}`}><input type="checkbox" readOnly /><span>{item.title}</span><button className="mini-btn" onClick={() => addResource(item)}>引用</button></div>)}
                    <div className="align-end"><button className="plain-btn" onClick={close}>取消</button><button className="primary-btn" onClick={close}>引用选中资料</button></div>
                </div></div>
            </div>
        </div>
    );
}

function sourceKey(item) {
    return `${item?.scope || "public"}:${item?.resourceId || item?.id || ""}:${item?.chunkId || ""}`;
}

export function SourceModal({ open, query, setQuery, search, results, addResource, currentResources, selectedReferences, close }) {
    if (!open) return null;
    return <SourceModalContent query={query} setQuery={setQuery} search={search} results={results} addResource={addResource} currentResources={currentResources} selectedReferences={selectedReferences} close={close} />;
}

function SourceModalContent({ query, setQuery, search, results, addResource, currentResources, selectedReferences, close }) {
    const [checkedKeys, setCheckedKeys] = useState(new Set());
    const selectedKeys = new Set((selectedReferences || []).map(sourceKey));
    const candidates = [...(currentResources || []), ...(results || [])];
    const candidateMap = new Map(candidates.map((item) => [sourceKey(item), item]));

    function toggle(item) {
        const key = sourceKey(item);
        setCheckedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }

    function addChecked() {
        checkedKeys.forEach((key) => {
            const item = candidateMap.get(key);
            if (item) addResource(item);
        });
        close();
    }

    function renderSelectable(item) {
        const key = sourceKey(item);
        const alreadySelected = selectedKeys.has(key);
        return (
            <div className="select-row" key={key}>
                <input type="checkbox" checked={alreadySelected || checkedKeys.has(key)} disabled={alreadySelected} onChange={() => toggle(item)} />
                <span>{item.title}</span>
                <button className="mini-btn" disabled={alreadySelected} onClick={() => addResource(item)}>{alreadySelected ? "已引用" : "引用"}</button>
            </div>
        );
    }

    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal">
                <div className="modal-head"><span>引用资料库内容</span><button className="icon-btn" onClick={close}>×</button></div>
                <div className="modal-body"><div className="modal-stack">
                    <div className="search-bar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索可引用的资料" /><button className="plain-btn" onClick={search}>搜索</button></div>
                    <div className="card">
                        <h3>当前引用</h3>
                        {(selectedReferences || []).map((item) => <div className="select-row" key={sourceKey(item)}><input type="checkbox" checked readOnly /><span>{item.title}</span><button className="mini-btn" disabled>已引用</button></div>)}
                        {(selectedReferences || []).length === 0 && <div className="muted">暂无引用资料。</div>}
                    </div>
                    <div className="card"><h3>当前学科来源</h3>{(currentResources || []).map(renderSelectable)}{(!currentResources || currentResources.length === 0) && <div className="muted">暂无学科来源。</div>}</div>
                    {(results || []).map(renderSelectable)}
                    <div className="align-end"><button className="plain-btn" onClick={close}>取消</button><button className="primary-btn" disabled={checkedKeys.size === 0} onClick={addChecked}>引用选中资料</button></div>
                </div></div>
            </div>
        </div>
    );
}



export function LegacyTimerModal({ open, timer, setTimer, close, finish }) {
    if (!open) return null;
    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal">
                <div className="modal-head"><span>当前学习计时</span><button className="icon-btn" onClick={close}>×</button></div>
                <div className="modal-body"><div className="modal-stack">
                    <div><h3>{timer.taskTitle || "当前任务"}</h3><div className="muted">绑定当前任务和当前对话，结束后回写实际学习时间。</div></div>
                    <div className="timer-mode"><button className="active">正计时</button><button disabled>番茄钟</button></div>
                    <div className="timer-display"><span className="muted">本次学习已进行</span><strong>{timer.elapsed}</strong><span className="muted">点击开始后持续累计，结束学习时记录本次时长。</span></div>
                    <div className="button-row"><button className="primary-btn" onClick={() => setTimer((prev) => ({ ...prev, running: !prev.running, startedAt: prev.startedAt || new Date().toISOString() }))}>{timer.running ? "暂停" : "开始"}</button><button className="plain-btn">跳过休息</button><button className="plain-btn" onClick={finish}>结束学习</button></div>
                </div></div>
            </div>
        </div>
    );
}

export function TimerModal({ open, timer, setTimer, close, finish }) {
    if (!open) return null;
    const isPomodoro = timer.mode === "pomodoro";
    const phase = timer.pomodoroPhase || "focus";
    const switchMode = (mode) => setTimer((prev) => ({
        ...prev,
        mode,
        pomodoroPhase: mode === "pomodoro" ? prev.pomodoroPhase || "focus" : "",
        startedAt: prev.running ? new Date().toISOString() : prev.startedAt,
        elapsed: "00:00",
    }));
    const skipRest = () => setTimer((prev) => ({
        ...prev,
        pomodoroPhase: "focus",
        startedAt: prev.running ? new Date().toISOString() : prev.startedAt,
        elapsed: "00:00",
    }));

    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal">
                <div className="modal-head"><span>当前学习计时</span><button className="icon-btn" onClick={close}>×</button></div>
                <div className="modal-body"><div className="modal-stack">
                    <div><h3>{timer.taskTitle || "当前任务"}</h3><div className="muted">绑定当前任务和当前对话，结束后回写实际学习时间。</div></div>
                    <div className="timer-mode"><button className={!isPomodoro ? "active" : ""} onClick={() => switchMode("stopwatch")}>正计时</button><button className={isPomodoro ? "active" : ""} onClick={() => switchMode("pomodoro")}>番茄钟</button></div>
                    <div className="timer-display"><span className="muted">{isPomodoro ? (phase === "rest" ? "休息中" : "专注中") : "本次学习已进行"}</span><strong>{timer.elapsed}</strong><span className="muted">{isPomodoro ? "番茄钟按专注/休息阶段记录，结束学习时仍会回写本次学习时长。" : "点击开始后持续累计，结束学习时记录本次时长。"}</span></div>
                    <div className="button-row"><button className="primary-btn" onClick={() => setTimer((prev) => ({ ...prev, running: !prev.running, startedAt: prev.running ? prev.startedAt : new Date().toISOString() }))}>{timer.running ? "暂停" : "开始"}</button><button className="plain-btn" disabled={!isPomodoro || phase !== "rest"} onClick={skipRest}>跳过休息</button><button className="plain-btn" onClick={finish}>结束学习</button></div>
                </div></div>
            </div>
        </div>
    );
}



export function LegacyTaskDetailModal({ open, task, close }) {
    if (!open) return null;
    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal"><div className="modal-head"><span>任务详情</span><button className="icon-btn" onClick={close}>×</button></div><div className="modal-body"><div className="modal-stack"><div><h3>{task?.title || "当前任务"}</h3><div className="muted">{task?.date || "待排期"}</div></div><div className="card no-shadow"><h3>任务说明</h3><p className="muted">{task?.description || "这里展示任务目标、要求和备注。"}</p></div></div></div></div>
        </div>
    );
}

export function TaskDetailModal({ open, task, close, startTimer }) {
    if (!open) return null;
    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal">
                <div className="modal-head"><span>任务详情</span><button className="icon-btn" onClick={close}>×</button></div>
                <div className="modal-body">
                    <div className="modal-stack">
                        <div>
                            <h3>{task?.title || "当前任务"}</h3>
                            <div className="muted">{task?.date || task?.plannedDate || "待排期"} {task?.start || task?.startTime || ""}{task?.end || task?.endTime ? `-${task?.end || task?.endTime}` : ""}</div>
                        </div>
                        <div className="card no-shadow"><h3>任务说明</h3><p className="muted">{task?.description || "暂无任务说明。"}</p></div>
                        <div className="button-row right">
                            <button className="plain-btn" onClick={close}>关闭</button>
                            <button className="primary-btn" onClick={() => startTimer?.(task)}>开始学习</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}



export function FinishModal({ open, timer, finishForm, setFinishForm, close, submit }) {
    if (!open) return null;
    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal"><div className="modal-head"><span>结束学习</span><button className="icon-btn" onClick={close}>×</button></div><div className="modal-body"><div className="modal-stack"><div className="timer-display"><span className="muted">本次学习时长</span><strong>{timer.elapsed}</strong><span className="muted">会记录到任务，并绑定当前学科对话。</span></div><div><h3>任务状态</h3><div className="finish-grid">{[["done", "完成"], ["partial", "部分完成"], ["missed", "未完成"]].map(([status, label]) => <button className={`plain-btn ${finishForm.status === status ? "active-soft" : ""}`} key={status} onClick={() => setFinishForm((prev) => ({ ...prev, status }))}>{label}</button>)}</div></div><div><h3>学习进度</h3><textarea className="finish-note" value={finishForm.note} onChange={(event) => setFinishForm((prev) => ({ ...prev, note: event.target.value }))} placeholder="简单报告本次进度：完成了什么、还剩什么、是否需要调整后续日程。" /></div><div className="button-row"><button className="primary-btn" onClick={submit}>提交进度</button><button className="plain-btn" onClick={() => { setFinishForm((prev) => ({ ...prev, note: "" })); submit(); }}>仅记录时间</button></div></div></div></div>
        </div>
    );
}



export function UpdatePlanModal({ open, close, update }) {
    if (!open) return null;
    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal"><div className="modal-head"><span>是否更新规划</span><button className="icon-btn" onClick={close}>×</button></div><div className="modal-body"><div className="modal-stack"><div className="timer-display"><span className="muted">学习记录已保存</span><strong className="question-title">需要调整后续安排吗？</strong><span className="muted">如果选择更新规划，将进入 AI 规划页继续对话。</span></div><div className="button-row right"><button className="plain-btn" onClick={close}>暂不更新</button><button className="primary-btn" onClick={update}>更新规划</button></div></div></div></div>
        </div>
    );
}
