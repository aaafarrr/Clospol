import crypto from "crypto";

export interface OnvifDetails {
  device_url: string;
  media_url: string;
  profile_token: string;
  rtsp_url: string | null;
  snapshot_url: string | null;
}

export class OnvifService {
  /**
   * Normalize input IP or URL to ONVIF device service path.
   */
  static normalizeUrl(url: string): string {
    let cleanUrl = url.trim();
    if (cleanUrl === "") return "";

    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = "http://" + cleanUrl;
    }

    const parsed = new URL(cleanUrl);
    if (parsed.pathname === "/" || parsed.pathname === "") {
      cleanUrl = cleanUrl.replace(/\/+$/, "") + "/onvif/device_service";
    }

    return cleanUrl;
  }

  /**
   * Connect to ONVIF camera, authenticate, and retrieve stream/snapshot URIs.
   */
  static async connectAndFetch(url: string, username?: string | null, password?: string | null): Promise<OnvifDetails> {
    let deviceUrl = this.normalizeUrl(url);
    const parsed = new URL(deviceUrl);

    const capabilitiesBody = "<tds:GetCapabilities><tds:Category>All</tds:Category></tds:GetCapabilities>";
    let xmlResponse = "";
    let successfulUrl = deviceUrl;

    const hasExplicitPort = parsed.port !== "";
    const commonPorts = ["80", "8899", "8000", "8080", "5000"];

    if (hasExplicitPort) {
      try {
        xmlResponse = await this.sendSoapRequest(deviceUrl, capabilitiesBody, username, password);
      } catch (err: any) {
        // Fallback: try default /device_service
        const fallbackUrl = `${parsed.protocol}//${parsed.host}/device_service`;
        if (fallbackUrl !== deviceUrl) {
          try {
            xmlResponse = await this.sendSoapRequest(fallbackUrl, capabilitiesBody, username, password);
            successfulUrl = fallbackUrl;
          } catch (_) {
            throw new Error(`ONVIF Device Service connection failed on both endpoints for port ${parsed.port}: ${err.message}`);
          }
        } else {
          throw new Error(`ONVIF Device Service connection failed: ${err.message}`);
        }
      }
    } else {
      let lastErr: any = null;

      // Try default first (port 80)
      try {
        xmlResponse = await this.sendSoapRequest(deviceUrl, capabilitiesBody, username, password, 4000);
      } catch (err: any) {
        lastErr = err;
      }

      // Try fallback on port 80
      if (!xmlResponse) {
        const fallbackUrl = `${parsed.protocol}//${parsed.host}/device_service`;
        if (fallbackUrl !== deviceUrl) {
          try {
            xmlResponse = await this.sendSoapRequest(fallbackUrl, capabilitiesBody, username, password, 4000);
            successfulUrl = fallbackUrl;
          } catch (err: any) {
            lastErr = err;
          }
        }
      }

      // If still failed, scan alternative ports
      if (!xmlResponse) {
        for (const port of commonPorts) {
          if (port === "80") continue; // already tried
          const altHost = `${parsed.hostname}:${port}`;
          const altUrls = [
            `${parsed.protocol}//${altHost}/onvif/device_service`,
            `${parsed.protocol}//${altHost}/device_service`
          ];

          for (const altUrl of altUrls) {
            try {
              xmlResponse = await this.sendSoapRequest(altUrl, capabilitiesBody, username, password, 2000);
              successfulUrl = altUrl;
              break;
            } catch (err: any) {
              lastErr = err;
            }
          }
          if (xmlResponse) break;
        }
      }

      if (!xmlResponse) {
        throw new Error(`ONVIF connection failed on all common ports (tried 80, 8899, 8000, 8080, 5000). Last error: ${lastErr?.message || "fetch failed"}`);
      }
    }

    deviceUrl = successfulUrl;
    const resolvedParsed = new URL(deviceUrl);

    // Extract Media XAddr (using local-name regex to bypass namespace prefix issues)
    let mediaUrl: string | null = null;
    const mediaBlock = xmlResponse.match(/<[^:>]*:Media[^>]*>([\s\S]*?)<\/[^:>]*:Media>/) || xmlResponse.match(/<Media[^>]*>([\s\S]*?)<\/Media>/);
    if (mediaBlock) {
      const xaddrMatch = mediaBlock[1].match(/<[^:>]*:XAddr[^>]*>([\s\S]*?)<\/[^:>]*:XAddr>/) || mediaBlock[1].match(/<XAddr[^>]*>([\s\S]*?)<\/XAddr>/);
      if (xaddrMatch) {
        mediaUrl = xaddrMatch[1].trim();
      }
    }

    if (!mediaUrl) {
      // Fallback path
      mediaUrl = `${resolvedParsed.protocol}//${resolvedParsed.host}/onvif/media_service`;
    }

    // 2. Get Profiles
    const profilesBody = "<trt:GetProfiles />";
    let profilesXml = "";
    try {
      profilesXml = await this.sendSoapRequest(mediaUrl, profilesBody, username, password);
    } catch (err: any) {
      throw new Error(`ONVIF Media Service failed to fetch profiles: ${err.message}`);
    }

    // Extract profile token of the first profile
    const tokenMatch = profilesXml.match(/token="([^"]+)"/) || profilesXml.match(/token='([^']+)'/);
    if (!tokenMatch) {
      throw new Error("No ONVIF media profile tokens found on this camera.");
    }
    const profileToken = tokenMatch[1];

    // 3. Get Stream URI (RTSP stream link)
    const streamBody = `
      <trt:GetStreamUri>
        <trt:StreamSetup>
          <tt:Stream>RTP-Unicast</tt:Stream>
          <tt:Transport>
            <tt:Protocol>RTSP</tt:Protocol>
          </tt:Transport>
        </trt:StreamSetup>
        <trt:ProfileToken>${profileToken}</trt:ProfileToken>
      </trt:GetStreamUri>
    `;

    let rtspUrl: string | null = null;
    try {
      const streamXml = await this.sendSoapRequest(mediaUrl, streamBody, username, password);
      const uriMatch = streamXml.match(/<[^:>]*:Uri[^>]*>([\s\S]*?)<\/[^:>]*:Uri>/) || streamXml.match(/<Uri[^>]*>([\s\S]*?)<\/Uri>/);
      if (uriMatch) {
        rtspUrl = uriMatch[1].trim();
        try {
          const rtspParsed = new URL(rtspUrl);
          if (rtspParsed.hostname !== resolvedParsed.hostname) {
            rtspParsed.hostname = resolvedParsed.hostname;
          }
          if (username && password) {
            rtspParsed.username = encodeURIComponent(username);
            rtspParsed.password = encodeURIComponent(password);
          }
          rtspUrl = rtspParsed.toString();
        } catch (_) {
          if (username && password) {
            rtspUrl = rtspUrl.replace("rtsp://", `rtsp://${encodeURIComponent(username)}:${encodeURIComponent(password)}@`);
          }
        }
      }
    } catch (err: any) {
      console.warn(`Failed to fetch ONVIF Stream URI: ${err.message}`);
    }

    // 4. Get Snapshot URI
    const snapshotBody = `
      <trt:GetSnapshotUri>
        <trt:ProfileToken>${profileToken}</trt:ProfileToken>
      </trt:GetSnapshotUri>
    `;

    let snapshotUrl: string | null = null;
    try {
      const snapshotXml = await this.sendSoapRequest(mediaUrl, snapshotBody, username, password);
      const uriMatch = snapshotXml.match(/<[^:>]*:Uri[^>]*>([\s\S]*?)<\/[^:>]*:Uri>/) || snapshotXml.match(/<Uri[^>]*>([\s\S]*?)<\/Uri>/);
      if (uriMatch) {
        snapshotUrl = uriMatch[1].trim();
        try {
          const snapParsed = new URL(snapshotUrl);
          if (snapParsed.host !== resolvedParsed.host) {
            snapParsed.host = resolvedParsed.host;
            snapParsed.protocol = resolvedParsed.protocol;
            snapshotUrl = snapParsed.toString();
          }
        } catch (_) {
          if (snapshotUrl.startsWith("/")) {
            snapshotUrl = `${resolvedParsed.protocol}//${resolvedParsed.host}${snapshotUrl}`;
          } else {
            snapshotUrl = `${resolvedParsed.protocol}//${resolvedParsed.host}/${snapshotUrl}`;
          }
        }
      }
    } catch (err: any) {
      console.warn(`Failed to fetch ONVIF Snapshot URI: ${err.message}`);
    }

    return {
      device_url: deviceUrl,
      media_url: mediaUrl,
      profile_token: profileToken,
      rtsp_url: rtspUrl,
      snapshot_url: snapshotUrl,
    };
  }

  /**
   * Fetch image bytes (as Buffer) using HTTP basic/digest negotiation.
   */
  static async fetchOnvifSnapshot(url: string, username?: string | null, password?: string | null): Promise<Buffer> {
    if (!url) {
      throw new Error("ONVIF camera snapshot URL is empty.");
    }

    // Simple fetch with abort controller
    const fetchWithTimeout = async (requestUrl: string, options: RequestInit = {}): Promise<Response> => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 10000); // 10s timeout
      try {
        const response = await fetch(requestUrl, {
          ...options,
          signal: controller.signal,
        });
        clearTimeout(id);
        return response;
      } catch (err) {
        clearTimeout(id);
        throw err;
      }
    };

    let response = await fetchWithTimeout(url);

    if ((response.status === 401 || response.status === 500) && username && password) {
      // Preemptively try Basic Auth first
      const basicHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
      const basicResponse = await fetchWithTimeout(url, { headers: { Authorization: basicHeader } });
      
      if (basicResponse.ok) {
        response = basicResponse;
      } else if (response.status === 401) {
        // Fallback to digest/standard Basic Auth if the camera returned a proper 401
        const authHeader = response.headers.get("WWW-Authenticate") || "";
        
        if (/digest/i.test(authHeader)) {
          // Simple Digest Auth builder (negotiates username/password/nonce/realm)
          const realmMatch = authHeader.match(/realm="([^"]+)"/);
          const nonceMatch = authHeader.match(/nonce="([^"]+)"/);
          const qopMatch = authHeader.match(/qop="([^"]+)"/);

          if (realmMatch && nonceMatch) {
            const realm = realmMatch[1];
            const nonce = nonceMatch[1];
            const qop = qopMatch ? qopMatch[1] : null;

            const parsedUrl = new URL(url);
            const uri = parsedUrl.pathname + parsedUrl.search;
            const method = "GET";

            const ha1 = crypto.createHash("md5").update(`${username}:${realm}:${password}`).digest("hex");
            const ha2 = crypto.createHash("md5").update(`${method}:${uri}`).digest("hex");
            
            let responseDigest = "";
            if (qop === "auth") {
              const nc = "00000001";
              const cnonce = crypto.randomBytes(8).toString("hex");
              responseDigest = crypto
                .createHash("md5")
                .update(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`)
                .digest("hex");

              const digestHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=auth, nc=${nc}, cnonce="${cnonce}", response="${responseDigest}"`;
              const digestResponse = await fetchWithTimeout(url, { headers: { Authorization: digestHeader } });
              if (digestResponse.ok) response = digestResponse;
            } else {
              responseDigest = crypto.createHash("md5").update(`${ha1}:${nonce}:${ha2}`).digest("hex");
              const digestHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${responseDigest}"`;
              const digestResponse = await fetchWithTimeout(url, { headers: { Authorization: digestHeader } });
              if (digestResponse.ok) response = digestResponse;
            }
          }
        }
      }
    }

    if (!response.ok) {
      throw new Error(`Snapshot fetch returned HTTP status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Helper to send SOAP request with WS-Security UsernameToken header.
   */
  private static async sendSoapRequest(url: string, soapBody: string, username?: string | null, password?: string | null, timeoutMs = 8000): Promise<string> {
    let headerXml = "";
    if (username && password) {
      const created = new Date().toISOString().replace(/\.\d+Z$/, "Z");
      const nonceBytes = crypto.randomBytes(16);
      const nonce = nonceBytes.toString("base64");
      
      const sha1 = crypto.createHash("sha1");
      sha1.update(Buffer.concat([nonceBytes, Buffer.from(created), Buffer.from(password)]));
      const digest = sha1.digest("base64");

      headerXml = `
        <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
          <wsse:UsernameToken>
            <wsse:Username>${username}</wsse:Username>
            <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</wsse:Password>
            <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce}</wsse:Nonce>
            <wsu:Created>${created}</wsu:Created>
          </wsse:UsernameToken>
        </wsse:Security>
      `;
    }

    const payload = `<?xml version="1.0" encoding="utf-8"?>
      <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
                     xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
                     xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
                     xmlns:tt="http://www.onvif.org/ver10/schema">
        <soap:Header>${headerXml}</soap:Header>
        <soap:Body>${soapBody}</soap:Body>
      </soap:Envelope>
    `;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/soap+xml; charset=utf-8",
        },
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(id);

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`SOAP response status ${response.status}: ${responseText}`);
      }

      return responseText;
    } catch (err: any) {
      clearTimeout(id);
      throw err;
    }
  }
}
