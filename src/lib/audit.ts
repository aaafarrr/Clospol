import prisma from "./db";

export class ActivityLogger {
  static async log(
    action: string,
    entityType: string,
    entityId: string | null = null,
    metadata: any = null,
    userId: string | null = null
  ) {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action,
          entityType,
          entityId,
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      });
    } catch (err) {
      console.error("Failed to log activity:", err);
    }
  }
}
