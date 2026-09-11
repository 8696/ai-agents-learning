/**
 * 职责：step-6 · K 件 · 综合对比收尾表格——5 个 step 各 demo 能力回顾表。
 * 挂 window.DemoUI.SummaryTable。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  function SummaryTable(props) {
    const { summary } = props;
    if (!summary) {
      return (
        <div className="border border-gray-200 bg-gray-50 rounded p-3 text-xs text-gray-500">
          加载中…
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div className="text-xs text-gray-500">
          {summary.module} · 共 {summary.steps.length} 个 demo · 每个独立运行（不同端口）
        </div>
        <div className="space-y-3">
          {summary.steps.map(function (step) {
            return (
              <section key={step.id} className="border border-gray-300 bg-white shadow rounded p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-gray-900">{step.name}</h3>
                  <div className="flex flex-wrap gap-2 items-center text-xs">
                    <span className="text-gray-500">端口</span>
                    <code className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-mono">{step.port}</code>
                    <a
                      href={step.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline"
                    >
                      打开 →
                    </a>
                  </div>
                </div>

                <div className="text-xs text-gray-700">
                  <div className="font-semibold text-gray-700">入口命令：</div>
                  <code className="block mt-1 px-2 py-1 bg-gray-100 rounded font-mono text-xs">
                    cd apps && {step.command}
                  </code>
                </div>

                <div>
                  <div className="text-xs font-semibold text-gray-700">教学点：</div>
                  <ul className="text-xs text-gray-700 list-disc pl-5 space-y-0.5 mt-1">
                    {step.teaches.map(function (t, i) {
                      return <li key={i}>{t}</li>;
                    })}
                  </ul>
                </div>

                <div className="text-xs text-gray-600">
                  <span className="font-semibold text-gray-700">什么时候用：</span> {step.whenToUse}
                </div>

                <div className="text-xs text-gray-400">{step.added}</div>
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  DemoUI.SummaryTable = SummaryTable;
  window.DemoUI = DemoUI;
})();