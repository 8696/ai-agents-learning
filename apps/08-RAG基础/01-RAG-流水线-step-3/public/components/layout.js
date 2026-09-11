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
          本页演示：<b>把检索做成工具</b>（Tool Calling）。Agent 自己写最小循环决定要不要调 <code>search_knowledge</code>——闲聊不调，问政策才调。先建库让库里有内容。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>左边先建库（refund.md 或上传 Markdown / PDF）→ 库内多份文件共存</li>
          <li>右边点「演示闲聊」/「演示问政策」/ 自填问题 → 跑 agent（POST /api/agent-run）</li>
          <li>轨迹展开：第 N 轮 → 模型决定（✓ 不调工具 / 🔧 调 search_knowledge） → 工具结果 → 最终答案</li>
          <li>手写 while 循环（不 import 模块 07）；MAX_ROUNDS = 3</li>
          <li>检索封装的粒度：模块 07 是「外部机制演示」；本步是「最小可用」</li>
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
              <b>物理结构</b>：一本说明书入库后不是一个大对象，是 <b>N 行四件套</b>——编号（id）/ 向量（vector）/ 原文（text）/ 来源写在元数据（metadata）里。点「查看库」看到的就是 SQLite 里这些行。
            </li>
            <li>
              <b>文档 = source 相同的那堆行（行级维护）</b>：按 source 整份先删后建是行级维护的最小手术——上传 v2 同名文件 → <code>DELETE WHERE source = filename</code> + insert v2 新行；v1 整份被替换，库内其它文档不动。
            </li>
            <li>
              <b>检索 = 工具，不是写死的函数调用</b>：本步把 <code>search_knowledge</code> 封成一个 Tool 喂给模型，让模型自己决定要不要调。<b>闲聊 → 不调 → 直接答</b>（不会搜出一堆噪音）；<b>问政策 → 调一次 → tool_result 喂回给模型 → 模型再生成最终答案</b>。手写 while 循环：每轮问模型要不要调 tool，调了就把结果喂回去再问一次，直到模型不再调为止。代价：模型可能该搜不搜（漏调）、或连搜两次（多调），但都比"每次提问都搜"更接近现实使用。
            </li>
          </ul>
          <div className="text-xs text-gray-600">
            观察：左边能看到每行的 id / vector / text / source；左边面板顶部"库里当前有 N 份来源"列出每份文件名 + 行数；右边跑 agent 后看轨迹——「演示闲聊」应该 0 次调 search_knowledge，「演示问政策」应该调 1 次。
          </div>
        </div>
      </section>
    );
  }

  function EnvFooter(props) {
    const env = props.env;
    const port = (env && env.port) || 50069;
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
