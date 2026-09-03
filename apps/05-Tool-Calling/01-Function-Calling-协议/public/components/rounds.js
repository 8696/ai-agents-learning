/**
 * 职责：一轮对话的可视化 —— tool_call / tool_result / 终态回答。
 * 数据流：API 返回的 rounds[] → CaseResult → RoundCard → ToolCallCard / ToolResultCard。
 *
 * 为什么这几个组件放同一个文件：
 *   它们只服务「渲染一次 Function Calling 闭环」这一件事，总是一起出现、一起改。
 *   拆成四个文件反而要来回跳（§5.3.8：同层相关的小函数放一起，不要一函数一文件）。
 *
 * §5.3.10 颜色语义（本 Demo 各页一致，换页不用重新认）：
 *   用户输入   中性灰 bg-gray-50
 *   模型终态   绿系   bg-green-50 border-green-300
 *   协议事件   成功绿 / 失败红 / 中性白，徽标 text-xs rounded
 *
 * 挂载：window.DemoUI.CaseResult（页面只需要这一层入口，内部三个组件不外露）。
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  /**
   * 徽标：一眼看出某一步过没过。
   * 只做颜色映射，判断逻辑留在调用方 —— 同一个组件既能表示 Zod 也能表示执行。
   */
  function ResultTag({ ok, label }) {
    var cls = ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800";
    return <span className={"text-xs px-2 py-0.5 rounded " + cls}>{label}</span>;
  }

  /**
   * 模型发出的「调用请求」。注意：这只是请求，服务端还没执行。
   * arguments 是**字符串**（协议如此），所以这里要自己 JSON.parse：
   *   parse 成功 → 格式化展示，顺带证明模型给的是合法 JSON
   *   parse 失败 → 原样展示 + 红徽标，这正是「模型可能给坏数据」的现场证据
   */
  function ToolCallCard({ tc }) {
    var parsedArgs = null;
    var argsOk = true;
    try {
      parsedArgs = JSON.parse(tc.function.arguments);
    } catch (_e) {
      // 不抛：坏 JSON 本身就是要展示的教学内容
      argsOk = false;
    }
    return (
      <div className="border border-gray-300 rounded p-2 text-xs space-y-1 bg-white">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold">{tc.function.name}</span>
          {/* id 要显示：tool_result 靠它和 tool_call 配对，多个并行调用时尤其明显 */}
          <span className="text-gray-500">id={tc.id}</span>
          {!argsOk && <ResultTag ok={false} label="JSON.parse ✗" />}
          {argsOk && <ResultTag ok={true} label="JSON.parse ✓" />}
        </div>
        <div className="text-gray-500">arguments：</div>
        <pre className="whitespace-pre-wrap bg-gray-50 p-1 rounded max-h-32 overflow-auto">
          {parsedArgs ? JSON.stringify(parsedArgs, null, 2) : tc.function.arguments}
        </pre>
      </div>
    );
  }

  /**
   * 服务端执行后、准备回灌给模型的结果。
   *
   * 两个徽标分别对应两种完全不同的失败，页面要能区分（这是本条 Demo 的重点之一）：
   *   Zod ✗   → 参数就不合法，handler 一次都没跑（非法参数不打到真实服务）
   *   执行 ✗  → 参数合法但下游炸了（超时 / 500）
   * 卡片底色跟 executeOk 走；Zod 没过时也算没执行成功，所以同样是红底。
   */
  function ToolResultCard({ r }) {
    return (
      <div
        className={
          "border rounded p-2 text-xs space-y-1 " +
          (r.executeOk ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50")
        }
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-semibold">{r.toolName}</span>
          <span className="text-gray-500">id={r.tool_call_id}</span>
          <ResultTag ok={r.parseOk} label={r.parseOk ? "Zod ✓" : "Zod ✗"} />
          {/* Zod 没过就没有「执行」这一步，不展示第二个徽标，免得读成执行失败 */}
          {r.parseOk && (
            <ResultTag ok={r.executeOk} label={r.executeOk ? "执行 ✓" : "执行 ✗"} />
          )}
          <span className="text-gray-500">{r.durationMs}ms</span>
        </div>
        <div className="text-gray-500">content（喂回模型的 tool_result）：</div>
        {/* 这段字符串就是模型下一轮能看到的全部内容：错误信息写得好不好，直接决定它能不能自己修 */}
        <pre className="whitespace-pre-wrap bg-white p-1 rounded max-h-32 overflow-auto">{r.content}</pre>
      </div>
    );
  }

  /**
   * 一轮 = 一次「发给模型 → 模型回复」。
   *
   * finish_reason 是判断循环该不该继续的关键字段，所以用颜色强调：
   *   tool_calls     模型要调工具 → 服务端执行后还得再发一轮
   *   stop           模型给完答案 → 循环结束
   *   length         被 max_tokens 截断（不是正常结束）
   *   content_filter 被安全策略拦下
   */
  function RoundCard({ round }) {
    var fr = round.finish_reason;
    var frBadge =
      {
        tool_calls: "bg-blue-100 text-blue-800",
        stop: "bg-green-100 text-green-800",
        length: "bg-yellow-100 text-yellow-800",
        content_filter: "bg-orange-100 text-orange-800",
      }[fr] || "bg-gray-100 text-gray-800";
    return (
      <div className="border border-gray-400 rounded p-3 bg-gray-50 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">Round {round.round}</span>
          <span className={"text-xs px-2 py-0.5 rounded " + frBadge}>finish_reason={fr}</span>
          {/* 只有 /api/simulate-zod-error 的第一轮会带这个标记：提醒读者参数是服务端改坏的，不是模型的锅 */}
          {round.tampered && <ResultTag ok={false} label="⚠ 服务端篡改 arguments" />}
          {/* 这个数字就是「并行几个」：同一轮里有几个 tool_call，服务端就 Promise.all 几个 */}
          {round.tool_calls.length > 0 && (
            <span className="text-xs text-gray-500">· {round.tool_calls.length} 个 tool_call</span>
          )}
          {round.toolResults.length > 0 && (
            <span className="text-xs text-gray-500">· {round.toolResults.length} 个 tool_result</span>
          )}
        </div>

        {/* 模型这一轮的自然语言部分。要调工具时常常是空的，所以有才渲染 */}
        {round.content && (
          <div>
            <div className="text-xs text-gray-500 mb-1">model content：</div>
            <pre className="whitespace-pre-wrap bg-white p-2 rounded text-xs border max-h-32 overflow-auto">
              {round.content}
            </pre>
          </div>
        )}

        {/* 上半：模型「想调什么」 */}
        {round.tool_calls.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-1">tool_calls（模型发出的指令）：</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {round.tool_calls.map(function (tc, i) {
                return <ToolCallCard key={i} tc={tc} />;
              })}
            </div>
          </div>
        )}

        {/* 下半：服务端「实际执行出什么」，一一对应上面的 tool_call */}
        {round.toolResults.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-1">tool_result（执行结果 → 回灌模型）：</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {round.toolResults.map(function (r, i) {
                return <ToolResultCard key={i} r={r} />;
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  /**
   * 一次完整运行的结果卡片（页面 #output 的基本单位）。
   *
   * entry 由页面拼装，两种形态：
   *   成功 → { title, prompt, expect, status: 200, data }
   *   失败 → { …, status: 4xx/5xx, error, data: null }
   * data 为 null 时只渲染错误块 —— 三态里的「错误态」，不能让页面一片空白。
   */
  function CaseResult({ entry }) {
    var d = entry.data;
    if (!d) {
      return (
        <div className="border border-red-300 bg-red-50 rounded p-3 text-sm">
          <div className="font-semibold text-red-700">
            {entry.title} · HTTP {entry.status}
          </div>
          <pre className="whitespace-pre-wrap text-xs text-red-600 mt-1">
            {String(entry.error || "(无响应)")}
          </pre>
        </div>
      );
    }
    return (
      <div className="border border-gray-400 rounded p-3 bg-white space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="space-y-1">
            <div className="font-semibold">{entry.title}</div>
            {/* §5.3.10 用户输入 = 中性灰；先回显「我发了什么」，再看模型怎么反应 */}
            <div className="text-xs text-gray-700 bg-gray-50 rounded px-2 py-1">
              我发出去的 prompt：{entry.prompt}
            </div>
            {/* 期望值写在结果旁边：跑完能立刻对照「跟预期一样吗」 */}
            <div className="text-xs italic text-gray-500">{entry.expect}</div>
          </div>
          {/* 轮次 / 耗时 / mode：判断是不是走了预期那条路径 */}
          <div className="text-xs text-gray-500">
            {d.totalRounds} 轮 · {d.elapsedMs}ms · mode={d.mode}
          </div>
        </div>

        {/* HTTP 200 但业务失败（如模型没调工具，演示不成立）也要显式说出来 */}
        {d.error && (
          <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
            {d.error}
            {d.upstreamStatus ? " · upstreamStatus=" + d.upstreamStatus : ""}
          </div>
        )}

        <div className="space-y-2">
          {d.rounds &&
            d.rounds.map(function (round, i) {
              return <RoundCard key={i} round={round} />;
            })}
        </div>

        {/* §5.3.10 模型终态 = 绿系：这才是真实产品里用户唯一会看到的那段话 */}
        {d.finalContent && (
          <div>
            <div className="text-xs text-gray-500 mb-1">🎯 final content（给用户看的终态）：</div>
            <pre className="whitespace-pre-wrap bg-green-50 p-3 rounded text-sm border border-green-300 max-h-48 overflow-auto">
              {d.finalContent}
            </pre>
          </div>
        )}
      </div>
    );
  }

  window.DemoUI.CaseResult = CaseResult;
})();
