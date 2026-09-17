/**
 * 职责：页头状态条、本页说明、页脚环境信息。
 * 数据流：App 传入 status / env；页脚 fallback 端口 50117，真值来自 GET /health。
 * 为什么单独成文件：骨架三块每页都要，不堆进 index.html。
 */
window.DemoUI = window.DemoUI || {};

function StatusPill(props) {
  const map = {
    idle: { cls: "bg-gray-200 text-gray-700", text: "⏸ 待连接" },
    loading: { cls: "bg-blue-100 text-blue-800", text: "🔄 请求中" },
    ok: { cls: "bg-green-100 text-green-800", text: "✅ 完成" },
    error: { cls: "bg-red-100 text-red-800", text: "❌ 错误" },
  };
  const view = map[props.status] || map.idle;
  return (
    <span id="status-pill" className={"text-xs px-2 py-1 rounded " + view.cls}>
      {view.text}
    </span>
  );
}

function PageIntro() {
  return (
    <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
      <p className="text-sm text-gray-700">
        本页只演示：<b>走一步才算一步</b>。内部 FAQ 是一条直线：改写问题 → 检索 → 生成答案 → 完成。不调大模型。分叉、穷尽、回边在邻页。
      </p>
      <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
        <li>左边发送问句 → POST /api/faq/start → 工单停在「改写问题」，还没跑第一站</li>
        <li>右边点「走一步」→ POST /api/faq/step → 只跑当前站，状态（State）全文一起变</li>
        <li>点三次后到达完成，左边才出现助手回复（replyDraft）</li>
      </ol>
      <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
        <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
        <div className="text-xs text-gray-800">
          Agent 的一步 = 一次状态转移（State Transition）：当前节点换了，状态（State）里的字段也换了。左边用户只看见问句和最终回复；右边才能看见字段怎么一站交给下一站。
        </div>
        <div className="text-xs text-gray-600">
          怎么观察：点三次「走一步」，currentNode 依次经过 rewrite → retrieve → generate → okEnd；左边第三次之后才出绿气泡。
        </div>
      </div>
    </section>
  );
}

function EnvFooter(props) {
  const env = props.env;
  const port = (env && env.port) || 50117;
  let text = "端口 " + port + " · 本地计算 · 不调 LLM · （待连接）";
  if (env) {
    const keyText = env.hasKey
      ? "密钥 ✅"
      : "密钥 ❌（apps/.env 未配置该家 Key）";
    text =
      "端口 " +
      port +
      " · 本地计算 · 不调 LLM · 模型服务商 " +
      (env.provider || "—") +
      " · 模型 " +
      (env.model || "—") +
      " · " +
      keyText;
  }
  return (
    <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
      <span id="env-info">{text}</span>
    </footer>
  );
}

window.DemoUI.StatusPill = StatusPill;
window.DemoUI.PageIntro = PageIntro;
window.DemoUI.EnvFooter = EnvFooter;
