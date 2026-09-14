/**
 * 职责：页头状态、页脚环境、本页说明。颜色按 §5.3.10。
 * 数据流：status / env / intro 文案 → 固定 id。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  function StatusPill(props) {
    const map = {
      idle: { text: "⏸ 待连接", cls: "bg-gray-200 text-gray-700" },
      loading: { text: "🔄 请求中", cls: "bg-blue-100 text-blue-800" },
      ok: { text: "✅ 完成", cls: "bg-green-100 text-green-800" },
      error: { text: "❌ 错误", cls: "bg-red-100 text-red-800" },
    };
    const hit = map[props.status] || map.idle;
    return (
      <span id="status-pill" className={"text-xs px-2 py-1 rounded " + hit.cls}>
        {hit.text}
      </span>
    );
  }

  function PageHeader(props) {
    return (
      <header id="page-header" className="border-b p-4 flex items-center justify-between bg-white">
        <h1 id="page-title" className="text-xl font-semibold">
          HyDE（假想文档嵌入） · 第二步（step-2） · 假想段当探针
        </h1>
        <StatusPill status={props.status} />
      </header>
    );
  }

  function PageIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>短问句 / 太瘦问句走 HyDE —— 让模型先生成一段"如果知识库里有答案，那段大概长这样"的假想政策段，再拿假想段做嵌入 + 向量检索</b>。
          假想段只用于检索探针，不展示给用户。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>打开页面：请求 <code>/api/corpus</code> + <code>/health</code>（后者显示 embeddingModel 是否就绪）。</li>
          <li>点「跑 HyDE（假想段 + 向量检索）」：服务端调模型生成假想段 → 嵌入假想段 → 余弦 vs 预嵌入的 8 个切块 → top-K。</li>
          <li>点「跑原句直接嵌入检索（对照）」：跳过假想段，原句直接嵌入做余弦。</li>
          <li>对照同一 <code>id</code>（<code>unopened-exception</code>）：HyDE cosine vs 原句 cosine —— 看假想段是不是真的让检索更准。</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            短问句 / 太瘦问句：先让模型生成假想政策段，再嵌入。假想段不是客服答复（写飞了会稳定打到错误类文档），是检索探针；向量检索比的是"这段话和那段话像不像"，问句对陈述段常不够近，假想段对陈述段更近。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：左栏 HyDE top-K + cosine 分数；右栏原句嵌入 top-K + cosine 分数；底部「同一 id 对照」看 unopened-exception 在两侧的 rank / score。
          </div>
        </div>
      </section>
    );
  }

  function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50096;
    const keyLabel = env.hasKey ? "密钥 ✅" : "密钥 ❌（apps/.env 未配置该家密钥）";
    const embedLabel = env.hasEmbeddingModel
      ? "嵌入模型 ✅"
      : "嵌入模型 ❌（设 LLM_EMBEDDING_MODEL，或换 minimax / zhipu / qwen）";
    const provider = env.provider || "（待连接）";
    const model = env.model || "（待连接）";
    const embedModel = env.embeddingModel || "（待连接）";
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {port} · 模型服务商 {provider} · 模型 {model} · 嵌入模型 {embedModel} · {keyLabel} · {embedLabel}
        </span>
      </footer>
    );
  }

  DemoUI.StatusPill = StatusPill;
  DemoUI.PageHeader = PageHeader;
  DemoUI.PageIntro = PageIntro;
  DemoUI.EnvFooter = EnvFooter;
})();