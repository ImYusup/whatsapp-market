// src/lib/subscription/validator.ts

export function normalizePhone(
  phone: string
) {
  return phone.replace(
    /\D/g,
    ""
  );
}

export function isValidPhone(
  phone: string
) {
  const normalized =
    normalizePhone(phone);

  return (
    normalized.length >= 8 &&
    normalized.length <= 15
  );
}

export function normalizeAction(
  action: string
) {
  return action
    .trim()
    .toUpperCase();
}

export function isValidAction(
  action: string
) {
  return [
    "SUBSCRIBE",
    "RENEW",
    "STATUS",
  ].includes(action);
}