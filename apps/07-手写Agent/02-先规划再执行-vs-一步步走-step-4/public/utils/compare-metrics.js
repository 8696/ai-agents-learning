/**
 * 职责：短/长 × A/B 对照数字在浏览器现场算（模型调用 / 步数 / 总耗时 / 是否值得规划）。
 * 数据流：最多四次独立请求的 JSON → 短卡 + 长卡。无 JSX。
 * 为什么单独成文件：禁止服务端一个 handler 打包四条再返回对照。
 */
window.DemoUtils = window.DemoUtils || {};
window.DemoUtils.sumCost = function sumCost(tr) {
  if (!tr || !tr.length) return 0;
  return tr.reduce(function (s, r) { return s + (r.costMs || 0); }, 0);
};
window.DemoUtils.buildPair = function buildPair(a, b, task) {
  if (!a || !b) return null;
  const aSteps = a.trajectory.reduce(function (s, r) { return s + r.act.length; }, 0);
  return {
    task: task,
    a: {
      rounds: a.summary.rounds,
      modelCalls: a.summary.modelCalls,
      stepCount: aSteps,
      totalMs: window.DemoUtils.sumCost(a.trajectory),
      stoppedReason: a.stoppedReason,
    },
    b: {
      plans: b.plannerIterations,
      stepCount: b.executeTrace.length,
      totalMs: window.DemoUtils.sumCost(b.executeTrace),
    },
    worthReplan: b.plannerIterations < a.summary.modelCalls,
  };
};
window.DemoUtils.buildComparison = function buildComparison(shortA, shortB, longA, longB) {
  const short = window.DemoUtils.buildPair(shortA, shortB, shortA && shortA.task);
  const long = window.DemoUtils.buildPair(longA, longB, longA && longA.task);
  if (!short && !long) return null;
  return {
    short: short,
    long: long,
    shortWorthReplan: short ? short.worthReplan : null,
    longWorthReplan: long ? long.worthReplan : null,
  };
};
