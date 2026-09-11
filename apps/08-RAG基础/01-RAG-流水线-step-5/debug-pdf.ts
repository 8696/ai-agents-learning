/**
 * Debug：直接调用 pdf-parse v2 打印 result.pages 和 result.text 看看结构
 */
import fs from "node:fs";
import path from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("usage: tsx debug-pdf.ts <pdf-file>");
  process.exit(1);
}

const buffer = fs.readFileSync(path.resolve(file));

const { PDFParse } = await import("pdf-parse");
const parser = new PDFParse({ data: buffer });
const result = await parser.getText();

console.log("=== result.text.length ===", result.text.length);
console.log("=== result.text.first200 ===");
console.log(JSON.stringify(result.text.slice(0, 200)));
console.log("=== result.text.last200 ===");
console.log(JSON.stringify(result.text.slice(-200)));
console.log("=== \\f count ===", (result.text.match(/\f/g) || []).length);
console.log("=== result.pages.length ===", result.pages?.length);
if (result.pages && result.pages.length > 0) {
  console.log("=== pages[0] ===", JSON.stringify(result.pages[0]).slice(0, 300));
  console.log("=== pages[1] ===", JSON.stringify(result.pages[1]).slice(0, 300));
  console.log("=== pages[2] ===", result.pages[2] ? JSON.stringify(result.pages[2]).slice(0, 300) : "(no page 2)");
}
