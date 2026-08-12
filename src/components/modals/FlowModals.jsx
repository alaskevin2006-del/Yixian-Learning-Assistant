import { useEffect, useState } from "react";
import { POMODORO_REST_SECONDS, POMODORO_SECONDS, TIMER_MODE, formatTimerSeconds, getPomodoroRemaining } from "./timerLogic";

export function ActionDialog({ dialog, subjects, close, openRenameDialog, onDeleteSubject, onDeleteConversation, onMoveConversation }) {
    if (!dialog) return null;
    const isSubject = dialog.type === "subject";
    const isSubjectConversation = dialog.type === "subject-conversation";
    const title = isSubject ? "学科操作" : isSubjectConversation ? "学科对话操作" : "最近对话操作";

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
                    ) : isSubjectConversation ? (
                        <>
                            <p className="muted">当前对话：{dialog.conversation.title}</p>
                            <div className="button-row">
                                <button className="plain-btn" onClick={() => { openRenameDialog({ type: "subject", id: dialog.conversation.id, title: dialog.conversation.title }); close(); }}>改名</button>
                                <button className="plain-btn danger-btn" onClick={() => onDeleteConversation(dialog.conversation.id, "subject")}>删除对话</button>
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
                                <strong>移动到学科</strong>
                                <div className="dialog-action-list">
                                    {subjects.map((subject) => (
                                        <button className="plain-btn" key={subject.id} onClick={() => onMoveConversation(dialog.conversation.id, subject.id)}>
                                            移动到 {subject.name}
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
                    <div className="muted">文件会先进入公共资料待处理队列，后续再完成切片、审核和入库。</div>
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

function modalResourceKey(item) {
    return `${item?.resourceId || item?.id || ""}:${item?.chunkId || ""}`;
}

export function SourceModal({ open, query, setQuery, search, results, addResource, previewResource, currentResources, selectedReferences, close }) {
    const [checkedKeys, setCheckedKeys] = useState(new Set());

    useEffect(() => {
        if (!open) setCheckedKeys(new Set());
    }, [open]);

    if (!open) return null;
    const selectedKeys = new Set(selectedReferences.map(modalResourceKey));
    const currentResourceKeys = new Set(currentResources.map(modalResourceKey));

    function toggleChecked(item) {
        const key = modalResourceKey(item);
        setCheckedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }

    function addChecked() {
        results.filter((item) => checkedKeys.has(modalResourceKey(item))).forEach(addResource);
        setCheckedKeys(new Set());
        close();
    }

    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal">
                <div className="modal-head"><span>引用资料库内容</span><button className="icon-btn" onClick={close}>×</button></div>
                <div className="modal-body"><div className="modal-stack">
                    <div className="search-bar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索可引用的资料" /><button className="plain-btn" onClick={search}>搜索</button></div>
                    <div className="card">
                        <h3>当前引用</h3>
                        {selectedReferences.map((item) => <div className="select-row" key={`${item.resourceId}-${item.chunkId || item.id}`}><input type="checkbox" checked readOnly /><span>{item.title}</span><button className="mini-btn" onClick={() => previewResource?.(item)}>预览</button></div>)}
                        {selectedReferences.length === 0 && <div className="muted">暂无引用资料。</div>}
                    </div>
                    <div className="card">
                        <h3>当前学科来源</h3>
                        {currentResources.map((item) => <div className="select-row" key={item.id}><input type="checkbox" checked readOnly /><span>{item.title}</span><button className="mini-btn" onClick={() => previewResource?.(item)}>预览</button></div>)}
                    </div>
                    {results.map((item) => {
                        const key = modalResourceKey(item);
                        const alreadyReferenced = selectedKeys.has(key) || currentResourceKeys.has(key);
                        return (
                            <div className="select-row" key={`${item.resourceId || item.id}-${item.chunkId || ""}`}>
                                <input type="checkbox" checked={checkedKeys.has(key) || alreadyReferenced} disabled={alreadyReferenced} onChange={() => toggleChecked(item)} />
                                <span>{item.title}</span>
                                <button className="mini-btn" onClick={() => previewResource?.(item)}>预览</button>
                                <button className="mini-btn" disabled={alreadyReferenced} onClick={() => addResource(item)}>{alreadyReferenced ? "已引用" : "引用"}</button>
                            </div>
                        );
                    })}
                    <div className="align-end"><button className="plain-btn" onClick={close}>取消</button><button className="primary-btn" disabled={checkedKeys.size === 0} onClick={addChecked}>引用选中资料</button></div>
                </div></div>
            </div>
        </div>
    );
}

export function TimerModal({ open, timer, setTimer, close, finish }) {
    const [timerMode, setTimerMode] = useState(TIMER_MODE.stopwatch);
    const [pomodoroRunning, setPomodoroRunning] = useState(false);
    const [pomodoroStartedAt, setPomodoroStartedAt] = useState("");
    const [pomodoroPhase, setPomodoroPhase] = useState("focus");
    const [pomodoroRemaining, setPomodoroRemaining] = useState(POMODORO_SECONDS);

    useEffect(() => {
        if (!open) return;
        setTimerMode(timer?.mode || TIMER_MODE.stopwatch);
        setPomodoroPhase(timer?.pomodoroPhase || "focus");
    }, [open, timer?.mode, timer?.pomodoroPhase]);

    useEffect(() => {
        if (!open || timerMode !== TIMER_MODE.pomodoro || !pomodoroRunning || !pomodoroStartedAt) return undefined;
        const tick = () => {
            const duration = pomodoroPhase === "rest" ? POMODORO_REST_SECONDS : POMODORO_SECONDS;
            const remaining = getPomodoroRemaining(pomodoroStartedAt, Date.now(), duration);
            setPomodoroRemaining(remaining);
            if (remaining <= 0) {
                setPomodoroRunning(false);
                const nextPhase = pomodoroPhase === "focus" ? "rest" : "focus";
                setPomodoroPhase(nextPhase);
                setPomodoroStartedAt("");
                setPomodoroRemaining(nextPhase === "rest" ? POMODORO_REST_SECONDS : POMODORO_SECONDS);
            }
        };
        tick();
        const id = window.setInterval(tick, 1000);
        return () => window.clearInterval(id);
    }, [open, pomodoroPhase, pomodoroRunning, pomodoroStartedAt, timerMode]);

    if (!open) return null;

    const isPomodoro = timerMode === TIMER_MODE.pomodoro;
    const isRunning = isPomodoro ? pomodoroRunning : !!timer?.running;
    const displayValue = isPomodoro ? formatTimerSeconds(pomodoroRemaining) : (timer?.elapsed || "00:00");
    const timerLabel = isPomodoro ? (pomodoroPhase === "rest" ? "休息剩余" : "专注剩余") : "本次已学习";
    const timerHint = isPomodoro ? "番茄钟会在专注和休息间自动切换。" : "从开始学习后持续累计，可暂停或结束。";

    function toggleTimer() {
        if (isPomodoro) {
            if (pomodoroRunning) {
                setPomodoroRunning(false);
                return;
            }
            setPomodoroRunning(true);
            setPomodoroStartedAt(new Date().toISOString());
            return;
        }
        setTimer((prev) => ({
            ...prev,
            running: !prev.running,
            startedAt: prev.running ? prev.startedAt : new Date().toISOString(),
            mode: TIMER_MODE.stopwatch,
        }));
    }

    function resetTimer() {
        if (isPomodoro) {
            setPomodoroRunning(false);
            setPomodoroStartedAt("");
            setPomodoroRemaining(pomodoroPhase === "rest" ? POMODORO_REST_SECONDS : POMODORO_SECONDS);
            return;
        }
        setTimer((prev) => ({ ...prev, running: false, startedAt: "", elapsed: "00:00" }));
    }

    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal">
                <div className="modal-head"><span>当前学习计时</span><button className="icon-btn" onClick={close}>×</button></div>
                <div className="modal-body"><div className="modal-stack">
                    <div className="timer-mode">
                        <button className={timerMode === TIMER_MODE.stopwatch ? "active" : ""} onClick={() => setTimerMode(TIMER_MODE.stopwatch)}>正计时</button>
                        <button className={timerMode === TIMER_MODE.pomodoro ? "active" : ""} onClick={() => setTimerMode(TIMER_MODE.pomodoro)}>番茄钟</button>
                    </div>
                    {isPomodoro && (
                        <div className="timer-mode">
                            <button className={pomodoroPhase === "focus" ? "active" : ""} onClick={() => { setPomodoroPhase("focus"); setPomodoroRunning(false); setPomodoroStartedAt(""); setPomodoroRemaining(POMODORO_SECONDS); }}>专注</button>
                            <button className={pomodoroPhase === "rest" ? "active" : ""} onClick={() => { setPomodoroPhase("rest"); setPomodoroRunning(false); setPomodoroStartedAt(""); setPomodoroRemaining(POMODORO_REST_SECONDS); }}>休息</button>
                        </div>
                    )}
                    <div className="timer-display"><span className="muted">{timerLabel}</span><strong>{displayValue}</strong><span className="muted">{timerHint}</span></div>
                    <div className="button-row"><button className="primary-btn" onClick={toggleTimer}>{isRunning ? "暂停" : "开始"}</button><button className="plain-btn" onClick={resetTimer}>{isPomodoro ? "重置番茄钟" : "重置计时"}</button><button className="plain-btn" onClick={finish}>结束学习</button></div>
                </div></div>
            </div>
        </div>
    );
}

function taskStatusLabel(status) {
    const map = {
        done: "已完成",
        partial: "部分完成",
        doing: "进行中",
        pending: "待开始",
        draft: "草案",
        confirmed: "已加入日程",
        missed: "未完成",
    };
    return map[status] || "待安排";
}

function buildTaskMeta(task) {
    const date = task?.date || task?.plannedDate || task?.planned_date || "待排期";
    const time = task?.start || task?.startTime || task?.start_time || "";
    const end = task?.end || task?.endTime || task?.end_time || "";
    const duration = time && end ? `${time}-${end}` : time || end || "待安排";
    const subject = task?.subject || "未分类";
    const stage = task?.stage || task?.phase || "今日任务";
    const status = taskStatusLabel(task?.status);
    const estimate = task?.estimate || task?.estimatedDuration || task?.duration || (time && end ? `${time}-${end}` : "约 60 分钟");
    return { date, duration, subject, stage, status, estimate };
}

export function TaskDetailModal({ open, task, close, startTimer, addToSchedule, editTask }) {
    if (!open) return null;
    const meta = buildTaskMeta(task);
    const title = task?.title || "当前任务";
    const description = task?.description || "暂无任务说明。";
    const isDraft = task?.status === "draft";

    return (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div className="modal task-detail-modal">
                <div className="modal-head task-detail-head">
                    <span>任务详情</span>
                    <button className="icon-btn" onClick={close}>×</button>
                </div>
                <div className="modal-body task-detail-body">
                    <div className="task-detail-top">
                        <h2 className="task-detail-title" title={title}>{title}</h2>
                        <div className="task-detail-tags">
                            <span className="task-detail-tag">{meta.subject}</span>
                            <span className="task-detail-tag">{meta.stage}</span>
                            <span className="task-detail-tag">{meta.status}</span>
                            <span className="task-detail-tag">预计 {meta.estimate}</span>
                        </div>
                        <div className="task-detail-meta">
                            <span>{meta.date}</span>
                            <span>{meta.duration}</span>
                            <span>预计用时：{meta.estimate}</span>
                        </div>
                    </div>

                    <div className="task-detail-description">
                        <div className="task-detail-description-head">
                            <h3>任务说明</h3>
                        </div>
                        <div className="task-detail-description-body">
                            {description}
                        </div>
                    </div>

                    <div className="task-detail-actions">
                        <button className="primary-btn" onClick={() => startTimer?.(task)}>开始学习</button>
                        <button className="plain-btn" onClick={() => addToSchedule?.(task)} disabled={!isDraft}>加入日程</button>
                        <button className="plain-btn" onClick={() => editTask?.(task)}>编辑</button>
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
