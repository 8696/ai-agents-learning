/**
 * 从 apps/ 加载 .env（小节 Demo 共用；Key 不放仓库根，也不在 demos/ 重复一份）
 *
 * 数据流：demos/load-root-env.ts → ../apps/.env
 */
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** apps/ 目录：本文件在 demos/，上一级再进 apps/ */
export const appsDir = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../apps",
);

/** 优先读 apps/.env；没有文件时回退 cwd */
export function loadRootEnv(): void {
  const envPath = resolve(appsDir, ".env");
  loadDotenv({ path: envPath });
  if (!existsSync(envPath)) {
    loadDotenv();
  }
}
