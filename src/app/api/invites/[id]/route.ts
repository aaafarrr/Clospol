import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const invite = await prisma.workspaceInvite.findUnique({
      where: { id },
    });

    if (!invite) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    // Verify permission: Only inviter can revoke/delete, or invitee can delete/decline
    const isInviter = invite.inviterId === user.id;
    const isInvitee = invite.inviteeEmail.toLowerCase() === user.email.toLowerCase();

    if (!isInviter && !isInvitee) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    await prisma.workspaceInvite.delete({
      where: { id },
    });

    return NextResponse.json({
      message: isInviter 
        ? "Invitation successfully revoked." 
        : "Shared item successfully removed from workspace.",
    });

  } catch (err: any) {
    console.error("Delete invite error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
