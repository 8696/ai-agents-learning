/**
 * 职责：可复用的"正常会话"面板——user/assistant 消息列表 + 输入框 + 发送按钮 + 自动按 mode 触发写入。
 * 数据流：user 发消息 → POST /api/chat 拿回复 → POST /api/trigger 按当前 mode 写入 → 渲染候选清单 + 库变化。
 *
 * 为什么单独成文件：三个 sub-page 都复用同一个会话面板；塞进各自 HTML 会重复 200+ 行。
 * chat-panel.js 不感知 mode 由各 sub-page 的 props 决定（"eager" | "background" | "session-end"）。
 *
 * 三个 sub-page：
 *   - chat-eager.html         每轮消息发出后立即调 triggerWrite（同步；库立刻 +N）
 *   - chat-background.html    每轮消息发出后调 triggerWrite 但后台异步；右下角看后台 watcher
 *   - chat-session-end.html   每轮消息发出后只入「待结算队列」；点「结束会话」一次性结算
 *
 * 三页都把同样的会话面板挂出来；不同点在「每轮 user message 之后会发生什么 + 右上角状态区」。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  // ── 一条消息气泡（user / assistant） ──
  function MessageBubble(props) {
    const isUser = props.role === "user";
    return (
      <div className={"flex " + (isUser ? "justify-end" : "justify-start")}>
        <div
          className={
            "max-w-[80%] rounded p-2 text-sm whitespace-pre-wrap " +
            (isUser ? "bg-blue-100 text-blue-900" : "bg-green-50 text-green-900 border border-green-300")
          }
        >
          <div className="text-xs text-gray-500 mb-0.5">{isUser ? "用户" : "助手"}</div>
          <div>{props.content}</div>
        </div>
      </div>
    );
  }

  // ── 主面板：聊天 + 自动按 mode 触发写入 ──
  // props:
  //   mode          "eager" | "background" | "session-end"
  //   triggerLabel  在 UI 上讲清本 sub-page 的时机策略（让用户一眼看到本页跟其他两页差在哪）
  //   autoTrigger   true = 每轮 user message 后自动调 /api/trigger；false = 只入待结算，close 时跑（session-end 用）
  //   onRound       每轮 user message 后触发的回调，子页面用它来更新右上角的状态区（库条数 / 后台 run / 待结算）
  DemoUI.ChatPanel = function ChatPanel(props) {
    const { useState, useRef, useEffect } = React;
    const [messages, setMessages] = useState([]); // [{ role, content }]
    const [input, setInput] = useState("我们组用 Vue 3 加 TypeScript。");
    const [sending, setSending] = useState(false);
    const [lastRound, setLastRound] = useState(null); // { userText, reply, triggerResult }
    const [errorMsg, setErrorMsg] = useState("");
    const inputRef = useRef(null);
    const conversationId = props.conversationId || "demo-session";

    async function send() {
      const userText = input.trim();
      if (!userText) return;
      setSending(true);
      setErrorMsg("");
      try {
        // ① 调 /api/chat 拿助手回复（同一份会话模型，按 mode 区分前后处理）
        const chatRes = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userText, conversationId }),
        });
        const chatData = await chatRes.json();
        if (!chatRes.ok) {
          setErrorMsg("chat 失败：" + (chatData && chatData.explain) || ("HTTP " + chatRes.status));
          return;
        }
        const reply = chatData.reply;

        // ② 自动按 mode 触发写入（autoTrigger=true 时；session-end 用 false 由 closeConversation 兜底）
        let triggerResult = null;
        if (props.autoTrigger) {
          const triggerRes = await fetch("/api/trigger", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: props.mode, text: userText, conversationId }),
          });
          const triggerData = await triggerRes.json();
          if (!triggerRes.ok) {
            setErrorMsg("trigger 失败：" + (triggerData && triggerData.explain) || ("HTTP " + triggerRes.status));
          } else {
            triggerResult = triggerData;
          }
        }

        // ③ 更新对话列表 + 本轮结果
        const next = [...messages, { role: "user", content: userText }, { role: "assistant", content: reply }];
        setMessages(next);
        setLastRound({ userText, reply, triggerResult });
        setInput("");
        if (props.onRound) props.onRound({ userText, reply, triggerResult });
      } catch (err) {
        setErrorMsg(String(err));
      } finally {
        setSending(false);
        if (inputRef.current) inputRef.current.focus();
      }
    }

    return (
      <section id="chat-panel" className="bg-white shadow rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">正常会话流程</h2>
          <span className="text-xs text-gray-500">本页时机策略：<span className="font-mono text-gray-700">{props.triggerLabel}</span></span>
        </div>
        <div id="messages" className="bg-gray-50 border rounded p-3 space-y-2 min-h-[180px] max-h-[320px] overflow-auto">
          {messages.length === 0 ? (
            <div className="text-xs text-gray-500 italic">还没发消息——在下面输入框写一句用户原话点「发送」即可。每轮消息发出后本页会按 mode 自动触发写入。</div>
          ) : (
            messages.map(function (m, i) { return <MessageBubble key={i} role={m.role} content={m.content} />; })
          )}
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={function (e) { setInput(e.target.value); }}
            onKeyDown={function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            disabled={sending}
            placeholder="写一句用户原话，回车发送"
            className="flex-1 border rounded p-2 text-sm font-mono"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="bg-blue-600 text-white text-sm px-4 py-1 rounded disabled:opacity-50"
          >
            {sending ? "发送中…" : "发送"}
          </button>
        </div>
        {errorMsg ? <div className="text-xs text-red-700">{errorMsg}</div> : null}
        {lastRound ? (
          <div className="bg-blue-50 border border-blue-300 rounded p-3 space-y-1">
            <div className="text-xs font-semibold text-blue-900">本轮结果（点完按钮后可见）</div>
            <ul className="text-xs text-gray-700 space-y-1">
              <li>用户原话：<span className="font-mono">{lastRound.userText}</span></li>
              <li>助手回复：<span className="font-mono">{lastRound.reply}</span></li>
              {lastRound.triggerResult ? (
                <>
                  <li>触发响应耗时（durationMs · ms）：<span className="font-mono">{lastRound.triggerResult.durationMs}</span></li>
                  <li>库条数变化（factsCountBefore → factsCountAfter）：<span className="font-mono">{lastRound.triggerResult.factsCountBefore} → {lastRound.triggerResult.factsCountAfter}</span></li>
                  {lastRound.triggerResult.candidatesCount !== undefined ? (
                    <li>抽取候选数：<span className="font-mono">{lastRound.triggerResult.candidatesCount}</span></li>
                  ) : null}
                  {lastRound.triggerResult.runId ? (
                    <li>后台 runId：<span className="font-mono">{lastRound.triggerResult.runId}</span></li>
                  ) : null}
                  {lastRound.triggerResult.pendingQueueLength !== undefined ? (
                    <li>待结算队列长度：<span className="font-mono">{lastRound.triggerResult.pendingQueueLength}</span></li>
                  ) : null}
                </>
              ) : (
                <li className="text-gray-500">本页不自动触发写入（等「结束会话」按钮统一结算）</li>
              )}
            </ul>
            {lastRound.triggerResult && lastRound.triggerResult.candidates ? (
              <div className="space-y-1">
                <div className="text-xs text-blue-900 font-semibold">本轮抽出了（candidates）</div>
                <DemoUI.CandidateList candidates={lastRound.triggerResult.candidates} />
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  };
})();
