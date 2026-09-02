# 模块 02 · 本地产出 · 豆谷值班台

## 跑入口

```bash
cd apps
yarn app:02-06-api-lab
```

浏览器：`http://127.0.0.1:50206/`  
端口：`50206`

## 数据流

```text
出草稿
  → POST /api/draft { question }
  → 协议 A SSE 逐字；可停止刷新（AbortController）
  → 末帧 usage + 估算成本
提交终审
  → POST /api/review { question, draft }
  → 协议 B 一次性 JSON
429 / 5xx 在服务端退避，不在首页放故障开关
```

按条 Demo（Streaming / A vs B / Abort / 429 / 思考）仍在各自文件夹。本 APP **不 import** 它们；思考拆帧对照仍用 `yarn app:02-05-thinking`。

## 当前能做什么

客服贴客户问句 → 流式草稿 → 可选终审一版。每次能看见 Token 和估算成本。空问句 400；停止刷新后草稿停更。

## 对应学习沉淀

[docs/学习模块/02-LLM-API开发/06-本地产出.md](../../../docs/学习模块/02-LLM-API开发/06-本地产出.md)
