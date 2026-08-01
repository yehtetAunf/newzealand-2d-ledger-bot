import { parseBetMessage } from "./parser.js";

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
          version: "1.0.0"
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

        if (text === "/start") {
          await createUsersTable(env);

          await saveUser(env, {
            chatId,
            username: from.username || "",
            firstName: from.first_name || ""
          });

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
`👋 Welcome ${from.first_name || ""}

✅ New Zealand 2D Ledger Bot

သင့် Account ကို မှတ်ပုံတင်ပြီးပါပြီ။

အသုံးပြုနိုင်သော Commands

/start
/help`
          );

        } else if (text === "/help") {
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

        } else {
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
`📋 REPORT

👤 User : ${displayName}
🆔 Chat ID : ${chatId}

🔹 ${betLabel} (${bet.count} ကွက်)
💰 ထိုးငွေ : ${formatMoney(bet.totalAmount)} ကျပ်

💵 Total : ${formatMoney(bet.totalAmount)} ကျပ်`
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

async function createUsersTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      chat_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      created_at TEXT
    )
  `).run();
}

async function saveUser(
  env,
  {
    chatId,
    username,
    firstName
  }
) {
  await env.DB.prepare(`
    INSERT OR REPLACE INTO users
    (
      chat_id,
      username,
      first_name,
      created_at
    )
    VALUES (?, ?, ?, ?)
  `).bind(
    chatId,
    username,
    firstName,
    new Date().toISOString()
  ).run();
}

function removeLastAmount(text) {
  return String(text)
    .trim()
    .replace(/\s+[\d,]+\s*$/, "")
    .replace(/\s+/g, " ");
}

function formatMoney(amount) {
  return Number(amount || 0).toLocaleString("en-US");
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
