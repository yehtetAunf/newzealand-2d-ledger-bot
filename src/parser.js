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
  getBreakRuleNumbers,
  getParityBreakRuleNumbers
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
      const useCarry = carryAmount && isBeforeLast && isDirectListWithoutExplicitAmount(entry.text);

      const lineItems = useCarry
        ? parseBetExpression(`${entry.text} R`, carryAmount, `${entry.text}R`)
        : ownAmount
          ? parseBetExpression(ownAmount.expression, ownAmount.amount, entry.text)
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
  let expression = cleanExpression(rawExpression);

  // When R/r/® is used immediately before the amount (e.g.
  // "03 05 08r500"), it denotes reverse betting for the whole
  // listed group. Normalize an attached R/r to the separated form
  // so the direct-list parser expands every number and its reverse,
  // rather than reversing only the final number.
  if (
    /[Rr]$/u.test(expression) &&
    !/(?:^|\s)(?:b|br|bk|break|brake)$/iu.test(expression) &&
    /[Rr®Ⓡ]\s*[\d,]+$/u.test(String(originalLabel || "")) &&
    /\d{2}/u.test(expression) &&
    (expression.match(/\d{2}/g) || []).length > 1
  ) {
    expression = expression.replace(/[Rr]$/u, " R");
  }

  if (!expression) {
    throw new Error("ဂဏန်း သို့မဟုတ် Rule မတွေ့ပါ။");
  }

  const inlineItems = parseInlineFixedRecords(expression, amount, originalLabel);
  if (inlineItems) return inlineItems;

  const parityBreakComboItem = parseParityBreakComboRule(expression, amount, originalLabel);
  if (parityBreakComboItem) return [parityBreakComboItem];

  const comboItem = parseCompoundFixedRule(expression, amount, originalLabel);
  if (comboItem) return [comboItem];

  const fixedItem = parseFixedRule(
    expression,
    amount,
    originalLabel
  );
  if (fixedItem) return [fixedItem];

  const parityBreakItem = parseParityBreakRule(
    expression,
    amount,
    originalLabel
  );
  if (parityBreakItem) return [parityBreakItem];

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

  const combinedDigitRuleItem = parseCombinedDigitRule(
    expression,
    amount,
    originalLabel
  );
  if (combinedDigitRuleItem) return [combinedDigitRuleItem];

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

  const directItems = parseDirectExpression(
    expression,
    amount,
    originalLabel
  );
  if (directItems) return directItems;

  if (/^\d{3,8}$/.test(expression)) {
    throw new Error(
      "အကွက်အမျိုးအစား (အခွေ/အခွေပူး) မပါပါ။\n" +
      `ဥပမာ - ${expression} အခွေ 500`
    );
  }

  throw new Error(`နားမလည်သောစာရင်း: ${expression}`);
}

function parseCompoundFixedRule(expression, amount, label) {
  let compact = String(expression || "").replace(/\s+/g, "");
  if (!compact || /\d/.test(compact)) return null;

  let groupReverse = false;
  const trailing = compact.match(/[Rr®Ⓡ]$/u);
  if (trailing) {
    groupReverse = true;
    compact = compact.slice(0, -1);
  }

  const tokens = [
    "အပူးစုံ", "ပူးစုံ", "စုံစုံ", "မစုံ", "စုံမ", "မစ", "စမ", "မမ",
    "စုံပူး", "မပူး", "ပါဝါ", "ပါ", "ညီကို", "နက္ခတ်", "နခတ်", "နတ်", "အပူး", "ပူး"
  ];
  const tokenPattern = tokens.sort((a,b)=>b.length-a.length).join("|");
  const re = new RegExp(`(${tokenPattern})`, "u");
  const groups = [];
  let rest = compact;

  while (rest) {
    const m = rest.match(re);
    if (!m || m.index !== 0) return null;
    groups.push(m[1]);
    rest = rest.slice(m[1].length);
  }
  if (groups.length < 2) return null;

  const numbers = [];
  for (const rawRule of groups) {
    const normalized = rawRule === "ပူး" ? "အပူး"
      : (rawRule === "မစ" ? "မစုံ"
      : (rawRule === "ပါ" ? "ပါဝါ"
      : (rawRule === "နတ်" || rawRule === "နခတ်") ? "နက္ခတ်" : rawRule));
    const base = getSpecialRuleNumbers(normalized);
    numbers.push(...base);
  }

  if (groupReverse) {
    numbers.push(...numbers.map(reverse2DForParser));
  }

  return createBetItem({
    label: normalizeDisplayLabel(label, amount),
    rule: groupReverse ? "compound_fixed_reverse" : "compound_fixed",
    numbers,
    count: numbers.length,
    amount
  });
}

