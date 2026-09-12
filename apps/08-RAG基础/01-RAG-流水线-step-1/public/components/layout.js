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
          本页演示：把 Markdown 文件<b>上传入库</b>（或用默认 refund.md），拆进向量库（Vector Database），再提问检索生成。加载（Load）是第一步，切块（Chunk）是第二步。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>左边点「上传 Markdown 文件入库」→ POST /api/ingest-upload（multipart/form-data）→ 加载文件原文 → 按 ## 标题切成卡片 → 向量化（Embed）→ 写成多行。文件名会成为 source 入库。</li>
          <li>左边点「建库（refund.md）」→ POST /api/ingest → 用默认文件入库（不走上传）</li>
          <li>左边点「查看库」→ GET /api/store → 把 SQLite 里每一行读出来（不调模型）</li>
          <li>右边点「提问」→ POST /api/ask → 问题也向量化 → 检索前 K 条 → 把材料塞进提示词（Prompt）生成</li>
          <li>连续提问不再跑加载 / 切块。左右对照：检索卡片的来源应对上左边某行。PDF / 按来源删旧 / 做成工具本步不做</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-2 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <ul className="text-xs text-gray-800 list-disc pl-5 space-y-1">
            <li>
              <b>根因（Root Cause）</b>：RAG 是为了<b>喂模型它训练时没见过的知识</b>——公司内部规则 / 训练截止之后的事实。省 token / 加快 / 准 是副产品，不是 RAG 独有的优势；它也不是「长上下文（Long Context）的优化版」。
            </li>
            <li>
              <b>真正独有的优势</b>：<b>能点名出处（Source Attribution）</b>。命中卡片带 source / 章节 / 页码——客服答错可追责、文档过期可更新、库里没有能拒绝编造，长上下文答对了你说不清它看了哪一段。
            </li>
            <li>
              <b>物理结构</b>：一本说明书入库后不是一个大对象，是 <b>N 行向量库一行要存的四个字段</b>——编号（id）/ 向量（vector）/ 原文（text）/ 来源写在元数据（metadata）里。点「查看库」看到的就是 SQLite 里这些行。
            </li>
            <li>
              <b>提问的边界</b>：检索不到相关材料时（库是空 / Top-1 最高分 &lt; 阈值），模型必须说「不知道」，不能编。点「演示库里没有答案」看 hits 命中数 + 最高分 + 是否触发弃权（Abstain）。
            </li>
          </ul>
          <div className="text-xs text-gray-600">
            观察：左右并排。左边能看到每行的 id / vector / text / source；向量开头应是带正负号的小数，不是一串 0；右边提问区的流程里没有 load / chunk；检索卡片的来源能对上左边某行；弃权时提示词里材料区被替换成「（无可用材料）」。
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
