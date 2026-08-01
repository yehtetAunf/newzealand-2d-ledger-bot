/**
 * New Zealand 2D Ledger Bot
 * src/rules.js
 *
 * Rule Engine
 *
 * ဒီဖိုင်မှာ
 * - Direct 2D / Reverse
 * - အခွေ / အခွေပူး
 * - Fixed Count Rules
 * - ပါတ် / ထိပ် / ပိတ်
 * - ကပ်ဂဏန်း
 * တို့ရဲ့ Validation နဲ့ ကွက်တွက်နည်းတွေ ပါမယ်။
 */

const REVERSE_SYMBOLS = Object.freeze([
  "R",
  "r",
  "®",
  "Ⓡ"
]);

/**
 * ဂဏန်းမဖြန့်ဘဲ သတ်မှတ်ကွက်ပဲ တွက်မယ့် Rule များ
 */
const FIXED_RULE_COUNTS = Object.freeze({
  အပူး: 10,
  အပူးစုံ: 10,
  ပူးစုံ: 10,

  ပါဝါ: 10,

  နက္ခတ်: 10,
  နခတ်: 10,

  ညီကို: 20,

  စုံစုံ: 25,
  မမ: 25,
  စုံမ: 25,
  မစုံ: 25
});

/**
 * Digit အရေအတွက်အလိုက် တွက်မယ့် Rule များ
 */
const DIGIT_RULE_COUNTS = Object.freeze({
  ပါတ်: 19,
  ပတ်: 19,

  ထိပ်: 10,

  ပိတ်: 10
});

/**
 * Reverse Symbol ဟုတ်/မဟုတ်
 */
export function isReverseSymbol(value) {
  return REVERSE_SYMBOLS.includes(
    String(value || "")
  );
}

/**
 * 00 မှ 99 အတွင်း 2D ဂဏန်းမှန်/မမှန်
 *
 * 01, 05, 09 တို့ရဲ့ ရှေ့က 0 မပျောက်စေရန်
 * String အဖြစ်ပဲ စစ်မယ်။
 */
export function isValid2D(number) {
  return /^\d{2}$/.test(
    String(number || "")
  );
}

/**
 * 2D ဂဏန်း Validation
 */
export function validate2D(number) {
  const value = String(number || "");

  if (!isValid2D(value)) {
    throw new Error(
      `2D ဂဏန်းသည် 00 မှ 99 အတွင်း နှစ်လုံးတိတိ ဖြစ်ရပါမယ်။ မမှန်သောဂဏန်း: ${value}`
    );
  }

  return value;
}

/**
 * 12 → 21
 * 01 → 10
 * 70 → 07
 * 11 → 11
 */
export function reverse2D(number) {
  const value = validate2D(number);

  return `${value[1]}${value[0]}`;
}

/**
 * Duplicate 2D ဂဏန်းများ ဖယ်ရှားမယ်။
 *
 * မူလအစဉ်အတိုင်းထားမယ်။
 */
