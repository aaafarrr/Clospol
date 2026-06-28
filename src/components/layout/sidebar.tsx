"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

interface SidebarProps {
  children: React.ReactNode;
}

export default function SidebarLayout({ children }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Layout State
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [user, setUser] = useState({ name: "User", email: "loading..." });
  const [searchValue, setSearchValue] = useState("");
  const [searchResults, setSearchResults] = useState<{
    files: Array<{ id: string; name: string; mimeType: string; sizeBytes: string }>;
    folders: Array<{ id: string; name: string; color: string; iconUrl: string | null }>;
  }>({ files: [], folders: [] });
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [storage, setStorage] = useState({
    totalBytes: "0",
    usedBytes: "0",
    availableBytes: "0"
  });
  const [breakdown, setBreakdown] = useState({
    photo: "0",
    video: "0",
    document: "0"
  });

  // Sync theme changes from other components
  const syncThemeClass = (newTheme: "light" | "dark") => {
    setTheme(newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const toggleCollapse = () => {
    const nextVal = !isCollapsed;
    setIsCollapsed(nextVal);
    localStorage.setItem("desktop-sidebar-collapsed", String(nextVal));
  };

  useEffect(() => {
    // Initial theme check
    const localTheme = (localStorage.getItem("theme") as "light" | "dark") || "dark";
    syncThemeClass(localTheme);

    const handleThemeChange = () => {
      const updatedTheme = (localStorage.getItem("theme") as "light" | "dark") || "dark";
      syncThemeClass(updatedTheme);
    };

    window.addEventListener("theme-changed", handleThemeChange);

    // Initial collapsed state check
    const savedCollapsed = localStorage.getItem("desktop-sidebar-collapsed");
    if (savedCollapsed === "true") {
      setIsCollapsed(true);
    }

    return () => {
      window.removeEventListener("theme-changed", handleThemeChange);
    };
  }, []);

  // Fetch installer status, user profiles, and storage aggregates
  const fetchData = async () => {
    try {
      const statusRes = await fetch("/api/install/status");
      const statusData = await statusRes.json();
      if (!statusData.installed) {
        router.push("/install");
        return;
      }

      const meRes = await fetch("/api/auth/me");
      if (meRes.status === 401) {
        router.push("/login");
        return;
      }
      const meData = await meRes.json();
      if (meData && meData.user) {
        setUser({ name: meData.user.name, email: meData.user.email });
      }

      // Fetch storage aggregates
      const storageRes = await fetch("/api/storage/summary");
      if (storageRes.ok) {
        const storageData = await storageRes.json();
        setStorage({
          totalBytes: storageData.totalBytes || "0",
          usedBytes: storageData.usedBytes || "0",
          availableBytes: storageData.availableBytes || "0"
        });
      }

      // Fetch file breakdowns
      const breakdownRes = await fetch("/api/storage/breakdown");
      if (breakdownRes.ok) {
        const breakdownData = await breakdownRes.json();
        setBreakdown({
          photo: breakdownData.photo || "0",
          video: breakdownData.video || "0",
          document: breakdownData.document || "0"
        });
      }
    } catch (err) {
      console.error("Error loading dashboard layout metrics:", err);
    }
  };

  useEffect(() => {
    fetchData();

    // Listen for storage quota sync events
    const handleStorageChange = () => {
      fetchData();
    };

    window.addEventListener("storage-changed", handleStorageChange);
    return () => {
      window.removeEventListener("storage-changed", handleStorageChange);
    };
  }, [router]);

  // Autocomplete search handler
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const query = searchValue.trim();
    if (query.length < 2) {
      setSearchResults({ files: [], folders: [] });
      setShowSearchDropdown(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      fetch(`/api/search/autocomplete?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => {
          setSearchResults(data);
          setShowSearchDropdown(
            (data.files && data.files.length > 0) || (data.folders && data.folders.length > 0)
          );
        })
        .catch((err) => console.error("Autocomplete search error:", err));
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchValue]);

  // Click outside autocomplete dropdown to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const toggleTheme = () => {
    const targetTheme = theme === "dark" ? "light" : "dark";
    localStorage.setItem("theme", targetTheme);
    syncThemeClass(targetTheme);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (_) {
      router.push("/login");
    }
  };

  const isUrl = (path: string) => {
    return pathname === path;
  };

  const searchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchValue.trim();
    if (query) {
      router.push(`/all-files?q=${encodeURIComponent(query)}`);
    } else {
      router.push(`/all-files`);
    }
    setShowSearchDropdown(false);
  };

  // Helper sizes formatter
  const formatBytes = (bytesStr: string) => {
    const parsed = parseInt(bytesStr);
    if (isNaN(parsed) || parsed === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(parsed) / Math.log(k));
    return parseFloat((parsed / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const total = parseInt(storage.totalBytes);
  const used = parseInt(storage.usedBytes);
  const storagePercent = total > 0 ? Math.min(100, (used / total) * 100) : 0;

  const initials = user.name ? user.name.slice(0, 2) : "US";

  const navigationSections = [
    {
      title: "Workspace & Storage",
      links: [
        { name: "Dashboard", href: "/dashboard", icon: "fa-gauge" },
        { name: "All Files", href: "/all-files", icon: "fa-folder-closed" },
        { name: "Starred Items", href: "/starred", icon: "fa-star" },
        { name: "Shared Manager", href: "/shared", icon: "fa-share-nodes" },
        { name: "Trash Bin", href: "/trash", icon: "fa-trash-can" },
      ]
    },
    {
      title: "Gateway Settings",
      links: [
        { name: "Settings", href: "/settings/system", icon: "fa-gears" },
        { name: "Connected Drives", href: "/settings/drives", icon: "fa-link" },
        { name: "Routing Policies", href: "/settings/policies", icon: "fa-sliders" },
        ...(process.env.NEXT_PUBLIC_FEATURE_WEBDAV !== "false"
          ? [{ name: "WebDAV Access", href: "/settings/webdav", icon: "fa-folder-tree" }]
          : []),
        { name: "Raw Path Resolver", href: "/settings/raw", icon: "fa-folder-open" },
        { name: "Backup & Restore", href: "/settings/backup-restore", icon: "fa-vault" },
      ]
    },
    {
      title: "Integrations & Tools",
      links: [
        ...(process.env.NEXT_PUBLIC_FEATURE_CCTV !== "false"
          ? [{ name: "CCTV Streams", href: "/cctv", icon: "fa-video" }]
          : []),
        { name: "Developer APIs", href: "/api", icon: "fa-code" },
        ...(process.env.NEXT_PUBLIC_FEATURE_INTEGRATIONS !== "false"
          ? [{ name: "Integrations", href: "/integrations", icon: "fa-comments" }]
          : []),
        ...(process.env.NEXT_PUBLIC_FEATURE_BACKUPS !== "false"
          ? [{ name: "External DB Backups", href: "/backups", icon: "fa-database" }]
          : []),
        { name: "Audit Logs", href: "/activity", icon: "fa-clock-rotate-left" },
        { name: "About Gateway", href: "/about", icon: "fa-circle-info" },
      ]
    }
  ];

  return (
    <div className="flex min-h-screen w-full flex-col lg:h-screen lg:overflow-hidden lg:flex-row bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-200">
      
      {/* Desktop Sidebar */}
      <aside className={`hidden lg:flex h-full flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-y-auto no-scrollbar shrink-0 transition-all duration-300 ${
        isCollapsed ? "w-20 p-4 items-center" : "w-72 p-5"
      }`}>
        {/* Logo */}
        <div className={`flex items-center pb-5 ${isCollapsed ? "justify-center w-full" : "gap-3"}`}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
            <i className="fa-solid fa-cloud text-lg"></i>
          </div>
          {!isCollapsed && (
            <span className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent animate-in fade-in duration-200">
              Clospol
            </span>
          )}
        </div>

        {/* Profile Info */}
        <div className={`flex items-center border-y border-slate-100 dark:border-slate-800 py-5 w-full ${isCollapsed ? "justify-center" : "gap-3"}`}>
          <div className="h-10 w-10 shrink-0 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 font-bold flex items-center justify-center text-lg uppercase shadow-inner">
            {initials}
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1 animate-in fade-in duration-200">
              <p className="truncate font-bold text-slate-800 dark:text-slate-200">
                {user.name}
              </p>
              <p className="truncate text-xs font-semibold text-slate-400 dark:text-slate-500">
                {user.email}
              </p>
            </div>
          )}
        </div>

        {/* Navigation Links grouped by categories with visual dividers */}
        <div className="mt-6 space-y-5 flex-1 select-none w-full">
          {navigationSections.map((section, idx) => (
            <div key={section.title} className="space-y-1.5 w-full">
              {idx > 0 && <div className="border-t border-slate-100 dark:border-slate-800 my-4" />}
              {!isCollapsed ? (
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 px-3 block animate-in fade-in duration-200">
                  {section.title}
                </span>
              ) : (
                <div className="h-2" />
              )}
              <nav className="grid gap-1 w-full">
                {section.links.map((link) => {
                  const active = isUrl(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      title={isCollapsed ? link.name : undefined}
                      className={`flex h-10 items-center rounded-xl transition ${
                        isCollapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 w-full"
                      } ${
                        active
                          ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <i className={`fa-solid ${link.icon} text-base w-5 text-center shrink-0`}></i>
                      {!isCollapsed && <span className="truncate animate-in fade-in duration-200">{link.name}</span>}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Log Out button & Toggle Collapse button */}
        <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 w-full space-y-2">
          <button
            onClick={handleLogout}
            title={isCollapsed ? "Log Out" : undefined}
            className={`flex h-11 items-center justify-center rounded-xl bg-red-50 text-red-600 hover:bg-red-100/70 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/40 text-sm font-extrabold transition cursor-pointer ${
              isCollapsed ? "w-10 mx-auto" : "w-full gap-2"
            }`}
          >
            <i className="fa-solid fa-right-from-bracket"></i>
            {!isCollapsed && <span className="animate-in fade-in duration-200">Log Out</span>}
          </button>

          <button
            onClick={toggleCollapse}
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            className={`flex h-11 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-350 text-xs font-bold transition cursor-pointer ${
              isCollapsed ? "w-10 mx-auto" : "w-full gap-2"
            }`}
          >
            <i className={`fa-solid ${isCollapsed ? "fa-angles-right" : "fa-angles-left"} text-[13px]`}></i>
            {!isCollapsed && <span className="animate-in fade-in duration-200">Collapse Menu</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Drawer menu backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* Mobile Sidebar Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform w-72 bg-white dark:bg-slate-900 p-5 shadow-2xl transition-transform duration-300 ease-out lg:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between pb-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
              <i className="fa-solid fa-cloud"></i>
            </div>
            <span className="text-xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
              Clospol
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-pointer"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {/* Profile Info Mobile */}
        <div className="flex items-center gap-3 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 font-bold flex items-center justify-center uppercase shadow-inner">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-sm text-slate-800 dark:text-slate-200">
              {user.name}
            </p>
            <p className="truncate text-xs font-semibold text-slate-400 dark:text-slate-500">
              {user.email}
            </p>
          </div>
        </div>

        {/* Mobile Nav grouped by categories with visual dividers */}
        <div className="mt-4 space-y-4 overflow-y-auto max-h-[calc(100vh-260px)] no-scrollbar select-none">
          {navigationSections.map((section, idx) => (
            <div key={section.title} className="space-y-1">
              {idx > 0 && <div className="border-t border-slate-100 dark:border-slate-800 my-3" />}
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 px-3 block">
                {section.title}
              </span>
              <nav className="grid gap-1">
                {section.links.map((link) => {
                  const active = isUrl(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex h-9 items-center gap-3 rounded-xl px-3 text-sm font-bold transition ${
                        active
                          ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <i className={`fa-solid ${link.icon} text-base w-5 text-center shrink-0`}></i>
                      <span className="truncate">{link.name}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className="absolute bottom-5 left-5 right-5">
          <button
            onClick={handleLogout}
            className="flex w-full h-10 items-center justify-center gap-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100/70 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/40 text-sm font-extrabold transition cursor-pointer"
          >
            Log Out
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <section className="min-w-0 min-h-0 flex-1 p-4 sm:p-8 lg:h-screen lg:overflow-y-auto lg:p-10">
        
        {/* Header (Search & Theme Toggle) */}
        <header className="flex w-full min-w-0 flex-col gap-4 xl:flex-row xl:items-center xl:justify-between pb-6 border-b border-slate-100 dark:border-slate-800">
          
          {/* Mobile Logo/Toggler */}
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 p-2 text-slate-600 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <i className="fa-solid fa-bars h-5 w-5 flex items-center justify-center"></i>
              </button>
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <i className="fa-solid fa-cloud"></i>
                </div>
                <span className="truncate text-lg font-black tracking-tight text-slate-800 dark:text-slate-100">
                  Clospol
                </span>
              </div>
            </div>

            {/* Mobile Dark Toggle */}
            <button
              onClick={toggleTheme}
              className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 p-2 text-slate-600 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <i
                className={`fa-solid ${
                  theme === "dark" ? "fa-sun text-amber-500" : "fa-moon text-slate-400"
                }`}
              ></i>
            </button>
          </div>

          {/* Search Form */}
          <form onSubmit={searchSubmit} className="relative w-full min-w-0 flex-1 xl:max-w-xl">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
              <i className="fa-solid fa-magnifying-glass"></i>
            </span>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search Documents..."
              className="w-full h-11 pl-11 pr-12 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 text-sm font-semibold shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition duration-150 outline-none"
            />
            <button
              type="submit"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 cursor-pointer"
            >
              <i className="fa-solid fa-sliders"></i>
            </button>

            {/* Autocomplete Dropdown */}
            {showSearchDropdown && (
              <div
                ref={dropdownRef}
                className="absolute left-0 right-0 z-50 mt-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 shadow-2xl space-y-3 max-h-96 overflow-y-auto"
              >
                {searchResults.folders && searchResults.folders.length > 0 && (
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2">
                      Folders
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {searchResults.folders.map((folder) => (
                        <button
                          key={folder.id}
                          type="button"
                          onClick={() => {
                            setShowSearchDropdown(false);
                            router.push(`/all-files?folderId=${folder.id}`);
                          }}
                          className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-left cursor-pointer"
                        >
                          <i
                            className={`fa-solid fa-folder text-base ${
                              folder.color || "text-blue-500"
                            }`}
                          ></i>
                          <span className="truncate flex-1">{folder.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.files && searchResults.files.length > 0 && (
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2">
                      Files
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {searchResults.files.map((file) => (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() => {
                            setShowSearchDropdown(false);
                            window.open(`/api/files/${file.id}/download`, "_blank");
                          }}
                          className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-left cursor-pointer"
                        >
                          <i className="fa-solid fa-file text-slate-400 text-sm"></i>
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-slate-800 dark:text-slate-200">
                              {file.name}
                            </p>
                            <p className="text-[9px] text-slate-400 font-bold mt-0.5">
                              {formatBytes(file.sizeBytes)}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>

          {/* Desktop Dark Toggle */}
          <div className="hidden lg:flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <i
                className={`fa-solid ${
                  theme === "dark" ? "fa-sun text-amber-500" : "fa-moon text-slate-400"
                }`}
              ></i>
            </button>
          </div>
        </header>

        {/* Main Dynamic Page Body */}
        <div className="mt-6">{children}</div>
      </section>
    </div>
  );
}
