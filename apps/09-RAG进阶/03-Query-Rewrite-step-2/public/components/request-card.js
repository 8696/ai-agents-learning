/**
 * 职责：请求参数卡、调用流程卡、失败红字、模型调用详情卡。
 * 数据流：lastRequest / steps / error / modelCall → 中性灰 / 过程卡 / 红卡 / 模型调用卡。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  function RequestCard(props) {
    const req = props.request;
    if (!req) {
      return <div className="text-sm text-gray-500">还没有发出请求。点上面的按钮后，这里显示你发出去的 URL 和 body。</div>;
    }
    return (
      <div className="bg-gray-50 text-gray-700 rounded p-3 space-y-1">
        <div className="text-xs font-medium">请求参数（你发出去的）</div>
        <div className="text-xs">方法 {req.method} · {req.url}</div>
        <pre className="whitespace-pre-wrap text-xs max-h-32 overflow-auto">{JSON.stringify(req.body, null, 2)}</pre>
      </div>
    );
  }

  function FlowCard(props) {
    const steps = props.steps || [];
    if (steps.length === 0) {
      return <div className="text-sm text-gray-500">调用流程会写在这里：点了哪一步、服务端做了什么、结果怎么回来。</div>;
    }
    return (
      <div className="border border-gray-300 bg-white rounded p-3">
        <div className="text-xs font-medium text-gray-700 mb-1">调用流程（系统事件）</div>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          {steps.map(function (step, i) {
            return <li key={i}>{step}</li>;
          })}
        </ol>
      </div>
    );
  }

  function ErrorCard(props) {
    if (!props.error) return null;
    return (
      <div className="border border-red-300 bg-red-50 rounded p-3 text-sm text-red-800">
        {props.error}
      </div>
    );
  }

  function ModelCallCard(props) {
    const call = props.modelCall;
    if (!call) {
      return (
        <div className="border border-dashed border-gray-300 rounded p-2 text-xs text-gray-500">
          还没点 HyDE 按钮。点了之后，这里展示发给大模型的提示词（Prompt）和参数：模型（model）、温度（temperature）、系统消息（system）、用户消息（user）。
        </div>
      );
    }
    const systemMsg = (call.messages || []).find(function (row) { return row.role === "system"; });
    const userMsg = (call.messages || []).find(function (row) { return row.role === "user"; });
    return (
      <div className="border border-blue-200 bg-blue-50 rounded p-2 space-y-2">
        <div className="text-xs font-medium text-blue-900">发给大模型的请求（协议 A · 对话补全 Chat Completions）</div>
        <p className="text-xs text-blue-800">
          方法 <code>chat.completions.create</code> · 模型服务商（provider）{call.provider} · 模型（model）{call.model} · 温度（temperature）{String(call.temperature)}
        </p>
        <div>
          <div className="text-xs font-medium text-gray-700">系统消息（system）</div>
          <pre className="whitespace-pre-wrap text-xs text-gray-800 bg-white rounded p-2 mt-1 max-h-40 overflow-auto">{systemMsg ? systemMsg.content : "（无）"}</pre>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-700">用户消息（user）</div>
          <pre className="whitespace-pre-wrap text-xs text-gray-800 bg-white rounded p-2 mt-1">{userMsg ? userMsg.content : "（无）"}</pre>
        </div>
        <details>
          <summary className="text-xs text-gray-600 cursor-pointer">完整入参 JSON</summary>
          <pre className="whitespace-pre-wrap text-xs text-gray-700 mt-1 max-h-40 overflow-auto">{JSON.stringify(call, null, 2)}</pre>
        </details>
      </div>
    );
  }

  DemoUI.RequestCard = RequestCard;
  DemoUI.FlowCard = FlowCard;
  DemoUI.ErrorCard = ErrorCard;
  DemoUI.ModelCallCard = ModelCallCard;
})();