/**
 * 职责：输出区三块：请求参数 / 调用流程 / 响应结果，对应最近一次操作。
 *       合并版支持三 mode：raw（无 K 无阈值）/ topk（K 截断）/ threshold（K + 阈值）。
 */
(function () {
  const DemoUI = (window.DemoUI = window.DemoUI || {});

  DemoUI.OutputCards = function OutputCards(props) {
    const last = props.last;
    if (!last) {
      return (
        <p className="text-sm text-gray-500">
          还没打分。先看教学向量，再分别点三把尺子。空态也要有这句话。
        </p>
      );
    }
    return (
      <div className="space-y-3">
        <div className="bg-gray-50 text-gray-700 rounded p-3 text-xs space-y-1">
          <div className="font-medium">请求参数（我发出去的）</div>
          <div>端点 {last.url}</div>
          <pre className="whitespace-pre-wrap max-h-32 overflow-auto">
            {JSON.stringify(last.body, null, 2)}
          </pre>
        </div>
        <div className="border border-gray-300 bg-white rounded p-3 text-xs space-y-1">
          <div className="font-medium">调用流程（系统事件）</div>
          <ol className="list-decimal pl-4 space-y-1">
            <li>浏览器 POST 本侧 URL，body 带 k 与 threshold 时服务端用它们；body 空时默认行为由路由决定。</li>
            <li>路由校验 K 与 threshold → <code>scoreVectors</code> 按本侧尺子逐张打分。</li>
            <li>按「越大越近」或「越小越近」全表排序 → 截前 K → topK / dropped。</li>
            <li>若传阈值：取 topK[0].score = maxScore → 按尺子方向比阈值 → decision + abstainReason。</li>
            <li>判定「短 vs 长」按全表算（不是按 topK），避免「长被截掉就把长判输」。</li>
          </ol>
          <div className="text-gray-500">HTTP {last.status}</div>
        </div>
        <div
          className={
            last.ok
              ? "bg-green-50 border border-green-300 rounded p-3 text-xs space-y-1"
              : "bg-red-50 border border-red-300 rounded p-3 text-xs space-y-1"
          }
        >
          <div className="font-medium">响应结果（终态）</div>
          <pre className="whitespace-pre-wrap max-h-48 overflow-auto">
            {JSON.stringify(last.data, null, 2)}
          </pre>
          {last.ok && last.data && Array.isArray(last.data.topK) ? (
            <div className="text-xs text-gray-700 space-y-1">
              <div>
                topK 共 {last.data.topK.length} 条 · dropped 共{" "}
                {Array.isArray(last.data.dropped) ? last.data.dropped.length : 0} 条
              </div>
              {last.data.decision ? (
                <div>
                  decision：{last.data.decision}（{last.data.decision === "answer" ? "阈值够" : "maxScore " + last.data.maxScore.toFixed(4) + " 未达阈值 " + last.data.threshold.toFixed(4)}）
                </div>
              ) : null}
              <div>判定（按全表，不按 topK）：{last.data.判定 || "—"}</div>
            </div>
          ) : null}
        </div>
      </div>
    );
  };
})();