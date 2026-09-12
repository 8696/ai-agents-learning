/**
 * 职责：本步核心 2 —— 只调模型，无材料，无出处。
 *
 * 数据流：POST /api/no-rag 入参 → 拼 messages（system + user）→ llm.openai.chat.completions.create
 *       → 抽 reply content → 返回 { answer, sources: [], mode: "no-rag" }
 *
 * 与 answer-with-rag.ts 对照：同一问句 / 同一模型 / 不同上下文（无材料）。这一栏专门演示
 * 「不检索 → 模型说过期的常识 / 编 → 看不到出处」 —— 选型对照的「不检索」那一面。
 */
import { logger } from "../logger.js";
import { getLlm } from "../../../../llm.js";
import { z } from "zod";

const inputSchema = z.object({
  question: z.string().min(1, "问题不能为空"),
});

const SYSTEM = "你是售后客服助手。请按用户问题回答。";

export type NoRagResult = {
  answer: string;
  sources: [];
  mode: "no-rag";
};

export async function answerWithoutRag(input: unknown): Promise<NoRagResult> {
  const { question } = inputSchema.parse(input);

  const llm = getLlm();
  const t0 = Date.now();

  logger.info(
    "│ 调用函数-answerWithoutRag",
    "调用函数开始：answerWithoutRag",
    "为什么写这条日志：左栏「不接 RAG（model only · 无材料 · 无出处）」那一侧的入口；不喂材料，看模型说过期的还是新的。" +
      " 当前：路由 /api/no-rag 收到请求；下一步交给模型。",
    { 入参: { question }, __code: "const response = await llm.openai.chat.completions.create({...});" },
  );

  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全",
    "为什么写这条日志：这是真发网络请求的那一次（看「调用函数开始：answerWithoutRag」是封装层）。" +
      " 当前：messages=[system, user]，无 tool、无检索材料。",
    {
      入参: {
        model: llm.modelA,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: question },
        ],
      },
      __code: "const response = await llm.openai.chat.completions.create(request);",
    },
  );

  const response = await llm.openai.chat.completions.create({
    model: llm.modelA,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: question },
    ],
  });

  logger.info(
    "││ 调用模型-对话补全",
    "调用模型结束：对话补全",
    "为什么写这条日志：要把 reply 原文交给路由。当前：await 已返回；下一步抽取 content。",
    {
      返回值: response,
      耗时ms: Date.now() - t0,
      字段释义: { "choices[0].message.content": "模型答复原文（左栏就是看它说过期的还是编的）" },
    },
  );

  const answer = response.choices[0]?.message?.content?.trim() ?? "";

  const result: NoRagResult = { answer, sources: [], mode: "no-rag" };

  logger.info(
    "│ 调用函数-answerWithoutRag",
    "调用函数结束：answerWithoutRag",
    "为什么写这条日志：路由只认这一层返回值。当前：左栏结果已封装好；下一步写 ctx.body。",
    { 返回值: result, 耗时ms: Date.now() - t0 },
  );

  return result;
}