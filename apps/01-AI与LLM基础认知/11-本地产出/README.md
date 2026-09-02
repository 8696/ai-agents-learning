# 模块 01 · 本地产出 · 豆谷上新台

## 跑入口

```bash
cd apps
yarn app:01-11-cognition-lab
```

浏览器：`http://127.0.0.1:50111/`  
端口：`50111`

## 数据流

```text
贴原料 → 生成上新卡
  → tokenizer 数 Token；超教学窗口则截断
  → 玩具向量排出相近现货
  → T=0 中英货名 · T=1.2 一句卖点
  → #output 一张上新卡
```

按条 Demo（`02-Token` / `06-Embedding` / `07-Temperature`）仍在。本 APP **不 import** 那些文件夹。Token 对照、温度对照实验去按条页。

## 当前能做什么

运营贴一段原料，拿到一张上新卡：货名、卖点、窗口是否截断、相近现货、中英 Token 对照。空原料 400；没 Key 或模型失败会红 pill。

## 对应学习沉淀

[docs/学习模块/01-AI与LLM基础认知/11-本地产出.md](../../../docs/学习模块/01-AI与LLM基础认知/11-本地产出.md)
