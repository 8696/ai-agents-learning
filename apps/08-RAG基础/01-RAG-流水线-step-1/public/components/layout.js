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
          本页只演示：把一份售后 Markdown <b>拆进向量库（Vector Database）</b>，再提问检索生成。第一步是加载（Load），第二步才是切块（Chunk）。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>左边点「建库」→ POST /api/ingest → 加载原文 → 按章节切成卡片 → 向量化（Embed）→ 写成多行</li>
          <li>左边点「查看库」→ GET /api/store → 把 SQLite 里每一行读出来（不调模型）</li>
          <li>右边点「提问」→ POST /api/ask → 问题也向量化 → 检索前 K 条 → 把材料塞进提示词（Prompt）生成</li>
          <li>第二问不应再跑加载 / 切块。左右对照：检索卡片的来源应对上左边某行。维护（按来源删旧）本步不做</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            一本说明书入库后不是一个大对象，是 N 行四件套：编号（id）/ 向量（vector）/ 原文（text）/ 来源写在元数据（metadata）里。点「查看库」看到的就是 SQLite 里这些行。提问不再拆库。向量不能全是 0——那是编码格式（encoding_format）解错了，检索分数会全变成 0。
          </div>
          <div className="text-xs text-gray-600">
            观察：左右并排。左边能看到每行的 id / vector / text / source；向量开头应是带正负号的小数，不是一串 0；右边提问区的流程里没有 load / chunk；检索卡片的来源能对上左边某行。
          </div>
        </div>
      </section>
    );
  }

  function EnvFooter(props) {
    const env = props.env;
    const port = (env && env.port) || 50067;
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
