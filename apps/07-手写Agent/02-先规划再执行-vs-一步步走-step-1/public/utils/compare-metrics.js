/**
 * 职责：把对照数字（模型调用次数 / 第一次 Act 前等待 / 计划对象）从两侧返回值算出来。
 * 数据流：左栏 JSON + 右栏 JSON → 三个对照字段。无 JSX。
 * 为什么单独成文件：对照数字不再由超级 /api/compare 打包返回，必须在浏览器侧用两次请求的结果现场算。
 */
window.DemoUtils = window.DemoUtils || {};
window.DemoUtils.buildComparison = function buildComparison(stepByStep, planAndExecute) {
  if (!stepByStep || !planAndExecute) return null;
  const planCalls = planAndExecute.summary
    ? (planAndExecute.summary.planCalls ?? planAndExecute.plannerIterations ?? 1)
    : 1;
  return {
    modelCallsA: stepByStep.summary.modelCalls,
    modelCallsB: planCalls,
    preActStepsA: 0,
    preActStepsB: 1,
    planExistsBeforeFirstActA: false,
    planExistsBeforeFirstActB: true,
  };
};
