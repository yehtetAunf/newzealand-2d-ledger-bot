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

        if (update.message) {
          const chatId = update.message.chat.id;
          const text = update.message.text || "";
          const from = update.message.from || {};

          if (text === "/start") {

            // Create users table
            await env.DB.prepare(`
              CREATE TABLE IF NOT EXISTS users (
                chat_id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                created_at TEXT
              )
            `).run();

            // Save user
            await env.DB.prepare(`
              INSERT OR REPLACE INTO users
              (chat_id, username, first_name, created_at)
              VALUES (?, ?, ?, ?)
            `).bind(
              chatId,
              from.username || "",
              from.first_name || "",
              new Date().toISOString()
            ).run();

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
/help - Help Menu`
            );

          } else {

            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "📩 Received: " + text
            );

          }
        }

        return new Response("OK");

      } catch (err) {
        return new Response(err.stack || err.toString(), {
          status: 500
        });
      }
    }

    return new Response("Not Found", {
      status: 404
    });
  }
};

async function sendMessage(token, chatId, text) {
  return fetch(
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
              }
