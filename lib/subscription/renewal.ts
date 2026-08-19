// src/lib/subscription/renewal.ts

export function calculateRenewalDate(
  currentExpiredAt: string | null
) {
  const now =
    new Date();

  let baseDate =
    now;

  if (currentExpiredAt) {
    const currentExpiration =
      new Date(
        currentExpiredAt
      );

    if (
      !Number.isNaN(
        currentExpiration.getTime()
      ) &&
      currentExpiration > now
    ) {
      baseDate =
        currentExpiration;
    }
  }

  const newExpiredAt =
    new Date(baseDate);

  newExpiredAt.setMonth(
    newExpiredAt.getMonth() + 1
  );

  return newExpiredAt;
}

export function isExpired(
  expiredAt: string
) {
  const expiration =
    new Date(expiredAt);

  if (
    Number.isNaN(
      expiration.getTime()
    )
  ) {
    return true;
  }

  return expiration <= new Date();
}