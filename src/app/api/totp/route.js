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
    const {
      url,
      label: manualLabel,
      secret: manualSecret,
      note,
    } = await req.json();

    let totpData = {};

    if (url) {
      // Handle otpauth:// URL
      if (!url.startsWith("otpauth://")) {
        return NextResponse.json(
          { error: "Invalid otpauth:// URL provided" },
          { status: 400 }
        );
      }
      try {
        // Manually parse the URL to get the exact label from the path
        const urlObject = new URL(url);
        let pathLabel = decodeURIComponent(urlObject.pathname);

        // Strip prefixes like '/totp/' or just '/' to get the raw label
        if (pathLabel.startsWith("/totp/")) {
          pathLabel = pathLabel.substring(6);
        } else if (pathLabel.startsWith("/")) {
          pathLabel = pathLabel.substring(1);
        }

        if (!pathLabel) {
          return NextResponse.json(
            { error: "Label is missing in the otpauth:// URL path" },
            { status: 400 }
          );
        }

        // Use OTPAuth library to parse other parameters like the secret
        const totp = OTPAuth.URI.parse(url);

        // Set data for database insertion
        totpData.label = pathLabel; // Use the manually extracted label
        totpData.secret = totp.secret.base32;
        totpData.issuer = totp.issuer || "Unknown Issuer";
      } catch (err) {
        return NextResponse.json(
          { error: "Failed to parse the otpauth URI" },
          { status: 400 }
        );
      }
    } else if (manualLabel && manualSecret) {
      // Handle manual entry of secret and label
      if (!manualLabel.trim()) {
        return NextResponse.json(
          { error: "Label cannot be empty" },
          { status: 400 }
        );
      }
      try {
        // Validate the secret key
        OTPAuth.Secret.fromBase32(manualSecret.trim().toUpperCase());

        totpData.label = manualLabel.trim();
        totpData.secret = manualSecret.trim().toUpperCase();
        // Infer issuer from the label (part before the first colon)
        totpData.issuer = manualLabel.split(":")[0].trim() || "Unknown Issuer";
      } catch (err) {
        return NextResponse.json(
          { error: "Invalid Base32 secret key provided" },
          { status: 400 }
        );
      }
    } else {
      // If neither condition is met, it's a bad request
      return NextResponse.json(
        {
          error:
            "Request must contain either a 'url' or both a 'label' and 'secret'",
        },
        { status: 400 }
      );
    }

    // Common logic to save to the database
    await collection.updateOne(
      { label: totpData.label },
      {
        $set: {
          label: totpData.label,
          secret: totpData.secret,
          issuer: totpData.issuer,
          note, // Save the note
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true, label: totpData.label });
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
    const { id, label } = await req.json();
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid ID provided" },
        { status: 400 }
      );
    }
    if (!label) {
      return NextResponse.json(
        { error: "Label is required for deletion" },
        { status: 400 }
      );
    }
    const secretToDelete = await collection.findOne({ _id: new ObjectId(id) });
    if (!secretToDelete) {
      return NextResponse.json({ error: "Secret not found" }, { status: 404 });
    }
    if (secretToDelete.label !== label) {
      return NextResponse.json(
        { error: "Label does not match. Deletion failed." },
        { status: 400 }
      );
    }
    await collection.deleteOne({ _id: new ObjectId(id) });
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
