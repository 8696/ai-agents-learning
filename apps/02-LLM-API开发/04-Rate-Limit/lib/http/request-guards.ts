/**
 * 职责：业务路由共用的入参闸门（有 Key？proxy target 合法？burst 并发数？）。
 * 数据流：ctx → 通过则返回值；失败则已写好 status/body，返回 null，route 直接 return。
 * 为什么单独成文件：mock 与 real 两套 route 都要同一套口径，散在 handler 里会漂成两套错法。
 */
import type { Context } from "koa";
import type { Llm } from "../../../../llm.js";
import { llm } from "./runtime-ctx.js";
import { isMockTarget, type MockTarget } from "../mock/mock-responses.js";

/** 没有配置 Key 时 503，避免后面 SDK create 才炸成难读的错。真 API 页按钮应已 disabled。 */
export function requireLlm(ctx: Context): Llm | null {
  if (!llm) {
    ctx.status = 503;
    ctx.body = { error: "当前 LLM_PROVIDER 没有 Key，无法真实调用（见 apps/.env.example）。" };
    return null;
  }
  return llm;
}

/**
 * /api/proxy?target=easy|chaos|auth|forever|ok|drop
 * 缺 target / 不在白名单 → 400（这是 §5.3.2 的「参数错误」类，页面要看得见 HTTP 码）。
 */
export function readProxyTarget(ctx: Context): MockTarget | null {
  const raw = String(ctx.query.target ?? "").trim();
  if (!raw) {
    ctx.status = 400;
    ctx.body = { error: "missing target（需要 ?target=easy|chaos|auth|forever|ok|drop）" };
    return null;
  }
  if (!isMockTarget(raw)) {
    ctx.status = 400;
    ctx.body = { error: `unknown target: ${raw}` };
    return null;
  }
  return raw;
}

/** burst 并发：默认 20，夹在 1～50，避免一次点出上百次真请求。 */
export function readConcurrency(ctx: Context): number {
  const n = Number(ctx.query.concurrency ?? 20);
  if (!Number.isFinite(n)) return 20;
  return Math.min(50, Math.max(1, Math.trunc(n)));
}
