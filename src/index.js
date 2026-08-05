import { parseBetMessage } from "./parser.js";
import { tryCalculateExpression } from "./calculator.js";

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
  saveTransaction,
  getReportPermissions,
  setReportPermission,
  hasReportPermission,
  hasAnyReportPermission,
  listReportPermissionGroupsForUser
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
  archiveGroup,
  restoreGroup,
  deleteGroupPermanently,
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
        version: "5.1.9"
      });
    }

    if (
      request.method === "POST" &&
      url.pathname === "/webhook"
    ) {
      try {
        const update = await request.json();

        if (update.callback_query) {
          await handleAdminCallback(env, update.callback_query);
          return new Response("OK");
        }

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
        const groupAdmin = isGroup
          ? await isTelegramGroupAdmin(env.BOT_TOKEN, chatId, userId)
          : false;
        const canManageGroupLedger = admin || groupAdmin;
        const originalText = String(
          message.text || ""
        ).trim();

        if (!originalText) {
          return new Response("OK");
        }

        let text = normalizeCommand(originalText);
        const replyPrompt = String(message.reply_to_message?.text || "");

        if (replyPrompt.includes("စစ်လိုသော ၂ လုံးဂဏန်းကို ပို့ပါ")) {
          const numberText = originalText.replace(/\s+/g, "");
          if (/^\d{1,2}$/.test(numberText)) {
            text = `/number ${numberText}`;
          }
        }

        const now = new Date();

        // Private User များသည် သတ်မှတ်ထားသော Test Group ထဲဝင်ထားမှ Bot ကို အသုံးပြုနိုင်မည်။
        // /start မှာ Welcome + Join Button ပြမည်ဖြစ်သောကြောင့် /start ကို ဒီနေရာမှာ မပိတ်ပါ။
        if (!admin && !isGroup && text !== "/start") {
          const joined = await isRequiredTestGroupMember(env, userId);
          if (!joined) {
            await sendTestGroupJoinPrompt(env, chatId);
            return new Response("OK");
          }
        }

        // Private Chat မှာ Bot Owner အတွက် စီမံသူ Menu ပြမယ်။
        if (admin && !isGroup) {
          const menuHandled = await handleAdminKeyboard(env, chatId, text);
          if (menuHandled) return new Response("OK");
          text = mapAdminButtonToCommand(text);
        }

        // Group Owner/Admin အတွက် အုပ်စုစီမံ Menu ပြမယ်။
        if (isGroup && canManageGroupLedger) {
          const groupMenuHandled = await handleGroupAdminKeyboard(env, chatId, userId, text);
          if (groupMenuHandled) return new Response("OK");
          text = mapGroupAdminButtonToCommand(text);
        }

        // သာမန် User Menu (Group Admin လည်း User လုပ်ဆောင်ချက် သုံးနိုင်သည်)
        if (!admin || isGroup) {
          const userMenuHandled = await handleUserKeyboard(env, chatId, userId, isGroup, text);
          if (userMenuHandled) return new Response("OK");

          const userCommands = {
            "📊 စာရင်းကြည့်ရန်": "/ledger",
            "📖 အသုံးပြုနည်း": "/help",
            "📊 Report Menu": "/reportmenu"
          };
          text = userCommands[text] || text;
        }

        // သာမန် User များသည် Bot Private Chat ထဲတွင် 2D စာရင်းမတွက်နိုင်ပါ။
        // /start, /help, Menu/Report စသည့် command များသာ Private မှ အသုံးပြုနိုင်ပြီး
        // တိုက်ရိုက်ဂဏန်းစာရင်းကို Test Group ထဲတွင်သာ ရိုက်ရမည်။
        if (!admin && !isGroup && !text.startsWith("/")) {
          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            `⚠️ စမ်းသပ် 2D စာရင်းကို Test Group ထဲတွင်သာ ရိုက်နိုင်ပါသည်။

📢 Test Group ထဲဝင်ပြီး စာရင်းကို Group ထဲမှာ ပို့ပါ။`,
            await buildTestGroupJoinKeyboard(env)
          );
          return new Response("OK");
        }

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
          /^\/(?:approve|ban|unban|approvegroup|bangroup|unbangroup|reportgrant|reportrevoke|reportpermissions)(?:\s|$)/.test(text) ||
          text === "/reportmenu";

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
         * REPORT PERMISSION COMMANDS (OWNER ONLY)
         * =========================================
         */
        if (/^\/report(?:grant|revoke|permissions)(?:\s|$)/.test(text)) {
          if (!isOwner(userId, env)) {
            await sendMessage(env.BOT_TOKEN, chatId, "⛔ Bot Owner သာ Report ခွင့်ကို ပြင်နိုင်ပါသည်။");
            return new Response("OK");
          }

          const args = text.split(/\s+/);
          const command = args[0];
          const groupId = Number(args[1]);
          const targetUserId = Number(args[2]);
          const reportType = String(args[3] || "all").toLowerCase();
          const allowedTypes = ["all", "top", "below", "above", "untouched"];

          if (!Number.isSafeInteger(groupId) || groupId >= 0 ||
              !Number.isSafeInteger(targetUserId) || targetUserId <= 0 ||
              !allowedTypes.includes(reportType)) {
            await sendMessage(env.BOT_TOKEN, chatId,
`အသုံးပြုပုံ
/reportgrant GROUP_ID USER_ID all
/reportrevoke GROUP_ID USER_ID all
/reportpermissions GROUP_ID USER_ID

Report အမျိုးအစား: all, top, below, above, untouched`);
            return new Response("OK");
          }

          if (command === "/reportpermissions") {
            const row = await getReportPermissions(env.DB, groupId, targetUserId);
            await sendMessage(env.BOT_TOKEN, chatId,
`🔐 Report ခွင့်အခြေအနေ

👥 Group ID : ${groupId}
👤 User ID : ${targetUserId}
━━━━━━━━━━━━━━━━━━
🏆 အများဆုံး : ${Number(row?.can_top) === 1 ? "✅" : "❌"}
📉 ၅,၀၀၀ အောက် : ${Number(row?.can_below) === 1 ? "✅" : "❌"}
📈 ၁၀,၀၀၀ အထက် : ${Number(row?.can_above) === 1 ? "✅" : "❌"}
🎯 မထိုးရသေး : ${Number(row?.can_untouched) === 1 ? "✅" : "❌"}`);
            return new Response("OK");
          }

          const allowed = command === "/reportgrant";
          await setReportPermission(env.DB, groupId, targetUserId, reportType, allowed);
          await sendMessage(env.BOT_TOKEN, chatId,
`${allowed ? "✅ Report ခွင့်ပေးပြီးပါပြီ" : "🚫 Report ခွင့်ပိတ်ပြီးပါပြီ"}

👥 Group ID : ${groupId}
👤 User ID : ${targetUserId}
📊 Report : ${reportType}`);
          return new Response("OK");
        }

        if (text === "/reportmenu") {
          if (isGroup) {
            await sendPrivateReportMenu(env, chatId, userId);
            return new Response("OK");
          }

          // Private Chat မှ Report Menu နှိပ်သော User အတွက်
          // ခွင့်ရှိသော Group ကို DB မှ တိုက်ရိုက်ဖတ်ပြီး Filter Button များပြမည်။
          const reportGroups = await listReportPermissionGroupsForUser(env.DB, userId);
          if (!reportGroups.length) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "⛔ Report ကြည့်ခွင့်ပေးထားသော Group မရှိသေးပါ။ Group Owner ထံ ခွင့်တောင်းပါ။"
            );
            return new Response("OK");
          }

          if (reportGroups.length === 1) {
            await sendPrivateReportMenu(env, Number(reportGroups[0].group_id), userId);
            return new Response("OK");
          }

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            "📊 Report ကြည့်လိုသော Group ကို ရွေးပါ။",
            {
              inline_keyboard: reportGroups.map((group) => [{
                text: `👥 ${group.group_title || group.group_id}`,
                callback_data: `rpg:${group.group_id}`
              }])
            }
          );
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
            ? "📊 ဂဏန်းစာရင်း\n\n" +
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
          await handlePrivateGroupReport(env, {
            groupId: chatId, userId, isGroup, type: "untouched"
          });
          return new Response("OK");
        }

        if (text.startsWith("/top")) {
          const args = text.split(/\s+/);
          const limit = args[1] === undefined ? 10 : Number(args[1]);
          if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
            await sendPrivateNotice(env, userId, chatId, "အသုံးပြုပုံ\n/top\n/top 20");
            return new Response("OK");
          }
          await handlePrivateGroupReport(env, {
            groupId: chatId, userId, isGroup, type: "top", limit
          });
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
          const amount = Number(String(args[1] || "").replace(/,/g, ""));
          if (args.length !== 2 || !Number.isFinite(amount) || amount < 0) {
            await sendPrivateNotice(env, userId, chatId, "အသုံးပြုပုံ\n/below 5000");
            return new Response("OK");
          }
          await handlePrivateGroupReport(env, {
            groupId: chatId, userId, isGroup, type: "below", amount
          });
          return new Response("OK");
        }

        if (text.startsWith("/above")) {
          const args = text.split(/\s+/);
          const amount = Number(String(args[1] || "").replace(/,/g, ""));
          if (args.length !== 2 || !Number.isFinite(amount) || amount < 0) {
            await sendPrivateNotice(env, userId, chatId, "အသုံးပြုပုံ\n/above 10000");
            return new Response("OK");
          }
          await handlePrivateGroupReport(env, {
            groupId: chatId, userId, isGroup, type: "above", amount
          });
          return new Response("OK");
        }

        if (text === "/sales") {
          if (!canManageGroupLedger) {
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
            "💰 စုစုပေါင်းအရောင်း\n\n" +
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
          if (!canManageGroupLedger) {
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
  "✅ ဒီအုပ်စု၏ စာရင်းကို ရှင်းပြီးပါပြီ။"
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
          if (admin && !isGroup) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
`👑 မင်္ဂလာပါ စီမံသူ

━━━━━━━━━━━━━━
✅ New Zealand 2D Ledger Bot v5.1.8
━━━━━━━━━━━━━━

အောက်က မြန်မာခလုတ်တွေကို နှိပ်ပြီး စီမံနိုင်ပါပြီ။
အောက်က မြန်မာခလုတ်တွေကို နှိပ်ပြီး အသုံးပြုနိုင်ပါတယ်။`,
              adminMainKeyboard()
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

            const canSeeReports = isOwner(userId, env) ||
              await hasAnyReportPermission(env.DB, chatId, userId);
            const keyboard = canManageGroupLedger
              ? groupAdminMainKeyboard(false, canSeeReports)
              : userMainKeyboard(false, canSeeReports);
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              buildWelcomeMessage(),
              keyboard
            );
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

          const joined = await isRequiredTestGroupMember(env, userId);
          if (!joined) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              buildWelcomeMessage(),
              await buildTestGroupJoinKeyboard(env)
            );
            return new Response("OK");
          }

          const access = hasAccess(user);
          const privateReportGroups = await listReportPermissionGroupsForUser(env.DB, userId);
          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            buildWelcomeMessage(),
            userMainKeyboard(false, privateReportGroups.length > 0)
          );
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
         * SAFE CALCULATOR
         * =========================================
         */
        try {
          const calculation =
            tryCalculateExpression(
              originalText
            );

          if (calculation) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
`🧮 Calculator

${calculation.expression}

= ${calculation.formattedResult} ✅`
            );

            return new Response("OK");
          }
        } catch (calculatorError) {
          await sendMessage(
            env.BOT_TOKEN,
            chatId,
`❌ Calculator ပုံစံ မမှန်ပါ။

${String(
  calculatorError?.message ||
  "တွက်ချက်မှု မအောင်မြင်ပါ။"
)}

ဥပမာ
3000 + 5000 + 6000 - 2000 = ??`
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
        `(${item.count}) ကွပ် → ` +
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
━━━━━━━━━━━━
${reportLines}
━━━━━━━━━━━━
💰 စုစုပေါင်း : ${formatMoney(grandTotal)} ကျပ်
━━━━━━━━━━━━
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
          // Group ထဲက Hi/Hello နှင့် သာမန်စကားများကို Bot က မတုံ့ပြန်ပါ။
          // 2D စာရင်းရေးရန် ကြိုးစားထားသောစာသာ Error Message ပြမည်။
          if (!looksLike2DBetAttempt(originalText)) {
            return new Response("OK");
          }

          const errorMessage = String(
            error?.message || ""
          );

          const reply = buildSmartBetErrorMessage(
            originalText,
            errorMessage
          );

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

function buildSmartBetErrorMessage(input, parserMessage = "") {
  const original = String(input || "").trim();
  const compact = original.replace(/\s+/g, "");
  const exampleBase = original.replace(/[Rr®Ⓡ]+$/u, "").trim();
  const numberListPattern = /\d{1,2}(?:\s*[-./,၊_]\s*\d{1,2})+/u;
  const rulePattern = /(?:အပူး|စုံပူး|မပူး|ပါဝါ|နက္ခတ်|နခတ်|ညီကို|ဆယ်ပြည့်|ဆယ်ပြည့်|စုံစုံ|မမ|စုံမ|မစုံ|အ?ခွေပူး|အ?ခွေ|ခွေပူး|ခွေ|ခပ|ဘရိတ်|ပါတ်|ပတ်|ထိပ်|ပိတ်|ကပ်|apu|sp|mp|pw|nt|mm|ss|sm|ms|khwepu|khwe|kp|kw|br|break|pat|ht|pt|cp)/iu;

  if (/^[Rr®Ⓡ]\s*[\d,]+$/u.test(original)) {
    return `❌ စာရင်းပုံစံ မှားနေပါတယ်။\n\n🔢 2D ဂဏန်း မတွေ့ပါ။\n\nမှန်ကန်သောပုံစံ\n78-90-67-35-42®500`;
  }

  if (/[Rr®Ⓡ]\s*[A-Za-z]+$/u.test(original)) {
    return `❌ စာရင်းပုံစံ မှားနေပါတယ်။\n\n💰 ထိုးငွေကို ဂဏန်းဖြင့် ရေးပေးပါ။\n\nမှန်ကန်သောပုံစံ\n${exampleBase || "78-90-67-35-42"}®500`;
  }

  if (/[Rr®Ⓡ]\s*$/u.test(original)) {
    return `❌ စာရင်းပုံစံ မှားနေပါတယ်။\n\n💰 ထိုးငွေ (Amount) မထည့်ရသေးပါ။\n\nမှန်ကန်သောပုံစံ\n${exampleBase || "78-90-67-35-42"}®500`;
  }

  if (
    parserMessage.includes("ထိုးငွေ (Amount) မမှန်") ||
    /[Rr®Ⓡ]\s*[^\d\s,]+/u.test(original)
  ) {
    return `❌ စာရင်းပုံစံ မှားနေပါတယ်။\n\n💰 ထိုးငွေ (Amount) မှားနေပါတယ်။\nထိုးငွေကို ဂဏန်းဖြင့် ရေးပေးပါ။\n\nမှန်ကန်သောပုံစံ\n78-90-67-35-42®500`;
  }

  if (
    parserMessage.includes("ထိုးငွေ (Amount) မတွေ့") ||
    parserMessage.includes("နောက်ဆုံးတွင် ထိုးငွေထည့်ပါ") ||
    numberListPattern.test(original) ||
    rulePattern.test(original)
  ) {
    let example;
    if (/^\d{3,8}$/u.test(compact)) {
      example = `${original} အခွေ 500`;
    } else if (numberListPattern.test(original)) {
      example = `${original}®500`;
    } else {
      example = `${original} 500`;
    }

    return `❌ စာရင်းပုံစံ မှားနေပါတယ်။\n\n💰 ထိုးငွေ (Amount) မထည့်ရသေးပါ။\n\nမှန်ကန်သောပုံစံ\n${example}`;
  }

  if (parserMessage.includes("အကွက်အမျိုးအစား")) {
    return `❌ စာရင်းပုံစံ မှားနေပါတယ်။\n\n🔢 အကွက်အမျိုးအစား (အခွေ/အခွေပူး) မပါပါ။\n\nမှန်ကန်သောပုံစံ\n${original} အခွေ 500`;
  }

  if (
    parserMessage.includes("ဂဏန်း သို့မဟုတ် Rule မတွေ့") ||
    parserMessage.includes("တွက်ရန် 2D ဂဏန်းမရှိ")
  ) {
    return `❌ စာရင်းပုံစံ မှားနေပါတယ်။\n\n🔢 2D ဂဏန်း မတွေ့ပါ။\n\nမှန်ကန်သောပုံစံ\n78-90-67-35-42®500`;
  }

  const lineMatch = parserMessage.match(/စာကြောင်း\s+(\d+)/u);
  const lineNumber = lineMatch?.[1] || "1";

  return `❌ စာရင်းပုံစံ မှားနေပါတယ်။\n\n📄 စာကြောင်း (${lineNumber})\n\n📝 သင်ရိုက်ထားသောစာ\n${original}\n\n❗ ဂဏန်း၊ Rule သို့မဟုတ် ထိုးငွေပုံစံကို ပြန်စစ်ပါ။\n\nအသုံးပြုပုံကြည့်ရန် /help ကိုနှိပ်ပါ။`;
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

function looksLike2DBetAttempt(value) {
  const text = String(value || "").trim();
  if (!text) return false;

  // Commands are handled elsewhere and must not be treated as casual chat.
  if (text.startsWith("/")) return true;

  // Reverse symbols, common rules, and aliases strongly indicate a bet entry.
  if (/[®Ⓡ]/.test(text)) return true;
  if (/(?:^|\s)[Rr](?:\s|\d|$)/.test(text)) return true;
  if (/(အခွေ|ခွေ|အခွေပူး|ခွေပူး|ကပ်|နက္ခတ်|ပါဝါ|ဆယ်ပြည့်|ညီကို|အပူး|စုံပူး|မပူး|မမ|စုံစုံ|ဘရိတ်|ပါတ်|ထိပ်|ပိတ်)/.test(text)) {
    return true;
  }
  if (/(?:^|\s)(?:apu|khwe|khwepu|kp|kw|br|break|sp|mp|mm|ss|sm|ms|pw|nt|cp|ht|pt|pat|[pntsb])(?:\s|\d|$)/i.test(text)) {
    return true;
  }

  // Examples: 76-09-34-52, 67.78.90, 67/12345.
  if (/\d{1,2}(?:\s*[-.,/]\s*\d{1,2})+/.test(text)) return true;

  // A bare one- or two-digit number is likely an incomplete 2D entry.
  if (/^\d{1,2}$/.test(text)) return true;

  // Number followed by an amount-like number, with or without spaces.
  if (/^\d{2}\s*\d{2,}$/.test(text)) return true;

  return false;
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

function userMainKeyboard(selective = false, canSeeReports = false) {
  const keyboard = [
    ["🎲 ၂ဒီထိုးရန်", "📊 စာရင်းကြည့်ရန်"],
    ["🔍 ဂဏန်းရှာရန်", "📖 အသုံးပြုနည်း"],
    ["💎 အသင်းဝင်ရန်", "📞 စီမံသူဆက်သွယ်ရန်"],
    ["🏠 ပင်မစာမျက်နှာ", "⌨️ ခလုတ်ဖျောက်ရန်"]
  ];
  if (canSeeReports) {
    keyboard.splice(2, 0, ["📊 Report Menu"]);
  }
  return {
    keyboard,
    resize_keyboard: true,
    is_persistent: true,
    selective,
    input_field_placeholder: "လိုချင်သောလုပ်ဆောင်ချက်ကို ရွေးပါ"
  };
}

async function handleUserKeyboard(env, chatId, userId, isGroup, text) {
  if (text === "🎲 ၂ဒီထိုးရန်") {
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      "🎲 ထိုးလိုသော ၂ဒီစာရင်းကို တိုက်ရိုက်ရိုက်ပို့ပါ။\n\nဥပမာ\n67 500\n67R500\n5br300"
    );
    return true;
  }

  if (text === "🔍 ဂဏန်းရှာရန်") {
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      "🔍 စစ်လိုသော ၂ လုံးဂဏန်းကို ပို့ပါ။\n\nဥပမာ — 67",
      { force_reply: true, input_field_placeholder: "ဥပမာ 67" }
    );
    return true;
  }

  if (text === "💎 အသင်းဝင်ရန်") {
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      `💎 အသင်းဝင်ကြေး\n\n📅 ၁ လ — 30,000 ကျပ်\n📅 ၂ လ — 50,000 ကျပ်\n📅 ၅ လ — 140,000 ကျပ်\n📅 ၁ နှစ် — 300,000 ကျပ်\n\n📩 ဝယ်ယူလိုပါက @NewZealand2D2026 ကို ဆက်သွယ်ပါ။`
    );
    return true;
  }

  if (text === "📞 စီမံသူဆက်သွယ်ရန်") {
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      `📞 စီမံသူဆက်သွယ်ရန်\n\nTelegram : @NewZealand2D2026\n\nKBZPay\nYe Htet Aung\n09 892276551\n\nWavePay\nKhing Tha Zin\n09 788534785`
    );
    return true;
  }

  if (text === "🏠 ပင်မစာမျက်နှာ") {
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      "🏠 အသုံးပြုသူပင်မစာမျက်နှာ",
      userMainKeyboard(
        false,
        isGroup && (isOwner(userId, env) || await hasAnyReportPermission(env.DB, chatId, userId))
      )
    );
    return true;
  }

  if (text === "⌨️ ခလုတ်ဖျောက်ရန်") {
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      "✅ ခလုတ်တွေကို ဖျောက်ထားပါပြီ။ /start နှိပ်ရင် ပြန်ပေါ်ပါမယ်။",
      { remove_keyboard: true }
    );
    return true;
  }

  return false;
}

