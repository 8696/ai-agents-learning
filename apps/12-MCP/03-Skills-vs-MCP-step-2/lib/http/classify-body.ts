/**
 * 职责：POST /api/classify/:scenarioId —— 分类题。判断题面应落进哪个正确的桶。
 * 数据流：校验 + 查 SCENARIOS + 拼 result。错选项照样返回解释（不掩盖学习）。
 */
import { z } from "zod";

const BodySchema = z.object({
  optionId: z.string().min(1, "选项 id 不能是空的"),
});

export function parseClassifyBody(raw: unknown):
  | { ok: true; optionId: string }
  | { ok: false; error: string } {
  const parsed = BodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "入参不合法" };
  }
  return { ok: true, optionId: parsed.data.optionId };
}