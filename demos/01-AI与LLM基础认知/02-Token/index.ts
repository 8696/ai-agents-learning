/**
 * 模块 01 · Token · 最小 Demo
 *
 * 职责：用同一套词表数一段中文、一段英文，打印 Token 数。
 * 为什么：本条要能讲清「计费单位不是字/词、中文通常更贵」——必须看见两个数字。
 *
 * 数据流：两段字符串 → cl100k encode → 打印 length
 * 不调云端 API（词表用 gpt-tokenizer / cl100k，与 MiniMax 词表可能不同，只看量级）
 */

import { encode } from "gpt-tokenizer";

const english = "Hello, I like to eat apples.";
const chinese = "你好，我喜欢吃苹果。";

const englishTokens = encode(english);
const chineseTokens = encode(chinese);

console.log("词表：cl100k（OpenAI GPT-4 常用；MiniMax 词表可能不同，用来看量级）");
console.log("");
console.log(`英文：${JSON.stringify(english)}`);
console.log(`  字符数 ${english.length}  →  Token 数 ${englishTokens.length}`);
console.log("");
console.log(`中文：${JSON.stringify(chinese)}`);
console.log(`  字符数 ${chinese.length}  →  Token 数 ${chineseTokens.length}`);
console.log("");
console.log("同一句人话，中文往往切得更碎 → 同样内容输入更贵。计费按 Token，不按字、不按词。");
