export function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export function hasAccess(user) {
  if (!user) {
    return {
      ok: false,
      message: "⛔ သင့် Account ကို Register မလုပ်ရသေးပါ။"
    };
  }

  if (user.status !== "approved") {
    return {
      ok: false,
      message: "⛔ Admin မှ အသုံးပြုခွင့် မပေးသေးပါ။"
    };
  }

  if (isExpired(user.expires_at)) {
    return {
      ok: false,
      message: "❌ သင့် License သက်တမ်းကုန်သွားပါပြီ။\n\nAdmin ကို ဆက်သွယ်၍ သက်တမ်းတိုးပေးပါ။"
    };
  }

  return {
    ok: true
  };
}
