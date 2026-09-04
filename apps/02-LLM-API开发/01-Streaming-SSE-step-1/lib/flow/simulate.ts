/**
 * 职责：本地模拟「模型在吐 token」——不调 API，只按固定序列按节拍推帧 / 攒齐返回。
 *
 * 数据流：
 *   TOKENS × TOKEN_INTERVAL_MS
 *     → 流式：每 200ms 一帧 `{ choices:[{ delta:{ content } }] }` → 结束 `[DONE]`
 *     → 一次性：等 11×200ms 再返回 join 后的整句（总耗时与流式相同，用来对照 TTFT）
 *
 * 为什么单独成文件：
 *   模拟序列是本条的教学道具，和真实模型转发不是一条路；
 *   流式 / 一次性必须共用同一份 TOKENS，否则对照页的「总耗时相同」就对不上。
 */
import { performance } from "node:perf_hooks";
import type { SseWriter } from "../sse/sse-writer.js";
import { logger } from "../logger.js";

/** 教学简化：每帧正好 1 个字符。真实模型每帧可能含多个 token 解码后的字符串。 */
export const TOKENS = ["你", "好", "，", "我", "是", " ", "AI", " ", "助", "手", "。"];

/** 帧与帧之间的间隔。第一帧立即发出，所以 TTFT ≈ 建连时间，不是 200ms。 */
export const TOKEN_INTERVAL_MS = 200;

/** 一次性接口要等的总时长，必须等于流式从第一帧到 [DONE] 的间隔之和。 */
export const BLOCKING_TOTAL_MS = TOKENS.length * TOKEN_INTERVAL_MS;

/**
 * 按节拍把 TOKENS 写成 SSE 帧。
 * ① 第一帧立刻写：否则 TTFT 会被人为垫高，对照一次性就看不出差别
 * ② 每帧 payload 形状对齐协议 A 的 chunk：`choices[0].delta.content`
 * ③ 全部写完才 [DONE]：少了它，页面的读循环会一直等到超时
 */
export function pumpSimulatedSse(writer: SseWriter): Promise<void> {
  return new Promise((resolve) => {
    let i = 0;
    const tick = (): void => {
      if (writer.isClosed()) {
        logger.info(
          "模拟 SSE-中断",
          "浏览器断开，停止推帧",
          "writer.isClosed()=true 是路由层 close 事件触发，主动停掉模拟时钟避免白写",
          { stoppedAtIndex: i },
        );
        resolve();
        return;
      }
      if (i >= TOKENS.length) {
        console.log(
          `[${(performance.now() / 1000).toFixed(2)}s] SSE 帧 #${i + 1}: data: [DONE]    ← 结束帧，连接关闭`,
        );
        logger.info(
          "模拟 SSE-收尾",
          "SSE 帧 [DONE] 写出，连接关闭",
          "结束帧必须显式打：少了它浏览器的 EventSource 会一直挂到超时；totalFrames 是用来核对『11 帧 + [DONE] = 12 次 write』的",
          { totalFrames: i, finalIndex: i + 1 },
        );
        writer.done();
        resolve();
        return;
      }
      const payload = JSON.stringify({
        choices: [{ delta: { content: TOKENS[i] } }],
      });
      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] SSE 帧 #${i + 1}: data: ${payload}`,
      );
      logger.info(
        "模拟 SSE-推帧",
        `SSE 帧 #${i + 1} 已写`,
        "教学页要看到『流式 = 多次小响应』：每帧 1 个 token（教学简化），真实模型一帧可能含多个解码 token",
        {
          frameIndex: i + 1,
          token: TOKENS[i],
          payload,
        },
      );
      writer.writeRaw(payload);
      i += 1;
      setTimeout(tick, TOKEN_INTERVAL_MS);
    };
    tick();
  });
}

/**
 * 攒齐再返回整句。等待时长 = TOKENS.length × 200ms，
 * 这样流式与一次性的「总耗时」对齐，差别只落在 TTFT 上。
 */
export async function waitBlockingText(): Promise<string> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, BLOCKING_TOTAL_MS);
  });
  return TOKENS.join("");
}
