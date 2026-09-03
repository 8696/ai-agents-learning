/**
 * 职责：Tool 定义的 TypeScript 形状。
 * 数据流：registry / tool-defs 共用；handler 入参由 Zod 推出。
 */
import { z } from "zod";

export type ToolHandler<P> = (input: P) => Promise<unknown>;

export interface ToolDef<P = unknown> {
  name: string;
  description: string;
  input: z.ZodType<P>;
  handler: ToolHandler<P>;
}
