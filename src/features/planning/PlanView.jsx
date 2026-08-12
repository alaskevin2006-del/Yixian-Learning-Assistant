import { Fragment, useEffect, useRef, useState } from "react";
import { Composer, MessageBubble } from "../../components/common/ChatPrimitives";
import { filterTasksForPanel } from "./taskFilters";
const RECENT_ITEM_LIMIT = 2;

function localDateKey(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function taskScheduleDate(task) {
    const value = task?.date
        || task?.plannedDate
        || task?.planned_date
        || task?.plannedStart
        || task?.planned_start
        || "";
    const text = String(value).trim();
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

function parseScheduleTime(value) {
    const match = String(value || "").trim().match(/(?:T|\b)([01]?\d|2[0-3]):([0-5]\d)/);
    if (!match) return null;
    return {
        hour: Number(match[1]),
        minute: Number(match[2]),
    };
}

function taskScheduleStart(task) {
    return parseScheduleTime(
        task?.start
        || task?.startTime
        || task?.start_time
        || task?.time
        || task?.plannedStart
        || task?.planned_start
        || "",
    );
}

function taskSchedulePoint(task) {
    const dateKey = taskScheduleDate(task);
    const start = taskScheduleStart(task);
    if (!dateKey || !start) return null;
    const hour = String(start.hour).padStart(2, "0");
    const minute = String(start.minute).padStart(2, "0");
    const timestamp = Date.parse(`${dateKey}T${hour}:${minute}:00`);
    if (Number.isNaN(timestamp)) return null;
    return { dateKey, hour: start.hour, timestamp };
}

function timeValue(value) {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function timeValueFromId(id) {
    const text = String(id || "");
    const match = text.match(/(?:^|[-_])([0-9a-z]{6,})(?=[-_]|$)/i);
    if (!match) return 0;
    const parsed = Number.parseInt(match[1], 36);
    return parsed > 946684800000 && parsed < 4102444800000 ? parsed : 0;
}

function itemTimelineValue(item) {
    return timeValue(item?.updatedAt)
        || timeValue(item?.updated_at)
        || timeValue(item?.createdAt)
        || timeValue(item?.created_at)
        || timeValue(item?.timestamp)
        || timeValue(item?.plannedStart)
        || timeValue(item?.planned_start)
        || timeValue(item?.plannedDate)
        || timeValue(item?.planned_date)
        || timeValue(item?.time)
        || timeValue(item?.date && item?.start ? `${item.date}T${item.start}` : "")
        || timeValue(item?.date)
        || timeValueFromId(item?.id);
}

function recentItems(items) {
    return (items || [])
        .slice()
        .sort((left, right) => itemTimelineValue(right) - itemTimelineValue(left))
        .slice(0, RECENT_ITEM_LIMIT);
}

export function PlanView({
    planTab,
    setPlanTab,
    conversations,
    activeId,
    setActiveId,
    newConversation,
    drafts,
    confirmDraft,
    confirmAllDrafts,
    deleteDraft,
    deleteConversation,
    openRenameDialog,
    openTaskDetail,
    input,
    setInput,
    sendPlanningMessage,
    messages,
    taskForm,
    setTaskForm,
    saveTask,
    tasks,
    subjects,
    startTimer,
    openNewSubject,
    aiStatus,
    aiError,
}) {
    const [conversationsOpen, setConversationsOpen] = useState(true);
    const [draftsOpen, setDraftsOpen] = useState(true);
    const [openMenu, setOpenMenu] = useState("");
    const visibleConversations = conversations || [];
    const visibleDrafts = drafts || [];
    const pendingDraftCount = visibleDrafts.filter((draft) => draft.status !== "confirmed").length;
    return (
        <section className="view" id="view-plan">
            <div className="plan-frame">
                <div className="plan-tabs">
                    <button className={`plan-tab ${planTab === "ai" ? "active" : ""}`} onClick={() => setPlanTab("ai")}>AI规划</button>
                    <button className={`plan-tab ${planTab === "tasks" ? "active" : ""}`} onClick={() => setPlanTab("tasks")}>任务安排</button>
                    <button className={`plan-tab ${planTab === "schedule" ? "active" : ""}`} onClick={() => setPlanTab("schedule")}>学习日程</button>
                </div>
                {planTab === "ai" && (
                    <div className="planner-layout">
                        <div className="planner-rail">
                            <div className="rail-section">
                                <button className="rail-section-head" onClick={() => setConversationsOpen((value) => !value)}><span>规划对话</span><span className="chevron">{conversationsOpen ? "▾" : "▸"}</span></button>
                                {conversationsOpen && <div className="rail-section-body conversation-section-body">
                                    <button className="plain-btn" onClick={newConversation}>新建规划对话</button>
                                    <div className="conversation-list">
                                        {visibleConversations.map((conversation) => (
                                            <div
                                                key={conversation.id}
                                                className={`rail-card rail-card-clickable ${conversation.id === activeId ? "active" : ""}`}
                                                onClick={() => {
                                                    setActiveId(conversation.id);
                                                    setOpenMenu("");
                                                }}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter" || event.key === " ") {
                                                        event.preventDefault();
                                                        setActiveId(conversation.id);
                                                        setOpenMenu("");
                                                    }
                                                }}
                                                role="button"
                                                tabIndex={0}
                                            >
                                                <div className="rail-card-row">
                                                    <div className="rail-card-main">
                                                        <strong>{conversation.title}</strong>
                                                        <div className="muted">AI 规划助手</div>
                                                    </div>
                                                    <div className="inline-menu planner-inline-menu">
                                                        <button
                                                            className="row-menu planner-row-menu"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                setOpenMenu((value) => value === `conversation:${conversation.id}` ? "" : `conversation:${conversation.id}`);
                                                            }}
                                                            aria-label="规划对话操作"
                                                        >
                                                            ⋯
                                                        </button>
                                                        {openMenu === `conversation:${conversation.id}` && (
                                                            <div className="inline-menu-popover align-right" onClick={(event) => event.stopPropagation()}>
                                                                <button onClick={() => { openRenameDialog({ type: "planning", id: conversation.id, title: conversation.title }); setOpenMenu(""); }}>改名</button>
                                                                <button className="danger" onClick={() => { deleteConversation(conversation.id); setOpenMenu(""); }}>删除</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>}
                            </div>
                            <div className="rail-section draft-section">
                                <button className="rail-section-head" onClick={() => setDraftsOpen((value) => !value)}><span>任务草案</span><span className="chevron">{draftsOpen ? "▾" : "▸"}</span></button>
                                {draftsOpen && <div className="rail-section-body draft-section-body">
                                    {pendingDraftCount > 0 && (
                                        <button className="plain-btn" onClick={confirmAllDrafts}>全部加入日程</button>
                                    )}
                                    <div className="draft-area">
                                        <div className="draft-list">
                                            {visibleDrafts.map((draft) => (
                                                <div className="draft-card" key={draft.id}>
                                                    <div className="draft-card-head">
                                                        <strong>{draft.title}</strong>
                                                    </div>
                                                    <div className="draft-time">{draft.date || "待排期"} {draft.start || ""}{draft.end ? `-${draft.end}` : ""}</div>
                                                    <div className="draft-actions draft-actions-inline">
                                                        <button className="mini-btn active-soft" onClick={() => openTaskDetail?.(draft)}>查看</button>
                                                        <button className="mini-btn" disabled={draft.status === "confirmed"} onClick={() => confirmDraft(draft)}>{draft.status === "confirmed" ? "已加入" : "加入"}</button>
                                                        <button className="mini-btn danger-btn" onClick={() => deleteDraft(draft)}>删除</button>
                                                    </div>
                                                </div>
                                            ))}
                                            {drafts.length === 0 && <div className="muted">暂无任务草案。</div>}
                                        </div>
                                    </div>
                                </div>}
                            </div>
                        </div>
                        <div className="ai-main">
                            <div className="chat-canvas">
                                <div className="message ai">你可以直接发学习目标、错题、卡点、考试需求、时间约束。我会先澄清目标和安排，等你确认后再生成任务草案。</div>
                                {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
                                {aiStatus === "loading" && <div className="muted">AI 正在整理规划...</div>}
                                {aiError && <div className="error-text">{aiError}</div>}
                            </div>
                            <Composer value={input} setValue={setInput} onSend={sendPlanningMessage} placeholder="发学习目标、错题、卡点、考试时间或本周可用时间" disabled={aiStatus === "loading"} />
                        </div>
                    </div>
                )}
                {planTab === "tasks" && <TasksPanel form={taskForm} setForm={setTaskForm} saveTask={saveTask} tasks={tasks} subjects={subjects} startTimer={startTimer} openNewSubject={openNewSubject} />}
                {planTab === "schedule" && <ScheduleView tasks={tasks} openTaskDetail={openTaskDetail} />}
            </div>
        </section>
    );
}



function TasksPanel({ form, setForm, saveTask, tasks, subjects, startTimer, openNewSubject }) {
    const [taskView, setTaskView] = useState("new");
    const [taskQuery, setTaskQuery] = useState("");
    const [taskLevel, setTaskLevel] = useState("all");
    const activeSubjectFilter = taskView.startsWith("subject:") ? taskView.slice("subject:".length) : "";
    const activeSubject = subjects.find((subject) => subject.id === activeSubjectFilter);
    const visibleTasks = filterTasksForPanel(tasks, subjects, {
        taskView,
        query: taskQuery,
        level: taskLevel,
    });
    const recentTasks = taskView === "all" ? recentItems(visibleTasks) : [];
    const recentTaskIds = new Set(recentTasks.map((task) => task.id));
    const listedTasks = taskView === "all" ? visibleTasks.filter((task) => !recentTaskIds.has(task.id)) : visibleTasks;
    const viewTitle = taskView === "new"
        ? "新建任务"
        : taskView === "all"
            ? "全部任务"
            : taskView === "uncategorized"
                ? "待归档任务"
                : activeSubject?.name || "学科任务";

    return (
        <div className="task-shell">
            <div className="side-panel">
                <div className="side-section">
                    <div className="side-label">任务视图</div>
                    <button className={`side-pill ${taskView === "new" ? "active" : ""}`} onClick={() => setTaskView("new")}>新建任务</button>
                    <button className={`side-pill ${taskView === "all" ? "active" : ""}`} onClick={() => setTaskView("all")}>全部任务</button>
                    <button className={`side-pill ${taskView === "uncategorized" ? "active" : ""}`} onClick={() => setTaskView("uncategorized")}>待归档任务</button>
                </div>
                <div className="side-section">
                    <div className="side-label">按学科筛选</div>
                    {subjects.map((subject) => (
                        <button className={`side-pill ${taskView === `subject:${subject.id}` ? "active" : ""}`} key={subject.id} onClick={() => setTaskView(`subject:${subject.id}`)}>
                            {subject.name}
                        </button>
                    ))}
                </div>
            </div>
            <div className="task-main">
                {taskView === "new" && <div>
                    <h2>新建任务</h2>
                    <p className="muted">可选择已有学科，也可先新建学科；未选择学科时保存到待归档。</p>
                    <div className="form-grid">
                        <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="任务名，例如：章节复习" />
                        <div className="inline-create">
                            <select className="form-control" value={form.subject} onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}>
                                <option value="">保存到待归档</option>
                                {subjects.map((subject) => <option key={subject.id} value={subject.name}>{subject.name}</option>)}
                            </select>
                            <button className="plain-btn" onClick={openNewSubject}>新建学科</button>
                        </div>
                        <div className="form-row">
                            <input type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} />
                            <input type="time" value={form.start} onChange={(event) => setForm((prev) => ({ ...prev, start: event.target.value }))} />
                            <input type="time" value={form.end} onChange={(event) => setForm((prev) => ({ ...prev, end: event.target.value }))} />
                        </div>
                        <textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="任务说明，可选：目标、范围、要用的资料、验收方式。" />
                        <div className="align-end"><button className="primary-btn" onClick={saveTask}>保存任务</button></div>
                    </div>
                </div>}
                {taskView !== "new" && (
                    <div className="task-list">
                        <div className="task-list-head">
                            <h2>{viewTitle}</h2>
                            <span className="muted">{visibleTasks.length} 个任务</span>
                        </div>
                        <div className="task-search-panel">
                            <input value={taskQuery} onChange={(event) => setTaskQuery(event.target.value)} placeholder="检索任务、学科或说明" />
                            <select className="form-control" value={taskLevel} onChange={(event) => setTaskLevel(event.target.value)}>
                                <option value="all">全部层级</option>
                                <option value="with-subject">已归入学科</option>
                                <option value="uncategorized">待归档</option>
                            </select>
                        </div>
                        {taskView === "all" && recentTasks.length > 0 && (
                            <div className="recent-task-panel">
                                <div className="task-list-subhead">
                                    <h3>最近任务</h3>
                                    <span className="muted">{recentTasks.length} 个任务</span>
                                </div>
                                {recentTasks.map((task) => (
                                    <div className="list-row" key={task.id}>
                                        <div><strong>{task.title}</strong><div className="muted">{task.subject || "待归档"} · {task.date} {task.start}-{task.end}</div></div>
                                        <button className="mini-btn" onClick={() => startTimer(task)}>开始</button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {listedTasks.map((task) => (
                            <div className="list-row" key={task.id}>
                                <div><strong>{task.title}</strong><div className="muted">{task.subject || "待归档"} · {task.date} {task.start}-{task.end}</div></div>
                                <button className="mini-btn" onClick={() => startTimer(task)}>开始</button>
                            </div>
                        ))}
                        {visibleTasks.length === 0 && <div className="empty-state">暂无任务</div>}
                    </div>
                )}
            </div>
        </div>
    );
}



function ScheduleView({ tasks, openTaskDetail }) {
    const [weekOffset, setWeekOffset] = useState(0);
    const calendarBodyRef = useRef(null);
    const hours = Array.from({ length: 24 }, (_, index) => index);
    const today = new Date();
    const weekDays = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(today);
        const mondayOffset = (date.getDay() || 7) - 1;
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - mondayOffset + index + weekOffset * 7);
        return date;
    });
    const toDateKey = (day) => localDateKey(day);

    useEffect(() => {
        const body = calendarBodyRef.current;
        if (!body) return;
        const currentHour = new Date().getHours();
        const currentLabel = body.querySelector(`[data-hour="${currentHour}"]`);
        if (!currentLabel) return;
        const nextTop = Math.max(
            0,
            currentLabel.offsetTop - (body.clientHeight / 2) + (currentLabel.clientHeight / 2),
        );
        body.scrollTo({ top: nextTop, behavior: "auto" });
    }, [weekOffset]);

    return (
        <div className="schedule-wrap">
            <div className="schedule-toolbar">
                <button className="plain-btn" onClick={() => setWeekOffset((value) => value - 1)}>上一周</button>
                <div className="week-title">
                    <span>{weekDays[0].toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} - {weekDays[6].toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</span>
                </div>
                <button className="plain-btn" onClick={() => setWeekOffset((value) => value + 1)}>下一周</button>
            </div>
            <div className="calendar-card">
                <div className="calendar-grid-shell">
                    <div className="calendar-grid-wide">
                        <div className="week-head">
                            <div className="time-axis-head">时间</div>
                            {weekDays.map((day) => (
                                <div className={`day-cell ${day.toDateString() === today.toDateString() ? "today" : ""}`} key={day.toISOString()}>
                                    <div><small>{day.toLocaleDateString("zh-CN", { weekday: "short" })}</small>{day.getDate()}</div>
                                </div>
                            ))}
                        </div>
                        <div className="calendar-body" ref={calendarBodyRef}>
                            {hours.map((hour) => (
                                <Fragment key={hour}>
                                    <div className="time-label" data-hour={hour} key={`time-${hour}`}>{String(hour).padStart(2, "0")}:00</div>
                                    {weekDays.map((day) => {
                                        const dateKey = toDateKey(day);
                                        const items = tasks
                                            .filter((task) => taskScheduleDate(task) === dateKey && (taskScheduleStart(task)?.hour ?? 19) === hour)
                                            .sort((left, right) => itemTimelineValue(left) - itemTimelineValue(right));
                                        return (
                                        <div className="hour-cell" key={`${dateKey}-${hour}`}>
                                            {items.map((task) => (
                                                <button className="schedule-task" key={task.id} onClick={() => openTaskDetail?.(task)} type="button">
                                                    <strong>{task.title}</strong>
                                                    <span>{task.subject || "待归档"} · {task.start || "--:--"}{task.end ? `-${task.end}` : ""}</span>
                                                </button>
                                            ))}
                                        </div>
                                        );
                                    })}
                                </Fragment>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="legend"><span>学习</span><span>复盘</span><span>建议</span><span>空白时间</span></div>
            </div>
        </div>
    );
}


