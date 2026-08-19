// src/lib/subscription/service.ts

import crypto from "crypto";

import {
  appendRows,
  readSheet,
  updateRange,
} from "../google/sheets";

import {
  calculateRenewalDate,
  isExpired,
} from "./renewal";

import {
  normalizePhone,
} from "./validator";

// ============================================================
// SHEETS
// ============================================================

const SUBSCRIBERS =
  "Subscribers";

const SUBSCRIPTIONS =
  "Subscriptions";

const RENEWAL_HISTORY =
  "Renewal_History";

// ============================================================
// HELPERS
// ============================================================

function generateId(
  prefix: string
) {
  return `${prefix}_${Date.now()}_${crypto
    .randomBytes(4)
    .toString("hex")}`;
}

// ============================================================
// FIND SUBSCRIBER
// ============================================================

export async function findSubscriber(
  phone: string
) {
  const normalizedPhone =
    normalizePhone(phone);

  const rows =
    await readSheet(
      SUBSCRIBERS
    );

  for (
    let index = 1;
    index < rows.length;
    index++
  ) {
    const row =
      rows[index];

    const rowPhone =
      normalizePhone(
        row[1] || ""
      );

    if (
      rowPhone ===
      normalizedPhone
    ) {
      return {
        rowNumber:
          index + 1,

        subscriberId:
          row[0] || "",

        phone:
          row[1] || "",

        name:
          row[2] || "",

        createdAt:
          row[3] || "",

        status:
          row[4] || "",
      };
    }
  }

  return null;
}

// ============================================================
// FIND ACTIVE SUBSCRIPTION
// ============================================================

export async function findActiveSubscription(
  subscriberId: string
) {
  const rows =
    await readSheet(
      SUBSCRIPTIONS
    );

  for (
    let index = 1;
    index < rows.length;
    index++
  ) {
    const row =
      rows[index];

    const rowSubscriberId =
      row[1] || "";

    const expiredAt =
      row[3] || "";

    const status =
      row[4] || "";

    if (
      rowSubscriberId !==
      subscriberId
    ) {
      continue;
    }

    if (
      status !==
      "ACTIVE"
    ) {
      continue;
    }

    if (
      isExpired(
        expiredAt
      )
    ) {
      continue;
    }

    return {
      rowNumber:
        index + 1,

      subscriptionId:
        row[0] || "",

      subscriberId:
        row[1] || "",

      startAt:
        row[2] || "",

      expiredAt,

      status,
    };
  }

  return null;
}

// ============================================================
// SUBSCRIBE
// ============================================================

export async function subscribe(
  phone: string,
  name = ""
) {
  const normalizedPhone =
    normalizePhone(phone);

  let subscriber =
    await findSubscriber(
      normalizedPhone
    );

  const now =
    new Date();

  // ----------------------------------------------------------
  // CREATE SUBSCRIBER
  // ----------------------------------------------------------

  if (!subscriber) {
    subscriber = {
      rowNumber: 0,

      subscriberId:
        generateId(
          "SUB"
        ),

      phone:
        normalizedPhone,

      name:
        name.trim(),

      createdAt:
        now.toISOString(),

      status:
        "ACTIVE",
    };

    await appendRows(
      SUBSCRIBERS,
      [
        [
          subscriber.subscriberId,
          subscriber.phone,
          subscriber.name,
          subscriber.createdAt,
          subscriber.status,
        ],
      ]
    );
  }

  // ----------------------------------------------------------
  // EXISTING ACTIVE SUBSCRIPTION
  // ----------------------------------------------------------

  const activeSubscription =
    await findActiveSubscription(
      subscriber.subscriberId
    );

  if (
    activeSubscription
  ) {
    return {
      action:
        "ALREADY_ACTIVE",

      subscriber,

      subscription:
        activeSubscription,
    };
  }

  // ----------------------------------------------------------
  // CREATE SUBSCRIPTION
  // ----------------------------------------------------------

  const expiredAt =
    calculateRenewalDate(
      null
    );

  const subscription = {
    subscriptionId:
      generateId(
        "SUBSCRIPTION"
      ),

    subscriberId:
      subscriber.subscriberId,

    startAt:
      now.toISOString(),

    expiredAt:
      expiredAt.toISOString(),

    status:
      "ACTIVE",
  };

  await appendRows(
    SUBSCRIPTIONS,
    [
      [
        subscription.subscriptionId,
        subscription.subscriberId,
        subscription.startAt,
        subscription.expiredAt,
        subscription.status,
      ],
    ]
  );

  return {
    action:
      "SUBSCRIBED",

    subscriber,

    subscription,
  };
}

// ============================================================
// RENEW
// ============================================================

export async function renew(
  phone: string
) {
  const subscriber =
    await findSubscriber(
      phone
    );

  if (!subscriber) {
    return {
      action:
        "SUBSCRIBER_NOT_FOUND",
    };
  }

  const rows =
    await readSheet(
      SUBSCRIPTIONS
    );

  let latestIndex =
    -1;

  let latestSubscription:
    | {
        subscriptionId: string;
        subscriberId: string;
        startAt: string;
        expiredAt: string;
        status: string;
      }
    | null = null;

  for (
    let index = 1;
    index < rows.length;
    index++
  ) {
    const row =
      rows[index];

    if (
      row[1] !==
      subscriber.subscriberId
    ) {
      continue;
    }

    latestIndex =
      index;

    latestSubscription = {
      subscriptionId:
        row[0] || "",

      subscriberId:
        row[1] || "",

      startAt:
        row[2] || "",

      expiredAt:
        row[3] || "",

      status:
        row[4] || "",
    };
  }

  if (
    !latestSubscription ||
    latestIndex === -1
  ) {
    return {
      action:
        "SUBSCRIPTION_NOT_FOUND",
    };
  }

  const newExpiredAt =
    calculateRenewalDate(
      latestSubscription.expiredAt
    );

  const sheetRow =
    latestIndex + 1;

  await updateRange(
    SUBSCRIPTIONS,
    `D${sheetRow}:E${sheetRow}`,
    [
      [
        newExpiredAt.toISOString(),
        "ACTIVE",
      ],
    ]
  );

  await appendRows(
    RENEWAL_HISTORY,
    [
      [
        generateId(
          "RENEWAL"
        ),

        subscriber.subscriberId,

        latestSubscription.subscriptionId,

        latestSubscription.expiredAt,

        newExpiredAt.toISOString(),

        new Date().toISOString(),

        "SUCCESS",
      ],
    ]
  );

  return {
    action:
      "RENEWED",

    subscriber,

    subscription: {
      ...latestSubscription,

      expiredAt:
        newExpiredAt.toISOString(),

      status:
        "ACTIVE",
    },
  };
}

// ============================================================
// STATUS
// ============================================================

export async function getSubscriptionStatus(
  phone: string
) {
  const subscriber =
    await findSubscriber(
      phone
    );

  if (!subscriber) {
    return {
      action:
        "NOT_SUBSCRIBED",

      subscriber:
        null,

      subscription:
        null,
    };
  }

  const subscription =
    await findActiveSubscription(
      subscriber.subscriberId
    );

  if (!subscription) {
    return {
      action:
        "EXPIRED",

      subscriber,

      subscription:
        null,
    };
  }

  return {
    action:
      "ACTIVE",

    subscriber,

    subscription,
  };
}