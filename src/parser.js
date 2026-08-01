import { expandReverse } from "./rules.js";
import { calculateBet } from "./calculator.js";

/**
 * User Message Parser
 * ဥပမာ:
 * 12 500
 * 12R 500
 */

export function parseBetMessage(text) {
  text = text.trim();

  const parts = text.split(/\s+/);

  if (parts.length < 2) {
    throw new Error("အသုံးပြုပုံ - 12 500");
  }

  let number = parts[0];
  const amount = parts[1];

  let numbers = [];

  // Reverse Rule
  if (number.toUpperCase().endsWith("R")) {
    number = number.slice(0, -1);
    numbers = expandReverse([number]);
  } else {
    numbers = [number];
  }

  return calculateBet(numbers, amount);
}
