/**
 * 职责：step-3 · B 件 · 5 种文档类型选择器组件——radio + 推荐参数提示行。
 * 挂 window.DemoUI.DocTypeSelector。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  function DocTypeSelector(props) {
    const { docType, applyDocType, currentLabel } = props;
    return (
      <div className="border border-gray-200 rounded p-2 bg-gray-50 space-y-1">
        <div className="text-xs font-semibold text-gray-700">step-3 · B 件 · 文档类型选策略</div>
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

  DemoUI.DocTypeSelector = DocTypeSelector;
  window.DemoUI = DemoUI;
})();