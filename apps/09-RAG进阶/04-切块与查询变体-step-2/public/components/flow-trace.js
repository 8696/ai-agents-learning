/**
 * 职责：把模型请求和模型响应完整打到页面上，让学习者看见「实际发给模型的消息」和
 *       「模型实际返回的完成」。配套 §5.3.2 6 项里「请求参数 / 调用流程 / 响应结果」三件套。
 * 数据流：props.modelRequest + props.modelResponse → 两块可展开的 details/summary 卡。
 * 颜色：高对比绿底（请求）/ 蓝底（响应）；文案中文为主、术语中文（English）。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  function usageLine(usage) {
    if (!usage) return null;
    const p = usage.promptTokens ?? "?";
    const c = usage.completionTokens ?? "?";
    const t = usage.totalTokens ?? "?";
    return (
      <p className="text-xs text-gray-700">
        Token 消耗（Token Usage）· 提示词 prompt {p} · 答复 completion {c} · 合计 total {t}
      </p>
    );
  }

  DemoUI.FlowTrace = function FlowTrace(props) {
    const req = props.modelRequest;
    const resp = props.modelResponse;
    if (!req || !resp) return null;

    return (
      <div className="space-y-3">
        {/* 模型请求（调大模型 · 请求参数） */}
        <details
          id="trace-model-request"
          className="border border-blue-300 bg-blue-50 rounded p-3"
          open
        >
          <summary className="text-sm font-semibold text-blue-900 cursor-pointer">
            调大模型 · 请求参数（Model Request）
          </summary>
          <div className="text-xs space-y-2 mt-2">
            <p className="text-gray-700">
              模型（model）：{req.model} · 温度（temperature）：{req.temperature} ·
              协议 A（OpenAI Chat Completions · POST /v1/chat/completions）
            </p>
            <p className="text-gray-600">
              下面的 messages 是服务端实际送给模型的提示词（Prompt）。可以对照右栏「将喂给模型的父块」看清是哪些上下文被塞进了哪条 message。
            </p>
            <ol className="space-y-2 list-decimal pl-5">
              {req.messages.map(function (msg, idx) {
                const roleLabel =
                  msg.role === "system"
                    ? "系统（system）· 给模型的指令"
                    : msg.role === "user"
                      ? "用户（user）· 拼好的整条问句 + 父块全文"
                      : "助手（assistant）· 历史答复（本步不会真用）";
                return (
                  <li
                    key={idx}
                    className="bg-white border border-blue-200 rounded p-2 space-y-1"
                  >
                    <p className="font-mono text-xs text-blue-800">
                      messages[{idx}] · role = "{msg.role}"
                    </p>
                    <p className="text-xs text-gray-700">{roleLabel}</p>
                    <pre className="whitespace-pre-wrap text-xs text-gray-900 bg-gray-50 rounded p-2 border border-gray-200">
                      {msg.content}
                    </pre>
                  </li>
                );
              })}
            </ol>
          </div>
        </details>

        {/* 模型响应（调大模型 · 响应结果） */}
        <details
          id="trace-model-response"
          className="border border-green-300 bg-green-50 rounded p-3"
          open
        >
          <summary className="text-sm font-semibold text-green-900 cursor-pointer">
            调大模型 · 响应结果（Model Response）
          </summary>
          <div className="text-xs space-y-2 mt-2">
            <p className="text-gray-700">
              停止原因（finish_reason）：{resp.finishReason} · 本步期望 stop；其他值（length / tool_calls / content_filter）都意味着生成没按预期走完。
            </p>
            <p className="text-gray-700">答复正文（content）：</p>
            <pre className="whitespace-pre-wrap bg-white border border-green-200 rounded p-2 text-sm text-gray-900">
              {resp.content}
            </pre>
            {usageLine(resp.usage)}
          </div>
        </details>
      </div>
    );
  };
})();