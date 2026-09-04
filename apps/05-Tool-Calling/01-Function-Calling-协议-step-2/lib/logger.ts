/**
 * 职责：顶层日志服务（服务端）· step-2 本地实例。
 * 用法：业务代码 import { logger } from "./logger.js"，直接 logger.info(scope, msg, data?)。
 * 文件：apps/05-Tool-Calling/01-Function-Calling-协议-step-2/logs/{YYYY-MM-DD}.log（按 BJT 日切，无 serviceName 前缀）
 * 详见 apps/logger.ts + agents/05-demo.md §5.3.16。
 */
import { createLogger } from "../../../logger.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const logger = createLogger(path.join(here, "..", "logs"));
