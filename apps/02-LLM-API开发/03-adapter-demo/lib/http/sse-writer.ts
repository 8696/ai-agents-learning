/**
 * 职责：把 Node res 包成只会写 SSE 帧的小对象（传输层，与协议无关）。
 * 数据流：openSseStream(res) → frame(obj) → done() 发 [DONE] 并 end。
 */
import type { ServerResponse } from "node:http";

export type SseWriter = {
  frame: (payload: unknown) => boolean;
  done: () => void;
  isClosed: () => boolean;
};

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
