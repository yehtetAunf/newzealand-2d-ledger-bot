import { parseBetMessage } from "./parser.js";

import {
  getUser,
  createUser,
  getLicensedGroup,
  createLicensedGroup,
  addBetItemsToNumberTotals,
  getNumberTotals,
  getNumberTotal,
  getUntouchedNumbers,
  getTopNumbers,
  getNumbersBelowAmount,
  getNumbersAboveAmount,
  getTotalSales,
  getUserSales,
  resetNumberTotals,
  resetTransactions,
  saveTransaction
} from "./database.js";

import { hasAccess } from "./license.js";

import {
  isAdmin,
  approveUser,
  banUser,
  listUsers,
  approveGroup,
  banGroup,
  unbanGroup,
  listGroups
} from "./admin.js";

const DEFAULT_ADMIN_ID = 8840114917;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
        version: "4.1.0"
      });
    }

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
        const userId = from.id;
        const chatType = message.chat.type;
        const isGroup =
          chatType === "group" ||
          chatType === "supergroup";
        const admin = isAdmin(userId, env);
        const originalText = String(
          message.text || ""
        ).trim();

        if (!originalText) {
          return new Response("OK");
        }

        const text = normalizeCommand(originalText);
        const now = new Date();

        if (isGroup) {
          const groupTitle = message.chat.title || "";
          const existingGroup = await getLicensedGroup(env.DB, chatId);
          if (!existingGroup) {
            await createLicensedGroup(env.DB, chatId, userId, groupTitle);
          }
        }

        const bypassAccessCheck =
          text === "/start" ||
          text === "/help" ||
          text === "/groupid" ||
          text === "/users" ||
          text === "/groups" ||
          /^\/(?:approve|ban|unban|approvegroup|bangroup|unbangroup)(?:\s|$)/.test(text);

        if (!admin && !bypassAccessCheck) {
          const licenseRecord = isGroup
            ? await getLicensedGroup(env.DB, chatId)
            : await getUser(env.DB, userId);
          const access = hasAccess(licenseRecord);
          if (!access.ok) {
            const messageText = isGroup
              ? `${access.message}\n\n🆔 Group ID : ${chatId}\nAdmin ကို ဆက်သွယ်၍ Group License ရယူပါ။`
              : access.message;
            await sendMessage(env.BOT_TOKEN, chatId, messageText);
            return new Response("OK");
          }
        }

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

          return new Response("OK");
        }

        /*
         * =========================================
         * GROUP LICENSE COMMANDS
         * =========================================
         */
        if (text === "/groupid") {
          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            isGroup
              ? `🆔 Group ID : ${chatId}\n👥 Group : ${message.chat.title || "မရှိ"}`
              : "❌ ဒီ Command ကို Group ထဲမှာသာ အသုံးပြုပါ။"
          );
          return new Response("OK");
        }

        if (text === "/groups") {
          if (!admin) {
            await sendMessage(env.BOT_TOKEN, chatId, "⛔ ဤ Command ကို Admin သာ အသုံးပြုနိုင်ပါသည်။");
            return new Response("OK");
          }
          const groups = await listGroups(env.DB);
          if (!groups.length) {
            await sendMessage(env.BOT_TOKEN, chatId, "👥 Group စာရင်း မရှိသေးပါ။");
            return new Response("OK");
          }
          let report = "👥 LICENSED GROUPS\n\n";
          for (const group of groups) {
            report +=
              `📌 Group : ${group.group_title || "မရှိ"}\n` +
              `🆔 Group ID : ${group.group_id}\n` +
              `👤 Owner ID : ${group.owner_id || "မရှိ"}\n` +
              `📍 Status : ${group.status || "pending"}\n` +
              `💎 Plan : ${group.plan || "none"}\n` +
              `📅 Expire : ${group.expires_at ? formatDate(group.expires_at) : "မရှိ"}\n` +
              `━━━━━━━━━━━━━━━━━━\n`;
          }
          await sendLongMessage(env.BOT_TOKEN, chatId, report);
          return new Response("OK");
        }

        if (/^\/approvegroup(?:\s|$)/.test(text)) {
          if (!admin) {
            await sendMessage(env.BOT_TOKEN, chatId, "⛔ ဤ Command ကို Admin သာ အသုံးပြုနိုင်ပါသည်။");
            return new Response("OK");
          }
          const args = text.split(/\s+/);
          if (args.length !== 3) {
            await sendMessage(env.BOT_TOKEN, chatId,
`အသုံးပြုပုံ
/approvegroup GROUP_ID DAYS

ဥပမာ
/approvegroup -100123456789 30
/approvegroup -100123456789 forever`);
            return new Response("OK");
          }
          const groupId = Number(args[1]);
          const duration = args[2].toLowerCase();
          if (!Number.isSafeInteger(groupId) || groupId >= 0) {
            await sendMessage(env.BOT_TOKEN, chatId, "❌ Group ID မမှန်ပါ။ /groupid ဖြင့် ID ကိုယူပါ။");
            return new Response("OK");
          }
          const group = await getLicensedGroup(env.DB, groupId);
          if (!group) {
            await sendMessage(env.BOT_TOKEN, chatId, "❌ Group မတွေ့ပါ။ Bot ကို Group ထဲထည့်ပြီး /groupid သို့ /start အရင်ပို့ပါ။");
            return new Response("OK");
          }
          const license = buildLicense(duration);
          if (!license.ok) {
            await sendMessage(env.BOT_TOKEN, chatId, license.message);
            return new Response("OK");
          }
          await approveGroup(env.DB, groupId, license.plan, license.expiresAt);
          await sendMessage(env.BOT_TOKEN, chatId,
`✅ Group အသုံးပြုခွင့်ပေးပြီးပါပြီ။

🆔 Group ID : ${groupId}
👥 Group : ${group.group_title || "မရှိ"}
💎 Plan : ${license.plan}
📅 Expire : ${license.expireText}`);
          try {
            await sendMessage(env.BOT_TOKEN, groupId,
`✅ ဒီ Group ကို Bot အသုံးပြုခွင့်ပေးပြီးပါပြီ။

💎 Plan : ${license.plan}
📅 Expire : ${license.expireText}

ယခု Group အဖွဲ့ဝင်အားလုံး Bot ကို အသုံးပြုနိုင်ပါပြီ။`);
          } catch (error) {
            console.error("Group approval notification failed:", error);
          }
          return new Response("OK");
        }

        if (/^\/bangroup(?:\s|$)/.test(text)) {
          if (!admin) {
            await sendMessage(env.BOT_TOKEN, chatId, "⛔ ဤ Command ကို Admin သာ အသုံးပြုနိုင်ပါသည်။");
            return new Response("OK");
          }
          const args = text.split(/\s+/);
          const groupId = Number(args[1]);
          if (args.length !== 2 || !Number.isSafeInteger(groupId) || groupId >= 0) {
            await sendMessage(env.BOT_TOKEN, chatId, "အသုံးပြုပုံ\n/bangroup -100123456789");
            return new Response("OK");
          }
          const group = await getLicensedGroup(env.DB, groupId);
          if (!group) {
            await sendMessage(env.BOT_TOKEN, chatId, "❌ Group မတွေ့ပါ။");
            return new Response("OK");
          }
          await banGroup(env.DB, groupId);
          await sendMessage(env.BOT_TOKEN, chatId, `⛔ Group ကို ပိတ်ပြီးပါပြီ။\n\n🆔 Group ID : ${groupId}`);
          return new Response("OK");
        }

        if (/^\/unbangroup(?:\s|$)/.test(text)) {
          if (!admin) {
            await sendMessage(env.BOT_TOKEN, chatId, "⛔ ဤ Command ကို Admin သာ အသုံးပြုနိုင်ပါသည်။");
            return new Response("OK");
          }
          const args = text.split(/\s+/);
          const groupId = Number(args[1]);
          if (args.length !== 2 || !Number.isSafeInteger(groupId) || groupId >= 0) {
            await sendMessage(env.BOT_TOKEN, chatId, "အသုံးပြုပုံ\n/unbangroup -100123456789");
            return new Response("OK");
          }
          const group = await getLicensedGroup(env.DB, groupId);
          if (!group) {
            await sendMessage(env.BOT_TOKEN, chatId, "❌ Group မတွေ့ပါ။");
            return new Response("OK");
          }
          await unbanGroup(env.DB, groupId);
          await sendMessage(env.BOT_TOKEN, chatId, `✅ Group ကို ပြန်ဖွင့်ပြီးပါပြီ။\n\n🆔 Group ID : ${groupId}`);
          return new Response("OK");
        }

        /*
         * =========================================
         * LEDGER COMMANDS
         * =========================================
         */

        if (text === "/ledger") {
          const rows =
            await getNumberTotals(env.DB, chatId);

          const activeRows = rows.filter(
            (row) =>
              Number(row.total_amount) > 0
          );

          const msg = activeRows.length
            ? "📊 NUMBER LEDGER\n\n" +
              activeRows
                .map(
                  (row) =>
                    `${row.number} = ` +
                    `${formatMoney(row.total_amount)}`
                )
                .join("\n")
            : "📭 Ledger မှာ ထိုးထားသောဂဏန်း မရှိသေးပါ။";

          await sendLongMessage(
            env.BOT_TOKEN,
            chatId,
            msg
          );

          return new Response("OK");
        }

        if (text === "/untouched") {
          const rows =
            await getUntouchedNumbers(env.DB, chatId);

          const msg = rows.length
            ? "⭕ မထိုးရသေးသောဂဏန်းများ\n\n" +
              rows
                .map((row) => row.number)
                .join(" ")
            : "✅ 00 မှ 99 အထိ ဂဏန်းအားလုံး ထိုးပြီးပါပြီ။";

          await sendLongMessage(
            env.BOT_TOKEN,
            chatId,
            msg
          );

          return new Response("OK");
        }

        if (text.startsWith("/top")) {
          const args = text.split(/\s+/);
          const limit =
            args[1] === undefined
              ? 10
              : Number(args[1]);

          if (
            !Number.isInteger(limit) ||
            limit <= 0 ||
            limit > 100
          ) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "အသုံးပြုပုံ\n/top\n/top 20"
            );

            return new Response("OK");
          }

          const rows =
            await getTopNumbers(
              env.DB,
              chatId,
              limit
            );

          const msg = rows.length
            ? `🏆 TOP ${limit} NUMBERS\n\n` +
              rows
                .map(
                  (row, index) =>
                    `${index + 1}. ` +
                    `${row.number} = ` +
                    `${formatMoney(row.total_amount)}`
                )
                .join("\n")
            : "📭 ထိုးထားသောဂဏန်း မရှိသေးပါ။";

          await sendLongMessage(
            env.BOT_TOKEN,
            chatId,
            msg
          );

          return new Response("OK");
        }

        if (text.startsWith("/number")) {
          const args = text.split(/\s+/);

          if (
            args.length !== 2 ||
            !/^\d{1,2}$/.test(args[1])
          ) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "အသုံးပြုပုံ\n/number 67"
            );

            return new Response("OK");
          }

          const row =
            await getNumberTotal(
              env.DB,
              chatId,
              args[1]
            );

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            `🔢 ${row.number} = ` +
            `${formatMoney(row.total_amount)} ကျပ်`
          );

          return new Response("OK");
        }

        if (text.startsWith("/below")) {
          const args = text.split(/\s+/);
          const amount = Number(
            String(args[1] || "")
              .replace(/,/g, "")
          );

          if (
            args.length !== 2 ||
            !Number.isFinite(amount) ||
            amount < 0
          ) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "အသုံးပြုပုံ\n/below 5000"
            );

            return new Response("OK");
          }

          const rows =
            await getNumbersBelowAmount(
              env.DB,
              chatId,
              amount
            );

          const msg = rows.length
            ? `⬇️ ${formatMoney(amount)} အောက်\n\n` +
              rows
                .map(
                  (row) =>
                    `${row.number} = ` +
                    `${formatMoney(row.total_amount)}`
                )
                .join("\n")
            : `📭 ${formatMoney(amount)} အောက် ဂဏန်းမရှိပါ။`;

          await sendLongMessage(
            env.BOT_TOKEN,
            chatId,
            msg
          );

          return new Response("OK");
        }

        if (text.startsWith("/above")) {
          const args = text.split(/\s+/);
          const amount = Number(
            String(args[1] || "")
              .replace(/,/g, "")
          );

          if (
            args.length !== 2 ||
            !Number.isFinite(amount) ||
            amount < 0
          ) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "အသုံးပြုပုံ\n/above 10000"
            );

            return new Response("OK");
          }

          const rows =
            await getNumbersAboveAmount(
              env.DB,
              chatId,
              amount
            );

          const msg = rows.length
            ? `⬆️ ${formatMoney(amount)} အထက်\n\n` +
              rows
                .map(
                  (row) =>
                    `${row.number} = ` +
                    `${formatMoney(row.total_amount)}`
                )
                .join("\n")
            : `📭 ${formatMoney(amount)} အထက် ဂဏန်းမရှိပါ။`;

          await sendLongMessage(
            env.BOT_TOKEN,
            chatId,
            msg
          );

          return new Response("OK");
        }

        if (text === "/sales") {
          if (!admin) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "⛔ /sales ကို Admin သာ အသုံးပြုနိုင်ပါသည်။"
            );

            return new Response("OK");
          }

          const total =
            await getTotalSales(
              env.DB,
              isGroup ? chatId : null
            );

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            "💰 TOTAL SALES\n\n" +
            `${formatMoney(total)} ကျပ်`
          );

          return new Response("OK");
        }

        if (text === "/mysales") {
          const result =
            await getUserSales(
              env.DB,
              chatId
            );

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            "👤 MY SALES\n\n" +
            `🧾 Transactions : ` +
            `${result.transactionCount}\n` +
            `💰 Total : ` +
            `${formatMoney(result.totalSales)} ကျပ်`
          );

          return new Response("OK");
        }

        if (text === "/resetledger") {
          if (!admin) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "⛔ /resetledger ကို Admin သာ အသုံးပြုနိုင်ပါသည်။"
            );

            return new Response("OK");
          }

          const resetScope = isGroup ? chatId : null;
          await resetNumberTotals(env.DB, resetScope);
          await resetTransactions(env.DB, resetScope);

