/**
 * New Zealand 2D Ledger Bot
 * src/rules.js
 *
 * Professional 2D Rule Engine
 *
 * PART 1
 * - Rule Config
 * - Reverse Rule
 * - 2D Validation
 * - Duplicate Validation
 * - Digit Normalization
 */

/*
 * Reverse အဖြစ် လက်ခံမယ့် Symbol များ
 */
const REVERSE_SYMBOLS = Object.freeze([
  "R",
  "r",
  "®",
  "Ⓡ"
]);

/*
 * ဂဏန်းမဖြန့်ဘဲ
 * သတ်မှတ်ကွက်အတိုင်း တွက်မယ့် Rule များ
 */
const FIXED_RULE_COUNTS = Object.freeze({
  အပူး: 10,
  အပူးစုံ: 10,
  ပူးစုံ: 10,

  စုံပူး: 5,
  မပူး: 5,

  ပါဝါ: 10,

  နက္ခတ်: 10,
  နခတ်: 10,

  ညီကို: 20,

  ဆယ်ပြည့်: 20,
  ဆယ်ပြည့်: 20,

  စုံစုံ: 25,
  မမ: 25,
  စုံမ: 25,
  မစုံ: 25
});

/*
 * Digit တစ်လုံးစီအလိုက်
 * ကွက်တွက်မယ့် Rule များ
 */
const DIGIT_RULE_COUNTS = Object.freeze({
  ပါတ်: 19,
  ပတ်: 19,

  ထိပ်: 10,
  ပိတ်: 10
});

/**
 * Reverse Symbol ဟုတ်/မဟုတ် စစ်မယ်။
 */
export function isReverseSymbol(value) {
  return REVERSE_SYMBOLS.includes(
    String(value ?? "").trim()
  );
}

/**
 * 00 မှ 99 အတွင်း 2D ဂဏန်းဟုတ်/မဟုတ်။
 *
 * 01, 05, 09 တို့ရဲ့ ရှေ့က 0
 * မပျောက်စေရန် String အဖြစ်ပဲ စစ်မယ်။
 */
export function isValid2D(number) {
  return /^\d{2}$/.test(
    String(number ?? "")
  );
}

/**
 * 2D ဂဏန်းကို Validation လုပ်မယ်။
 */
export function validate2D(number) {
  const value = String(number ?? "");

  if (!isValid2D(value)) {
    throw new Error(
      `2D ဂဏန်းသည် 00 မှ 99 အတွင်း ` +
      `နှစ်လုံးတိတိဖြစ်ရပါမယ်။ ` +
      `မမှန်သောဂဏန်း: ${value}`
    );
  }

  return value;
}

/**
 * 2D ဂဏန်းကို ပြောင်းပြန်လှန်မယ်။
 *
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
 * 2D ဂဏန်းစာရင်းထဲက Duplicate ဖယ်မယ်။
 *
 * User ရေးထားတဲ့ မူလအစဉ်အတိုင်း ထားမယ်။
 */
export function unique2DNumbers(
  numbers = []
) {
  if (!Array.isArray(numbers)) {
    throw new Error(
      "2D ဂဏန်းစာရင်းပုံစံ မမှန်ပါ။"
    );
  }

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
 * အပူးဂဏန်းဖြစ်ရင်
 * 66R → ["66"]
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
 * Direct / Reverse 2D အများကြီးကို ဖြန့်မယ်။
 *
 * entries ဥပမာ:
 *
 * [
 *   {
 *     number: "67",
 *     reverse: true
 *   },
 *   {
 *     number: "89",
 *     reverse: false
 *   }
 * ]
 *
 * reverseAll = true ဖြစ်ရင်
 * ဂဏန်းအားလုံးကို Reverse ဖြန့်မယ်။
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

  if (entries.length === 0) {
    throw new Error(
      "တွက်ရန် 2D ဂဏန်းမရှိပါ။"
    );
  }

  const expandedNumbers = [];

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
      Boolean(reverseAll) ||
      Boolean(entry.reverse);

    expandedNumbers.push(
      ...expand2DNumber(
        number,
        shouldReverse
      )
    );
  }

  return unique2DNumbers(
    expandedNumbers
  );
}

