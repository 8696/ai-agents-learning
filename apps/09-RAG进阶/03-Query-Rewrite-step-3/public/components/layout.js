/**
 * 职责：页头状态、页脚环境、本页说明。颜色按 §5.3.10。
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
          查询改写（Query Rewrite） · 第三步（step-3） · 评测集 + 生成侧
        </h1>
        <StatusPill status={props.status} />
      </header>
    );
  }

  function PageIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>评测集（变体 11）对照"原句 vs 改写"命中率</b> + <b>生成侧（变体 12）拼 prompt + 调 LLM 答，user 侧 = 原句、retrieval = 改写句</b>。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>打开页面：请求 <code>/api/eval-set</code> 看 30 题评测集（不含答案）+ <code>/api/corpus</code> 看 8 个切块。</li>
          <li>点「跑评测（开改写 + 关改写 对照）」：服务端逐题按两个 mode 跑检索，对照命中率。</li>
          <li>点「跑生成（改写检索）」：服务端拼 prompt（user 侧 = 原句、retrieval = 改写句）+ 调模型答，模型用 <code>[id=xxx]</code> 引用切块。</li>
          <li>对照同一 <code>id</code>：评测集能看见改写对哪类题提升最大；生成侧能看见 user 侧 = 原句、retrieval 是改写句。</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            评测集 = 离线"一次只加一个变量"的可信对照：原句检索是基线、改写检索是对照；命中率差 = 改写带来的真实提升。生成侧 = prompt 工程：检索用改写句（内部探针）、展示给用户的 user 侧仍是原句，模型答时引用 <code>[id=xxx]</code> 让用户能回溯到具体切块。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：评测页看命中率对照表（开 vs 关）+ 每题命中详情（哪几题改写补回来了）；生成页看完整 prompt 三段（原话 / 内部检索词 / top-K 切块）+ 模型回复里的 <code>[id=xxx]</code> 引用。
          </div>
        </div>
      </section>
    );
  }

  function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50097;
    const keyLabel = env.hasKey ? "密钥 ✅" : "密钥 ❌（apps/.env 未配置该家密钥）";
    const provider = env.provider || "（待连接）";
    const model = env.model || "（待连接）";
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {port} · 模型服务商 {provider} · 模型 {model} · {keyLabel}
        </span>
      </footer>
    );
  }

  DemoUI.StatusPill = StatusPill;
  DemoUI.PageHeader = PageHeader;
  DemoUI.PageIntro = PageIntro;
  DemoUI.EnvFooter = EnvFooter;
})();