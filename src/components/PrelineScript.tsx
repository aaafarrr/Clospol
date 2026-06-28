"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function PrelineScript() {
  const path = usePathname();

  useEffect(() => {
    // Dynamic import to avoid server-side render errors
    import("preline");
  }, []);

  useEffect(() => {
    setTimeout(() => {
      if (typeof window !== "undefined" && (window as any).HSStaticMethods) {
        (window as any).HSStaticMethods.autoInit();
      }
    }, 100);
  }, [path]);

  return null;
}