/**
 * Digit တွေကို Separator ဖယ်ပြီး
 * Array အဖြစ်ပြောင်းမယ်။
 *
 * လက်ခံမယ့် Separator:
 * - Space
 * - /
 * - .
 * - ,
 * - ၊
 * - -
 * - _
 *
 * duplicateMode:
 *
 * "error"
 * Digit ထပ်နေရင် Error ပြမယ်။
 *
 * "unique"
 * Digit ထပ်နေရင် တစ်ကြိမ်ပဲယူမယ်။
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
  const source = String(value ?? "")
    .replace(/[\s/.,၊_-]+/g, "");

  if (!source) {
    throw new Error(
      `${ruleName} အတွက် ဂဏန်းမတွေ့ပါ။`
    );
  }

  if (!/^\d+$/.test(source)) {
    throw new Error(
      `${ruleName} အတွက် 0 မှ 9 အတွင်း ` +
      `ဂဏန်းများသာ ထည့်ပါ။`
    );
  }

  if (
    duplicateMode !== "error" &&
    duplicateMode !== "unique"
  ) {
    throw new Error(
      "Duplicate စစ်ဆေးမှုပုံစံ မမှန်ပါ။"
    );
  }

  const rawDigits = source.split("");
  const uniqueDigits = [];
  const duplicateDigits = [];
  const seen = new Set();

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
      `${ruleName} ဂဏန်းတွင် ` +
      `ထပ်နေသောဂဏန်း မပါရပါ။\n\n` +
      `ထပ်နေသောဂဏန်း: ` +
      `${duplicateDigits.join(", ")}`
    );
  }

  const digits =
    duplicateMode === "error"
      ? rawDigits
      : uniqueDigits;

  if (digits.length < minimum) {
    throw new Error(
      `${ruleName} အတွက် အနည်းဆုံး ` +
      `ဂဏန်း ${minimum} လုံးလိုပါတယ်။`
    );
  }

  if (digits.length > maximum) {
    throw new Error(
      `${ruleName} အတွက် အများဆုံး ` +
      `ဂဏန်း ${maximum} လုံးပဲ ` +
      `သုံးနိုင်ပါတယ်။`
    );
  }

  return digits;
}

/**
 * Digit စာရင်းနှစ်ခုကြား
 * တူညီတဲ့ Digit ရှိ/မရှိ ရှာမယ်။
 */
export function findSharedDigits(
  firstDigits = [],
  secondDigits = []
) {
  if (
    !Array.isArray(firstDigits) ||
    !Array.isArray(secondDigits)
  ) {
    throw new Error(
      "Digit စာရင်းပုံစံ မမှန်ပါ။"
    );
  }

  const secondSet = new Set(
    secondDigits.map(String)
  );

  return [
    ...new Set(
      firstDigits
        .map(String)
        .filter(
          (digit) =>
            secondSet.has(digit)
        )
    )
  ];
}

/**
 * Digit စာသားဟုတ်/မဟုတ် စစ်မယ်။
 */
export function isDigitExpression(
  value
) {
  return /^[0-9\s/.,၊_-]+$/.test(
    String(value ?? "")
  );
}
/**
 * =========================================
 * အခွေ / အခွေပူး
 * =========================================
 */

/**
 * အခွေဂဏန်း Validation
 *
 * စည်းကမ်း:
 * - 0 မှ 9 အတွင်း Digit များသာ
 * - အနည်းဆုံး 3 လုံး
 * - အများဆုံး 8 လုံး
 * - Digit ထပ်နေရင် Error
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
 * အခွေ ကွက်တွက်ခြင်း
 *
 * အခွေ:
 * n × (n - 1)
 *
 * 3 လုံး = 6 ကွက်
 * 4 လုံး = 12 ကွက်
 * 5 လုံး = 20 ကွက်
 * 6 လုံး = 30 ကွက်
 * 7 လုံး = 42 ကွက်
 * 8 လုံး = 56 ကွက်
 *
 * အခွေပူး:
 * n × n
 *
 * 3 လုံး = 9 ကွက်
 * 4 လုံး = 16 ကွက်
 * 5 လုံး = 25 ကွက်
 * 6 လုံး = 36 ကွက်
 * 7 လုံး = 49 ကွက်
 * 8 လုံး = 64 ကွက်
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
    includeDoubles: Boolean(
      includeDoubles
    ),
    count
  };
}

/**
 * အခွေဂဏန်းများကို တကယ်ဖြန့်ပေးမယ်။
 *
 * 123 အခွေ
 * 12 13 21 23 31 32
 *
 * 123 အခွေပူး
 * 11 12 13
 * 21 22 23
 * 31 32 33
 */
