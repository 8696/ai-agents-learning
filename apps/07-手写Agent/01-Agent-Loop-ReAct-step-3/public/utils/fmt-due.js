/**
 * 职责：把 YYYY-MM-DD 显示成「今天 / 昨天 / N 天前」，并判断逾期高亮。
 * 数据流：due 字符串 / todo 对象 → 相对日期文案或 Tailwind class。无 JSX，挂 window.DemoUtils。
 * 为什么单独成文件：列表行和对照三栏都要用同一套日期文案，不要每个组件复制一份。
 */
window.DemoUtils = window.DemoUtils || {};
window.DemoUtils.fmtDue = function fmtDue(due) {
  const today = new Date().toISOString().slice(0, 10);
  if (due === today) return "今天";
  const t = new Date(today).getTime();
  const d = new Date(due).getTime();
  const diff = Math.round((d - t) / (1000 * 60 * 60 * 24));
  if (diff === -1) return "昨天";
  if (diff === 1) return "明天";
  if (diff < 0) return `${-diff} 天前`;
  if (diff > 0) return `${diff} 天后`;
  return due;
};
window.DemoUtils.dueClass = function dueClass(todo) {
  const today = new Date().toISOString().slice(0, 10);
  if (todo.dueDate < today && !todo.done) return "bg-yellow-50 border-yellow-300";
  return "";
};
