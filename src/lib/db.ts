import { db } from "@/db";
import crypto from "crypto";
import { users, folders, files, apiKeys, uploadRoutingPolicies, connectedAccounts, localStorageConfigs, storageAccounts, auditLogs, fileShares, filePreviewTokens, uploadSessions, workspaceInvites, autoTieringRules, messengerIntegrations, databaseBackupSchedules, cctvCameras, providerConfigs, s3StorageConfigs, userSessions, authHandoffs } from "@/db/schema";
import { eq, inArray, isNull, and, or, desc, asc, count, lt, lte, gt, gte, ne, not } from "drizzle-orm";

const syncTrackedModels = new Set([
  "folder",
  "file",
  "apiKey",
  "uploadRoutingPolicy",
  "connectedAccount",
  "localStorageConfig",
  "messengerIntegration",
  "databaseBackupSchedule",
  "cctvCamera",
  "s3StorageConfig",
  "fileShare",
]);

function triggerRegistryAutoSync(row: any) {
  if (!row || !row.userId) return;
  Promise.resolve().then(async () => {
    try {
      const { CloudRegistryService } = await import("@/services/registry/cloud-registry");
      CloudRegistryService.triggerAutoSyncRegistry(row.userId);
    } catch (err) {
      console.error("[db.ts] Failed to run registry auto-sync trigger:", err);
    }
  });
}

// A lightweight adapter mapping Prisma method signatures to Drizzle queries.
// This allows all 83 API routes to use Drizzle's SQLite driver seamlessly.

const modelToSchema: Record<string, any> = {
  user: users,
  folder: folders,
  file: files,
  apiKey: apiKeys,
  uploadRoutingPolicy: uploadRoutingPolicies,
  connectedAccount: connectedAccounts,
  localStorageConfig: localStorageConfigs,
  storageAccount: storageAccounts,
  auditLog: auditLogs,
  fileShare: fileShares,
  filePreviewToken: filePreviewTokens,
  uploadSession: uploadSessions,
  workspaceInvite: workspaceInvites,
  autoTieringRule: autoTieringRules,
  messengerIntegration: messengerIntegrations,
  databaseBackupSchedule: databaseBackupSchedules,
  cctvCamera: cctvCameras,
  providerConfig: providerConfigs,
  s3StorageConfig: s3StorageConfigs,
  userSession: userSessions,
  authHandoff: authHandoffs,
};

function buildWhere(modelSchema: any, whereArgs: any): any {
  if (!whereArgs) return undefined;
  const conditions: any[] = [];
  
  for (const [key, value] of Object.entries(whereArgs)) {
    if (key === 'OR' && Array.isArray(value)) {
      const inner = or(...value.map((v: any) => buildWhere(modelSchema, v)).filter(Boolean));
      if (inner) conditions.push(inner);
    } else if (key === 'AND' && Array.isArray(value)) {
      const inner = and(...value.map((v: any) => buildWhere(modelSchema, v)).filter(Boolean));
      if (inner) conditions.push(inner);
    } else if (key === 'NOT') {
      if (Array.isArray(value)) {
        const inner = and(...value.map((v: any) => buildWhere(modelSchema, v)).filter(Boolean));
        if (inner) conditions.push(not(inner));
      } else if (typeof value === 'object' && value !== null) {
        const inner = buildWhere(modelSchema, value);
        if (inner) conditions.push(not(inner));
      }
    } else {
      const field = modelSchema[key];
      if (!field) {
        // If the key is not a direct column, check if it is a compound index object
        if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
          for (const [subKey, subValue] of Object.entries(value)) {
            const subField = modelSchema[subKey];
            if (subField) {
              let sanitizedVal = subValue;
              if (typeof subValue === 'boolean') sanitizedVal = subValue ? 1 : 0;
              else if (subValue instanceof Date) sanitizedVal = subValue.getTime();
              conditions.push(eq(subField, sanitizedVal));
            }
          }
        }
        continue;
      }
      
      if (value === null) {
        conditions.push(isNull(field));
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
        if ('in' in value) {
          conditions.push(inArray(field, (value as any).in));
        } else {
          const ops = ['lt', 'lte', 'gt', 'gte', 'not'];
          let hasOp = false;
          for (const op of ops) {
            if (op in value) {
              hasOp = true;
              const opVal = value[op];
              let sanitizedVal = opVal;
              if (typeof opVal === 'boolean') sanitizedVal = opVal ? 1 : 0;
              else if (opVal instanceof Date) sanitizedVal = opVal.getTime();

              if (op === 'lt') conditions.push(lt(field, sanitizedVal));
              else if (op === 'lte') conditions.push(lte(field, sanitizedVal));
              else if (op === 'gt') conditions.push(gt(field, sanitizedVal));
              else if (op === 'gte') conditions.push(gte(field, sanitizedVal));
              else if (op === 'not') conditions.push(ne(field, sanitizedVal));
            }
          }
          if (!hasOp) {
            let sanitizedVal = JSON.stringify(value);
            conditions.push(eq(field, sanitizedVal));
          }
        }
      } else {
        let sanitizedVal = value;
        if (typeof value === 'boolean') sanitizedVal = value ? 1 : 0;
        else if (value instanceof Date) sanitizedVal = value.getTime();
        conditions.push(eq(field, sanitizedVal));
      }
    }
  }
  
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