export function expandKhway(
  value,
  includeDoubles = false
) {
  const result = countKhway(
    value,
    includeDoubles
  );

  const numbers = [];

  for (const first of result.digits) {
    for (const second of result.digits) {
      if (
        !includeDoubles &&
        first === second
      ) {
        continue;
      }

      numbers.push(
        `${first}${second}`
      );
    }
  }

  return {
    ...result,
    numbers: unique2DNumbers(numbers)
  };
}

/**
 * အခွေပူးကို သီးခြား Function အဖြစ်
 * အသုံးပြုလိုလျှင် ခေါ်နိုင်မယ်။
 */
export function expandKhwayPu(value) {
  return expandKhway(value, true);
}

/**
 * =========================================
 * Fixed Count Rules
 * =========================================
 */

/**
 * Fixed Rule အမည်ကို
 * Standard Name ပြောင်းမယ်။
 */
export function normalizeFixedRuleName(
  ruleName
) {
  const value = String(
    ruleName ?? ""
  )
    .trim()
    .replace(/\s+/g, "");

  if (
    value === "အပူး" ||
    value === "အပူးစုံ" ||
    value === "ပူးစုံ"
  ) {
    return "အပူး";
  }
if (value === "စုံပူး") {
  return "စုံပူး";
}

if (value === "မပူး") {
  return "မပူး";
}
  if (value === "ပါဝါ") {
    return "ပါဝါ";
  }

  if (
    value === "နက္ခတ်" ||
    value === "နခတ်"
  ) {
    return "နက္ခတ်";
  }
if (
  value === "ဆယ်ပြည့်" ||
  value === "ဆယ်ပြည့်"
) {
  return "ဆယ်ပြည့်";
}
  if (value === "ညီကို") {
    return "ညီကို";
  }

  if (value === "စုံစုံ") {
    return "စုံစုံ";
  }

  if (value === "မမ") {
    return "မမ";
  }

  if (value === "စုံမ") {
    return "စုံမ";
  }

  if (value === "မစုံ") {
    return "မစုံ";
  }

  return null;
}

/**
 * Fixed Count Rule ဟုတ်/မဟုတ်
 */
export function isFixedCountRule(
  ruleName
) {
  return Boolean(
    normalizeFixedRuleName(ruleName)
  );
}

/**
 * Fixed Rule ရဲ့ ကွက်အရေအတွက်
 *
 * အပူး = 10
 * ပါဝါ = 10
 * နက္ခတ် = 10
 * ညီကို = 20
 * စုံစုံ = 25
 * မမ = 25
 * စုံမ = 25
 * မစုံ = 25
 */
export function getFixedRuleCount(
  ruleName
) {
  const normalizedRule =
    normalizeFixedRuleName(ruleName);

  if (!normalizedRule) {
    throw new Error(
      `မသိရှိသော Rule: ${ruleName}`
    );
  }

  const count =
    FIXED_RULE_COUNTS[
      normalizedRule
    ];

  if (
    !Number.isSafeInteger(count) ||
    count <= 0
  ) {
    throw new Error(
      `${normalizedRule} Rule ရဲ့ ` +
      `ကွက်အရေအတွက် မမှန်ပါ။`
    );
  }

  return {
    rule: normalizedRule,
    count
  };
}

/**
 * Fixed Rule ကို Count Result အဖြစ်
 * ပြန်ပေးမယ်။
 */
export function expandFixedRule(
  ruleName
) {
  return getFixedRuleCount(ruleName);
}

/**
 * =========================================
 * ပါတ် / ထိပ် / ပိတ်
 * =========================================
 */

