/**
 * 从 apps/ 目录加载 .env（各入口文件共用；Key 不放仓库根，也不在每个子项目重复一份）
 */
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** apps/ 目录：src/ → 01-chatgpt-mini/ → apps/ */
export const appsDir = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../..",
);

/** 优先读 apps/.env；没有文件时回退 cwd（兼容误把 .env 放在子项目里） */
export function loadRootEnv(): void {
  const envPath = resolve(appsDir, ".env");
  loadDotenv({ path: envPath });
  if (!existsSync(envPath)) {
    loadDotenv();
  }
}
