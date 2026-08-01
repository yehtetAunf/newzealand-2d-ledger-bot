import { parseBetMessage } from "./parser.js";

import {
  getUser,
  createUser
} from "./database.js";

import { hasAccess } from "./license.js";

import {
  approveUser,
  banUser,
  listUsers
} from "./admin.js";

/*
 * Admin Telegram User ID
 * Cloudflare ADMIN_ID မရခဲ့ရင်လည်း ဒီ ID ကို အသုံးပြုမယ်။
 */
const DEFAULT_ADMIN_ID = 8840114917;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * Health Check
     */
    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
      return jsonResponse({
        ok: true,
        bot: env.BOT_NAME || "New Zealand 2D Ledger Bot",
        status: "running",
        version: "2.0.0"
      });
    }

    /*
     * Telegram Webhook
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
        const userId = from.id || chatId;

        const originalText = String(
          message.text || ""
        ).trim();

        if (!originalText) {
          return new Response("OK");
        }

        /*
         * /command@BotUsername ပုံစံကိုလည်း
         * /command ပုံစံအဖြစ် ပြောင်းမယ်။
         */
        const text = normalizeCommand(originalText);
        const admin = isAdminUser(userId, env);

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
              `👤 အမည် : ${user.first_name || "မရှိ"}\n` +
              `🆔 Chat ID : ${user.chat_id}\n` +
              `📛 Username : ${
                user.username
                  ? `@${user.username}`
                  : "မရှိ"
              }\n` +
              `📌 Status : ${user.status || "pending"}\n` +
              `💎 Plan : ${user.plan || "none"}\n` +
              `📅 Expire : ${
                user.expires_at
                  ? formatDate(user.expires_at)
                  : "မရှိ"
              }\n` +
              `━━━━━━━━━━━━━━━━━━\n`;
          }

          await sendLongMessage(
            env.BOT_TOKEN,
            chatId,
            report
          );

          return new Response("OK");
        }

        /*
         * =========================================
         * ADMIN COMMAND — /approve
         *
         * /approve CHAT_ID 30
         * /approve CHAT_ID 90
         * /approve CHAT_ID 365
         * /approve CHAT_ID forever
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
          const duration = args[2].toLowerCase();

          if (
            !Number.isSafeInteger(targetId) ||
            targetId <= 0
          ) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "❌ Chat ID မမှန်ပါ။"
            );

            return new Response("OK");
          }

          const targetUser = await getUser(
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

            const expireDate = new Date();
            expireDate.setUTCDate(
              expireDate.getUTCDate() + days
            );

            expiresAt = expireDate.toISOString();
            plan = getPlanName(days);
            expireText = formatDate(expireDate);
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

          const targetId = Number(args[1]);

          if (
            !Number.isSafeInteger(targetId) ||
            targetId <= 0
          ) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "❌ Chat ID မမှန်ပါ။"
            );

            return new Response("OK");
          }

          const targetUser = await getUser(
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

          await banUser(env.DB, targetId);

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
         * START COMMAND
         * =========================================
         */
        if (text === "/start") {
          let user = await getUser(env.DB, chatId);
          const isNewUser = !user;

          if (!user) {
            await createUser(
              env.DB,
              chatId,
              from.username || "",
              from.first_name || ""
            );

            user = await getUser(env.DB, chatId);
          }

          /*
           * Admin ကို License မစစ်ဘဲ
           * အမြဲအသုံးပြုခွင့်ပေးမယ်။
           */
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

ဥပမာ
/approve 123456789 30`
            );

            return new Response("OK");
          }

          const access = hasAccess(user);

          if (!access.ok) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
`🔒 သင့် Account ကို မှတ်ပုံတင်ပြီးပါပြီ။

${access.message}

🆔 သင့် Chat ID : ${chatId}

Admin ထံ အသုံးပြုခွင့်တောင်းပါ။`
            );

            /*
             * User အသစ်ဖြစ်မှ Admin ဆီ
             * Request တစ်ကြိမ်ပို့မယ်။
             */
            if (isNewUser) {
              try {
                await sendMessage(
                  env.BOT_TOKEN,
                  getAdminId(env),
`🔔 အသုံးပြုခွင့်တောင်းဆိုမှု

👤 အမည် : ${from.first_name || "မရှိ"}
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
            const user = await getUser(env.DB, chatId);
            const access = hasAccess(user);

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

12 500
12R 500
12r 500
12® 500
12Ⓡ 500
12 R 500
123 ခွေ 500
123 အခွေ 500
123 ခွေပူး 500
123 အခွေပူး 500`
          );

          return new Response("OK");
        }

        /*
         * =========================================
         * ပုံမှန် User License စစ်ခြင်း
         * =========================================
         */
        if (!admin) {
          const user = await getUser(env.DB, chatId);
          const access = hasAccess(user);

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
         * BET PARSER
         * =========================================
         */
        try {
          const bet = parseBetMessage(originalText);

          const displayName =
            from.first_name ||
            from.username ||
            "New Zealand 2D";

          const betLabel = removeLastAmount(
            originalText
          );

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
`📋 NEW ZEALAND 2D REPORT
👤 ထိုးသူ : ${displayName}
━━━━━━━━━━━━━━━━━━
🔹 ${betLabel} (${bet.count} ကွက်) = ${formatMoney(
              bet.totalAmount
            )}
━━━━━━━━━━━━━━━━━━
💵 စုစုပေါင်း : ${formatMoney(
              bet.totalAmount
            )} ကျပ်

🍀 ဂဏန်းများ ပြန်စစ်ပေးပါ 🍀`
          );

          /*
           * Transaction သိမ်းမယ်။
           * Table မရှိလျှင် Bot မပျက်စေရန် catch သီးခြားထားသည်။
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
                bet.totalAmount,
                new Date().toISOString()
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

12 500
12R 500
12r 500
12® 500
12Ⓡ 500
12 R 500
123 ခွေ 500
123 အခွေ 500
123 ခွေပူး 500
123 အခွေပူး 500

အမှား : ${error.message}`
          );
        }

        return new Response("OK");
      } catch (error) {
        console.error("Webhook error:", error);

        return new Response(
          error.stack || error.toString(),
          {
            status: 500
          }
        );
      }
    }

    return new Response("Not Found", {
      status: 404
    });
  }
};

