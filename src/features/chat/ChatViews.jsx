import { Composer, MessageBubble } from "../../components/common/ChatPrimitives";

export function ChatView({ title, chatTab, setChatTab, messages, input, setInput, send, openSource, timer, openTimer, finish, reviews, aiStatus, aiError, webEnabled, selectedReferences, onRename }) {
    return (
        <section className="view" id="view-chat">
            <div className="topbar"><div className="top-title">{title}</div><div className="top-actions"><button className="mini-btn" onClick={onRename}>改名</button><button className="mini-btn" onClick={openTimer}>计时</button><button className="icon-btn">⋯</button></div></div>
            <div className="chat-shell">
                <div className="chat-head">
                    <div className="tabs"><button className={`tab ${chatTab === "chat" ? "active" : ""}`} onClick={() => setChatTab("chat")}>聊天</button><button className={`tab ${chatTab === "review" ? "active" : ""}`} onClick={() => setChatTab("review")}>复盘</button></div>
                    <div className="learning-bar"><div><div className="learning-bar-title">{timer.taskTitle || "当前任务"}</div><div className="learning-bar-meta">{timer.running ? `专注中 · ${timer.elapsed}` : "未开始计时"}</div></div><div className="timer-actions"><span className="timer-value">{timer.elapsed}</span><button className="mini-btn" onClick={openTimer}>展开</button><button className="mini-btn" onClick={finish}>结束</button></div></div>
                </div>
                {chatTab === "chat" ? (
                    <div className="chat-panel conversation">
                        {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
                        {aiStatus === "loading" && <div className="muted">AI 正在回答...</div>}
                        {aiError && <div className="error-text">{aiError}</div>}
                    </div>
                ) : (
                    <div className="review-layout"><div className="card"><h3>用户原始自述</h3><p className="muted">可保留原貌，也可由 AI 润色后存档。</p>{reviews.map((item) => <div className="review-item" key={item.id}>{item.original}</div>)}</div><div className="card pending"><h3>待确认收获</h3><p className="muted">用户回复“入库”后先暂存在这里。</p>{reviews.map((item) => <div className="review-item" key={item.id}>{item.harvest}</div>)}<button className="primary-btn">一键确认入库</button></div></div>
                )}
                <Composer value={input} setValue={setInput} onSend={send} placeholder="有问题，尽管问" openSource={openSource} webEnabled={webEnabled} referenceCount={selectedReferences.length} disabled={aiStatus === "loading"} />
            </div>
        </section>
    );
}



export function FreeChatView({ title, messages, input, setInput, send, openSource, aiStatus, aiError, webEnabled, selectedReferences, onRename }) {
    return (
        <section className="view" id="view-free-chat">
            <div className="topbar"><div className="top-title">{title}</div><div className="top-actions"><button className="mini-btn" onClick={onRename}>改名</button><button className="icon-btn">⋯</button></div></div>
            <div className="chat-shell free-chat-shell">
                <div className="free-chat-body">
                    {messages.length === 0 && <div className="message ai">这里是新对话入口。你可以直接开始提问、整理资料或临时讨论；发送第一条消息后，它会出现在左侧最近对话中。</div>}
                    {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
                    {aiStatus === "loading" && <div className="muted">AI 正在回答...</div>}
                    {aiError && <div className="error-text">{aiError}</div>}
                </div>
                <Composer value={input} setValue={setInput} onSend={send} placeholder="开始一个新对话" openSource={openSource} webEnabled={webEnabled} referenceCount={selectedReferences.length} disabled={aiStatus === "loading"} />
            </div>
        </section>
    );
}