function groupAdminMainKeyboard(selective = false, canSeeReports = false) {
  const keyboard = [
    ["🎲 ၂ဒီထိုးရန်", "📊 စာရင်းကြည့်ရန်"],
    ["🔍 ဂဏန်းရှာရန်", "📖 အသုံးပြုနည်း"],
    ["💰 စုစုပေါင်းအရောင်း"],
    ["♻️ စာရင်းရှင်းရန်"],
    ["💎 အသင်းဝင်ရန်", "📞 စီမံသူဆက်သွယ်ရန်"],
    ["🏠 ပင်မစာမျက်နှာ", "⌨️ ခလုတ်ဖျောက်ရန်"]
  ];
  if (canSeeReports) {
    keyboard.splice(3, 0,
      ["🏆 အများဆုံးဂဏန်း"],
      ["📉 ၅,၀၀၀ အောက်", "📈 ၁၀,၀၀၀ အထက်"],
      ["🎯 မထိုးရသေးသောဂဏန်း"]
    );
  }
  return {
    keyboard,
    resize_keyboard: true,
    is_persistent: true,
    selective,
    input_field_placeholder: "အုပ်စုစီမံလုပ်ဆောင်ချက်ကို ရွေးပါ"
  };
}

async function handleGroupAdminKeyboard(env, chatId, userId, text) {
  if (text === "🏠 ပင်မစာမျက်နှာ") {
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      "👑 အုပ်စုစီမံသူ ပင်မစာမျက်နှာ",
      groupAdminMainKeyboard(false, isOwner(userId, env) || await hasAnyReportPermission(env.DB, chatId, userId))
    );
    return true;
  }

  if (text === "⌨️ ခလုတ်ဖျောက်ရန်") {
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      "✅ ခလုတ်တွေကို ဖျောက်ထားပါပြီ။ /start နှိပ်ရင် ပြန်ပေါ်ပါမယ်။",
      { remove_keyboard: true }
    );
    return true;
  }

  if (text === "♻️ စာရင်းရှင်းရန်") {
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      "⚠️ ဒီအုပ်စုရဲ့ စာရင်းအားလုံးကို ရှင်းမှာ သေချာပါသလား။",
      {
        inline_keyboard: [[
          { text: "✅ အတည်ပြုမည်", callback_data: `group_reset_confirm:${chatId}` },
          { text: "❌ မလုပ်တော့ပါ", callback_data: "group_reset_cancel" }
        ]]
      }
    );
    return true;
  }
  return false;
}

