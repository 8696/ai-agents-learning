/**
 * 职责：页头状态、教学说明（含本页核心教学点卡片）、页脚环境元信息。
 * 数据流：GET /health → EnvFooter；请求状态 → StatusPill。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  // StatusPill 四态：⏸待连接 / 🔄请求中 / ✅完成 / ❌错误。颜色语义固定。
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

  // PageIntro：本页只演示第 3 关「把关」的内容维度 A + B 两道闸门（在 step-2 置信度之上）。
  // 数据流 4 步：写原文 + 调阈值/维度开关 → 调 /api/filter-dimensions → 三道闸门顺序判定
  //              → 「通过 / 置信度拦下 / 维度 A 拦下 / 维度 B 拦下」四栏原样上页。
  DemoUI.PageIntro = function PageIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示写入策略八关里的第三关「把关（Filtering）」的内容维度 A + B 两道闸门——
          在 step-2 的置信度阈值之上，再加语义层面的判定：
          <b>维度 A「是不是事实」</b> 拦下全员规则（程序性记忆），<b>维度 B「跨会话还有用吗」</b> 拦下本轮临时状态。
          其他把关维度（维度 C / 敏感信息过滤 / 人工确认）留到 step-(N+1) 承接。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>在输入框写一段对话原文（或点下面的例句按钮），把阈值滑块调好，选好维度 A / B 开关。</li>
          <li>点「提取并把关」按钮，浏览器 POST /api/filter-dimensions，body 带 text + threshold + enableA + enableB。</li>
          <li>服务端走三道闸门：① extractFacts 抽 0~N 条候选 → ② filterByConfidence 按阈值筛（达不到标 BELOW_THRESHOLD）→ ③ filterByContentDimensions 让模型给过置信度的候选判维度 A / B（不过标 PROGRAMMATIC_RULE / SESSION_ONLY）。</li>
          <li>页面把每条候选按它被哪一道闸门拦下分四栏：绿 = 通过、黄 = 置信度拦下、橙 = 维度 A 拦下、红 = 维度 B 拦下。仍保留「只把关（置信度对照）」+「只提取（对照）」按钮，对照能看见每多加一道闸门切掉了什么。</li>
        </ol>
        <div
          id="core-takeaway"
          className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2"
        >
          <p className="text-sm font-semibold text-yellow-900">本页核心教学点</p>
          <ol className="text-sm text-yellow-900 list-decimal pl-5 space-y-1">
            <li>
              <span className="font-medium">内容维度（语义判定）跟置信度（数值判定）是两种不同的把关</span>：
              阈值是工程参数、纯数值比较；维度 A / B 需要理解语义（"全员规则 vs 个人事实"、"本轮临时 vs 跨会话稳定"），由模型判（文档 §9「谁判：模型负责哪几步、代码负责哪几步」分工表的依据）。
            </li>
            <li>
              <span className="font-medium">维度 A 把「全员规则」挡在个人事实库外面</span>：
              「以后表单都用 zod」「团队代码必须 type-safe」这类是面向全体的程序性记忆，不是张三这个人的事实；混进个人库召回时会污染张三自己的画像（"张三的技术偏好"被规则覆盖）。
            </li>
            <li>
              <span className="font-medium">维度 B 把「本轮临时状态」挡在长期库外面</span>：
              「今天有点累」「等我五分钟」「算到第 7 步」这些跨进程就消失的状态；三个月后 Agent 突然问「你今天累不累」会很尴尬——这是文档「后果 3 · 不做过期」最常见的活体表现。
            </li>
            <li>
              <span className="font-medium">三道闸门顺序很重要</span>：
              先抽 → 再置信度 → 再维度。置信度低的候选不送给模型判维度（节省一次调模型的代价，且模型对低置信度候选的判断本身也未必准）；维度判定只对过置信度的候选做。
            </li>
          </ol>
        </div>
      </section>
    );
  };

  // EnvFooter：端口 fallback 50106；协议 A + provider + model + 密钥（apps/.env）。
  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50106;
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
