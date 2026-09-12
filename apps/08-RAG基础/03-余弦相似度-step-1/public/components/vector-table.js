/**
 * 职责：展示本步固定教学向量，让人先看见方向和长度再点打分。
 */
(function () {
  const DemoUI = (window.DemoUI = window.DemoUI || {});
  const ROWS = [
    ["问题（query）", "昨天买的杯子裂了，怎么退？", "[1, 0]"],
    ["短同向（short）", "运输破损可补发或退货。", "[1, 0]"],
    ["长同向（long）", "同一句 + 后面一长段免责（见上方原文）", "[10, 0]"],
    ["略偏（side）", "包装完好的商品支持 7 天无理由退货。", "[0.8, 0.6]"],
    ["无关（far）", "发票默认开个人抬头，对公请提供税号。", "[0, 1]"],
  ];

  DemoUI.VectorTable = function VectorTable() {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="text-gray-500">
              <th className="py-1 pr-3">卡片</th>
              <th className="py-1 pr-3">原文摘要</th>
              <th className="py-1">教学坐标（vector）</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(function (row) {
              return (
                <tr key={row[0]} className="border-t">
                  <td className="py-1 pr-3">{row[0]}</td>
                  <td className="py-1 pr-3 text-gray-700">{row[1]}</td>
                  <td className="py-1 font-mono">{row[2]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };
})();
