/**
 * 职责：流水线步骤外壳 —— 每一步展示「输入 / 做了什么 / 输出」三栏。
 *
 * 为什么单独成文件：4 步流水线每一步都长一样（输入 → 操作 → 输出），抽成组件让 4 步视觉一致。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.PipelineStep = function PipelineStep(props) {
    const tone = props.tone || "border-gray-300 bg-gray-50";
    const icon = props.icon || "";
    const title = props.title || "";
    const inputText = props.inputText || "";
    const didText = props.didText || "";
    const outputLabel = props.outputLabel || "输出";
    return (
      <div className={"border-2 rounded p-3 space-y-2 " + tone}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{icon} {title}</p>
          {props.headerExtra}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <div className="border border-gray-200 rounded p-2 bg-white">
            <p className="font-mono text-gray-500 mb-1">输入</p>
            <p className="text-gray-800 whitespace-pre-wrap">{inputText}</p>
          </div>
          <div className="border border-gray-200 rounded p-2 bg-white">
            <p className="font-mono text-gray-500 mb-1">做了什么</p>
            <p className="text-gray-800 whitespace-pre-wrap">{didText}</p>
          </div>
          <div className="border border-gray-200 rounded p-2 bg-white">
            <p className="font-mono text-gray-500 mb-1">{outputLabel}</p>
            {props.output}
          </div>
        </div>
      </div>
    );
  };
})();