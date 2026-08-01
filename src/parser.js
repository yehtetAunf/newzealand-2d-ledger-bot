import {
  uniqueNumbers,
  expandReverse,
  expandDouble,
  expandAllDoubles,
  expandEvenOdd,
  expandPower,
  expandKhway,
  expandGap,
  expandFront,
  expandBack
} from "./rules.js";

import { calculateBet } from "./calculator.js";

/**
 * New Zealand 2D Ledger Bot
 * Professional Message Parser
 *
 * လက်ခံသော Rule များ
 *
 * ရိုးရိုး
 * 12 500
 * 12/34/56 500
 * 12.34.56 500
 * 12,34,56 500
 * 12-34-56 500
 * 12 34 56 500
 *
 * Reverse
 * 12R 500
 * 12 R 500
 * 12® 500
 * 12 Ⓡ 500
 * 12/34/56 R 500
 * 12R/34/56R 500
 * 12R34R56 500
 *
 * ခွေ
 * 123ခွေ 500
 * 123အခွေ 500
 * 123 ခွေ 500
 *
 * ခွေပူး
 * 123ခွေပူး 500
 * 123အခွေပူး 500
 *
 * အပူး
 * 123အပူး 500
 * 123 ပူး 500
 *
 * အပူးစုံ
 * အပူးစုံ 500
 *
 * ပါဝါ
 * 123ပါဝါ 500
 *
 * ထိပ် / နောက်
 * 12ထိပ် 500
 * 12နောက် 500
 *
 * ကပ်
 * 12 3ကပ် 500
 * 12 5ကပ် 500
 *
 * စုံ / မ
 * စုံ 500
 * မ 500
 * စုံထိပ် 500
 * စုံနောက် 500
 * မထိပ် 500
 * မနောက် 500
 */

export function parseBetMessage(inputText) {
  const normalizedText = normalizeText(inputText);

  if (!normalizedText) {
    throw new Error("စာရင်းမတွေ့ပါ။");
  }

  const { expression, amount } =
    extractExpressionAndAmount(normalizedText);

  /*
   * ခွေ / အခွေ / ခွေပူး / အခွေပူး
   */
  const khwayResult = parseKhwayRule(expression);

  if (khwayResult) {
    return calculateBet(khwayResult, amount);
  }

  /*
   * အပူးစုံ
   */
  if (/^(အပူးစုံ|ပူးစုံ)$/.test(expression)) {
    return calculateBet(
      expandAllDoubles(),
      amount
    );
  }

  /*
   * ဂဏန်းရွေးပြီး အပူး
   *
   * 123အပူး
   * 123 ပူး
   * 1/2/3 အပူး
   */
  const doubleResult = parseDoubleRule(expression);

  if (doubleResult) {
    return calculateBet(doubleResult, amount);
  }

  /*
   * ပါဝါ
   */
  const powerResult = parsePowerRule(expression);

  if (powerResult) {
    return calculateBet(powerResult, amount);
  }

  /*
   * 3 ကပ် / 5 ကပ်
   */
  const gapResult = parseGapRule(expression);

  if (gapResult) {
    return calculateBet(gapResult, amount);
  }

  /*
   * ထိပ်
   */
  const frontResult = parseFrontRule(expression);

  if (frontResult) {
    return calculateBet(frontResult, amount);
  }

  /*
   * နောက်
   */
  const backResult = parseBackRule(expression);

  if (backResult) {
    return calculateBet(backResult, amount);
  }

  /*
   * စုံ / မ
   */
  const evenOddResult = parseEvenOddRule(expression);

  if (evenOddResult) {
    return calculateBet(evenOddResult, amount);
  }

  /*
   * ရိုးရိုး / Reverse / Mixed
   */
  const numberResult = parseNumberExpression(expression);

  if (numberResult) {
    return calculateBet(numberResult, amount);
  }

  throw createFormatError();
}

/**
 * စာကို သန့်ရှင်းအောင် Normalize လုပ်မယ်။
 */
function normalizeText(text) {
  return String(text || "")
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/[၊]/g, ",")
    .replace(/\s+/g, " ");
}

/**
 * နောက်ဆုံးက ငွေပမာဏကို ခွဲထုတ်မယ်။
 *
 * 12R 500
 * 12 34 56 1,000
 */
