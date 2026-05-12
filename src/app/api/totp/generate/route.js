import { connectDB } from "@/lib/db";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import * as OTPAuth from "otpauth";
import { validateRequest } from "@/lib/auth";

export async function POST(req) {
  const authError = await validateRequest(req);
  if (authError) return authError;

  try {
    const { id, secret: manualSecret } = await req.json();

    let secret;

    if (id) {
      if (!ObjectId.isValid(id)) {
        return NextResponse.json(
          { error: "Invalid ID provided" },
          { status: 400 }
        );
      }

      const db = await connectDB();
      const collection = db.collection(process.env.COLLECTION_NAME || "totp");
      const secretDocument = await collection.findOne({ _id: new ObjectId(id) });

      if (!secretDocument) {
        return NextResponse.json({ error: "Secret not found" }, { status: 404 });
      }
      secret = secretDocument.secret;
    } else if (manualSecret) {
      secret = manualSecret;
    } else {
      return NextResponse.json(
        { error: "Either 'id' or 'secret' must be provided" },
        { status: 400 }
      );
    }

    // Generate the token on the server
    try {
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(secret),
        algorithm: "SHA1",
        digits: 6,
        period: 30,
      });
      const token = totp.generate();
      return NextResponse.json({ token });
    } catch (err) {
      return NextResponse.json(
        { error: "Invalid secret key provided" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("POST /api/totp/generate error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
