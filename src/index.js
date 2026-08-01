import { parseBetMessage } from "./parser.js";

import {
  getUser,
  createUser
} from "./database.js";

import {
  hasAccess
} from "./license.js";

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

const access = hasAccess(user);

if (!access.ok) {
  await sendMessage(
    env.BOT_TOKEN,
    chatId,
    access.message
  );

  return new Response("OK");
}

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
          
        }else if (isAdmin(chatId, env) && text === "/users") {

  const users = await listUsers(env.DB);

  if (!users.length) {
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      "User မရှိသေးပါ။"
    );
    return new Response("OK");
  }

  let msg = "👥 Users List\n\n";

  for (const u of users) {
    msg +=
      `${u.chat_id}\n` +
      `Status : ${u.status}\n` +
      `Plan : ${u.plan}\n\n`;
  }

  await sendMessage(
    env.BOT_TOKEN,
    chatId,
    msg
  );

}
else if (isAdmin(chatId, env) && text.startsWith("/approve")) {

  const args = text.split(" ");

  if (args.length < 3) {
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      "အသုံးပြုပုံ\n/approve CHAT_ID DAYS"
    );
    return new Response("OK");
  }

  const targetId = Number(args[1]);
  const days = Number(args[2]);

  const expires = new Date();
  expires.setDate(expires.getDate() + days);

  await approveUser(
    env.DB,
    targetId,
    `${days} Days`,
    expires.toISOString()
  );

  await sendMessage(
    env.BOT_TOKEN,
    chatId,
    "✅ Approved"
  );

}
else if (isAdmin(chatId, env) && text.startsWith("/ban")) {

  const args = text.split(" ");

  if (args.length < 2) {
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      "အသုံးပြုပုံ\n/ban CHAT_ID"
    );
    return new Response("OK");
  }

  await banUser(
    env.DB,
    Number(args[1])
  );

  await sendMessage(
    env.BOT_TOKEN,
    chatId,
    "⛔ User Banned"
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
`📋 NEW ZEALAND 2D REPORT
👤 ထိုးသူ : ${displayName}
━━━━━━━━━━━━━━━━━━
🔹 ${betLabel} (${bet.count} ကွက်) = ${formatMoney(bet.totalAmount)}
━━━━━━━━━━━━━━━━━━
💵 စုစုပေါင်း : ${formatMoney(bet.totalAmount)} ကျပ်

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
