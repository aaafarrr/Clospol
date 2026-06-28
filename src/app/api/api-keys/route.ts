import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { hashToken, generateSecureToken } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const keys = await prisma.apiKey.findMany({
      where: {
        userId: user.id,
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedKeys = keys.map((k) => {
      let scopesArr = ["files:upload"];
      if (k.scopes) {
        try {
          scopesArr = JSON.parse(k.scopes);
        } catch (e) {}
      }

      return {
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        scopes: scopesArr,
        status: k.status,
        expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
        lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
        createdAt: k.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ apiKeys: formattedKeys });
  } catch (err: any) {
    console.error("GET api keys error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, expiresAt, scopes } = body;

    if (!name) {
      return NextResponse.json({ error: "API key name is required" }, { status: 400 });
    }

    const securePart = generateSecureToken(16);
    const secret = `9d_live_${securePart}`;
    const keyPrefix = secret.substring(0, 16);
    const keyHash = hashToken(secret);

    const scopesToSave = Array.isArray(scopes) && scopes.length > 0 ? scopes : ["files:upload"];

    const apiKey = await prisma.apiKey.create({
      data: {
        userId: user.id,
        name,
        keyPrefix,
        keyHash,
        scopes: JSON.stringify(scopesToSave),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        status: "active",
      },
    });

    let scopesArr = ["files:upload"];
    try {
      scopesArr = JSON.parse(apiKey.scopes);
    } catch (e) {}

    return NextResponse.json(
      {
        secret,
        apiKey: {
          id: apiKey.id,
          name: apiKey.name,
          keyPrefix: apiKey.keyPrefix,
          scopes: scopesArr,
          status: apiKey.status,
          expiresAt: apiKey.expiresAt ? apiKey.expiresAt.toISOString() : null,
          createdAt: apiKey.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("POST api keys error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
