/**
 * 职责：需求 5 · overlap 三组对照卡（0 / 10% / 30%）。
 *
 * 数据流：App → POST /api/chunk/compare-overlap → 传入 OverlapCompareCard → 三栏对照表 + 库膨胀% 高亮。
 *
 * 挂 window.DemoUI.OverlapCompareCard。
 *
 * 拆文件原因：§5.3.8「单页也要拆组件」——overlap 对照是独立教学点，与中栏 Panel 不混在一起。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  /**
   * 单组数字行：overlap=0% / 10% / 30% 各一行。
   * 显示：百分比 / 实际 overlap 字符数 / 块数 / 总字符 / 估算嵌入次数 / 库膨胀百分比。
   * 库膨胀 ≥ 10% 标橙，≥ 30% 标红——给「overlap 越大库越胖」的肉眼信号。
   */
  function OverlapRow(props) {
    const row = props.row;
    const bloat = row.libBloatPercent;
    const bloatColor =
      bloat >= 30 ? "bg-red-100 text-red-800" : bloat >= 10 ? "bg-orange-100 text-orange-800" : "bg-green-100 text-green-800";
    return (
      <tr className="border-b border-gray-200">
        <td className="px-2 py-2 text-xs font-semibold text-gray-900">overlap = {row.overlapPercent}%</td>
        <td className="px-2 py-2 text-xs text-gray-700">{row.overlap} 字符</td>
        <td className="px-2 py-2 text-xs text-gray-900 font-mono">{row.stats.total}</td>
        <td className="px-2 py-2 text-xs text-gray-700 font-mono">{row.stats.totalChars}</td>
        <td className="px-2 py-2 text-xs text-gray-700 font-mono">{row.embedCalls}</td>
        <td className="px-2 py-2 text-xs">
          <span className={"px-1.5 py-0.5 rounded font-semibold " + bloatColor}>
            {bloat > 0 ? "+" + bloat + "%" : bloat + "%"}
          </span>
          <span className="text-gray-500 text-xs ml-1">{bloat > 0 ? "库膨胀" : "基准"}</span>
        </td>
      </tr>
    );
  }

  /**
   * 三组对照卡：表格 + 一句话提示。
   * 提示明确写出「30% 那组库膨胀 X%」+ 「库膨胀来自每块都调一次嵌入，块数越多账单越大」。
   */
  function OverlapCompareCard(props) {
    const { size, running, result, error } = props;
    if (!result) {
      return (
        <p className="text-xs text-gray-500">
          {error ? (
            <span className="text-red-700">跑失败：{error.error || error.message}。再点一次按钮重试。</span>
          ) : (
            "点上方「跑三组 overlap 对照」按钮——同一 size=" + size + " 字符，三组 overlap 同时跑一次。"
          )}
        </p>
      );
    }
    const row30 = result.rows.find(function (r) { return r.overlapPercent === 30; });
    return (
      <div className="space-y-2">
        <div className="text-xs text-gray-700">
          size = <b>{result.size}</b> 字符 · 同一份文档 · 三组 overlap 各跑一次 · 下面是「块数 / 总字符 / 嵌入次数 / 库膨胀%」对照：
        </div>
        <table className="w-full border border-gray-200 rounded">
          <thead className="bg-gray-50">
            <tr className="border-b border-gray-200">
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">overlap</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">实际字符</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">块数</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">总字符</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">嵌入调用次数</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">库膨胀（vs overlap=0%）</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map(function (r) { return <OverlapRow key={r.overlapPercent} row={r} />; })}
          </tbody>
        </table>
        {row30 && row30.libBloatPercent > 0 ? (
          <div className="bg-orange-50 border border-orange-300 rounded p-2 text-xs text-orange-800">
            ⚠ 30% 那组<b>库膨胀约 {row30.libBloatPercent}%</b>——块数变多 = 嵌入费用按比例涨 + 前 K 条更容易出现重复内容。
            经验值：固定长度切时 overlap 取 size 的 10%~20% 即可，30% 一般是「切法该换了」的信号。
          </div>
        ) : null}
        <div className="text-xs text-gray-600">
          观察：overlap=0% / 10% / 30% 三组，块数 + 嵌入调用次数按比例涨——overlap 不是免费的。
        </div>
      </div>
    );
  }

  DemoUI.OverlapCompareCard = OverlapCompareCard;
  window.DemoUI = DemoUI;
})();