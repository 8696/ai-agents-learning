/**
 * 职责：Zero / Few 一次调用的结果形状（成功带 Zod 判定，失败带 HTTP 状态）。
 * 数据流：classify-one 产出 → classify-modes 聚合成 results[] → route 原样回前端。
 */
import type { z } from "zod";
import type { VerdictSchema } from "./presets.js";

export type ShotMode = "zero" | "few";

export type ClassifyOk = {
  mode: ShotMode;
  ok: true;
  raw: string;
  /** 去掉思考块之后、交给 Zod 的那段 */
  stripped: string;
  /** 原文是否含思考块（协议 A 上 MiniMax 一类模型常见） */
  hadThinking: boolean;
  /** 剥离思考块之后能否被 Zod 吃进去（网关口径，不是「模型嘴边已是纯 JSON」） */
  formatValid: boolean;
  parsed: z.infer<typeof VerdictSchema> | null;
  formatError: string | null;
};

export type ClassifyFail = {
  mode: ShotMode;
  ok: false;
  error: string;
  status: number;
};

export type ClassifyRow = ClassifyOk | ClassifyFail;
