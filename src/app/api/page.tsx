"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/layout/sidebar";
import { useToast } from "@/components/providers/toast-provider";

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  status: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const [secretKey, setSecretKey] = useState<string | null>(null);

  // Copy Feedback States
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [copiedHeader, setCopiedHeader] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Modals & Forms
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  // Customizable Key Settings
  const [expiryOption, setExpiryOption] = useState("never");
  const [customExpiry, setCustomExpiry] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["files:upload"]);

  // Key details & Usage Logs state
  const [activeDetailKey, setActiveDetailKey] = useState<ApiKeyItem | null>(null);
  const [keyLogs, setKeyLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Documentation Active Tab State
  const [activeDocTab, setActiveDocTab] = useState("endpoints");
  const [activeSubAction, setActiveSubAction] = useState("upload");
  const [expandedDocAction, setExpandedDocAction] = useState<string | null>(null);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/api-keys");
      const data = await res.json();
      setApiKeys(data.apiKeys || []);
    } catch (err) {
      console.error("Failed to load API keys:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchKeyLogs = async () => {
    if (!activeDetailKey) return;
    setLogsLoading(true);
    try {
      const res = await fetch("/api/activity/logs?limit=500");
      const data = await res.json();
      const allLogs = data.logs || [];
      const filtered = allLogs.filter(
        (log: any) => log.metadata?.apiKeyId === activeDetailKey.id
      );
      setKeyLogs(filtered);
    } catch (err) {
      console.error("Failed to load key logs:", err);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  useEffect(() => {
    if (activeDetailKey) {
      fetchKeyLogs();
    } else {
      setKeyLogs([]);
    }
  }, [activeDetailKey]);

  const openCreateModal = () => {
    setNewKeyName("");
    setExpiryOption("never");
    setCustomExpiry("");
    setSelectedScopes(["files:upload"]);
    setCreateLoading(false);
    setIsModalOpen(true);
  };

  const createKey = async () => {
    const name = newKeyName.trim();
    if (!name) return;

    let calculatedExpiry: string | null = null;
    if (expiryOption === "7") {
      calculatedExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (expiryOption === "30") {
      calculatedExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (expiryOption === "90") {
      calculatedExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    } else if (expiryOption === "custom" && customExpiry) {
      calculatedExpiry = new Date(customExpiry).toISOString();
    }

    setCreateLoading(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name,
          expiresAt: calculatedExpiry,
          scopes: selectedScopes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Creating key failed.");

      setIsModalOpen(false);
      setSecretKey(data.secret);
      loadKeys();
      toast.success("API Key generated successfully. Please copy the secret key below.");
    } catch (err: any) {
      toast.error(err.message || "Failed to create API key.");
    } finally {
      setCreateLoading(false);
    }
  };

  const copySecret = () => {
    if (secretKey) {
      navigator.clipboard.writeText(secretKey).then(() => {
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      });
    }
  };

  const copyText = (text: string, type: "endpoint" | "header" | "code") => {
    navigator.clipboard.writeText(text).then(() => {
      if (type === "endpoint") {
        setCopiedEndpoint(true);
        setTimeout(() => setCopiedEndpoint(false), 2000);
      } else if (type === "header") {
        setCopiedHeader(true);
        setTimeout(() => setCopiedHeader(false), 2000);
      } else if (type === "code") {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      }
    });
  };

  const revokeKey = async (id: string) => {
    if (!window.confirm("Are you sure you want to revoke this API key? This cannot be undone.")) return;

    try {
      const res = await fetch(`/api/api-keys/${id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) throw new Error("Revocation failed");

      loadKeys();
      toast.success("API Key revoked successfully.");
    } catch (err) {
      toast.error("Failed to revoke key.");
    }
  };

  const activeKeysCount = apiKeys.filter((k) => k.status === "active").length;
  const usedKeysCount = apiKeys.filter((k) => k.lastUsedAt).length;

  const docExamples: Record<string, { 
    title: string; 
    scope: string; 
    endpoint: string; 
    method: string; 
    js: string; 
    curl: string; 
    response: string;
    params?: Array<{
      name: string;
      type: "query" | "body" | "path";
      dataType: string;
      required: boolean;
      description: string;
    }>;
  }> = {
    upload: {
      title: "Upload File",
      scope: "files:upload",
      endpoint: "/api/v1/uploads",
      method: "POST",
      js: `// 1. Prepare file and payload
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];

const form = new FormData();
form.append('filesMeta', JSON.stringify([
  { 
    fieldName: 'file-0', 
    fileName: file.name, 
    mimeType: file.type || 'application/octet-stream', 
    sizeBytes: file.size.toString() 
  }
]));
form.append('file-0', file);
// Optional: specify folderId to upload to a specific folder
// form.append('folderId', 'your-folder-uuid');

// 2. Perform API Upload request
const res = await fetch(\`\${window.location.origin}/api/v1/uploads\`, {
  method: 'POST',
  headers: { 
    'Authorization': 'Bearer 9d_live_your_secret_key' 
  },
  body: form
});
const data = await res.json();
console.log('Upload success:', data.file);`,
      curl: `curl -X POST \\
  -H "Authorization: Bearer 9d_live_your_secret_key" \\
  -F "filesMeta=[{\\"fieldName\\":\\"file-0\\",\\"fileName\\":\\"photo.jpg\\",\\"mimeType\\":\\"image/jpeg\\"}]" \\
  -F "file-0=@/path/to/photo.jpg" \\
  -F "folderId=optional-folder-uuid" \\
  http://localhost:3000/api/v1/uploads`,
      response: `{
  "success": true,
  "message": "File uploaded successfully",
  "file": {
    "id": "e2d534b1-8409-4c07-b371-3312e09ff7b2",
    "name": "photo.jpg",
    "mimeType": "image/jpeg",
    "sizeBytes": "204800",
    "provider": "local",
    "status": "active"
  }
}`,
      params: [
        { name: "file", type: "body", dataType: "File (Binary)", required: true, description: "The raw binary file content." },
        { name: "filesMeta", type: "body", dataType: "string (JSON array)", required: true, description: "JSON metadata array mapping names/types of files, e.g. [{'fieldName': 'file-0', 'fileName': '...', 'mimeType': '...'}]" },
        { name: "folderId", type: "body", dataType: "string (UUID)", required: false, description: "Destination folder ID. If omitted, file is placed in root directory." }
      ]
    },
    list: {
      title: "List Files",
      scope: "files:read",
      endpoint: "/api/files",
      method: "GET",
      js: `// Fetch list of active files in your drive
// Optional query param: folderId (returns files inside folder)
const folderId = 'optional-folder-uuid';
const res = await fetch(\`\${window.location.origin}/api/files?folderId=\${folderId}\`, {
  method: 'GET',
  headers: { 
    'Authorization': 'Bearer 9d_live_your_secret_key' 
  }
});
const data = await res.json();
console.log('My Files:', data.files);`,
      curl: `curl -X GET \\
  -H "Authorization: Bearer 9d_live_your_secret_key" \\
  "http://localhost:3000/api/files?folderId=optional-folder-uuid"`,
      response: `{
  "files": [
    {
      "id": "e2d534b1-8409-4c07-b371-3312e09ff7b2",
      "name": "photo.jpg",
      "mimeType": "image/jpeg",
      "sizeBytes": "204800",
      "status": "active",
      "createdAt": "2026-06-20T22:30:00Z"
    }
  ]
}`,
      params: [
        { name: "folderId", type: "query", dataType: "string (UUID)", required: false, description: "Folder UUID to filter active files. If omitted or empty, returns files in root directory." }
      ]
    },
    download: {
      title: "Download File",
      scope: "files:read",
      endpoint: "/api/files/[id]/download",
      method: "GET",
      js: `// Download file stream using file ID
const fileId = "e2d534b1-8409-4c07-b371-3312e09ff7b2";
const res = await fetch(\`\${window.location.origin}/api/files/\${fileId}/download\`, {
  method: 'GET',
  headers: { 
    'Authorization': 'Bearer 9d_live_your_secret_key' 
  }
});

if (res.ok) {
  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = "downloaded_file.jpg";
  document.body.appendChild(a);
  a.click();
  a.remove();
}`,
      curl: `curl -X GET \\
  -H "Authorization: Bearer 9d_live_your_secret_key" \\
  -o "photo.jpg" \\
  http://localhost:3000/api/files/e2d534b1-8409-4c07-b371-3312e09ff7b2/download`,
      response: `(Binary Stream Data)`,
      params: [
        { name: "id", type: "path", dataType: "string (UUID)", required: true, description: "The UUID of the file to retrieve/stream." },
        { name: "inline", type: "query", dataType: "boolean", required: false, description: "If true, serves file inline (Content-Disposition: inline) for previewing/streaming instead of download." }
      ]
    },
    rename_file: {
      title: "Rename / Move File",
      scope: "files:upload",
      endpoint: "/api/files/[id]",
      method: "PATCH",
      js: `// Rename a file and/or change its parent folder
const fileId = "e2d534b1-8409-4c07-b371-3312e09ff7b2";
const res = await fetch(\`\${window.location.origin}/api/files/\${fileId}\`, {
  method: 'PATCH',
  headers: { 
    'Authorization': 'Bearer 9d_live_your_secret_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: "new_filename.jpg",       // Optional
    folderId: "target-folder-uuid" // Optional (pass null to move to root)
  })
});
const data = await res.json();
console.log('Update success:', data.file);`,
      curl: `curl -X PATCH \\
  -H "Authorization: Bearer 9d_live_your_secret_key" \\
  -H "Content-Type: application/json" \\
  -d "{\\"name\\":\\"new_filename.jpg\\",\\"folderId\\":\\"target-folder-uuid\\"}" \\
  http://localhost:3000/api/files/e2d534b1-8409-4c07-b371-3312e09ff7b2`,
      response: `{
  "file": {
    "id": "e2d534b1-8409-4c07-b371-3312e09ff7b2",
    "name": "new_filename.jpg",
    "folderId": "target-folder-uuid",
    "sizeBytes": "204800",
    "status": "active"
  }
}`,
      params: [
        { name: "id", type: "path", dataType: "string (UUID)", required: true, description: "The UUID of the file to modify." },
        { name: "name", type: "body", dataType: "string", required: false, description: "New name of the file (including standard extension)." },
        { name: "folderId", type: "body", dataType: "string (UUID) | null", required: false, description: "UUID of destination folder. Pass null or empty string to relocate/move to root folder." }
      ]
    },
    copy: {
      title: "Copy File",
      scope: "files:upload",
      endpoint: "/api/files/[id]/copy",
      method: "POST",
      js: `// Create a copy of the file on physical disk and database
const fileId = "e2d534b1-8409-4c07-b371-3312e09ff7b2";
const res = await fetch(\`\${window.location.origin}/api/files/\${fileId}/copy\`, {
  method: 'POST',
  headers: { 
    'Authorization': 'Bearer 9d_live_your_secret_key'
  }
});
const data = await res.json();
console.log('Copy success:', data.file);`,
      curl: `curl -X POST \\
  -H "Authorization: Bearer 9d_live_your_secret_key" \\
  http://localhost:3000/api/files/e2d534b1-8409-4c07-b371-3312e09ff7b2/copy`,
      response: `{
  "file": {
    "id": "c9a01b22-8409-4c07-b371-3312e09ff7b2",
    "name": "photo - Copy.jpg",
    "mimeType": "image/jpeg",
    "sizeBytes": "204800",
    "status": "active"
  }
}`,
      params: [
        { name: "id", type: "path", dataType: "string (UUID)", required: true, description: "The UUID of the file you want to copy." }
      ]
    },
    relocate: {
      title: "Relocate Storage",
      scope: "files:upload",
      endpoint: "/api/files/[id]/relocate",
      method: "POST",
      js: `// Move a file physically to another storage provider/account
const fileId = "e2d534b1-8409-4c07-b371-3312e09ff7b2";
const res = await fetch(\`\${window.location.origin}/api/files/\${fileId}/relocate\`, {
  method: 'POST',
  headers: { 
    'Authorization': 'Bearer 9d_live_your_secret_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    targetAccountId: "target-storage-account-uuid"
  })
});
const data = await res.json();
console.log('Relocation message:', data.message);`,
      curl: `curl -X POST \\
  -H "Authorization: Bearer 9d_live_your_secret_key" \\
  -H "Content-Type: application/json" \\
  -d "{\\"targetAccountId\\":\\"target-storage-account-uuid\\"}" \\
  http://localhost:3000/api/files/e2d534b1-8409-4c07-b371-3312e09ff7b2/relocate`,
      response: `{
  "message": "File \\"photo.jpg\\" relocated successfully to Google Drive.",
  "file": {
    "id": "e2d534b1-8409-4c07-b371-3312e09ff7b2",
    "connectedAccountId": "target-storage-account-uuid",
    "provider": "google_drive"
  }
}`,
      params: [
        { name: "id", type: "path", dataType: "string (UUID)", required: true, description: "The UUID of the file to migrate physically." },
        { name: "targetAccountId", type: "body", dataType: "string (UUID)", required: true, description: "UUID of the destination storage account registered in Clospol." }
      ]
    },
    star: {
      title: "Star / Unstar File",
      scope: "files:upload",
      endpoint: "/api/files/[id]/star",
      method: "POST",
      js: `// Toggle starred state on the file
const fileId = "e2d534b1-8409-4c07-b371-3312e09ff7b2";
const res = await fetch(\`\${window.location.origin}/api/files/\${fileId}/star\`, {
  method: 'POST',
  headers: { 
    'Authorization': 'Bearer 9d_live_your_secret_key'
  }
});
const data = await res.json();
console.log('Starred status:', data.isStarred);`,
      curl: `curl -X POST \\
  -H "Authorization: Bearer 9d_live_your_secret_key" \\
  http://localhost:3000/api/files/e2d534b1-8409-4c07-b371-3312e09ff7b2/star`,
      response: `{
  "status": "ok",
  "isStarred": true
}`,
      params: [
        { name: "id", type: "path", dataType: "string (UUID)", required: true, description: "The UUID of the file to toggle starred state." }
      ]
    },
    delete: {
      title: "Soft Delete (Trash)",
      scope: "files:delete",
      endpoint: "/api/files/[id]",
      method: "DELETE",
      js: `// Move a file to the Trash programmatically
const fileId = "e2d534b1-8409-4c07-b371-3312e09ff7b2";
const res = await fetch(\`\${window.location.origin}/api/files/\${fileId}\`, {
  method: 'DELETE',
  headers: { 
    'Authorization': 'Bearer 9d_live_your_secret_key' 
  }
});
const data = await res.json();
console.log('Delete success:', data.success);`,
      curl: `curl -X DELETE \\
  -H "Authorization: Bearer 9d_live_your_secret_key" \\
  http://localhost:3000/api/files/e2d534b1-8409-4c07-b371-3312e09ff7b2`,
      response: `{
  "success": true
}`,
      params: [
        { name: "id", type: "path", dataType: "string (UUID)", required: true, description: "The UUID of the file to move to trash." }
      ]
    },
    restore: {
      title: "Restore File",
      scope: "files:delete",
      endpoint: "/api/files/[id]/restore",
      method: "POST",
      js: `// Restore a soft-deleted file back to active files
const fileId = "e2d534b1-8409-4c07-b371-3312e09ff7b2";
const res = await fetch(\`\${window.location.origin}/api/files/\${fileId}/restore\`, {
  method: 'POST',
  headers: { 
    'Authorization': 'Bearer 9d_live_your_secret_key'
  }
});
const data = await res.json();
console.log('Restore status:', data.status);`,
      curl: `curl -X POST \\
  -H "Authorization: Bearer 9d_live_your_secret_key" \\
  http://localhost:3000/api/files/e2d534b1-8409-4c07-b371-3312e09ff7b2/restore`,
      response: `{
  "status": "ok"
}`,
      params: [
        { name: "id", type: "path", dataType: "string (UUID)", required: true, description: "The UUID of the soft-deleted file in trash to recover." }
      ]
    },
    permanent: {
      title: "Permanent Delete",
      scope: "files:delete",
      endpoint: "/api/files/[id]/permanent",
      method: "DELETE",
      js: `// Permanently delete a file from physical disk and database
const fileId = "e2d534b1-8409-4c07-b371-3312e09ff7b2";
const res = await fetch(\`\${window.location.origin}/api/files/\${fileId}/permanent\`, {
  method: 'DELETE',
  headers: { 
    'Authorization': 'Bearer 9d_live_your_secret_key'
  }
});
const data = await res.json();
console.log('Permanent delete status:', data.status);`,
      curl: `curl -X DELETE \\
  -H "Authorization: Bearer 9d_live_your_secret_key" \\
  http://localhost:3000/api/files/e2d534b1-8409-4c07-b371-3312e09ff7b2/permanent`,
      response: `{
  "status": "ok"
}`,
      params: [
        { name: "id", type: "path", dataType: "string (UUID)", required: true, description: "The UUID of the soft-deleted file in trash to delete permanently." }
      ]
    },
    list_folders: {
      title: "List Folders",
      scope: "files:read",
      endpoint: "/api/folders",
      method: "GET",
      js: `// Fetch folders list
// Optional query param: parentId (to browse child folders)
const parentId = "folder-uuid";
const res = await fetch(\`\${window.location.origin}/api/folders?parentId=\${parentId}\`, {
  method: 'GET',
  headers: { 
    'Authorization': 'Bearer 9d_live_your_secret_key'
  }
});
const data = await res.json();
console.log('Folders:', data.folders);
console.log('Breadcrumbs:', data.breadcrumbs);`,
      curl: `curl -X GET \\
  -H "Authorization: Bearer 9d_live_your_secret_key" \\
  "http://localhost:3000/api/folders?parentId=optional-parent-uuid"`,
      response: `{
  "folders": [
    {
      "id": "e2d534b1-8409-4c07-b371-3312e09ff7b2",
      "name": "Project Documents",
      "parentId": null,
      "color": "#3b82f6",
      "createdAt": "2026-06-20T22:30:00Z"
    }
  ],
  "breadcrumbs": [
    { "id": null, "name": "All Files" }
  ]
}`,
      params: [
        { name: "parentId", type: "query", dataType: "string (UUID)", required: false, description: "UUID of the parent folder to fetch child folders. If omitted/null, fetches root folders." },
        { name: "all", type: "query", dataType: "boolean", required: false, description: "If true, queries and returns all folders recursively instead of filtering by parent folder." }
      ]
    },
    create_folder: {
      title: "Create Folder",
      scope: "files:upload",
      endpoint: "/api/folders",
      method: "POST",
      js: `// Create a new folder
const res = await fetch(\`\${window.location.origin}/api/folders\`, {
  method: 'POST',
  headers: { 
    'Authorization': 'Bearer 9d_live_your_secret_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: "My New Album",
    parentId: "optional-parent-folder-uuid"
  })
});
const data = await res.json();
console.log('Created folder:', data.folder);`,
      curl: `curl -X POST \\
  -H "Authorization: Bearer 9d_live_your_secret_key" \\
  -H "Content-Type: application/json" \\
  -d "{\\"name\\":\\"My New Album\\",\\"parentId\\":\\"optional-parent-folder-uuid\\"}" \\
  http://localhost:3000/api/folders`,
      response: `{
  "folder": {
    "id": "e9a02b11-8409-4c07-b371-3312e09ff7b2",
    "name": "My New Album",
    "parentId": "optional-parent-folder-uuid",
    "color": "#3b82f6"
  }
}`,
      params: [
        { name: "name", type: "body", dataType: "string", required: true, description: "Label/name of the new folder." },
        { name: "parentId", type: "body", dataType: "string (UUID) | null", required: false, description: "Optional UUID of target parent folder. If null, folder will be created in root." }
      ]
    },
    rename_folder: {
      title: "Rename / Move Folder",
      scope: "files:upload",
      endpoint: "/api/folders/[id]",
      method: "PATCH",
      js: `// Rename a folder and/or move it into another folder
const folderId = "e2d534b1-8409-4c07-b371-3312e09ff7b2";
const res = await fetch(\`\${window.location.origin}/api/folders/\${folderId}\`, {
  method: 'PATCH',
  headers: { 
    'Authorization': 'Bearer 9d_live_your_secret_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: "Renamed Folder Name",       // Optional
    parentId: "new-parent-folder-uuid" // Optional (pass null or empty to move to root)
  })
});
const data = await res.json();
console.log('Folder update details:', data.folder);`,
      curl: `curl -X PATCH \\
  -H "Authorization: Bearer 9d_live_your_secret_key" \\
  -H "Content-Type: application/json" \\
  -d "{\\"name\\":\\"Renamed Folder Name\\",\\"parentId\\":\\"new-parent-folder-uuid\\"}" \\
  http://localhost:3000/api/folders/e2d534b1-8409-4c07-b371-3312e09ff7b2`,
      response: `{
  "folder": {
    "id": "e2d534b1-8409-4c07-b371-3312e09ff7b2",
    "name": "Renamed Folder Name",
    "parentId": "new-parent-folder-uuid",
    "color": "#3b82f6"
  }
}`,
      params: [
        { name: "id", type: "path", dataType: "string (UUID)", required: true, description: "The UUID of the folder to edit/move." },
        { name: "name", type: "body", dataType: "string", required: false, description: "New display label for the folder." },
        { name: "parentId", type: "body", dataType: "string (UUID) | null", required: false, description: "New parent folder ID (for nesting). Pass null/empty to move back to root files." },
        { name: "color", type: "body", dataType: "string (hex)", required: false, description: "Hex color value (e.g. #ef4444) for folder visual custom style." }
      ]
    },
    delete_folder: {
      title: "Delete Folder",
      scope: "files:delete",
      endpoint: "/api/folders/[id]",
      method: "DELETE",
      js: `// Soft delete a folder and all its contents (files and subfolders)
const folderId = "e2d534b1-8409-4c07-b371-3312e09ff7b2";
const res = await fetch(\`\${window.location.origin}/api/folders/\${folderId}\`, {
  method: 'DELETE',
  headers: { 
    'Authorization': 'Bearer 9d_live_your_secret_key'
  }
});
const data = await res.json();
console.log('Delete status:', data.status);`,
      curl: `curl -X DELETE \\
  -H "Authorization: Bearer 9d_live_your_secret_key" \\
  http://localhost:3000/api/folders/e2d534b1-8409-4c07-b371-3312e09ff7b2`,
      response: `{
  "status": "ok"
}`,
      params: [
        { name: "id", type: "path", dataType: "string (UUID)", required: true, description: "The UUID of the folder to soft delete (including subfolders and files nested)." }
      ]
    }
  };

  const activeExample = docExamples[activeSubAction] || docExamples.upload;
  const errorResponseExample = `{
  "error": "Forbidden: scope 'files:upload' is required"
}`;


  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">API Management</h1>
            <p className="text-xs font-semibold text-slate-400 mt-1">
              Generate API upload keys to send files to your Clospol storage from external applications
            </p>
          </div>
          <div>
            <button
              onClick={openCreateModal}
              className="flex h-10 items-center gap-2 rounded-xl bg-slate-800 dark:bg-slate-700 px-4 text-sm font-bold text-white hover:bg-slate-900 dark:hover:bg-slate-800 shadow-lg shadow-slate-900/10 transition cursor-pointer"
            >
              <i className="fa-solid fa-plus text-xs"></i>
              Create API Key
            </button>
          </div>
        </div>



        {/* One-Time Secret Display Card */}
        {secretKey && (
          <div className="relative overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-amber-100/30 dark:border-amber-900/40 dark:from-amber-950/20 dark:to-slate-900/50 p-6 shadow-md shadow-amber-500/5 space-y-4 animate-in slide-in-from-top-4 duration-300">
            {/* Subtle background glow */}
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-400/10 blur-3xl pointer-events-none"></div>
            
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/20">
                <i className="fa-solid fa-triangle-exclamation text-lg"></i>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-black text-amber-950 dark:text-amber-200 flex items-center gap-2 flex-wrap">
                  <span>Save Your Secret API Key</span>
                  <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-2.5 py-0.5 text-[10px] font-black text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                    Shown Only Once
                  </span>
                </h3>
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-400/90 mt-1 leading-relaxed">
                  For security reasons, you cannot view this token again after leaving or refreshing this page. 
                  Copy it now and save it in a secure password manager.
                </p>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-stretch gap-3">
              <div 
                onClick={copySecret}
                className="flex-1 min-w-0 flex items-center justify-between rounded-xl bg-white dark:bg-slate-950 border border-amber-200 dark:border-amber-900/40 p-3.5 text-xs font-mono font-bold text-slate-800 dark:text-amber-400 cursor-pointer hover:border-amber-400 dark:hover:border-amber-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition group relative"
                title="Click to copy secret key"
              >
                <code className="truncate max-w-full pr-8 text-sm select-all">
                  {secretKey}
                </code>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition">
                  {copiedSecret ? (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <i className="fa-solid fa-circle-check text-xs animate-bounce"></i> Copied!
                    </span>
                  ) : (
                    <i className="fa-regular fa-copy text-sm"></i>
                  )}
                </div>
              </div>
              
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={copySecret}
                  className={`h-11 px-5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
                    copiedSecret
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/10"
                      : "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/15"
                  }`}
                >
                  <i className={`fa-solid ${copiedSecret ? "fa-circle-check" : "fa-copy"}`}></i>
                  {copiedSecret ? "Copied!" : "Copy Key"}
                </button>
                <button
                  onClick={() => {
                    setSecretKey(null);
                  }}
                  className="h-11 px-4 border border-slate-300 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Done, close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Statistics overview */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60 p-4 shadow-sm">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
              <i className="fa-solid fa-key"></i>
            </div>
            <p className="mt-3 text-2xl font-black text-slate-800 dark:text-slate-200">{activeKeysCount}</p>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">Active keys</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60 p-4 shadow-sm">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <i className="fa-solid fa-circle-check"></i>
            </div>
            <p className="mt-3 text-2xl font-black text-slate-800 dark:text-slate-200">{usedKeysCount}</p>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">Used keys</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60 p-4 shadow-sm">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
              <i className="fa-solid fa-cloud-arrow-up"></i>
            </div>
            <p className="mt-3 text-2xl font-black text-slate-800 dark:text-slate-200">1</p>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">Upload endpoints</p>
          </div>
        </div>

        {/* Active Keys & Examples Doc grid */}
        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          {/* Keys List */}
          <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4 min-w-0">
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">Your API Keys</h2>

            <div className="space-y-4">
              {apiKeys.length === 0 && (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-8 text-center bg-slate-50/50 dark:bg-slate-950/40">
                  <i className="fa-solid fa-key text-4xl text-slate-400 dark:text-slate-500 block mb-2"></i>
                  <h3 className="mt-3 text-sm font-black text-slate-800 dark:text-slate-200">No API keys generated</h3>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                    Generate a token key to upload files externally
                  </p>
                  <button
                    onClick={openCreateModal}
                    className="mt-4 inline-flex h-9 items-center px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    Create Key
                  </button>
                </div>
              )}

              {apiKeys.map((key) => {
                const isActive = key.status === "active";
                return (
                  <div
                    key={key.id}
                    onClick={() => setActiveDetailKey(key)}
                    className={`border rounded-2xl p-5 transition-all duration-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5 cursor-pointer ${
                      isActive
                        ? "border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900/60 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700"
                        : "border-slate-200/40 bg-slate-50/40 dark:border-slate-800/40 dark:bg-slate-950/20 opacity-70 hover:border-slate-300"
                    }`}
                    title="Click to view details and usage logs"
                  >
                    <div className="min-w-0 flex-1 space-y-3">
                      {/* Name & Status */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                          <i className="fa-solid fa-key text-xs"></i>
                        </div>
                        <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-sm truncate max-w-[200px] sm:max-w-xs">
                          {key.name}
                        </h4>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider border ${
                            isActive
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/30"
                              : "bg-red-50 text-red-600 border-red-100 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-red-500"}`}></span>
                          {key.status}
                        </span>
                      </div>

                      {/* Details Grid */}
                      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-xs font-semibold text-slate-400 dark:text-slate-500 pt-1">
                        {/* Prefix */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] uppercase font-black tracking-wider text-slate-400/80">Key Prefix</span>
                          <div className="flex items-center gap-1.5">
                            <code className="bg-slate-100 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-800 px-2 py-0.5 rounded text-[10px] font-mono text-slate-700 dark:text-slate-300">
                              {key.keyPrefix}...
                            </code>
                          </div>
                        </div>

                        {/* Scopes */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] uppercase font-black tracking-wider text-slate-400/80">Allowed Scopes</span>
                          <div className="flex flex-wrap gap-1">
                            {key.scopes.map((scope) => (
                              <span
                                key={scope}
                                className="bg-blue-50/50 dark:bg-blue-950/35 border border-blue-100/50 dark:border-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded text-[9px] font-bold"
                              >
                                {scope}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Created Date */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] uppercase font-black tracking-wider text-slate-400/80">Created</span>
                          <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1 text-[11px]">
                            <i className="fa-regular fa-calendar text-[11px] text-slate-400"></i>
                            {new Date(key.createdAt).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>

                        {/* Last Used Date */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] uppercase font-black tracking-wider text-slate-400/80">Last Used</span>
                          {key.lastUsedAt ? (
                            <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1 text-[11px]">
                              <i className="fa-regular fa-clock text-[11px] text-slate-400"></i>
                              {new Date(key.lastUsedAt).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-600 flex items-center gap-1 italic text-[11px]">
                              <i className="fa-regular fa-clock text-[11px] text-slate-400/60"></i>
                              Never Used
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="shrink-0 flex items-center justify-end">
                      {isActive ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            revokeKey(key.id);
                          }}
                          className="h-10 px-4 border border-red-200 dark:border-red-900/30 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm shadow-red-500/5 hover:shadow-red-500/10"
                        >
                          <i className="fa-solid fa-ban text-[11px]"></i>
                          Revoke Key
                        </button>
                      ) : (
                        <span className="h-10 px-4 flex items-center gap-2 text-slate-400 dark:text-slate-600 text-xs font-bold border border-transparent">
                          <i className="fa-solid fa-lock text-[11px]"></i>
                          Revoked
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Documentation Card */}
          <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4 h-fit flex flex-col min-w-0">
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <i className="fa-solid fa-book text-blue-500"></i>
                <span>API Reference</span>
              </h2>
              <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mt-1">
                Learn how to interact with Clospol Storage programmatically.
              </p>
            </div>

            {/* Document Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 text-xs font-bold gap-1 pb-1 flex-wrap">
              {[
                { id: "endpoints", label: "Guide & Auth", icon: "fa-circle-info" },
                { id: "javascript", label: "JavaScript", icon: "fa-brands fa-js" },
                { id: "curl", label: "cURL", icon: "fa-terminal" },
                { id: "responses", label: "Responses", icon: "fa-code" }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveDocTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    activeDocTab === tab.id
                      ? "bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400"
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <i className={`fa-solid ${tab.icon} text-[11px]`}></i>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Sub Action Selector (only show for code tabs) */}
            {activeDocTab !== "endpoints" && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Select API Action</label>
                <select
                  value={activeSubAction}
                  onChange={(e) => setActiveSubAction(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 dark:text-slate-100 text-xs font-bold rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <optgroup label="File Operations">
                    <option value="upload">Upload File (POST /api/v1/uploads)</option>
                    <option value="list">List Files (GET /api/files)</option>
                    <option value="download">Download File (GET /api/files/[id]/download)</option>
                    <option value="rename_file">Rename / Move File (PATCH /api/files/[id])</option>
                    <option value="copy">Copy File (POST /api/files/[id]/copy)</option>
                    <option value="relocate">Relocate Storage (POST /api/files/[id]/relocate)</option>
                    <option value="star">Star / Unstar File (POST /api/files/[id]/star)</option>
                    <option value="delete">Soft Delete File (DELETE /api/files/[id])</option>
                    <option value="restore">Restore File (POST /api/files/[id]/restore)</option>
                    <option value="permanent">Permanent Delete File (DELETE /api/files/[id]/permanent)</option>
                  </optgroup>
                  <optgroup label="Folder Operations">
                    <option value="list_folders">List Folders (GET /api/folders)</option>
                    <option value="create_folder">Create Folder (POST /api/folders)</option>
                    <option value="rename_folder">Rename / Move Folder (PATCH /api/folders/[id])</option>
                    <option value="delete_folder">Delete Folder (DELETE /api/folders/[id])</option>
                  </optgroup>
                </select>
              </div>
            )}

            {/* Tab content wrapper */}
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 space-y-4 leading-relaxed">
              {activeDocTab === "endpoints" && (
                <div className="space-y-3.5 animate-in fade-in duration-100">
                  <div className="flex flex-col gap-1.5">
                    <span className="font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wide text-[9px]">API Authentication Header</span>
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2 text-[10px] font-extrabold text-slate-800 dark:text-slate-300 truncate font-mono">
                        Authorization: Bearer 9d_live_...
                      </code>
                      <button
                        onClick={() => copyText("Authorization: Bearer 9d_live_...", "header")}
                        className="p-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition shrink-0 cursor-pointer"
                        title="Copy Header Example"
                      >
                        {copiedHeader ? (
                          <i className="fa-solid fa-check text-emerald-600 dark:text-emerald-400 text-xs"></i>
                        ) : (
                          <i className="fa-regular fa-copy text-xs"></i>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                    <span className="font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wide text-[9px] block">Supported Actions & Endpoints (Click card to expand parameters)</span>
                    <div className="space-y-2 text-[11px] max-h-[350px] overflow-y-auto pr-1">
                      {Object.entries(docExamples).map(([key, item]) => {
                        const isExpanded = expandedDocAction === key;
                        return (
                          <div 
                            key={key} 
                            onClick={() => setExpandedDocAction(isExpanded ? null : key)}
                            className={`border rounded-xl p-3 transition-all cursor-pointer ${
                              isExpanded 
                                ? "border-blue-500 bg-blue-50/5 dark:bg-blue-950/5 shadow-sm"
                                : "border-slate-100 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/20 hover:border-slate-200 dark:hover:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-950/50"
                            } space-y-1.5`}
                          >
                            <div className="flex items-center justify-between font-bold">
                              <span className="text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                                {item.title}
                                <i className={`fa-solid ${isExpanded ? "fa-chevron-up text-blue-500" : "fa-chevron-down text-slate-400"} text-[10px]`}></i>
                              </span>
                              <span className="text-[9px] text-blue-600 dark:text-blue-400 font-extrabold px-1.5 py-0.2 bg-blue-50 dark:bg-blue-950/40 rounded">{item.scope}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono">
                              <span className={`px-1.5 py-0.2 rounded text-[8px] font-extrabold text-white uppercase ${
                                item.method === "GET" ? "bg-emerald-600" :
                                item.method === "POST" ? "bg-blue-600" :
                                item.method === "PATCH" ? "bg-amber-600" :
                                "bg-red-600"
                              }`}>{item.method}</span>
                              <code className="text-slate-500 dark:text-slate-400 truncate">{item.endpoint}</code>
                            </div>

                            {isExpanded && (
                              <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 animate-in slide-in-from-top-2 duration-150">
                                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wide block">Parameters & Schema</span>
                                {item.params && item.params.length > 0 ? (
                                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                    {item.params.map((p) => (
                                      <div key={p.name} className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-4 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-[11px]">
                                        <div className="sm:w-28 shrink-0">
                                          <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">{p.name}</span>
                                          <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className={`inline-block px-1 py-0.2 rounded text-[8px] font-bold text-white uppercase tracking-wider ${
                                              p.type === "path" ? "bg-purple-600" :
                                              p.type === "query" ? "bg-teal-600" :
                                              "bg-indigo-600"
                                            }`}>{p.type}</span>
                                            <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 font-mono">({p.dataType})</span>
                                          </div>
                                        </div>
                                        <div className="flex-1 space-y-0.5">
                                          <div className="flex items-center gap-1.5">
                                            {p.required ? (
                                              <span className="text-[8px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-500">Required</span>
                                            ) : (
                                              <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Optional</span>
                                            )}
                                          </div>
                                          <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[10px] font-medium">{p.description}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-[11px] italic text-slate-400 dark:text-slate-500 font-medium block">No parameters required for this endpoint.</span>
                                )}

                                {/* Navigation buttons to details */}
                                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveSubAction(key);
                                      setActiveDocTab("javascript");
                                    }}
                                    className="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] text-center transition cursor-pointer flex items-center justify-center gap-1"
                                  >
                                    <i className="fa-brands fa-js"></i> JS Snippet
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveSubAction(key);
                                      setActiveDocTab("curl");
                                    }}
                                    className="flex-1 py-1.5 rounded-lg bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-800 text-white font-bold text-[10px] text-center transition cursor-pointer flex items-center justify-center gap-1"
                                  >
                                    <i className="fa-solid fa-terminal"></i> cURL Command
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveSubAction(key);
                                      setActiveDocTab("responses");
                                    }}
                                    className="flex-1 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] text-center transition cursor-pointer flex items-center justify-center gap-1"
                                  >
                                    <i className="fa-solid fa-code"></i> Responses
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeDocTab === "javascript" && (
                <div className="space-y-2 animate-in fade-in duration-100">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block text-[10px] uppercase tracking-wide">
                      {activeExample.title} (JavaScript)
                    </span>
                    <button
                      onClick={() => copyText(activeExample.js, "code")}
                      className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 cursor-pointer transition"
                    >
                      {copiedCode ? (
                        <>
                          <i className="fa-solid fa-circle-check text-emerald-600 dark:text-emerald-400"></i>
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <i className="fa-regular fa-copy"></i>
                          <span>Copy Code</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="bg-slate-900 dark:bg-slate-950 text-slate-100 rounded-xl p-3.5 overflow-x-auto text-[9.5px] leading-relaxed max-h-[350px] font-mono border border-slate-800 no-scrollbar select-all">
                    {activeExample.js}
                  </pre>
                </div>
              )}

              {activeDocTab === "curl" && (
                <div className="space-y-2 animate-in fade-in duration-100">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block text-[10px] uppercase tracking-wide">
                      {activeExample.title} (cURL)
                    </span>
                    <button
                      onClick={() => copyText(activeExample.curl, "code")}
                      className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 cursor-pointer transition"
                    >
                      {copiedCode ? (
                        <>
                          <i className="fa-solid fa-circle-check text-emerald-600 dark:text-emerald-400"></i>
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <i className="fa-regular fa-copy"></i>
                          <span>Copy Command</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="bg-slate-900 dark:bg-slate-950 text-slate-100 rounded-xl p-3.5 overflow-x-auto text-[9.5px] leading-relaxed max-h-[350px] font-mono border border-slate-800 no-scrollbar select-all">
                    {activeExample.curl}
                  </pre>
                </div>
              )}

              {activeDocTab === "responses" && (
                <div className="space-y-3.5 animate-in fade-in duration-100">
                  <div className="space-y-1.5">
                    <span className="font-bold text-slate-700 dark:text-slate-300 block text-[10px] uppercase tracking-wide">Success Response Template</span>
                    <pre className="bg-slate-900 dark:bg-slate-950 text-slate-100 rounded-xl p-3 overflow-x-auto text-[9.5px] leading-relaxed font-mono border border-slate-800 no-scrollbar">
                      {activeExample.response}
                    </pre>
                  </div>
                  <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-2.5">
                    <span className="font-bold text-slate-700 dark:text-slate-300 block text-[10px] uppercase tracking-wide">Error Response Example</span>
                    <pre className="bg-slate-900 dark:bg-slate-950 text-red-400 rounded-xl p-3 overflow-x-auto text-[9.5px] leading-relaxed font-mono border border-slate-800 no-scrollbar">
                      {`{
  "error": "Forbidden: scope '${activeExample.scope}' is required"
}`}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create API Key Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex justify-center items-start sm:items-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-2xl scale-in space-y-4 max-h-[90vh] overflow-y-auto my-auto">
            <div>
              <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">Create API Key</h3>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                Provide settings and allowed scopes for your credentials
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Descriptive Label</label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="E.g. GitHub Actions Sync"
                className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newKeyName.trim()) createKey();
                }}
              />
            </div>

            {/* Expiration Settings */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Expiration</label>
              <select
                value={expiryOption}
                onChange={(e) => setExpiryOption(e.target.value)}
                className="w-full h-11 px-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 dark:text-slate-100 text-sm font-semibold rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="never">Never (Permanent)</option>
                <option value="7">7 Days</option>
                <option value="30">30 Days</option>
                <option value="90">90 Days</option>
                <option value="custom">Custom Date...</option>
              </select>
            </div>

            {expiryOption === "custom" && (
              <div className="space-y-1 animate-in fade-in duration-100">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Custom Expiration Date</label>
                <input
                  type="date"
                  value={customExpiry}
                  onChange={(e) => setCustomExpiry(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-slate-100 text-sm font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Scopes Settings */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Permissions / Scopes</label>
              <div className="space-y-2.5 border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-950/20">
                {[
                  { id: "files:upload", label: "Upload Files (files:upload)", desc: "Allows uploading new files via API" },
                  { id: "files:read", label: "Read Files (files:read)", desc: "Allows listing and downloading files" },
                  { id: "files:delete", label: "Delete Files (files:delete)", desc: "Allows moving to trash or deleting files" }
                ].map((scope) => {
                  const isChecked = selectedScopes.includes(scope.id);
                  return (
                    <label key={scope.id} className="flex items-start gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (scope.id === "files:upload" && isChecked && selectedScopes.length === 1) return;
                          if (isChecked) {
                            setSelectedScopes(selectedScopes.filter((s) => s !== scope.id));
                          } else {
                            setSelectedScopes([...selectedScopes, scope.id]);
                          }
                        }}
                        className="h-4 w-4 mt-0.5 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer bg-white dark:bg-slate-900"
                      />
                      <div className="text-left">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{scope.label}</p>
                        <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">{scope.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsModalOpen(false)}
                className="h-10 px-4 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={createKey}
                disabled={createLoading || !newKeyName.trim()}
                className="h-10 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/10 disabled:opacity-50 transition flex items-center justify-center cursor-pointer"
              >
                {!createLoading ? (
                  "Create Key"
                ) : (
                  <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Key Details & Usage Logs Modal */}
      {activeDetailKey && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex justify-center items-start sm:items-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-2xl scale-in space-y-5 max-h-[90vh] overflow-y-auto flex flex-col my-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <i className="fa-solid fa-key text-blue-500"></i>
                  <span>Key Details & Usage Logs</span>
                </h3>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                  Review settings, scopes, and files uploaded with {activeDetailKey.name}
                </p>
              </div>
              <button
                onClick={() => setActiveDetailKey(null)}
                className="rounded-lg p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            {/* Modal Content */}
            <div className="grid gap-6 md:grid-cols-[16rem_1fr] flex-1 min-h-0 overflow-y-auto">
              
              {/* Left Column: API Key Settings */}
              <div className="space-y-4 border-r border-slate-100 dark:border-slate-800/60 pr-0 md:pr-6">
                <div>
                  <h4 className="text-[10px] uppercase font-black tracking-wider text-slate-400/80 mb-1">Key Name</h4>
                  <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200 truncate">{activeDetailKey.name}</p>
                </div>

                <div>
                  <h4 className="text-[10px] uppercase font-black tracking-wider text-slate-400/80 mb-1">Status</h4>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider border ${
                      activeDetailKey.status === "active"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/30"
                        : "bg-red-50 text-red-600 border-red-100 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${activeDetailKey.status === "active" ? "bg-emerald-500" : "bg-red-500"}`}></span>
                    {activeDetailKey.status}
                  </span>
                </div>

                <div>
                  <h4 className="text-[10px] uppercase font-black tracking-wider text-slate-400/80 mb-1">Key Prefix</h4>
                  <code className="bg-slate-100 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-800 px-2 py-1 rounded text-[11px] font-mono text-slate-700 dark:text-slate-300 block w-fit">
                    {activeDetailKey.keyPrefix}...
                  </code>
                </div>

                <div>
                  <h4 className="text-[10px] uppercase font-black tracking-wider text-slate-400/80 mb-1.5">Permissions / Scopes</h4>
                  <div className="flex flex-wrap gap-1">
                    {activeDetailKey.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100/50 dark:border-blue-900/35 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-lg text-[10px] font-bold"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-400 dark:text-slate-500">Created:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {new Date(activeDetailKey.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-400 dark:text-slate-500">Expires:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {activeDetailKey.expiresAt ? (
                        new Date(activeDetailKey.expiresAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      ) : (
                        <span className="text-slate-400 italic">Never</span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-400 dark:text-slate-500">Last Used:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {activeDetailKey.lastUsedAt ? (
                        new Date(activeDetailKey.lastUsedAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      ) : (
                        <span className="text-slate-400 italic">Never</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Uploaded Files & Usage History */}
              <div className="space-y-4 flex flex-col min-h-[300px]">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <i className="fa-solid fa-cloud-arrow-up"></i>
                    <span>Uploaded Files via this Key</span>
                  </h4>
                  <span className="text-[10px] font-black bg-slate-100 dark:bg-slate-950 px-2 py-0.5 rounded text-slate-500 dark:text-slate-400">
                    {keyLogs.length} uploads
                  </span>
                </div>

                <div className="flex-1 min-h-0 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/20 dark:bg-slate-950/20 max-h-[350px] overflow-y-auto">
                  {logsLoading ? (
                    <div className="flex flex-col items-center justify-center p-12 text-slate-400 space-y-2 animate-pulse">
                      <span className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent"></span>
                      <span className="text-xs font-bold">Fetching key logs...</span>
                    </div>
                  ) : keyLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 h-full">
                      <i className="fa-regular fa-folder-open text-3xl opacity-60 mb-2"></i>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No uploads recorded</p>
                      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                        Files uploaded via curl or integrations using this key will be listed here.
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/30 dark:bg-slate-950/40 font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                          <th className="p-3 pl-4">File Name</th>
                          <th className="p-3">Size</th>
                          <th className="p-3 pr-4 text-right">Upload Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-semibold text-slate-600 dark:text-slate-400">
                        {keyLogs.map((log) => {
                          const sizeBytes = parseInt(log.metadata?.sizeBytes || "0");
                          let sizeStr = "0 B";
                          if (sizeBytes > 0) {
                            const k = 1024;
                            const sizes = ["B", "KB", "MB", "GB"];
                            const i = Math.floor(Math.log(sizeBytes) / Math.log(k));
                            sizeStr = parseFloat((sizeBytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
                          }
                          return (
                            <tr key={log.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-950/10">
                              <td className="p-3 pl-4 font-bold text-slate-700 dark:text-slate-200 truncate max-w-[200px]" title={log.metadata?.name}>
                                {log.metadata?.name || "unnamed file"}
                              </td>
                              <td className="p-3 text-slate-400 dark:text-slate-500 font-bold">{sizeStr}</td>
                              <td className="p-3 pr-4 text-right text-[11px] text-slate-400">
                                {new Date(log.createdAt).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setActiveDetailKey(null)}
                className="h-10 px-6 rounded-xl bg-slate-800 dark:bg-slate-700 text-white font-bold text-xs hover:bg-slate-900 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