const buildSelect = (selectArgs: any) => {
  if (!selectArgs) return undefined;
  return selectArgs; 
};

function sanitizeData(schemaObj: any, data: any) {
  if (!data) return data;

  // Set defaults for known boolean/numeric columns with NOT NULL constraints that might be missing
  if (schemaObj.isStarred !== undefined && data.isStarred === undefined) {
    data.isStarred = 0;
  }

  const sanitized: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (schemaObj[k] !== undefined) {
      if (v === undefined) {
        continue;
      } else if (typeof v === 'boolean') {
        sanitized[k] = v ? 1 : 0;
      } else if (v instanceof Date) {
        sanitized[k] = v.getTime();
      } else if (typeof v === 'object' && v !== null && !Buffer.isBuffer(v)) {
        sanitized[k] = JSON.stringify(v);
      } else {
        sanitized[k] = v;
      }
    }
  }
  return sanitized;
}


function convertDates(row: any): any {
  if (!row) return row;
  const newRow = { ...row };
  for (const [key, val] of Object.entries(newRow)) {
    if (val !== null && val !== undefined) {
      if (key === 'isStarred') {
        newRow[key] = (val === 1 || val === '1' || val === true || val === 'true');
        continue;
      }
      const lowerKey = key.toLowerCase();
      if (key.endsWith('At') || lowerKey === 'createdat' || lowerKey === 'updatedat') {
        let dateVal: Date | null = null;
        if (typeof val === 'number') {
          dateVal = new Date(val);
        } else if (typeof val === 'string') {
          if (/^\d+$/.test(val)) {
            dateVal = new Date(parseInt(val, 10));
          } else {
            let dateStr = val;
            if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(val)) {
              // SQLite CURRENT_TIMESTAMP is UTC but lacks a timezone indicator.
              // Convert spaces to 'T' and append 'Z' to parse it strictly in UTC.
              dateStr = val.replace(' ', 'T') + 'Z';
            }
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) {
              dateVal = parsed;
            }
          }
        } else if (val instanceof Date) {
          dateVal = val;
        }
        if (dateVal) {
          newRow[key] = dateVal;
        }
      }
    }
  }
  return newRow;
}

const modelRelations: Record<string, Record<string, { model: string, foreignKey: string, targetKey: string, isMany?: boolean }>> = {
  connectedAccount: {
    storageAccount: { model: "storageAccount", foreignKey: "connectedAccountId", targetKey: "id", isMany: false },
    localStorageConfig: { model: "localStorageConfig", foreignKey: "connectedAccountId", targetKey: "id", isMany: false },
    s3StorageConfig: { model: "s3StorageConfig", foreignKey: "connectedAccountId", targetKey: "id", isMany: false }
  },
  folder: {
    connectedAccount: { model: "connectedAccount", foreignKey: "id", targetKey: "connectedAccountId", isMany: false },
  },
  file: {
    connectedAccount: { model: "connectedAccount", foreignKey: "id", targetKey: "connectedAccountId", isMany: false },
  },
  fileShare: {
    file: { model: "file", foreignKey: "id", targetKey: "fileId", isMany: false },
    folder: { model: "folder", foreignKey: "id", targetKey: "folderId", isMany: false },
  },
  filePreviewToken: {
    file: { model: "file", foreignKey: "id", targetKey: "fileId", isMany: false },
  },
  workspaceInvite: {
    inviter: { model: "user", foreignKey: "id", targetKey: "inviterId", isMany: false }
  },
  apiKey: {
    user: { model: "user", foreignKey: "id", targetKey: "userId", isMany: false }
  }
};

