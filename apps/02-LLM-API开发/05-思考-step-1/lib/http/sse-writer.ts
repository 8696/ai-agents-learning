/**
 * 职责：把 Node 原始 res 包成只会写 SSE 帧的小对象（传输层，与协议无关）。
 * 数据流：openSseStream(res) → frame(obj) → done() 发 [DONE] 并 end。
 * 为什么单独成文件：协议 A/B 差在 SDK 事件，不该各自抄一遍 `data:` 前缀和 [DONE]。
 */
import type { ServerResponse } from "node:http";

export type SseWriter = {
  frame: (payload: unknown) => boolean;
  done: () => void;
  isClosed: () => boolean;
};

/**
 * ① 先发响应头：必须在任何 data 帧之前，之后就不能再改 HTTP 状态码
 * ② no-cache + keep-alive：少了中间层可能缓冲整条流，页面会一次性蹦出全文
 * ③ 监听 close：用户关页面或 abort fetch 时 res 已不可写
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
      closed = true;
      return false;
    }
  };
  return {
    frame: (payload: unknown) => write(`data: ${JSON.stringify(payload)}\n\n`),
    done: () => {
      if (closed) return;
      write("data: [DONE]\n\n");
      closed = true;
      try {
        res.end();
      } catch {
        /* 对端已断开 */
      }
    },
    isClosed: () => closed,
  };
}
