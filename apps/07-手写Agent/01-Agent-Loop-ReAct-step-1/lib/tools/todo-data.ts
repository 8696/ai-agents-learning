/**
 * 职责：内存里的假待办数据。step-1 不接 SQLite（持久化留给 §5.3.17 路径，本条只演示 Loop）。
 *
 * 数据流：模块顶部常量 → listTodos / completeTodo 两个纯函数返回/修改数组。
 *
 * 为什么单独成文件：list + complete 都要访问同一份数据；提到一个文件里就是「业务事实」，
 * 跟 Tool 定义（todo-tools.ts）正交 —— Tool 是协议形状（OpenAI function-calling schema + handler 入口），
 * 数据是事实。本条不引第三方持久化库。
 *
 * 教学锚点（变体 D 串行依赖 / H 多圈）：本数据故意做成「list 看完整列表 → 选两条 overdue 的
 *   tag=购物 且 done=false 且 dueDate<今天 → complete 每条」三阶段。模型必须真的调两次工具
 *   才能把任务完成；它不会一次调完是因为 complete 需要 id，id 来自 list。
 */

export type Todo = {
  id: string;
  title: string;
  tag: "购物" | "工作" | "健身";
  /** ISO 日期 YYYY-MM-DD；列表里 2 条「购物」dueDate < 今天 = 「逾期购物待办」 */
  dueDate: string;
  done: boolean;
};

// ── 用相对日期构造：今天 / 昨天 / 明天，让「逾期」有稳定语义（不写死 2026-xx-xx）──
function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const STORE: Todo[] = [
  { id: "todo-001", title: "买牛奶和鸡蛋",                tag: "购物", dueDate: daysFromToday(-3), done: false },
  { id: "todo-002", title: "买猫粮",                     tag: "购物", dueDate: daysFromToday(-1), done: false },
  { id: "todo-003", title: "买生日蛋糕（周末用）",        tag: "购物", dueDate: daysFromToday(2),  done: false },
  { id: "todo-004", title: "退掉不合适的衣服",            tag: "购物", dueDate: daysFromToday(5),  done: false },
  { id: "todo-005", title: "提交季度汇报",                tag: "工作", dueDate: daysFromToday(0),  done: false },
  { id: "todo-006", title: "回 HR 邮件",                 tag: "工作", dueDate: daysFromToday(-2), done: false },
  { id: "todo-007", title: "跑步 5 公里",                tag: "健身", dueDate: daysFromToday(-4), done: false },
  { id: "todo-008", title: "瑜伽课",                     tag: "健身", dueDate: daysFromToday(1),  done: false },
];

export type ListFilter = {
  tag?: Todo["tag"];
  onlyOverdue?: boolean;
};

/**
 * 列待办；filter 同时支持 tag 和「仅逾期」。
 * 「逾期」定义：!done 且 dueDate < 今天（YYYY-MM-DD 字符串比较即可，ISO 字典序 == 日期序）。
 */
export function listTodos(filter: ListFilter = {}): Todo[] {
  const today = daysFromToday(0);
  return STORE.filter((t) => {
    if (filter.tag && t.tag !== filter.tag) return false;
    if (filter.onlyOverdue && (t.done || t.dueDate >= today)) return false;
    return true;
  });
}

/**
 * 完成一条待办；返回更新后的那条。
 * - 不存在 → 返回 null（observe 阶段把 null 当 tool_result 写回去，模型下一圈可改 id）
 * - 已是 done → 也返回那条（幂等：让 Loop 不被重复 complete 卡住）
 */
export function completeTodo(id: string): Todo | null {
  const t = STORE.find((x) => x.id === id);
  if (!t) return null;
  t.done = true;
  return t;
}

/** 测试用：把数据重置回初值（生产不需要；这里给 §5.4 验证或 debug 用）。 */
export function _resetStore(): void {
  // 注意：只是重新写常量引用不会更新已 frozen 的对象，所以最简单做法是把模块重新 import。
  // step-1 不暴露这个端点；保留供未来测试。
}