async function resolveIncludes(modelName: string, item: any, includeArgs: any): Promise<any> {
  if (!item || !includeArgs) return item;
  const newItem = { ...item };
  const relations = modelRelations[modelName];
  if (!relations) return newItem;

  for (const [key, val] of Object.entries(includeArgs)) {
    if (!val) continue;
    const relConfig = relations[key];
    if (!relConfig) continue;

    const relSchema = modelToSchema[relConfig.model];
    if (!relSchema) continue;

    const sourceVal = item[relConfig.targetKey];
    if (sourceVal === undefined || sourceVal === null) {
      newItem[key] = relConfig.isMany ? [] : null;
      continue;
    }

    const col = relSchema[relConfig.foreignKey];
    if (!col) continue;

    const rows = await db.select().from(relSchema).where(eq(col, sourceVal));
    const processedRows = rows.map(convertDates);

    let relatedData: any;
    if (relConfig.isMany) {
      if (typeof val === 'object' && val !== null) {
        relatedData = await Promise.all(processedRows.map(row => resolveIncludes(relConfig.model, row, (val as any).include || val)));
      } else {
        relatedData = processedRows;
      }
    } else {
      const row = processedRows[0] || null;
      if (row && typeof val === 'object' && val !== null) {
        relatedData = await resolveIncludes(relConfig.model, row, (val as any).include || val);
      } else {
        relatedData = row;
      }
    }

    if (relatedData && typeof val === 'object' && val !== null && (val as any).select) {
      const selectFields = (val as any).select;
      if (Array.isArray(relatedData)) {
        relatedData = relatedData.map(r => {
          const selected: any = {};
          for (const [sKey, sVal] of Object.entries(selectFields)) {
            if (sVal) selected[sKey] = r[sKey];
          }
          return selected;
        });
      } else {
        const selected: any = {};
        for (const [sKey, sVal] of Object.entries(selectFields)) {
          if (sVal) selected[sKey] = relatedData[sKey];
        }
        relatedData = selected;
      }
    }

    newItem[key] = relatedData;
  }

  return newItem;
}

function applySelect(item: any, selectArgs: any): any {
  if (!item || !selectArgs) return item;
  const selected: any = {};
  for (const [key, val] of Object.entries(selectArgs)) {
    if (val) {
      selected[key] = item[key];
    }
  }
  return selected;
}

