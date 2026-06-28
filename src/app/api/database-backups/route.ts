import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { encrypt, decrypt } from "@/lib/crypto";
import { DatabaseBackupService } from "@/services/database-backup";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const schedules = await prisma.databaseBackupSchedule.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const formattedSchedules = await Promise.all(
      schedules.map(async (s) => {
        let connectedAccount: any = null;
        if (s.destinationAccountId && s.destinationAccountId !== "routing_policy") {
          const acc = await prisma.connectedAccount.findFirst({
            where: { id: s.destinationAccountId, userId: user.id },
          });
          if (acc) {
            connectedAccount = {
              id: acc.id,
              display_name: acc.displayName || acc.email,
              provider: acc.provider,
            };
          }
        }

        let headers = {};
        if (s.headersEncrypted) {
          try {
            headers = JSON.parse(decrypt(s.headersEncrypted));
          } catch (e) {}
        }

        return {
          id: s.id,
          name: s.name,
          driver: s.driver,
          host: s.host,
          port: s.port,
          database: s.database,
          username: s.username,
          headers,
          cron_expression: s.cronExpression,
          retention_days: s.retentionDays,
          status: s.status,
          connected_account_id: s.destinationAccountId,
          connected_account: connectedAccount,
          last_backup_at: s.lastBackupAt ? s.lastBackupAt.toISOString() : null,
          last_backup_status: s.lastBackupStatus,
          last_backup_error: s.lastBackupError,
          created_at: s.createdAt.toISOString(),
        };
      })
    );

    return NextResponse.json({ schedules: formattedSchedules });
  } catch (err: any) {
    console.error("GET backup schedules error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      name,
      driver,
      host,
      port,
      database,
      username,
      password,
      connectedAccountId,
      cronExpression,
      retentionDays,
      headers,
    } = body;

    if (!name || !driver || !database || !cronExpression || !retentionDays || !connectedAccountId) {
      return NextResponse.json({ error: "All backup configuration fields are required" }, { status: 400 });
    }

    if (driver !== "sqlite") {
      if (!host || !port || !username) {
        return NextResponse.json({ error: "Host, Port, and Username are required for non-sqlite drivers" }, { status: 400 });
      }
    }

    // Verify storage account
    let destinationProvider = "routing_policy";
    if (connectedAccountId !== "routing_policy") {
      const account = await prisma.connectedAccount.findFirst({
        where: { id: connectedAccountId, userId: user.id, status: "connected" },
      });
      if (!account) {
        return NextResponse.json({ error: "Destination connected storage account not found or disconnected" }, { status: 404 });
      }
      destinationProvider = account.provider;
    }

    const hostVal = driver === "sqlite" ? "localhost" : host;
    const portVal = driver === "sqlite" ? 0 : Number(port);
    const usernameVal = driver === "sqlite" ? "" : username;
    const passwordVal = driver === "sqlite" ? "" : (password || "");
    const headersVal = headers || {};

    // Validate connection before saving
    try {
      await DatabaseBackupService.testConnection(
        driver,
        hostVal,
        portVal,
        database,
        usernameVal,
        passwordVal,
        headersVal
      );
    } catch (testErr: any) {
      return NextResponse.json({ error: testErr.message || "Database connection check failed." }, { status: 400 });
    }

    // Save schedule to database
    const schedule = await prisma.databaseBackupSchedule.create({
      data: {
        userId: user.id,
        name,
        driver,
        host: hostVal,
        port: portVal,
        database,
        username: usernameVal,
        passwordEncrypted: passwordVal ? encrypt(passwordVal) : null,
        headersEncrypted: headersVal ? encrypt(JSON.stringify(headersVal)) : null,
        cronExpression,
        retentionDays: Number(retentionDays),
        backupFrequency: cronExpression,
        destinationProvider,
        destinationAccountId: connectedAccountId,
        status: "active",
      },
    });

    return NextResponse.json(
      {
        message: "Database backup schedule created successfully.",
        schedule,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("POST backup schedule error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
