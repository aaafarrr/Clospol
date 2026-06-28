import { sqliteTable, AnySQLiteColumn, uniqueIndex, text, numeric, index, foreignKey, integer } from "drizzle-orm/sqlite-core"
  import { sql } from "drizzle-orm"

export const users = sqliteTable("users", {
	id: text().primaryKey().notNull(),
	email: text().notNull(),
	passwordHash: text(),
	name: text().notNull(),
	createdAt: numeric().default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric().notNull(),
},
(table) => [
	uniqueIndex("users_email_key").on(table.email),
]);

export const apiKeys = sqliteTable("api_keys", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	name: text().notNull(),
	keyPrefix: text("key_prefix").notNull(),
	keyHash: text("key_hash").notNull(),
	scopes: text().notNull(),
	status: text().default("active").notNull(),
	lastUsedAt: numeric("last_used_at"),
	expiresAt: numeric("expires_at"),
	revokedAt: numeric("revoked_at"),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
},
(table) => [
	index("api_keys_user_id_status_created_at_idx").on(table.userId, table.status, table.createdAt),
	uniqueIndex("api_keys_key_hash_key").on(table.keyHash),
]);

export const uploadRoutingPolicies = sqliteTable("upload_routing_policies", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	mode: text().default("most_available").notNull(),
	priorityAccountIds: text("priority_account_ids").notNull(),
	roundRobinCursor: integer("round_robin_cursor").default(0).notNull(),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
},
(table) => [
	uniqueIndex("upload_routing_policies_user_id_key").on(table.userId),
]);

export const userSessions = sqliteTable("user_sessions", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	refreshTokenHash: text("refresh_token_hash").notNull(),
	userAgent: text("user_agent"),
	ipAddress: text("ip_address"),
	expiresAt: numeric("expires_at").notNull(),
	revokedAt: numeric("revoked_at"),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
},
(table) => [
	index("user_sessions_refresh_token_hash_idx").on(table.refreshTokenHash),
]);

export const authHandoffs = sqliteTable("auth_handoffs", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	tokenHash: text("token_hash").notNull(),
	expiresAt: numeric("expires_at").notNull(),
	usedAt: numeric("used_at"),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
},
(table) => [
	uniqueIndex("auth_handoffs_token_hash_key").on(table.tokenHash),
]);

export const providerConfigs = sqliteTable("provider_configs", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	provider: text().notNull(),
	clientIdEncrypted: text("client_id_encrypted").notNull(),
	clientSecretEncrypted: text("client_secret_encrypted").notNull(),
	redirectUri: text("redirect_uri").notNull(),
	scopes: text().notNull(),
	status: text().default("active").notNull(),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
},
(table) => [
	index("provider_configs_provider_idx").on(table.provider),
]);

export const connectedAccounts = sqliteTable("connected_accounts", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	providerConfigId: text("provider_config_id").references(() => providerConfigs.id, { onDelete: "set null", onUpdate: "cascade" } ),
	provider: text().notNull(),
	providerAccountId: text("provider_account_id").notNull(),
	email: text().notNull(),
	displayName: text("display_name"),
	avatarUrl: text("avatar_url"),
	accessTokenEncrypted: text("access_token_encrypted"),
	refreshTokenEncrypted: text("refresh_token_encrypted"),
	tokenExpiresAt: numeric("token_expires_at"),
	scopes: text().notNull(),
	status: text().default("connected").notNull(),
	lastError: text("last_error"),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
},
(table) => [
	uniqueIndex("connected_accounts_user_id_provider_provider_account_id_key").on(table.userId, table.provider, table.providerAccountId),
	index("connected_accounts_user_id_status_created_at_idx").on(table.userId, table.status, table.createdAt),
]);

export const s3StorageConfigs = sqliteTable("s3_storage_configs", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	connectedAccountId: text("connected_account_id").notNull().references(() => connectedAccounts.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	name: text().notNull(),
	bucket: text().notNull(),
	region: text().notNull(),
	endpoint: text(),
	accessKeyIdEncrypted: text("access_key_id_encrypted").notNull(),
	secretAccessKeyEncrypted: text("secret_access_key_encrypted").notNull(),
	forcePathStyle: numeric("force_path_style").notNull(),
	prefix: text().default("clospol").notNull(),
	quotaBytes: integer("quota_bytes"),
	status: text().default("active").notNull(),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
},
(table) => [
	index("s3_storage_configs_user_id_status_idx").on(table.userId, table.status),
	uniqueIndex("s3_storage_configs_connected_account_id_key").on(table.connectedAccountId),
]);

