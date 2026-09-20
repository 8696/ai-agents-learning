/**
 * 职责：基础聊天这一步的默认系统提示词。无 make_latte 工具——和 step-1 use-chat 那一页的差别就在这一行。
 *
 * 数据流：前端 textarea 默认填这串；用户改完点发送，服务端把新值塞进 body.system。
 */
export const DEFAULT_SYSTEM_PROMPT =
  "你是一个友善、简洁的中文助手。\n" +
  "回答控制在 2-3 句，除非用户明确要求更详细。\n" +
  "不调用任何工具，纯文字回复。";