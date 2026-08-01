import {
  expandReverse,
  expandKhway
} from "./rules.js";

import {
  calculateBet
} from "./calculator.js";

/**
 * User Message Parser
 *
 * လက်ရှိထောက်ပံ့သောပုံစံများ
 *
 * 12 500
 * 12R 500
 * 12r 500
 * 12® 500
 * 12Ⓡ 500
 * 123 ခွေ 500
 */

export function parseBetMessage(text) {
  const normalizedText = String(text || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!normalizedText) {
    throw new Error("စာရင်းမတွေ့ပါ။");
  }

  const parts = normalizedText.split(" ");

  if (parts.length < 2) {
    throw new Error(
      "အသုံးပြုပုံ - 12 500 သို့မဟုတ် 123 ခွေ 500"
    );
  }

  let numbers = [];
  let amount;

  /*
   * Khway Rule
   *
   * 123 ခွေ 500
   */
  if (
    parts.length >= 3 &&
    /^(ခွေ|အခွေ)$/i.test(parts[1])
  ) {
    const digitText = parts[0];
    amount = parts[2];

    if (!/^\d{3,9}$/.test(digitText)) {
      throw new Error(
        "ခွေအတွက် ဂဏန်း ၃ လုံးမှ ၉ လုံးအထိ ထည့်ပါ။"
      );
    }

    const digits = digitText.split("");

    numbers = expandKhway(digits, false);
  } else {
    /*
     * Direct / Reverse Rule
     *
     * 12 500
     * 12R 500
     * 12r 500
     * 12® 500
     * 12Ⓡ 500
     */

    let number = parts[0];
    amount = parts[1];

    if (/[Rr®Ⓡ]$/.test(number)) {
      number = number.replace(/[Rr®Ⓡ]$/, "");

      if (!/^\d{2}$/.test(number)) {
        throw new Error(
          "R Rule အတွက် 2D ဂဏန်းမှန်ကန်စွာ ထည့်ပါ။"
        );
      }

      numbers = expandReverse([number]);
    } else {
      if (!/^\d{2}$/.test(number)) {
        throw new Error(
          "2D ဂဏန်းမှန်ကန်စွာ ထည့်ပါ။ ဥပမာ - 12 500"
        );
      }

      numbers = [number];
    }
  }

  return calculateBet(numbers, amount);
}
