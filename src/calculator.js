/**
 * src/calculator.js
 * Ledger Amount Calculator
 */

// ငွေပမာဏ စစ်ဆေး
export function normalizeAmount(amount) {
  const value = Number(String(amount).replace(/,/g, ""));

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Invalid amount");
  }

  return value;
}

// စုစုပေါင်းတွက်
export function calculateBet(numbers, amountPerNumber) {
  const amount = normalizeAmount(amountPerNumber);

  return {
    numbers,
    count: numbers.length,
    amountPerNumber: amount,
    totalAmount: numbers.length * amount,
  };
}

// ငွေ Format
export function formatMoney(amount) {
  return Number(amount).toLocaleString("en-US");
}
