/**
 * 职责：/api/classify 的入参闸门（有没有 Key、评价文本是否为空、modes 是否合法）。
 * 数据流：ctx.request.body → 通过则返回解析好的对象；不通过时闸门已写好 ctx.status / ctx.body，
 *   返回 null，route 直接 return（route 里不再重复判空）。
 */
import type { Context } from "koa";
import type { Llm } from "../../../../llm.js";
import { z } from "zod";
import { llm } from "./runtime-ctx.js";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(2000),
  modes: z.array(z.enum(["zero", "few"])).min(1).max(2),
});

export type ClassifyBody = z.infer<typeof bodySchema>;

/** ① 没 Key 直接 503：否则要等 SDK 里层抛出来，错误信息对学习者不可读。 */
export function requireLlm(ctx: Context): Llm | null {
  if (!llm) {
    ctx.status = 503;
    ctx.body = {
      error: "当前 LLM_PROVIDER 没有 Key，无法真实调用（见 apps/.env.example）。",
    };
    return null;
  }
  return llm;
}

/** ② 参数闸门：空输入走这里变成 HTTP 400，对应页面「空输入（看 400）」按钮。 */
export function readClassifyBody(ctx: Context): ClassifyBody | null {
  const parsed = bodySchema.safeParse(ctx.request.body ?? {});
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = {
      error: "参数错误",
      details: parsed.error.flatten(),
      hint: "text 不能为空；modes 至少含 zero 或 few",
    };
    return null;
  }
  return parsed.data;
}
