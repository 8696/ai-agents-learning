/**
 * 职责：Tool 定义 · read_recent_emails —— 读用户最近邮件（**用户委托授权演示** · 变体 3）。
 * 数据流：tool_use.input → Zod schema safeParse → handler(args, ctx) →
 *   ① fail-closed：拒绝 platform-god userId（平台上帝 Key 一律拒）
 *   ② 鉴权：查 oauth_tokens[actor.userId] → 没有返 FORBIDDEN（用户没完成 OAuth 授权）
 *   ③ 用该用户的 **refresh_token** 换 **access_token**（短期·每次现换·1 小时过期）→ 调「Gmail API」（mock）→ 返该用户自己的邮件
 *
 * 教学锚点（覆盖本条 04 Tool Gateway · 变体 3 + #22）：
 *   - **per-user OAuth + scope 限定**：每个用户 onboarding 时走一次 OAuth 同意页 → 存 refresh_token
 *   - **access_token 短时换生命周期**（#22 沉淀）：refresh_token 是长期·agent 后端加密存 DB；access_token 是短期·~1 小时过期·每次现换不存
 *   - **资源 = 该用户自己的**：alice token 只返 alice 邮件，bob token 只返 bob 邮件（OAuth 服务端按 access_token 强制隔离）
 *   - **反例（禁止）**：平台申请一个上帝 OAuth Client → 用平台 refresh_token 代所有用户代发邮件 → **安全事故 + 法务事故**
 *   - **fail-closed**：平台上帝 Key 启动期就**拒启动**（本 demo 把它做成运行时拒调：模型发 userId=platform-god → 立即 FORBIDDEN）
 *
 * 日志（§5.3.16）：每条调用 + 鉴权判定 + access_token 生命周期 + mock Gmail 返回都打。
 */
import { z } from "zod";
import { logger } from "../logger.js";

// ── 内存"oauth_tokens"：演示用；生产用 DB（per-user refresh_token + scope）──
const oauthTokens = new Map<string, { refresh: string; scope: string[] }>([
  ["alice", { refresh: "rt_alice_xxx", scope: ["gmail.readonly"] }],
  ["bob", { refresh: "rt_bob_xxx", scope: ["gmail.readonly"] }],
]);

// ── #22：mock access_token 换（每次现换·每次都生成新 access_token + expires_at=now+1h）──
// 生产：POST https://oauth2.googleapis.com/token { refresh_token } → { access_token, expires_in: 3600 }
// demo：返回一个全新的 access_token 字符串 + expires_at 时间戳
const ACCESS_TOKEN_TTL_MS = 3600 * 1000; // 1 小时

function getAccessToken(refreshToken: string, userId: string): {
  access_token: string;
  expires_at: string;
  ttl_seconds: number;
} {
  // mock：用 refresh_token + userId + 当前时间生成一个一次性 access_token
  const entropy = Math.random().toString(36).slice(2, 10);
  const accessToken = `ya29.mock_${userId}_${Date.now().toString(36)}_${entropy}`;
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS).toISOString();
  logger.info("read-recent-emails.access-token", "已生成新 access_token", "用 refresh_token 换新 access_token；expires_at=now+1h（不存·短期使用）", {
    userId,
    refresh_token_prefix: refreshToken.slice(0, 12),
    access_token_prefix: accessToken.slice(0, 18) + "...",
    expires_at: expiresAt,
    ttl_seconds: 3600,
  });
  return {
    access_token: accessToken,
    expires_at: expiresAt,
    ttl_seconds: 3600,
  };
}

