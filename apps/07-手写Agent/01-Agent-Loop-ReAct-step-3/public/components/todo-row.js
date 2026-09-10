/**
 * 职责：一条待办的列表行（id / tag / 到期日 / 标题 / 完成状态）。
 * 数据流：todo + dueClass + showDone → 一行 JSX。挂 window.DemoUI。
 * 为什么单独成文件：初始列表和对照三栏都要用同一行样式。
 */
window.DemoUI = window.DemoUI || {};
window.DemoUI.TodoRow = function TodoRow(props) {
  const todo = props.todo;
  const dueClass = props.dueClass;
  const showDone = props.showDone;
  const fmtDue = window.DemoUtils.fmtDue;
  return (
    <li className={
      "border rounded p-2 text-sm flex items-center justify-between gap-2 " +
      (todo.done
        ? (showDone ? "bg-green-50 border-green-300" : "bg-white border-gray-200")
        : (dueClass || "bg-white border-gray-300"))
    }>
      <div className="flex-1">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-mono text-gray-400">{todo.id}</span>
          <span className="px-1.5 py-0.5 rounded bg-gray-100">{todo.tag}</span>
          <span>{fmtDue(todo.dueDate)} · {todo.dueDate}</span>
        </div>
        <div className={"mt-1 whitespace-pre-wrap " + (todo.done ? "line-through text-gray-400" : "")}>
          {todo.title}
        </div>
      </div>
      <span className={
        "text-xs px-2 py-0.5 rounded " +
        (todo.done
          ? "bg-green-200 text-green-800"
          : (dueClass === "bg-yellow-50 border-yellow-300" ? "bg-yellow-200 text-yellow-800" : "bg-gray-200 text-gray-700"))
      }>
        {todo.done ? "已完成" : "未完成"}
      </span>
    </li>
  );
};
