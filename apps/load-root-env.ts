/**
 * 从 apps/ 加载 .env（小节 Demo + 模块 00 mini-app 共用一份 Key）
 *
 * 数据流：apps/load-root-env.ts → ./apps/.env
 */
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** apps/ 目录：本文件就在 apps/ 下 */
export const appsDir = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  ".",
);

/** 优先读 apps/.env；没有文件时回退 cwd */
export function loadRootEnv(): void {
  const envPath = resolve(appsDir, ".env");
  loadDotenv({ path: envPath });
  if (!existsSync(envPath)) {
    loadDotenv();
  }
}
