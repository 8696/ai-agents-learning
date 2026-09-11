/**
 * 职责：step-3 · A 件 · 第二套切块参数面板（sizeB / overlapB + 跑对比按钮 + 错误显示）。
 * 抽出来避免 index.html 超 400 行（§5.3.8 行数硬约束）。
 * 挂 window.DemoUI.CompareParamsPanel。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  function CompareParamsPanel(props) {
    const { running, error, onRun, sizeB, setSizeB, overlapB, setOverlapB } = props;
    return (
      <div className="border border-gray-200 rounded p-2 bg-gray-50 space-y-2">
        <div className="text-xs font-semibold text-gray-700">step-3 · A 件 · 第二套切块参数（对比用）</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs text-gray-700 space-y-1 block">
            <span>参数 B · size（字符）</span>
            <input
              type="number"
              min="50"
              max="3000"
              step="50"
              value={sizeB}
              onChange={function (e) { setSizeB(Number(e.target.value) || 800); }}
              className="w-full border border-gray-300 rounded p-1"
            />
          </label>
          <label className="text-xs text-gray-700 space-y-1 block">
            <span>参数 B · overlap（字符）</span>
            <input
              type="number"
              min="0"
              max="500"
              step="10"
              value={overlapB}
              onChange={function (e) { setOverlapB(Number(e.target.value) || 80); }}
              className="w-full border border-gray-300 rounded p-1"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={running}
          onClick={onRun}
          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
        >
          跑质量对比（参数 A vs B · 4 维度观察）
        </button>
        {error ? (
          <div className="border border-red-300 bg-red-50 text-red-700 text-xs rounded p-2 space-y-1">
            <div>错误：{error.error}</div>
            {error.hint ? <div>提示：{error.hint}</div> : null}
            {error.status ? <div>状态：HTTP {error.status}</div> : null}
          </div>
        ) : null}
      </div>
    );
  }

  DemoUI.CompareParamsPanel = CompareParamsPanel;
  window.DemoUI = DemoUI;
})();