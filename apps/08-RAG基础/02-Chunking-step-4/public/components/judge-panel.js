/**
 * 职责：step-3 · 第 2 段 · 判断切得好不好——参数 A 和参数 B 左右并排 + 跑质量对比按钮 + 错误显示。
 *
 * 关键：参数 A 和参数 B 在同一卡片里左右并排，肉眼对照「同一份文档 + 两套参数 → 哪个更好」。
 * 之前参数 A 引用左栏滑块（左栏在 #output 区域），物理位置隔了 200 行——这是上版的逻辑断点。
 *
 * 挂 window.DemoUI.JudgePanel。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  function ParamColumn(props) {
    const { label, color, size, setSize, overlap, setOverlap } = props;
    return (
      <div className={"border rounded p-2 space-y-2 " + color}>
        <div className="text-xs font-semibold text-gray-700">{label}</div>
        <label className="text-xs text-gray-700 space-y-1 block">
          <span>size（字符）</span>
          <input
            type="number"
            min="50"
            max="3000"
            step="50"
            value={size}
            onChange={function (e) { setSize(Number(e.target.value) || 300); }}
            className="w-full border border-gray-300 rounded p-1"
          />
        </label>
        <label className="text-xs text-gray-700 space-y-1 block">
          <span>overlap（字符）</span>
          <input
            type="number"
            min="0"
            max="500"
            step="10"
            value={overlap}
            onChange={function (e) { setOverlap(Number(e.target.value) || 30); }}
            className="w-full border border-gray-300 rounded p-1"
          />
        </label>
      </div>
    );
  }

  function JudgePanel(props) {
    const {
      running, error, onRun,
      sizeA, setSizeA, overlapA, setOverlapA,
      sizeB, setSizeB, overlapB, setOverlapB,
    } = props;
    return (
      <div className="border-l-4 border-purple-400 bg-purple-50 px-3 py-2 space-y-3 rounded">
        <div className="text-sm font-semibold text-gray-900">第 2 段 · 判断切得好不好（参数 A vs B → 4 个观察维度对比）</div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ParamColumn
            label="参数 A · size / overlap"
            color="border-blue-300 bg-blue-50"
            size={sizeA}
            setSize={setSizeA}
            overlap={overlapA}
            setOverlap={setOverlapA}
          />
          <ParamColumn
            label="参数 B · size / overlap"
            color="border-orange-300 bg-orange-50"
            size={sizeB}
            setSize={setSizeB}
            overlap={overlapB}
            setOverlap={setOverlapB}
          />
        </div>

        <button
          type="button"
          disabled={running}
          onClick={onRun}
          className="bg-purple-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
        >
          跑质量对比（参数 A size={sizeA} overlap={overlapA} · 参数 B size={sizeB} overlap={overlapB}）
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

  DemoUI.JudgePanel = JudgePanel;
  window.DemoUI = DemoUI;
})();