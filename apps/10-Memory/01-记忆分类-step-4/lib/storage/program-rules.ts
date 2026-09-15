/**
 * 职责：程序性记忆存储 —— demo 用的「全员规则」常驻区（不靠检索、每次请求都拼进 messages[0]）。
 *   1. listRules()：列出全部规则（首次调用时落 3 条默认规则）
 *   2. addRule(text)：新增一条规则（trim 后非空）
 *   3. removeRule(id)：按 id 删除一条规则
 *
 * 数据流：listRules / addRule / removeRule 三个函数都被路由 program-rules.ts 调用。
 *
 * 为什么要单独存：语义记忆是「这一类用户的事实」，程序性记忆是「全员通用规则、不属于任何具体用户」。
 * 两者在存储层必须分开：清空用户事实时不该误删全员规则（详见小节文档 01-记忆分类.md「易混 7」）。
 *
 * 用 in-memory Map 演示：进程一关规则就没了。真实产品应该写到代码仓库 / 配置中心（不是数据库）。
 * 本 demo 让学习者在前端页面改一条规则 → 立刻对所有用户的下一次回答生效（因为是进程内共享）。
 *
 *   listRules()
 *     → 返内存 Map 全量（按 id 升序）
 *   addRule(text)
 *     → nextId 自增 → Map.set(id, {id, text, createdAt})
 *     → 返新规则
 *   removeRule(id)
 *     → Map.delete(id)
 *     → 返 { removed: boolean, remainingCount: number }
 */

export interface ProgramRule {
  id: number;
  text: string;
  /** ISO 时间串 */
  createdAt: string;
}

const store = new Map<number, ProgramRule>();
let nextId = 1;

function seedDefaults(): void {
  if (store.size > 0) return;
  const defaults = [
    "回答用户前先给一句结论，再给代码或步骤。",
    "组件统一用单文件写法（前端助手场景）。",
    "涉及删除操作前必须先向用户确认。",
  ];
  for (const text of defaults) {
    store.set(nextId, { id: nextId, text, createdAt: new Date().toISOString() });
    nextId += 1;
  }
}

/** 列出全部程序性规则（按 id 升序）。首次调用时落 3 条默认规则。 */
export function listRules(): ProgramRule[] {
  seedDefaults();
  return Array.from(store.values()).sort((a, b) => a.id - b.id);
}

/** 新增一条规则。text 必须是字符串、trim 后非空。 */
export function addRule(text: string): ProgramRule {
  seedDefaults();
  const cleaned = String(text ?? "").trim();
  if (!cleaned) {
    throw new Error("规则内容不能为空。");
  }
  const rule: ProgramRule = { id: nextId, text: cleaned, createdAt: new Date().toISOString() };
  store.set(nextId, rule);
  nextId += 1;
  return rule;
}

/** 按 id 删除一条规则。返 { removed: boolean, remainingCount }。 */
export function removeRule(id: number): { removed: boolean; remainingCount: number } {
  seedDefaults();
  const existed = store.delete(id);
  return { removed: existed, remainingCount: store.size };
}

/** 当前规则总数（页面右上角展示用）。 */
export function rulesCount(): number {
  return store.size;
}