function parseInlineFixedRecords(expression, amount, label) {
  // Compact fixed-rule records with their own amounts, e.g. စမR5စမR00.
  const source = String(expression || "").replace(/\s+/g, "");
  if (!/[Rr®Ⓡ]\d+$/.test(source)) return null;

  const tokenPattern = "အပူးစုံ|ပူးစုံ|စုံစုံ|မစုံ|စုံမ|မစ|စမ|မမ|စုံပူး|မပူး|ပါဝါ|နက္ခတ်|နခတ်|အပူး|ပူး";
  const re = new RegExp(`^(${tokenPattern})([Rr®Ⓡ]?)(\\d+)(.*)$`, "u");
  const items = [];
  let rest = source;

  while (rest) {
    const m = rest.match(re);
    if (!m) return null;
    const rawRule = m[1];
    const reverse = Boolean(m[2]);
    const ownAmount = Number(m[3]);
    if (!ownAmount) return null;
    const normalized = rawRule === "ပူး" ? "အပူး" : rawRule === "မစ" ? "မစုံ" : rawRule;
    const base = getSpecialRuleNumbers(normalized);
    const numbers = reverse ? [...base, ...base.map(reverse2DForParser)] : base;
    items.push(createBetItem({
      label: `${rawRule}${reverse ? "R" : ""}`,
      rule: reverse ? "fixed_reverse" : "fixed",
      numbers,
      count: numbers.length,
      amount: String(ownAmount)
    }));
    rest = m[4];
  }

  return items.length ? items : null;
}

function parseFixedRule(expression, amount, label) {
  let compact = String(expression || "")
    .replace(/\s+/g, "")
    .toLowerCase();

  const reverse = /[Rr®Ⓡ]$/u.test(compact);
  if (reverse) compact = compact.slice(0, -1);

  if (!isFixedCountRule(compact)) {
    return null;
  }

  const fixed = getFixedRuleCount(compact);
  const baseNumbers = getSpecialRuleNumbers(fixed.rule);
  const numbers = reverse
    ? [...baseNumbers, ...baseNumbers.map((n) => reverse2DForParser(n))]
    : baseNumbers;

  return createBetItem({
    label: normalizeDisplayLabel(label, amount),
    rule: reverse ? `${fixed.rule}_reverse` : fixed.rule,
    numbers,
    count: numbers.length,
    amount
  });
}

function reverse2DForParser(number) {
  const value = String(number);
  return value.length === 2 ? `${value[1]}${value[0]}` : value;
}

function parseParityBreakComboRule(expression, amount, label) {
  const compact = String(expression || "").replace(/\s+/g, "");
  const match = compact.match(/^(စုံ|မ|စမ|မစ)(?:ဘရိတ်|b|br|bk|break|brake)(အပူး)?(?:ပါ)?$/iu);
  if (!match) return null;

  const parity = match[1] === "စုံ" ? "စုံဘရိတ်"
    : match[1] === "မ" ? "မဘရိတ်"
    : "စုံဘရိတ်-မဘရိတ်";
  const numbers = getParityBreakRuleNumbers(parity) || [];
  if (match[2]) {
    const doubles = parity === "စုံဘရိတ်" ? ["00","22","44","66","88"]
      : parity === "မဘရိတ်" ? ["11","33","55","77","99"]
      : ["00","11","22","33","44","55","66","77","88","99"];
    numbers.push(...doubles);
  }

  return createBetItem({
    label: normalizeDisplayLabel(label, amount),
    rule: match[2] ? `${parity}_အပူး` : parity,
    numbers,
    count: numbers.length,
    amount
  });
}

