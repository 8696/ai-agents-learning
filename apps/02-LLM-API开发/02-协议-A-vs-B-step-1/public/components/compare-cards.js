/**
 * 职责：一次性对照卡片 —— ThinkScenario 四卡、6 行差异表、两侧 JSON。
 * 颜色：answer 绿底、thinking 紫灰、usage 系统事件、错误红。
 * 挂载：window.DemoUI.{ ErrorBanner, UsageLines, ScenarioGrid, DiffTable, ComparePairView }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  function ErrorBanner({ title, detail, httpStatus }) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{title}</span>
          <span className="text-xs text-gray-500">
            {httpStatus ? "HTTP " + httpStatus : "请求未送达"}
          </span>
        </div>
        <div className="text-xs break-words">{detail}</div>
      </div>
    );
  }

  /** usage 字段命名就是本条对照点：A=prompt/completion，B=input/output。 */
  function UsageLines({ scenario }) {
    var u = scenario.usage;
    if (!u || Object.keys(u).length === 0) {
      return <div className="font-mono text-[11px] text-gray-400">（无）</div>;
    }
    var lines = [];
    if (scenario.protocol === "A") {
      if (u.prompt_tokens != null) lines.push("prompt_tokens: " + u.prompt_tokens);
      if (u.completion_tokens != null) lines.push("completion_tokens: " + u.completion_tokens);
      if (u.total_tokens != null) lines.push("total_tokens: " + u.total_tokens);
      if (u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens != null) {
        lines.push({
          key: "r",
          node: (
            <span className="text-green-700 font-bold">
              ✓ reasoning_tokens: {u.completion_tokens_details.reasoning_tokens}
            </span>
          ),
        });
      }
      if (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens != null) {
        lines.push("cached_tokens: " + u.prompt_tokens_details.cached_tokens);
      }
    } else {
      if (u.input_tokens != null) lines.push("input_tokens: " + u.input_tokens);
      if (u.output_tokens != null) lines.push("output_tokens: " + u.output_tokens);
      if ("reasoning_tokens" in u) {
        lines.push({
          key: "r",
          node: (
            <span className="text-green-700 font-bold">✓ reasoning_tokens: {u.reasoning_tokens}</span>
          ),
        });
      } else {
        lines.push({
          key: "r",
          node: <span className="text-red-600">✗ reasoning_tokens: 无顶层字段</span>,
        });
      }
      if (u.output_tokens_details && u.output_tokens_details.thinking_tokens != null) {
        lines.push({
          key: "t",
          node: (
            <span className="text-green-700 font-bold">
              ✓ output_tokens_details.thinking_tokens: {u.output_tokens_details.thinking_tokens}
            </span>
          ),
        });
      }
      if (u.cache_read_input_tokens != null) {
        lines.push("cache_read_input_tokens: " + u.cache_read_input_tokens);
      }
    }
    return (
      <div className="font-mono text-[11px] text-gray-700 space-y-0.5">
        {lines.map(function (l, i) {
          if (typeof l === "string") return <div key={i}>{l}</div>;
          return <div key={l.key || i}>{l.node}</div>;
        })}
      </div>
    );
  }

  function thinkingLabel(sc) {
    if (!sc.thinkingParam) return "· 关";
    if (sc.thinkingParam.budget_tokens != null) return "· budget=" + sc.thinkingParam.budget_tokens;
    return "· " + (sc.thinkingParam.type || "on");
  }

  function ScenarioCard({ sc }) {
    return (
      <div className="border border-gray-300 rounded p-2 text-xs space-y-1">
        <div className="flex justify-between items-center font-semibold">
          <span>{sc.scenario}</span>
          <span className="font-normal text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
            {sc.protocol}
            {thinkingLabel(sc)}
          </span>
        </div>
        {sc.error ? (
          <div className="text-red-600 italic">{sc.error}</div>
        ) : (
          <>
            <div className="text-[11px] text-gray-500 font-bold mt-2">
              answer ({(sc.textAnswer || "").length} 字符)
            </div>
            <div className="bg-green-50 border border-green-300 p-1.5 rounded max-h-40 overflow-auto whitespace-pre-wrap break-words">
              {sc.textAnswer}
            </div>
            <div className="text-[11px] text-gray-500 font-bold mt-2">
              thinking
              {sc.thinking && sc.thinking.exists
                ? " (" + sc.thinking.location + " · " + sc.thinking.charCount + " 字符)"
                : ""}
            </div>
            <div
              className={
                "p-1.5 rounded max-h-32 overflow-auto whitespace-pre-wrap break-words " +
                (sc.thinking && sc.thinking.exists
                  ? "bg-purple-50 text-gray-600 italic"
                  : "text-gray-400 italic")
              }
            >
              {sc.thinking && sc.thinking.exists
                ? sc.thinking.preview + (sc.thinking.charCount > 300 ? "…" : "")
                : sc.protocol === "A"
                  ? "无独立 thinking block（嵌在 answer 字符串里）"
                  : "无独立 thinking block"}
            </div>
            <div className="text-[11px] text-gray-500 font-bold mt-2">usage</div>
            <UsageLines scenario={sc} />
            {(sc.finishReason || sc.stopReason) && (
              <div className="font-mono text-[11px] text-gray-700 mt-1">
                {sc.finishReason ? (
                  <>
                    finish_reason: <code className="bg-gray-100 px-1 rounded">{sc.finishReason}</code>
                  </>
                ) : (
                  <>
                    stop_reason: <code className="bg-gray-100 px-1 rounded">{sc.stopReason}</code>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  function ScenarioGrid({ scenarios }) {
    if (!scenarios || scenarios.length === 0) return null;
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
        {scenarios.map(function (sc, i) {
          return <ScenarioCard key={i} sc={sc} />;
        })}
      </div>
    );
  }

  function locationCell(sc) {
    if (!sc.thinking) return "—";
    if (sc.thinking.location === "embedded_in_content") {
      return <span className="text-red-600">嵌在 content 字符串</span>;
    }
    if (sc.thinking.location === "reasoning_field") {
      return <span className="text-green-700 font-bold">独立 reasoning_content / reasoning_details</span>;
    }
    if (sc.thinking.location === "separate_block") {
      return <span className="text-green-700 font-bold">独立 type=thinking block</span>;
    }
    return <span className="text-red-600">无 thinking</span>;
  }

  function billingCell(sc) {
    if (sc.protocol === "A") {
      var rt = sc.usage && sc.usage.completion_tokens_details && sc.usage.completion_tokens_details.reasoning_tokens;
      return rt != null ? (
        <span className="text-green-700 font-bold">✓ reasoning_tokens: {rt}</span>
      ) : (
        <span className="text-red-600">✗ 无 reasoning_tokens</span>
      );
    }
    var t = sc.usage && sc.usage.output_tokens_details && sc.usage.output_tokens_details.thinking_tokens;
    if (t != null) {
      return (
        <>
          <span className="text-green-700 font-bold">✓ output_tokens_details.thinking_tokens: {t}</span>
          <br />
          <span className="text-[10px] text-gray-500">（非顶层 reasoning_tokens）</span>
        </>
      );
    }
    if (sc.usage && "reasoning_tokens" in sc.usage) {
      return <span className="text-green-700 font-bold">✓ reasoning_tokens: {sc.usage.reasoning_tokens}</span>;
    }
    return <span className="text-red-600">✗ 无字段（输出太短，未触发 thinking）</span>;
  }

  function DiffTable({ scenarios }) {
    if (!scenarios || scenarios.length === 0) return null;
    var headers = ["差异点"].concat(scenarios.map(function (s) { return s.scenario; }));
    var rows = [
      {
        label: "1. content 形态",
        highlight: false,
        values: scenarios.map(function (sc) {
          return sc.contentType === "string" ? (
            <>
              <code>string</code>（嵌 {"<think>"} 标记）
            </>
          ) : (
            <>
              <code>block[]</code>（每个元素有 type）
            </>
          );
        }),
      },
      {
        label: "2. thinking 位置",
        highlight: false,
        values: scenarios.map(locationCell),
      },
      {
        label: "3. usage 字段命名",
        highlight: false,
        values: scenarios.map(function (sc) {
          return sc.protocol === "A" ? (
            <>
              <code>prompt_tokens</code> / <code>completion_tokens</code>
            </>
          ) : (
            <>
              <code>input_tokens</code> / <code>output_tokens</code>
            </>
          );
        }),
      },
      {
        label: "4. thinking 单独计费？",
        highlight: true,
        values: scenarios.map(billingCell),
      },
      {
        label: "5. 答案长度（字符）",
        highlight: false,
        values: scenarios.map(function (sc) {
          return <code>{(sc.textAnswer || "").length}</code>;
        }),
      },
      {
        label: "6. finish/stop 字段",
        highlight: false,
        values: scenarios.map(function (sc) {
          if (sc.finishReason) return <code>finish_reason: "{sc.finishReason}"</code>;
          if (sc.stopReason) return <code>stop_reason: "{sc.stopReason}"</code>;
          return "—";
        }),
      },
    ];
    return (
      <div className="overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {headers.map(function (h, i) {
                return (
                  <th key={i} className="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-bold">
                    {h}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(function (row, ri) {
              return (
                <tr key={ri}>
                  <td
                    className={
                      "border border-gray-300 px-2 py-1 font-bold " +
                      (row.highlight ? "bg-yellow-100" : "bg-gray-50")
                    }
                  >
                    {row.label}
                  </td>
                  {row.values.map(function (v, vi) {
                    return (
                      <td
                        key={vi}
                        className={
                          "border border-gray-300 px-2 py-1 align-top " +
                          (row.highlight ? "bg-yellow-100" : "")
                        }
                      >
                        {v}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  /** /api/compare 两侧完整 JSON：左边 A choices[0]，右边 B content[]。 */
  function ComparePairView({ pair }) {
    if (!pair) return null;
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="border border-gray-300 rounded p-2">
          <div className="text-xs text-gray-500 mb-1">协议 A · 完整响应（choices[0].message.content / finish_reason / prompt_tokens）</div>
          <pre className="whitespace-pre-wrap break-words text-xs max-h-80 overflow-auto bg-gray-50 p-2 rounded">
            {JSON.stringify(pair.a, null, 2)}
          </pre>
        </div>
        <div className="border border-gray-300 rounded p-2">
          <div className="text-xs text-gray-500 mb-1">协议 B · 完整响应（content[0].text / stop_reason / input_tokens）</div>
          <pre className="whitespace-pre-wrap break-words text-xs max-h-80 overflow-auto bg-gray-50 p-2 rounded">
            {JSON.stringify(pair.b, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  window.DemoUI.ErrorBanner = ErrorBanner;
  window.DemoUI.UsageLines = UsageLines;
  window.DemoUI.ScenarioGrid = ScenarioGrid;
  window.DemoUI.DiffTable = DiffTable;
  window.DemoUI.ComparePairView = ComparePairView;
})();
