import { parseBetMessage } from "./parser.js";

import {
  getUser,
  createUser,
  addBetItemsToNumberTotals,
  getNumberTotals
} from "./database.js";

import { hasAccess } from "./license.js";

import {
  isAdmin,
  approveUser,
  banUser,
  listUsers
} from "./admin.js";

/*
 * Cloudflare ADMIN_ID မရှိခဲ့ရင်
 * ဒီ Telegram User ID ကို အသုံးပြုမယ်။
 */
const DEFAULT_ADMIN_ID = 8840114917;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * =========================================
     * HEALTH CHECK
     * =========================================
     */
    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
      return jsonResponse({
        ok: true,
        bot:
          env.BOT_NAME ||
          "New Zealand 2D Ledger Bot",
        status: "running",
        version: "3.1.0"
      });
    }

    /*
     * =========================================
     * TELEGRAM WEBHOOK
     * =========================================
     */
    if (
      request.method === "POST" &&
      url.pathname === "/webhook"
    ) {
      try {
        const update = await request.json();

        if (!update.message) {
          return new Response("OK");
        }

        const message = update.message;
        const chatId = message.chat.id;
        const from = message.from || {};

        const originalText = String(
          message.text || ""
        ).trim();

        if (!originalText) {
          return new Response("OK");
        }

        const text =
          normalizeCommand(originalText);

        const admin = isAdmin(chatId, env);

        /*
         * =========================================
         * ADMIN COMMAND — /users
         * =========================================
         */
        if (text === "/users") {
          if (!admin) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "⛔ ဤ Command ကို Admin သာ အသုံးပြုနိုင်ပါသည်။"
            );

            return new Response("OK");
          }

          const users = await listUsers(env.DB);

          if (!users.length) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "👥 User မရှိသေးပါ။"
            );

            return new Response("OK");
          }

          let report = "👥 USERS LIST\n\n";

          for (const user of users) {
            report +=
              `👤 အမည် : ${
                user.first_name || "မရှိ"
              }\n` +
              `🆔 Chat ID : ${
                user.chat_id
              }\n` +
              `📛 Username : ${
                user.username
                  ? `@${user.username}`
                  : "မရှိ"
              }\n` +
              `📌 Status : ${
                user.status || "pending"
              }\n` +
              `💎 Plan : ${
                user.plan || "none"
              }\n` +
              `📅 Expire : ${
                user.expires_at
                  ? formatDate(
                      user.expires_at
                    )
                  : "မရှိ"
              }\n` +
              `━━━━━━━━━━━━━━━━━━\n`;
          }

          await sendLongMessage(
            env.BOT_TOKEN,
            chatId,
            report
          );
await addBetItemsToNumberTotals(
  env.DB,
  bet.items
);
          return new Response("OK");
        }
if (text === "/ledger") {
  const rows = await getNumberTotals(env.DB);

  let msg = "📊 TODAY NUMBER LEDGER\n\n";

  for (const row of rows) {
    if (Number(row.total_amount) > 0) {
      msg += `${row.number} = ${formatMoney(row.total_amount)}\n`;
    }
  }

  await sendLongMessage(
    env.BOT_TOKEN,
    chatId,
    msg
  );

  return new Response("OK");
}
        /*
         * =========================================
         * ADMIN COMMAND — /approve
         * =========================================
         */
        if (text.startsWith("/approve")) {
          if (!admin) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "⛔ ဤ Command ကို Admin သာ အသုံးပြုနိုင်ပါသည်။"
            );

            return new Response("OK");
          }

          const args = text.split(/\s+/);

          if (args.length !== 3) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
`အသုံးပြုပုံ

/approve CHAT_ID DAYS

ဥပမာ
/approve 123456789 30
/approve 123456789 90
/approve 123456789 365
/approve 123456789 forever`
            );

            return new Response("OK");
          }

          const targetId = Number(args[1]);
          const duration =
            args[2].toLowerCase();

          if (
            !Number.isSafeInteger(
              targetId
            ) ||
            targetId <= 0
          ) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "❌ Chat ID မမှန်ပါ။"
            );

            return new Response("OK");
          }

          const targetUser =
            await getUser(
              env.DB,
              targetId
            );

          if (!targetUser) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
