import { connectDB } from "./db";
import crypto from "crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) || 5;
const LOCKOUT_DURATION =
  (parseInt(process.env.LOGIN_LOCKOUT_MINUTES, 10) || 15) * 60 * 1000;

/**
 * Gets the client IP address securely.
 */
export async function getClientIp() {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return headerList.get("x-real-ip") || "127.0.0.1";
}

/**
 * Performs a timing-safe password verification.
 */
export function verifyPassword(inputPassword) {
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword || !inputPassword) return false;

  // Use hashing to handle different string lengths in a timing-safe manner
  const inputHash = crypto.createHash("sha256").update(inputPassword).digest();
  const appHash = crypto.createHash("sha256").update(appPassword).digest();

  return crypto.timingSafeEqual(inputHash, appHash);
}

/**
 * Checks if an IP is currently rate-limited.
 */
export async function checkRateLimit(ip) {
  const db = await connectDB();
  const collection = db.collection("rate_limits");

  const record = await collection.findOne({ ip });

  if (record && record.lockUntil && record.lockUntil > Date.now()) {
    const remainingSeconds = Math.ceil((record.lockUntil - Date.now()) / 1000);
    return { isLocked: true, remainingSeconds };
  }

  return { isLocked: false };
}

/**
 * Records a failed login attempt and applies lockout if necessary.
 */
export async function recordFailedAttempt(ip) {
  const db = await connectDB();
  const collection = db.collection("rate_limits");

  const record = await collection.findOne({ ip });
  const newCount = (record?.count || 0) + 1;
  let lockUntil = null;

  if (newCount >= MAX_ATTEMPTS) {
    lockUntil = Date.now() + LOCKOUT_DURATION;
  }

  await collection.updateOne(
    { ip },
    {
      $set: {
        count: newCount,
        lockUntil,
        lastAttempt: new Date(),
      },
    },
    { upsert: true }
  );
}

/**
 * Resets the rate limit for an IP after a successful login.
 */
export async function resetRateLimit(ip) {
  const db = await connectDB();
  const collection = db.collection("rate_limits");
  await collection.deleteOne({ ip });
}

/**
 * Helper to handle authorization and rate limiting in one go.
 * Returns a NextResponse if unauthorized or rate-limited, otherwise null.
 */
export async function validateRequest(req) {
  const ip = await getClientIp();

  // Check rate limit first
  const { isLocked, remainingSeconds } = await checkRateLimit(ip);
  if (isLocked) {
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${remainingSeconds} seconds.` },
      { status: 429 }
    );
  }

  const password = req.headers.get("X-App-Password");
  if (!password || !verifyPassword(password)) {
    await recordFailedAttempt(ip);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Success: reset rate limit for this IP
  await resetRateLimit(ip);
  return null;
}
