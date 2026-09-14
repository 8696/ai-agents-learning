/**
 * 职责：评测集预览卡 —— 显示评测集大小 + 前 N 题预览（不含答案）。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  function EvalSetPanel(props) {
    const set = props.set;
    if (!set || !set.preview) {
      return <div className="text-sm text-gray-500">还没有拉到评测集。打开页面时应自动请求 GET /api/eval-set。</div>;
    }
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium text-gray-800">
          评测集（{set.size} 题）· 前 {Math.min(set.preview.length, 10)} 题预览（不含答案）
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-600">
              <th className="py-1 pr-2">题 id</th>
              <th className="py-1 pr-2">用户原句</th>
              <th className="py-1">分类</th>
            </tr>
          </thead>
          <tbody>
            {set.preview.slice(0, 10).map(function (q) {
              return (
                <tr key={q.id} className="border-t border-gray-200 align-top">
                  <td className="py-1 pr-2 font-mono text-gray-500">{q.id}</td>
                  <td className="py-1 pr-2">{q.query}</td>
                  <td className="py-1 text-gray-700">{q.category}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-gray-600">
          跑评测时服务端会逐题按"原句 / 改写"两个 mode 检索，对照 <code>targetIds</code> 判定命中。
        </p>
      </div>
    );
  }

  DemoUI.EvalSetPanel = EvalSetPanel;
})();