`❌ User မတွေ့ပါ။

User ကို Bot ထဲမှာ /start အရင်နှိပ်ခိုင်းပါ။`
            );

            return new Response("OK");
          }

          let plan;
          let expiresAt = null;
          let expireText;

          if (
            duration === "forever" ||
            duration === "lifetime"
          ) {
            plan = "Lifetime";
            expireText = "အမြဲတမ်း";
          } else {
            const days = Number(duration);

            if (
              !Number.isInteger(days) ||
              days <= 0
            ) {
              await sendMessage(
                env.BOT_TOKEN,
                chatId,
`❌ သက်တမ်းမမှန်ပါ။

ဥပမာ
/approve ${targetId} 30
/approve ${targetId} forever`
              );

              return new Response("OK");
            }

            const expireDate =
              new Date();

            expireDate.setUTCDate(
              expireDate.getUTCDate() +
                days
            );

            expiresAt =
              expireDate.toISOString();

            plan = getPlanName(days);
            expireText =
              formatDate(expireDate);
          }

          await approveUser(
            env.DB,
            targetId,
            plan,
            expiresAt
          );

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
`✅ အသုံးပြုခွင့်ပေးပြီးပါပြီ။

🆔 Chat ID : ${targetId}
💎 Plan : ${plan}
📅 သက်တမ်းကုန်မည့်နေ့ : ${expireText}`
          );

          try {
            await sendMessage(
              env.BOT_TOKEN,
              targetId,
`✅ Admin မှ အသုံးပြုခွင့်ပေးပြီးပါပြီ။

💎 Plan : ${plan}
📅 သက်တမ်းကုန်မည့်နေ့ : ${expireText}

ယခု Bot ကို အသုံးပြုနိုင်ပါပြီ။`
            );
          } catch (error) {
            console.error(
              "Approval notification failed:",
              error
            );
          }

          return new Response("OK");
        }

        /*
         * =========================================
         * ADMIN COMMAND — /ban
         * =========================================
         */
        if (text.startsWith("/ban")) {
          if (!admin) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "⛔ ဤ Command ကို Admin သာ အသုံးပြုနိုင်ပါသည်။"
            );

            return new Response("OK");
          }

          const args = text.split(/\s+/);

          if (args.length !== 2) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
`အသုံးပြုပုံ

/ban CHAT_ID

ဥပမာ
/ban 123456789`
            );

            return new Response("OK");
          }

          const targetId =
            Number(args[1]);

          if (
            !Number.isSafeInteger(
              targetId
            ) ||
            targetId <= 0
          ) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "❌ Chat ID မမှန်ပါ။"
            );

            return new Response("OK");
          }

          const targetUser =
            await getUser(
              env.DB,
              targetId
            );

          if (!targetUser) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "❌ User မတွေ့ပါ။"
            );

            return new Response("OK");
          }

          await banUser(
            env.DB,
            targetId
          );

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
`⛔ User ကို ပိတ်ပြီးပါပြီ။

🆔 Chat ID : ${targetId}`
          );

          try {
            await sendMessage(
              env.BOT_TOKEN,
              targetId,
              "⛔ Admin မှ သင့် Bot အသုံးပြုခွင့်ကို ပိတ်ထားပါသည်။"
            );
          } catch (error) {
            console.error(
              "Ban notification failed:",
              error
            );
          }

          return new Response("OK");
        }

        /*
         * =========================================
         * ADMIN COMMAND — /unban
         * =========================================
         */
        if (text.startsWith("/unban")) {
          if (!admin) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "⛔ ဤ Command ကို Admin သာ အသုံးပြုနိုင်ပါသည်။"
            );

            return new Response("OK");
          }

          const args = text.split(/\s+/);

          if (args.length !== 2) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
`အသုံးပြုပုံ

/unban CHAT_ID

ဥပမာ
/unban 123456789`
            );

            return new Response("OK");
          }

          const targetId =
            Number(args[1]);

          if (
            !Number.isSafeInteger(
              targetId
            ) ||
            targetId <= 0
          ) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "❌ Chat ID မမှန်ပါ။"
            );

            return new Response("OK");
          }

          const targetUser =
            await getUser(
              env.DB,
              targetId
            );

          if (!targetUser) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "❌ User မတွေ့ပါ။"
            );

            return new Response("OK");
          }

          await approveUser(
            env.DB,
            targetId,
            "Free",
            "2099-12-31T23:59:59.000Z"
          );

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
`✅ User ကို Unban လုပ်ပြီးပါပြီ။

🆔 Chat ID : ${targetId}`
          );

          try {
            await sendMessage(
              env.BOT_TOKEN,
              targetId,
              "✅ Admin မှ သင့် Account ကို ပြန်ဖွင့်ပေးလိုက်ပါပြီ။"
            );
          } catch (error) {
            console.error(
              "Unban notification failed:",
              error
            );
          }

          return new Response("OK");
        }

        /*
         * =========================================
         * START COMMAND
         * =========================================
         */
        if (text === "/start") {
          let user = await getUser(
            env.DB,
            chatId
          );

          const isNewUser = !user;

          if (!user) {
            await createUser(
              env.DB,
              chatId,
              from.username || "",
              from.first_name || ""
            );

            user = await getUser(
              env.DB,
              chatId
            );
          }

          if (admin) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
`👑 မင်္ဂလာပါ Admin

✅ New Zealand 2D Ledger Bot

Admin Commands

/users
/approve CHAT_ID DAYS
/approve CHAT_ID forever
/ban CHAT_ID
/unban CHAT_ID

ဥပမာ
/approve 123456789 30`
            );

            return new Response("OK");
          }

          const access =
            hasAccess(user);

          if (!access.ok) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
