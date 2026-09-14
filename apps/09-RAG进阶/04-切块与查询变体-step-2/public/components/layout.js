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
          本页只演示：多路查询（Multi-query Retrieval）。一条问句只覆盖一个语义邻域；让模型生成 N 条不同说法的检索问句，分别搜，再用 RRF（Reciprocal Rank Fusion）合并名单。命中后按 parentId 取父块、同父去重。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>页面加载时请求 GET /api/corpus（看见父块、子块）+ GET /api/index-status（顶部「向量库状态」卡）。应用启动时已经自动建库一次：6 个子块全部转向量存到内存。</li>
          <li>点「多路查询」会 POST /api/multi-query：模型生成 N 条问句变体 → 每条都算 embedding → 各自在向量库上跑余弦相似度 → RRF 合并 → 同父去重 → 调对话补全。</li>
          <li>输出区先展示 N 条问句变体，再展示每路自己的命中名单，再展示 RRF 合并后的全 6 条覆盖，最后给出去重后的父块和模型答复。</li>
          <li>本步的「检索单位 = 子块」、「生成单位 = 父块」、「父块不进向量库」等基础规则与 step-1 相同，详 step-1 小节文档。</li>
        </ol>
        <div
          id="core-takeaway"
          className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2"
        >
          <p className="text-sm font-semibold text-yellow-900">核心教学点</p>
          <ol className="text-sm text-yellow-900 list-decimal pl-5 space-y-1">
            <li>
              <span className="font-medium">多路查询</span>：一条问句可能只覆盖一个语义邻域；用模型生成 N 条不同说法的检索问句（<span className="font-medium">1 次模型调用</span>），覆盖同义词、政策名、相关概念。
            </li>
            <li>
              <span className="font-medium">每路独立检索</span>：每条变体各自算 embedding（在已建好的向量库上），各自跑余弦相似度排序，取前 K 条。<span className="font-medium">成本</span>：N 次嵌入调用 + N 次本地排序；后面仍是 1 次对话补全生成答复。
            </li>
            <li>
              <span className="font-medium">RRF 合并</span>：倒数排名融合 rrfScore(d) = Σ 1 / (60 + rank_in_route)；被多路共同命中的切块往上抬。比加权融合简单、不需要归一化分数。
            </li>
            <li>
              <span className="font-medium">父子切块基础</span>：父块不进向量库；命中后按 parentId 取父块原文；同父去重。详 step-1。
            </li>
          </ol>
        </div>
      </section>
    );
  };

  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50099;
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