/**
 * Digit Rule အမည်ကို
 * Standard Name ပြောင်းမယ်။
 */
export function normalizeDigitRuleName(
  ruleName
) {
  const value = String(
    ruleName ?? ""
  )
    .trim()
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
 * ပါတ် / ထိပ် / ပိတ် Rule
 * ဟုတ်/မဟုတ် စစ်မယ်။
 */
export function isDigitCountRule(
  ruleName
) {
  return Boolean(
    normalizeDigitRuleName(ruleName)
  );
}

/**
 * ပါတ် / ထိပ် / ပိတ် ကွက်တွက်ခြင်း
 *
 * Duplicate Digit ပါရင်
 * Error မပြဘဲ တစ်ကြိမ်ပဲတွက်မယ်။
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
    DIGIT_RULE_COUNTS[
      normalizedRule
    ];

  if (
    !Number.isSafeInteger(
      countPerDigit
    ) ||
    countPerDigit <= 0
  ) {
    throw new Error(
      `${normalizedRule} Rule ရဲ့ ` +
      `ကွက်အရေအတွက် မမှန်ပါ။`
    );
  }

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
 * ပါတ် Rule
 */
export function expandPat(digitText) {
  return countDigitRule(
    digitText,
    "ပါတ်"
  );
}

/**
 * ထိပ် Rule
 */
export function expandFront(digitText) {
  return countDigitRule(
    digitText,
    "ထိပ်"
  );
}

/**
 * ပိတ် Rule
 */
export function expandBack(digitText) {
  return countDigitRule(
    digitText,
    "ပိတ်"
  );
      }
/**
 * =========================================
 * ကပ်ဂဏန်း Rule
 * =========================================
 */

/**
 * ကပ်ဂဏန်း တစ်ဖက်စီကို စစ်မယ်။
 *
 * စည်းကမ်း:
 * - 0 မှ 9 အတွင်း Digit များသာ
 * - တစ်ဖက်လျှင် အနည်းဆုံး 1 လုံး
 * - တစ်ဖက်လျှင် အများဆုံး 9 လုံး
 * - တစ်ဖက်အတွင်း Digit ထပ်နေရင် Error
 */
export function validateGapSide(
  value,
  sideName = "ကပ်ဂဏန်း"
) {
  return normalizeDigits(value, {
    minimum: 1,
    maximum: 9,
    duplicateMode: "error",
    ruleName: sideName
  });
}

/**
 * ကပ်ဂဏန်း နှစ်ဖက်လုံးကို စစ်မယ်။
 *
 * ဥပမာ:
 * 0/123456789
 * 67/12345890
 * 123/4567890
 * 0123/457896
 * 45679/01238
 *
 * ဘယ်ဘက်နဲ့ ညာဘက်အတွင်း
 * တူညီတဲ့ Digit ပါနေရင် Error ပြမယ်။
 */
export function validateGap(
  leftValue,
  rightValue
) {
  const leftDigits = validateGapSide(
    leftValue,
    "ကပ်ဂဏန်း ဘယ်ဘက်"
  );

  const rightDigits = validateGapSide(
    rightValue,
    "ကပ်ဂဏန်း ညာဘက်"
  );

  const sharedDigits = findSharedDigits(
    leftDigits,
    rightDigits
  );

  if (sharedDigits.length > 0) {
    throw new Error(
      "ကပ်ဂဏန်း ဘယ်ဘက်နဲ့ ညာဘက်မှာ " +
      "တူညီသောဂဏန်း မပါရပါ။\n\n" +
      `တူညီသောဂဏန်း: ${sharedDigits.join(", ")}`
    );
  }

  return {
    leftDigits,
    rightDigits,
    leftCount: leftDigits.length,
    rightCount: rightDigits.length
  };
}

/**
 * ကပ်ဂဏန်း ကွက်တွက်ခြင်း
 *
 * R မပါရင်:
 * ဘယ်ဘက် Digit အရေအတွက်
 * × ညာဘက် Digit အရေအတွက်
 *
 * R ပါရင်:
 * မူလကွက် × 2
 *
 * ဥပမာ:
 *
 * 0/123456789
 * 1 × 9 = 9 ကွက်
 *
 * 67/12345890
 * 2 × 8 = 16 ကွက်
 *
 * 123/4567890
 * 3 × 7 = 21 ကွက်
 *
 * 0123/457896
 * 4 × 6 = 24 ကွက်
 *
 * 45679/01238
 * 5 × 5 = 25 ကွက်
 *
 * 67/12345890R
 * 16 × 2 = 32 ကွက်
 */
export function countGapRule(
  leftValue,
  rightValue,
  reverse = false
) {
  const validated = validateGap(
    leftValue,
    rightValue
  );

  const baseCount =
    validated.leftCount *
    validated.rightCount;

  const count = reverse
    ? baseCount * 2
    : baseCount;

  return {
    rule: "ကပ်",
    leftDigits:
      validated.leftDigits,
    rightDigits:
      validated.rightDigits,
    leftCount:
      validated.leftCount,
    rightCount:
      validated.rightCount,
    reverse: Boolean(reverse),
    baseCount,
    count
  };
}

/**
 * ကပ်ဂဏန်းကို အသုံးပြုရန်
 * အခြား Function အမည်တစ်ခု။
 */
export function expandGap(
  leftValue,
  rightValue,
  reverse = false
) {
  return countGapRule(
    leftValue,
    rightValue,
    reverse
  );
}

/**
 * ကပ်ဂဏန်း Input စာသားကို
 * "/" နှစ်ဖက်ခွဲပေးမယ်။
 *
 * ဥပမာ:
 * 67/12345890
 */
export function splitGapExpression(
  value
) {
  const source = String(value ?? "")
    .trim()
    .replace(/\s+/g, "");

  const parts = source.split("/");

  if (
    parts.length !== 2 ||
    !parts[0] ||
    !parts[1]
  ) {
    throw new Error(
      "ကပ်ဂဏန်းပုံစံ မမှန်ပါ။\n\n" +
      "ဥပမာ - 67/12345890"
    );
  }

  if (
    !/^\d+$/.test(parts[0]) ||
    !/^\d+$/.test(parts[1])
  ) {
    throw new Error(
      "ကပ်ဂဏန်းတွင် 0 မှ 9 အတွင်း " +
      "ဂဏန်းများသာ ထည့်ပါ။"
    );
  }

  return {
    leftValue: parts[0],
    rightValue: parts[1]
  };
}

/**
 * ကပ်ဂဏန်းစာသားကနေ
 * တိုက်ရိုက် ကွက်တွက်မယ်။
 */
export function countGapExpression(
  value,
  reverse = false
) {
  const {
    leftValue,
    rightValue
  } = splitGapExpression(value);

  return countGapRule(
    leftValue,
    rightValue,
    reverse
  );
  }
/**
 * =========================================
 * Compatibility Functions
 * =========================================
 *
 * Project ထဲက အခြားဖိုင်အဟောင်းတွေက
 * Function Name အဟောင်းတွေကို ခေါ်ထားရင်လည်း
 * Deploy မပျက်အောင် ထားပေးထားသည်။
 */

/**
 * uniqueNumbers()
 *
 * unique2DNumbers() ရဲ့ အမည်ဟောင်း
 */
export function uniqueNumbers(
  numbers = []
) {
  return unique2DNumbers(numbers);
}

/**
 * expandReverse()
 *
 * ["12", "34"] →
 * ["12", "21", "34", "43"]
 */
export function expandReverse(
  numbers = []
) {
  if (!Array.isArray(numbers)) {
    throw new Error(
      "Reverse ဂဏန်းစာရင်းပုံစံ မမှန်ပါ။"
    );
  }

  if (numbers.length === 0) {
    throw new Error(
      "Reverse လုပ်ရန် ဂဏန်းမရှိပါ။"
    );
  }

  const entries = numbers.map(
    (number) => ({
      number: validate2D(number),
      reverse: true
    })
  );

  return expand2DEntries(
    entries,
    false
  );
}

/**
 * ရွေးချယ်ထားသော Digit များ၏
 * အပူးဂဏန်းကို ဖြန့်မယ်။
 *
 * ["1", "2", "3"] →
 * ["11", "22", "33"]
 *
 * Digit မထည့်လျှင်
 * 00, 11, 22 ... 99
 */
export function expandDouble(
  digits = []
) {
  const source =
    Array.isArray(digits) &&
    digits.length > 0
      ? digits
      : [
          "0",
          "1",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9"
        ];

  const normalizedDigits =
    normalizeDigits(
      source.join(""),
      {
        minimum: 1,
        maximum: 10,
        duplicateMode: "unique",
        ruleName: "အပူး"
      }
    );

  return unique2DNumbers(
    normalizedDigits.map(
      (digit) =>
        `${digit}${digit}`
    )
  );
}

/**
 * အပူးစုံ
 *
 * 00, 11, 22 ... 99
 */
export function expandAllDoubles() {
  return expandDouble([]);
}

/**
 * စုံ / မ Compatibility Function
 *
 * type:
 * - even
 * - odd
 *
 * position:
 * - front
 * - back
 * - both
 */
export function expandEvenOdd(
  type,
  position = "both"
) {
  const evenDigits = [
    "0",
    "2",
    "4",
    "6",
    "8"
  ];

  const oddDigits = [
    "1",
    "3",
    "5",
    "7",
    "9"
  ];

  let allowedDigits;

  if (type === "even") {
    allowedDigits = evenDigits;
  } else if (type === "odd") {
    allowedDigits = oddDigits;
  } else {
    throw new Error(
      "စုံ/မ Rule အမျိုးအစား မမှန်ပါ။"
    );
  }

  if (
    position !== "front" &&
    position !== "back" &&
    position !== "both"
  ) {
    throw new Error(
      "စုံ/မ Rule နေရာသတ်မှတ်ချက် မမှန်ပါ။"
    );
  }

  const allDigits = [
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9"
  ];

  const numbers = [];

  for (const first of allDigits) {
    for (const second of allDigits) {
      if (
        position === "front" &&
        allowedDigits.includes(first)
      ) {
        numbers.push(
          `${first}${second}`
        );
      }

      if (
        position === "back" &&
        allowedDigits.includes(second)
      ) {
        numbers.push(
          `${first}${second}`
        );
      }

      if (
        position === "both" &&
        allowedDigits.includes(first) &&
        allowedDigits.includes(second)
      ) {
        numbers.push(
          `${first}${second}`
        );
      }
    }
  }

  return unique2DNumbers(numbers);
}

/**
 * ပါဝါ Compatibility Function
 *
 * လက်ရှိ Professional Bot Rule မှာ
 * ပါဝါကို ဂဏန်းမဖြန့်ဘဲ
 * 10 ကွက်အဖြစ်သာ တွက်မယ်။
 */
export function expandPower() {
  return getFixedRuleCount(
    "ပါဝါ"
  );
}

/**
 * =========================================
 * Rule Configuration
 * =========================================
 */

export const RULE_CONFIG =
  Object.freeze({
    reverseSymbols:
      REVERSE_SYMBOLS,

    fixedRuleCounts:
      FIXED_RULE_COUNTS,

    digitRuleCounts:
      DIGIT_RULE_COUNTS,

    khway: Object.freeze({
      minimumDigits: 3,
      maximumDigits: 8,
      duplicateMode: "error"
    }),

    gap: Object.freeze({
      minimumDigitsPerSide: 1,
      maximumDigitsPerSide: 9,
      duplicateMode: "error",
      sharedDigitsAllowed: false,
      reverseMultiplier: 2
    })
  });
/*
 * =========================================
 * Special Rule Actual 2D Numbers
 * =========================================
 */

export const SPECIAL_RULE_NUMBERS = Object.freeze({
  "အပူး": Object.freeze([
    "00", "11", "22", "33", "44",
    "55", "66", "77", "88", "99"
  ]),

  "စုံပူး": Object.freeze([
    "00", "22", "44", "66", "88"
  ]),

  "မပူး": Object.freeze([
    "11", "33", "55", "77", "99"
  ]),

  "ပါဝါ": Object.freeze([
    "05", "50", "16", "61", "27",
    "72", "38", "83", "49", "94"
  ]),

  "နက္ခတ်": Object.freeze([
    "07", "70", "18", "81", "24",
    "42", "35", "53", "69", "96"
  ]),

  "ညီကို": Object.freeze([
    "01", "12", "23", "34", "45",
    "56", "67", "78", "89", "90",
    "10", "21", "32", "43", "54",
    "65", "76", "87", "98", "09"
  ]),

  /*
   * ဆယ်ပြည့် — ® ပါဝင်ပြီး 20 ကွက်
   */
  "ဆယ်ပြည့်": Object.freeze([
    "00", "19", "91", "28", "82",
    "37", "73", "46", "64", "55",
    "10", "18", "27", "36", "45",
    "54", "63", "72", "81", "90"
  ]),

  "မမ": Object.freeze([
    "11", "13", "15", "17", "19",
    "31", "33", "35", "37", "39",
    "51", "53", "55", "57", "59",
    "71", "73", "75", "77", "79",
    "91", "93", "95", "97", "99"
  ]),

  "စုံစုံ": Object.freeze([
    "00", "02", "04", "06", "08",
    "20", "22", "24", "26", "28",
    "40", "42", "44", "46", "48",
    "60", "62", "64", "66", "68",
    "80", "82", "84", "86", "88"
  ]),

  "စုံမ": Object.freeze([
    "01", "03", "05", "07", "09",
    "21", "23", "25", "27", "29",
    "41", "43", "45", "47", "49",
    "61", "63", "65", "67", "69",
    "81", "83", "85", "87", "89"
  ]),

  "မစုံ": Object.freeze([
    "10", "12", "14", "16", "18",
    "30", "32", "34", "36", "38",
    "50", "52", "54", "56", "58",
    "70", "72", "74", "76", "78",
    "90", "92", "94", "96", "98"
  ])
});

/*
 * Special Rule အမည်ကို Standard Name ပြောင်းမယ်။
 */
export function normalizeSpecialRuleName(ruleName) {
  const value = String(ruleName ?? "")
    .trim()
    .replace(/\s+/g, "");

  if (
    value === "အပူး" ||
    value === "အပူးစုံ" ||
    value === "ပူးစုံ"
  ) {
    return "အပူး";
  }

  if (value === "စုံပူး") {
    return "စုံပူး";
  }

  if (value === "မပူး") {
    return "မပူး";
  }

  if (value === "ပါဝါ") {
    return "ပါဝါ";
  }

  if (
    value === "နက္ခတ်" ||
    value === "နခတ်"
  ) {
    return "နက္ခတ်";
  }

  if (value === "ညီကို") {
    return "ညီကို";
  }

  if (
    value === "ဆယ်ပြည့်" ||
    value === "ဆယ်ပြည့်"
  ) {
    return "ဆယ်ပြည့်";
  }

  if (value === "မမ") {
    return "မမ";
  }

  if (value === "စုံစုံ") {
    return "စုံစုံ";
  }

  if (value === "စုံမ") {
    return "စုံမ";
  }

  if (value === "မစုံ") {
    return "မစုံ";
  }

  return null;
}

/*
 * Special Rule ရဲ့ Actual 2D Numbers ပြန်ပေးမယ်။
 */
export function getSpecialRuleNumbers(ruleName) {
  const normalizedRule =
    normalizeSpecialRuleName(ruleName);

  if (!normalizedRule) {
    throw new Error(
      `မသိရှိသော Special Rule: ${ruleName}`
    );
  }

  const numbers =
    SPECIAL_RULE_NUMBERS[normalizedRule];

  if (!numbers) {
    throw new Error(
      `${normalizedRule} Rule ရဲ့ ဂဏန်းများ မတွေ့ပါ။`
    );
  }

  return [...numbers];
}

/*
 * Special Rule Result အပြည့်အစုံ ပြန်ပေးမယ်။
 */
export function expandSpecialRule(ruleName) {
  const normalizedRule =
    normalizeSpecialRuleName(ruleName);

  const numbers =
    getSpecialRuleNumbers(normalizedRule);

  return {
    rule: normalizedRule,
    numbers,
    count: numbers.length
  };
}
/**
 * =========================================
 * END OF FILE
 * =========================================
 */