export const localStorageConfigs = sqliteTable("local_storage_configs", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	connectedAccountId: text("connected_account_id").notNull().references(() => connectedAccounts.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	name: text().notNull(),
	serverPath: text("server_path").notNull(),
	quotaBytes: integer("quota_bytes"),
	status: text().default("active").notNull(),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
},
(table) => [
	index("local_storage_configs_user_id_status_idx").on(table.userId, table.status),
	uniqueIndex("local_storage_configs_connected_account_id_key").on(table.connectedAccountId),
]);

export const storageAccounts = sqliteTable("storage_accounts", {
	id: text().primaryKey().notNull(),
	connectedAccountId: text("connected_account_id").notNull().references(() => connectedAccounts.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	totalBytes: integer("total_bytes"),
	usedBytes: integer("used_bytes").default(0).notNull(),
	availableBytes: integer("available_bytes"),
	trashBytes: integer("trash_bytes"),
	lastSyncedAt: numeric("last_synced_at"),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
},
(table) => [
	uniqueIndex("storage_accounts_connected_account_id_key").on(table.connectedAccountId),
]);

export const folders = sqliteTable("folders", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	parentId: text("parent_id"),
	connectedAccountId: text("connected_account_id").references(() => connectedAccounts.id, { onDelete: "set null", onUpdate: "cascade" } ),
	provider: text().default("google_drive").notNull(),
	providerFolderId: text("provider_folder_id"),
	name: text().notNull(),
	color: text().default("text-blue-500").notNull(),
	iconUrl: text("icon_url"),
	isStarred: numeric("is_starred").notNull(),
	deletedAt: numeric("deleted_at"),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
},
(table) => [
	index("folders_user_id_deleted_at_parent_id_updated_at_idx").on(table.userId, table.deletedAt, table.parentId, table.updatedAt),
	index("folders_user_id_deleted_at_updated_at_idx").on(table.userId, table.deletedAt, table.updatedAt),
	foreignKey(() => ({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "folders_parent_id_folders_id_fk"
		})).onUpdate("cascade").onDelete("set null"),
]);

export const files = sqliteTable("files", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	connectedAccountId: text("connected_account_id").notNull().references(() => connectedAccounts.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	folderId: text("folder_id").references(() => folders.id, { onDelete: "set null", onUpdate: "cascade" } ),
	provider: text().notNull(),
	providerFileId: text("provider_file_id").notNull(),
	name: text().notNull(),
	mimeType: text("mime_type").notNull(),
	sizeBytes: integer("size_bytes").notNull(),
	checksum: text(),
	status: text().default("active").notNull(),
	isStarred: numeric("is_starred").notNull(),
	deletedAt: numeric("deleted_at"),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
},
(table) => [
	index("files_provider_file_id_idx").on(table.providerFileId),
	index("files_user_id_status_folder_id_created_at_idx").on(table.userId, table.status, table.folderId, table.createdAt),
	index("files_user_id_status_created_at_idx").on(table.userId, table.status, table.createdAt),
]);

