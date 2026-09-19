/**
 * 职责：工单种子 + 按用户过滤。本步核心 = 「按用户隔离」的可观察证据。
 *
 * 数据流：
 *   mcp-http-server.ts 的 list_my_tickets handler
 *     → getCurrentUserId()（从 AsyncLocalStorage 读）
 *     → listTicketsForUser(userId)
 *       → 普通 user 返自己的；userId === "god" 返全部（反例：上帝令牌绕过）
 *
 * 为什么单独成文件：业务数据 vs 鉴权状态解耦；step-3 升级 SQLite 时只动这一个文件 + 加 db.ts。
 *
 * 为什么硬编码：模块验收「按用户隔离」只讲读路径过滤，不讲持久化；SQLite 是模块 06+ 才学。
 */
import { logger } from "../logger.js";

export interface Ticket {
  id: string;
  userId: string;
  title: string;
  status: "open" | "resolved";
}

// ── 种子工单：alice 2 张、bob 1 张；god 模式（userId === "god"）能看到全部 ──
// 写死不是「真数据」而是「教学样本」；3 张够看清 alice 看不到 bob 的、bob 看不到 alice 的、god 看全部 三态对照
const SEED_TICKETS: Ticket[] = [
  { id: "T-1001", userId: "alice", title: "拿铁凉了", status: "open" },
  { id: "T-1002", userId: "alice", title: "退款延迟", status: "open" },
  { id: "T-2001", userId: "bob", title: "配送地址错", status: "open" },
];

/**
 * 按用户过滤工单。普通 user 返自己的；userId === "god" 返全部（生产上的反例）。
 */
export function listTicketsForUser(userId: string): {
  tickets: Ticket[];
  isGod: boolean;
  viewerUserId: string;
} {
  const t0 = Date.now();
  const isGod = userId === "god";

  logger.info(
    "调用函数-listTicketsForUser",
    "调用函数开始：listTicketsForUser",
    "为什么写这条日志：按用户隔离的核心判断就在这一行；alice / bob / god 三态对照全靠它。当前：list_my_tickets handler 拿到当前 userId，准备过滤。",
    {
      入参: { userId },
      __code: "const filtered = isGod ? SEED_TICKETS : SEED_TICKETS.filter(t => t.userId === userId)",
    },
  );

  const tickets = isGod ? SEED_TICKETS : SEED_TICKETS.filter((t) => t.userId === userId);

  logger.info(
    "调用函数-listTicketsForUser",
    "调用函数结束：listTicketsForUser",
    "为什么写这条日志：返回值直接给客户端对照三态；alice 应该看到自己 2 张，bob 看到自己 1 张，god 看到全部 3 张。当前：过滤完毕。",
    {
      返回值: { tickets, isGod, viewerUserId: userId },
      耗时ms: Date.now() - t0,
      字段释义: {
        tickets: "过滤后的工单列表；alice 2 张 / bob 1 张 / god 全部 3 张",
        isGod: "true = 上帝令牌绕过 userId 过滤（生产上的反例）",
        viewerUserId: "当前调用方身份（来自 AsyncLocalStorage）",
      },
    },
  );

  return { tickets, isGod, viewerUserId: userId };
}