function mapGroupAdminButtonToCommand(text) {
  const commands = {
    "💰 စုစုပေါင်းအရောင်း": "/sales",
    "🏆 အများဆုံးဂဏန်း": "/top",
    "📉 ၅,၀၀၀ အောက်": "/below 5000",
    "📈 ၁၀,၀၀၀ အထက်": "/above 10000",
    "🎯 မထိုးရသေးသောဂဏန်း": "/untouched"
  };
  return commands[text] || text;
}

function adminMainKeyboard() {
  return {
    keyboard: [
      ["👤 အသုံးပြုသူများ", "👥 အုပ်စုများ"],
      ["📊 စာရင်းစီမံရန်", "💰 အရောင်းကြည့်ရန်"],
      ["🔐 Report ခွင့်"],
      ["⌨️ ခလုတ်ဖျောက်ရန်"]
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "စီမံသူလုပ်ဆောင်ချက်ရွေးပါ"
  };
}

function adminUserKeyboard() {
  return {
    keyboard: [
      ["👥 အသုံးပြုသူစာရင်း"],
      ["✅ အသုံးပြုခွင့်ပေးရန်", "🚫 အသုံးပြုခွင့်ပိတ်ရန်"],
      ["🔓 အသုံးပြုခွင့်ပြန်ဖွင့်ရန်"],
      ["🔙 ပင်မစာမျက်နှာ"]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

function adminGroupKeyboard() {
  return {
    keyboard: [
      ["🟢 အသုံးပြုနေသောအုပ်စုများ"],
      ["🔴 ပိတ်ထားသောအုပ်စုများ"],
      ["📦 သိမ်းထားသောအုပ်စုများ"],
      ["✅ အုပ်စုခွင့်ပြုရန်"],
      ["🔙 ပင်မစာမျက်နှာ"]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

function adminLedgerKeyboard() {
  return {
    keyboard: [
      ["📒 စာရင်းကြည့်ရန်", "🎯 မထိုးရသေးသောဂဏန်း"],
      ["🏆 အများဆုံးဂဏန်း", "🔢 ဂဏန်းရှာရန်"],
      ["📉 သတ်မှတ်ငွေအောက်", "📈 သတ်မှတ်ငွေအထက်"],
      ["♻️ စာရင်းရှင်းရန်"],
      ["🔙 ပင်မစာမျက်နှာ"]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

async function handleAdminKeyboard(env, chatId, text) {
  if (text === "👤 အသုံးပြုသူများ") {
    await sendMessage(env.BOT_TOKEN, chatId, "👤 အသုံးပြုသူ စီမံခန့်ခွဲမှု", adminUserKeyboard());
    return true;
  }

  if (text === "👥 အုပ်စုများ") {
    await sendMessage(env.BOT_TOKEN, chatId, "👥 အုပ်စုစီမံခန့်ခွဲမှု", adminGroupKeyboard());
    return true;
  }

  if (text === "📊 စာရင်းစီမံရန်") {
    await sendMessage(env.BOT_TOKEN, chatId, "📊 စာရင်းလုပ်ဆောင်ချက်ရွေးပါ", adminLedgerKeyboard());
    return true;
  }

  if (text === "💰 အရောင်းကြည့်ရန်") {
    return false;
  }

  if (text === "🔐 Report ခွင့်") {
    await sendReportPermissionGroupPicker(env, chatId);
    return true;
  }

  if (text === "🔙 ပင်မစာမျက်နှာ") {
    await sendMessage(env.BOT_TOKEN, chatId, "👑 စီမံသူပင်မစာမျက်နှာ", adminMainKeyboard());
    return true;
  }

  if (text === "⌨️ ခလုတ်ဖျောက်ရန်") {
    await sendMessage(env.BOT_TOKEN, chatId, "✅ ခလုတ်တွေကို ဖျောက်ထားပါပြီ။ /start နှိပ်ရင် ပြန်ပေါ်ပါမယ်။", {
      remove_keyboard: true
    });
    return true;
  }

  if (text === "✅ အုပ်စုခွင့်ပြုရန်") {
    await sendGroupPicker(env, chatId, "approve");
    return true;
  }

  if (text === "🟢 အသုံးပြုနေသောအုပ်စုများ") {
    await sendGroupPicker(env, chatId, "active");
    return true;
  }

  if (text === "🔴 ပိတ်ထားသောအုပ်စုများ") {
    await sendGroupPicker(env, chatId, "disabled");
    return true;
  }

  if (text === "📦 သိမ်းထားသောအုပ်စုများ") {
    await sendGroupPicker(env, chatId, "archived");
    return true;
  }

  const prompts = {
    "✅ အသုံးပြုခွင့်ပေးရန်": "User ID နဲ့ ရက်အရေအတွက်ကို ဒီပုံစံနဲ့ပို့ပါ။\n\n/approve USER_ID 30\n\nနောက်အဆင့်မှာ ID မရိုက်ဘဲ ရွေးနိုင်တဲ့ Button စနစ် ထည့်ပေးမယ်။",
    "🚫 အသုံးပြုခွင့်ပိတ်ရန်": "ပိတ်မယ့် User ID ကို ဒီပုံစံနဲ့ပို့ပါ။\n\n/ban USER_ID",
    "🔓 အသုံးပြုခွင့်ပြန်ဖွင့်ရန်": "ပြန်ဖွင့်မယ့် User ID ကို ဒီပုံစံနဲ့ပို့ပါ။\n\n/unban USER_ID",
    "🔢 ဂဏန်းရှာရန်": "စစ်မယ့်ဂဏန်းကို ဒီပုံစံနဲ့ပို့ပါ။\n\n/number 67",
    "📉 သတ်မှတ်ငွေအောက်": "ငွေပမာဏကို ဒီပုံစံနဲ့ပို့ပါ။\n\n/below 5000",
    "📈 သတ်မှတ်ငွေအထက်": "ငွေပမာဏကို ဒီပုံစံနဲ့ပို့ပါ။\n\n/above 10000"
  };

  if (prompts[text]) {
    await sendMessage(env.BOT_TOKEN, chatId, prompts[text]);
    return true;
  }

  return false;
}


async function sendGroupPicker(env, chatId, action) {
  const groups = await listGroups(env.DB);

  const filters = {
    approve: (group) => group.status !== "archived",
    active: (group) => group.status === "approved",
    disabled: (group) => group.status === "banned" || group.status === "pending",
    archived: (group) => group.status === "archived"
  };

  const filteredGroups = groups.filter(filters[action] || (() => true));

  if (!filteredGroups.length) {
    const emptyMessages = {
      active: "🟢 အသုံးပြုနေသောအုပ်စု မရှိသေးပါ။",
      disabled: "🔴 ပိတ်ထားသောအုပ်စု မရှိသေးပါ။",
      archived: "📦 သိမ်းထားသောအုပ်စု မရှိသေးပါ။",
      approve: "👥 ခွင့်ပြုရန်အုပ်စု မရှိသေးပါ။"
    };
    await sendMessage(env.BOT_TOKEN, chatId, emptyMessages[action] || "👥 Group စာရင်း မရှိသေးပါ။");
    return;
  }

  const titles = {
    approve: "✅ ခွင့်ပြုမည့်အုပ်စုကို ရွေးပါ",
    active: "🟢 အသုံးပြုနေသောအုပ်စုများ",
    disabled: "🔴 ပိတ်ထားသောအုပ်စုများ",
    archived: "📦 သိမ်းထားသောအုပ်စုများ"
  };

  const buttons = filteredGroups.slice(0, 80).map((group) => [{
    text: `${group.status === "approved" ? "🟢" : group.status === "archived" ? "📦" : "🔴"} ${String(group.group_title || "အမည်မရှိ").slice(0, 28)}`,
    callback_data: `grp:${action === "approve" ? "approve" : "manage"}:${group.group_id}`
  }]);

  await sendMessage(env.BOT_TOKEN, chatId, titles[action] || "အုပ်စုကို ရွေးပါ", { inline_keyboard: buttons });
}

async function sendReportPermissionGroupPicker(env, chatId) {
  const groups = (await listGroups(env.DB)).filter((group) => group.status !== "archived");

  if (!groups.length) {
    await sendMessage(env.BOT_TOKEN, chatId, "👥 Report ခွင့်စီမံရန် Group မရှိသေးပါ။");
    return;
  }

  const buttons = groups.slice(0, 80).map((group) => [{
    text: `👥 ${String(group.group_title || "အမည်မရှိ").slice(0, 30)}`,
    callback_data: `rpm:g:${group.group_id}`
  }]);

  await sendMessage(
    env.BOT_TOKEN,
    chatId,
    "🔐 Report ခွင့်စီမံရန်\n\nပထမဦးစွာ Group ကို ရွေးပါ။",
    { inline_keyboard: buttons }
  );
}

async function sendReportPermissionUserPicker(env, chatId, groupId) {
  const users = await listUsers(env.DB);

  if (!users.length) {
    await sendMessage(env.BOT_TOKEN, chatId, "👤 ရွေးချယ်နိုင်သော User မရှိသေးပါ။ User က Bot Private Chat မှာ /start နှိပ်ထားရပါမယ်။");
    return;
  }

  const buttons = users.slice(0, 80).map((user) => {
    const name = [user.first_name, user.username ? `@${user.username}` : ""]
      .filter(Boolean)
      .join(" ") || `User ${user.chat_id}`;
    return [{
      text: `👤 ${String(name).slice(0, 30)}`,
      callback_data: `rpm:u:${groupId}:${user.chat_id}`
    }];
  });

  await sendMessage(
    env.BOT_TOKEN,
    chatId,
    `🔐 Report ခွင့်စီမံရန်\n\n👥 Group ID : ${groupId}\n\nUser ကို ရွေးပါ။`,
    { inline_keyboard: buttons }
  );
}

async function sendReportPermissionActionPicker(env, chatId, groupId, targetUserId) {
  await sendMessage(
    env.BOT_TOKEN,
    chatId,
    `🔐 Report ခွင့်စီမံရန်\n\n👥 Group ID : ${groupId}\n👤 User ID : ${targetUserId}\n\nလုပ်ဆောင်ချက်ကို ရွေးပါ။`,
    {
      inline_keyboard: [
        [
          { text: "✅ ခွင့်ပေးရန်", callback_data: `rpm:a:${groupId}:${targetUserId}:grant` },
          { text: "🚫 ပြန်ပိတ်ရန်", callback_data: `rpm:a:${groupId}:${targetUserId}:revoke` }
        ],
        [
          { text: "🔎 အခြေအနေစစ်ရန်", callback_data: `rpm:a:${groupId}:${targetUserId}:check` }
        ]
      ]
    }
  );
}

async function sendReportTypePicker(env, chatId, groupId, targetUserId, action) {
  const verb = action === "grant" ? "ခွင့်ပေးမည့်" : "ပိတ်မည့်";
  await sendMessage(
    env.BOT_TOKEN,
    chatId,
    `📊 ${verb} Report အမျိုးအစားကို ရွေးပါ။`,
    {
      inline_keyboard: [
        [{ text: "✅ အားလုံး", callback_data: `rpm:t:${groupId}:${targetUserId}:${action}:all` }],
        [
          { text: "🏆 အများဆုံး", callback_data: `rpm:t:${groupId}:${targetUserId}:${action}:top` },
          { text: "📉 ၅,၀၀၀ အောက်", callback_data: `rpm:t:${groupId}:${targetUserId}:${action}:below` }
        ],
        [
          { text: "📈 ၁၀,၀၀၀ အထက်", callback_data: `rpm:t:${groupId}:${targetUserId}:${action}:above` },
          { text: "🎯 မထိုးရသေး", callback_data: `rpm:t:${groupId}:${targetUserId}:${action}:untouched` }
        ]
      ]
    }
  );
}

async function sendReportPermissionStatus(env, chatId, groupId, targetUserId) {
  const row = await getReportPermissions(env.DB, groupId, targetUserId);
  await sendMessage(env.BOT_TOKEN, chatId,
`🔐 Report ခွင့်အခြေအနေ

👥 Group ID : ${groupId}
👤 User ID : ${targetUserId}
━━━━━━━━━━━━━━━━━━
🏆 အများဆုံး : ${Number(row?.can_top) === 1 ? "✅" : "❌"}
📉 ၅,၀၀၀ အောက် : ${Number(row?.can_below) === 1 ? "✅" : "❌"}
📈 ၁၀,၀၀၀ အထက် : ${Number(row?.can_above) === 1 ? "✅" : "❌"}
🎯 မထိုးရသေး : ${Number(row?.can_untouched) === 1 ? "✅" : "❌"}`);
}

function isOwner(userId, env) {
  const configuredOwnerId = Number(env.OWNER_ID);
  if (Number.isSafeInteger(configuredOwnerId) && configuredOwnerId > 0) {
    return Number(userId) === configuredOwnerId;
  }
  return isAdmin(userId, env);
}

async function handleAdminCallback(env, callbackQuery) {
  const callbackId = callbackQuery.id;
  const fromId = callbackQuery.from?.id;
  const chatId = callbackQuery.message?.chat?.id;
  const data = String(callbackQuery.data || "");

  if (!chatId) return;

  // Test Group Join စစ်ဆေးရန် Button — Admin callback မဟုတ်သော User callback ဖြစ်သည်။
  if (data === "verify_test_group_join") {
    const joined = await isRequiredTestGroupMember(env, fromId);
    if (!joined) {
      await answerCallbackQuery(
        env.BOT_TOKEN,
        callbackId,
        "Test Group ထဲ မဝင်ရသေးပါ။ အရင်ဝင်ပြီး ပြန်စစ်ပါ။",
        true
      );
      return;
    }

    await answerCallbackQuery(env.BOT_TOKEN, callbackId, "Group ဝင်ထားကြောင်း စစ်ဆေးပြီးပါပြီ ✅");
    const privateReportGroups = await listReportPermissionGroupsForUser(env.DB, fromId);
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      "✅ Test Group ထဲ ဝင်ထားကြောင်း အတည်ပြုပြီးပါပြီ။\n\nယခု Bot Menu ကို အသုံးပြုနိုင်ပါပြီ။",
      userMainKeyboard(false, privateReportGroups.length > 0)
    );
    return;
  }

  if (data.startsWith("rpm:")) {
    if (!isOwner(fromId, env)) {
      await answerCallbackQuery(env.BOT_TOKEN, callbackId, "Bot Owner သာ Report ခွင့်ကို စီမံနိုင်ပါတယ်။", true);
      return;
    }

    const parts = data.split(":");
    const step = parts[1];
    const groupId = Number(parts[2]);

    if (!Number.isSafeInteger(groupId) || groupId >= 0) {
      await answerCallbackQuery(env.BOT_TOKEN, callbackId, "Group ID မမှန်ပါ။", true);
      return;
    }

    if (step === "g") {
      await answerCallbackQuery(env.BOT_TOKEN, callbackId, "User ရွေးပါ");
      await sendReportPermissionUserPicker(env, chatId, groupId);
      return;
    }

    const targetUserId = Number(parts[3]);
    if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
      await answerCallbackQuery(env.BOT_TOKEN, callbackId, "User ID မမှန်ပါ။", true);
      return;
    }

    if (step === "u") {
      await answerCallbackQuery(env.BOT_TOKEN, callbackId, "လုပ်ဆောင်ချက်ရွေးပါ");
      await sendReportPermissionActionPicker(env, chatId, groupId, targetUserId);
      return;
    }

    if (step === "a") {
      const action = parts[4];
      if (action === "check") {
        await answerCallbackQuery(env.BOT_TOKEN, callbackId, "စစ်ဆေးပြီးပါပြီ");
        await sendReportPermissionStatus(env, chatId, groupId, targetUserId);
        return;
      }
      if (action !== "grant" && action !== "revoke") {
        await answerCallbackQuery(env.BOT_TOKEN, callbackId, "လုပ်ဆောင်ချက် မမှန်ပါ။", true);
        return;
      }
      await answerCallbackQuery(env.BOT_TOKEN, callbackId, "Report အမျိုးအစားရွေးပါ");
      await sendReportTypePicker(env, chatId, groupId, targetUserId, action);
      return;
    }

    if (step === "t") {
      const action = parts[4];
      const reportType = parts[5];
      const allowedTypes = ["all", "top", "below", "above", "untouched"];
      if ((action !== "grant" && action !== "revoke") || !allowedTypes.includes(reportType)) {
        await answerCallbackQuery(env.BOT_TOKEN, callbackId, "ရွေးချယ်မှု မမှန်ပါ။", true);
        return;
      }

      const allowed = action === "grant";
      await setReportPermission(env.DB, groupId, targetUserId, reportType, allowed);
      await answerCallbackQuery(env.BOT_TOKEN, callbackId, allowed ? "ခွင့်ပေးပြီးပါပြီ ✅" : "ခွင့်ပိတ်ပြီးပါပြီ 🚫");
      await sendMessage(env.BOT_TOKEN, chatId,
`${allowed ? "✅ Report ခွင့်ပေးပြီးပါပြီ" : "🚫 Report ခွင့်ပိတ်ပြီးပါပြီ"}

👥 Group ID : ${groupId}
👤 User ID : ${targetUserId}
📊 Report : ${reportType}`);
      return;
    }

    await answerCallbackQuery(env.BOT_TOKEN, callbackId);
    return;
  }

  if (data === "group_reset_cancel") {
    await answerCallbackQuery(env.BOT_TOKEN, callbackId, "မလုပ်တော့ပါ။");
    return;
  }

  if (data.startsWith("group_reset_confirm:")) {
    const requestedChatId = Number(data.split(":")[1]);
    const allowed = isAdmin(fromId, env) ||
      await isTelegramGroupAdmin(env.BOT_TOKEN, chatId, fromId);
    if (!allowed || requestedChatId !== Number(chatId)) {
      await answerCallbackQuery(env.BOT_TOKEN, callbackId, "အုပ်စုစီမံသူသာ အသုံးပြုနိုင်ပါတယ်။", true);
      return;
    }
    await resetNumberTotals(env.DB, chatId);
    await resetTransactions(env.DB, chatId);
    await answerCallbackQuery(env.BOT_TOKEN, callbackId, "စာရင်းရှင်းပြီးပါပြီ ✅");
    await sendMessage(env.BOT_TOKEN, chatId, "✅ ဒီအုပ်စု၏ စာရင်းကို ရှင်းပြီးပါပြီ။");
    return;
  }

  if (data.startsWith("rpg:")) {
    const groupId = Number(data.split(":")[1]);
    if (!Number.isSafeInteger(groupId) || groupId >= 0) {
      await answerCallbackQuery(env.BOT_TOKEN, callbackId, "Group ID မမှန်ပါ။", true);
      return;
    }

    const canSee = isOwner(fromId, env) ||
      await hasAnyReportPermission(env.DB, groupId, fromId);
    if (!canSee) {
      await answerCallbackQuery(env.BOT_TOKEN, callbackId, "ဒီ Group အတွက် Report ခွင့်မရှိပါ။", true);
      return;
    }

    await answerCallbackQuery(env.BOT_TOKEN, callbackId, "Report Menu ဖွင့်နေပါပြီ…");
    await sendPrivateReportMenu(env, groupId, fromId);
    return;
  }

  if (data.startsWith("rpt:")) {
    const parts = data.split(":");
    const type = parts[1];
    const groupId = Number(parts[2]);
    await answerCallbackQuery(env.BOT_TOKEN, callbackId, "Report ပို့နေပါပြီ…");
    await handlePrivateGroupReport(env, { groupId, userId: fromId, isGroup: true, type });
    return;
  }

  if (!isAdmin(fromId, env)) {
    await answerCallbackQuery(env.BOT_TOKEN, callbackId, "Bot စီမံသူသာ အသုံးပြုနိုင်ပါတယ်။", true);
    return;
  }

  const parts = data.split(":");
  if (parts[0] !== "grp") {
    await answerCallbackQuery(env.BOT_TOKEN, callbackId);
    return;
  }

  const action = parts[1];
  const groupId = Number(parts[2]);
  const group = await getLicensedGroup(env.DB, groupId);

  if (!group) {
    await answerCallbackQuery(env.BOT_TOKEN, callbackId, "Group မတွေ့ပါ။", true);
    return;
  }

  if (action === "manage") {
    const buttons = [];
    if (group.status === "approved") {
      buttons.push([{ text: "🚫 အုပ်စုပိတ်ရန်", callback_data: `grp:ban:${groupId}` }]);
    } else if (group.status === "archived") {
      buttons.push([{ text: "♻️ ပြန်ယူရန်", callback_data: `grp:restore:${groupId}` }]);
      if (isOwner(fromId, env)) {
        buttons.push([{ text: "🗑️ အမြဲတမ်းဖျက်ရန်", callback_data: `grp:deleteask:${groupId}` }]);
      }
    } else {
      buttons.push([{ text: "🔓 အုပ်စုပြန်ဖွင့်ရန်", callback_data: `grp:unban:${groupId}` }]);
      buttons.push([{ text: "📦 သိမ်းထားရန်", callback_data: `grp:archive:${groupId}` }]);
    }

    await answerCallbackQuery(env.BOT_TOKEN, callbackId);
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      `👥 အုပ်စုစီမံခန့်ခွဲမှု\n\n📌 အုပ်စု : ${group.group_title || "အမည်မရှိ"}\n🆔 ID : ${groupId}\n📍 အခြေအနေ : ${group.status}`,
      { inline_keyboard: buttons }
    );
    return;
  }

  if (action === "approve") {
    await answerCallbackQuery(env.BOT_TOKEN, callbackId, "သက်တမ်းရွေးပါ");
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      `✅ ခွင့်ပြုမည့်အုပ်စု\n\n👥 ${group.group_title || "အမည်မရှိ"}\n🆔 ${groupId}\n\nသက်တမ်းရွေးပါ။`,
      {
        inline_keyboard: [
          [
            { text: "၃၀ ရက်", callback_data: `grp:days:${groupId}:30` },
            { text: "၉၀ ရက်", callback_data: `grp:days:${groupId}:90` }
          ],
          [
            { text: "၃၆၅ ရက်", callback_data: `grp:days:${groupId}:365` },
            { text: "♾ အမြဲတမ်း", callback_data: `grp:days:${groupId}:forever` }
          ]
        ]
      }
    );
    return;
  }

  if (action === "days") {
    const duration = String(parts[3] || "");
    const license = buildLicense(duration);
    if (!license.ok) {
      await answerCallbackQuery(env.BOT_TOKEN, callbackId, license.message, true);
      return;
    }

    await approveGroup(env.DB, groupId, license.plan, license.expiresAt);
    await answerCallbackQuery(env.BOT_TOKEN, callbackId, "ခွင့်ပြုပြီးပါပြီ ✅");
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      `✅ Group အသုံးပြုခွင့်ပေးပြီးပါပြီ။\n\n👥 Group : ${group.group_title || "အမည်မရှိ"}\n🆔 Group ID : ${groupId}\n💎 Plan : ${license.plan}\n📅 Expire : ${license.expireText}`
    );

    try {
      await sendMessage(
        env.BOT_TOKEN,
        groupId,
        `✅ ဒီ Group ကို Bot အသုံးပြုခွင့်ပေးပြီးပါပြီ။\n\n💎 Plan : ${license.plan}\n📅 Expire : ${license.expireText}`
      );
    } catch (error) {
      console.error("Group approval notification failed:", error);
    }
    return;
  }

  if (action === "ban") {
    await banGroup(env.DB, groupId);
    await answerCallbackQuery(env.BOT_TOKEN, callbackId, "Group ပိတ်ပြီးပါပြီ 🚫");
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      `🚫 Group ကို ပိတ်ပြီးပါပြီ။\n\n👥 Group : ${group.group_title || "အမည်မရှိ"}\n🆔 Group ID : ${groupId}`
    );
    return;
  }

  if (action === "unban") {
    await unbanGroup(env.DB, groupId);
    await answerCallbackQuery(env.BOT_TOKEN, callbackId, "Group ပြန်ဖွင့်ပြီးပါပြီ 🔓");
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      `🔓 Group ကို ပြန်ဖွင့်ပြီးပါပြီ။\n\n👥 Group : ${group.group_title || "အမည်မရှိ"}\n🆔 Group ID : ${groupId}`
    );
    return;
  }

  if (action === "archive") {
    await archiveGroup(env.DB, groupId);
    await answerCallbackQuery(env.BOT_TOKEN, callbackId, "အုပ်စုကို သိမ်းထားပြီးပါပြီ 📦");
    await sendMessage(env.BOT_TOKEN, chatId, `📦 အုပ်စုကို သိမ်းထားပြီးပါပြီ။\n\n👥 ${group.group_title || "အမည်မရှိ"}`);
    return;
  }

  if (action === "restore") {
    await restoreGroup(env.DB, groupId);
    await answerCallbackQuery(env.BOT_TOKEN, callbackId, "ပြန်ယူပြီးပါပြီ ♻️");
    await sendMessage(env.BOT_TOKEN, chatId, `♻️ အုပ်စုကို အသုံးပြုနေသောစာရင်းထဲ ပြန်ဖွင့်ပြီးပါပြီ။\n\n👥 ${group.group_title || "အမည်မရှိ"}`);
    return;
  }

  if (action === "deleteask") {
    if (!isOwner(fromId, env)) {
      await answerCallbackQuery(env.BOT_TOKEN, callbackId, "Owner သာ ဖျက်နိုင်ပါတယ်။", true);
      return;
    }
    await answerCallbackQuery(env.BOT_TOKEN, callbackId);
    await sendMessage(env.BOT_TOKEN, chatId, `⚠️ အမြဲတမ်းဖျက်မှာ သေချာပါသလား။\n\n👥 ${group.group_title || "အမည်မရှိ"}`, {
      inline_keyboard: [[
        { text: "✅ ဖျက်မည်", callback_data: `grp:delete:${groupId}` },
        { text: "❌ မဖျက်တော့ပါ", callback_data: `grp:manage:${groupId}` }
      ]]
    });
    return;
  }

  if (action === "delete") {
    if (!isOwner(fromId, env)) {
      await answerCallbackQuery(env.BOT_TOKEN, callbackId, "Owner သာ ဖျက်နိုင်ပါတယ်။", true);
      return;
    }
    await deleteGroupPermanently(env.DB, groupId);
    await answerCallbackQuery(env.BOT_TOKEN, callbackId, "အမြဲတမ်းဖျက်ပြီးပါပြီ 🗑️");
    await sendMessage(env.BOT_TOKEN, chatId, `🗑️ အုပ်စုနှင့်သက်ဆိုင်သော Data များကို အမြဲတမ်းဖျက်ပြီးပါပြီ။\n\n👥 ${group.group_title || "အမည်မရှိ"}`);
    return;
  }

  await answerCallbackQuery(env.BOT_TOKEN, callbackId);
}

async function answerCallbackQuery(token, callbackQueryId, text = "", showAlert = false) {
  if (!callbackQueryId) return;

  const response = await fetch(
    `https://api.telegram.org/bot${token}/answerCallbackQuery`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        ...(text ? { text } : {}),
        show_alert: showAlert
      })
    }
  );

  if (!response.ok) {
    console.error("answerCallbackQuery failed:", await response.text());
  }
}

