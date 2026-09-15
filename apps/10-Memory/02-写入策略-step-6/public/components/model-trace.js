/**
 * 职责：把两次模型调用的请求 / 响应原样贴出来——一次是 extractFacts（提取阶段），一次是 filterByContentDimensions（维度判定阶段）。
 * 数据流：filterDimensions 返回的 modelRequest / modelResponse（提取）+ dimensionsRequest / dimensionsResponse（维度判定）→ 卡片化展示。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.ModelTrace = function ModelTrace(props) {
    const extractReq = props.extractRequest;
    const extractRes = props.extractResponse;
    const dimReq = props.dimensionsRequest;
    const dimRes = props.dimensionsResponse;
    const skipped = props.skipped === true;

    return (
      <div className="space-y-3">
        <div className="border border-blue-300 bg-blue-50 rounded p-3 space-y-1">
          <p className="text-sm font-semibold text-blue-900">第一步 · 调大模型 · 提取（原始 request）</p>
          <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto bg-white rounded p-2">
            {JSON.stringify(extractReq, null, 2)}
          </pre>
        </div>
        <div className="border border-indigo-300 bg-indigo-50 rounded p-3 space-y-1">
          <p className="text-sm font-semibold text-indigo-900">第一步 · 调大模型 · 提取 · 响应（原始 response）</p>
          <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto bg-white rounded p-2">
            {JSON.stringify(extractRes, null, 2)}
          </pre>
        </div>

        {skipped ? (
          <div className="border border-gray-300 bg-gray-50 rounded p-3 text-xs text-gray-600">
            第三步 · 维度判定：两个维度开关都关闭，跳过这一次模型调用（前面置信度过的候选全部直接通过）。
          </div>
        ) : (
          <>
            <div className="border border-purple-300 bg-purple-50 rounded p-3 space-y-1">
              <p className="text-sm font-semibold text-purple-900">第三步 · 调大模型 · 维度判定 · 原始 request</p>
              <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto bg-white rounded p-2">
                {JSON.stringify(dimReq, null, 2)}
              </pre>
            </div>
            <div className="border border-pink-300 bg-pink-50 rounded p-3 space-y-1">
              <p className="text-sm font-semibold text-pink-900">第三步 · 调大模型 · 维度判定 · 响应（原始 response）</p>
              <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto bg-white rounded p-2">
                {JSON.stringify(dimRes, null, 2)}
              </pre>
            </div>
          </>
        )}
      </div>
    );
  };
})();