export function unique2DNumbers(numbers = []) {
  const result = [];
  const seen = new Set();

  for (const number of numbers) {
    const value = validate2D(number);

    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
}

/**
 * Direct 2D တစ်လုံးကို ဖြန့်မယ်။
 *
 * reverse = false
 * 67 → ["67"]
 *
 * reverse = true
 * 67 → ["67", "76"]
 *
 * အပူးဆို
 * 66 → ["66"]
 */
export function expand2DNumber(
  number,
  reverse = false
) {
  const value = validate2D(number);

  if (!reverse) {
    return [value];
  }

  return unique2DNumbers([
    value,
    reverse2D(value)
  ]);
}

/**
 * Direct / Reverse ဂဏန်းအများကြီးကို ဖြန့်မယ်။
 *
 * entries ဥပမာ:
 * [
 *   { number: "67", reverse: true },
 *   { number: "89", reverse: false }
 * ]
 *
 * reverseAll = true ဖြစ်ရင်
 * entry အားလုံးကို Reverse ဖြန့်မယ်။
 */
export function expand2DEntries(
  entries = [],
  reverseAll = false
) {
  if (!Array.isArray(entries)) {
    throw new Error(
      "2D ဂဏန်းစာရင်းပုံစံ မမှန်ပါ။"
    );
  }

  const numbers = [];

  for (const entry of entries) {
    if (
      !entry ||
      typeof entry !== "object"
    ) {
      throw new Error(
        "2D ဂဏန်းအချက်အလက် မမှန်ပါ။"
      );
    }

    const number = validate2D(
      entry.number
    );

    const shouldReverse =
      reverseAll ||
      Boolean(entry.reverse);

    numbers.push(
      ...expand2DNumber(
        number,
        shouldReverse
      )
    );
  }

  return unique2DNumbers(numbers);
}

/**
 * Digit စာသားကို Array ပြောင်းမယ်။
 *
 * duplicateMode:
 * - "error"  → Digit ထပ်ရင် Error
 * - "unique" → Digit ထပ်ရင် တစ်ခါပဲယူ
 */
export function normalizeDigits(
  value,
  {
    minimum = 1,
    maximum = 10,
    duplicateMode = "unique",
    ruleName = "Rule"
  } = {}
) {
  const source = String(value || "")
    .replace(/[\s/.,၊_-]+/g, "");

  if (!source) {
    throw new Error(
      `${ruleName} အတွက် ဂဏန်းမတွေ့ပါ။`
    );
  }

  if (!/^\d+$/.test(source)) {
    throw new Error(
      `${ruleName} အတွက် 0 မှ 9 အတွင်း ဂဏန်းများသာ ထည့်ပါ။`
    );
  }

  const rawDigits = source.split("");
  const seen = new Set();
  const duplicateDigits = [];
  const uniqueDigits = [];

  for (const digit of rawDigits) {
    if (seen.has(digit)) {
      if (
        !duplicateDigits.includes(digit)
      ) {
        duplicateDigits.push(digit);
      }

      continue;
    }

    seen.add(digit);
    uniqueDigits.push(digit);
  }

  if (
    duplicateMode === "error" &&
    duplicateDigits.length > 0
  ) {
    throw new Error(
      `${ruleName} ဂဏန်းတွင် ထပ်နေသောဂဏန်း မပါရပါ။\n\nထပ်နေသောဂဏန်း: ${duplicateDigits.join(
        ", "
      )}`
    );
  }

  const digits =
    duplicateMode === "error"
      ? rawDigits
      : uniqueDigits;

  if (digits.length < minimum) {
    throw new Error(
      `${ruleName} အတွက် အနည်းဆုံး ဂဏန်း ${minimum} လုံးလိုပါတယ်။`
    );
  }

  if (digits.length > maximum) {
    throw new Error(
      `${ruleName} အတွက် အများဆုံး ဂဏန်း ${maximum} လုံးပဲ သုံးနိုင်ပါတယ်။`
    );
  }

  return digits;
}

/**
 * အခွေ / အခွေပူး Validation
 *
 * - 0 မှ 9 အတွင်း
 * - 3 လုံးမှ 8 လုံး
 * - Digit ထပ်ရင် Error
 */
export function validateKhwayDigits(
  value,
  ruleName = "အခွေ"
) {
  return normalizeDigits(value, {
    minimum: 3,
    maximum: 8,
    duplicateMode: "error",
    ruleName
  });
}

/**
 * အခွေကွက်တွက်ခြင်း
 *
 * အခွေ:
 * n × (n - 1)
 *
 * အခွေပူး:
 * n × n
 */
export function countKhway(
  value,
  includeDoubles = false
) {
  const ruleName = includeDoubles
    ? "အခွေပူး"
    : "အခွေ";

  const digits = validateKhwayDigits(
    value,
    ruleName
  );

  const digitCount = digits.length;

  const count = includeDoubles
    ? digitCount * digitCount
    : digitCount * (digitCount - 1);

  return {
    rule: ruleName,
    digits,
    digitCount,
    includeDoubles,
    count
  };
}

/**
 * Fixed Count Rule Name ကို စံပုံစံပြောင်းမယ်။
 */
export function normalizeFixedRuleName(
  ruleName
) {
  const value = String(ruleName || "")
    .replace(/\s+/g, "");

  if (
    value === "အပူးစုံ" ||
    value === "ပူးစုံ"
  ) {
    return "အပူး";
  }

  if (
    value === "နခတ်" ||
    value === "နက္ခတ်"
  ) {
    return "နက္ခတ်";
  }

  if (
    Object.prototype.hasOwnProperty.call(
      FIXED_RULE_COUNTS,
      value
    )
  ) {
    return value;
  }

  return null;
}

/**
 * Fixed Rule ကွက်ရယူခြင်း
 *
 * အပူး = 10
 * ပါဝါ = 10
 * နက္ခတ် = 10
 * ညီကို = 20
 * စုံစုံ / မမ / စုံမ / မစုံ = 25
 */
export function getFixedRuleCount(
  ruleName
) {
  const compactName = String(
    ruleName || ""
  ).replace(/\s+/g, "");

  const normalizedName =
    normalizeFixedRuleName(compactName);

  if (!normalizedName) {
    throw new Error(
      `မသိရှိသော Rule: ${ruleName}`
    );
  }

  const count =
    FIXED_RULE_COUNTS[compactName] ??
    FIXED_RULE_COUNTS[normalizedName];

  return {
    rule: normalizedName,
    count
  };
}

/**
 * ပါတ် / ထိပ် / ပိတ် Rule Name စံပြောင်းခြင်း
 */
export function normalizeDigitRuleName(
  ruleName
) {
  const value = String(ruleName || "")
    .replace(/\s+/g, "");

  if (
    value === "ပါတ်" ||
    value === "ပတ်"
  ) {
    return "ပါတ်";
  }

  if (value === "ထိပ်") {
    return "ထိပ်";
  }

  if (value === "ပိတ်") {
    return "ပိတ်";
  }

  return null;
}

/**
 * ပါတ် / ထိပ် / ပိတ် ကွက်တွက်ခြင်း
 *
 * Duplicate Digit ပါရင် တစ်ခါပဲယူမယ်။
 *
 * ပါတ် = Digit တစ်လုံးလျှင် 19 ကွက်
 * ထိပ် = Digit တစ်လုံးလျှင် 10 ကွက်
 * ပိတ် = Digit တစ်လုံးလျှင် 10 ကွက်
 */
export function countDigitRule(
  digitText,
  ruleName
) {
  const normalizedRule =
    normalizeDigitRuleName(ruleName);

  if (!normalizedRule) {
    throw new Error(
      `မသိရှိသော Digit Rule: ${ruleName}`
    );
  }

  const digits = normalizeDigits(
    digitText,
    {
      minimum: 1,
      maximum: 10,
      duplicateMode: "unique",
      ruleName: normalizedRule
    }
  );

  const countPerDigit =
    DIGIT_RULE_COUNTS[normalizedRule] ??
    DIGIT_RULE_COUNTS[ruleName];

  const count =
    digits.length * countPerDigit;

  return {
    rule: normalizedRule,
    digits,
    digitCount: digits.length,
    countPerDigit,
    count
  };
}

/**
 * ကပ်ဂဏန်း Side တစ်ဖက် Validation
 *
 * Duplicate ပါရင် တစ်ခါပဲယူမယ်။
 */
export function validateGapSide(
  value,
  sideName = "ကပ်ဂဏန်း"
) {
  return normalizeDigits(value, {
    minimum: 1,
    maximum: 9,
    duplicateMode: "unique",
    ruleName: sideName
  });
}

/**
 * ကပ်ဂဏန်းကွက်တွက်ခြင်း
 *
 * ဘယ်ဘက်အရေအတွက် × ညာဘက်အရေအတွက်
 *
 * Reverse Symbol ပါရင် × 2
 *
 * ဘယ်/ညာ ပြောင်းရေးလည်း
 * ကွက်အရေအတွက်တူတယ်။
 */
export function countGapRule(
  leftValue,
  rightValue,
  reverse = false
) {
  const leftDigits = validateGapSide(
    leftValue,
    "ကပ်ဂဏန်း ဘယ်ဘက်"
  );

  const rightDigits = validateGapSide(
    rightValue,
    "ကပ်ဂဏန်း ညာဘက်"
  );

  const baseCount =
    leftDigits.length *
    rightDigits.length;

  const count = reverse
    ? baseCount * 2
    : baseCount;

  return {
    rule: "ကပ်",
    leftDigits,
    rightDigits,
    leftCount: leftDigits.length,
    rightCount: rightDigits.length,
    reverse: Boolean(reverse),
    baseCount,
    count
  };
}

/**
 * Rule အမျိုးအစားသိရန်
 */
export function isFixedCountRule(
  ruleName
) {
  return Boolean(
    normalizeFixedRuleName(ruleName)
  );
}

export function isDigitCountRule(
  ruleName
) {
  return Boolean(
    normalizeDigitRuleName(ruleName)
  );
}

/**
 * Public Constants
 */
export const RULE_CONFIG = Object.freeze({
  reverseSymbols: REVERSE_SYMBOLS,
  fixedRuleCounts:
    FIXED_RULE_COUNTS,
  digitRuleCounts:
    DIGIT_RULE_COUNTS,

  khway: Object.freeze({
    minimumDigits: 3,
    maximumDigits: 8
  })
});
