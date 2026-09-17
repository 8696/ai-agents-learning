/**
 * 职责：脏类型对照区——写入之前、stringify 再 parse 之后、磁盘仍是上一份。
 * 数据流：App 传入 dirtyLast / dirtyError；合法快照仍用 OutputBoard。
 * 为什么单独成文件：对照两侧不要和支付账本卡堆在 output-board.js。
 */
window.DemoUI = window.DemoUI || {};

function probeLine(probe) {
  if (!probe) return "—";
  const bits = [
    "字段 " + probe.field,
    "typeof = " + probe.typeofValue,
    "构造名 = " + probe.constructorName,
    "还在对象上：" + String(probe.fieldPresent),
  ];
  if (probe.functionName) bits.push("函数名 " + probe.functionName);
  if (typeof probe.mapSize === "number") bits.push("Map 大小 " + String(probe.mapSize));
  if (probe.dateIso) bits.push("Date = " + probe.dateIso);
  if (probe.stringValue) bits.push("字符串值 " + probe.stringValue);
  return bits.join(" · ");
}

function SerializeBoard(props) {
  const last = props.last;
  const err = props.error;
  return (
    <div className="min-h-[160px] space-y-3">
      {err ? (
        <div className="bg-red-50 border border-red-300 text-red-800 text-sm rounded p-3">
          <div className="font-semibold">失败（HTTP {err.status || "—"} · {err.code || "无编号"}）</div>
          <div>{err.message}</div>
        </div>
      ) : null}
      {!last && !err ? (
        <p className="text-sm text-gray-500">
          还没有发过脏类型请求。先走一步写出合法快照，再点「故意塞函数 / Map / Date」。
        </p>
      ) : null}
      {last ? (
        <div className="space-y-3 text-sm">
          <div className="bg-orange-50 border border-orange-300 rounded p-2">
            <div className="text-xs font-semibold text-orange-900">判定：拒绝写入磁盘</div>
            <p className="mt-1 text-xs text-gray-800">{last.reason}</p>
            <p className="mt-1 text-xs text-gray-600">
              accepted = {String(last.accepted)} · wroteToDisk = {String(last.wroteToDisk)} ·
              stringify 表面上成功 = {String(last.stringifySucceeded)}
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="border border-gray-300 bg-white rounded p-2">
              <div className="text-xs font-semibold text-gray-700">写入之前（注入之后、stringify 之前）</div>
              <p className="mt-1 text-xs text-gray-800">{probeLine(last.before)}</p>
              <pre className="mt-1 text-xs text-gray-700 whitespace-pre-wrap max-h-40 overflow-auto">
                {JSON.stringify(last.before, null, 2)}
              </pre>
            </div>
            <div className="border border-gray-300 bg-yellow-50 rounded p-2">
              <div className="text-xs font-semibold text-gray-700">stringify 再 parse 之后</div>
              <p className="mt-1 text-xs text-gray-800">{probeLine(last.afterStringifyParse)}</p>
              <pre className="mt-1 text-xs text-gray-700 whitespace-pre-wrap max-h-40 overflow-auto">
                {JSON.stringify(last.afterStringifyParse, null, 2)}
              </pre>
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded p-2">
            <div className="text-xs font-semibold text-gray-600">请求参数</div>
            <pre className="mt-1 text-xs text-gray-700 whitespace-pre-wrap max-h-24 overflow-auto">
              {JSON.stringify(last.请求参数 || last.request, null, 2)}
            </pre>
          </div>
          <div className="border border-gray-300 bg-white rounded p-2">
            <div className="text-xs font-semibold text-gray-600">调用流程</div>
            <ol className="mt-1 text-xs text-gray-700 list-decimal pl-5 space-y-1">
              {(last.调用流程 || []).map(function (step, index) {
                return <li key={index}>{step}</li>;
              })}
            </ol>
          </div>
          <div className="bg-green-50 border border-green-300 rounded p-2">
            <div className="text-xs font-semibold text-gray-700">磁盘上仍是上一份完整快照（没有被脏对象覆盖）</div>
            <p className="mt-1 text-xs text-gray-600">文件路径：{last.filePath || "—"}</p>
            <pre className="mt-1 text-xs text-gray-800 whitespace-pre-wrap max-h-40 overflow-auto">
              {JSON.stringify(last.checkpointStillOnDisk, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

window.DemoUI.SerializeBoard = SerializeBoard;
