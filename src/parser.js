/**
 * New Zealand 2D Ledger Bot
 * src/parser.js
 *
 * Professional 2D Message Parser
 */

import {
  isReverseSymbol,
  expand2DEntries,
  expandKhway,
  getFixedRuleCount,
  getSpecialRuleNumbers,
  countDigitRule,
  countGapRule,
  isFixedCountRule
} from "./rules.js";

import {
  createBetItem,
  calculateGrandTotal
} from "./calculator.js";

/**
 * User စာရင်းကို Parse လုပ်မယ်။
 *
 * Single Line:
 * 67R 500
 *
 * Multi Bet:
 * 67R 78R 90R 6000
 *
 * Multi Line:
 * 67R 500
 * အပူး 1000
 * 60147 အခွေ 500
 */
export function parseBetMessage(inputText) {
  const normalizedText =
    normalizeMessage(inputText);

  if (!normalizedText) {
    throw new Error("စာရင်းမတွေ့ပါ။");
  }

  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const allItems = [];

  for (
    let index = 0;
    index < lines.length;
    index++
  ) {
    const line = lines[index];

    try {
      const lineItems =
        parseBetLine(line);

      allItems.push(...lineItems);
    } catch (error) {
      throw new Error(
        `စာကြောင်း ${index + 1} မှားနေပါသည်။\n` +
        `${error.message}`
      );
    }
  }

  if (allItems.length === 0) {
    throw new Error(
      "တွက်ရန် စာရင်းမရှိပါ။"
    );
  }

  const summary =
    calculateGrandTotal(allItems);

  /*
   * Compatibility အတွက်
   * စာရင်းတစ်ခုလုံး၏ Unique Numbers
   */
  const allNumbers = [];
  const seenNumbers = new Set();

  for (const item of allItems) {
    for (
      const number of item.numbers || []
    ) {
      if (!seenNumbers.has(number)) {
        seenNumbers.add(number);
        allNumbers.push(number);
      }
    }
  }

  return {
    items: summary.items,
    itemCount: summary.itemCount,

    /*
     * index.js အဟောင်းနဲ့လည်း
     * အလုပ်လုပ်နိုင်ရန်
     */
    count: summary.totalCount,
    totalCount: summary.totalCount,

    totalAmount: summary.grandTotal,
    grandTotal: summary.grandTotal,

    amountPerNumber:
      allItems.length === 1
        ? allItems[0].amountPerNumber
        : null,

    numbers: allNumbers
  };
}

/**
 * စာကြောင်းတစ်ကြောင်း Parse လုပ်မယ်။
 *
 * နောက်ဆုံး Amount ကို
 * အရှေ့က Bet အားလုံးအတွက် သုံးမယ်။
 *
 * ဥပမာ:
 * 67R 78R 90R 6000
 */
function parseBetLine(line) {
  const {
    expression,
    amount
  } = extractAmount(line);

  const tokens =
    tokenizeExpression(expression);

  if (tokens.length === 0) {
    throw new Error(
      "ဂဏန်း သို့မဟုတ် Rule မတွေ့ပါ။"
    );
  }

  const items = [];
  let index = 0;

  while (index < tokens.length) {
    const result = parseTokenAt(
      tokens,
      index,
      amount
    );

    if (!result) {
      throw new Error(
        `နားမလည်သောစာရင်း: ` +
        `${tokens[index]}`
      );
    }

    items.push(...result.items);
    index = result.nextIndex;
  }

  return items;
}

/**
 * Token တစ်ခုစီကို
 * Rule အလိုက် Parse လုပ်မယ်။
 */
