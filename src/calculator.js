/**
 * New Zealand 2D Ledger Bot
 * src/calculator.js
 *
 * Amount / Count / Total Calculator
 */

/**
 * ငွေပမာဏကို Number ပြောင်းပြီး စစ်မယ်။
 *
 * လက်ခံမယ့်ပုံစံ
 * 500
 * 1,000
 * 10000
 * 10,000
 */
export function normalizeAmount(amount) {
  const rawValue = String(amount ?? "")
    .trim()
    .replace(/,/g, "");

  if (!/^\d+$/.test(rawValue)) {
    throw new Error(
      "ထိုးငွေပမာဏ မမှန်ပါ။ ဥပမာ - 500 သို့မဟုတ် 1,000"
    );
  }

  const value = Number(rawValue);

  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      "ထိုးငွေပမာဏသည် 0 ထက်ကြီးသော ဂဏန်းဖြစ်ရပါမယ်။"
    );
  }

  return value;
}

/**
 * ကွက်အရေအတွက်ကို စစ်မယ်။
 */
export function normalizeCount(count) {
  const value = Number(count);

  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      "ကွက်အရေအတွက် မမှန်ပါ။"
    );
  }

  return value;
}

/**
 * ငွေ Format
 *
 * 1000 → 1,000
 * 12500 → 12,500
 */
export function formatMoney(amount) {
  const value = Number(amount);

  if (!Number.isFinite(value)) {
    return "0";
  }

  return value.toLocaleString("en-US");
}

/**
 * Count × Amount တွက်မယ်။
 */
export function calculateByCount(
  count,
  amountPerNumber
) {
  const normalizedCount =
    normalizeCount(count);

  const amount =
    normalizeAmount(amountPerNumber);

  return {
    count: normalizedCount,
    amountPerNumber: amount,
    totalAmount:
      normalizedCount * amount
  };
}

/**
 * ဂဏန်းစာရင်းအပေါ်မူတည်ပြီး တွက်မယ်။
 *
 * လက်ရှိ parser အဟောင်းနဲ့လည်း
 * ဆက်အလုပ်လုပ်နိုင်အောင် ဒီ Function ကိုထားတယ်။
 */
export function calculateBet(
  numbers,
  amountPerNumber
) {
  if (!Array.isArray(numbers)) {
    throw new Error(
      "ဂဏန်းစာရင်းပုံစံ မမှန်ပါ။"
    );
  }

  if (numbers.length === 0) {
    throw new Error(
      "တွက်ရန် ဂဏန်းမရှိပါ။"
    );
  }

  const uniqueNumbers = [];
  const seen = new Set();

  for (const number of numbers) {
    const value = String(number);

    if (!/^\d{2}$/.test(value)) {
      throw new Error(
        `2D ဂဏန်းမမှန်ပါ: ${value}`
      );
    }

    if (!seen.has(value)) {
      seen.add(value);
      uniqueNumbers.push(value);
    }
  }

  const calculation = calculateByCount(
    uniqueNumbers.length,
    amountPerNumber
  );

  return {
    numbers: uniqueNumbers,
    count: calculation.count,
    amountPerNumber:
      calculation.amountPerNumber,
    totalAmount:
      calculation.totalAmount
  };
}

/**
 * Report Item တစ်ခု ဖန်တီးမယ်။
 *
 * ဥပမာ
 * label = "အပူး"
 * count = 10
 * amount = 500
 */
export function createBetItem({
  label,
  count,
  amount,
  rule = "unknown",
  numbers = []
}) {
  const cleanLabel = String(label || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!cleanLabel) {
    throw new Error(
      "စာရင်းအမည် မတွေ့ပါ။"
    );
  }

  const calculation = calculateByCount(
    count,
    amount
  );

  return {
    label: cleanLabel,
    rule,
    numbers: Array.isArray(numbers)
      ? numbers
      : [],
    count: calculation.count,
    amountPerNumber:
      calculation.amountPerNumber,
    totalAmount:
      calculation.totalAmount
  };
}

