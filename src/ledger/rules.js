/**
 * New Zealand 2D Ledger Bot
 * Number rule expansion engine
 */

const ALL_DIGITS = Object.freeze(
  Array.from({ length: 10 }, (_, index) => String(index))
);

const POWER_GROUPS = Object.freeze({
  0: ["05", "50"],
  1: ["16", "61"],
  2: ["27", "72"],
  3: ["38", "83"],
  4: ["49", "94"],
  5: ["05", "50"],
  6: ["16", "61"],
  7: ["27", "72"],
  8: ["38", "83"],
  9: ["49", "94"],
});

/**
 * Number list ထဲက duplicate တွေဖယ်ပြီး
 * 00–99 မှန်ကန်တဲ့ number တွေပဲ ပြန်ပေးမယ်။
 */
export function uniqueNumbers(numbers = []) {
  return [
    ...new Set(
      numbers
        .map((number) => String(number).padStart(2, "0"))
        .filter((number) => /^\d{2}$/.test(number))
    ),
  ].sort();
}

/**
 * 2D number ဟုတ်/မဟုတ် စစ်မယ်။
 */
export function isValid2D(number) {
  return /^\d{2}$/.test(String(number));
}

/**
 * 12 → 21
 * 05 → 50
 * 11 → 11
 */
export function reverse2D(number) {
  const value = String(number);

  if (!isValid2D(value)) {
    throw new Error(`Invalid 2D number: ${number}`);
  }

  return `${value[1]}${value[0]}`;
}

/**
 * R Rule
 *
 * 12 R → 12, 21
 * 11 R → 11
 */
export function expandReverse(numbers = []) {
  const result = [];

  for (const number of numbers) {
    const value = String(number).padStart(2, "0");

    if (!isValid2D(value)) {
      throw new Error(`Invalid 2D number: ${number}`);
    }

    result.push(value);
    result.push(reverse2D(value));
  }

  return uniqueNumbers(result);
}

/**
 * အပူး
 *
 * digit တစ်လုံးပေးရင်:
 * 3 → 33
 *
 * digit မပေးရင်:
 * 00, 11, 22 ... 99
 */
export function expandDouble(digits = []) {
  const source = digits.length > 0 ? digits : ALL_DIGITS;

  return uniqueNumbers(
    source.map((digit) => {
      const value = String(digit);

      if (!/^\d$/.test(value)) {
        throw new Error(`Invalid double digit: ${digit}`);
      }

      return `${value}${value}`;
    })
  );
}

/**
 * အပူးစုံ
 *
 * 00 11 22 33 44 55 66 77 88 99
 */
export function expandAllDoubles() {
  return expandDouble();
}

/**
 * စုံ = Even digits
 * မ = Odd digits
 *
 * position:
 * - front → ရှေ့ဂဏန်း
 * - back  → နောက်ဂဏန်း
 * - both  → နှစ်လုံးလုံး
 */
export function expandEvenOdd(type, position = "both") {
  const evenDigits = ["0", "2", "4", "6", "8"];
  const oddDigits = ["1", "3", "5", "7", "9"];

  let allowedDigits;

  if (type === "even") {
    allowedDigits = evenDigits;
  } else if (type === "odd") {
    allowedDigits = oddDigits;
  } else {
    throw new Error(`Invalid even/odd type: ${type}`);
  }

  const result = [];

  for (const first of ALL_DIGITS) {
    for (const second of ALL_DIGITS) {
      if (position === "front" && allowedDigits.includes(first)) {
        result.push(`${first}${second}`);
      }

      if (position === "back" && allowedDigits.includes(second)) {
        result.push(`${first}${second}`);
      }

      if (
        position === "both" &&
        allowedDigits.includes(first) &&
        allowedDigits.includes(second)
      ) {
        result.push(`${first}${second}`);
      }
    }
  }

  return uniqueNumbers(result);
}