function createModelAdapter(modelName: string) {
  const schemaObj = modelToSchema[modelName];

  return {
    findFirst: async (args: any) => {
      const where = buildWhere(schemaObj, args?.where);
      const res = await db.select().from(schemaObj).where(where).limit(1);
      if (!res[0]) return null;
      let item = convertDates(res[0]);
      if (args?.include) {
        item = await resolveIncludes(modelName, item, args.include);
      }
      if (args?.select) {
        item = applySelect(item, args.select);
      }
      return item;
    },
    findUnique: async (args: any) => {
      const where = buildWhere(schemaObj, args?.where);
      const res = await db.select().from(schemaObj).where(where).limit(1);
      if (!res[0]) return null;
      let item = convertDates(res[0]);
      if (args?.include) {
        item = await resolveIncludes(modelName, item, args.include);
      }
      if (args?.select) {
        item = applySelect(item, args.select);
      }
      return item;
    },
    findMany: async (args: any) => {
      const where = buildWhere(schemaObj, args?.where);
      let query = db.select().from(schemaObj).where(where);
      if (args?.take) query = query.limit(args.take) as any;
      if (args?.orderBy) {
        const orderFields = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
        const drizzleOrderBys: any[] = [];
        for (const orderObj of orderFields) {
          for (const [field, direction] of Object.entries(orderObj)) {
            const schemaField = schemaObj[field];
            if (schemaField) {
              drizzleOrderBys.push(direction === "desc" ? desc(schemaField) : asc(schemaField));
            }
          }
        }
        if (drizzleOrderBys.length > 0) {
          query = query.orderBy(...drizzleOrderBys) as any;
        }
      }
      const res = await query;
      let items = res.map(convertDates);
      if (args?.include) {
        items = await Promise.all(items.map(item => resolveIncludes(modelName, item, args.include)));
      }
      if (args?.select) {
        items = items.map(item => applySelect(item, args.select));
      }
      return items;
    },
    count: async (args: any) => {
      const where = buildWhere(schemaObj, args?.where);
      const res = await db.select({ value: count() }).from(schemaObj).where(where);
      return res[0].value;
    },
    create: async (args: any) => {
      const data = { ...args.data };
      if (!data.id) data.id = crypto.randomUUID();
      if (schemaObj.updatedAt !== undefined && !data.updatedAt) {
        data.updatedAt = Date.now();
      }
      const sanitized = sanitizeData(schemaObj, data);
      const res = await db.insert(schemaObj).values(sanitized).returning();
      if (!res[0]) return null;
      let item = convertDates(res[0]);
      if (syncTrackedModels.has(modelName)) {
        triggerRegistryAutoSync(item);
      }
      if (args?.include) {
        item = await resolveIncludes(modelName, item, args.include);
      }
      if (args?.select) {
        item = applySelect(item, args.select);
      }
      return item;
    },
    update: async (args: any) => {
      const where = buildWhere(schemaObj, args.where);
      const data = { ...args.data };
      
      let hasExpression = false;
      for (const [key, val] of Object.entries(data)) {
        if (val && typeof val === 'object' && ('increment' in val || 'decrement' in val)) {
          hasExpression = true;
          break;
        }
      }

      if (hasExpression) {
        const existing = await db.select().from(schemaObj).where(where).limit(1);
        if (existing[0]) {
          for (const [key, val] of Object.entries(data)) {
            if (val && typeof val === 'object') {
              if ('increment' in (val as any)) {
                const currentVal = Number(existing[0][key] !== undefined && existing[0][key] !== null ? existing[0][key].toString() : 0);
                data[key] = currentVal + Number((val as any).increment);
              } else if ('decrement' in (val as any)) {
                const currentVal = Number(existing[0][key] !== undefined && existing[0][key] !== null ? existing[0][key].toString() : 0);
                data[key] = currentVal - Number((val as any).decrement);
              }
            }
          }
        }
      }

      if (schemaObj.updatedAt !== undefined && !data.updatedAt) {
        data.updatedAt = Date.now();
      }
      const sanitized = sanitizeData(schemaObj, data);
      const res = await db.update(schemaObj).set(sanitized).where(where).returning();
      if (!res[0]) return null;
      let item = convertDates(res[0]);
      if (syncTrackedModels.has(modelName)) {
        triggerRegistryAutoSync(item);
      }
      if (args?.include) {
        item = await resolveIncludes(modelName, item, args.include);
      }
      if (args?.select) {
        item = applySelect(item, args.select);
      }
      return item;
    },
    upsert: async (args: any) => {
      const where = buildWhere(schemaObj, args.where);
      const existing = await db.select().from(schemaObj).where(where).limit(1);
      if (existing[0]) {
        const updateData = { ...args.update };
        for (const [key, val] of Object.entries(updateData)) {
          if (val && typeof val === 'object') {
            if ('increment' in (val as any)) {
              const currentVal = Number(existing[0][key] !== undefined && existing[0][key] !== null ? existing[0][key].toString() : 0);
              updateData[key] = currentVal + Number((val as any).increment);
            } else if ('decrement' in (val as any)) {
              const currentVal = Number(existing[0][key] !== undefined && existing[0][key] !== null ? existing[0][key].toString() : 0);
              updateData[key] = currentVal - Number((val as any).decrement);
            }
          }
        }
        if (schemaObj.updatedAt !== undefined && !updateData.updatedAt) {
          updateData.updatedAt = Date.now();
        }
        const res = await db.update(schemaObj).set(sanitizeData(schemaObj, updateData)).where(where).returning();
        if (!res[0]) return null;
        let item = convertDates(res[0]);
        if (syncTrackedModels.has(modelName)) {
          triggerRegistryAutoSync(item);
        }
        if (args?.include) {
          item = await resolveIncludes(modelName, item, args.include);
        }
        if (args?.select) {
          item = applySelect(item, args.select);
        }
        return item;
      } else {
        const createData = { ...args.create };
        if (!createData.id) createData.id = crypto.randomUUID();
        if (schemaObj.updatedAt !== undefined && !createData.updatedAt) {
          createData.updatedAt = Date.now();
        }
        const res = await db.insert(schemaObj).values(sanitizeData(schemaObj, createData)).returning();
        if (!res[0]) return null;
        let item = convertDates(res[0]);
        if (syncTrackedModels.has(modelName)) {
          triggerRegistryAutoSync(item);
        }
        if (args?.include) {
          item = await resolveIncludes(modelName, item, args.include);
        }
        if (args?.select) {
          item = applySelect(item, args.select);
        }
        return item;
      }
    },
    updateMany: async (args: any) => {
      const where = buildWhere(schemaObj, args.where);
      const data = { ...args.data };
      if (schemaObj.updatedAt !== undefined && !data.updatedAt) {
        data.updatedAt = Date.now();
      }
      const res = await db.update(schemaObj).set(sanitizeData(schemaObj, data)).where(where).returning();
      if (res && res[0] && syncTrackedModels.has(modelName)) {
        triggerRegistryAutoSync(res[0]);
      }
      return { count: (res as any[]).length };
    },
    delete: async (args: any) => {
      const where = buildWhere(schemaObj, args.where);
      const res = await db.delete(schemaObj).where(where).returning();
      if (!res[0]) return null;
      let item = convertDates(res[0]);
      if (syncTrackedModels.has(modelName)) {
        triggerRegistryAutoSync(item);
      }
      if (args?.include) {
        item = await resolveIncludes(modelName, item, args.include);
      }
      if (args?.select) {
        item = applySelect(item, args.select);
      }
      return item;
    },
    deleteMany: async (args: any) => {
      const where = buildWhere(schemaObj, args.where);
      const res = await db.delete(schemaObj).where(where).returning();
      if (res && res[0] && syncTrackedModels.has(modelName)) {
        triggerRegistryAutoSync(res[0]);
      }
      return { count: (res as any[]).length };
    },
    groupBy: async (args: any) => {
      const where = buildWhere(schemaObj, args?.where);
      const res = await db.select().from(schemaObj).where(where);
      const items = res.map(convertDates);
      const groupsMap = new Map<string, any>();

      for (const item of items) {
        const keyParts = args.by.map((f: string) => String(item[f]));
        const key = keyParts.join("||");

        if (!groupsMap.has(key)) {
          const groupObj: any = {};
          for (const f of args.by) {
            groupObj[f] = item[f];
          }
          if (args._sum) {
            groupObj._sum = {};
            for (const sumField of Object.keys(args._sum)) {
              groupObj._sum[sumField] = 0n;
            }
          }
          groupsMap.set(key, groupObj);
        }

        const groupObj = groupsMap.get(key);
        if (args._sum) {
          for (const sumField of Object.keys(args._sum)) {
            const val = item[sumField];
            if (val !== undefined && val !== null) {
              groupObj._sum[sumField] = BigInt(groupObj._sum[sumField]) + BigInt(val.toString());
            }
          }
        }
      }

      return Array.from(groupsMap.values());
    },
    aggregate: async (args: any) => {
      const where = buildWhere(schemaObj, args?.where);
      const res = await db.select().from(schemaObj).where(where);
      const items = res.map(convertDates);
      
      const result: any = {};
      if (args._sum) {
        result._sum = {};
        for (const sumField of Object.keys(args._sum)) {
          let sumVal = 0n;
          for (const item of items) {
            const val = item[sumField];
            if (val !== undefined && val !== null) {
              sumVal += BigInt(val.toString());
            }
          }
          result._sum[sumField] = sumVal;
        }
      }
      if (args._count) {
        result._count = items.length;
      }
      return result;
    }
  };
}