/**
 * Report Item အများကြီးရဲ့ Total တွက်မယ်။
 */
export function calculateGrandTotal(
  items = []
) {
  if (!Array.isArray(items)) {
    throw new Error(
      "Report စာရင်းပုံစံ မမှန်ပါ။"
    );
  }

  let grandTotal = 0;
  let totalCount = 0;

  for (const item of items) {
    if (!item) {
      continue;
    }

    const totalAmount =
      Number(item.totalAmount);

    const count =
      Number(item.count);

    if (
      !Number.isFinite(totalAmount) ||
      totalAmount < 0
    ) {
      throw new Error(
        "စာရင်းစုစုပေါင်းငွေ မမှန်ပါ။"
      );
    }

    if (
      !Number.isFinite(count) ||
      count < 0
    ) {
      throw new Error(
        "စာရင်းကွက်အရေအတွက် မမှန်ပါ။"
      );
    }

    grandTotal += totalAmount;
    totalCount += count;
  }

  return {
    items,
    itemCount: items.length,
    totalCount,
    grandTotal
  };
}

/**
 * Report Line စာသား ဖန်တီးမယ်။
 *
 * 🔹 အပူး (10 ကွက်) = 5,000
 */
export function formatBetItemLine(item) {
  if (!item) {
    throw new Error(
      "Report Item မရှိပါ။"
    );
  }

  return (
    `🔹 ${item.label} ` +
    `(${item.count} ကွက်) = ` +
    `${formatMoney(item.totalAmount)}`
  );
}

/**
 * Multi Bet Item တွေကို တစ်ခါတည်းတွက်မယ်။
 */
export function calculateBetItems(
  itemInputs = []
) {
  if (!Array.isArray(itemInputs)) {
    throw new Error(
      "Multi Bet စာရင်းပုံစံ မမှန်ပါ။"
    );
  }

  const items = itemInputs.map(
    (itemInput) =>
      createBetItem(itemInput)
  );

  return calculateGrandTotal(items);
    }


/*
 * =========================================
 * SAFE CHAT CALCULATOR
 * =========================================
 *
 * 2D Parser နဲ့မရောအောင် calculator စာသားကို
 * သီးသန့်စစ်ပြီး eval() မသုံးဘဲ တွက်ချက်သည်။
 */

