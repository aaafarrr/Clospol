import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

async function checkFolderAccess(folderId: string, userId: string, email: string): Promise<boolean> {
  let currentId: string | null = folderId;
  let depth = 0;
  while (currentId && depth < 10) {
    const folder = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { id: true, userId: true, parentId: true },
    });
    if (!folder) return false;
    if (folder.userId === userId) return true;

    const folderInvite = await prisma.workspaceInvite.findFirst({
      where: {
        inviteeEmail: email.toLowerCase(),
        targetType: "folder",
        targetId: currentId,
        status: "accepted",
      },
    });
    if (folderInvite) return true;

    currentId = folder.parentId;
    depth++;
  }
  return false;
}

async function getFolderBreadcrumbs(folderId: string, userId: string, email: string) {
  const crumbs: Array<{ id: string | null; name: string }> = [];
  let currentId: string | null = folderId;
  let iterations = 0;
  while (currentId && iterations < 50) {
    iterations++;
    const folder = await prisma.folder.findFirst({
      where: { id: currentId, deletedAt: null },
      select: { id: true, name: true, parentId: true, userId: true }
    });
    if (!folder) break;

    const hasAccess = folder.userId === userId || await checkFolderAccess(folder.id, userId, email);
    if (!hasAccess) break;

    crumbs.unshift({ id: folder.id, name: folder.name });
    currentId = folder.parentId;
  }
  crumbs.unshift({ id: null, name: "All Files" });
  return crumbs;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (user._apiKey) {
      const scopes: string[] = user._apiKey.scopes || [];
      if (!scopes.includes("files:read")) {
        return NextResponse.json({ error: "Forbidden: scope 'files:read' is required" }, { status: 403 });
      }
    }
    const { searchParams } = new URL(req.url);
    const parentId = searchParams.get("parentId") || null;
    const all = searchParams.get("all") === "true";
    const isRoot = parentId === "" || parentId === "null" || parentId === null;

    let folders;
    if (isRoot) {
      folders = await prisma.folder.findMany({
        where: {
          userId: user.id,
          deletedAt: null,
          ...(!all && { parentId: null })
        },
        orderBy: { name: "asc" },
      });
    } else {
      const hasAccess = await checkFolderAccess(parentId, user.id, user.email);
      if (!hasAccess) {
        return NextResponse.json({ error: "Access Denied" }, { status: 403 });
      }

      folders = await prisma.folder.findMany({
        where: {
          deletedAt: null,
          ...(!all && { parentId })
        },
        orderBy: { name: "asc" },
      });
    }

    const breadcrumbs = isRoot
      ? [{ id: null, name: "All Files" }]
      : await getFolderBreadcrumbs(parentId as string, user.id, user.email);

    return NextResponse.json({ folders, breadcrumbs });
  } catch (err: any) {
    console.error("GET folders error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (user._apiKey) {
      const scopes: string[] = user._apiKey.scopes || [];
      if (!scopes.includes("files:upload")) {
        return NextResponse.json({ error: "Forbidden: scope 'files:upload' is required" }, { status: 403 });
      }
    }

    const body = await req.json();
    const { name, parentId } = body;

    if (!name) {
      return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
    }

    const cleanParentId = (parentId === "null" || parentId === "" || !parentId) ? null : parentId;

    const folder = await prisma.folder.create({
      data: {
        userId: user.id,
        name,
        parentId: cleanParentId,
        color: "#3b82f6", // default brand blue
        isStarred: false,
      },
    });

    return NextResponse.json({ folder }, { status: 201 });
  } catch (err: any) {
    console.error("POST folders error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