/**
 * ပါဝါ
 *
 * 1 ပါဝါ → 16, 61
 * 2 ပါဝါ → 27, 72
 * 3 ပါဝါ → 38, 83
 * 4 ပါဝါ → 49, 94
 * 5 ပါဝါ → 05, 50
 */
export function expandPower(digits = []) {
  if (!Array.isArray(digits) || digits.length === 0) {
    throw new Error("Power rule requires at least one digit.");
  }

  const result = [];

  for (const digit of digits) {
    const value = String(digit);

    if (!/^\d$/.test(value)) {
      throw new Error(`Invalid power digit: ${digit}`);
    }

    result.push(...POWER_GROUPS[value]);
  }

  return uniqueNumbers(result);
}

/**
 * ခွေ Rule
 *
 * digits = ["1", "2", "3"]
 *
 * includeDoubles false:
 * 12 13 21 23 31 32
 *
 * includeDoubles true:
 * 11 12 13 21 22 23 31 32 33
 */
export function expandKhway(digits = [], includeDoubles = false) {
  const cleanedDigits = [
    ...new Set(
      digits
        .map((digit) => String(digit))
        .filter((digit) => /^\d$/.test(digit))
    ),
  ];

  if (cleanedDigits.length < 2) {
    throw new Error("ခွေအတွက် အနည်းဆုံး ဂဏန်း ၂ လုံးလိုပါတယ်။");
  }

  if (cleanedDigits.length > 9) {
    throw new Error("ခွေအတွက် အများဆုံး ဂဏန်း ၉ လုံးပဲ သုံးနိုင်ပါတယ်။");
  }

  const result = [];

  for (const first of cleanedDigits) {
    for (const second of cleanedDigits) {
      if (!includeDoubles && first === second) {
        continue;
      }

      result.push(`${first}${second}`);
    }
  }

  return uniqueNumbers(result);
}

/**
 * ကပ် Rule
 *
 * base digit 3, distance 5:
 * 3 ကနေ 5 အကွာရှိတဲ့ digit = 8
 * → 38, 83
 *
 * ရှေ့/နောက် wrap-around ကိုပါ ထည့်မယ်။
 *
 * 8 ကို 5 ကပ် → 3
 * → 83, 38
 */
export function expandGap(digits = [], distance = 5) {
  const numericDistance = Number(distance);

  if (![3, 5].includes(numericDistance)) {
    throw new Error("ကပ် Rule မှာ 3 သို့မဟုတ် 5 ပဲ သုံးနိုင်ပါတယ်။");
  }

  const result = [];

  for (const digit of digits) {
    const numericDigit = Number(digit);

    if (!Number.isInteger(numericDigit) || numericDigit < 0 || numericDigit > 9) {
      throw new Error(`Invalid gap digit: ${digit}`);
    }

    const upper = (numericDigit + numericDistance) % 10;
    const lower = (numericDigit - numericDistance + 10) % 10;

    const relatedDigits = [...new Set([upper, lower])];

    for (const related of relatedDigits) {
      result.push(`${numericDigit}${related}`);
      result.push(`${related}${numericDigit}`);
    }
  }

  return uniqueNumbers(result);
}

/**
 * ထိပ်
 *
 * 1 ထိပ် → 10 11 12 ... 19
 */
export function expandFront(digits = []) {
  const result = [];

  for (const digit of digits) {
    const value = String(digit);

    if (!/^\d$/.test(value)) {
      throw new Error(`Invalid front digit: ${digit}`);
    }

    for (const second of ALL_DIGITS) {
      result.push(`${value}${second}`);
    }
  }

  return uniqueNumbers(result);
}

/**
 * နောက်
 *
 * 1 နောက် → 01 11 21 ... 91
 */
export function expandBack(digits = []) {
  const result = [];

  for (const digit of digits) {
    const value = String(digit);

    if (!/^\d$/.test(value)) {
      throw new Error(`Invalid back digit: ${digit}`);
    }

    for (const first of ALL_DIGITS) {
      result.push(`${first}${value}`);
    }
  }

  return uniqueNumbers(result);
               }
