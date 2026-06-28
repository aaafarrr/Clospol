"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/layout/sidebar";

export default function AboutPage() {
  const [systemStats, setSystemStats] = useState({
    version: "v1.0.0",
    environment: "Production",
    uptime: "Loading...",
    database: "SQLite (Drizzle ORM)",
    webdavStatus: "Active",
    apiStatus: "Healthy"
  });

  // Calculate mock uptime for visual flavor
  useEffect(() => {
    const startTime = Date.now() - 3600000 * 24 * 3.5; // 3.5 days ago
    const interval = setInterval(() => {
      const diff = Date.now() - startTime;
      const days = Math.floor(diff / (3600000 * 24));
      const hours = Math.floor((diff % (3600000 * 24)) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      setSystemStats(prev => ({
        ...prev,
        uptime: `${days}d ${hours}h ${minutes}m`
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Developer Profile - Corrected handles for aaafarrr
  const developerProfile = {
    name: "Farhan",
    role: "Full-Stack Developer & Creator",
    company: "Clospol Open Source Project",
    bio: "Passionate about building secure cloud storage gateways, API integrations, and performant web applications with React, Next.js, and TypeScript.",
    email: "aaafarrr@gmail.com",
    github: "github.com/aaafarrr",
    repository: "github.com/aaafarrr/Clospol",
    support: "https://sociabuzz.com/aaafarrr",
    location: "Jakarta, Indonesia",
    skills: ["Next.js", "TypeScript", "Tailwind CSS", "Drizzle ORM", "AWS S3", "WebDAV"]
  };

  const coreFeatures = [
    {
      title: "Multi-Cloud Integration",
      description: "Aggregates Google Drive, AWS S3, and Local Storage into a unified namespace.",
      icon: "fa-cloud"
    },
    {
      title: "WebDAV Gateway Engine",
      description: "Access your cloud folders as a local drive via standard WebDAV mounting.",
      icon: "fa-network-wired"
    },
    {
      title: "Tiering & Routing Policies",
      description: "Configure automatic distribution policies based on capacity and folder routes.",
      icon: "fa-route"
    },
    {
      title: "Audit & Stream Logger",
      description: "Track all operations, actions, file uploads, and stream surveillance footage natively.",
      icon: "fa-list-check"
    },
    {
      title: "Database Backup Automation",
      description: "Scheduled SQLite, MySQL, or PostgreSQL dump exports to connected cloud drives.",
      icon: "fa-database"
    },
    {
      title: "Secure Share Nodes",
      description: "Generate token-isolated public links with automatic expiration rules.",
      icon: "fa-share-from-square"
    }
  ];

  return (
    <SidebarLayout>
      <div className="space-y-6 animate-in fade-in duration-200">
        
        {/* Page Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">About Clospol Gateway</h1>
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
            System overview, key capabilities, and developer space specifications
          </p>
        </div>

        {/* Intro Hero Section */}
        <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 sm:p-8 shadow-sm relative overflow-hidden">
          <div className="absolute right-0 top-0 h-40 w-40 bg-blue-500/10 dark:bg-blue-500/5 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2"></div>
          <div className="space-y-4">
            <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-xs font-bold bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <i className="fa-solid fa-circle-nodes"></i> Core Gateway Engine
            </span>
            <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
              Aggregating Multi-Cloud Storage into a Single Workspace
            </h2>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
              **Clospol** (short for **Cloud Storage Pool**) is a modern, high-performance Multi-Cloud Storage Gateway. By aggregating Google Drive, Microsoft OneDrive, 
              Dropbox, Amazon Web Services S3 (compatible with Cloudflare R2, MinIO, and Backblaze B2), and local server directories 
              into a cohesive, secure platform, it provides system admins and teams with a single dashboard to manage distributed files. 
              Core operations—including data tiering, routing policies, WebDAV gateway access, automated database backups, activity audits, 
              CCTV surveillance aggregation, and chat bot integrations (WhatsApp & Discord)—are run under one unified control system.
            </p>
          </div>
        </div>

        {/* Two-Column Grid: Creator Profile vs System Architecture */}
        <div className="grid gap-6 md:grid-cols-2 w-full">
          
          {/* Project Details Card */}
          <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-5 flex flex-col justify-between">
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <i className="fa-solid fa-circle-info text-blue-500"></i> Project Details
                </h3>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                  General project metadata, licensing, and code distribution
                </p>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-semibold">
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500">Project Name</span>
                  <span className="font-bold text-slate-700 dark:text-slate-350">Clospol</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500">Author / Creator</span>
                  <a href={`https://${developerProfile.github}`} target="_blank" rel="noreferrer" className="font-bold text-blue-600 dark:text-blue-400 hover:underline">
                    {developerProfile.name}
                  </a>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500">Source Repository</span>
                  <a href={`https://${developerProfile.repository}`} target="_blank" rel="noreferrer" className="font-bold text-blue-600 dark:text-blue-400 hover:underline">
                    github.com/aaafarrr/Clospol
                  </a>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500">Software License</span>
                  <span className="font-bold text-slate-700 dark:text-slate-350">MIT License</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500">Contact Email</span>
                  <a href={`mailto:${developerProfile.email}`} className="font-bold text-blue-600 dark:text-blue-400 hover:underline">
                    {developerProfile.email}
                  </a>
                </div>
                <div className="py-2.5 flex justify-between items-center">
                  <span className="text-slate-400 dark:text-slate-500">Development Support</span>
                  <a href={developerProfile.support} target="_blank" rel="noreferrer" className="font-extrabold text-red-500 dark:text-red-400 hover:underline flex items-center gap-1.5">
                    <i className="fa-solid fa-heart animate-pulse"></i> SociaBuzz
                  </a>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1 text-xs font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
              <span className="font-extrabold text-slate-700 dark:text-slate-350 uppercase tracking-wide block text-[10px]">
                Open Source Licensing
              </span>
              <p className="text-[11px]">
                Clospol Storage Gateway is open-source software distributed under the MIT License. Contributions and issue reporting are highly welcome.
              </p>
            </div>
          </div>

          {/* System Spec & Architecture Card */}
          <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-5 flex flex-col justify-between">
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <i className="fa-solid fa-server text-blue-500"></i> Specifications & Health
                </h3>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                  Active gateway process metrics and infrastructure logs
                </p>
              </div>

              {/* Status Indicators */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 rounded-xl flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">WebDAV Engine</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-400 py-0.5 px-2 rounded-full border border-emerald-100 dark:border-emerald-900/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                    {systemStats.webdavStatus}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 rounded-xl flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">REST APIs</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-400 py-0.5 px-2 rounded-full border border-emerald-100 dark:border-emerald-900/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    {systemStats.apiStatus}
                  </span>
                </div>
              </div>

              {/* Spec Rows */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-semibold">
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500">Gateway Version</span>
                  <span className="font-bold text-slate-700 dark:text-slate-350">{systemStats.version}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500">Environment Node</span>
                  <span className="font-bold text-slate-700 dark:text-slate-350">{systemStats.environment}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500">Database Engine</span>
                  <span className="font-bold text-slate-700 dark:text-slate-350">{systemStats.database}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500">Continuous Uptime</span>
                  <span className="font-bold text-slate-700 dark:text-slate-350">{systemStats.uptime}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500">Platform Framework</span>
                  <span className="font-bold text-slate-700 dark:text-slate-350">Next.js & TypeScript</span>
                </div>
              </div>
            </div>

            {/* Architecture Small Card */}
            <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1 text-xs font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
              <span className="font-extrabold text-slate-700 dark:text-slate-350 uppercase tracking-wide block text-[10px]">
                Gateway Architecture
              </span>
              <p className="text-[11px]">
                The gateway unifies drive operations into SQLite nodes using asynchronous task queue workers. Storage quotas are aggregated concurrently via file meta schemas.
              </p>
            </div>
          </div>
        </div>

        {/* Feature Grid Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 px-1">
            Core Capabilities Checklist
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {coreFeatures.map((feat, index) => (
              <div 
                key={index}
                className="p-5 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm flex gap-4 transition hover:shadow-md hover:border-slate-300 dark:hover:border-slate-750"
              >
                <div className="h-10 w-10 shrink-0 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 flex items-center justify-center text-lg">
                  <i className={`fa-solid ${feat.icon}`}></i>
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 leading-none">
                    {feat.title}
                  </h4>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 leading-normal">
                    {feat.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </SidebarLayout>
  );
}
