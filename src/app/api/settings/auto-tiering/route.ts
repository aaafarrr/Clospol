import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const rules = await prisma.autoTieringRule.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const formattedRules = rules.map((r) => {
      let conditions = { daysOlderThan: 30 };
      try {
        conditions = JSON.parse(r.ruleConditions);
      } catch (_) {}

      return {
        id: r.id,
        name: r.name,
        sourceAccountId: r.sourceAccountId,
        targetAccountId: r.targetAccountId,
        ruleConditions: conditions,
        ruleAction: r.ruleAction,
        status: r.status,
        lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
      };
    });

    return NextResponse.json({ rules: formattedRules });
  } catch (err: any) {
    console.error("GET auto-tiering rules error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const { name, sourceAccountId, targetAccountId, daysOlderThan, ruleAction } = body;

    if (!name || !sourceAccountId || !targetAccountId) {
      return NextResponse.json({ error: "Name, source account, and target account are required" }, { status: 400 });
    }

    const rule = await prisma.autoTieringRule.create({
      data: {
        userId: user.id,
        name,
        sourceAccountId,
        targetAccountId,
        ruleConditions: JSON.stringify({ daysOlderThan: daysOlderThan || 30 }),
        ruleAction: ruleAction || "migrate",
        status: "active",
      },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (err: any) {
    console.error("POST auto-tiering rule error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
