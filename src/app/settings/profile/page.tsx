"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProfileRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings/system");
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <span className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></span>
    </div>
  );
}
