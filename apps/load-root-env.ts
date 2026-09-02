/**
 * 从 apps/ 根目录加载唯一一份 .env（小节 Demo + 模块 00 mini-app 共用）
 *
 * 职责：只负责「把 Key 读进 process.env」，不解释提供商、不创建 SDK。
 *       谁用哪家模型、协议 A/B 怎么配，一律交给 apps/llm.ts。
 *
 * 数据流：
 *   本文件位于 apps/load-root-env.ts
 *     → 算出 apps/ 绝对路径
 *     → dotenv 读 apps/.env
 *     → 写入 process.env（MINIMAX_* / ZHIPU_* / CUSTOM_* / LLM_PROVIDER …）
 *     → getLlm() 再按 LLM_PROVIDER 挑选其中一组
 *
 * 为什么单独拆这一层：
 *   1. 各 Demo 的启动目录不一定是 apps/（tsx 相对 cwd）。dotenv 默认读 process.cwd()/.env，
 *      从仓库根或别的目录启动会读空，看起来像「Key 没配」。所以必须用本文件的绝对路径钉死 apps/.env。
 *   2. Key 只允许出现在 apps/.env（git 忽略）。禁止在小节文件夹再放一份 .env。
 *
 * 模板：apps/.env.example。选型说明：docs/02-怎么用.md §1.2.1
 */
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── apps/ 绝对路径 ──
// import.meta.url 是「本文件」的 file:// URL，不是启动时的 cwd。
// new URL(".", import.meta.url) = 本文件所在目录 = 永远是 apps/。
export const appsDir = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  ".",
);

/**
 * 把 apps/.env 灌进 process.env。幂等：dotenv 默认不覆盖已经存在的环境变量，
 * 所以 shell 里临时 export 的值优先于文件（方便单次覆盖，例如换 Key 试一次）。
 *
 * 没有 apps/.env 时再尝试 cwd 下的 .env——给「人忘了文件放哪」留一条退路，
 * 正常学习路径仍应把文件放在 apps/.env。
 */
export function loadRootEnv(): void {
  const envPath = resolve(appsDir, ".env");
  loadDotenv({ path: envPath });
  if (!existsSync(envPath)) {
    loadDotenv();
  }
}
