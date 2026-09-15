/**
 * 职责：程序性常驻区「管理面板」—— 程序性记忆的 CRUD 编辑器（黄框）。
 *
 * 数据流：rules (ProgramRule[]) → 渲染列表 + 「+ 新增」输入框 + 每条删除按钮。
 *
 * 跟 pipeline-program.js 的区别：
 *   - pipeline-program.js 是"本次请求里实际带进去的内容"（流水线第 2 列展示）
 *   - program-rules-panel.js 是"管理程序性规则本身"（增 / 删）
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.ProgramRulesPanel = function ProgramRulesPanel(props) {
    const rules = props.rules || [];
    const onAddRule = props.onAddRule;
    const onRemoveRule = props.onRemoveRule;
    const onClearUserMemory = props.onClearUserMemory;
    const busy = Boolean(props.busy);

    function submitAdd(event) {
      event.preventDefault();
      const input = document.getElementById("program-rule-input");
      if (input && onAddRule) onAddRule(input.value);
      if (input) input.value = "";
    }

    return (
      <section id="program-rules-panel" className="bg-yellow-50 border border-yellow-300 rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-yellow-900">
            程序性常驻区（全员规则管理） · {rules.length} 条
          </p>
          <button
            type="button"
            className="border border-red-300 text-red-700 text-xs px-2 py-1 rounded disabled:opacity-50"
            disabled={busy}
            onClick={onClearUserMemory}
            title="只清空用户事实库；程序性规则原封不动"
          >
            清空用户记忆（DELETE /api/facts）
          </button>
        </div>
        <p className="text-xs text-yellow-800">
          程序性记忆存在内存 Map 里，不属于任何具体用户。清空用户事实不会影响这里；改一条规则下一次回答立刻生效。
        </p>
        {rules.length === 0 ? (
          <p className="text-xs text-yellow-700">（当前没有任何全员规则 —— 这意味着模型回答不会有流程约束）</p>
        ) : (
          <ul className="space-y-1">
            {rules.map(function (r) {
              return (
                <li key={r.id} className="border border-yellow-200 bg-white rounded p-2 text-xs flex items-start gap-2">
                  <span className="font-mono text-yellow-700 mt-0.5">#{r.id}</span>
                  <span className="flex-1 text-gray-800">{r.text}</span>
                  <button
                    type="button"
                    className="text-red-600 hover:text-red-800 disabled:opacity-50"
                    disabled={busy}
                    onClick={function () { if (onRemoveRule) onRemoveRule(r.id); }}
                  >
                    删除
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <form onSubmit={submitAdd} className="flex gap-2 items-center">
          <input
            id="program-rule-input"
            type="text"
            className="flex-1 border border-yellow-300 rounded px-2 py-1 text-xs bg-white"
            placeholder="新增一条全员规则（如：回答先给结论再给代码）"
            disabled={busy}
          />
          <button
            type="submit"
            className="bg-yellow-600 text-white text-xs px-3 py-1 rounded disabled:opacity-50"
            disabled={busy}
          >
            + 新增（POST /api/program-rules）
          </button>
        </form>
      </section>
    );
  };
})();