export const fileShares = sqliteTable("file_shares", {
	id: text().primaryKey().notNull(),
	fileId: text("file_id").references(() => files.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	folderId: text("folder_id").references(() => folders.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	token: text(),
	tokenHash: text("token_hash").notNull(),
	enabled: numeric().default("1").notNull(),
	maxDownloads: integer("max_downloads"),
	downloadCount: integer("download_count").default(0).notNull(),
	expiresAt: numeric("expires_at"),
	passwordHash: text("password_hash"),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
},
(table) => [
	index("file_shares_file_id_user_id_enabled_created_at_idx").on(table.fileId, table.userId, table.enabled, table.createdAt),
	index("file_shares_folder_id_idx").on(table.folderId),
	index("file_shares_user_id_enabled_created_at_idx").on(table.userId, table.enabled, table.createdAt),
	uniqueIndex("file_shares_token_hash_key").on(table.tokenHash),
	uniqueIndex("file_shares_token_key").on(table.token),
]);

export const filePreviewTokens = sqliteTable("file_preview_tokens", {
	id: text().primaryKey().notNull(),
	fileId: text("file_id").notNull().references(() => files.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	tokenHash: text("token_hash").notNull(),
	expiresAt: numeric("expires_at").notNull(),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
},
(table) => [
	uniqueIndex("file_preview_tokens_token_hash_key").on(table.tokenHash),
]);

export const uploadSessions = sqliteTable("upload_sessions", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	targetConnectedAccountId: text("target_connected_account_id"),
	fileName: text("file_name").notNull(),
	mimeType: text("mime_type").notNull(),
	sizeBytes: integer("size_bytes").notNull(),
	status: text().notNull(),
	errorMessage: text("error_message"),
	completedAt: numeric("completed_at"),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	action: text().notNull(),
	entityType: text("entity_type").notNull(),
	entityId: text("entity_id"),
	metadata: text(),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});

export const workspaceInvites = sqliteTable("workspace_invites", {
	id: text().primaryKey().notNull(),
	inviterId: text("inviter_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	inviteeEmail: text("invitee_email").notNull(),
	targetType: text("target_type").default("file").notNull(),
	targetId: text("target_id").notNull(),
	role: text().default("viewer").notNull(),
	status: text().default("pending").notNull(),
	revokedAt: numeric("revoked_at"),
	acceptedAt: numeric("accepted_at"),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
},
(table) => [
	uniqueIndex("workspace_invites_inviter_id_invitee_email_target_type_target_id_key").on(table.inviterId, table.inviteeEmail, table.targetType, table.targetId),
	index("workspace_invites_target_type_target_id_idx").on(table.targetType, table.targetId),
	index("workspace_invites_invitee_email_idx").on(table.inviteeEmail),
]);

export const autoTieringRules = sqliteTable("auto_tiering_rules", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	name: text().notNull(),
	sourceAccountId: text("source_account_id").notNull(),
	targetAccountId: text("target_account_id").notNull(),
	ruleConditions: text().notNull(),
	ruleAction: text("rule_action").notNull(),
	status: text().default("active").notNull(),
	lastRunAt: numeric("last_run_at"),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
});

export const messengerIntegrations = sqliteTable("messenger_integrations", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	provider: text().notNull(),
	integrationName: text("integration_name").notNull(),
	status: text().notNull(),
	isActive: numeric("is_active").default("1").notNull(),
	botTokenEncrypted: text("bot_token_encrypted").notNull(),
	sessionId: text("session_id"),
	lastError: text("last_error"),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
});

export const databaseBackupSchedules = sqliteTable("database_backup_schedules", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	name: text().default("Database Backup").notNull(),
	driver: text().default("sqlite").notNull(),
	host: text().default("localhost"),
	port: integer().default(0),
	database: text().default("dev.db").notNull(),
	username: text().default(""),
	passwordEncrypted: text("password_encrypted"),
	headersEncrypted: text("headers_encrypted"),
	cronExpression: text("cron_expression").default("0 0 * * *").notNull(),
	retentionDays: integer("retention_days").default(7).notNull(),
	backupFrequency: text("backup_frequency").notNull(),
	destinationProvider: text("destination_provider").notNull(),
	destinationAccountId: text("destination_account_id").notNull(),
	lastBackupAt: numeric("last_backup_at"),
	lastBackupStatus: text("last_backup_status"),
	lastBackupError: text("last_backup_error"),
	status: text().default("active").notNull(),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
});

export const cctvCameras = sqliteTable("cctv_cameras", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	connectedAccountId: text("connected_account_id"),
	name: text().notNull(),
	streamUrl: text("stream_url").notNull(),
	snapshotUrl: text("snapshot_url"),
	snapshotHeaders: text("snapshot_headers"),
	recordStream: numeric("record_stream").notNull(),
	recordInterval: integer("record_interval").default(5).notNull(),
	retentionDays: integer("retention_days").default(7).notNull(),
	scheduleCron: text("schedule_cron"),
	status: text().default("active").notNull(),
	lastCaptureAt: numeric("last_capture_at"),
	lastCaptureStatus: text("last_capture_status"),
	lastCaptureError: text("last_capture_error"),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").notNull(),
});

