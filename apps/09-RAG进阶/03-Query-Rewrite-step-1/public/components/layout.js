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
          查询改写（Query Rewrite） · 第一步（step-1） · 原句检索 vs 改写后再检索
        </h1>
        <StatusPill status={props.status} />
      </header>
    );
  }

  function PageIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>同一句日常说法，先按用户原句检索，再改写成库用语后检索</b>。切块（Chunk）正文来自服务端{" "}
          <code>GET /api/corpus</code>，页面没有另写一份。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>打开页面：请求 <code>/api/corpus</code>，下面先画出库里 8 个切块。</li>
          <li>点「用用户原句检索」：只发 <code>POST /api/search-original</code>，按词重叠打分，不调模型。</li>
          <li>点「改写成库用语后再检索」：只发 <code>POST /api/rewrite-and-search</code>。右栏先展示发给大模型的提示词（Prompt）和参数，再用改写句检索。</li>
          <li>对照同一 <code>id</code>：目标切块原句往往没进检索名单，改写后才进检索名单或名次抬升。</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            用户要的答案在切块里，但检索比的是「送进去的那串字」。意思一样、用词不同 → 原句对不上库用语，正确切块没进检索名单。查询改写（Query Rewrite）发生在检索之前，不是上一节那种改顺序。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：看目标切块在「原句名单」是否 onTable=false；右栏先核对系统消息（system）是不是「改写器不是客服」；改写句出现「未拆封 / 七日 / 特例」后，同一 id 是否进检索名单。
          </div>
        </div>
      </section>
    );
  }

  function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50095;
    const keyLabel = env.hasKey ? "密钥 ✅" : "密钥 ❌（apps/.env 未配置该家密钥）";
    const provider = env.provider || "（待连接）";
    const model = env.model || "（待连接）";
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {port} · 协议 A（openai Chat Completions） · 模型服务商 {provider} · 模型 {model} · {keyLabel}
        </span>
      </footer>
    );
  }

  DemoUI.StatusPill = StatusPill;
  DemoUI.PageHeader = PageHeader;
  DemoUI.PageIntro = PageIntro;
  DemoUI.EnvFooter = EnvFooter;
})();