`🔒 သင့် Account ကို မှတ်ပုံတင်ပြီးပါပြီ။

${access.message}

🆔 သင့် Chat ID : ${chatId}

Admin ထံ အသုံးပြုခွင့်တောင်းပါ။`
            );

            if (isNewUser) {
              try {
                await sendMessage(
                  env.BOT_TOKEN,
                  getAdminId(env),
`🔔 အသုံးပြုခွင့်တောင်းဆိုမှု

👤 အမည် : ${
                    from.first_name ||
                    "မရှိ"
                  }
📛 Username : ${
                    from.username
                      ? `@${from.username}`
                      : "မရှိ"
                  }
🆔 Chat ID : ${chatId}

ခွင့်ပြုရန်
/approve ${chatId} 30`
                );
              } catch (error) {
                console.error(
                  "Admin notification failed:",
                  error
                );
              }
            }

            return new Response("OK");
          }

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
`👋 Welcome ${from.first_name || ""}

✅ New Zealand 2D Ledger Bot

သင့် Account ကို အသုံးပြုနိုင်ပါပြီ။

အသုံးပြုနိုင်သော Commands

/start
/help`
          );

          return new Response("OK");
        }

        /*
         * =========================================
         * HELP COMMAND
         * =========================================
         */
        if (text === "/help") {
          if (!admin) {
            const user =
              await getUser(
                env.DB,
                chatId
              );

            const access =
              hasAccess(user);

            if (!access.ok) {
              await sendMessage(
                env.BOT_TOKEN,
                chatId,
                access.message
              );

              return new Response("OK");
            }
          }

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
`📖 အသုံးပြုပုံ

Direct / Reverse
67 500
67R 500
67R 78R 90R 500
67-78-90 R 500

အခွေ
60147 အခွေ 500
60147 အခွေပူး 500

Fixed Rules
အပူး 500
စုံပူး 500
မပူး 500
ပါဝါ 500
နက္ခတ် 500
ညီကို 500
ဆယ်ပြည့် 500
စုံစုံ 500
မမ 500
စုံမ 500
မစုံ 500

ပါတ် / ထိပ် / ပိတ်
8/9 ပါတ် 500
1/7 ထိပ် 500
3/5 ပိတ် 500

ကပ်ဂဏန်း
67/12345890 500
67/12345890 R 500`
          );

          return new Response("OK");
        }

        /*
         * =========================================
         * USER LICENSE CHECK
         * =========================================
         */
        if (!admin) {
          const user = await getUser(
            env.DB,
            chatId
          );

          const access =
            hasAccess(user);

          if (!access.ok) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              access.message
            );

            return new Response("OK");
          }
        }

        /*
         * =========================================
         * BET PARSER + REPORT
         * =========================================
         */
        try {
          const bet =
            parseBetMessage(
              originalText
            );

          const displayName =
            from.first_name ||
            from.username ||
            "New Zealand 2D";

          const reportId =
            await getNextReportId(
              env.DB
            );

          const now = new Date();

          const dateText =
            formatYangonDate(now);

          const timeText =
            formatYangonTime(now);

          /*
           * Item တစ်ခုစီအတွက်
           * Count + Amount + Actual Numbers ပြမယ်။
           */
          const reportLines =
  bet.items
    .map((item) => {
      return (
        `🔹 ${item.label} ` +
        `(${item.count} ကွက်) = ` +
        `${formatMoney(item.totalAmount)}`
      );
    })
    .join("\n");

          const grandTotal =
            bet.grandTotal ??
            bet.totalAmount ??
            0;

          const report =
`📝 2D REPORT
🆔 ID : ${reportId}
📅 ရက်စွဲ : ${dateText}
⏰ အချိန် : ${timeText}

👤 ထိုးသူ : ${displayName}
━━━━━━━━━━━━━━━━━━━━━━
${reportLines}
━━━━━━━━━━━━━━━━━━━━━━
💵 စုစုပေါင်း : ${formatMoney(
            grandTotal
          )} ကျပ်

🏛 🍀 ဂဏန်းများ ပြန်စစ်ပါ 🍀`;

          await sendLongMessage(
  env.BOT_TOKEN,
  chatId,
  report
);

await addBetItemsToNumberTotals(
  env.DB,
  bet.items
);

          /*
           * Transaction သိမ်းခြင်း
           */
          try {
            await env.DB.prepare(`
              INSERT INTO transactions
              (
                chat_id,
                bet_text,
                total_amount,
                created_at
              )
              VALUES (?, ?, ?, ?)
            `)
              .bind(
                chatId,
                originalText,
                grandTotal,
                now.toISOString()
              )
              .run();
          } catch (databaseError) {
            console.error(
              "Transaction save failed:",
              databaseError
            );
          }
        } catch (error) {
          await sendMessage(
            env.BOT_TOKEN,
            chatId,
`❌ စာရင်းပုံစံမမှန်ပါ။

အသုံးပြုပုံ

67R 500
67R 78R 90R 500
67-78-90 R 500
60147 အခွေ 500
60147 အခွေပူး 500
အပူး 500
စုံပူး 500
မပူး 500
ဆယ်ပြည့် 500
ပါဝါ 500
စုံမ 500
1/7 ထိပ် 500
8/9 ပါတ် 500
67/12345890 R 500

အမှား : ${error.message}`
          );
        }

        return new Response("OK");
      } catch (error) {
        console.error(
          "Webhook error:",
          error
        );

        return new Response(
          error.stack ||
            error.toString(),
          {
            status: 500
          }
        );
      }
    }

    return new Response(
      "Not Found",
      {
        status: 404
      }
    );
  }
};

