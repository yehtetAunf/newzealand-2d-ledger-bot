export default {
  async fetch(request, env, ctx) {
    return new Response(
      JSON.stringify(
        {
          ok: true,
          bot: env.BOT_NAME,
          message: "New Zealand 2D Ledger Bot is running 🚀"
        },
        null,
        2
      ),
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  },

  async scheduled(event, env, ctx) {
    console.log("Cron job executed:", new Date().toISOString());
  }
};