// ── mock Gmail API：每个用户自己的 5 封邮件（不同主题演示「资源 = 该用户自己」）──
const mockGmailInbox: Record<string, Array<{ id: string; from: string; subject: string; preview: string }>> = {
  alice: [
    { id: "m_a1", from: "GitHub <noreply@github.com>", subject: "PR review requested: feature-gateway", preview: "Alice, please review PR #42 ..." },
    { id: "m_a2", from: "Stripe <payments@stripe.com>", subject: "Monthly invoice", preview: "Your invoice for August is ready..." },
    { id: "m_a3", from: "Calendar <calendar-noreply@google.com>", subject: "Tomorrow 10:00 standup", preview: "Reminder: standup meeting..." },
    { id: "m_a4", from: "bob@example.com", subject: "Re: project sync", preview: "Sounds good, let's chat at 3pm ..." },
    { id: "m_a5", from: "Newsletter <digest@techweekly.com>", subject: "This week in AI: gateway patterns", preview: "Top stories this week..." },
  ],
  bob: [
    { id: "m_b1", from: "boss@company.com", subject: "Q3 OKR review", preview: "Bob, please send me the Q3 OKR doc ..." },
    { id: "m_b2", from: "alice@example.com", subject: "Lunch on Friday?", preview: "Want to grab lunch this this Friday?" },
    { id: "m_b3", from: "GitHub <noreply@github.com>", subject: "Build failed: feature-orders", preview: "Bob, the CI build failed ..." },
    { id: "m_b4", from: "AWS <no-reply@aws.amazon.com>", subject: "Your bill is ready", preview: "Bob, your September AWS bill is ..." },
    { id: "m_b5", from: "Slack <feedback@slack.com>", subject: "Weekly digest", preview: "Bob, here's your weekly Slack digest ..." },
  ],
};

/** 暴露给 /health 看（演示「per-user 资源隔离」）*/
export function getKnownOAuthUsers(): string[] {
  return [...oauthTokens.keys()];
}

export const readRecentEmailsTool = {
  name: "read_recent_emails",
  description:
    "读当前 actor（用户）自己最近的邮件。**必须用该用户自己的 OAuth refresh_token 换 access_token 后再调 Gmail API**；平台上帝 Key 会被直接拒绝。返回该用户邮箱里的邮件（其他用户邮件拿不到）。",
  schema: z.object({
    max: z.coerce.number().int().positive().max(20).default(5),
  }),
  // 读邮件不危险；Registry 闸放过；Gateway 鉴权阶段的「per-user OAuth」由 handler 内部做
  dangerous: false,
  handler: (args: { max: number }, ctx: { actor: { userId: string; role: string } }): {
    kind: "ok" | "error";
    code?: string;
    message?: string;
    payload?: Record<string, unknown>;
    hookTrace: never[];
  } => {
    const actorUserId = ctx.actor.userId;

    // ── ① fail-closed：平台上帝 Key 一律拒 ──
    if (actorUserId === "platform-god" || ctx.actor.role === "god") {
      logger.warn("read-recent-emails.fail-closed", "平台上帝 Key 被拒", "反模式：平台用上帝 refresh_token 代所有用户读邮件；本 demo 拒调（fail-closed）", {
        actor: ctx.actor,
      });
      return {
        kind: "error",
        code: "FORBIDDEN",
        message: "平台上帝 Key 被拒：必须 per-user OAuth + scope 限定。Agent 平台只能存「刷新 Token 的能力」，不能存「能代表任意用户调接口的 Key」。",
        hookTrace: [],
      };
    }

    // ── ② 鉴权：查该用户有没有 OAuth refresh_token ──
    const token = oauthTokens.get(actorUserId);
    if (!token) {
      logger.warn("read-recent-emails.no-token", "用户未完成 OAuth 授权", "该 actor 没在 oauth_tokens 表里；不能代读邮件", {
        actor: ctx.actor,
      });
      return {
        kind: "error",
        code: "FORBIDDEN",
        message: `${actorUserId} 未完成 OAuth 授权；Agent 不能代读其邮件。请提示用户走 onboarding OAuth 同意页。`,
        hookTrace: [],
      };
    }

    // ── ③ 用 refresh_token 换 access_token（#22 教学点）───────
    const access = getAccessToken(token.refresh, actorUserId);

    // ── ④ 用该用户的 access_token 调" Gmail API"（mock）──
    const inbox = mockGmailInbox[actorUserId] ?? [];
    const emails = inbox.slice(0, args.max);
    logger.info("read-recent-emails.ok", "读邮件成功", "用该用户自己的 access_token 调 Gmail（mock）；返的资源 = 该用户自己的", {
      actor: actorUserId,
      scope: token.scope,
      access_token_prefix: access.access_token.slice(0, 18) + "...",
      requested: args.max,
      returned: emails.length,
    });

    return {
      kind: "ok",
      payload: {
        actor: actorUserId,
        scope: token.scope,
        // #22：端到端看见 access_token · 让模型 + 学习者看见「短期·每次现换」
        access_token_used: access.access_token,
        expires_at: access.expires_at,
        ttl_seconds: access.ttl_seconds,
        emails,
        total_in_mailbox: inbox.length,
      },
      hookTrace: [],
    };
  },
};