/**
 * 职责：数据前后对照三栏（before / after / diff）。
 * 数据流：result.todosBefore / todosAfter / diff → 三列 JSX。挂 window.DemoUI。
 * 为什么单独成文件：对照三栏占行多，跟轨迹卡片不是同一职责。
 */
window.DemoUI = window.DemoUI || {};
window.DemoUI.SideEffect = function SideEffect(props) {
  const result = props.result;
  const afterTitle = props.afterTitle;
  const emptyText = props.emptyText;
  const diffHint = props.diffHint || null;
  const TodoRow = window.DemoUI.TodoRow;
  const dueClass = window.DemoUtils.dueClass;
  const fmtDue = window.DemoUtils.fmtDue;

  return (
    <div className="border border-gray-300 rounded p-3 space-y-2 bg-white">
      <div className="flex items-center justify-between text-sm">
        <div className="font-semibold text-gray-800">
          数据前后对照（Loop 在内存里真改了什么）
        </div>
        <div className="text-xs text-gray-500">
          diff 改了 <b>{result.diff.changed.length}</b> 条 ·{" "}
          其中 <b className="text-green-700">{result.diff.summary.completedCount}</b> 条 done false → true
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-gray-50 border border-gray-300 rounded p-2">
          <div className="text-xs font-semibold text-gray-700 mb-1">
            Before（跑 Agent 之前 · {result.todosBefore.length} 条）
          </div>
          <ul className="space-y-1">
            {result.todosBefore.map((t) => (
              <TodoRow key={t.id} todo={t} dueClass={dueClass(t)} showDone={false} />
            ))}
          </ul>
        </div>
        <div className="bg-green-50 border border-green-300 rounded p-2">
          <div className="text-xs font-semibold text-green-800 mb-1">
            {afterTitle}
          </div>
          <ul className="space-y-1">
            {result.todosAfter.map((t) => (
              <TodoRow key={t.id} todo={t} dueClass={""} showDone={true} />
            ))}
          </ul>
        </div>
        <div className="bg-yellow-50 border border-yellow-300 rounded p-2">
          <div className="text-xs font-semibold text-yellow-900 mb-1">
            Diff（只列被改的行 · {result.diff.changed.length} 条）
            {diffHint ? <span className="ml-2 text-purple-700 text-xs">{diffHint}</span> : null}
          </div>
          {result.diff.changed.length === 0 ? (
            <div className="text-xs text-gray-500">{emptyText}</div>
          ) : (
            <ul className="space-y-1">
              {result.diff.changed.map((c) => (
                <li key={c.id} className="border border-yellow-300 bg-white rounded p-2 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="font-mono text-gray-400">{c.id}</span>{" "}
                      <span className="px-1.5 py-0.5 rounded bg-gray-100">{c.tag}</span>
                    </div>
                    <span className="text-green-700 text-xs font-semibold">
                      {c.from.done ? "未改动字段但 JSON 变了（罕见）" : "done: false → true"}
                    </span>
                  </div>
                  <div className="text-gray-700">{c.title}</div>
                  <div className="mt-1 text-gray-500 text-xs">
                    {fmtDue(c.from.dueDate)} ({c.from.dueDate}) → {fmtDue(c.to.dueDate)} ({c.to.dueDate})
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
