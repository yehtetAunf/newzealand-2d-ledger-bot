export function detectRule(bet) {
  const value = bet.trim();

  // 2D Number
  if (/^\d{2}$/.test(value)) {
    return {
      type: "number",
      numbers: [value]
    };
  }

  // Reverse (R)
  if (/^\d{2}R$/i.test(value)) {
    const n = value.substring(0, 2);
    return {
      type: "reverse",
      numbers: [n, n[1] + n[0]]
    };
  }

  // အပူး
  if (value === "အပူး") {
    return {
      type: "double"
    };
  }

  // အပူးစုံ
  if (value === "အပူးစုံ") {
    return {
      type: "double_even"
    };
  }

  // စုံမ
  if (value === "စုံမ") {
    return {
      type: "even_odd"
    };
  }

  // ပါဝါ
  if (value === "ပါဝါ") {
    return {
      type: "power"
    };
  }

  // ခွေ
  if (value.endsWith("ခွေ")) {
    return {
      type: "wheel",
      value: value.replace("ခွေ", "")
    };
  }

  // Unknown
  return {
    type: "unknown"
  };
}
