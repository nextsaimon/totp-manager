import { connectDB } from "@/lib/db";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import * as OTPAuth from "otpauth";
import { validateRequest } from "@/lib/auth";

export async function GET(req) {
  const authError = await validateRequest(req);
  if (authError) return authError;

  try {
    const db = await connectDB();
    const collection = db.collection("totp");
    const { searchParams } = new URL(req.url);
    const noteForId = searchParams.get("id");

    if (noteForId) {
      if (!ObjectId.isValid(noteForId)) {
        return NextResponse.json(
          { error: "Invalid ID provided" },
          { status: 400 }
        );
      }
      const secret = await collection.findOne(
        { _id: new ObjectId(noteForId) },
        { projection: { note: 1 } }
      );
      if (!secret) {
        return NextResponse.json(
          { error: "Secret not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ note: secret.note || "" });
    }

    // Use projection to explicitly exclude the secret field
    const all = await collection
      .find({}, { projection: { secret: 0 } })
      .sort({ updatedAt: -1 })
      .toArray();

    const secretsSummary = all.map((item) => {
      const { note, ...rest } = item;
      return { ...rest, hasNote: !!note && note.trim().length > 0 };
    });

    return NextResponse.json(secretsSummary, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("GET /api/totp error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  const authError = await validateRequest(req);
  if (authError) return authError;

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
      if (!url.startsWith("otpauth://")) {
        return NextResponse.json(
          { error: "Invalid otpauth:// URL provided" },
          { status: 400 }
        );
      }
      try {
        const urlObject = new URL(url);
        let pathLabel = decodeURIComponent(urlObject.pathname);

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

        const totp = OTPAuth.URI.parse(url);

        totpData.label = pathLabel;
        totpData.secret = totp.secret.base32;
        totpData.issuer = totp.issuer || "Unknown Issuer";
      } catch (err) {
        return NextResponse.json(
          { error: "Failed to parse the otpauth URI" },
          { status: 400 }
        );
      }
    } else if (manualLabel && manualSecret) {
      if (!manualLabel.trim()) {
        return NextResponse.json(
          { error: "Label cannot be empty" },
          { status: 400 }
        );
      }
      try {
        OTPAuth.Secret.fromBase32(manualSecret.trim().toUpperCase());

        totpData.label = manualLabel.trim();
        totpData.secret = manualSecret.trim().toUpperCase();
        totpData.issuer = manualLabel.split(":")[0].trim() || "Unknown Issuer";
      } catch (err) {
        return NextResponse.json(
          { error: "Invalid Base32 secret key provided" },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        {
          error:
            "Request must contain either a 'url' or both a 'label' and 'secret'",
        },
        { status: 400 }
      );
    }

    await collection.updateOne(
      { label: totpData.label },
      {
        $set: {
          label: totpData.label,
          secret: totpData.secret,
          issuer: totpData.issuer,
          note,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true, label: totpData.label });
  } catch (error) {
    console.error("POST /api/totp error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req) {
  const authError = await validateRequest(req);
  if (authError) return authError;

  try {
    const db = await connectDB();
    const collection = db.collection(process.env.COLLECTION_NAME || "totp");
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
    console.error("DELETE /api/totp error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  const authError = await validateRequest(req);
  if (authError) return authError;

  try {
    const db = await connectDB();
    const collection = db.collection(process.env.COLLECTION_NAME || "totp");
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
    console.error("PUT /api/totp error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
