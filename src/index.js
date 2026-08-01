import { parseBetMessage } from "./parser.js";

import {
  getUser,
  createUser
} from "./database.js";

import { hasAccess } from "./license.js";

import {
  isAdmin,
  approveUser,
  banUser,
  listUsers
} from "./admin.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health Check
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(
        JSON.stringify({
          ok: true,
          bot: env.BOT_NAME,
          status: "running",
          version: "2.0.0"
        }),
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Telegram Webhook
    if (request.method === "POST" && url.pathname === "/webhook") {
      try {
        const update = await request.json();

        if (!update.message) {
          return new Response("OK");
        }

        const chatId = update.message.chat.id;
        const text = String(update.message.text || "").trim();
        const from = update.message.from || {};

        if (!text) {
          return new Response("OK");
        }

        /*
         * ADMIN COMMANDS
         * Admin Command တွေကို အရင်စစ်ရမယ်
         */

        if (text === "/users") {
          if (!isAdmin(chatId, env)) {
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

          let message = "👥 USERS LIST\n\n";

          for (const user of users) {
            const username = user.username
              ? `@${user.username}`
              : "မရှိ";

            message +=
              `👤 ${user.first_name || "အမည်မရှိ"}\n` +
              `🆔 ${user.chat_id}\n` +
              `📛 ${username}\n` +
              `📌 Status : ${user.status}\n` +
              `💎 Plan : ${user.plan}\n` +
              `📅 Expire : ${user.expires_at || "မရှိ"}\n` +
              `━━━━━━━━━━━━━━\n`;
          }

          await sendLongMessage(
            env.BOT_TOKEN,
            chatId,
            message
          );

          return new Response("OK");
        }

        if (text.startsWith("/approve")) {
          if (!isAdmin(chatId, env)) {
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
/approve 8840114917 30`
            );

            return new Response("OK");
          }

          const targetId = Number(args[1]);
          const days = Number(args[2]);

          if (
            !Number.isInteger(targetId) ||
            targetId <= 0
          ) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "❌ Chat ID မမှန်ပါ။"
            );

            return new Response("OK");
          }

          if (
            !Number.isInteger(days) ||
            days <= 0
          ) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "❌ အသုံးပြုခွင့်ရက် အရေအတွက်မမှန်ပါ။"
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

User ကို Bot တွင် /start အရင်နှိပ်ခိုင်းပါ။`
            );

            return new Response("OK");
          }

          const expiresAt = new Date();
          expiresAt.setUTCDate(
            expiresAt.getUTCDate() + days
          );

          await approveUser(
            env.DB,
            targetId,
            `${days} Days`,
            expiresAt.toISOString()
          );

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
`✅ အသုံးပြုခွင့်ပေးပြီးပါပြီ။

🆔 Chat ID : ${targetId}
💎 Plan : ${days} Days
📅 သက်တမ်းကုန်မည့်နေ့ :
${formatDate(expiresAt)}`
          );

          // User ကိုပါ အကြောင်းကြားမယ်
          try {
            await sendMessage(
              env.BOT_TOKEN,
              targetId,
`✅ Admin မှ အသုံးပြုခွင့်ပေးပြီးပါပြီ။

💎 Plan : ${days} Days
📅 သက်တမ်းကုန်မည့်နေ့ :
${formatDate(expiresAt)}

ယခု Bot ကို အသုံးပြုနိုင်ပါပြီ။`
            );
          } catch (error) {
            console.error(
              "User approval notification failed:",
              error
            );
          }

          return new Response("OK");
        }

        if (text.startsWith("/ban")) {
          if (!isAdmin(chatId, env)) {
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
/ban 8840114917`
            );

            return new Response("OK");
          }

          const targetId = Number(args[1]);

          if (
            !Number.isInteger(targetId) ||
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
              "⛔ Admin မှ သင့်အသုံးပြုခွင့်ကို ပိတ်ထားပါသည်။"
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
         * START COMMAND
         */

        if (text === "/start") {
          let user = await getUser(env.DB, chatId);

          if (!user) {
            await createUser(
              env.DB,
              chatId,
              from.username || "",
              from.first_name || ""
            );

            user = await getUser(env.DB, chatId);
          }

          // Admin ကို အမြဲအသုံးပြုခွင့်ပေးမယ်
          if (isAdmin(chatId, env)) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
`👑 မင်္ဂလာပါ Admin

✅ New Zealand 2D Ledger Bot

Admin Commands

/users
/approve CHAT_ID DAYS
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

            // Admin ဆီ User အသစ်အကြောင်းပို့မယ်
            try {
              await sendMessage(
                env.BOT_TOKEN,
                Number(env.ADMIN_ID),
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
         * HELP COMMAND
         */

        if (text === "/help") {
          await sendMessage(
            env.BOT_TOKEN,
            chatId,
`📖 Help

/start - Start Bot
/help - Help Menu

စာရင်းပို့ရန် ဥပမာ

12 500
12R 500
12r 500
12® 500
12Ⓡ 500
123 ခွေ 500`
          );

          return new Response("OK");
        }

        /*
         * NORMAL USER ACCESS CHECK
         */

        if (!isAdmin(chatId, env)) {
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
         * BET PARSER
         */

        try {
          const bet = parseBetMessage(text);

          const displayName =
            from.first_name ||
            from.username ||
            "New Zealand 2D";

          const betLabel = removeLastAmount(text);

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
123 ခွေ 500

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

function removeLastAmount(text) {
  return String(text)
    .trim()
    .replace(/\s+[\d,]+\s*$/, "")
    .replace(/\s+/g, " ");
}

function formatMoney(amount) {
  return Number(amount || 0).toLocaleString("en-US");
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

async function sendLongMessage(token, chatId, text) {
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

async function sendMessage(token, chatId, text) {
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