function parseTokenAt(
  tokens,
  index,
  amount
) {
  const token = tokens[index];

  const nextToken =
    tokens[index + 1] || "";

  /*
   * =====================================
   * Fixed Rules
   * =====================================
   *
   * အပူး
   * စုံပူး
   * မပူး
   * ပါဝါ
   * နက္ခတ်
   * ညီကို
   * ဆယ်ပြည့်
   * စုံစုံ
   * မမ
   * စုံမ
   * မစုံ
   */
  if (isFixedCountRule(token)) {
    const fixed =
      getFixedRuleCount(token);

    const numbers =
      getSpecialRuleNumbers(
        fixed.rule
      );

    return {
      items: [
        createBetItem({
          label: token,
          rule: fixed.rule,
          numbers,
          count: numbers.length,
          amount
        })
      ],
      nextIndex: index + 1
    };
  }

  /*
   * =====================================
   * အခွေ / အခွေပူး
   * =====================================
   *
   * 60147အခွေ
   * 60147 အခွေ
   * 60147ခွေ
   * 60147 ခွေပူး
   */
  const attachedKhway =
    parseAttachedKhwayToken(
      token,
      amount
    );

  if (attachedKhway) {
    return {
      items: [attachedKhway],
      nextIndex: index + 1
    };
  }

  if (
    isDigitText(token) &&
    isKhwayKeyword(nextToken)
  ) {
    const item = createKhwayItem(
      token,
      nextToken,
      amount,
      `${token} ${nextToken}`
    );

    return {
      items: [item],
      nextIndex: index + 2
    };
  }

  /*
   * =====================================
   * ပါတ် / ပတ် / ထိပ် / ပိတ်
   * =====================================
   *
   * 1ထိပ်
   * 1/7ထိပ်
   * 1/7 ထိပ်
   */
  const attachedDigitRule =
    parseAttachedDigitRuleToken(
      token,
      amount
    );

  if (attachedDigitRule) {
    return {
      items: [attachedDigitRule],
      nextIndex: index + 1
    };
  }

  if (
    isDigitText(token) &&
    isDigitRuleKeyword(nextToken)
  ) {
    const item = createDigitRuleItem(
      token,
      nextToken,
      amount,
      `${token} ${nextToken}`
    );

    return {
      items: [item],
      nextIndex: index + 2
    };
  }

  /*
   * =====================================
   * ကပ်ဂဏန်း
   * =====================================
   *
   * 67/12345890
   * 67/12345890R
   * 67/12345890 R
   */
  const gapResult = parseGapToken(
    token,
    nextToken,
    amount
  );

  if (gapResult) {
    return {
      items: [gapResult.item],

      nextIndex:
        index +
        (
          gapResult.usedNextToken
            ? 2
            : 1
        )
    };
  }

  /*
   * =====================================
   * Direct / Reverse
   * =====================================
   *
   * 67
   * 67R
   * 67-78-90
   * 67-78-90 R
   * 67R-78-90R
   */
  const directResult =
    parseDirectToken(
      token,
      nextToken,
      amount
    );

  if (directResult) {
    return {
      items: directResult.items,

      nextIndex:
        index +
        (
          directResult.usedNextToken
            ? 2
            : 1
        )
    };
  }

  return null;
}

/**
 * Amount ကို နောက်ဆုံးကနေ
 * ခွဲထုတ်မယ်။
 *
 * 67R 500
 * 67R500
 * 12/70/36/27/18®500
 */
function extractAmount(line) {
  const value =
    String(line || "").trim();

  /*
   * Space ပါတဲ့ ပုံစံကို
   * အရင်ယူမယ်။
   */
  let match = value.match(
    /^(.+?)\s+([\d,]+)$/
  );

  /*
   * Rule/Reverse နဲ့ Amount
   * ကပ်ရေးထားတဲ့ ပုံစံ
   *
   * 18®500
   * အပူး500
   * 60147အခွေ500
   */
  if (!match) {
    match = value.match(
      /^(.+?(?:[Rr®Ⓡ]|[^\d\s]))([\d,]+)$/
    );
  }

  if (!match) {
    throw new Error(
      "နောက်ဆုံးတွင် ထိုးငွေထည့်ပါ။ " +
      "ဥပမာ - 67R 500"
    );
  }

  const expression =
    match[1].trim();

  const amount =
    match[2].trim();

  if (!expression) {
    throw new Error(
      "ဂဏန်း သို့မဟုတ် Rule မတွေ့ပါ။"
    );
  }

  return {
    expression,
    amount
  };
}

/**
 * Expression ကို Token ခွဲမယ်။
 *
 * Rule + Amount တစ်ကြောင်းစနစ်မှာ
 * Space နဲ့ Bet တစ်ခုချင်း ခွဲမယ်။
 */
