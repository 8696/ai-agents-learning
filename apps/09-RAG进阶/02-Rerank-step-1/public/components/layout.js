/**
 * 职责：页头状态、教学说明、页脚环境信息。挂 window.DemoUI。
 * 颜色：说明区白底；核心教学点黄卡。
 */
(function () {
  const DemoUI = (window.DemoUI = window.DemoUI || {});

  DemoUI.StatusPill = function StatusPill(props) {
    const map = {
      idle: { text: "⏸ 待连接", cls: "bg-gray-200 text-gray-700" },
      loading: { text: "🔄 请求中", cls: "bg-blue-100 text-blue-800" },
      done: { text: "✅ 完成", cls: "bg-green-100 text-green-800" },
      error: { text: "❌ 错误", cls: "bg-red-100 text-red-800" },
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
          本页只演示：<b>粗召回从整库捞一批切块（Chunk），精排只给这批改顺序</b>。
          上面先展示服务端知识库；不要在页面自己编切块。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>打开页面：请求 <code>/api/corpus</code>，看见服务端那 8 个切块。</li>
          <li>点「从整库捞候选」：只数「退 / 天」这类政策热词，特例会上桌但通常不第一。</li>
          <li>点「给桌上的候选打精排分」：真调模型，把问句和每段正文成对看，再改顺序。</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-2 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <p className="text-sm font-semibold text-gray-900">
            粗召回决定谁上桌；精排决定谁坐主位。桌上没有的，精排变不出来。
          </p>
          <p className="text-xs text-gray-700">
            默认问句「超过 7 天、盒子没拆」：热词召回会把「七天无理由」推到前面；
            精排才该看见「没拆 + 超过」，把「未拆封超期特例」抬上来。
          </p>
        </div>
      </section>
    );
  };

  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env;
    const port = env && env.port ? env.port : 50092;
    const provider = env && env.provider ? env.provider : "（待连接）";
    const model = env && env.model ? env.model : "（待连接）";
    const keyText = !env
      ? "密钥 （待连接）"
      : env.hasKey
        ? "密钥 ✅"
        : "密钥 ❌（apps/.env 未配置该家密钥）";
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {port} · 协议 A（openai Chat Completions） · 模型服务商 {provider} · 模型 {model} · {keyText}
        </span>
      </footer>
    );
  };
})();
