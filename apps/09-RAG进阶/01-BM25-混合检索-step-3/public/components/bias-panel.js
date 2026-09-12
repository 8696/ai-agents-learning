/**
 * 职责：按问句偏置 α 的可操作面板 —— 跑 /api/search-bias → 采用建议 α → 用当前 α 跑加权融合看 Top-1。
 * 挂载：window.DemoUI.BiasPanel
 * 点了会发生什么：① 偏置检测 ② 可选「采用建议 α」写回共享滑块 ③ 独立请求跑混合验证期望卡。
 */
window.DemoUI = window.DemoUI || {};

window.DemoUI.BiasPanel = function BiasPanel({
  alpha,
  onApplyAlpha,
  normalize,
  presets,
  expected,
}) {
  const [question, setQuestion] = React.useState(presets.numbered);
  const [expectedCardId, setExpectedCardId] = React.useState(expected.numbered);
  const [biasStatus, setBiasStatus] = React.useState("⏸ 待跑");
  const [biasResult, setBiasResult] = React.useState(null);
  const [hybridStatus, setHybridStatus] = React.useState("⏸ 待跑");
  const [hybridResult, setHybridResult] = React.useState(null);

  function usePreset(kind) {
    setQuestion(presets[kind]);
    setExpectedCardId(expected[kind]);
    setBiasResult(null);
    setBiasStatus("⏸ 待跑");
    setHybridResult(null);
    setHybridStatus("⏸ 待跑");
  }

  async function runBias() {
    setBiasStatus("🔄 请求中");
    try {
      const response = await fetch("/api/search-bias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const json = await response.json();
      if (!json.ok) {
        setBiasStatus("❌ 错误 · " + (json.error || "未知"));
        return;
      }
      setBiasResult(json.result);
      setBiasStatus("✅ 完成");
    } catch (error) {
      setBiasStatus("❌ 错误 · " + String(error));
    }
  }

  async function runHybridWithCurrentAlpha() {
    setHybridStatus("🔄 请求中");
    try {
      const response = await fetch("/api/search-hybrid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, alpha, normalize, topK: 3 }),
      });
      const json = await response.json();
      if (!json.ok) {
        setHybridStatus("❌ 错误 · " + (json.error || "未知"));
        return;
      }
      setHybridResult(json.result);
      setHybridStatus("✅ 完成");
    } catch (error) {
      setHybridStatus("❌ 错误 · " + String(error));
    }
  }

  return React.createElement(
    "div",
    { className: "bg-gray-50 border border-gray-200 rounded p-3 space-y-3" },
    React.createElement(
      "div",
      { className: "text-sm font-semibold text-gray-800" },
      "按问题类型建议 α",
    ),
    React.createElement(
      "div",
      { className: "text-xs text-gray-600" },
      "选例子 → 跑偏置 → 采用建议 α → 用当前 α 跑混合。例子 A 期望 ",
      React.createElement("span", { className: "font-mono" }, expected.numbered),
      "；例子 B 期望 ",
      React.createElement("span", { className: "font-mono" }, expected.spoken),
      "。",
    ),
    React.createElement(
      "div",
      { className: "flex flex-wrap items-center gap-2" },
      React.createElement(
        "button",
        {
          className: "text-xs px-2 py-1 border border-gray-300 rounded bg-white",
          onClick: function () {
            usePreset("numbered");
          },
        },
        "例子 A（带货号）",
      ),
      React.createElement(
        "button",
        {
          className: "text-xs px-2 py-1 border border-gray-300 rounded bg-white",
          onClick: function () {
            usePreset("spoken");
          },
        },
        "例子 B（日常说法）",
      ),
      React.createElement("input", {
        className: "flex-1 min-w-[160px] border border-gray-300 rounded px-2 py-1 text-sm",
        value: question,
        onChange: function (e) {
          setQuestion(e.target.value);
        },
      }),
      React.createElement(
        "button",
        {
          className: "text-sm px-3 py-1 bg-purple-600 text-white rounded",
          onClick: runBias,
        },
        "跑偏置检测（/api/search-bias）",
      ),
      React.createElement(
        "button",
        {
          className: "text-sm px-3 py-1 bg-green-600 text-white rounded",
          onClick: runHybridWithCurrentAlpha,
        },
        "用当前 α 跑加权融合",
      ),
    ),
    React.createElement(
      "div",
      { className: "grid grid-cols-1 md:grid-cols-2 gap-3" },
      React.createElement(window.DemoUI.BiasCard, {
        status: biasStatus,
        result: biasResult,
        alpha: alpha,
        onApplyAlpha: onApplyAlpha,
      }),
      React.createElement(window.DemoUI.HybridCard, {
        title: "偏置后 · 用当前 α 的加权融合",
        status: hybridStatus,
        result: hybridResult,
        expectedCardId: expectedCardId,
      }),
    ),
  );
};