function extractExpressionAndAmount(text) {
  const match = text.match(
    /^(.+?)\s+([\d,]+)$/
  );

  if (!match) {
    throw new Error(
      "နောက်ဆုံးတွင် ထိုးငွေထည့်ပါ။ ဥပမာ - 12 500"
    );
  }

  const expression = match[1].trim();
  const amount = match[2];

  if (!expression) {
    throw new Error("ဂဏန်း သို့မဟုတ် Rule မတွေ့ပါ။");
  }

  if (!/^\d[\d,]*$/.test(amount)) {
    throw new Error("ထိုးငွေပမာဏ မမှန်ပါ။");
  }

  return {
    expression,
    amount
  };
}

/**
 * ခွေ Rule
 *
 * ပူး ပါမှသာ အပူးထည့်မယ်။
 */
function parseKhwayRule(expression) {
  const match = expression.match(
    /^([0-9\s/.,၊_-]{2,})\s*(အ?ခွေ)(ပူး)?\s*([Rr®Ⓡ])?$/
  );

  if (!match) {
    return null;
  }

  const digits = parseDigits(match[1], {
    minimum: 2,
    maximum: 9,
    ruleName: "ခွေ"
  });

  const includeDoubles = Boolean(match[3]);

  return expandKhway(
    digits,
    includeDoubles
  );
}

/**
 * အပူး Rule
 *
 * 123အပူး → 11 22 33
 */
function parseDoubleRule(expression) {
  const match = expression.match(
    /^([0-9\s/.,၊_-]+)\s*(အပူး|ပူး)$/
  );

  if (!match) {
    return null;
  }

  const digits = parseDigits(match[1], {
    minimum: 1,
    maximum: 10,
    ruleName: "အပူး"
  });

  return expandDouble(digits);
}

/**
 * ပါဝါ Rule
 *
 * 123ပါဝါ
 */
function parsePowerRule(expression) {
  const match = expression.match(
    /^([0-9\s/.,၊_-]+)\s*ပါဝါ$/
  );

  if (!match) {
    return null;
  }

  const digits = parseDigits(match[1], {
    minimum: 1,
    maximum: 10,
    ruleName: "ပါဝါ"
  });

  return expandPower(digits);
}

/**
 * ကပ် Rule
 *
 * 12 3ကပ်
 * 12 5ကပ်
 */
function parseGapRule(expression) {
  const match = expression.match(
    /^([0-9\s/.,၊_-]+?)\s*([35])\s*ကပ်$/
  );

  if (!match) {
    return null;
  }

  const digits = parseDigits(match[1], {
    minimum: 1,
    maximum: 10,
    ruleName: "ကပ်"
  });

  return expandGap(
    digits,
    Number(match[2])
  );
}

/**
 * ထိပ် Rule
 *
 * 12ထိပ် → 10–19 နှင့် 20–29
 */
function parseFrontRule(expression) {
  const match = expression.match(
    /^([0-9\s/.,၊_-]+)\s*ထိပ်$/
  );

  if (!match) {
    return null;
  }

  const digits = parseDigits(match[1], {
    minimum: 1,
    maximum: 10,
    ruleName: "ထိပ်"
  });

  return expandFront(digits);
}

/**
 * နောက် Rule
 *
 * 12နောက် → 01, 11 ... 91 နှင့် 02, 12 ... 92
 */
function parseBackRule(expression) {
  const match = expression.match(
    /^([0-9\s/.,၊_-]+)\s*နောက်$/
  );

  if (!match) {
    return null;
  }

  const digits = parseDigits(match[1], {
    minimum: 1,
    maximum: 10,
    ruleName: "နောက်"
  });

  return expandBack(digits);
}

/**
 * စုံ / မ Rule
 */
function parseEvenOddRule(expression) {
  const compact = expression.replace(/\s+/g, "");

  const rules = {
    "စုံ": ["even", "both"],
    "မ": ["odd", "both"],

    "စုံထိပ်": ["even", "front"],
    "ထိပ်စုံ": ["even", "front"],

    "စုံနောက်": ["even", "back"],
    "နောက်စုံ": ["even", "back"],

    "မထိပ်": ["odd", "front"],
    "ထိပ်မ": ["odd", "front"],

    "မနောက်": ["odd", "back"],
    "နောက်မ": ["odd", "back"]
  };

  const selectedRule = rules[compact];

  if (!selectedRule) {
    return null;
  }

  const [type, position] = selectedRule;

  return expandEvenOdd(type, position);
}

