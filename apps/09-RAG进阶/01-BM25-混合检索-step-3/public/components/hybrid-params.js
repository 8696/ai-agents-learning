/**
 * 职责：共享混合参数控件 —— α 滑块 + 「是否先拉齐」开关。
 * 挂载：window.DemoUI.HybridParams
 * 点了会发生什么：只改本地状态；要看排名变，须再到实验区点「跑加权融合」。
 */
window.DemoUI = window.DemoUI || {};

window.DemoUI.HybridParams = function HybridParams({ alpha, setAlpha, normalize, setNormalize }) {
  return React.createElement(
    "div",
    { className: "bg-white border border-gray-300 rounded p-3 space-y-2" },
    React.createElement(
      "div",
      { className: "text-sm font-semibold text-gray-800" },
      "共享参数：α 与是否拉齐",
    ),
    React.createElement(
      "div",
      { className: "text-xs text-gray-600" },
      "α = 向量权重；1−α = BM25 权重。改完后再点跑混合。",
    ),
    React.createElement(
      "label",
      { className: "flex flex-wrap items-center gap-2 text-xs text-gray-700" },
      React.createElement("span", { className: "font-mono shrink-0" }, "α = ", Number(alpha).toFixed(2)),
      React.createElement("input", {
        id: "alpha-slider",
        type: "range",
        min: "0",
        max: "1",
        step: "0.05",
        value: alpha,
        className: "flex-1 min-w-[160px]",
        onChange: function (e) {
          setAlpha(Number(e.target.value));
        },
      }),
      React.createElement("span", { className: "text-gray-500" }, "0=全 BM25 · 1=全向量"),
    ),
    React.createElement(
      "label",
      { className: "flex items-center gap-2 text-xs text-gray-700" },
      React.createElement("input", {
        id: "normalize-toggle",
        type: "checkbox",
        checked: Boolean(normalize),
        onChange: function (e) {
          setNormalize(e.target.checked);
        },
      }),
      "先 min-max 拉齐再加权（normalize）· 关掉可对照「硬加」翻车",
    ),
  );
};
