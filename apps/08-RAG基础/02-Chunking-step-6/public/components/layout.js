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
          本页演示：把同一份售后 Markdown <b>用三种切法切成若干块</b>，
          <b>不调大模型</b>（纯本地文本操作），三栏并排比对切块结果。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>改 size / overlap → 点「跑固定长度切」→ POST /api/chunk/fixed → 服务端按字符切，每块带「是否半句话开头」标记</li>
          <li>点「跑按结构切」→ POST /api/chunk/structure → 服务端按 Markdown ## / 段落 / 句号递归切，每块带「在哪个边界切出来」</li>
          <li>点「跑 FAQ 切」→ POST /api/chunk/faq → 一问一答一块，每块自洽，不需要 overlap</li>
          <li>并排看每栏的块数 / 平均字数 / 半句话开头块数；切口处高亮重叠部分</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-2 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <ul className="text-xs text-gray-800 list-disc pl-5 space-y-1">
            <li>
              <b>size 取舍</b>：太大（左栏可见块数少、每块字数高）→ 一块混多个主题，向量被平均；太小 → 句子被腰斩、半句话开头块数上升。
            </li>
            <li>
              <b>overlap 取舍</b>：改 overlap 滑块时相邻两块「重叠字符」高亮；=0 时骑在切口上的句子要么完整要么断裂。
            </li>
            <li>
              <b>切法对照</b>：固定长度切 = 三行代码但靠运气；按结构切 = 切口落在语义边界、块自洽；FAQ 切 = 一问一答，overlap = 0 也合理。
            </li>
            <li>
              <b>可观察事实</b>：三栏各自一个请求，块数 / 平均字数 / 半句话块数立刻可对比；这就是「不看见切坏的样子，就只能把取舍背成口号」。
            </li>
          </ul>
          <div className="text-xs text-gray-600">
            观察：左侧 size / overlap 滑块；右侧三栏分别看「固定长度切 / 按结构切 / FAQ 切」。半句话开头块用红字标记；按结构切的块用「在哪个边界」徽标（## / 段落 / 句号 / faq-q）。
          </div>
        </div>
      </section>
    );
  }

  function EnvFooter(props) {
    const env = props.env;
    const port = (env && env.port) || 50077;
    const provider = env && env.provider ? env.provider : "（待连接）";
    const model = env && env.model ? env.model : "（待连接）";
    const keyOk = env && env.hasKey;
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {port} · 本地计算 · 不调 LLM · 模型服务商 {provider} · 模型 {model} · 密钥 {keyOk ? "✅" : "❌"}
        </span>
      </footer>
    );
  }

  DemoUI.StatusPill = StatusPill;
  DemoUI.PageIntro = PageIntro;
  DemoUI.EnvFooter = EnvFooter;
  window.DemoUI = DemoUI;
})();