function mapAdminButtonToCommand(text) {
  const commands = {
    "👥 အသုံးပြုသူစာရင်း": "/users",
    "📋 အုပ်စုစာရင်း": "/groups",
    "📒 စာရင်းကြည့်ရန်": "/ledger",
    "🎯 မထိုးရသေးသောဂဏန်း": "/untouched",
    "🏆 အများဆုံးဂဏန်း": "/top",
    "♻️ စာရင်းရှင်းရန်": "/resetledger",
    "💰 အရောင်းကြည့်ရန်": "/sales"
  };

  return commands[text] || text;
}

async function sendPrivateNotice(env, userId, sourceChatId, text) {
  try {
    await sendMessage(env.BOT_TOKEN, userId, text);
    return true;
  } catch (error) {
    console.error("Private message failed:", error);
    if (Number(sourceChatId) !== Number(userId)) {
      await sendMessage(
        env.BOT_TOKEN,
        sourceChatId,
        "🔒 Private Chat မှာပို့မရပါ။ Bot ကို Private မှာ /start အရင်နှိပ်ပါ။"
      );
    }
    return false;
  }
}

async function sendPrivateReportMenu(env, groupId, userId) {
  const types = ["top", "below", "above", "untouched"];
  const allowed = [];
  for (const type of types) {
    if (isOwner(userId, env) || await hasReportPermission(env.DB, groupId, userId, type)) {
      allowed.push(type);
    }
  }

  if (!allowed.length) {
    await sendPrivateNotice(
      env,
      userId,
      groupId,
      "⛔ ဒီ Group အတွက် Report ကြည့်ခွင့် မရှိပါ။ Owner ထံ ခွင့်တောင်းပါ။"
    );
    return;
  }

  const labels = {
    top: "🏆 အများဆုံးဂဏန်း",
    below: "📉 ၅,၀၀၀ အောက်",
    above: "📈 ၁၀,၀၀၀ အထက်",
    untouched: "🎯 မထိုးရသေး"
  };
  const buttons = allowed.map((type) => [{
    text: labels[type],
    callback_data: `rpt:${type}:${groupId}`
  }]);

  try {
    await sendMessage(
      env.BOT_TOKEN,
      userId,
      `📊 Report Menu

ကြည့်လိုသော Report ကို ရွေးပါ။`,
      { inline_keyboard: buttons }
    );
  } catch (error) {
    await sendMessage(
      env.BOT_TOKEN,
      groupId,
      "🔒 Report Menu ကို Private မှာပို့မရပါ။ Bot ကို Private မှာ /start အရင်နှိပ်ပါ။"
    );
  }
}

