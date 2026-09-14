/**
 * 职责：请求参数卡 + 调用流程卡 + 失败红字 + 模型调用详情卡（生成侧用）。
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
      return <div className="text-sm text-gray-500">调用流程会写在这里。</div>;
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

  function PromptCard(props) {
    const prompt = props.prompt;
    if (!prompt) {
      return (
        <div className="border border-dashed border-gray-300 rounded p-2 text-xs text-gray-500">
          还没跑生成。点了之后，这里展示拼给大模型的完整 prompt（system + user 三段）。
        </div>
      );
    }
    return (
      <div className="border border-blue-200 bg-blue-50 rounded p-3 space-y-3">
        <div className="text-sm font-medium text-blue-900">完整 Prompt（生成侧）</div>
        <div>
          <div className="text-xs font-medium text-gray-700">system（系统消息）</div>
          <pre className="whitespace-pre-wrap text-xs text-gray-800 bg-white rounded p-2 mt-1 max-h-40 overflow-auto">{prompt.system}</pre>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-700">user（用户消息 · 三段：原话 / 内部检索词 / top-K 切块）</div>
          <pre className="whitespace-pre-wrap text-xs text-gray-800 bg-white rounded p-2 mt-1 max-h-80 overflow-auto">{prompt.user}</pre>
        </div>
      </div>
    );
  }

  function AnswerCard(props) {
    const answer = props.answer;
    if (!answer) {
      return (
        <div className="border border-dashed border-gray-300 rounded p-2 text-xs text-gray-500">
          还没跑生成。点了之后，这里展示模型答（末尾用 [id=xxx] 引用切块）。
        </div>
      );
    }
    return (
      <div className="border border-green-200 bg-green-50 rounded p-3 space-y-2">
        <div className="text-sm font-medium text-green-900">模型答（末尾 <code>[id=xxx]</code> 引用切块）</div>
        <pre className="whitespace-pre-wrap text-sm text-gray-800 bg-white rounded p-3 max-h-80 overflow-auto">{answer}</pre>
        <p className="text-xs text-green-800">
          注意：引用到的 <code>[id=xxx]</code> 对应检索到的 top-K 切块。点 <code>[id=xxx]</code> 回溯（demo 未做跳转；按 id 到 8 个切块里查）。
        </p>
      </div>
    );
  }

  DemoUI.RequestCard = RequestCard;
  DemoUI.FlowCard = FlowCard;
  DemoUI.ErrorCard = ErrorCard;
  DemoUI.PromptCard = PromptCard;
  DemoUI.AnswerCard = AnswerCard;
})();