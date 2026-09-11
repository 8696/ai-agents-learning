/**
 * 职责：页脚环境、状态徽标、页头说明（含核心教学点）。挂 window.DemoUI。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  function StatusPill(props) {
    const map = {
      idle: { text: "⏸ 待连接", cls: "bg-gray-200 text-gray-700" },
      loading: { text: "🔄 请求中", cls: "bg-blue-100 text-blue-800" },
      ok: { text: "✅ 完成", cls: "bg-green-100 text-green-800" },
      err: { text: "❌ 错误", cls: "bg-red-100 text-red-800" },
    };
    const item = map[props.status] || map.idle;
    return (
      <span id="status-pill" className={"text-xs px-2 py-1 rounded " + item.cls}>
        {item.text}
      </span>
    );
  }

  function PageIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页演示：<b>PDF 按页段（不是按 3000 字）</b>+ <b>命中卡片显示页码</b>。step-1 / 2 / 3 / 4 全部继承；本步新增 PDF 按页切 + 命中行 source/section/page 三件全显示。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>左边点「上传 PDF 文件入库」→ POST /api/ingest-upload（multipart/form-data）→ 加载 → <b>按页分段</b>（每页 = 1 个 chunk；单页超 6000 字会截断 + 标「已截断」）→ 向量化 → 按 source 整份先删后建</li>
          <li>Markdown 路径不变（按 <code>##</code> 标题分段，无 page 字段）</li>
          <li>左边点「查看库」→ GET /api/store → 每行新增「第 N 页」徽标（PDF 才有）</li>
          <li>右边点「提问」→ POST /api/ask → 命中卡片显示「第 N 页」徽标（PDF 命中）+ 提示词材料区也带页码</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-2 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <ul className="text-xs text-gray-800 list-disc pl-5 space-y-1">
            <li>
              <b>PDF 切块粒度选择</b>：按 <b>页</b> vs 按字数。step-1 走"按 3000 字"是凑合解——跨页段落会从中间断。本步按页分段（每页 = 1 chunk）——保留语义 + <b>命中卡片能显示「第 N 页」</b>。
            </li>
            <li>
              <b>trade-off</b>：按页可能单页超长（6000 字截断）；按字数保证 chunk 大小均匀但丢页码语义。生产里通常<b>两者结合</b>——先按结构（页/章节）分，再按字数兜底。
            </li>
            <li>
              <b>page 字段透传</b>：<code>ChunkRow.page?: number</code>（可选，Markdown 无）+ <code>SQLite chunks.page INTEGER</code> + hits 透传到前端；前端的「第 N 页」徽标只在 PDF 命中卡片显示。
            </li>
            <li>
              <b>语义代价</b>：按页分段可能在某页只有半句话（页底截断）。这是 PDF 渲染层的限制，跟 chunking 无关——chunking 只决定"按什么粒度切"，"按页"是其中一个语义边界。
            </li>
          </ul>
          <div className="text-xs text-gray-600">
            观察：上传 PDF → 点「查看库」看到每行有「第 N 页」徽标；右提问问 PDF 内容 → 命中卡片显示「第 N 页」+ 提示词材料区也带页码。
          </div>
        </div>
      </section>
    );
  }

  function EnvFooter(props) {
    const env = props.env;
    const port = (env && env.port) || 50071;
    const provider = env && env.provider ? env.provider : "（待连接）";
    const model = env && env.model ? env.model : "（待连接）";
    const embed = env && env.embeddingModel ? env.embeddingModel : "（待连接）";
    const keyOk = env && env.hasKey;
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {port} · 协议 A（openai Chat Completions） · 模型服务商 {provider} · 模型 {model} · 嵌入模型 {embed} · 密钥 {keyOk ? "✅" : "❌"}
        </span>
      </footer>
    );
  }

  DemoUI.StatusPill = StatusPill;
  DemoUI.PageIntro = PageIntro;
  DemoUI.EnvFooter = EnvFooter;
  window.DemoUI = DemoUI;
})();
