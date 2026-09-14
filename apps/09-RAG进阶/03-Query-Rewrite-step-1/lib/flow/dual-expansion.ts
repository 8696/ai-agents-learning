/**
 * 职责：规则 vs 模型分列（变体 10）—— 同一次输入，两种补词器并列：
 *   规则补词（本地同义词表）+ 模型补词（调 LLM 生成 addedTerms）。
 * 数据流：query → ruleExpand（复用 lib/flow/expand-query.ts）+ modelExpand（调模型）→ 各自扩展句 → 各自检索 → 两份名单。
 * 本步核心：规则和模型不是黑盒；同一条问句两种补词产出会不一样，命中切块也不一样。
 */
import { getLlm } from "../../../../llm.js";
import { expandByRules } from "./expand-query.js";
import { retrieveByQuery, type RetrieveResult } from "./rewrite-and-retrieve.js";
import { logger } from "../logger.js";

/**
 * 模型补词：调 LLM 生成 addedTerms（库里可能出现的同义词 / 政策名）。
 * prompt：只输出 JSON：{"addedTerms": ["词1", "词2"]}；不替用户回答。
 */
async function modelExpand(query: string): Promise<{
  addedTerms: string[];
  expandModelCall: { provider: string; model: string; messages: Array<{ role: string; content: string }> };
}> {
  const llm = getLlm();
  const messages: Array<{ role: "system" | "user"; content: string }> = [
    {
      role: "system",
      content:
        "你是检索前的查询扩展器，不是客服。基于用户问句，输出库里可能出现的同义词 / 政策名 / 货号 / 关键词。" +
        "只输出 JSON：{\"addedTerms\": [\"词1\", \"词2\"]}。不要回答用户的问题、不要改原句、不要解释。",
    },
    {
      role: "user",
      content: "用户原句：" + query + "\n\n请输出库里可能出现的同义词 / 政策名 / 关键词（用 JSON 数组）。",
    },
  ];
  const request = { model: llm.modelA, temperature: 0, messages };

  logger.info(
    "│ 调用模型-模型补词",
    "调用模型开始：模型补词",
    "为什么写这条日志：模型补词是真发网络请求的那一次，不用它就没有模型产出。当前：在 modelExpand 里面。",
    { 入参: request, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );
  const tModel = Date.now();
  const response = await llm.openai.chat.completions.create(request);
  logger.info(
    "│ 调用模型-模型补词",
    "调用模型结束：模型补词",
    "为什么写这条日志：要解析 JSON 里的 addedTerms 数组。当前：模型已返回。",
    {
      返回值: response,
      耗时ms: Date.now() - tModel,
      字段释义: { "choices[0].message.content": "期望是 { addedTerms: [...] } JSON" },
    },
  );

  const content = response.choices[0]?.message?.content ?? "";
  const stripped = content.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("模型补词没有返回 JSON 对象");
  }
  const parsed: unknown = JSON.parse(stripped.slice(start, end + 1));
  const arr = (parsed as { addedTerms?: unknown }).addedTerms;
  if (!Array.isArray(arr)) {
    throw new Error("模型补词 addedTerms 不是数组");
  }
  const addedTerms = arr.map(function (s) { return String(s).trim(); }).filter(function (s) { return s.length > 0; });
  return { addedTerms, expandModelCall: { provider: llm.provider, model: llm.modelA, messages } };
}

export type DualExpansionSide = {
  /** 扩展方式：rule = 同义词表；model = 调 LLM */
  method: "rule" | "model";
  /** 补进来的库用语 */
  addedTerms: string[];
  /** 原句 + addedTerms 拼成的扩展句 */
  expandedQuery: string;
  /** 用扩展句检索的名单 */
  retrieve: RetrieveResult;
  /** 仅 model 模式存在：模型调用详情 */
  modelCall?: { provider: string; model: string; messages: Array<{ role: string; content: string }> };
};

export type DualExpansionAndRetrieveResult = {
  query: string;
  rule: DualExpansionSide;
  model: DualExpansionSide;
};

export async function dualExpansionAndRetrieve(query: string, hasLlm: boolean): Promise<DualExpansionAndRetrieveResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-dualExpansionAndRetrieve",
    "调用函数开始：dualExpansionAndRetrieve",
    "为什么写这条日志：规则 vs 模型分列要求两侧请求能分开看。当前：即将规则补词 + 模型补词并行做。",
    { 入参: { query, hasLlm } },
  );

  if (!hasLlm) {
    throw new Error("模型补词需要 LLM；当前没密钥。请在 apps/.env 配置后再跑。");
  }

  // 规则补词 + 模型补词并行（节省一点时间）
  const [{ expandedQuery: ruleQuery, addedTerms: ruleTerms }, { addedTerms: modelTerms, expandModelCall }] = await Promise.all([
    Promise.resolve().then(function () { return expandByRules(query); }),
    modelExpand(query),
  ]);

  const ruleRetrieve = retrieveByQuery(ruleQuery);
  const modelQuery = modelTerms.length > 0 ? query + " " + modelTerms.join(" ") : query;
  const modelRetrieve = retrieveByQuery(modelQuery);

  const result: DualExpansionAndRetrieveResult = {
    query,
    rule: {
      method: "rule",
      addedTerms: ruleTerms,
      expandedQuery: ruleQuery,
      retrieve: ruleRetrieve,
    },
    model: {
      method: "model",
      addedTerms: modelTerms,
      expandedQuery: modelQuery,
      retrieve: modelRetrieve,
      modelCall: expandModelCall,
    },
  };

  logger.info(
    "调用函数-dualExpansionAndRetrieve",
    "调用函数结束：dualExpansionAndRetrieve",
    "为什么写这条日志：页面要同时看见两侧的 addedTerms / 扩展句 / 名单。当前：规则补词 + 模型补词 + 两次检索都完成。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      __code:
        "const { ruleQuery, ruleTerms } = expandByRules(query);\n" +
        "const { modelTerms, expandModelCall } = await modelExpand(query);\n" +
        "const ruleRetrieve = retrieveByQuery(ruleQuery);\n" +
        "const modelQuery = modelTerms.length ? query + ' ' + modelTerms.join(' ') : query;\n" +
        "const modelRetrieve = retrieveByQuery(modelQuery);",
      字段释义: {
        "rule.addedTerms": "本地同义词表命中（规则补词）",
        "model.addedTerms": "LLM 生成（模型补词）；可能与规则重叠",
        "rule.expandedQuery vs model.expandedQuery": "同原句 + 不同 addedTerms",
      },
    },
  );
  return result;
}
