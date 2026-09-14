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
          本页只演示：父子切块（Parent-Child Chunking）。检索打在小的子块（Child）上，喂给模型的是去重后的父块（Parent）全文。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>页面加载时请求 GET /api/corpus（看见父块、子块）+ GET /api/index-status（顶部「向量库状态」卡）。应用启动时已经自动建库一次：把 6 个子块全部转向量存到内存。</li>
          <li>点「检索并生成」会 POST /api/parent-child：问句转向量（1 个）→ 在已建好的向量库上跑余弦相似度排序 → 按 parentId 去重 → 拼 messages → 调对话补全。</li>
          <li>输出区先列「检索这一步 · 问句转向量」摘要，再列全部 6 个子块的余弦相似度与排名（Child Coverage），左栏是检索命中的 topK 子块，右栏是实际喂给模型的父块。</li>
          <li>下面紧跟「调大模型 · 请求参数」和「调大模型 · 响应结果」两块，把模型实际收到的 messages 和模型实际返回的 completion 完整贴出来。</li>
          <li>模型答复只根据父块生成。子块里没有的「物流保单号 / 48 小时」会出现在父块和答复里。</li>
        </ol>
        <div
          id="core-takeaway"
          className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2"
        >
          <p className="text-sm font-semibold text-yellow-900">核心教学点</p>
          <ol className="text-sm text-yellow-900 list-decimal pl-5 space-y-1">
            <li>
              <span className="font-medium">父子切块</span>：检索用子块（Child）、生成用父块（Parent）。
              <span className="font-medium text-red-700">父块不进向量库</span>——父子切块的根就是不让父块进库，
              避免父块讲多个主题被平均掉检索信号。
            </li>
            <li>
              <span className="font-medium">流程拆两段：建库 + 检索</span>。
              建库（应用启动时一次性）：6 个子块正文 → embedding → 存内存 Map。
              检索（每次提问）：问句 → embedding（只算1 个）→ 索引上跑余弦相似度 → 同父去重 → 取父块 → 拼 prompt → 调对话补全。
            </li>
            <li>
              <span className="font-medium">检索这一步用余弦相似度（Cosine Similarity）</span>：
              cos = A·B / |A|·|B|，只看方向不看长度；长文本和短文本能直接比。
              算法来自模块 08 03。
            </li>
            <li>
              <span className="font-medium">同父去重</span>：多个子块命中同一父块时只喂一次；
              提示词里同一节不会重复出现，词元预算不被浪费。
            </li>
          </ol>
        </div>
      </section>
    );
  };

  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50098;
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