/*
 * Admin ID စစ်ခြင်း
 *
 * Cloudflare ADMIN_ID ရှိရင် အဲဒါသုံးမယ်။
 * မရှိရင် DEFAULT_ADMIN_ID ကိုသုံးမယ်။
 */
function getAdminId(env) {
  const configuredId = Number(env.ADMIN_ID);

  if (
    Number.isSafeInteger(configuredId) &&
    configuredId > 0
  ) {
    return configuredId;
  }

  return DEFAULT_ADMIN_ID;
}

function isAdminUser(userId, env) {
  return Number(userId) === getAdminId(env);
}

/*
 * /start@BotUsername ကို /start ပြောင်းပေးခြင်း
 */
function normalizeCommand(text) {
  return String(text)
    .trim()
    .replace(
      /^\/([a-zA-Z]+)@[a-zA-Z0-9_]+/,
      "/$1"
    );
}

function getPlanName(days) {
  if (days === 30) return "Silver — 30 Days";
  if (days === 90) return "Gold — 90 Days";
  if (days === 365) return "Platinum — 365 Days";

  return `${days} Days`;
}

function removeLastAmount(text) {
  return String(text)
    .trim()
    .replace(/\s+[\d,]+\s*$/, "")
    .replace(/\s+/g, " ");
}

function formatMoney(amount) {
  return Number(amount || 0).toLocaleString(
    "en-US"
  );
}

function formatDate(value) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "မသိရှိပါ";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function jsonResponse(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json"
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
      text.slice(index, index + maxLength)
    );
  }
}

async function sendMessage(
  token,
  chatId,
  text
) {
  if (!token) {
    throw new Error("BOT_TOKEN မရှိပါ။");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Telegram sendMessage failed: ${errorText}`
    );
  }

  return response;
      }
