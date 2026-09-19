/**
 * 职责：三条对照路由共用的入参校验。空字符串算第一类失败（4xx）。
 * 数据流：ctx.request.body → Zod → guestUtterance；不通过返回中文错误。
 */
import { z } from "zod";

const BodySchema = z.object({
  guestUtterance: z.string().min(1, "客人那句话不能是空的").optional(),
});

export function parseGuestUtterance(raw: unknown):
  | { ok: true; guestUtterance: string }
  | { ok: false; error: string } {
  const parsed = BodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "入参不合法" };
  }
  return {
    ok: true,
    guestUtterance: parsed.data.guestUtterance ?? "我牛奶过敏，来一杯拿铁",
  };
}
