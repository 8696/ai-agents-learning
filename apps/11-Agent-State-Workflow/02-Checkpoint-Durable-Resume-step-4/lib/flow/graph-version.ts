/**
 * 职责：进程内的 graphVersion 状态机（变体 J）。
 * 数据流：默认 "v1"；通过 setCurrentGraphVersion 切到 "v2" / 任意字符串。
 * 为什么单独成文件：writeCheckpoint / readCheckpoint 都要读写 graphVersion，状态留在一个文件里好管。
 */
import { logger } from "../logger.js";

let currentGraphVersion = "v1";

export function getCurrentGraphVersion(): string {
  return currentGraphVersion;
}

export function setCurrentGraphVersion(version: string): string {
  const prev = currentGraphVersion;
  currentGraphVersion = version;
  logger.info(
    "图版本-状态",
    "图版本切换",
    `为什么写这条日志：变体 J 演示。CheckpointRecord 写入时携带当前 graphVersion；readCheckpoint 加载时若不匹配会抛 GRAPH_VERSION_MISMATCH。`,
    { 从: prev, 到: currentGraphVersion },
  );
  return currentGraphVersion;
}
