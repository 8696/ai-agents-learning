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

  // PageIntro：本页只演示第 3 关「把关」的内容维度 C 一道闸门（在 step-3 维度 A / B 之上）。
  // 数据流 4 步：写原文 + 调阈值/维度开关 → 调 /api/filter-dimensions → 三道闸门 + 维度 C 顺序判定
  //              → 「通过 / 置信度拦下 / 维度 A 拦下 / 维度 B 拦下 / 维度 C 拦下」五栏原样上页。
  DemoUI.PageIntro = function PageIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示写入策略八关里的第三关「把关（Filtering）」的内容维度 C 一道闸门——
          在 step-3 的维度 A「是不是事实」+ B「跨会话还有用吗」之上，再加语义层面的判定：
          <b>维度 C「值不值得占存储」</b>——拦下公开常识（该走检索增强生成 RAG 不该进个人库）和随口感慨。
          其他把关维度（敏感信息过滤 / 人工确认）留到 step-(N+1) 承接。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>在输入框写一段对话原文（或点下面的例句按钮），把阈值滑块调好，选好维度 A / B / C 开关。</li>
          <li>点「提取并把关」按钮，浏览器 POST /api/filter-dimensions，body 带 text + threshold + enableA + enableB + enableC。</li>
          <li>服务端走四道闸门：① extractFacts 抽 0~N 条候选 → ② filterByConfidence 按阈值筛（达不到标 BELOW_THRESHOLD）→ ③ filterByContentDimensions 让模型给过置信度的候选判维度 A / B / C（任一不过标 PROGRAMMATIC_RULE / SESSION_ONLY / PUBLIC_KNOWLEDGE）。</li>
          <li>页面把每条候选按它被哪一道闸门拦下分五栏：绿 = 通过、黄 = 置信度拦下、橙 = 维度 A 拦下、红 = 维度 B 拦下、紫 = 维度 C 拦下。仍保留「只把关（置信度对照）」+「只提取（对照）」按钮。</li>
        </ol>
        <div
          id="core-takeaway"
          className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2"
        >
          <p className="text-sm font-semibold text-yellow-900">本页核心教学点</p>
          <ol className="text-sm text-yellow-900 list-decimal pl-5 space-y-1">
            <li>
              <span className="font-medium">维度 C 把「公开常识」挡在个人事实库外面</span>：
              「北京是首都」「Python 是 Guido 设计的」这种是任何人都知道的常识，Agent 临时用检索增强生成 RAG 查一下就行；写进张三的个人库召回时会变成"张三告诉 Agent 北京是首都"，三个月后听起来像张三在给 Agent 上地理课——这跟"产品文档该走检索增强生成 RAG 不该全量塞进 Prompt"是同一种工程取舍。
            </li>
            <li>
              <span className="font-medium">维度 C 也拦「随口感慨」类噪音</span>：
              "今天天气不错"、"好累啊"这类既不是事实、也不跨会话、还没人想知道；放进个人库会污染召回。维度 C 跟维度 A / B 正交（公开常识也可能跨会话稳定，比如"北京是首都"一百年不变）。
            </li>
            <li>
              <span className="font-medium">公开常识不是维度 B（跨会话没用）拦的</span>：
              "北京是首都"跨会话稳定得不能再稳定了，维度 B 放它过去；拦它的只有维度 C。所以四道闸门不可合并——每一道都拦不同维度的东西。
            </li>
            <li>
              <span className="font-medium">把关这一关 3 把语义判定刀做齐了</span>：
              维度 A（语义事实 vs 全员规则）+ B（本轮临时 vs 跨会话稳定）+ C（公开常识 vs 个人事实）——三种正交的语义判定，每种拦不同类型的垃圾。剩余的敏感信息过滤和人工确认是另外两种机制（前者走关键字清单不调模型，后者走 UI），留给后续 step。
            </li>
          </ol>
        </div>
      </section>
    );
  };

  // EnvFooter：端口 fallback 50107；协议 A + provider + model + 密钥（apps/.env）。
  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50107;
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
