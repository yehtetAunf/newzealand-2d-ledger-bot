export function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const expiry = new Date(expiresAt);
  return Number.isNaN(expiry.getTime()) || expiry < new Date();
}

export function hasAccess(record) {
  if (!record) {
    return { ok: false, message: "⛔ အသုံးပြုခွင့်စာရင်း မတွေ့ပါ။" };
  }
  if (record.status === "banned") {
    return { ok: false, message: "⛔ Admin မှ အသုံးပြုခွင့်ကို ပိတ်ထားပါသည်။" };
  }
  if (record.status !== "approved") {
    return { ok: false, message: "⛔ Admin မှ အသုံးပြုခွင့် မပေးသေးပါ။" };
  }
  if (isExpired(record.expires_at)) {
    return { ok: false, message: "❌ License သက်တမ်းကုန်သွားပါပြီ။\n\nAdmin ကို ဆက်သွယ်၍ သက်တမ်းတိုးပေးပါ။" };
  }
  return { ok: true };
}
