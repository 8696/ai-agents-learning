# **LLM-as-Judge**：用模型打分方便，但 Judge 自己也有偏差

> 对应模块：[模块 17 · Agent Evaluation ⭐⭐⭐⭐⭐](./README.md) · 小节进度第 1 条
> 这一小节由 Coach 按 2026-10-10 本对话 `coach start` 详解首次写入。贯穿场景是 Agent 评测——用模型当裁判给另一个模型的输出打分。学习者只减不加。进度表这一行还没打钩。下一节是轨迹评测，本节只把它当作评测流水线里另一个视角来对照，不把它当新课写完。

- **来源**：本对话 `coach start` 详解。
- **状态**：已沉淀
- **Demo**：无。这一段只检查笔记，不检查代码。从模块 14 起本仓库不再新写模拟演示，见学习总览。

> 各节写什么、达标要求：见仓库根 [AGENTS.md §7.2](../../../AGENTS.md#72-写入小节文档--小节进度对齐)。

## 是什么

**LLM-as-Judge** 是一种评测方法：用一个大语言模型（LLM）作为评判者，给另一个模型 / Agent 的输出打分或判等。常见的三种形式：

- **单模型打分**：输入一个被评输出，让 Judge 给一个分数（比如 0~1 / 1~5 / 通过-不通过）。
- **Pairwise 对比（成对对比）**：输入两个被评输出（A vs B），让 Judge 选哪个更好、或两者平手。
- **多维度分**：把一个输出按 helpfulness / accuracy / safety 等维度各评一项，不压成单分。

它和人工评估的差别：**LLM-as-Judge 是「相对便宜、自动化」的评估**；数据量大（几百到几千条）时人工评不起。**评测流水线（Evaluation Pipeline）的核心组件**就是 LLM-as-Judge：跑数据集 → 模型输出 → Judge 评分 → 出数字报告。

它**不是客观真理**——Judge 自己也是一个模型，有自己的偏好与盲点。这一节的核心就是讲：Judge 分数怎么读、有什么偏差、怎么校对。

```mermaid
flowchart LR
  data[数据集 N 条] --> run[Agent / 模型跑一份输出]
  run --> judge[Judge 模型打分]
  judge --> score[分数 / pairwise 胜出]
  score --> report[报告: 平均 + 各类别平均 + 偏差区间]
```

生活里，这是「找另一个人打分」。比自己打分客观一点，但那个人也有偏好；你让他评，他会偏向 longer answer、偏向第一个看到的答案、偏向自己出的答案。评测用 Judge 是给一个相对客观的数，但要校对 Judge 自己准不准。

## 为什么（Agent 开发要懂）

**评测是 Agent 调优客观化的唯一办法**。「我看着 Agent 改完跑得挺好」不是评测——这是凭感觉。**没有数字，你后面所有的提示词（Prompt）调整、模型换版、工具升级，全是在凭感觉猜**。改完 Agent 是变好还是变坏？你得有一条「命令出报告」的评测流水线，否则永远是「改完看着还行」。

**LLM-as-Judge 是「相对便宜」的评估方案**。人工评估代价高（每条要人看几分钟）；规则评估对「是不是同一个 SQL 句式」这种客观题好用，对「答案是否切题」这种语义题就不行；LLM-as-Judge 是中间形态——自动化、能用语义理解、但模型本身有偏差。

**把 Judge 分数当成客观真理是危险的**。Judge 也是模型——有自己的偏好：

- **位置偏好（Position Bias）**：把更好的答案放在前面 vs 后面会让 Judge 的判断有偏。
- **长度偏好（Verbosity Bias）**：Judge 倾向于给更长的答案高分，即使长 ≠ 好。
- **自我偏好（Self-Preference Bias）**：让 Judge 评自己家族的模型输出，会偏向高分。
- **谄媚（Sycophancy）**：Judge 容易同意上下文给的暗示——比如「前一条得了 8 分」会让 Judge 把下一条也评高。
- **顺序偏好（Order Bias）**：和位置偏好类似，但更一般——前面看了什么会影响后面打分。

把 Judge 分数当真理 = 把这些偏差当真理。**用 Judge 就要测 Judge**——用人类抽检 / 已知 gold set（标注好的标准答案集合）来校对 Judge 的偏差。

## 易混点

| 你以为是一回事的两个版本 | 它们实际差在哪 | 用错时会发生什么 |
| --- | --- | --- |
| LLM-as-Judge 分数 ≠ 客观真理 | Judge 也是模型，有偏差 | 把分数当 gold standard，把偏差当结论 |
| LLM-as-Judge 与 Human Eval（人工评估） | 后者更准但贵、慢；前者便宜、自动、有偏差 | 数据量小 → 用 Human；数据量大 → LLM + 抽检 |
| LLM-as-Judge 与 Rule-based Eval（基于规则的评测） | 后者对客观题（exact match / 检索命中 / SQL 关键字）很准；前者对语义题（helpful / relevant / safe）能用 | 检索命中用 Judge = 浪费且噪声大；用规则 |
| 单模型打分 vs Pairwise 对比 | 前者评「一条有多好」；后者评「一条 vs 另一条哪个好」 | 难给出绝对分数时用 pairwise；判定「A 模型升级了没」用 pairwise |
| Judge 模型选择 | 大模型 / 多模型 ensemble（多模型组合）/ 用同家族模型做 Judge | 自己评自己 = self-preference bias；选不同家族 |
| Judge Prompt + Rubric（评分准则） | Rubric 把「几分对应什么」写明；不加 rubric Judge 自由发挥 | 不加 rubric = 高方差，每次分数不一致 |
| Judge 与 gold answer 的关系 | Judge 评分不必等于 gold answer 的字面 | 让 Judge 严格匹配字面 = 又贵又断 |
| 多维度评分 vs 压成单分 | 多维度分保留信号；单分丢掉信息 | 把 accuracy / safety / helpfulness 压成 single score = 看不到「哪儿变好哪儿变坏」 |
| Judge 偏差检测 vs 假设 Judge 干净 | 偏差是一直存在的；不检测 = 不当问题 | 跑小数据集校对才知 Judge 准不准 |
| Few-shot Judge vs Zero-shot Judge | Few-shot 评分更稳；zero-shot 全靠 prompt | 数据稳定时 few-shot 比 zero-shot 便宜 |

## 例子

### 大数据集自动化评测

跑 1000 条客服对话数据 → Agent 输出回答 → Judge 给每条打分（1~5） → 报告每条分数 + 总体平均 + 各类别平均。**比人工评 1000 条便宜得多**。但 Judge 偏差（大模型偏好 longer answer）会让「字数多 = 高分」的输出偶然胜出——所以要校对。

### Pairwise：判定 prompt A 是否比 prompt B 好

跑同一数据集（500 条），A 跑的输出 + B 跑的输出，让 Judge 选哪个更好。最后报「A 胜出 320 条，B 胜出 130 条，平手 50 条」。这是判定「升级 prompt 是否真的升级」的标准做法——比单分打分稳定。

### 检测位置偏好

把同一对（A vs B）随机换位置跑两次——A 在前 / B 在前 vs A 在后 / B 在前。如果两次 Judge 选 A 的比例差异大（>10%），说明 Judge 有位置偏好，要换 Judge 模型或加 rubric。

### 用 gold answer 对齐

自己手标 100 条 gold（每条已知正确答案与分数），跑 Judge 评这 100 条，看 Judge 分数与 gold 分数的相关性（具体数值要算相关系数）。相关性低：Judge 不靠谱，要换模型或加 rubric。

### 多维度评分

不只评「helpful」，还评：accuracy / completeness / safety / tone。每个维度都 1~5 分。**比单分更能看到哪里变差**。比如某次升级 prompt 让 helpfulness 从 4.2 → 4.5（涨了），但 safety 从 4.5 → 3.8（跌了）。单分被掩盖；多维度分暴露。

### 检索命中 vs Judge 评判

「检索 hit-rate」是规则题——文档 ID 在不在 gold 集合里。**用 Judge 评「检索结果好不好」经常不如规则**——Judge 也会看字面、看长度偏差。规则能算的就别上 Judge。

## 需求清单

下面每条都用评测流水线在仓库里的真实场景验收。验收是讲得清。真要做出来，做在单独的真实项目里。本仓库这一节不写模拟页。

1. **业务场景**：跑 1000 条客服对话，Agent 输出每条评分。**目标**：自动化评测流水线。**涉及**：单模型打分 + 报告。**验收**：能 1 条命令跑出每条分数 + 平均 + 各类别平均；偏差区间有报告。

2. **业务场景**：升级 prompt 后能不能上。**目标**：判定升级是否真的好。**涉及**：pairwise 对比 + gold set 对齐。**验收**：A vs B 输出让 Judge 选哪个好；gold set 跑相关性核对。

3. **业务场景**：Judge 的位置偏好检测。**目标**：知道 Judge 有没有位置偏好。**涉及**：随机换位置跑两次。**验收**：相同对换位置后胜出比例差异 < 10%。

4. **业务场景**：让 Judge 评「回答是否切题」。**目标**：用语义判定，而不仅仅是关键词匹配。**涉及**：多维度 helpfulness / relevance 评分 + rubric。**验收**：rubric 写明分数含义；多人看 Judge 分数与小样本人工评分一致。

5. **业务场景**：规则题用规则评测，语义题用 Judge。**目标**：用最合适的方法。**涉及**：exact match / 检索 hit-rate 用规则；helpfulness / safe 用 Judge。**验收**：检索命中是规则题（用规则）；helpful 是语义题（用 Judge）。

6. **业务场景**：升级要能看到 safety / accuracy / helpfulness 三个维度各变好还是变坏。**目标**：避免单分掩盖问题。**涉及**：多维度评分。**验收**：报告里有三维度各自分数；某维度降 > 0.5 报警。

7. **业务场景**：跨模型对比。**目标**：新模型 vs 旧模型哪个好。**涉及**：在两份输出上跑 pairwise。**验收**：报告胜出比例；不依赖单分。

8. **业务场景**：人工抽检对齐。**目标**：每 200 条抽 10 条人工核对。**涉及**：gold set + 人类评分。**验收**：Judge 分数与人类分数相关性（具体算相关系数）足够高。

## 这几种情况都要分开讲

| 情况 | 数据怎么走 | 需求 |
| --- | --- | --- |
| 打分方式（单模型 / pairwise / 多模型 ensemble） | 评测任务形态 | 需求 1、2、7 |
| 评分维度（单分 / 多维度） | 信息保留度 | 需求 6 |
| 偏差种类（位置 / 长度 / 自我 / 谄媚 / 顺序） | Judge 自身倾向 | 需求 3 |
| 校对方式（人工抽检 / gold set 对齐 / 偏差区间） | 校正 Judge | 需求 4、8 |
| 协议（zero-shot / few-shot / rubric） | Judge 输入结构 | 需求 4 |
| 规则 vs Judge | 客观题 / 语义题 | 需求 5 |

## 取舍

| 你在意的事 | 更合适的做法 |
| --- | --- |
| 数据集 < 50 条 | 人工评；不上 Judge |
| 数据集大 + 客观题（命中 / 完全一致） | 规则评测 |
| 数据集大 + 语义题（切题 / helpful / safe） | LLM-as-Judge + 人工抽检校对 |
| 难给出绝对分数 | pairwise 对比 |
| 校验升级是否真的好 | pairwise + 加 gold set 对齐 |
| Judge 偏差太大 | 加 human-in-the-loop / 多 Judge 投票 |
| 升级前后跑同一数据集 | regression 评测（回归测试） |
| 升级前后选哪种上 | ship / no-ship（决定上不上线）决议 |
| 想看到具体维度变化 | 多维度评分 |
| 想用同一个 Judge 评不同模型 | 跨家族 Judge 减小 self-preference |
| Judge 跑得贵 | 用 few-shot + rubric + 小模型做 Judge |
| Judge 跑得不准 | 换模型 / 加 rubric / 多模型 ensemble |
| 数据有 ground truth（已知正确答案） | 用规则评测（不要 Judge） |
| 数据是开放性问答 | LLM-as-Judge |
| judge 自己也是被评对象 | 换 Judge 模型，跨家族 |

## 踩坑

- **Judge 分数 = 真值**。最常见错。把 Judge 分数当 gold standard。
- **用同一模型评自己**。self-preference bias。
- **不校对 Judge**。不知道 Judge 准不准就信。
- **只报单分**。看不到具体维度问题。
- **不给偏差区间**。只报平均分不报标准差 / 置信区间 = 看不清方差。
- **把检索命中用 Judge 评**。这种是规则题。
- **Judge prompt 没 rubric**。每次评分漂移。
- **把 Judge 加进持续集成（CI，Continuous Integration）但没校对**。失败时不知道是 prompt 改坏了还是 Judge 飘了。
- **gold set 太小**（< 30 条）。对齐相关性不可靠。
- **不抽人工**。Judge 完全自动跑，几年后发现对齐了运气 / 错位了没人发现。
- **升级前后只跑一次**。Judge 评分有方差，多跑几次取稳定值。
- **Judge 模型偷偷换**。换了 Judge 但对齐没重做。

## 过关自检

对照「本条要能讲清」= **知道不能把 Judge 分数当成客观真理**：

- 能说出 Judge 自身有偏差（位置 / 长度 / 自我 / 谄媚 / 顺序偏好）。
- 能说出用 Judge 就要测 Judge——人工抽检 / gold set 对齐。
- 能区分 Judge vs 规则评测——客观题用规则、语义题用 Judge。
- 能说出多维度评分比压成单分更能看到具体维度变化。
- 能说出 pairwise 对比在难定单分 + 判定升级是否真的好时更有用。
- 能说出 self-preference bias——用同家族模型评自己会偏向高分。
- 能说出 rubric + few-shot 在保持 Judge 一致性上起的作用。
- 能说出在跨家族 / 多 Judge 投票 / 偏差区间上控制偏差的方法。

## 还没搞懂的

- 各家 LLM-as-Judge 协议差异（OpenAI Evals / LangSmith / Promptfoo / RAGAS）：具体 rubric / few-shot / 输出 schema 的差异 → 自己查各家文档
- 偏差校正的标准方案（calibration sets / bias correction）：具体怎么算 deviation → 自己查
- 不同家族 Judge 在 self-preference 上的程度差异：实际跑一下看偏差大小
- 把 LLM-as-Judge 推到领域专门评测（医疗 / 法律 / 代码）的协议差异
- Judge LLM 学术偏倚研究的现状

## 我追问过的

本对话没有知识追问。不编造。

## 契约记录

- 本轮「2」是对上一轮选项 2 的回应（跨到模块 17 并按直接沉淀文档推 17-01），不是认知追问，不进「我追问过的」。
- 15-01 的 `coach complete` 已正式补跑过打钩前检查 1 + 2（这一轮上一段对话）；15-02 / 15-03 之前已由会话补齐。所有外部条目已 ✅。
- 16 模块全部 4 节已 ✅。
- 进度表 17-01 这一行仍是 ⬜。
- 本仓库模块 14 之后这一节不写 `## Demo 子节进度` 块，也不要求 `apps/` 有新代码；可运行演示做在学习者单独的真实项目里。
- 这一轮实际打开过的外部 URL：没有。`## 还没搞懂的` 列的几项源自公开资料的检索摘要，没有逐行打开那一页。

## Demo 判断

```text
Demo 判断
- 小节：LLM-as-Judge：用模型打分方便，但 Judge 自己也有偏差
- 结论：无
- 理由：这一段只检查笔记，不检查代码。从模块 14 起，可运行的代码放在学习者单独的真实项目里，见学习总览。本条要能讲清的是「用 Judge 打分的方法 + Judge 偏差 + 校对 + 协议」四件套，而不是某一段代码。
- 你学完要：笔记写在这一份小节文档里。不新建 apps/ 文件夹。
```
