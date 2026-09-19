/**
 * 职责：MCP 工具（Tool）+ MCP 资源（Resource）的两条模拟动作；run-assembly.ts 引用它们。
 * 为什么单独成文件：把 MCP 连接能力的「真出杯 / 真读过敏事实」从主流程拆出来，方便主流程只管「装配怎么走」。
 * 数据流：makeLatte(cupSize) → 模拟 tools/call 返回；readAllergy() → 模拟 resources/read("cafe://allergy-info") 返回。
 * 不调大模型；纯本地固定剧本。
 */
import { logger } from "../logger.js";
import { ALLERGY_BODY } from "./skill-loader.js";

export const MAKE_LATTE_CODE = `function makeLatte(cupSize) {
  return "拿铁做好了：" + cupSize + "，约 3 分钟。";
}`;

export const READ_ALLERGY_CODE = `function readAllergy() {
  return ALLERGY_BODY; // cafe://allergy-info
}`;

export function makeLatte(cupSize: string): string {
  const started = Date.now();
  logger.info(
    "│ 调用函数-makeLatte",
    "调用函数开始：makeLatte",
    "为什么写这条日志：这是 MCP 工具（Tool）真出杯的那一跳。当前：只有接了吧台才会走到这里。",
    { 入参: { cupSize }, __code: MAKE_LATTE_CODE },
  );
  const result = `拿铁做好了：${cupSize}，约 3 分钟。`;
  logger.info(
    "│ 调用函数-makeLatte",
    "调用函数结束：makeLatte",
    "为什么写这条日志：对照「有没有真出杯」。当前：已经返回出杯文案。",
    {
      返回值: result,
      耗时ms: Date.now() - started,
      字段释义: { 返回值: "模拟 tools/call(make_latte) 的正文，不是模型编的" },
    },
  );
  return result;
}

export function readAllergy(): { uri: string; text: string } {
  const started = Date.now();
  logger.info(
    "│ 调用函数-readAllergy",
    "调用函数开始：readAllergy",
    "为什么写这条日志：这是 MCP 资源（Resource）按 URI 递事实。当前：技能要求先读过敏原。",
    { 入参: { uri: "cafe://allergy-info" }, __code: READ_ALLERGY_CODE },
  );
  const row = { uri: "cafe://allergy-info", text: ALLERGY_BODY };
  logger.info(
    "│ 调用函数-readAllergy",
    "调用函数结束：readAllergy",
    "为什么写这条日志：对照「有没有先读事实再决定出杯」。当前：正文已返回。",
    {
      返回值: row,
      耗时ms: Date.now() - started,
      字段释义: { uri: "资源地址", text: "过敏事实：拿铁含牛奶" },
    },
  );
  return row;
}