import { createServer, request as httpRequest } from "node:http";
import { connect } from "node:net";
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";

export type AllowRule = { type: "exact" | "suffix"; value: string };

export const parseAllowlist = (text: string): AllowRule[] => {
  const rules: AllowRule[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("*.")) {
      rules.push({ type: "suffix", value: line.slice(2).toLowerCase() });
    } else {
      rules.push({ type: "exact", value: line.toLowerCase() });
    }
  }
  return rules;
};

export const isHostAllowed = (host: string, rules: AllowRule[]): boolean => {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return rules.some((rule) => {
    if (rule.type === "exact") return rule.value === h;
    return h === rule.value || h.endsWith("." + rule.value);
  });
};

export const loadRules = (path: string): AllowRule[] => parseAllowlist(readFileSync(path, "utf-8"));

export type ProxyOptions = {
  rules: AllowRule[];
  logPath?: string | null;
};

const DENIED_BODY = JSON.stringify({ error: "egress denied by allowlist" });

export const createAllowlistProxy = ({ rules, logPath = null }: ProxyOptions) => {
  const log = (msg: string) => {
    if (!logPath) return;
    try {
      const dir = logPath.slice(0, Math.max(logPath.lastIndexOf("/"), 0)) || ".";
      mkdirSync(dir, { recursive: true });
      appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`);
    } catch {
      // Logging is best-effort; never let it break the proxy.
    }
  };

  const deny = (res: { writeHead: (code: number, headers: Record<string, string>) => void; end: (body?: string) => void }) => {
    res.writeHead(403, { "Content-Type": "application/json", "X-Egress-Allowlist": "denied" });
    res.end(DENIED_BODY);
  };

  const server = createServer();

  server.on("request", (req, res) => {
    let target: URL;
    try {
      target = new URL(req.url ?? "");
    } catch {
      deny(res);
      return;
    }

    if (target.protocol !== "http:") {
      deny(res);
      return;
    }

    const host = target.hostname;
    if (!isHostAllowed(host, rules)) {
      log(`DENY ${req.method ?? "GET"} http ${host}`);
      deny(res);
      return;
    }

    const proxyReq = httpRequest(
      {
        method: req.method,
        hostname: host,
        port: target.port || 80,
        path: target.pathname + target.search,
        headers: req.headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on("error", () => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end();
    });
    req.pipe(proxyReq);
  });

  server.on("connect", (req, clientSocket, head) => {
    const [rawHost, rawPort] = (req.url ?? ":443").split(":");
    const host = (rawHost || "").replace(/^\[|\]$/g, "");
    const port = Number(rawPort) || 443;

    if (!isHostAllowed(host, rules)) {
      log(`DENY CONNECT ${host}`);
      clientSocket.end(`HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\nX-Egress-Allowlist: denied\r\nContent-Length: ${Buffer.byteLength(DENIED_BODY)}\r\n\r\n${DENIED_BODY}`);
      return;
    }

    const upstream = connect(port, host, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head?.length) upstream.write(head);
      clientSocket.pipe(upstream);
      upstream.pipe(clientSocket);
    });
    upstream.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => upstream.destroy());
  });

  server.on("clientError", (_err, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });

  return server;
};

if (require.main === module) {
  const rulesPath = process.env.EGRESS_ALLOWLIST ?? "/usr/local/etc/egress-allowlist.txt";
  const port = Number(process.env.EGRESS_PORT) || 7443;
  const host = process.env.EGRESS_HOST ?? "127.0.0.1";
  const logPath = process.env.EGRESS_LOG ?? "logs/egress.log";

  const rules = loadRules(rulesPath);
  const server = createAllowlistProxy({ rules, logPath });
  server.listen(port, host, () => {
    console.log(`[egress] allowlist proxy listening on ${host}:${port} (${rules.length} rules from ${rulesPath})`);
  });
}