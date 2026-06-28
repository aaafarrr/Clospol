"use client";

import React, { useState, useEffect } from "react";
import { Lock, Loader2, ShieldAlert } from "lucide-react";

export default function PublicShareEmbedPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareData, setShareData] = useState<any>(null);

  useEffect(() => {
    params.then((p) => setToken(p.token));
  }, [params]);

  const loadShareMetadata = async (targetToken: string) => {
    if (!targetToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/files/${targetToken}/data`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Access Denied");
      }
      setShareData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadShareMetadata(token);
    }
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-slate-400 text-xs">
        <Loader2 size={20} className="animate-spin text-blue-500 mr-2" />
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black p-4 text-center text-xs text-rose-400">
        <ShieldAlert size={24} className="mb-2" />
        {error}
      </div>
    );
  }

  if (shareData?.locked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black p-4 text-center text-xs text-amber-400">
        <Lock size={24} className="mb-2" />
        Password Required. Please open the main link to unlock.
      </div>
    );
  }

  const mime = shareData.mimeType?.toLowerCase() || "";

  if (mime.startsWith("video/")) {
    return (
      <video 
        controls 
        preload="metadata" 
        src={`/api/public/files/${token}/preview`} 
        className="w-full h-screen bg-black object-contain" 
      />
    );
  }

  if (mime.startsWith("image/")) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center p-2">
        <img 
          src={`/api/public/files/${token}/preview`} 
          alt={shareData.fileName} 
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  if (mime.startsWith("audio/")) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center p-6">
        <audio 
          controls 
          src={`/api/public/files/${token}/preview`} 
          className="w-full max-w-md" 
        />
      </div>
    );
  }

  if (mime === "application/pdf" || mime.startsWith("text/") || mime === "application/json") {
    return (
      <iframe 
        src={`/api/public/files/${token}/preview`} 
        title={shareData.fileName}
        className="w-full h-screen border-0 bg-slate-900" 
      />
    );
  }

  return (
    <div className="w-full h-screen bg-black flex flex-col items-center justify-center text-center p-4 text-xs text-slate-500 space-y-2">
      <ShieldAlert size={24} />
      <p className="font-semibold text-slate-400">Preview not available in embedded view.</p>
    </div>
  );
}
