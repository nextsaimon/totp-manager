import { connectDB } from "@/lib/db";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import * as OTPAuth from "otpauth";

const loginAttempts = new Map();
const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) || 5;
const LOCKOUT_DURATION =
  (parseInt(process.env.LOGIN_LOCKOUT_MINUTES, 10) || 15) * 60 * 1000;

function getIp(req) {
  return req.headers.get("x-forwarded-for") || "127.0.0.1";
}

function isAuthorized(req) {
  const password = req.headers.get("X-App-Password");
  return password === process.env.APP_PASSWORD;
}

export async function GET(req) {
  const ip = getIp(req);
  const attemptInfo = loginAttempts.get(ip);

  if (
    attemptInfo &&
    attemptInfo.lockUntil &&
    attemptInfo.lockUntil > Date.now()
  ) {
    const remainingSeconds = Math.ceil(
      (attemptInfo.lockUntil - Date.now()) / 1000
    );
    return NextResponse.json(
      {
        error: `Too many failed attempts. Try again in ${remainingSeconds} seconds.`,
      },
      { status: 429 }
    );
  }

  if (!isAuthorized(req)) {
    const newAttemptCount = (attemptInfo?.count || 0) + 1;
    let newLockUntil = null;
    if (newAttemptCount >= MAX_ATTEMPTS) {
      newLockUntil = Date.now() + LOCKOUT_DURATION;
    }
    loginAttempts.set(ip, { count: newAttemptCount, lockUntil: newLockUntil });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  loginAttempts.delete(ip);

  try {
    const db = await connectDB();
    const collection = db.collection("totp");
    const all = await collection.find({}).sort({ updatedAt: -1 }).toArray();
    const secretsWithoutKeys = all.map((item) => {
      const { secret, ...rest } = item;
      return rest;
    });
    return NextResponse.json(secretsWithoutKeys);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await connectDB();
  const collection = db.collection(process.env.COLLECTION_NAME || "totp");
  try {
    const { url, note } = await req.json();
    if (!url || !url.startsWith("otpauth://")) {
      return NextResponse.json(
        { error: "Invalid otpauth:// URL provided" },
        { status: 400 }
      );
    }
    let fullLabel;
    try {
      const urlObject = new URL(url);
      const path = decodeURIComponent(urlObject.pathname);
      fullLabel = path.startsWith("/totp/")
        ? path.substring(6)
        : path.substring(1);
    } catch (e) {
      return NextResponse.json(
        { error: "Could not parse the otpauth URI path" },
        { status: 400 }
      );
    }
    if (!fullLabel) {
      return NextResponse.json(
        {
          error:
            "The otpauth:// URI must contain a label (e.g., /Issuer:Account)",
        },
        { status: 400 }
      );
    }
    let totp;
    try {
      totp = OTPAuth.URI.parse(url);
    } catch (err) {
      return NextResponse.json(
        { error: "Failed to parse the otpauth URI's parameters" },
        { status: 400 }
      );
    }
    const secret = totp.secret.base32;
    const issuer = totp.issuer || "Unknown Issuer";
    await collection.updateOne(
      { label: fullLabel },
      {
        $set: { label: fullLabel, secret, issuer, note, updatedAt: new Date() },
      },
      { upsert: true }
    );
    return NextResponse.json({ success: true, label: fullLabel });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = await connectDB();
    const collection = db.collection("totp");
    const { id } = await req.json();
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid ID provided" },
        { status: 400 }
      );
    }
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Secret not found with the given ID" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = await connectDB();
    const collection = db.collection("totp");
    const { id, note } = await req.json();
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid ID provided" },
        { status: 400 }
      );
    }
    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { note: note, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Secret not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
