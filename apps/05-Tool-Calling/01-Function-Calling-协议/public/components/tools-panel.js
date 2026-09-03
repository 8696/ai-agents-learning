/**
 * 职责：Registry 卡片列表 —— 把「模型这一轮能看到的工具清单」摊开给人看。
 * 数据流：GET /tools → [{ name, description, jsonSchema }] → 本组件。
 *
 * 为什么单独成文件：只有总览页用它；场景页不需要，免得每页都加载一份无关 JSX。
 * 挂载：window.DemoUI.ToolsPanel
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  function ToolsPanel({ tools }) {
    return (
      <div className="text-sm">
        <div className="font-semibold mb-1">Tool Registry（共 {tools.length} 个）</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {tools.map(function (t) {
            return (
              <div key={t.name} className="border border-gray-200 rounded p-2 text-xs space-y-1">
                {/* name：模型在 tool_call 里回给我们的就是这个字符串，服务端拿它查 Registry */}
                <div className="font-mono font-semibold">{t.name}</div>
                {/* description：模型判断「什么时候该调我」的唯一依据，写含糊就会乱调 */}
                <div className="text-gray-600">{t.description}</div>
                {/* 默认折叠：schema 比较长，想看参数约束再展开 */}
                <details>
                  <summary className="cursor-pointer text-gray-500">JSON Schema（Zod 派生）</summary>
                  {/* 这份 schema 由服务端 Zod 定义转出来，同一份契约同时用于「告诉模型」和「校验模型」 */}
                  <pre className="whitespace-pre-wrap bg-gray-50 p-1 rounded mt-1 max-h-32 overflow-auto">
                    {JSON.stringify(t.jsonSchema, null, 2)}
                  </pre>
                </details>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  window.DemoUI.ToolsPanel = ToolsPanel;
})();
