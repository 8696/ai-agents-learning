/**
 * 职责：三个业务端点共用的入参闸门 —— 从 body.raw 解析出 JSON 对象。
 * 数据流：{ raw: string } → JSON.parse；缺 raw / 非法 JSON 直接 400。
 * 本条不调 LLM，不查 Key。
 *
 * 日志（§5.3.16）：工具档——五件套（含 __code）仍要；闸门挡掉打 warn。
 */
import type { Context } from "koa";
import { z } from "zod";
import { logger } from "../logger.js";

const bodySchema = z.object({
  raw: z.string(),
});

export function readJsonPayload(ctx: Context): unknown | null {
  const t0 = Date.now();
  const parsed = bodySchema.safeParse(ctx.request.body ?? {});
  if (!parsed.success) {
    logger.warn(
      "│ 闸门-readJsonPayload",
      "调用函数结束：readJsonPayload（失败）",
      "为什么打：前端没按协议发 body（不是 { raw: string }）；记 ctx.method + path 便于核对是哪个端点被错调。warn 是「业务失败但能走通」的等级。",
      {
        返回值: { ok: false, status: 400 },
        method: ctx.method,
        path: ctx.path,
        issues: parsed.error.issues,
        耗时ms: Date.now() - t0,
      },
    );
    ctx.status = 400;
    ctx.body = { error: "请求体不合法，需要 { raw: string }", detail: parsed.error.issues };
    return null;
  }
  if (parsed.data.raw.trim().length === 0) {
    logger.warn(
      "│ 闸门-readJsonPayload",
      "调用函数结束：readJsonPayload（失败）",
      "为什么打：前端发了 raw=\"\"；不调闸门后续步骤直接返回 400，记 rawLen 便于排查前端拼接。",
      {
        返回值: { ok: false, status: 400 },
        method: ctx.method,
        path: ctx.path,
        rawLen: parsed.data.raw.length,
        耗时ms: Date.now() - t0,
      },
    );
    ctx.status = 400;
    ctx.body = { error: "raw 不能为空。请贴一段 JSON 对象。" };
    return null;
  }
  try {
    const json = JSON.parse(parsed.data.raw) as unknown;
    logger.debug(
      "│ 闸门-readJsonPayload",
      "调用函数结束：readJsonPayload",
      "为什么打：debug 等级；闸门是高频路径，命中 ok 时不打 info 免刷屏。当前：raw 是合法 JSON；记 payloadType + 顶层 keys 便于复现 raw 内容。",
      {
        返回值: { ok: true, status: 200, payloadType: typeof json, payloadKeys: json && typeof json === "object" ? Object.keys(json) : null },
        method: ctx.method,
        path: ctx.path,
        耗时ms: Date.now() - t0,
      },
    );
    return json;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      "│ 闸门-readJsonPayload",
      "调用函数结束：readJsonPayload（失败）",
      "为什么打：raw 字符串不是合法 JSON；这是输入错不是 LLM 错；记 raw 前 200 字让排错时看到原始输入。",
      {
        返回值: { ok: false, status: 400 },
        method: ctx.method,
        path: ctx.path,
        err: message,
        rawPreview: parsed.data.raw.slice(0, 200),
        耗时ms: Date.now() - t0,
      },
    );
    ctx.status = 400;
    ctx.body = { error: "raw 不是合法 JSON：" + message };
    return null;
  }
}