/**
 * 职责：POST /api/ingest-upload。接收 multipart/form-data 上传的文件，走入库流水线。
 * 支持 Markdown（按 ## 分段）和 PDF（按页分段）。
 */
import fs from "node:fs";
import Router from "@koa/router";
import { HttpError, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";
import { runIngestUpload } from "../lib/flow/ingest-upload.js";

export function mountIngestUpload(router: Router): void {
  router.post("/api/ingest-upload", async (ctx) => {
    const started = Date.now();
    logger.info(
      "ingest-upload",
      "调用函数开始：POST /api/ingest-upload",
      "上传文件入库入口。支持 Markdown（按 ## 分段）和 PDF（按页分段）。",
      { 入参: "multipart/form-data（文件在 ctx.request.files）" },
    );
    try {
      const files = ctx.request.files as Record<string, import("formidable").File> | undefined;
      const file = files?.file;
      if (!file) {
        throw new HttpError(400, "没有上传文件", "请选择文件后再点上传");
      }
      if (file.originalFilename === null) {
        throw new HttpError(400, "文件名为空", "上传的文件没有名称");
      }
      const filename = file.originalFilename;
      const lower = filename.toLowerCase();
      const fileType: "markdown" | "pdf" = lower.endsWith(".md")
        ? "markdown"
        : lower.endsWith(".pdf")
          ? "pdf"
          : (() => { throw new HttpError(400, "不支持的文件类型", "只支持 .md（Markdown）和 .pdf 文件"); })();
      if (file.size === 0) {
        throw new HttpError(400, "文件是空的", "空文件不能入库");
      }
      const buffer = fs.readFileSync(file.filepath);
      logger.info(
        "ingest-upload",
        "调用函数-ingest-upload",
        "文件类型已识别，开始解析",
        {
          入参: { filename, fileType, size: file.size, mimetype: file.mimetype },
          __code: "fs.readFileSync → runIngestUpload",
        },
      );
      const result = await runIngestUpload(filename, buffer, fileType);
      logger.info(
        "ingest-upload",
        "调用函数结束：POST /api/ingest-upload",
        "入库完成，库里已有新文件的内容",
        { 返回值: result, 耗时ms: Date.now() - started },
      );
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      logger.error(
        "ingest-upload",
        "调用函数结束：POST /api/ingest-upload（失败）",
        error instanceof HttpError ? error.hint : "上传入库失败",
        { 返回值: error, 耗时ms: Date.now() - started },
      );
      sendError(ctx, error);
    }
  });
}
