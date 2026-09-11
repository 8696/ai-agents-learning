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
          本页演示：<b>答准时修法提示（变体 15）</b>。5 类症状分类识别 → 行级 / 全量 / 不动库 修法选择。左侧建库 + 右侧跑 agent 都继承自 step-1/2/3；底部新增「5 类症状」卡片。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>左侧先建库（refund.md 或上传 Markdown / PDF，多份共存 + 按 source 整份先删后建）</li>
          <li>右侧跑 agent（自带最小循环，模型自己决定要不要调 search_knowledge）</li>
          <li>底部 5 张症状卡：点「试试此症状」会自动发问 + 跑 agent + 把对应症状高亮</li>
          <li>每张卡：典型表现 + 推荐修法（绿）+ 不要的修法（红）</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-2 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <ul className="text-xs text-gray-800 list-disc pl-5 space-y-1">
            <li>
              <b>答不准 ≠ 一律重跑整库</b>：5 类症状 → 3 种修法（<b>行级 / 全量 / 不动库</b>）。
            </li>
            <li>
              <b>5 类症状</b>：① 库里没这类知识（hits=0 / Top-1 &lt; 0.2）→ 行级（补文档）｜② 库脏（v1+v2 并存，互相矛盾）→ 行级（按 source 先删后建）｜③ 提示词不够硬（K 条相关但模型没引用）→ 不动库（改 system prompt）｜④ 分数看起来低（0.2~0.4 但原文真相关）→ <b>不动库</b>（先看原文 / 调阈值 / 换问法；<b>不要换嵌入模型</b>）｜⑤ 同义改写搜不到（概念上有，命中 0）→ 不动库（query rewrite）。
            </li>
            <li>
              <b>全量重建只在两种情况下用</b>：切块策略改了 / 嵌入模型换了。其余 99% 都是行级或不动库。
            </li>
            <li>
              <b>「分数看起来低」≠ 嵌入模型坏了</b>：分数量纲因模型而异（典型差异 0.3~0.7）。先点开切块原文看是否真相关；调阈值比换嵌入模型便宜一万倍。
            </li>
          </ul>
          <div className="text-xs text-gray-600">
            观察：底部的 5 张症状卡是矩阵；点击任一张的「试试此症状」会自动用预设问题跑一遍 agent，验证症状是否真实出现。症状「分数低」那一条明确写「不要换嵌入模型」，避免一刀切。
          </div>
        </div>
      </section>
    );
  }

  function EnvFooter(props) {
    const env = props.env;
    const port = (env && env.port) || 50070;
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
