/**
 * 职责：把对照数字从左栏一步步走 + 右栏已执行结果现场算。没跑齐两侧就不渲染。
 * 数据流：stepByStep JSON + executed plan JSON → 对照字段。无 JSX。
 */
window.DemoUtils = window.DemoUtils || {};
window.DemoUtils.buildComparison = function buildComparison(stepByStep, planExecuted) {
  if (!stepByStep || !planExecuted || planExecuted.status !== "executed") return null;
  const planCalls = planExecuted.plannerIterations ?? 1;
  const versions = planExecuted.plannerIterations ?? (planExecuted.plans ? planExecuted.plans.length : 1);
  const failures = (planExecuted.executeTrace || []).filter(function (s) { return s.result && s.result.ok === false; }).length;
  return {
    modelCallsA: stepByStep.summary.modelCalls,
    modelCallsB: planCalls,
    preActStepsA: 0,
    preActStepsB: 1,
    planExistsBeforeFirstActA: false,
    planExistsBeforeFirstActB: true,
    replannerTriggered: versions > 1,
    planVersions: versions,
    toolFailures: failures,
    variantETriggered: failures > 0,
  };
};
