/**
 * 职责：step-3 · A 件 · 「怎么判断切得好不好」质量卡组件。两套切块参数并排对比 4 个观察维度。
 * 挂 window.DemoUI.QualityCard。
 *
 * 4 维度：
 *   半句话开头数  真实数（chunks.startsMidSentence 计数）
 *   内容纯度      unique 字符 / 总字符（粗略）— 越高越纯
 *   前 K 条重复度  topK 重叠 / topK 总字符（越低越好）
 *   最高分        模拟分数（mockTopScore）— 强调「同嵌入同问句才能比」
 */
(function () {
  const DemoUI = window.DemoUI || {};

  function pct(v) {
    return Math.round(v * 100) + "%";
  }

  function MetricRow(props) {
    const { label, valueA, valueB, hint, lowerIsBetter } = props;
    const numA = typeof valueA === "number" ? valueA : 0;
    const numB = typeof valueB === "number" ? valueB : 0;
    const aBetter = lowerIsBetter ? numA < numB : numA > numB;
    return (
      <div className="grid grid-cols-[120px_1fr_1fr] gap-2 text-xs py-1 border-b border-gray-100">
        <span className="text-gray-700">{label}</span>
        <span className={aBetter ? "text-green-700 font-semibold" : "text-gray-700"}>
          {typeof valueA === "string" ? valueA : (label === "内容纯度" || label === "前 K 条重复度" || label === "最高分（模拟）" ? pct(valueA) : valueA)}
          {aBetter ? " ✓" : ""}
        </span>
        <span className={!aBetter ? "text-green-700 font-semibold" : "text-gray-700"}>
          {typeof valueB === "string" ? valueB : (label === "内容纯度" || label === "前 K 条重复度" || label === "最高分（模拟）" ? pct(valueB) : valueB)}
          {!aBetter ? " ✓" : ""}
        </span>
        {hint ? <span className="col-span-3 text-xs text-gray-500 pl-1">{hint}</span> : null}
      </div>
    );
  }

  function QualityCard(props) {
    const { reportA, reportB, topK } = props;
    if (!reportA || !reportB) return null;
    return (
      <section className="bg-white shadow rounded p-4 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">step-3 · A 件 · 怎么判断切得好不好</h2>
        <p className="text-xs text-gray-500">同一份文档跑两套切块参数 → 4 个观察维度并排对比。✓ 标的是「这个维度更优」的那一栏。</p>
        <div className="grid grid-cols-[120px_1fr_1fr] gap-2 text-xs py-1 border-b border-gray-300">
          <span className="text-gray-700 font-semibold">观察维度</span>
          <span className="text-gray-700 font-semibold">参数 A · size={reportA.params.size} overlap={reportA.params.overlap}</span>
          <span className="text-gray-700 font-semibold">参数 B · size={reportB.params.size} overlap={reportB.params.overlap}</span>
        </div>
        <MetricRow label="块数" valueA={reportA.totalChunks} valueB={reportB.totalChunks} lowerIsBetter={false} hint="越多越细；越多越不一定越好（看检索需要）" />
        <MetricRow label="平均字符" valueA={reportA.avgChars} valueB={reportB.avgChars} lowerIsBetter={false} hint="平均块大小；太大丢细节 / 太小丢语义，看命中卡原文" />
        <MetricRow label="半句话开头数" valueA={reportA.midSentenceCount} valueB={reportB.midSentenceCount} lowerIsBetter={true} hint="切坏了的直接信号；这个越多 → 材料本身就是错的，提示词救不了" />
        <MetricRow label="内容纯度" valueA={reportA.purityScore} valueB={reportB.purityScore} lowerIsBetter={false} hint="粗略估计：unique 字符 / 总字符。主题越集中纯度越高" />
        <MetricRow label={"前 K=" + topK + " 条重复度"} valueA={reportA.topKRepeatRate} valueB={reportB.topKRepeatRate} lowerIsBetter={true} hint="前 K 条里 overlap 占的比例；越高说明 3 条材料其实只有 2 条信息" />
        <MetricRow label="最高分（模拟）" valueA={reportA.mockTopScore} valueB={reportB.mockTopScore} lowerIsBetter={false} hint="⚠ 模拟数字，不是真实嵌入分数；只有同一嵌入 + 同一问句 + 只改切块参数时这个对比才成立" />
        <div className="text-xs text-gray-500 pt-1">
          调参判断依据：<b>块数</b>看是否过细 / 过粗；<b>半句话开头数</b>必须少；<b>前 K 条重复度</b>必须低；<b>内容纯度</b>粗略看主题集中度。最高分要做决定必须用真实嵌入 + 真实问句——见模块 09 RAG 进阶。
        </div>
      </section>
    );
  }

  DemoUI.QualityCard = QualityCard;
  window.DemoUI = DemoUI;
})();