async function handlePrivateGroupReport(
  env,
  { groupId, userId, isGroup, type, limit = 10, amount = null }
) {
  if (!isGroup || !Number.isSafeInteger(Number(groupId)) || Number(groupId) >= 0) {
    await sendPrivateNotice(
      env,
      userId,
      groupId,
      "❌ Report ကို သက်ဆိုင်ရာ Group ထဲကနေ အသုံးပြုပါ။"
    );
    return;
  }

  const allowed = isOwner(userId, env) ||
    await hasReportPermission(env.DB, groupId, userId, type);

  if (!allowed) {
    await sendPrivateNotice(
      env,
      userId,
      groupId,
      "⛔ ဒီ Report ကို ကြည့်ခွင့် မရှိပါ။ Owner ထံ ခွင့်တောင်းပါ။"
    );
    return;
  }

  let msg = "";

  if (type === "untouched") {
    const rows = await getUntouchedNumbers(env.DB, groupId);
    msg = rows.length
      ? `🎯 မထိုးရသေးသောဂဏန်းများ
━━━━━━━━━━━━━━━━━━
${rows.map((row) => row.number).join(" ")}`
      : "✅ 00 မှ 99 အထိ ဂဏန်းအားလုံး ထိုးပြီးပါပြီ။";
  } else if (type === "top") {
    const rows = await getTopNumbers(env.DB, groupId, limit);
    msg = rows.length
      ? `🏆 အများဆုံး ${limit} ဂဏန်း
━━━━━━━━━━━━━━━━━━
${rows.map((row, index) => `${index + 1}. ${row.number} = ${formatMoney(row.total_amount)}`).join("\n")}`
      : "📭 ထိုးထားသောဂဏန်း မရှိသေးပါ။";
  } else if (type === "below") {
    const value = amount === null ? 5000 : amount;
    const rows = await getNumbersBelowAmount(env.DB, groupId, value);
    msg = rows.length
      ? `📉 ${formatMoney(value)} အောက် ဂဏန်းများ
━━━━━━━━━━━━━━━━━━
${rows.map((row) => `${row.number} = ${formatMoney(row.total_amount)}`).join("\n")}`
      : `📭 ${formatMoney(value)} အောက် ဂဏန်းမရှိပါ။`;
  } else if (type === "above") {
    const value = amount === null ? 10000 : amount;
    const rows = await getNumbersAboveAmount(env.DB, groupId, value);
    msg = rows.length
      ? `📈 ${formatMoney(value)} အထက် ဂဏန်းများ
━━━━━━━━━━━━━━━━━━
${rows.map((row) => `${row.number} = ${formatMoney(row.total_amount)}`).join("\n")}`
      : `📭 ${formatMoney(value)} အထက် ဂဏန်းမရှိပါ။`;
  } else {
    await sendPrivateNotice(env, userId, groupId, "❌ Report အမျိုးအစား မမှန်ပါ။");
    return;
  }

  await sendLongMessage(
  env.BOT_TOKEN,
  groupId,
  msg
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

function getRequiredTestGroupId(env) {
  const configured = Number(env.TEST_GROUP_ID);
  if (Number.isSafeInteger(configured) && configured < 0) return configured;
  return -1004363051959;
}

async function isRequiredTestGroupMember(env, userId) {
  const groupId = getRequiredTestGroupId(env);
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${env.BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(groupId)}&user_id=${encodeURIComponent(userId)}`
    );
    const data = await response.json();
    if (!data.ok || !data.result) return false;

    const status = String(data.result.status || "");
    if (["creator", "administrator", "member"].includes(status)) return true;
    return status === "restricted" && data.result.is_member === true;
  } catch (error) {
    console.error("Required Test Group member check failed:", error);
    return false;
  }
}

async function getTestGroupInviteLink(env) {
  const configured = String(env.TEST_GROUP_INVITE_LINK || "").trim();
  if (configured) return configured;

  const groupId = getRequiredTestGroupId(env);
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${env.BOT_TOKEN}/exportChatInviteLink`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: groupId })
      }
    );
    const data = await response.json();
    if (data.ok && typeof data.result === "string") return data.result;
    console.error("exportChatInviteLink failed:", data);
  } catch (error) {
    console.error("Test Group invite link failed:", error);
  }
  return "https://t.me/NewZealand2D2026";
}

