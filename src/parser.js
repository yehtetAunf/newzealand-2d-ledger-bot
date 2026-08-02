/**
 * New Zealand 2D Ledger Bot
 * src/parser.js
 *
 * Smart 2D Message Parser
 */

import {
  isReverseSymbol,
  expand2DEntries,
  expandKhway,
  getFixedRuleCount,
  getSpecialRuleNumbers,
  countDigitRule,
  countGapRule,
  isFixedCountRule,
  isBreakKeyword,
  getBreakRuleNumbers
} from "./rules.js";

import {
  createBetItem,
  calculateGrandTotal
} from "./calculator.js";

const REVERSE_PATTERN = "Rr®Ⓡ";

export function parseBetMessage(inputText) {
  const normalizedText = normalizeMessage(inputText);

  if (!normalizedText) {
    throw new Error("စာရင်းမတွေ့ပါ။");
  }

  const sourceLines = normalizedText
    .split("\n")
    .map((line, originalIndex) => ({
      text: line.trim(),
      originalIndex
    }))
    .filter((entry) => entry.text)
    .filter((entry) => !isIgnorableLabel(entry.text));

  if (sourceLines.length === 0) {
    throw new Error("တွက်ရန် စာရင်းမရှိပါ။");
  }

  const carryAmount = detectCarryAmount(sourceLines);
  const allItems = [];

  for (let index = 0; index < sourceLines.length; index++) {
    const entry = sourceLines[index];

    try {
      const ownAmount = tryExtractAmount(entry.text);
      const isBeforeLast = index < sourceLines.length - 1;

      const lineItems = ownAmount
        ? parseBetExpression(
            ownAmount.expression,
            ownAmount.amount,
            entry.text
          )
        : carryAmount && isBeforeLast
          ? parseBetExpression(
              entry.text,
              carryAmount,
              entry.text
            )
          : parseBetLine(entry.text);

      allItems.push(...lineItems);
    } catch (error) {
      throw new Error(
        `စာကြောင်း ${entry.originalIndex + 1} မှားနေပါသည်။\n` +
        `${error.message}`
      );
    }
  }

  if (allItems.length === 0) {
    throw new Error("တွက်ရန် စာရင်းမရှိပါ။");
  }

  const summary = calculateGrandTotal(allItems);
  const allNumbers = [];
  const seenNumbers = new Set();

  for (const item of allItems) {
    for (const number of item.numbers || []) {
      if (!seenNumbers.has(number)) {
        seenNumbers.add(number);
        allNumbers.push(number);
      }
    }
  }

  return {
    items: summary.items,
    itemCount: summary.itemCount,
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

function parseBetLine(line) {
  const extracted = extractAmount(line);

  return parseBetExpression(
    extracted.expression,
    extracted.amount,
    line
  );
}

function parseBetExpression(
  rawExpression,
  amount,
  originalLabel
) {
  const expression = cleanExpression(rawExpression);

  if (!expression) {
    throw new Error("ဂဏန်း သို့မဟုတ် Rule မတွေ့ပါ။");
  }

  const fixedItem = parseFixedRule(
    expression,
    amount,
    originalLabel
  );
  if (fixedItem) return [fixedItem];

  const breakItem = parseBreakRule(
    expression,
    amount,
    originalLabel
  );
  if (breakItem) return [breakItem];

  const khwayItem = parseKhwayRule(
    expression,
    amount,
    originalLabel
  );
  if (khwayItem) return [khwayItem];

  const digitRuleItem = parseDigitRule(
    expression,
    amount,
    originalLabel
  );
  if (digitRuleItem) return [digitRuleItem];

  const gapItem = parseGapRule(
    expression,
    amount,
    originalLabel
  );
  if (gapItem) return [gapItem];

  const directItem = parseDirectExpression(
    expression,
    amount,
    originalLabel
  );
  if (directItem) return [directItem];

  if (/^\d{3,8}$/.test(expression)) {
    throw new Error(
      "အကွက်အမျိုးအစား (အခွေ/အခွေပူး) မပါပါ။\n" +
      `ဥပမာ - ${expression} အခွေ 500`
    );
  }

  throw new Error(`နားမလည်သောစာရင်း: ${expression}`);
}

function parseFixedRule(expression, amount, label) {
  const compact = expression
    .replace(/\s+/g, "")
    .toLowerCase();

  if (!isFixedCountRule(compact)) {
    return null;
  }

  const fixed = getFixedRuleCount(compact);
  const numbers = getSpecialRuleNumbers(fixed.rule);

  return createBetItem({
    label: normalizeDisplayLabel(label, amount),
    rule: fixed.rule,
    numbers,
    count: numbers.length,
    amount
  });
}

function parseBreakRule(expression, amount, label) {
  const match = expression.match(
    /^([0-9])\s*(ဘရိတ်|b|br|break|brake)\s*(?:ပါ)?$/i
  );

  if (!match || !isBreakKeyword(match[2])) {
    return null;
  }

  const numbers = getBreakRuleNumbers(match[1]);

  return createBetItem({
    label: `${match[1]} ဘရိတ်`,
    rule: "ဘရိတ်",
    numbers,
    count: numbers.length,
    amount
  });
}

function parseKhwayRule(expression, amount, label) {
  const match = expression.match(
    /^(\d{3,8})\s*(အ?ခွေပူး|အ?ခွေ|ခွေပူး|ခွေ|ခပ)\s*(?:ပါ)?$/i
  );

  if (!match) return null;

  const keyword = match[2];
  const includeDoubles =
    /ပူး$/u.test(keyword) || keyword === "ခပ";

  const result = expandKhway(
    match[1],
    includeDoubles
  );

  return createBetItem({
    label: `${match[1]} ${
      includeDoubles ? "အခွေပူး" : "အခွေ"
    }`,
    rule: includeDoubles
      ? "khway_double"
      : "khway",
    numbers: result.numbers,
    count: result.numbers.length,
    amount
  });
}

function parseDigitRule(expression, amount, label) {
  const match = expression.match(
    /^([0-9/.,၊_-]+)\s*(ပါတ်|ပတ်|ထိပ်|ပိတ်)$/u
  );

  if (!match) return null;

  const result = countDigitRule(
    match[1],
    match[2]
  );

  const numbers = buildDigitRuleNumbers(
    result.digits,
    result.rule
  );

  if (numbers.length !== result.count) {
    throw new Error(
      `${result.rule} Rule ကွက်အရေအတွက် မကိုက်ညီပါ။`
    );
  }

  return createBetItem({
    label: normalizeDisplayLabel(label, amount),
    rule: result.rule,
    numbers,
    count: numbers.length,
    amount
  });
}

function parseGapRule(expression, amount, label) {
  let source = expression.trim();
  let reverse = false;

  const reverseMatch = source.match(
    new RegExp(`([${REVERSE_PATTERN}])$`)
  );

  if (reverseMatch) {
    reverse = true;
    source = source.slice(0, -1).trim();
  }

  const match = source.match(
    /^(\d{1,9})\s*([./_-])\s*(\d{1,9})\s*(ကပ်)?$/u
  );

  if (!match) return null;

  const left = match[1];
  const separator = match[2];
  const right = match[3];
  const explicitGap = Boolean(match[4]);

  if (
    !explicitGap &&
    separator !== "/"
  ) {
    return null;
  }

  if (
    !explicitGap &&
    left.length === 2 &&
    right.length === 2
  ) {
    return null;
  }

  const result = countGapRule(
    left,
    right,
    reverse
  );

  const numbers = buildGapNumbers(
    result.leftDigits,
    result.rightDigits,
    reverse
  );

  if (numbers.length !== result.count) {
    throw new Error(
      "ကပ်ဂဏန်း ကွက်အရေအတွက် မကိုက်ညီပါ။"
    );
  }

  return createBetItem({
    label:
      `${left}/${right}` +
      (reverse ? "R" : ""),
    rule: reverse
      ? "gap_reverse"
      : "gap",
    numbers,
    count: numbers.length,
    amount
  });
}

function parseDirectExpression(expression, amount, label) {
  let source = expression
    .replace(/\s+/g, " ")
    .trim();

  source = source.replace(
    /[\/.,၊_-]+\s*([Rr®Ⓡ])$/u,
    "$1"
  );
  source = source.replace(/[\/.,၊_-]+$/u, "");

  let reverseAll = false;

  const separatedReverse = source.match(
    /\s+([Rr®Ⓡ])$/u
  );
  if (separatedReverse) {
    reverseAll = true;
    source = source
      .slice(0, separatedReverse.index)
      .trim();
  } else {
    const attachedReverse = source.match(
      /([Rr®Ⓡ])$/u
    );

    if (
      attachedReverse &&
      count2DNumbers(source) > 1
    ) {
      reverseAll = true;
      source = source.slice(0, -1);
    }
  }

  source = source.replace(/[\/.,၊_-]+$/u, "");

  const parts = source
    .replace(/[\/.,၊_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (parts.length === 0) return null;

  const entries = [];

  for (const part of parts) {
    const segmentEntries = parseDirectSegment(part);
    if (!segmentEntries) return null;
    entries.push(...segmentEntries);
  }

  if (entries.length === 0) return null;

  const numbers = expand2DEntries(
    entries,
    reverseAll
  );

  return createBetItem({
    label: buildDirectLabel(
      expression,
      reverseAll
    ),
    rule: reverseAll
      ? "reverse_all"
      : entries.length > 1
        ? "direct_group"
        : "direct",
    numbers,
    count: numbers.length,
    amount
  });
}

function parseDirectSegment(segment) {
  const source = String(segment || "");
  if (!source) return null;

  const entries = [];
  const pattern = /(\d{2})([Rr®Ⓡ]?)/g;
  let consumed = "";
  let match;

  while ((match = pattern.exec(source)) !== null) {
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

function extractAmount(line) {
  const result = tryExtractAmount(line);

  if (result) return result;

  const value = String(line || "").trim();

  if (/^\d{3,8}$/.test(value)) {
    throw new Error(
      "အကွက်အမျိုးအစား (အခွေ/အခွေပူး) မပါပါ။\n" +
      `ဥပမာ - ${value} အခွေ 500`
    );
  }

  throw new Error(
    "ထိုးငွေ (Amount) မတွေ့ပါ။\n" +
    `ဥပမာ - ${value} 500`
  );
}

function tryExtractAmount(line) {
  const value = String(line || "")
    .replace(/\u00a0/g, " ")
    .trim();

  let match = value.match(
    /^(.+?)([Rr®Ⓡ])\s*([\d,]+)$/u
  );

  if (match) {
    return validateExtractedAmount(
      `${match[1].trim()}${match[2]}`,
      match[3]
    );
  }

  match = value.match(
    /^(.+?)\s+([\d,]+)$/u
  );

  if (match) {
    return validateExtractedAmount(
      match[1],
      match[2]
    );
  }

  /*
   * Space မပါတဲ့ Rule + Amount ပုံစံများ
   * အပူး200, n500, 1369ခွေ300,
   * 1ဘရိတ်500, 1369.04578ကပ်250
   */
  match = value.match(/^(.+?)([\d,]+)$/u);

  if (
    match &&
    isRecognizedAttachedExpression(
      match[1]
    )
  ) {
    return validateExtractedAmount(
      match[1],
      match[2]
    );
  }

  return null;
}

function isRecognizedAttachedExpression(
  expression
) {
  const value = String(expression || "")
    .trim();

  const compact = value
    .replace(/\s+/g, "")
    .toLowerCase();

  if (isFixedCountRule(compact)) {
    return true;
  }

  if (
    /^\d(ဘရိတ်|b|br|break|brake)(?:ပါ)?$/iu
      .test(compact)
  ) {
    return true;
  }

  if (
    /^\d{3,8}(အ?ခွေပူး|အ?ခွေ|ခွေပူး|ခွေ|ခပ)(?:ပါ)?$/iu
      .test(compact)
  ) {
    return true;
  }

  if (
    /^[0-9/.,၊_-]+(ပါတ်|ပတ်|ထိပ်|ပိတ်)$/u
      .test(compact)
  ) {
    return true;
  }

  if (
    /^\d{1,9}[./_-]\d{1,9}ကပ်$/u
      .test(compact)
  ) {
    return true;
  }

  return false;
}

function validateExtractedAmount(
  expression,
  amountValue
) {
  const amount = String(amountValue)
    .replace(/,/g, "")
    .trim();

  if (!/^\d+$/.test(amount) || Number(amount) <= 0) {
    throw new Error("ထိုးငွေ (Amount) မမှန်ပါ။");
  }

  return {
    expression: String(expression).trim(),
    amount
  };
}

function detectCarryAmount(lines) {
  if (lines.length < 2) return null;

  const hasAmountlessLine = lines
    .slice(0, -1)
    .some((entry) => !tryExtractAmount(entry.text));

  if (!hasAmountlessLine) return null;

  const lastLine = lines[lines.length - 1].text;
  const match = lastLine.match(
    /[Rr®Ⓡ]\s*([\d,]+)\s*$/u
  );

  if (!match) {
    throw new Error(
      "နောက်ဆုံးစာကြောင်းတွင် R/® နှင့် ထိုးငွေ မတွေ့ပါ။"
    );
  }

  const amount = match[1].replace(/,/g, "");

  if (!/^\d+$/.test(amount) || Number(amount) <= 0) {
    throw new Error("ထိုးငွေ (Amount) မမှန်ပါ။");
  }

  return amount;
}

function isIgnorableLabel(line) {
  const value = String(line || "").trim();

  if (!/^[A-Za-z][A-Za-z _-]{0,30}$/.test(value)) {
    return false;
  }

  const compact = value
    .replace(/\s+/g, "")
    .toLowerCase();

  if (
    isFixedCountRule(compact) ||
    isBreakKeyword(compact)
  ) {
    return false;
  }

  return true;
}

function cleanExpression(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[၊]/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDisplayLabel(label, amount) {
  let value = String(label || "").trim();
  const amountText = String(amount || "");

  value = value.replace(
    new RegExp(`\\s*${amountText.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*$`),
    ""
  );

  return value.trim();
}

function buildDirectLabel(expression, reverseAll) {
  let value = String(expression || "")
    .trim()
    .replace(/[\/.,၊_-]+\s*([Rr®Ⓡ])$/u, "$1")
    .replace(/[\/.,၊_-]+$/u, "");

  if (
    reverseAll &&
    !/[Rr®Ⓡ]$/u.test(value)
  ) {
    value += " R";
  }

  return value;
}

function count2DNumbers(value) {
  const matches = String(value || "")
    .replace(/[Rr®Ⓡ]$/u, "")
    .match(/\d{2}/g);

  return matches ? matches.length : 0;
}

function buildDigitRuleNumbers(digits, ruleName) {
  const allDigits = [
    "0", "1", "2", "3", "4",
    "5", "6", "7", "8", "9"
  ];
  const numbers = [];

  for (const digit of digits) {
    if (ruleName === "ထိပ်") {
      for (const second of allDigits) {
        numbers.push(`${digit}${second}`);
      }
      continue;
    }

    if (ruleName === "ပိတ်") {
      for (const first of allDigits) {
        numbers.push(`${first}${digit}`);
      }
      continue;
    }

    if (ruleName === "ပါတ်") {
      for (const second of allDigits) {
        numbers.push(`${digit}${second}`);
      }
      for (const first of allDigits) {
        if (first !== digit) {
          numbers.push(`${first}${digit}`);
        }
      }
      continue;
    }

    throw new Error(`မသိရှိသော Digit Rule: ${ruleName}`);
  }

  return numbers;
}

function buildGapNumbers(
  leftDigits,
  rightDigits,
  reverse = false
) {
  const numbers = [];

  for (const left of leftDigits) {
    for (const right of rightDigits) {
      numbers.push(`${left}${right}`);
      if (reverse) {
        numbers.push(`${right}${left}`);
      }
    }
  }

  return numbers;
}

function normalizeMessage(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();
}
