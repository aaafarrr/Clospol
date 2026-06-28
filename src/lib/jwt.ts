import crypto from "crypto";

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || "clospol-default-jwt-secret-at-least-32-chars";

export function signToken(payload: any, expiresInSeconds: number = 86400): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const data = Buffer.from(JSON.stringify({ ...payload, exp })).toString("base64url");
  
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${data}`)
    .digest("base64url");
    
  return `${header}.${data}.${signature}`;
}

export function verifyToken(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    const [header, data, signature] = parts;
    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${data}`)
      .digest("base64url");
      
    if (signature !== expectedSig) return null;
    
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf-8"));
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return null; // Expired
    }
    
    return payload;
  } catch (_) {
    return null;
  }
}
