import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Auto-accept pending received invites for this user's email
    const pendingReceived = await prisma.workspaceInvite.findMany({
      where: { inviteeEmail: user.email, status: "pending" },
    });

    if (pendingReceived.length > 0) {
      await prisma.workspaceInvite.updateMany({
        where: { inviteeEmail: user.email, status: "pending" },
        data: {
          status: "accepted",
          acceptedAt: new Date(),
        },
      });
    }

    // Retrieve all invites involving the user
    const invites = await prisma.workspaceInvite.findMany({
      where: {
        OR: [
          { inviterId: user.id },
          { inviteeEmail: user.email },
        ],
      },
      include: {
        inviter: {
          select: { name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Resolve target item names
    const fileIds = invites.filter((i) => i.targetType === "file").map((i) => i.targetId);
    const folderIds = invites.filter((i) => i.targetType === "folder").map((i) => i.targetId);

    const files = await prisma.file.findMany({
      where: { id: { in: fileIds } },
      select: { id: true, name: true },
    });

    const folders = await prisma.folder.findMany({
      where: { id: { in: folderIds } },
      select: { id: true, name: true },
    });

    const fileMap = new Map(files.map((f) => [f.id, f.name]));
    const folderMap = new Map(folders.map((f) => [f.id, f.name]));

    const formattedInvites = invites.map((invite) => ({
      id: invite.id,
      inviterId: invite.inviterId,
      inviterName: invite.inviter.name,
      inviterEmail: invite.inviter.email,
      inviteeEmail: invite.inviteeEmail,
      targetType: invite.targetType,
      targetId: invite.targetId,
      role: invite.role,
      status: invite.status,
      createdAt: invite.createdAt,
      acceptedAt: invite.acceptedAt,
      revokedAt: invite.revokedAt,
      targetName: invite.targetType === "file"
        ? (fileMap.get(invite.targetId) || "Deleted File")
        : (folderMap.get(invite.targetId) || "Deleted Folder"),
    }));

    const sent = formattedInvites.filter((i) => i.inviterId === user.id);
    const received = formattedInvites.filter((i) => i.inviteeEmail === user.email);

    return NextResponse.json({ sent, received });

  } catch (err: any) {
    console.error("Fetch invites error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { email, targetType, targetId, role } = body;

    if (!email || !targetType || !targetId) {
      return NextResponse.json({ error: "Email, targetType, and targetId are required fields" }, { status: 400 });
    }

    if (email.toLowerCase() === user.email.toLowerCase()) {
      return NextResponse.json({ error: "You cannot invite yourself to collaborate on your own files" }, { status: 400 });
    }

    // Verify ownership of the target
    if (targetType === "file") {
      const file = await prisma.file.findFirst({
        where: { id: targetId, userId: user.id },
      });
      if (!file) {
        return NextResponse.json({ error: "File not found or access denied" }, { status: 404 });
      }
    } else if (targetType === "folder") {
      const folder = await prisma.folder.findFirst({
        where: { id: targetId, userId: user.id },
      });
      if (!folder) {
        return NextResponse.json({ error: "Folder not found or access denied" }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: "Invalid targetType. Must be file or folder." }, { status: 400 });
    }

    // Check if invite already exists
    const existing = await prisma.workspaceInvite.findUnique({
      where: {
        inviterId_inviteeEmail_targetType_targetId: {
          inviterId: user.id,
          inviteeEmail: email.toLowerCase(),
          targetType,
          targetId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: "An invitation has already been sent to this collaborator for this item" }, { status: 400 });
    }

    // Check if user exists
    const targetUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    const isAutoAccepted = !!targetUser;

    const invite = await prisma.workspaceInvite.create({
      data: {
        inviterId: user.id,
        inviteeEmail: email.toLowerCase(),
        targetType,
        targetId,
        role: role || "viewer",
        status: isAutoAccepted ? "accepted" : "pending",
        acceptedAt: isAutoAccepted ? new Date() : null,
      },
    });

    return NextResponse.json({
      message: isAutoAccepted
        ? `Collaborator ${email} has been added to the workspace.`
        : `Invitation sent to ${email}.`,
      invite,
    }, { status: 201 });

  } catch (err: any) {
    console.error("Create invite error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
