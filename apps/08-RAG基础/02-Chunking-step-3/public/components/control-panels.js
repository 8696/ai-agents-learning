/**
 * 职责：第 1 段 · 切块对比（文档类型 + 输入文本 + 加载按钮）。
 * 抽出来避免 index.html 超 400 行。
 * 挂 window.DemoUI.ChunkingControlPanel。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  function ChunkingControlPanel(props) {
    const { docType, applyDocType, currentLabel, text, setText, busy, loadLongDoc, loadDefaultDoc } = props;
    return (
      <div className="border-l-4 border-blue-400 bg-blue-50 px-3 py-2 space-y-3 rounded">
        <div className="text-sm font-semibold text-gray-900">第 1 段 · 切块对比（看左 / 中 / 右 三栏怎么切）</div>
        <DocTypeSelectorLite
          docType={docType}
          applyDocType={applyDocType}
          currentLabel={currentLabel}
        />
        <label className="text-xs text-gray-700 space-y-1 block">
          <span>输入文本（Markdown · 切块对比用）</span>
          <textarea
            rows={6}
            value={text}
            onChange={function (e) { setText(e.target.value); }}
            className="w-full border border-gray-300 rounded p-2 font-mono text-xs"
          />
        </label>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            disabled={busy}
            onClick={loadLongDoc}
            className="border border-orange-300 bg-orange-50 px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            加载超长示例（8000 字一节 · 看兜底再切）
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={loadDefaultDoc}
            className="border border-gray-300 px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            加载默认示例
          </button>
        </div>
        <div className="text-xs text-gray-600">
          → 跑切块：直接点下面 <b>左 / 中 / 右</b> 三栏各自的「跑」按钮。三栏代码是独立的（fixed / structure / faq），不是同一个接口打包。
        </div>
      </div>
    );
  }

  function DocTypeSelectorLite(props) {
    const { docType, applyDocType, currentLabel } = props;
    return (
      <div className="border border-gray-200 rounded p-2 bg-gray-50 space-y-1">
        <div className="text-xs font-semibold text-gray-700">选文档类型 → 自动用对应示例 + 推荐参数</div>
        <div className="flex flex-wrap gap-2 text-xs">
          <label className="flex items-center gap-1">
            <input type="radio" name="docType" value="handbook" checked={docType === "handbook"} onChange={function () { applyDocType("handbook"); }} />
            <span>长手册</span>
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="docType" value="faq" checked={docType === "faq"} onChange={function () { applyDocType("faq"); }} />
            <span>FAQ</span>
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="docType" value="contract" checked={docType === "contract"} onChange={function () { applyDocType("contract"); }} />
            <span>法规条款</span>
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="docType" value="minutes" checked={docType === "minutes"} onChange={function () { applyDocType("minutes"); }} />
            <span>会议纪要</span>
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="docType" value="prose" checked={docType === "prose"} onChange={function () { applyDocType("prose"); }} />
            <span>连续散文</span>
          </label>
        </div>
        <p className="text-xs text-gray-500">{currentLabel || ""}</p>
      </div>
    );
  }

  DemoUI.ChunkingControlPanel = ChunkingControlPanel;
  DemoUI.DocTypeSelectorLite = DocTypeSelectorLite;
  window.DemoUI = DemoUI;
})();