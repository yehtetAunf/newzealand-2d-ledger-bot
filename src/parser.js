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
 * ထောက်ပံ့သောပုံစံများ
 *
 * Direct
 * 12 500
 *
 * Reverse
 * 12R 500
 * 12r 500
 * 12® 500
 * 12Ⓡ 500
 * 12 R 500
 * 12 r 500
 * 12 ® 500
 * 12 Ⓡ 500
 *
 * ခွေ — အပူးမပါ
 * 123ခွေ 500
 * 123 ခွေ 500
 * 123အခွေ 500
 * 123 အခွေ 500
 *
 * ခွေပူး — အပူးပါ
 * 123ခွေပူး 500
 * 123 ခွေပူး 500
 * 123အခွေပူး 500
 * 123 အခွေပူး 500
 */

export function parseBetMessage(text) {
  const normalizedText = String(text || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!normalizedText) {
    throw new Error("စာရင်းမတွေ့ပါ။");
  }

  /*
   * ခွေ / အခွေ / ခွေပူး / အခွေပူး
   *
   * Space ပါတာ၊ မပါတာ နှစ်မျိုးလုံး လက်ခံမယ်။
   */
  const khwayMatch = normalizedText.match(
    /^(\d{3,9})\s*(အ?ခွေ)(ပူး)?\s+([\d,]+)$/
  );

  if (khwayMatch) {
    const digitText = khwayMatch[1];
    const hasDouble = Boolean(khwayMatch[3]);
    const amount = khwayMatch[4];

    const digits = digitText.split("");

    const numbers = expandKhway(
      digits,
      hasDouble
    );

    return calculateBet(
      numbers,
      amount
    );
  }

  /*
   * Reverse — Symbol က ဂဏန်းနဲ့ကပ်ရေးလို့ရသလို
   * Space ခြားပြီးလည်း ရေးလို့ရတယ်။
   */
  const reverseMatch = normalizedText.match(
    /^(\d{2})\s*([Rr®Ⓡ])\s+([\d,]+)$/
  );

  if (reverseMatch) {
    const number = reverseMatch[1];
    const amount = reverseMatch[3];

    const numbers = expandReverse([number]);

    return calculateBet(
      numbers,
      amount
    );
  }

  /*
   * Direct 2D
   */
  const directMatch = normalizedText.match(
    /^(\d{2})\s+([\d,]+)$/
  );

  if (directMatch) {
    const number = directMatch[1];
    const amount = directMatch[2];

    return calculateBet(
      [number],
      amount
    );
  }

  throw new Error(
    [
      "စာရင်းပုံစံမမှန်ပါ။",
      "",
      "ဥပမာ",
      "12 500",
      "12R 500",
      "12 R 500",
      "123ခွေ 500",
      "123 အခွေ 500",
      "123ခွေပူး 500",
      "123 အခွေပူး 500"
    ].join("\n")
  );
      }