export function tryCalculateExpression(input) {
  const original = String(input ?? "").trim();

  if (!original) {
    return null;
  }

  // Calculator အတွက် ခွင့်ပြုထားသော စာလုံးများသာ လက်ခံမယ်။
  if (!/^[\d,\s+\-*/×÷()=?]+$/.test(original)) {
    return null;
  }

  let expression = original
    .replace(/[=?\s]+$/g, "")
    .trim();

  if (!expression) {
    return null;
  }

  // အနည်းဆုံး သင်္ချာ Operator တစ်ခု ပါရမယ်။
  if (!/[+\-*/×÷]/.test(expression)) {
    return null;
  }

  // 76-09-34-52 လို 2D ဂဏန်းစာရင်းကို Calculator မယူရ။
  const compact = expression.replace(/\s+/g, "");
  if (/^\d{1,2}(?:-\d{1,2})+$/.test(compact)) {
    return null;
  }

  // 67/12345 လို ကပ်ဂဏန်းပုံစံကို Calculator မယူရ။
  if (/^\d{1,2}\/\d{3,}$/.test(compact)) {
    return null;
  }

  expression = expression
    .replace(/,/g, "")
    .replace(/×/g, "*")
    .replace(/÷/g, "/");

  if (!/^[\d\s+\-*/().]+$/.test(expression)) {
    throw new Error("Calculator ပုံစံ မမှန်ပါ။");
  }

  const tokens = tokenizeExpression(expression);
  let position = 0;

  function peek() {
    return tokens[position] || null;
  }

  function consume(expected = null) {
    const token = tokens[position];

    if (!token || (expected !== null && token.value !== expected)) {
      throw new Error("Calculator ပုံစံ မမှန်ပါ။");
    }

    position += 1;
    return token;
  }

  function parseExpression() {
    let value = parseTerm();

    while (
      peek()?.value === "+" ||
      peek()?.value === "-"
    ) {
      const operator = consume().value;
      const right = parseTerm();
      value =
        operator === "+"
          ? value + right
          : value - right;
    }

    return value;
  }

  function parseTerm() {
    let value = parseFactor();

    while (
      peek()?.value === "*" ||
      peek()?.value === "/"
    ) {
      const operator = consume().value;
      const right = parseFactor();

      if (operator === "/" && right === 0) {
        throw new Error("0 နဲ့ စားလို့မရပါ။");
      }

      value =
        operator === "*"
          ? value * right
          : value / right;
    }

    return value;
  }

  function parseFactor() {
    const token = peek();

    if (!token) {
      throw new Error("Calculator ပုံစံ မမှန်ပါ။");
    }

    if (token.value === "+") {
      consume("+");
      return parseFactor();
    }

    if (token.value === "-") {
      consume("-");
      return -parseFactor();
    }

    if (token.value === "(") {
      consume("(");
      const value = parseExpression();
      consume(")");
      return value;
    }

    if (token.type === "number") {
      consume();
      return token.number;
    }

    throw new Error("Calculator ပုံစံ မမှန်ပါ။");
  }

  const result = parseExpression();

  if (position !== tokens.length) {
    throw new Error("Calculator ပုံစံ မမှန်ပါ။");
  }

  if (!Number.isFinite(result)) {
    throw new Error("Calculator အဖြေ မမှန်ပါ။");
  }

  if (Math.abs(result) > Number.MAX_SAFE_INTEGER) {
    throw new Error("Calculator ဂဏန်းပမာဏ အလွန်ကြီးနေပါသည်။");
  }

  return {
    expression: formatCalculatorExpression(tokens),
    result,
    formattedResult: formatCalculatorNumber(result)
  };
}

function tokenizeExpression(expression) {
  const tokens = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/\d|\./.test(char)) {
      let numberText = "";

      while (
        index < expression.length &&
        /[\d.]/.test(expression[index])
      ) {
        numberText += expression[index];
        index += 1;
      }

      if (
        !/^(?:\d+\.?\d*|\.\d+)$/.test(numberText)
      ) {
        throw new Error("Calculator ဂဏန်းပုံစံ မမှန်ပါ။");
      }

      const number = Number(numberText);

      if (!Number.isFinite(number)) {
        throw new Error("Calculator ဂဏန်းပုံစံ မမှန်ပါ။");
      }

      tokens.push({
        type: "number",
        value: numberText,
        number
      });

      continue;
    }

    if ("+-*/()".includes(char)) {
      tokens.push({
        type: "operator",
        value: char
      });
      index += 1;
      continue;
    }

    throw new Error("Calculator ပုံစံ မမှန်ပါ။");
  }

  if (tokens.length === 0) {
    throw new Error("Calculator ပုံစံ မမှန်ပါ။");
  }

  return tokens;
}

function formatCalculatorExpression(tokens) {
  let output = "";

  for (const token of tokens) {
    if (token.type === "number") {
      output += formatCalculatorNumber(token.number);
      continue;
    }

    if (token.value === "(") {
      output += "(";
      continue;
    }

    if (token.value === ")") {
      output = output.trimEnd();
      output += ")";
      continue;
    }

    const symbol =
      token.value === "*"
        ? "×"
        : token.value === "/"
          ? "÷"
          : token.value;

    output += ` ${symbol} `;
  }

  return output
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCalculatorNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return number.toLocaleString("en-US", {
    maximumFractionDigits: 10
  });
}