function getAdminId(env) {
  const configuredId =
    Number(env.ADMIN_ID);

  if (
    Number.isSafeInteger(
      configuredId
    ) &&
    configuredId > 0
  ) {
    return configuredId;
  }

  return DEFAULT_ADMIN_ID;
}

function normalizeCommand(text) {
  return String(text)
    .trim()
    .replace(
      /^\/([a-zA-Z]+)@[a-zA-Z0-9_]+/,
      "/$1"
    );
}

function getPlanName(days) {
  if (days === 30) {
    return "Silver — 30 Days";
  }

  if (days === 90) {
    return "Gold — 90 Days";
  }

  if (days === 365) {
    return "Platinum — 365 Days";
  }

  return `${days} Days`;
}

function formatMoney(amount) {
  return Number(
    amount || 0
  ).toLocaleString("en-US");
}

function formatDate(value) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "မသိရှိပါ";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Asia/Yangon",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).format(date);
}

function formatYangonDate(value) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Asia/Yangon",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  ).format(date);
}

function formatYangonTime(value) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "Asia/Yangon",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }
  ).format(date);
}

async function getNextReportId(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS report_sequence (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    )
  `).run();

  await db.prepare(`
    INSERT OR IGNORE INTO report_sequence
    (
      name,
      value
    )
    VALUES
    (
      '2d_report',
      0
    )
  `).run();

  await db.prepare(`
    UPDATE report_sequence
    SET value = value + 1
    WHERE name = '2d_report'
  `).run();

  const row = await db.prepare(`
    SELECT value
    FROM report_sequence
    WHERE name = '2d_report'
  `).first();

  const sequenceNumber =
    Number(row?.value || 1);

  return `NZ${String(
    sequenceNumber
  ).padStart(6, "0")}`;
}

function jsonResponse(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type":
          "application/json"
      }
    }
  );
}

async function sendLongMessage(
  token,
  chatId,
  text
) {
  const maxLength = 4000;

  for (
    let index = 0;
    index < text.length;
    index += maxLength
  ) {
    await sendMessage(
      token,
      chatId,
      text.slice(
        index,
        index + maxLength
      )
    );
  }
}

async function sendMessage(
  token,
  chatId,
  text
) {
  if (!token) {
    throw new Error(
      "BOT_TOKEN မရှိပါ။"
    );
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    }
  );

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `Telegram sendMessage failed: ${errorText}`
    );
  }

  return response;
}