function parseParityBreakRule(expression, amount, label) {
  const compact = String(expression || "")
    .replace(/\s+/g, "");

  const normalized = compact
    .replace(/[–—−]/g, "-");

  if (!["စုံဘရိတ်", "မဘရိတ်", "စုံဘရိတ်-မဘရိတ်"].includes(normalized)) {
    return null;
  }

  const numbers = getParityBreakRuleNumbers(normalized);
  if (!numbers || numbers.length === 0) return null;

  return createBetItem({
    label: normalized,
    rule: normalized,
    numbers,
    count: numbers.length,
    amount
  });
}

function parseBreakRule(expression, amount, label) {
  const match = expression.match(
    /^([0-9]+)\s*(ဘရိတ်|b|br|bk|break|brake)\s*(?:ပါ)?$/i
  );

  if (!match || !isBreakKeyword(match[2])) {
    return null;
  }

  // Allow a compact digit group such as 0123456789br500.
  // Each digit expands to its own break set, then the sets are merged
  // while preserving order and removing duplicate 2D numbers.
  const digits = [...match[1]];
  const seen = new Set();
  const numbers = [];

  for (const digit of digits) {
    for (const number of getBreakRuleNumbers(digit)) {
      if (!seen.has(number)) {
        seen.add(number);
        numbers.push(number);
      }
    }
  }

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
    /^([0-9/.,၊_-]{2,20})\s*(အ?ခွေပူး|အ?ခွေ|ခွေပူး|ခွေ|ခပ|ခွ|khwepu|khwe|kp|kw)\s*(?:ပါ)?$/iu
  );

  if (!match) return null;

  const keyword = match[2];
  const normalizedKeyword = String(keyword).toLowerCase();
  const includeDoubles =
    /ပူး$/u.test(keyword) ||
    keyword === "ခပ" ||
    normalizedKeyword === "khwepu" ||
    normalizedKeyword === "kp";

  const khwayDigits = match[1].replace(/[^0-9]/g, "");

  if (khwayDigits.length < 3 || khwayDigits.length > 8) {
    throw new Error("အခွေဂဏန်းသည် 3 လုံးမှ 8 လုံးအတွင်း ဖြစ်ရပါမယ်။");
  }

  const result = expandKhway(
    khwayDigits,
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

function parseCombinedDigitRule(expression, amount, label) {
  const compact = String(expression || "")
    .replace(/\s+/g, "");

  const match = compact.match(
    /^([0-9]{1,10})ထိပ်\/?ပိတ်(အပူး)?(?:ပါ)?$/u
  );

  if (!match) return null;

  const digits = match[1].split("");
  const includeDouble = Boolean(match[2]);
  const numbers = [];

  for (const digit of digits) {
    for (let second = 0; second <= 9; second++) {
      numbers.push(`${digit}${second}`);
    }
    for (let first = 0; first <= 9; first++) {
      if (first !== Number(digit)) numbers.push(`${first}${digit}`);
    }
    if (includeDouble) numbers.push(`${digit}${digit}`);
  }

  return createBetItem({
    label: normalizeDisplayLabel(label, amount),
    rule: includeDouble ? "ထိပ်ပိတ်အပူး" : "ထိပ်ပိတ်",
    numbers,
    count: numbers.length,
    amount
  });
}

function parseDigitRule(expression, amount, label) {
  const match = expression.match(
    /^([0-9/.,၊_-]+)\s*(ပါတ်|ပတ်|ပါ|ထိပ်|ပိတ်|pat|ht|pt)$/iu
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
    /^(\d{1,10})\s*([./_-])\s*(\d{1,10})\s*(ကပ်|cp)?$/iu
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

  // (14:69) / (12:13:14:23) စသည့် grouped 2D စာရင်းများကို
  // ကွင်းဖယ်ပြီး direct list အဖြစ် ဖတ်မည်။
  if (/^[()]|[()]$/.test(source) || /\([^()]+\)/u.test(source)) {
    source = source.replace(/[()]/g, "");
  }

  source = source.replace(
    /[\/.,၊_-]+\s*([Rr®Ⓡ])$/u,
    "$1"
  );
  source = source.replace(/[\/.,၊_-]+$/u, "");

  let reverseAll = false;
  let reverseLast = false;

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

    if (attachedReverse) {
      // ® attached to the final group means reverse all; R/r attached
      // directly to a number means reverse that number only.
      if (attachedReverse[1] === "®" || attachedReverse[1] === "Ⓡ") {
        reverseAll = true;
        source = source.slice(0, -1);
      } else {
        // R/r attached to a punctuated or fully compact multi-2D group
        // is a group Reverse marker (e.g. 12.13.16...89r).
        // When attached directly to the final member of a space-separated
        // list (e.g. 15 25 67R), it applies only to that final member.
        const hasPunctuationSeparator = /[.,၊_\-*^:]/u.test(source);
        const isCompactMulti = !/\s/u.test(source) && count2DNumbers(source) > 1;
        if (hasPunctuationSeparator || isCompactMulti) {
          reverseAll = true;
        } else {
          reverseLast = true;
        }
        source = source.slice(0, -1);
      }
    }
  }

  source = source.replace(/[\/.,၊_-]+$/u, "");

  const parts = source
    .replace(/[\/.,၊_\-*^:]+/g, " ")
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

  if (reverseLast && !reverseAll) {
    entries[entries.length - 1] = {
      ...entries[entries.length - 1],
      reverse: true
    };
  }

  // R/® ကို ဂဏန်းအများကြီးအပေါ် တစ်ခါတည်းသုံးထားလျှင်
  // Report မှာ ဂဏန်းတစ်ခုချင်းစီကို သီးခြားလိုင်းပြမည်။
  // ဥပမာ 86-89-50-80R200 => 86R, 89R, 50R, 80R
  if (reverseAll && entries.length > 1) {
    return entries.map((entry) => {
      const itemNumbers = expand2DEntries([entry], true);

      return createBetItem({
        label: `${entry.number}R`,
        rule: "reverse",
        numbers: itemNumbers,
        count: itemNumbers.length,
        amount
      });
    });
  }

  const numbers = expand2DEntries(
    entries,
    reverseAll
  );

  return [createBetItem({
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
  })];
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
    .replace(/(ထိပ်)\s*[-:/.]\s*(ပိတ်)/gu, "$1/$2")
    .replace(/(ပါဝါ|နခတ်|နက္ခတ်|ညီကို|စုံမ|မစုံ|စုံစုံ|မမ|အပူး|ပူး)\s*[/,:-]\s*(?=(ပါဝါ|နခတ်|နက္ခတ်|ညီကို|စုံမ|မစုံ|စုံစုံ|မမ|အပူး|ပူး))/gu, "$1")
    .trim();

  // တည့်ငွေ + R/® ငွေ: 37ဒဲ့300®200 / 37=300®200 => 500
  let combinedAmount = value.match(
    /^(.+?)(?:ဒဲ့|=)\s*([\d,]+)\s*[Rr®Ⓡ]\s*([\d,]+)$/u
  );

  if (combinedAmount) {
    const direct = Number(String(combinedAmount[2]).replace(/,/g, ""));
    const reverse = Number(String(combinedAmount[3]).replace(/,/g, ""));
    if (direct > 0 && reverse > 0) {
      return validateExtractedAmount(
        combinedAmount[1].trim(),
        String(direct + reverse)
      );
    }
  }

  // Compact multi-digit break form: 0123456789br500 / 0br500.
  // Handle this before the generic R+amount matcher so the "r" in "br"
  // is not mistaken for a reverse marker.
  let breakAmount = value.match(
    /^([0-9]+)\s*(ဘရိတ်|br|bk|break|brake|b)\s*([\d,]+)$/iu
  );

  if (breakAmount) {
    return validateExtractedAmount(
      `${breakAmount[1]} ${breakAmount[2]}`,
      breakAmount[3]
    );
  }

  let match = value.match(
    /^(.+?)(?<![A-Za-z])([Rr®Ⓡ])\s*([\d,]+)$/u
  );

  if (match) {
    const rawExpression = String(match[1] || "");
    const hadSpaceBeforeReverse = /\s$/u.test(rawExpression);
    const expression = hadSpaceBeforeReverse
      ? `${rawExpression.trim()} ${match[2]}`
      : `${rawExpression.trim()}${match[2]}`;

    return validateExtractedAmount(
      expression,
      match[3]
    );
  }

  // Rule/ဂဏန်းနောက်က amount separator အဖြစ် = - / . : ကို လက်ခံသည်။
  // / . - သည် expression အတွင်းမှာလည်း သုံးနိုင်သဖြင့် နောက်ဆုံး separator ကိုသာ
  // စမ်းပြီး ဘယ်ဘက် expression သည် သိရှိပြီးသား rule ဖြစ်မှ amount အဖြစ်ယူသည်။
  match = value.match(/^(.+?)\s*([=:\-\/.])\s*([\d,]+)$/u);

  if (
    match &&
    (isRecognizedAttachedExpression(match[1]) ||
      (match[2] !== "." && canBeDirectExpression(match[1])))
  ) {
    return validateExtractedAmount(match[1], match[3]);
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

  if (isFixedCountRule(compact.replace(/[Rr®Ⓡ]$/u, ""))) {
    return true;
  }

  if (/^(?:(?:အပူးစုံ|ပူးစုံ|စုံစုံ|မစုံ|စုံမ|မစ|စမ|မမ|စုံပူး|မပူး|ပါဝါ|ညီကို|နက္ခတ်|နခတ်|အပူး|ပူး)[Rr®Ⓡ]?)+$/u.test(compact)) {
    return true;
  }

  if (/^(?:စမ|စုံမ|မစမ)[Rr®Ⓡ]?$/u.test(compact)) {
    return true;
  }

  if (/^(?:စုံ|မ|စမ|မစ)(?:ဘရိတ်|b|br|bk|break|brake)(?:အပူး)?(?:ပါ)?$/iu.test(compact)) {
    return true;
  }

  if (
    /^\d+(ဘရိတ်|b|br|bk|break|brake)(?:ပါ)?$/iu
      .test(compact)
  ) {
    return true;
  }

  if (["စုံဘရိတ်", "မဘရိတ်", "စုံဘရိတ်-မဘရိတ်"].includes(compact.replace(/[–—−]/g, "-"))) {
    return true;
  }

  if (
    /^[0-9/.,၊_-]{2,20}(အ?ခွေပူး|အ?ခွေ|ခွေပူး|ခွေ|ခပ|ခွ|khwepu|khwe|kp|kw)(?:ပါ)?$/iu
      .test(compact)
  ) {
    return true;
  }

  if (
    /^[0-9/.,၊_-]+(ပါတ်|ပတ်|ပါ|ထိပ်|ပိတ်|pat|ht|pt)$/iu
      .test(compact)
  ) {
    return true;
  }

  if (/^\d{1,10}(?:ထိပ်\/?ပိတ်)(?:အပူး)?(?:ပါ)?$/u.test(compact)) {
    return true;
  }

  if (
    /^\d{1,10}[./_-]\d{1,10}(?:ကပ်|cp)$/iu
      .test(compact)
  ) {
    return true;
  }

  return false;
}

function canBeDirectExpression(expression) {
  const value = String(expression || "")
    .replace(/\s+/g, "")
    .replace(/[Rr®Ⓡ]$/u, "")
    .replace(/[\/.,၊_\-*^:]+/g, "");

  return /^\d{2}(?:\d{2})*$/.test(value);
}

function validateExtractedAmount(
  expression,
  amountValue
) {
  const amount = String(amountValue)
    .replace(/,/g, "")
    .trim();

  if (!/^\d+$/.test(amount) || Number(amount) < 0) {
    throw new Error("ထိုးငွေ (Amount) မမှန်ပါ။");
  }

  return {
    expression: String(expression).trim(),
    amount
  };
}

function isDirectListWithoutExplicitAmount(line) {
  const value = String(line || "").trim();
  if (!value || /[A-Za-zအ-အA-အ]/u.test(value)) return false;
  if (/[Rr®Ⓡ]\s*[\d,]+$/u.test(value)) return false;
  const normalized = value.replace(/[.,၊_\-*^:]+/g, " ").replace(/\s+/g, " ").trim();
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length >= 2 && parts.every((part) => /^\d{2}$/.test(part))) return true;
  const digitsOnly = value.replace(/[^0-9]/g, "");
  return digitsOnly.length >= 4 && digitsOnly.length % 2 === 0 && /^[0-9.,၊_\-*^:]+$/.test(value);
}

function detectCarryAmount(lines) {
  if (lines.length < 2) return null;

  const lastLine = lines[lines.length - 1].text;
  const match = lastLine.match(/[Rr®Ⓡ]\s*([\d,]+)\s*$/u);
  if (!match) return null;

  const amount = match[1].replace(/,/g, "");
  if (!/^\d+$/.test(amount)) return null;

  const prior = lines.slice(0, -1);
  if (prior.some((entry) => isDirectListWithoutExplicitAmount(entry.text))) {
    return amount;
  }

  return null;
}

function isIgnorableLabel(line) {
  const value = String(line || "").trim();

  // Standalone app/label lines, including Burmese and labels followed by 0-12.
  if (/^[A-Za-z\u1000-\u109F][A-Za-z\u1000-\u109F _-]{0,30}(?:\s*(?:[0-9]|1[0-2]))?$/u.test(value)) {
    return true;
  }
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
    .replace(/(ထိပ်)\s*[-:/.]\s*(ပိတ်)/gu, "$1/$2")
    .replace(/(ပါဝါ|နခတ်|နက္ခတ်|ညီကို|စုံမ|မစုံ|စုံစုံ|မမ|အပူး|ပူး)\s*[/,:-]\s*(?=(ပါဝါ|နခတ်|နက္ခတ်|ညီကို|စုံမ|မစုံ|စုံစုံ|မမ|အပူး|ပူး))/gu, "$1")
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

  return value
    .replace(/\s*[=:\-\/.]\s*$/u, "")
    .trim();
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
  let value = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    // Telegram/phone copy-paste may encode line breaks with invisible
    // Unicode format characters. Treat common zero-width separators as
    // line breaks so pasted multi-line number lists remain parseable.
    .replace(/[\u200b\u200c\u200d\u2060\u2061\u2062\u2063\u2064\u206a\u206b\ufeff]/g, "\n")
    .trim();

  // DU ခေါင်းစဉ်များ: DU, DU1, DU 1, 9DU, 9 DU
  value = value
    .replace(/(?:^|\n)\s*(?:\d+\s*)?du(?:\s*\d+)?\s*(?=\n|$)/giu, "\n")
    .replace(/(?:^|\s)(?:\d+\s*)?du(?:\s*\d+)?(?=\s|$)/giu, " ");

  const directExpr = String.raw`([0-9]{2}(?:\s*[.,/၊_\-*^:]\s*[0-9]{2})*)`;

  // ဂဏန်းအုပ်စုနောက် Amount separator တစ်ခုနှင့် R/® တန်းလာသောပုံစံ။
  // 67-89-09=®500, 67-89-09-R500, 67-89-09/R500,
  // 67-89-09.R500, 67-89-09:R500 => 67-89-09R500
  value = value.replace(
    new RegExp(
      `(^|\\n|\\s)${directExpr}\\s*(?:=|:|-|/|\\.)\\s*[Rr®Ⓡ]\\s*([\\d,]+)(?=\\s|$)`,
      "giu"
    ),
    (_, lead, expression, amount) => `${lead}${expression}R${amount}`
  );


  // B Rule: တည့်ငွေ + R/® ငွေကို amount နှစ်ခု ပေါင်းပြီး record တစ်ခုတည်းတွက်သည်။
  // 24.97=600R300 => 24.97 900
  // 19-46-53-31ဒဲ့3000®2000 => ... 5000
  // 24.97 600®300 => 24.97 900
  value = value.replace(
    new RegExp(
      `(^|\\n|\\s)${directExpr}\\s*(?:ဒဲ့|=|\\s+(?=[\\d,]{3,}\\s*[Rr®Ⓡ]))\\s*([\\d,]+)\\s*[Rr®Ⓡ]\\s*([\\d,]+)(?=\\s|$)`,
      "giu"
    ),
    (_, lead, expression, directAmount, reverseAmount) => {
      const first = Number(String(directAmount).replace(/,/g, ""));
      const second = Number(String(reverseAmount).replace(/,/g, ""));
      return `${lead}${expression} ${first + second}`;
    }
  );

  // တည့်ငွေတစ်မျိုးတည်း: 67=500, 67ဒဲ့500
  value = value.replace(
    new RegExp(
      `(^|\\n|\\s)${directExpr}\\s*(?:ဒဲ့|=)\\s*([\\d,]+)(?=\\s|$)`,
      "giu"
    ),
    (_, lead, expression, amount) => `${lead}${expression} ${amount}`
  );

  // Alias များ
  value = value
    .replace(/ခပ/gu, "အခွေပူး")
    .replace(/ခွ(?!ေ|ပ)/gu, "အခွေ")
    .replace(/([0-9/.,၊_-]+)\s*ပါ(?=\s*(?:[=:\-\/.]|\d))/gu, "$1ပါတ်");

  // Reverse symbol များကို R တစ်မျိုးတည်း normalize လုပ်သည်။
  value = value.replace(/Ⓡ/g, "R");
  value = value.replace(/(^|[^A-Za-z])r(?=\s*[\d,]+|\s*$)/giu, "$1R");

  // Amount ပြီးနောက် record အသစ်ကို separator မပါဘဲ ဆက်ရေးထားသည့် case များ။
  value = value.replace(/R\s*(\d{3,})(?=[.,/၊_-])/giu, (whole, digits) => {
    const split = splitAmountAndFollowingDigits(digits);
    return split ? `R${split.amount}\n${split.tail}` : whole;
  });

  value = value.replace(
    /(အခွေပူး|အခွေ|ခွေပူး|ခွေ)\s*(\d{3,})(?=[.,/၊_-])/giu,
    (whole, keyword, digits) => {
      const split = splitAmountAndFollowingDigits(digits);
      return split ? `${keyword}${split.amount}\n${split.tail}` : whole;
    }
  );

  // Parenthesized grouped records: (14:69)R300(12:13:14:23)R50
  // R/® + amount ပြီးနောက် နောက် grouped record တန်းဆက်လာလျှင် newline ခွဲမည်။
  value = value.replace(
    /([Rr])\s*([\d,]+)\s*(?=\()/giu,
    "$1$2\n"
  );

  // R/® amount နောက်မှာ နောက်ထပ် 2D စာရင်း ဆက်လာလျှင်သာ ခွဲမည်။
  value = value.replace(
    /R\s*([\d,]+)\s+(?=\d{2}(?:\s|[.,/၊_\-*^:]))/giu,
    "R$1\n"
  );

  // R amount နောက်မှာ digit + rule တန်းဆက်လာခြင်း
  // ဥပမာ 86R2504ထိပ်ပိတ်300 -> 86R250 / 4ထိပ်ပိတ်300
  value = value.replace(
    /R\s*([\d,]{3,})(?=\d(?:ထိပ်|ပိတ်|ဘရိတ်|b|br|bk|break|brake))/giu,
    "R$1\n"
  );

  // Rule amount နောက်မှာ နောက် Rule/2D record တန်းဆက်လာတဲ့ compact ပုံစံများ။
  value = value.replace(
    /(ဘရိတ်|b|br|bk|break|brake)\s*([\d,]+)\s*(?=[.,/၊_\-*^:]\s*\d{2})/giu,
    "$1$2\n"
  );
  value = value.replace(
    /(\d{1,10}(?:ထိပ်\/?ပိတ်|ထိပ်|ပိတ်)(?:အပူး)?(?:ပါ)?)\s*([\d,]{3,}?)(?=\d{1,10}(?:ထိပ်\/?ပိတ်|ထိပ်|ပိတ်))/giu,
    "$1$2\n"
  );

  value = value.replace(
    /((?:ထိပ်|ပိတ်)(?:အပူး)?(?:ပါ)?)\s*([\d,]+)\s*(?=\d{2}[.,/၊_\-*^:]|\d{2}[ \t])/giu,
    "$1$2\n"
  );

  // Rule amount နှင့် နောက် 2D ကို space မပါဘဲ ဆက်ရေးထားသောပုံစံ
  // ဥပမာ 4ထိပ်ပိတ်30010..21.20R500
  value = value.replace(
    /((?:ထိပ်ပိတ်|ထိပ်|ပိတ်)(?:အပူး)?(?:ပါ)?)\s*([\d,]{3,})(?=\d{2}[.,/၊_\-*^:])/giu,
    "$1$2\n"
  );

  // Fixed Rule amount ပြီးနောက် နောက် Fixed Rule record ဆက်လာလျှင် ခွဲမည်။
  // ဥပမာ - စုံစုံ®500မမ®500စမ®500မစ®500
  value = value.replace(
    /([R®]\s*[\d,]+)\s*(?=(?:အပူးစုံ|ပူးစုံ|စုံစုံ|မစုံ|စုံမ|မစ|စမ|မမ|စုံပူး|မပူး|ပါဝါ|ညီကို|နက္ခတ်|နခတ်|အပူး|ပူး)(?:R|r|®|Ⓡ)?)/giu,
    "$1\n"
  );

  // ပုံမှန် space ဖြင့် ခွဲထားသော multi-record များ။
  value = value.replace(
    /(R\s*[\d,]+|(?:အခွေပူး|အခွေ|ခွေပူး|ခွေ)\s*[\d,]+)\s+(?=\d{2}(?:\s*[.,/၊_-]|\s*R))/giu,
    "$1\n"
  );

  return value
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function splitAmountAndFollowingDigits(digitsValue) {
  const digits = String(digitsValue || "").replace(/,/g, "");

  // Tail သည် 2D အစုဖြစ်ရမည်။ Amount သည် 10 ဖြင့် စားပြတ်ရမည်။
  for (let index = 2; index <= digits.length - 2; index++) {
    const amount = digits.slice(0, index);
    const tail = digits.slice(index);

    if (
      Number(amount) > 0 &&
      Number(amount) % 10 === 0 &&
      tail.length >= 2 &&
      tail.length % 2 === 0
    ) {
      return { amount, tail };
    }
  }

  return null;
}
