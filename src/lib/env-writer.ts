import fs from "fs";
import path from "path";

const ENV_PATH = path.resolve(process.cwd(), ".env");

/**
 * Reads and parses the current .env file into a key-value object.
 */
export function readEnv(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) {
    return {};
  }
  const content = fs.readFileSync(ENV_PATH, "utf-8");
  const env: Record<string, string> = {};
  
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    
    const index = trimmed.indexOf("=");
    if (index > 0) {
      const key = trimmed.substring(0, index).trim();
      let val = trimmed.substring(index + 1).trim();
      
      // Strip quotes if any
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
      }
      env[key] = val;
    }
  }
  return env;
}

/**
 * Updates the given configurations in the .env file.
 */
export function writeEnv(updates: Record<string, string>) {
  const currentEnv = readEnv();
  const merged = { ...currentEnv, ...updates };

  let content = "";
  if (fs.existsSync(ENV_PATH)) {
    // We want to preserve comments and layout if possible, or just rebuild it.
    // Rebuilding is simpler and safer, but let's do a structured write.
    const lines = fs.readFileSync(ENV_PATH, "utf-8").split(/\r?\n/);
    const keysWritten = new Set<string>();
    
    const newLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return line;
      }
      const index = trimmed.indexOf("=");
      if (index > 0) {
        const key = trimmed.substring(0, index).trim();
        if (key in updates) {
          keysWritten.add(key);
          const val = updates[key];
          // Quote strings with spaces or special chars
          const quotedVal = val.includes(" ") || val.includes(":") || val.includes("/") ? `"${val}"` : val;
          return `${key}=${quotedVal}`;
        }
      }
      return line;
    });

    // Append any keys that weren't in the original file
    for (const [key, val] of Object.entries(updates)) {
      if (!keysWritten.has(key)) {
        const quotedVal = val.includes(" ") || val.includes(":") || val.includes("/") ? `"${val}"` : val;
        newLines.push(`${key}=${quotedVal}`);
      }
    }
    content = newLines.join("\n");
  } else {
    // Create new .env
    content = Object.entries(merged)
      .map(([key, val]) => {
        const quotedVal = val.includes(" ") || val.includes(":") || val.includes("/") ? `"${val}"` : val;
        return `${key}=${quotedVal}`;
      })
      .join("\n") + "\n";
  }

  fs.writeFileSync(ENV_PATH, content, "utf-8");

  // Dynamically update process.env for the currently running process
  for (const [key, val] of Object.entries(updates)) {
    process.env[key] = val;
  }
}
