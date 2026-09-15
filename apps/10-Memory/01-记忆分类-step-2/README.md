# 记忆分类 · 第二步（分类 + 写入 + 重启验证）

对应学习笔记：[docs/学习模块/10-Memory/01-记忆分类.md](../../docs/学习模块/10-Memory/01-记忆分类.md)

## 现在怎么跑

```bash
cd apps
yarn app:10-01-memory-types-step-2
```

浏览器打开：http://127.0.0.1:50101/

端口：`50101`（yarn 脚本 inline `PORT=50101`；`lib/http/runtime-ctx.ts` `.default(50101)` 兜底）

## 数据流

```text
用户在页面写一句话（或点例句按钮）
    → 点「分类并写入」POST /api/classify { sentence, persist: true }
    → 服务端拼 messages：
        system = 四类记忆定义 + 短期/长期判定口径
        user   = 这句用户原话
    → 调协议 A 对话补全（response_format: json_object）
    → 解析模型返回的 JSON，校验字段（memoryType / term / reason）
    → 持久化开启 → 调 facts-store.recordIfLongTerm
       → 选项 C 规则：工作记忆 / 短期 / 程序性 → 不写；语义 / 情景 + 长期 → 写
       → 写盘：data/facts.json（同 key 已存在 → 覆盖）
    → 页面：
        ① 判类结果（归入 / 存储期限 / 理由）
        ② 写入结果（写没写 / 为什么 / key）
        ③ 事实库实时列表（GET /api/facts）
        ④ 重启验证四步提示
```

辅助端点：
- `GET /api/facts`：列出当前事实库（实时从磁盘读）
- `DELETE /api/facts`：清空事实库（演示用）
- `POST /api/force-error`：演示后端 5xx 的另一条失败通道

## 当前能做什么

- 输入任意一句话，或点四个例句按钮对照四种期望结果
- 看见「写没写」「为什么」「 key」三条写入元信息
- 看见事实库列表 + 文件路径，重启服务后再打开那条长期事实还在
- 空句子 → 4xx；「演示后端 5xx」→ 另一条失败通道
- 本步把分类、写入判定、重启验证放在同一个 demo 里——这是本节「分类后端真的存住 + 重启判定口径」的最小闭环

## 与 step-1 的关系

step-1 只演示「一句话该归进哪个盒子」（纯分类），端口 50100；
step-2 把分类扩展到「分类后按规则写入 + 重启验证」（分类 + 写入），端口 50101；
两者互不依赖，可单独跑、独立复习。