const prismaAdapter = {
  $transaction: async (queries: Promise<any>[]) => {
    return Promise.all(queries); // Basic mock for sqlite without complex tx mapping
  },
  user: createModelAdapter("user"),
  folder: createModelAdapter("folder"),
  file: createModelAdapter("file"),
  apiKey: createModelAdapter("apiKey"),
  uploadRoutingPolicy: createModelAdapter("uploadRoutingPolicy"),
  connectedAccount: createModelAdapter("connectedAccount"),
  localStorageConfig: createModelAdapter("localStorageConfig"),
  storageAccount: createModelAdapter("storageAccount"),
  auditLog: createModelAdapter("auditLog"),
  fileShare: createModelAdapter("fileShare"),
  filePreviewToken: createModelAdapter("filePreviewToken"),
  uploadSession: createModelAdapter("uploadSession"),
  workspaceInvite: createModelAdapter("workspaceInvite"),
  autoTieringRule: createModelAdapter("autoTieringRule"),
  messengerIntegration: createModelAdapter("messengerIntegration"),
  databaseBackupSchedule: createModelAdapter("databaseBackupSchedule"),
  cctvCamera: createModelAdapter("cctvCamera"),
  providerConfig: createModelAdapter("providerConfig"),
  s3StorageConfig: createModelAdapter("s3StorageConfig"),
  userSession: createModelAdapter("userSession"),
  authHandoff: createModelAdapter("authHandoff"),
};

export default prismaAdapter as any;