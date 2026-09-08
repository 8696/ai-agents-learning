/**
 * 职责：本地日志服务 freeze 副本（拷自顶层 2026-09-08）。
 * 数据流：业务代码 import { logger } from "./logger.js" → logger.info(scope, msg, explain, data?) 写文件 + console。
 * 为什么拷贝：顶层 apps/logger.ts 只是模板；锁定/未锁定一律禁止运行时 import 顶层（§5.3.12 / §5.3.16）。
 * 用法：业务代码 import { logger } from "./logger.js"。
 *
 * 每条前空一行；msg / explain / data 三块之间也空一行（§5.3.16）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface Logger {
  debug(scope: string, msg: string, explain: string, data?: unknown): void;
  info (scope: string, msg: string, explain: string, data?: unknown): void;
  warn (scope: string, msg: string, explain: string, data?: unknown): void;
  error(scope: string, msg: string, explain: string, data?: unknown): void;
}

export interface CreateLoggerOptions {
  logDir: string;
  /** console 输出的最低等级；默认 debug（全打）。文件不受影响（文件 = 全量） */
  consoleLevel?: LogLevel;
}

// 内置安全序列化（私有）。处理 Error / Map / Set / Date / Buffer / 循环引用 / 大对象截断。
const MAX_BYTES = 50 * 1024;
const MAX_DEPTH = 10;

function safeValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (value === null) return null;
  if (value === undefined) return undefined;

  const t = typeof value;
  if (t === "string" || t === "boolean") return value;
  if (t === "number") return Number.isFinite(value as number) ? value : String(value);
  if (t === "bigint") return `${(value as bigint).toString()}n`;
  if (t === "symbol") return (value as symbol).toString();
  if (t === "function") return `[Function: ${(value as { name?: string }).name || "anonymous"}]`;

  if (value instanceof Error) {
    const out: Record<string, unknown> = {
      __type: "Error",
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
    for (const k of Object.keys(value)) out[k] = (value as unknown as Record<string, unknown>)[k];
    return out;
  }
  if (value instanceof Date) return { __type: "Date", iso: value.toISOString() };
  if (value instanceof Buffer) {
    const preview = value.subarray(0, 32).toString("hex");
    return {
      __type: "Buffer",
      length: value.length,
      hexPreview: value.length > 32 ? `${preview}…` : preview,
    };
  }
  if (value instanceof Map) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const entries: unknown[] = [];
    for (const [k, v] of value) {
      entries.push([safeValue(k, seen, depth + 1), safeValue(v, seen, depth + 1)]);
    }
    return { __type: "Map", entries };
  }
  if (value instanceof Set) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return {
      __type: "Set",
      values: Array.from(value).map(v => safeValue(v, seen, depth + 1)),
    };
  }
  if (depth >= MAX_DEPTH) {
    return Array.isArray(value) ? "[…]" : "{…}";
  }
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(v => safeValue(v, seen, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = safeValue(v, seen, depth + 1);
  }
  return out;
}

function serialize(value: unknown): string {
  let json: string | undefined;
  try {
    json = JSON.stringify(safeValue(value, new WeakSet(), 0));
  } catch {
    return "<unserializable>";
  }
  if (json === undefined) return "undefined";
  if (json.length > MAX_BYTES) {
    return `${json.slice(0, MAX_BYTES)}…truncated(${json.length}→${MAX_BYTES})`;
  }
  return json;
}

function todayBjt(d: Date): string {
  const bjt = new Date(d.getTime() + 8 * 3600 * 1000);
  const y = bjt.getUTCFullYear();
  const m = String(bjt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(bjt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function nowBjt(d: Date): string {
  const bjt = new Date(d.getTime() + 8 * 3600 * 1000);
  const y = bjt.getUTCFullYear();
  const m = String(bjt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(bjt.getUTCDate()).padStart(2, "0");
  const hh = String(bjt.getUTCHours()).padStart(2, "0");
  const mi = String(bjt.getUTCMinutes()).padStart(2, "0");
  const ss = String(bjt.getUTCSeconds()).padStart(2, "0");
  const ms = String(bjt.getUTCMilliseconds()).padStart(3, "0");
  return `${y}-${m}-${dd} ${hh}:${mi}:${ss}.${ms} +08:00`;
}

function indentLines(text: string, prefix: string): string {
  return text.split("\n").map(line => line ? prefix + line : line).join("\n");
}

/** data 一律下一行起 indent-2 多行；有 __code 时其余字段同样，禁止 compact 一行 */
function formatDataJson(value: unknown): string {
  const compact = serialize(value);
  let pretty: string;
  try {
    pretty = JSON.stringify(JSON.parse(compact), null, 2);
  } catch {
    pretty = compact;
  }
  return `  data=\n${indentLines(pretty, "  ")}\n`;
}

function renderData(data: unknown): string | null {
  if (data === undefined) return null;
  if (data === null) return "  data=null\n";

  // __code 字段：自动以 ── code ── 分隔块输出源代码
  if (typeof data === "object" && !Array.isArray(data) && "__code" in (data as Record<string, unknown>)) {
    const obj = data as Record<string, unknown>;
    const codeVal = obj.__code;
    const rest = { ...obj };
    delete rest.__code;
    let out = "";
    if (Object.keys(rest).length > 0) {
      out += formatDataJson(rest);
    }
    out += `  ── code ──\n`;
    out += indentLines(String(codeVal ?? ""), "  ") + "\n";
    out += `  ── end code ──\n`;
    return out;
  }

  return formatDataJson(data);
}

export function createLogger(logDirOrOpts: string | CreateLoggerOptions): Logger {
  const opts: CreateLoggerOptions = typeof logDirOrOpts === "string"
    ? { logDir: logDirOrOpts }
    : logDirOrOpts;
  const { logDir, consoleLevel = "debug" } = opts;
  const consoleMin = LEVEL_RANK[consoleLevel];

  fs.mkdirSync(logDir, { recursive: true });

  function emit(level: LogLevel, scope: string, msg: string, explain: string, data?: unknown): void {
    const ts = nowBjt(new Date());
    // 每条前空一行；msg / explain / data 三块之间也空一行（§5.3.16）
    const head = `${ts} ${level.toUpperCase()} ${scope}`;
    const dataBlock = renderData(data) ?? "";
    const fileLine =
      `\n${head}\n` +
      `\n  msg=${msg}\n` +
      `\n  explain=${explain}\n` +
      `\n${dataBlock}`;

    // 文件：全量；写失败静默（日志失败不应让业务崩）
    try {
      const fname = `${todayBjt(new Date())}.log`;
      fs.appendFileSync(path.join(logDir, fname), fileLine, "utf8");
    } catch {
      // ignore
    }

    // console：受 consoleLevel 控制
    if (LEVEL_RANK[level] >= consoleMin) {
      const tag = `[${level.toUpperCase()}] [${scope}] ${ msg} — ${explain}`;
      if (data === undefined) {
        // eslint-disable-next-line no-console
        console.log(tag);
      } else {
        // eslint-disable-next-line no-console
        console.log(tag, data);
      }
    }
  }

  return {
    debug: (s, m, e, d) => emit("debug", s, m, e, d),
    info:  (s, m, e, d) => emit("info",  s, m, e, d),
    warn:  (s, m, e, d) => emit("warn",  s, m, e, d),
    error: (s, m, e, d) => emit("error", s, m, e, d),
  };
}

// ── 本地 logger 实例（freeze 副本专用）──
const here = path.dirname(fileURLToPath(import.meta.url));
export const logger = createLogger(path.join(here, "..", "logs"));