/**
 * ရိုးရိုးဂဏန်း၊ Reverse၊ Mixed Rule
 *
 * 12
 * 12R
 * 12/34/56
 * 12 34 56 R
 * 12R34R56
 * 12/34R/56
 */
function parseNumberExpression(expression) {
  let source = String(expression).trim();

  /*
   * နောက်ဆုံးမှာ R သီးသန့်ပါရင်
   * ဂဏန်းအားလုံးကို Reverse လုပ်မယ်။
   *
   * 12/34/56 R
   */
  let reverseAll = false;

  const globalReverseMatch = source.match(
    /\s*([Rr®Ⓡ])$/
  );

  if (globalReverseMatch) {
    reverseAll = true;

    source = source
      .slice(
        0,
        source.length -
          globalReverseMatch[0].length
      )
      .trim();
  }

  /*
   * Separator အမျိုးမျိုးကို Space ပြောင်းမယ်။
   */
  source = source
    .replace(/[\/.,၊_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!source) {
    return null;
  }

  const segments = source.split(" ");
  const result = [];

  for (const segment of segments) {
    const parsedTokens =
      parseConcatenatedNumberSegment(segment);

    if (!parsedTokens) {
      return null;
    }

    for (const token of parsedTokens) {
      const shouldReverse =
        reverseAll || token.reverse;

      if (shouldReverse) {
        result.push(
          ...expandReverse([token.number])
        );
      } else {
        result.push(token.number);
      }
    }
  }

  if (result.length === 0) {
    return null;
  }

  return uniqueNumbers(result);
}

/**
 * Space မပါတဲ့ Mixed ဂဏန်းကို ခွဲမယ်။
 *
 * 12
 * 12R
 * 12R34R56
 * 123456
 */
function parseConcatenatedNumberSegment(segment) {
  const source = String(segment);

  if (!source) {
    return null;
  }

  const tokens = [];
  const pattern = /(\d{2})([Rr®Ⓡ]?)/g;

  let consumedText = "";
  let match;

  while ((match = pattern.exec(source)) !== null) {
    tokens.push({
      number: match[1],
      reverse: Boolean(match[2])
    });

    consumedText += match[0];
  }

  /*
   * မဖတ်နိုင်တဲ့စာကျန်နေရင် Invalid
   */
  if (
    tokens.length === 0 ||
    consumedText !== source
  ) {
    return null;
  }

  return tokens;
}

/**
 * Rule တွေအတွက် Digit List ပြောင်းမယ်။
 */
function parseDigits(
  value,
  {
    minimum = 1,
    maximum = 10,
    ruleName = "Rule"
  } = {}
) {
  const cleaned = String(value)
    .replace(/[\s/.,၊_-]+/g, "");

  if (!/^\d+$/.test(cleaned)) {
    throw new Error(
      `${ruleName} Rule အတွက် ဂဏန်းမှန်ကန်စွာ ထည့်ပါ။`
    );
  }

  const digits = [
    ...new Set(cleaned.split(""))
  ];

  if (digits.length < minimum) {
    throw new Error(
      `${ruleName} Rule အတွက် အနည်းဆုံး ဂဏန်း ${minimum} လုံးလိုပါတယ်။`
    );
  }

  if (digits.length > maximum) {
    throw new Error(
      `${ruleName} Rule အတွက် အများဆုံး ဂဏန်း ${maximum} လုံးပဲ သုံးနိုင်ပါတယ်။`
    );
  }

  return digits;
}

/**
 * Error Message
 */
function createFormatError() {
  return new Error(
    [
      "စာရင်းပုံစံမမှန်ပါ။",
      "",
      "ရိုးရိုး",
      "12 500",
      "12/34/56 500",
      "12 34 56 500",
      "",
      "Reverse",
      "12R 500",
      "12 R 500",
      "12/34/56 R 500",
      "12R/34/56R 500",
      "",
      "ခွေ",
      "123ခွေ 500",
      "123အခွေ 500",
      "",
      "ခွေပူး",
      "123ခွေပူး 500",
      "123အခွေပူး 500",
      "",
      "အခြား Rule",
      "123အပူး 500",
      "အပူးစုံ 500",
      "123ပါဝါ 500",
      "12ထိပ် 500",
      "12နောက် 500",
      "12 3ကပ် 500",
      "12 5ကပ် 500",
      "စုံ 500",
      "မ 500"
    ].join("\n")
  );
}
