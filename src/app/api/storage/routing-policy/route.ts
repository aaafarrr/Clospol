import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let policy = await prisma.uploadRoutingPolicy.findUnique({
      where: { userId: user.id },
    });

    if (!policy) {
      policy = await prisma.uploadRoutingPolicy.create({
        data: {
          userId: user.id,
          mode: "most_available",
          priorityAccountIds: "[]",
          roundRobinCursor: 0,
        },
      });
    }

    return NextResponse.json({
      policy: {
        id: policy.id,
        userId: policy.userId,
        mode: policy.mode,
        priorityAccountIds: JSON.parse(policy.priorityAccountIds || "[]"),
        roundRobinCursor: policy.roundRobinCursor,
        createdAt: policy.createdAt,
        updatedAt: policy.updatedAt,
      },
    });

  } catch (err: any) {
    console.error("Get routing policy error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { mode, priorityAccountIds } = body;

    const validModes = [
      "most_available",
      "least_available",
      "priority",
      "round_robin",
      "local_first",
      "cloud_first",
      "random",
    ];

    if (mode && !validModes.includes(mode)) {
      return NextResponse.json(
        { error: `Invalid routing mode. Must be one of: ${validModes.join(", ")}` },
        { status: 400 }
      );
    }

    let policy = await prisma.uploadRoutingPolicy.findUnique({
      where: { userId: user.id },
    });

    const updateData: any = {};
    if (mode) updateData.mode = mode;
    if (priorityAccountIds !== undefined) {
      if (!Array.isArray(priorityAccountIds)) {
        return NextResponse.json({ error: "priorityAccountIds must be an array of strings" }, { status: 400 });
      }
      updateData.priorityAccountIds = JSON.stringify(priorityAccountIds);
    }

    if (!policy) {
      policy = await prisma.uploadRoutingPolicy.create({
        data: {
          userId: user.id,
          mode: mode || "most_available",
          priorityAccountIds: JSON.stringify(priorityAccountIds || []),
          roundRobinCursor: 0,
        },
      });
    } else {
      policy = await prisma.uploadRoutingPolicy.update({
        where: { id: policy.id },
        data: updateData,
      });
    }

    return NextResponse.json({
      message: "Routing policy updated successfully.",
      policy: {
        id: policy.id,
        userId: policy.userId,
        mode: policy.mode,
        priorityAccountIds: JSON.parse(policy.priorityAccountIds || "[]"),
        roundRobinCursor: policy.roundRobinCursor,
        createdAt: policy.createdAt,
        updatedAt: policy.updatedAt,
      },
    });

  } catch (err: any) {
    console.error("Update routing policy error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
