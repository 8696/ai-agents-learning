/**
 * 职责：把 Node 原始 `res` 包成一个「只会写 SSE 帧」的小对象。
 *
 * 数据流：
 *   openSseStream(res) → 先发 text/event-stream 响应头
 *   → writer.frame(obj)    → `data: {...}\n\n`
 *   → writer.done()        → `data: [DONE]\n\n` + res.end()
 *   → writer.closeSocket() → 只关连接、不发 [DONE]（no-signal 教学：客户端 socket 被掐）
 *
 * 为什么单独成文件：
 *   帧格式（`data:` 前缀、两个换行结尾、`[DONE]` 收尾）是 SSE 传输层的约定，
 *   三个 abort 场景差在「要不要传 signal / 何时 abort」，不该各自抄一遍字节怎么排。
 */
import type { ServerResponse } from "node:http";

export type SseWriter = {
  /** 写一帧 JSON；对端已断开时静默丢弃并返回 false */
  frame: (payload: unknown) => boolean;
  /** 收尾帧 + 关闭连接；重复调用安全 */
  done: () => void;
  /**
   * 只关 socket、不发 [DONE]。
   * no-signal 场景用它模拟「客户端已经走了」：读循环结束，但上游 SDK 不知情。
   */
  closeSocket: () => void;
  /** 浏览器是否已经断开（关标签页 / 刷新 / 客户端 abort fetch） */
  isClosed: () => boolean;
};

/**
 * 开一条 SSE 流。
 * ① 先发响应头：必须在任何 data 帧之前，且之后就不能再改 HTTP 状态码了
 * ② no-cache + keep-alive：少了它中间层可能缓冲整条流，页面会「一次性蹦出全文」
 * ③ 监听 close：用户关页面或 abort fetch 时 res 已不可写，继续 write 会抛
 */
export function openSseStream(res: ServerResponse): SseWriter {
  let closed = false;

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  res.on("close", () => {
    closed = true;
  });

  const write = (chunk: string): boolean => {
    if (closed) return false;
    try {
      res.write(chunk);
      return true;
    } catch {
      // 对端已断开：不是错误，只是没人听了。标记 closed 让上游循环自己决定要不要停
      closed = true;
      return false;
    }
  };

  const endRes = (): void => {
    closed = true;
    try {
      res.end();
    } catch {
      /* 对端已断开，end 也可能抛；到这一步没有任何补救动作可做 */
    }
  };

  return {
    frame: (payload: unknown) => write(`data: ${JSON.stringify(payload)}\n\n`),
    done: () => {
      if (closed) return;
      write("data: [DONE]\n\n");
      endRes();
    },
    closeSocket: () => {
      if (closed) return;
      endRes();
    },
    isClosed: () => closed,
  };
}
