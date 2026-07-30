export default {
  async fetch(request, env) {
    const result = await env.DB.prepare("SELECT 1 AS ok").first();

    return new Response(
      JSON.stringify({
        success: true,
        bot: env.BOT_NAME,
        timezone: env.TIMEZONE,
        database: result
      }),
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  },

  async scheduled(event, env, ctx) {
    console.log("Cron job executed");
  }
};
