import { connectDB } from "@/lib/db";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import * as OTPAuth from "otpauth";

function isAuthorized(req) {
  const password = req.headers.get("X-App-Password");
  return password === process.env.APP_PASSWORD;
}

export async function POST(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = await connectDB();
    const collection = db.collection(process.env.COLLECTION_NAME || "totp");
    const { id } = await req.json();

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid ID provided" },
        { status: 400 }
      );
    }

    // Find the secret in the database
    const secretDocument = await collection.findOne({ _id: new ObjectId(id) });

    if (!secretDocument) {
      return NextResponse.json({ error: "Secret not found" }, { status: 404 });
    }

    // Generate the token on the server using the stored secret
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(secretDocument.secret),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    const token = totp.generate();

    // Send ONLY the token back to the client
    return NextResponse.json({ token });
  } catch (error) {
    console.error("POST /api/totp/generate error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