await sendMessage(
  env.BOT_TOKEN,
  chatId,
  "✅ Number Ledger ကို Reset လုပ်ပြီးပါပြီ"
);

          return new Response("OK");
        }

        /*
         * =========================================
         * ADMIN COMMAND — /approve
         * =========================================
         */
        if (/^\/approve(?:\s|$)/.test(text)) {
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
        if (/^\/ban(?:\s|$)/.test(text)) {
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
        if (/^\/unban(?:\s|$)/.test(text)) {
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
          if (admin) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
`👑 မင်္ဂလာပါ Admin

━━━━━━━━━━━━━━
✅ New Zealand 2D Ledger Bot v4.1
━━━━━━━━━━━━━━

🛠 User Commands
👥 /users
✅ /approve USER_ID DAYS
🚫 /ban USER_ID
🔓 /unban USER_ID

🛠 Group Commands
🆔 /groupid
👥 /groups
✅ /approvegroup GROUP_ID DAYS
🚫 /bangroup GROUP_ID
🔓 /unbangroup GROUP_ID

📊 Ledger Commands
📒 /ledger
🎯 /untouched
🏆 /top
🔢 /number 67
💰 /below 5000
💎 /above 10000
📈 /sales
🗑 /resetledger`
            );
            return new Response("OK");
          }

          if (isGroup) {
            const group = await getLicensedGroup(env.DB, chatId);
            const access = hasAccess(group);
            if (!access.ok) {
              await sendMessage(
                env.BOT_TOKEN,
                chatId,
`🔒 ဒီ Group ကို မှတ်ပုံတင်ပြီးပါပြီ။

${access.message}

🆔 Group ID : ${chatId}
👥 Group : ${message.chat.title || "မရှိ"}

Admin ထံ Group အသုံးပြုခွင့်တောင်းပါ။`
              );
              return new Response("OK");
            }

            await sendMessage(env.BOT_TOKEN, chatId, buildWelcomeMessage());
            return new Response("OK");
          }

          let user = await getUser(env.DB, userId);
          const isNewUser = !user;
          if (!user) {
            await createUser(
              env.DB,
              userId,
              from.username || "",
              from.first_name || ""
            );
            user = await getUser(env.DB, userId);
          }

          const access = hasAccess(user);
          await sendMessage(env.BOT_TOKEN, chatId, buildWelcomeMessage());
          if (!access.ok) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
`🔒 သင့် Account ကို မှတ်ပုံတင်ပြီးပါပြီ။

${access.message}

🆔 သင့် User ID : ${userId}

Admin ထံ အသုံးပြုခွင့်တောင်းပါ။`
            );

            if (isNewUser) {
              try {
                await sendMessage(
                  env.BOT_TOKEN,
                  getAdminId(env),
`🔔 အသုံးပြုခွင့်တောင်းဆိုမှု

👤 အမည် : ${from.first_name || "မရှိ"}
📛 Username : ${from.username ? `@${from.username}` : "မရှိ"}
🆔 User ID : ${userId}

ခွင့်ပြုရန်
/approve ${userId} 30`
                );
              } catch (error) {
                console.error("Admin notification failed:", error);
              }
            }
            return new Response("OK");
          }

          
          return new Response("OK");
        }

        /*
         * =========================================
         * HELP COMMAND
         * =========================================
         */
        if (text === "/help") {
          if (!admin) {
            const licenseRecord = isGroup
              ? await getLicensedGroup(env.DB, chatId)
              : await getUser(env.DB, userId);
            const access = hasAccess(licenseRecord);
            if (!access.ok) {
              await sendMessage(
                env.BOT_TOKEN,
                chatId,
                isGroup
                  ? `${access.message}

🆔 Group ID : ${chatId}`
                  : access.message
              );
              return new Response("OK");
            }
          }

          await sendLongMessage(
            env.BOT_TOKEN,
            chatId,
`📖 အသုံးပြုပုံ

🔹 Direct / Reverse
67 500
67R500
67R 500
67-78-90 R200

🔹 Carry Amount
16.27.38.49.50
12.23.34.45.56
67.78.89.90.10 R50

🔹 အခွေ / အခွေပူး
1369ခွေ300
1369ခွေပူး100
185376ခပ200

🔹 ကပ်ဂဏန်း
1369.04578ကပ်R250
67/12345890 R500

🔹 Special Rules
နက္ခတ်500 | n500
ပါဝါ500 | p500
ဆယ်ပြည့်500 | s500
ညီကို500 | t500
အပူး200 | apu200
စုံပူး200 | sp200
မပူး200 | mp200
မမ200 | mm200
စုံစုံ200 | ss200

🔹 ဘရိတ်
0ဘရိတ်200
5br500
7 break 500

🔹 ပါတ် / ထိပ် / ပိတ်
8/9ပါတ်500
1/7ထိပ်500
3/5ပိတ်500

📊 Ledger Commands
/ledger
/untouched
/top
/top 20
/number 67
/below 5000
/above 10000
/mysales`
          );
          return new Response("OK");
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


          const reportLines =
  bet.items
    .map((item, index) => {
      const number =
        "①②③④⑤⑥⑦⑧⑨⑩"[index] ||
        `${index + 1}.`;

      return (
        `${number} ${item.label} ` +
        `(${item.count} ကွက်) → ` +
        `${formatMoney(item.totalAmount)} ကျပ်`
      );
    })
    .join("\n");

          const grandTotal =
            bet.grandTotal ??
            bet.totalAmount ??
            0;

          const report = `📝 2D စာရင်း
👤 ထိုးသူ : ${displayName}

━━━━━━━━━━━━━━━━━━━━

${reportLines}

━━━━━━━━━━━━━━━━━━━━

💰 စုစုပေါင်း : ${formatMoney(grandTotal)} ကျပ်

━━━━━━━━━━━━━━━━━━━━

⚠️ ဂဏန်း၊ ကွက်အရေအတွက်နှင့်
ငွေပမာဏကို ပြန်လည်စစ်ဆေးပေးပါ။

✅ စာရင်းလက်ခံပြီးပါပြီ`;

          await sendLongMessage(
            env.BOT_TOKEN,
            chatId,
            report
          );

          try {
            await addBetItemsToNumberTotals(
              env.DB,
              chatId,
              bet.items
            );
          } catch (ledgerError) {
            console.error(
              "Number ledger save failed:",
              ledgerError
            );
          }

          try {
            await saveTransaction(
              env.DB,
              chatId,
              userId,
              originalText,
              grandTotal,
              now.toISOString()
            );
          } catch (databaseError) {
            console.error(
              "Transaction save failed:",
              databaseError
            );
          }
        } catch (error) {
          const errorMessage = String(
            error?.message || ""
          );

          let reply;

          if (
            errorMessage.includes(
              "နောက်ဆုံးစာကြောင်းတွင် R/®"
            )
          ) {
            reply =
`❌ စာရင်းပုံစံ မမှန်ပါ။

နောက်ဆုံးစာကြောင်းတွင်
R/® နှင့် ထိုးငွေ မတွေ့ပါ။

မှန်ကန်သောပုံစံ

16.27.38.49.50
12.23.34.45.56
67.78.89.90.10 R50`;
          } else if (
            errorMessage.includes(
              "ထိုးငွေ (Amount) မတွေ့ပါ"
            ) ||
            errorMessage.includes(
              "နောက်ဆုံးတွင် ထိုးငွေထည့်ပါ"
            )
          ) {
            const cleanInput =
              originalText.trim();

            const smartExample =
              /^\d{3,8}$/.test(cleanInput)
                ? `${cleanInput} အခွေ 500`
                : `${cleanInput} 500`;

            reply =
`❌ စာရင်းပုံစံ မမှန်ပါ။

ထိုးငွေ (Amount) မတွေ့ပါ။

မှန်ကန်သောပုံစံ
${smartExample}`;
          } else if (
            errorMessage.includes(
              "အကွက်အမျိုးအစား"
            )
          ) {
            const digits =
              originalText.trim();

            reply =
`❌ စာရင်းပုံစံ မမှန်ပါ။

အကွက်အမျိုးအစား (အခွေ/အခွေပူး) မပါပါ။

မှန်ကန်သောပုံစံ
${digits} အခွေ 500`;
          } else {
            const lineMatch =
              errorMessage.match(
                /စာကြောင်း\s+(\d+)/
              );

            const lineNumber =
              lineMatch?.[1] || "1";

            reply =
`❌ စာရင်းပုံစံ မမှန်ပါ။

📄 စာကြောင်း (${lineNumber})

📝 သင်ရိုက်ထားသောစာ
${originalText}

❗ ဒီစာရင်းအမျိုးအစားကို Bot က နားမလည်ပါ။

အသုံးပြုပုံကြည့်ရန် /help ကိုနှိပ်ပါ။`;
          }

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            reply
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

function buildLicense(duration) {
  if (duration === "forever" || duration === "lifetime") {
    return {
      ok: true,
      plan: "Lifetime",
      expiresAt: null,
      expireText: "အမြဲတမ်း"
    };
  }

  const days = Number(duration);
  if (!Number.isInteger(days) || days <= 0) {
    return {
      ok: false,
      message: "❌ သက်တမ်းမမှန်ပါ။\n\nဥပမာ — 30, 90, 365 သို့ forever"
    };
  }

  const expireDate = new Date();
  expireDate.setUTCDate(expireDate.getUTCDate() + days);
  return {
    ok: true,
    plan: getPlanName(days),
    expiresAt: expireDate.toISOString(),
    expireText: formatDate(expireDate)
  };
}

function buildWelcomeMessage() {
  return `🇳🇿 New Zealand 2D Ledger Bot

🎉 2D Ledger Bot မှ ကြိုဆိုပါတယ်။

ဒီ Bot သည် 2D App စာရင်းများကို
လွယ်ကူ၊ မြန်ဆန်၊ တိကျစွာ တွက်ချက်ပေးနိုင်သော
Smart Ledger Bot ဖြစ်ပါသည်။

━━━━━━━━━━━━━━

✨ Bot ၏ အားသာချက်များ

① 2D စာရင်းကို အလိုအလျောက်တွက်ချက်ပေးခြင်း
② Reverse — R / r / ® / Ⓡ
③ Rule Alias — apu / p / n / t / b / br
④ အခွေ၊ အခွေပူး၊ အပူး၊ ပါဝါ၊ နက္ခတ်၊ ညီကို၊ ဘရိတ် စသည့် Rule များ
⑤ ကပ်ဂဏန်းနှင့် Space ပါ/မပါ ပုံစံများ
⑥ ကွက်နှင့် ငွေပမာဏ အလိုအလျောက်တွက်ချက်ခြင်း
⑦ သပ်ရပ်သော Report ထုတ်ပေးခြင်း
⑧ Group တစ်ခုချင်း Ledger သီးသန့်ထားခြင်း

━━━━━━━━━━━━━━

💎 VIP အသင်းဝင်ကြေး
📅 1 လ — 30,000 ကျပ်
📅 2 လ — 50,000 ကျပ်
📅 5 လ — 140,000 ကျပ်
📅 1 နှစ် — 300,000 ကျပ်

🎁 5 လနှင့်အထက် ဝယ်ယူပါက 2 လ FREE

━━━━━━━━━━━━━━

📱 Telegram : @NewZealand2D2026

💳 KBZPay — Ye Htet Aung
📞 09 892276551

💳 WavePay — Khing Tha Zin
📞 09 788534785

━━━━━━━━━━━━━━

🙏 အသုံးပြုပေးသည့်အတွက် ကျေးဇူးတင်ရှိပါသည်။`;
}

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
