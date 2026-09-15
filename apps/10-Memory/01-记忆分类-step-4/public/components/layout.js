/**
 * 职责：页头状态、教学说明、页脚环境元信息。
 * 数据流：GET /health → EnvFooter；请求状态 → StatusPill。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.StatusPill = function StatusPill(props) {
    const map = {
      idle: { text: "⏸待连接", cls: "bg-gray-200 text-gray-700" },
      loading: { text: "🔄请求中", cls: "bg-blue-100 text-blue-800" },
      ok: { text: "✅完成", cls: "bg-green-100 text-green-800" },
      error: { text: "❌错误", cls: "bg-red-100 text-red-800" },
    };
    const item = map[props.status] || map.idle;
    return (
      <span id="status-pill" className={"text-xs px-2 py-1 rounded " + item.cls}>
        {item.text}
      </span>
    );
  };

  DemoUI.PageIntro = function PageIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>完整 4 步拼装 + 多轮对话 + 程序性常驻区</b>。每条 user 消息都按以下 4 步拼成 messages 数组再发出去：
          ① 程序性记忆常驻（不检索、每次都带）→ ② 语义 / 情景召回（嵌入 + 余弦 + Top-K + 阈值弃权）→ ③ 工作记忆累积（多轮 messages 数组）→ ④ 调对话模型。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>5 句连问按钮 → 一次性按顺序发 5 条 user 消息，每条独立判断要不要召回</li>
          <li>messages 累积面板 → 逐轮看到历史在变长、第三轮请求 messages 含前两轮</li>
          <li>「结束会话」→ 清空 messages，工作记忆归零</li>
          <li>程序性常驻区 → 改一条规则，所有用户下一次回答都生效</li>
          <li>「清空用户记忆」→ 只清空事实库，程序性规则原封不动</li>
        </ol>
        <div
          id="core-takeaway"
          className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2"
        >
          <p className="text-sm font-semibold text-yellow-900">本页核心教学点</p>
          <ol className="text-sm text-yellow-900 list-decimal pl-5 space-y-1">
            <li>
              <span className="font-medium">四类记忆各自怎么进 messages</span>：程序性常驻在 system 段开头，语义/情景拼进 system 段「召回结果」，工作记忆累积在 messages 历史里——三类各走各的路径。
            </li>
            <li>
              <span className="font-medium">每轮独立判断要不要召回</span>：「刚才你说了什么」看 messages 数组、「我叫什么名字」读记忆库——同一会话内两件事不能合并。
            </li>
            <li>
              <span className="font-medium">程序性和用户记忆必须分开存</span>：清空用户记忆不能误删全员规则；改一条规则必须对所有用户生效（in-memory 共享）。
            </li>
          </ol>
        </div>
      </section>
    );
  };

  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50103;
    const hasKey = Boolean(env.hasKey);
    const providerLabel = env.provider ? String(env.provider) : "（待连接）";
    const modelLabel = env.model ? String(env.model) : "（待连接）";
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {port} · 协议 A（openai Chat Completions） · 模型服务商 {providerLabel} · 模型 {modelLabel} · 密钥{" "}
          {hasKey ? "✅" : "❌（apps/.env 未配置该家密钥）"}
        </span>
      </footer>
    );
  };
})();