function tokenizeExpression(expression) {
  return String(expression || "")
    .replace(/\u00a0/g, " ")
    .replace(/[၊]/g, ",")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * =========================================
 * Direct / Reverse Token
 * =========================================
 */
function parseDirectToken(
  token,
  nextToken,
  amount
) {
  let source =
    String(token || "").trim();

  let reverseAll = false;
  let usedNextToken = false;

  /*
   * 67-78-90 R
   *
   * R သီးသန့်နောက်မှာပါရင်
   * Token ထဲက ဂဏန်းအားလုံး Reverse
   */
  if (isReverseSymbol(nextToken)) {
    reverseAll = true;
    usedNextToken = true;
  }

  /*
   * Separator Group အဆုံးမှာ
   * R ကပ်နေရင် Global Reverse
   *
   * 67-78-90R
   * 67.78.90®
   */
  const attachedGlobalReverse =
    source.match(/([Rr®Ⓡ])$/);

  if (
    attachedGlobalReverse &&
    containsMultiple2DNumbers(source)
  ) {
    reverseAll = true;
    source = source.slice(0, -1);
  }

  /*
   * Separator တွေကို
   * Space အဖြစ်ပြောင်းမယ်။
   */
  const parts = source
    .replace(/[\/.,၊_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  const entries = [];

  for (const part of parts) {
    const partEntries =
      parseDirectSegment(part);

    if (!partEntries) {
      return null;
    }

    entries.push(...partEntries);
  }

  if (entries.length === 0) {
    return null;
  }

  const numbers = expand2DEntries(
    entries,
    reverseAll
  );

  /*
   * Single Token ကို
   * Report Line တစ်ကြောင်းစီပြမယ်။
   */
  if (
    entries.length === 1 &&
    !containsSeparator(token)
  ) {
    const item = createBetItem({
      label: token,
      rule: "direct",
      numbers,
      count: numbers.length,
      amount
    });

    return {
      items: [item],
      usedNextToken
    };
  }

  const label =
    reverseAll &&
    !String(token).match(/[Rr®Ⓡ]$/)
      ? `${token} ${nextToken}`
      : token;

  const item = createBetItem({
    label,

    rule: reverseAll
      ? "reverse_all"
      : "direct_group",

    numbers,
    count: numbers.length,
    amount
  });

  return {
    items: [item],
    usedNextToken
  };
}

/**
 * Direct Segment Parse
 *
 * 67
 * 67R
 * 67R78R90
 * 677890
 */
function parseDirectSegment(segment) {
  const source =
    String(segment || "");

  if (!source) {
    return null;
  }

  const entries = [];

  const pattern =
    /(\d{2})([Rr®Ⓡ]?)/g;

  let consumed = "";
  let match;

  while (
    (match = pattern.exec(source)) !== null
  ) {
    entries.push({
      number: match[1],
      reverse: Boolean(match[2])
    });

    consumed += match[0];
  }

  if (
    entries.length === 0 ||
    consumed !== source
  ) {
    return null;
  }

  return entries;
}

/**
 * =========================================
 * Attached အခွေ Token
 * =========================================
 */
function parseAttachedKhwayToken(
  token,
  amount
) {
  const match = String(token).match(
    /^(\d{3,8})(အ?ခွေ)(ပူး)?$/
  );

  if (!match) {
    return null;
  }

  const keyword =
    `${match[2]}${match[3] || ""}`;

  return createKhwayItem(
    match[1],
    keyword,
    amount,
    token
  );
}

/**
 * အခွေ / အခွေပူး Item
 */
function createKhwayItem(
  digits,
  keyword,
  amount,
  label
) {
  const includeDoubles =
    /ပူး$/.test(keyword);

  const result = expandKhway(
    digits,
    includeDoubles
  );

  return createBetItem({
    label,

    rule: includeDoubles
      ? "khway_double"
      : "khway",

    numbers: result.numbers,
    count: result.numbers.length,
    amount
  });
}

/**
 * =========================================
 * Attached ပါတ် / ထိပ် / ပိတ်
 * =========================================
 */
function parseAttachedDigitRuleToken(
  token,
  amount
) {
  const match = String(token).match(
    /^([0-9/.,၊_-]+)(ပါတ်|ပတ်|ထိပ်|ပိတ်)$/
  );

  if (!match) {
    return null;
  }

  return createDigitRuleItem(
    match[1],
    match[2],
    amount,
    token
  );
}

/**
 * ပါတ် / ထိပ် / ပိတ် Item
 */
function createDigitRuleItem(
  digits,
  ruleName,
  amount,
  label
) {
  const result = countDigitRule(
    digits,
    ruleName
  );

  const numbers =
    buildDigitRuleNumbers(
      result.digits,
      result.rule
    );

  if (
    numbers.length !== result.count
  ) {
    throw new Error(
      `${result.rule} Rule ကွက်အရေအတွက် ` +
      `မကိုက်ညီပါ။`
    );
  }

  return createBetItem({
    label,
    rule: result.rule,
    numbers,
    count: numbers.length,
    amount
  });
}

/**
 * ပါတ် / ထိပ် / ပိတ် Actual Numbers
 *
 * သတိပြုရန်:
 * ပါတ် Digit အများကြီးဖြစ်ရင်
 * တူညီတဲ့ဂဏန်းကို Rule နှစ်ခုက
 * ထပ်မိနိုင်ပါတယ်။
 *
 * ဥပမာ 1/7 ပါတ်မှာ
 * 17 နဲ့ 71 ကို နှစ်ကြိမ်တွက်ရနိုင်တာကြောင့်
 * Duplicate ကို မဖယ်ပါ။
 */
function buildDigitRuleNumbers(
  digits,
  ruleName
) {
  const allDigits = [
    "0", "1", "2", "3", "4",
    "5", "6", "7", "8", "9"
  ];

  const numbers = [];

  for (const digit of digits) {
    if (ruleName === "ထိပ်") {
      for (const second of allDigits) {
        numbers.push(
          `${digit}${second}`
        );
      }

      continue;
    }

    if (ruleName === "ပိတ်") {
      for (const first of allDigits) {
        numbers.push(
          `${first}${digit}`
        );
      }

      continue;
    }

    if (ruleName === "ပါတ်") {
      /*
       * ထိပ် 10 ကွက်
       */
      for (const second of allDigits) {
        numbers.push(
          `${digit}${second}`
        );
      }

      /*
       * ပိတ် 9 ကွက်
       *
       * အပူးဂဏန်းကို အပေါ်မှာ
       * ထည့်ထားပြီးဖြစ်တာကြောင့် ကျော်မယ်။
       */
      for (const first of allDigits) {
        if (first === digit) {
          continue;
        }

        numbers.push(
          `${first}${digit}`
        );
      }

      continue;
    }

    throw new Error(
      `မသိရှိသော Digit Rule: ` +
      `${ruleName}`
    );
  }

  return numbers;
}

/**
 * =========================================
 * ကပ်ဂဏန်း Parse
 * =========================================
 */
function parseGapToken(
  token,
  nextToken,
  amount
) {
  let source =
    String(token || "").trim();

  let reverse = false;
  let usedNextToken = false;

  if (isReverseSymbol(nextToken)) {
    reverse = true;
    usedNextToken = true;
  }

  const attachedReverse =
    source.match(/([Rr®Ⓡ])$/);

  if (attachedReverse) {
    reverse = true;
    source = source.slice(0, -1);
  }

  const match = source.match(
    /^(\d{1,9})\/(\d{1,9})$/
  );

  if (!match) {
    return null;
  }

  /*
   * နှစ်ဖက်လုံး 2D ပုံစံဖြစ်ရင်
   * Direct Group အဖြစ်ယူမယ်။
   *
   * 12/34 → Direct
   * 67/12345890 → ကပ်
   */
  if (
    match[1].length === 2 &&
    match[2].length === 2
  ) {
    return null;
  }

  const result = countGapRule(
    match[1],
    match[2],
    reverse
  );

  const numbers = buildGapNumbers(
    result.leftDigits,
    result.rightDigits,
    reverse
  );

  if (
    numbers.length !== result.count
  ) {
    throw new Error(
      "ကပ်ဂဏန်း ကွက်အရေအတွက် " +
      "မကိုက်ညီပါ။"
    );
  }

  const label =
    usedNextToken
      ? `${token} ${nextToken}`
      : token;

  return {
    item: createBetItem({
      label,

      rule: reverse
        ? "gap_reverse"
        : "gap",

      numbers,
      count: numbers.length,
      amount
    }),

    usedNextToken
  };
}

/**
 * ကပ်ဂဏန်း Actual Numbers
 *
 * 67/123
 *
 * 61 62 63
 * 71 72 73
 *
 * R ပါလျှင်
 *
 * 16 26 36
 * 17 27 37
 *
 * ကိုပါ ထည့်မယ်။
 */
function buildGapNumbers(
  leftDigits,
  rightDigits,
  reverse = false
) {
  const numbers = [];

  for (const left of leftDigits) {
    for (const right of rightDigits) {
      numbers.push(
        `${left}${right}`
      );

      if (reverse) {
        numbers.push(
          `${right}${left}`
        );
      }
    }
  }

  return numbers;
}

/**
 * =========================================
 * Helper Functions
 * =========================================
 */

function isDigitText(value) {
  return /^[0-9/.,၊_-]+$/.test(
    String(value || "")
  );
}

function isKhwayKeyword(value) {
  return /^(အ?ခွေ)(ပူး)?$/.test(
    String(value || "")
  );
}

function isDigitRuleKeyword(value) {
  return /^(ပါတ်|ပတ်|ထိပ်|ပိတ်)$/.test(
    String(value || "")
  );
}

function containsSeparator(value) {
  return /[\/.,၊_-]/.test(
    String(value || "")
  );
}

function containsMultiple2DNumbers(
  value
) {
  const cleanValue =
    String(value || "")
      .replace(/[Rr®Ⓡ]$/, "");

  const numberMatches =
    cleanValue.match(/\d{2}/g);

  return Boolean(
    numberMatches &&
    numberMatches.length > 1
  );
}

/**
 * Message Normalize
 */
function normalizeMessage(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();
    }
