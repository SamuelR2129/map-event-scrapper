import { test, expect } from "@playwright/test";
import { createServer as createNetServer, Server as NetServer } from "node:net";
import { createServer as createHttpServer, request as httpClient } from "node:http";
import type { AddressInfo } from "node:net";
import { parseAllowlist, isHostAllowed, createAllowlistProxy } from "./allowlist-proxy";

const RULES = parseAllowlist(`
# comment line
newcastlelive.com.au
*.bandcamp.com
127.0.0.1
`);

test.describe("parseAllowlist", () => {
  test("ignores blank lines and comments, parses exact and suffix rules", () => {
    expect(RULES).toEqual([
      { type: "exact", value: "newcastlelive.com.au" },
      { type: "suffix", value: "bandcamp.com" },
      { type: "exact", value: "127.0.0.1" },
    ]);
  });
});

test.describe("isHostAllowed", () => {
  test("matches exact hosts", () => {
    expect(isHostAllowed("newcastlelive.com.au", RULES)).toBe(true);
    expect(isHostAllowed("www.newcastlelive.com.au", RULES)).toBe(false);
  });

  test("suffix rules match the domain and any subdomain", () => {
    expect(isHostAllowed("bandcamp.com", RULES)).toBe(true);
    expect(isHostAllowed("artist.bandcamp.com", RULES)).toBe(true);
    expect(isHostAllowed("a.b.bandcamp.com", RULES)).toBe(true);
    expect(isHostAllowed("bandcamp.org", RULES)).toBe(false);
  });

  test("denies everything not listed", () => {
    expect(isHostAllowed("evil.example.com", RULES)).toBe(false);
    expect(isHostAllowed("", RULES)).toBe(false);
    expect(isHostAllowed("127.0.0.1", RULES)).toBe(true);
  });

  test("is case-insensitive", () => {
    expect(isHostAllowed("NewcastleLive.com.au", RULES)).toBe(true);
    expect(isHostAllowed("ARTIST.bandcamp.com", RULES)).toBe(true);
  });
});

test.describe("allowlist proxy", () => {
  async function listen(server: NetServer | import("node:http").Server): Promise<number> {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return (server.address() as AddressInfo).port;
  }

  async function shutdown(server: NetServer | import("node:http").Server): Promise<void> {
    (server as import("node:http").Server).closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }

  test("proxies plain HTTP to allowlisted hosts", async () => {
    const upstream = createHttpServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ path: req.url }));
    });
    const upstreamPort = await listen(upstream);

    const proxy = createAllowlistProxy({ rules: RULES });
    const proxyPort = await listen(proxy);

    try {
      const body = await new Promise<string>((resolve, reject) => {
        const req = httpClient(
          { host: "127.0.0.1", port: proxyPort, path: `http://127.0.0.1:${upstreamPort}/hello?x=1`, headers: { Host: `127.0.0.1:${upstreamPort}` } },
          (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => resolve(data));
          },
        );
        req.on("error", reject);
        req.end();
      });
      expect(JSON.parse(body)).toEqual({ path: "/hello?x=1" });
    } finally {
      await shutdown(proxy);
      await shutdown(upstream);
    }
  });

  test("returns 403 for HTTP to non-allowlisted hosts", async () => {
    const proxy = createAllowlistProxy({ rules: RULES });
    const proxyPort = await listen(proxy);

    try {
      const status = await new Promise<number>((resolve, reject) => {
        const req = httpClient(
          { host: "127.0.0.1", port: proxyPort, path: "http://evil.example.com:80/x", headers: { Host: "evil.example.com" } },
          (res) => {
            res.resume();
            res.on("end", () => resolve(res.statusCode ?? 0));
          },
        );
        req.on("error", reject);
        req.end();
      });
      expect(status).toBe(403);
    } finally {
      await shutdown(proxy);
    }
  });

  test("tunnels CONNECT to allowlisted hosts", async () => {
    const upstream = createNetServer((socket) => {
      socket.on("data", (c) => socket.write(c));
    });
    const upstreamPort = await new Promise<number>((resolve, reject) => {
      upstream.on("error", reject);
      upstream.listen(0, "127.0.0.1", () => {
        resolve((upstream.address() as AddressInfo).port);
      });
    });

    const proxy = createAllowlistProxy({ rules: RULES });
    const proxyPort = await listen(proxy);

    try {
      const { connect } = await import("node:net");
      const echoBack = await new Promise<string>((resolve, reject) => {
        const socket = connect(proxyPort, "127.0.0.1");
        let response = "";
        let established = false;
        const timer = setTimeout(() => reject(new Error("timeout")), 5000);
        socket.on("connect", () => {
          socket.write(`CONNECT 127.0.0.1:${upstreamPort} HTTP/1.1\r\nHost: 127.0.0.1:${upstreamPort}\r\n\r\n`);
        });
        socket.on("data", (chunk) => {
          response += chunk.toString();
          if (!established) {
            if (response.includes("Connection Established")) {
              established = true;
              socket.write("ping\r\n");
            }
          } else if (response.includes("ping")) {
            clearTimeout(timer);
            socket.destroy();
            resolve(response);
          }
        });
        socket.on("error", reject);
      });

      expect(echoBack).toContain("HTTP/1.1 200 Connection Established");
      expect(echoBack).toContain("ping");
    } finally {
      await shutdown(proxy);
      await shutdown(upstream);
    }
  });

  test("rejects CONNECT to non-allowlisted hosts with 403", async () => {
    const proxy = createAllowlistProxy({ rules: RULES });
    const proxyPort = await listen(proxy);

    try {
      const { connect } = await import("node:net");
      const reply = await new Promise<string>((resolve, reject) => {
        const socket = connect(proxyPort, "127.0.0.1");
        let response = "";
        const timer = setTimeout(() => reject(new Error("timeout")), 5000);
        socket.on("connect", () => {
          socket.write("CONNECT evil.example.com:443 HTTP/1.1\r\nHost: evil.example.com\r\n\r\n");
        });
        socket.on("data", (chunk) => {
          response += chunk.toString();
          if (response.includes("HTTP/1.1")) {
            clearTimeout(timer);
            socket.destroy();
            resolve(response);
          }
        });
        socket.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      expect(reply).toContain("403");
      expect(reply).toContain("egress denied by allowlist");
    } finally {
      await shutdown(proxy);
    }
  });
});