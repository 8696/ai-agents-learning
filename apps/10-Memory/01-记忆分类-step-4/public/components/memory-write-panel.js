/**
 * 职责：用户记忆管理面板 —— 给一句用户原话，调模型判类，按 3 道把关写入 facts.json。
 *
 * 数据流：sentence → POST /api/classify { sentence, persist: true } → 展示「归类 + 写入决策（写没写 / 为什么 / key）」。
 *
 * 谁在用：step-4 主页面的「用户记忆管理」section。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.MemoryWritePanel = function MemoryWritePanel(props) {
    const onSubmit = props.onSubmit;
    const onDeleteFact = props.onDeleteFact;
    const lastResult = props.lastResult || null;
    const facts = props.facts || [];
    const busy = Boolean(props.busy);

    function submit(event) {
      event.preventDefault();
      const input = document.getElementById("memory-write-input");
      if (input && onSubmit) onSubmit(input.value);
    }

    function renderFact(f) {
      const tone = f.memoryType === "情景记忆" ? "border-amber-300 bg-amber-50" : "border-blue-300 bg-blue-50";
      return (
        <li key={f.key} className={"border rounded p-2 text-xs space-y-0.5 " + tone}>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <p>
                <span className="font-mono">{f.memoryType}</span>
                {" · "}
                <span className="font-mono">{f.term}</span>
              </p>
              <p className="text-gray-800">{f.sentence}</p>
              <p className="text-gray-500 text-xs">
                写入时刻：{new Date(f.recordedAt).toLocaleString("zh-CN")}
                {" · "}key：<code className="bg-white px-1 rounded">{f.key}</code>
              </p>
            </div>
            <button
              type="button"
              className="text-red-600 hover:text-red-800 disabled:opacity-50 shrink-0"
              disabled={busy}
              onClick={function () { if (onDeleteFact) onDeleteFact(f.key); }}
              title={"删除这条事实（key=" + f.key + "）"}
            >
              删除
            </button>
          </div>
        </li>
      );
    }

    return (
      <section id="memory-write-panel" className="bg-blue-50 border border-blue-300 rounded p-4 space-y-3">
        <p className="text-sm font-semibold text-blue-900">
          用户记忆管理（语义 / 情景事实库） · 当前 {facts.length} 条
        </p>
        <p className="text-xs text-blue-800">
          给一句用户原话 → 调模型判四类记忆 + 短期/长期 → 按 3 道把关（语义/长期 + 事实 + 不重复）写入 facts.json。程序性规则不在这里管（见上方程序性常驻区）。
        </p>
        {facts.length === 0 ? (
          <p className="text-xs text-gray-500">（事实库是空的 —— 输入一句话让它写第一条）</p>
        ) : (
          <div>
            <p className="text-xs text-gray-600 mb-1">↓ 当前事实库列表：</p>
            <ul className="space-y-1 max-h-40 overflow-auto">
              {facts.map(renderFact)}
            </ul>
          </div>
        )}
        <form onSubmit={submit} className="flex gap-2 items-center">
          <input
            id="memory-write-input"
            type="text"
            className="flex-1 border border-blue-300 rounded px-2 py-1 text-xs bg-white"
            placeholder="输入一句用户原话（如：我们组改用 Vue 3 了）"
            disabled={busy}
          />
          <button
            type="submit"
            className="bg-blue-600 text-white text-xs px-3 py-1 rounded disabled:opacity-50"
            disabled={busy}
          >
            分类并写入（POST /api/classify）
          </button>
        </form>
        {lastResult ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-blue-900">最近一次写入结果</p>
            <div className="border border-blue-200 bg-white rounded p-2 text-xs space-y-1">
              <p>
                <span className="font-mono">原话：</span>{lastResult.sentence}
              </p>
              <p>
                <span className="font-mono">归入：</span>
                <span className="font-semibold">{lastResult.classification && lastResult.classification.memoryType}</span>
                {" · "}
                <span className="font-mono">期限：</span>
                <span className="font-semibold">{lastResult.classification && lastResult.classification.term}</span>
              </p>
              <p>
                <span className="font-mono">理由：</span>{lastResult.classification && lastResult.classification.reason}
              </p>
              {lastResult.persistence ? (
                <p>
                  <span className="font-mono">写入决策：</span>
                  {lastResult.persistence.written
                    ? "✅ 已写进 facts.json（key=" + (lastResult.persistence.key || "?") + "）"
                    : "🚫 没写盘 —— " + (lastResult.persistence.reason || "")}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    );
  };
})();