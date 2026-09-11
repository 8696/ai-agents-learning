/**
 * 职责：POST /api/chunk/pdf —— PDF 按页切（step-4 · F 件）。
 * 数据流：body = { pdfBase64 } → Buffer → PDFParse → chunkByPdf → { chunks, stats }。
 *
 * 不调 LLM：纯本地 PDF 解析（pdf-parse v2.4.5 是 ESM 模块，导出 PDFParse 类）。
 * 失败仅来自 Zod 校验（4xx）+ PDFParse 内部抛错（4xx 包装返回）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { PDFParse } from "pdf-parse";
import { chunkByPdf } from "../lib/flow/pdf-chunker.js";

const bodySchema = z.object({
  pdfBase64: z.string().min(1, "pdfBase64 不能为空"),
});

export function mountChunkPdf(router: Router): void {
  router.post("/api/chunk/pdf", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法",
        issues: parsed.error.issues,
        hint: "pdfBase64 必填（PDF 文件的 base64 编码字符串）。",
      };
      return;
    }
    let buffer: Buffer;
    try {
      buffer = Buffer.from(parsed.data.pdfBase64, "base64");
    } catch (e) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "pdfBase64 解码失败", hint: "请确认是有效的 base64 字符串。" };
      return;
    }
    let pdfText = "";
    let pageTexts: string[] = [];
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      pdfText = result.text || "";
      pageTexts = (result.pages || []).map(function (p) { return p.text || ""; }).filter(function (t) { return t.trim().length > 0; });
      await parser.destroy();
    } catch (e) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "PDF 解析失败",
        hint: e instanceof Error ? e.message : "请确认是有效的 PDF 文件。",
      };
      return;
    }
    if (!pdfText.trim()) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "PDF 内容为空", hint: "该 PDF 似乎没有可提取的文本（可能是扫描图片型 PDF）。" };
      return;
    }
    // 优先用 parser 返回的 pages 数组（更准确）；fallback 到 splitByFormFeed
    const textToChunk = pageTexts.length > 0 ? pageTexts.join("\f") : pdfText;
    const result = chunkByPdf(textToChunk);
    ctx.body = { ok: true, result };
  });
}