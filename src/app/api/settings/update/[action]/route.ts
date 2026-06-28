import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);
const GITHUB_RELEASE_URL = "https://api.github.com/repos/aaafarrr/Clospol/releases/latest";

function copyDirRecursiveSync(src: string, dest: string) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    // Skip operational directories and critical local data
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === ".next" ||
      entry.name === "dev.db" ||
      entry.name === "dev.db-journal" ||
      entry.name === ".env" ||
      entry.name === "storage"
    ) {
      continue;
    }
    
    if (entry.isDirectory()) {
      copyDirRecursiveSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function cleanVersion(v: string): string {
  return v.trim().replace(/^v/, "");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await params;
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (action !== "check") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }

    // Read current package version
    const pkgPath = path.join(process.cwd(), "package.json");
    let currentVersion = "1.0.0";
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        currentVersion = pkg.version || "1.0.0";
      } catch (e) {}
    }
    if (process.env.APP_VERSION) {
      currentVersion = process.env.APP_VERSION;
    }

    // Fetch latest release from GitHub
    let latestVersion = currentVersion;
    let releaseNotes = "";
    let updateAvailable = false;
    let zipballUrl = "";

    try {
      const gitRes = await fetch(GITHUB_RELEASE_URL, {
        headers: {
          "User-Agent": "Clospol-Storage-Gateway",
          "Accept": "application/vnd.github.v3+json"
        },
        next: { revalidate: 60 } // Cache for 60 seconds
      });

      if (gitRes.ok) {
        const releaseData = await gitRes.json();
        latestVersion = releaseData.tag_name || "";
        releaseNotes = releaseData.body || "";
        zipballUrl = releaseData.zipball_url || "";

        const cleanCurrent = cleanVersion(currentVersion);
        const cleanLatest = cleanVersion(latestVersion);

        if (cleanLatest && cleanLatest !== cleanCurrent) {
          updateAvailable = true;
        }
      } else {
        console.error("GitHub API response not OK:", gitRes.status);
      }
    } catch (err) {
      console.error("Error calling GitHub Releases API:", err);
    }

    return NextResponse.json({
      success: true,
      current_version: currentVersion,
      latest_version: latestVersion,
      update_available: updateAvailable,
      release_notes: releaseNotes,
      zipball_url: zipballUrl
    });
  } catch (err: any) {
    console.error("Check update error:", err);
    return NextResponse.json({ success: false, error: err.message || "Failed to query system updates" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await params;
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (action !== "install") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }

    console.log("[Updater] Initiating system auto-update...");

    let updateFetched = false;
    
    // Step 1: Try pulling from Git
    try {
      console.log("[Updater] Attempting git pull...");
      await execAsync("git rev-parse --is-inside-work-tree");
      await execAsync("git pull");
      console.log("[Updater] Git pull completed successfully.");
      updateFetched = true;
    } catch (gitErr) {
      console.log("[Updater] Git pull failed or not in a git repo. Fetching ZIP archive from release...");
    }

    // Step 2: Fallback to downloading ZIP release archive if Git pull didn't apply
    if (!updateFetched) {
      try {
        const gitRes = await fetch(GITHUB_RELEASE_URL, {
          headers: {
            "User-Agent": "Clospol-Storage-Gateway",
            "Accept": "application/vnd.github.v3+json"
          }
        });

        if (!gitRes.ok) {
          throw new Error("Unable to obtain latest release download URL from GitHub API.");
        }

        const releaseData = await gitRes.json();
        const zipUrl = releaseData.zipball_url;
        if (!zipUrl) {
          throw new Error("No zipball_url found in release data.");
        }

        console.log(`[Updater] Downloading release zipball from ${zipUrl}...`);
        const zipRes = await fetch(zipUrl, {
          headers: { "User-Agent": "Clospol-Storage-Gateway" }
        });
        
        if (!zipRes.ok) {
          throw new Error(`Failed to download release zip archive: ${zipRes.statusText}`);
        }

        const arrayBuffer = await zipRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const tempZipPath = path.join(process.cwd(), "temp-update.zip");
        fs.writeFileSync(tempZipPath, buffer);
        
        console.log("[Updater] Extracting package files...");
        const AdmZip = require("adm-zip");
        const zip = new AdmZip(tempZipPath);
        
        const tempExtractDir = path.join(process.cwd(), "temp-extract");
        zip.extractAllTo(tempExtractDir, true);
        
        const dirs = fs.readdirSync(tempExtractDir);
        const innerDir = dirs.find(d => fs.statSync(path.join(tempExtractDir, d)).isDirectory());
        
        if (innerDir) {
          const sourcePath = path.join(tempExtractDir, innerDir);
          console.log(`[Updater] Copying files from ${sourcePath} to ${process.cwd()}...`);
          copyDirRecursiveSync(sourcePath, process.cwd());
          
          // Update local version in package.json and environment if available
          try {
            const innerPkgPath = path.join(sourcePath, "package.json");
            if (fs.existsSync(innerPkgPath)) {
              const innerPkg = JSON.parse(fs.readFileSync(innerPkgPath, "utf-8"));
              const latestVer = innerPkg.version || releaseData.tag_name || "1.0.0";
              
              // Rewrite local package.json with latest version tag if needed
              const localPkgPath = path.join(process.cwd(), "package.json");
              if (fs.existsSync(localPkgPath)) {
                const localPkg = JSON.parse(fs.readFileSync(localPkgPath, "utf-8"));
                localPkg.version = latestVer;
                fs.writeFileSync(localPkgPath, JSON.stringify(localPkg, null, 2), "utf-8");
              }
            }
          } catch (pkgErr) {
            console.error("[Updater] Failed to write updated version to package.json:", pkgErr);
          }
        } else {
          throw new Error("Invalid release zip structure: missing inner directory folder.");
        }

        // Clean temporary resources
        fs.rmSync(tempZipPath, { force: true });
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
        
        console.log("[Updater] Package file extraction completed.");
        updateFetched = true;
      } catch (zipErr: any) {
        console.error("[Updater] ZIP release update failed:", zipErr);
        return NextResponse.json({ success: false, message: zipErr.message || "Failed to download and extract update package." }, { status: 500 });
      }
    }

    // Step 3: Run package manager install to fetch any new dependency keys
    try {
      console.log("[Updater] Running npm install...");
      await execAsync("npm install");
      console.log("[Updater] Dependency installation completed.");
    } catch (npmInstallErr: any) {
      console.error("[Updater] npm install failed:", npmInstallErr);
      // We continue since existing dependencies might still suffice or run dev mode
    }

    // Step 4: Recompile NextJS production bundles
    try {
      console.log("[Updater] Running npm run build to compile production bundle...");
      await execAsync("npm run build");
      console.log("[Updater] Production rebuild completed successfully.");
    } catch (npmBuildErr: any) {
      console.error("[Updater] npm run build failed:", npmBuildErr);
      return NextResponse.json({ success: false, message: "Update downloaded but compiling production build failed. Please check build logs." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "System updated successfully."
    });
  } catch (err: any) {
    console.error("Install update error:", err);
    return NextResponse.json({ success: false, message: err.message || "System update failed." }, { status: 500 });
  }
}