async function buildTestGroupJoinKeyboard(env) {
  const inviteLink = await getTestGroupInviteLink(env);
  return {
    inline_keyboard: [
      [{ text: "📢 Test Group ဝင်ရန်", url: inviteLink }],
      [{ text: "✅ Group ဝင်ပြီးပါပြီ", callback_data: "verify_test_group_join" }]
    ]
  };
}

async function sendTestGroupJoinPrompt(env, chatId) {
  await sendMessage(
    env.BOT_TOKEN,
    chatId,
    `🔒 Bot အသုံးပြုရန် Private Test Group ထဲ အရင်ဝင်ပေးပါ။

Group ဝင်ပြီးနောက် “✅ Group ဝင်ပြီးပါပြီ” ကို နှိပ်၍ စစ်ဆေးပါ။`,
    await buildTestGroupJoinKeyboard(env)
  );
}

async function isTelegramGroupAdmin(token, chatId, userId) {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${encodeURIComponent(userId)}`
    );
    const data = await response.json();
    if (!data.ok || !data.result) return false;
    return data.result.status === "creator" || data.result.status === "administrator";
  } catch (error) {
    console.error("Group admin check failed:", error);
    return false;
  }
}

async function sendMessage(
  token,
  chatId,
  text,
  replyMarkup = null,
  replyToMessageId = null
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
        text,
        ...(replyMarkup
          ? { reply_markup: replyMarkup }
          : {})
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
