import { relations } from "drizzle-orm/relations";
import { users, apiKeys, uploadRoutingPolicies, userSessions, authHandoffs, providerConfigs, connectedAccounts, s3StorageConfigs, localStorageConfigs, storageAccounts, folders, files, fileShares, filePreviewTokens, uploadSessions, auditLogs, workspaceInvites, autoTieringRules, messengerIntegrations, databaseBackupSchedules, cctvCameras } from "./schema";

export const apiKeysRelations = relations(apiKeys, ({one}) => ({
	user: one(users, {
		fields: [apiKeys.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	apiKeys: many(apiKeys),
	uploadRoutingPolicies: many(uploadRoutingPolicies),
	userSessions: many(userSessions),
	authHandoffs: many(authHandoffs),
	providerConfigs: many(providerConfigs),
	connectedAccounts: many(connectedAccounts),
	s3StorageConfigs: many(s3StorageConfigs),
	localStorageConfigs: many(localStorageConfigs),
	folders: many(folders),
	files: many(files),
	fileShares: many(fileShares),
	filePreviewTokens: many(filePreviewTokens),
	uploadSessions: many(uploadSessions),
	auditLogs: many(auditLogs),
	workspaceInvites: many(workspaceInvites),
	autoTieringRules: many(autoTieringRules),
	messengerIntegrations: many(messengerIntegrations),
	databaseBackupSchedules: many(databaseBackupSchedules),
	cctvCameras: many(cctvCameras),
}));

export const uploadRoutingPoliciesRelations = relations(uploadRoutingPolicies, ({one}) => ({
	user: one(users, {
		fields: [uploadRoutingPolicies.userId],
		references: [users.id]
	}),
}));

export const userSessionsRelations = relations(userSessions, ({one}) => ({
	user: one(users, {
		fields: [userSessions.userId],
		references: [users.id]
	}),
}));

export const authHandoffsRelations = relations(authHandoffs, ({one}) => ({
	user: one(users, {
		fields: [authHandoffs.userId],
		references: [users.id]
	}),
}));

export const providerConfigsRelations = relations(providerConfigs, ({one, many}) => ({
	user: one(users, {
		fields: [providerConfigs.userId],
		references: [users.id]
	}),
	connectedAccounts: many(connectedAccounts),
}));

export const connectedAccountsRelations = relations(connectedAccounts, ({one, many}) => ({
	providerConfig: one(providerConfigs, {
		fields: [connectedAccounts.providerConfigId],
		references: [providerConfigs.id]
	}),
	user: one(users, {
		fields: [connectedAccounts.userId],
		references: [users.id]
	}),
	s3StorageConfigs: many(s3StorageConfigs),
	localStorageConfigs: many(localStorageConfigs),
	storageAccounts: many(storageAccounts),
	folders: many(folders),
	files: many(files),
}));

export const s3StorageConfigsRelations = relations(s3StorageConfigs, ({one}) => ({
	connectedAccount: one(connectedAccounts, {
		fields: [s3StorageConfigs.connectedAccountId],
		references: [connectedAccounts.id]
	}),
	user: one(users, {
		fields: [s3StorageConfigs.userId],
		references: [users.id]
	}),
}));

export const localStorageConfigsRelations = relations(localStorageConfigs, ({one}) => ({
	connectedAccount: one(connectedAccounts, {
		fields: [localStorageConfigs.connectedAccountId],
		references: [connectedAccounts.id]
	}),
	user: one(users, {
		fields: [localStorageConfigs.userId],
		references: [users.id]
	}),
}));

export const storageAccountsRelations = relations(storageAccounts, ({one}) => ({
	connectedAccount: one(connectedAccounts, {
		fields: [storageAccounts.connectedAccountId],
		references: [connectedAccounts.id]
	}),
}));

export const foldersRelations = relations(folders, ({one, many}) => ({
	connectedAccount: one(connectedAccounts, {
		fields: [folders.connectedAccountId],
		references: [connectedAccounts.id]
	}),
	folder: one(folders, {
		fields: [folders.parentId],
		references: [folders.id],
		relationName: "folders_parentId_folders_id"
	}),
	folders: many(folders, {
		relationName: "folders_parentId_folders_id"
	}),
	user: one(users, {
		fields: [folders.userId],
		references: [users.id]
	}),
	files: many(files),
}));

export const filesRelations = relations(files, ({one, many}) => ({
	folder: one(folders, {
		fields: [files.folderId],
		references: [folders.id]
	}),
	connectedAccount: one(connectedAccounts, {
		fields: [files.connectedAccountId],
		references: [connectedAccounts.id]
	}),
	user: one(users, {
		fields: [files.userId],
		references: [users.id]
	}),
	fileShares: many(fileShares),
	filePreviewTokens: many(filePreviewTokens),
}));

export const fileSharesRelations = relations(fileShares, ({one}) => ({
	user: one(users, {
		fields: [fileShares.userId],
		references: [users.id]
	}),
	file: one(files, {
		fields: [fileShares.fileId],
		references: [files.id]
	}),
	folder: one(folders, {
		fields: [fileShares.folderId],
		references: [folders.id]
	}),
}));

export const filePreviewTokensRelations = relations(filePreviewTokens, ({one}) => ({
	user: one(users, {
		fields: [filePreviewTokens.userId],
		references: [users.id]
	}),
	file: one(files, {
		fields: [filePreviewTokens.fileId],
		references: [files.id]
	}),
}));

export const uploadSessionsRelations = relations(uploadSessions, ({one}) => ({
	user: one(users, {
		fields: [uploadSessions.userId],
		references: [users.id]
	}),
}));

export const auditLogsRelations = relations(auditLogs, ({one}) => ({
	user: one(users, {
		fields: [auditLogs.userId],
		references: [users.id]
	}),
}));

export const workspaceInvitesRelations = relations(workspaceInvites, ({one}) => ({
	user: one(users, {
		fields: [workspaceInvites.inviterId],
		references: [users.id]
	}),
}));

export const autoTieringRulesRelations = relations(autoTieringRules, ({one}) => ({
	user: one(users, {
		fields: [autoTieringRules.userId],
		references: [users.id]
	}),
}));

export const messengerIntegrationsRelations = relations(messengerIntegrations, ({one}) => ({
	user: one(users, {
		fields: [messengerIntegrations.userId],
		references: [users.id]
	}),
}));

export const databaseBackupSchedulesRelations = relations(databaseBackupSchedules, ({one}) => ({
	user: one(users, {
		fields: [databaseBackupSchedules.userId],
		references: [users.id]
	}),
}));

export const cctvCamerasRelations = relations(cctvCameras, ({one}) => ({
	user: one(users, {
		fields: [cctvCameras.userId],
		references: [users.id]
	}),
}));