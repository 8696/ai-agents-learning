/**
 * 职责：step-2 · C 件 · size × Top-K 撞预算条——把左栏的 size 与右侧 Top-K 拼成「材料估算词元」，
 * 与预算上限对照：超了红字 + 给出建议。
 * 挂 window.DemoUI.BudgetBar。
 *
 * 算法：
 *   平均每块估算词元 = (size 字符 × 中文占比假设 0.7 → 1.5 token/字) + (size × 0.3 → 1.3 token/词)
 *   材料估算 = 平均每块 × Top-K
 *   撞预算时红字 + 建议
 */
(function () {
  const DemoUI = window.DemoUI || {};

  /**
   * props:
   *   size        当前 size（字符，左栏滑块）
   *   topK        当前 Top-K（页面输入）
   *   budget      材料词元预算
   *   approxTokensMixed(text)  当前固定长度切块的总平均词元（来自 runFixed 的 result.stats）
   */
  function BudgetBar(props) {
    const { size, topK, budget, avgTokensPerChunk } = props;
    const tokensPerChunk = typeof avgTokensPerChunk === "number" && avgTokensPerChunk > 0 ? avgTokensPerChunk : Math.round(size * 0.7 * 1.5 + size * 0.3 * 1.3 / 4);
    const estimated = Math.round(tokensPerChunk * topK);
    const ratio = estimated / budget;
    const overBudget = estimated > budget;
    const ratioPct = Math.round(ratio * 100);
    return (
      <div className={"border rounded p-2 space-y-1 " + (overBudget ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50")}>
        <div className="text-xs font-semibold text-gray-700">step-2 · C 件 · size × Top-K 撞预算</div>
        <div className="text-xs text-gray-700">
          size <b>{size}</b> 字符 × Top-K <b>{topK}</b> ≈ <b>{estimated}</b> 估算词元 / 预算 <b>{budget}</b> = <b className={overBudget ? "text-red-700" : "text-gray-900"}>{ratioPct}%</b>
        </div>
        <div className="text-xs text-gray-600">
          块越大同样预算能塞的块越少——这就是为什么 size × Top-K 必须一起调。
        </div>
        {overBudget ? (
          <div className="text-xs text-red-700">
            ⚠ 超出预算 <b>{estimated - budget}</b> 词元；建议调小 size 或 Top-K。
          </div>
        ) : null}
      </div>
    );
  }

  DemoUI.BudgetBar = BudgetBar;
  window.DemoUI = DemoUI;
})();