import { test, expect } from "@playwright/test";
import { isBlockedExternalUrl, isBlockedHostname, isPrivateOrInternalIp, isSafeExternalUrl } from "./ssrf";

test.describe("isPrivateOrInternalIp", () => {
  test("flags private, loopback, link-local and reserved IPv4", () => {
    for (const ip of [
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "127.0.0.1",
      "0.0.0.0",
      "169.254.169.254",
      "100.64.0.1",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isPrivateOrInternalIp(ip), ip).toBe(true);
    }
  });

  test("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "151.101.1.140", "203.0.113.5"]) {
      expect(isPrivateOrInternalIp(ip), ip).toBe(false);
    }
  });

  test("blocks internal IPv6", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "ff02::1"]) {
      expect(isPrivateOrInternalIp(ip), ip).toBe(true);
    }
  });

  test("allows public IPv6", () => {
    expect(isPrivateOrInternalIp("2606:4700:4700::1111")).toBe(false);
  });
});

test.describe("isBlockedHostname", () => {
  test("blocks host aliases and internal suffixes", () => {
    for (const host of [
      "localhost",
      "host.docker.internal",
      "gateway.docker.internal",
      "intranet.corp.internal",
      "printer.local",
      "myrouter.home.arpa",
    ]) {
      expect(isBlockedHostname(host), host).toBe(true);
    }
  });

  test("allows public hostnames and raw IP handling", () => {
    for (const host of ["bandcamp.com", "newcastlelive.com.au", "sub.example.com"]) {
      expect(isBlockedHostname(host), host).toBe(false);
    }
  });
});

test.describe("isBlockedExternalUrl", () => {
  test("blocks non-http schemes", () => {
    for (const raw of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "file:///etc/passwd"]) {
      expect(isBlockedExternalUrl(raw), raw).toBe(true);
    }
  });

  test("blocks internal URLs by ip and hostname", () => {
    for (const raw of [
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/admin",
      "https://192.168.1.1/",
      "http://host.docker.internal:3000/admin",
      "http://[::1]/",
    ]) {
      expect(isBlockedExternalUrl(raw), raw).toBe(true);
    }
  });

  test("allows public http(s) urls", () => {
    for (const raw of ["https://bandcamp.com/discover/techno", "http://example.com/x", "https://newcastlelive.com.au/"]) {
      expect(isBlockedExternalUrl(raw), raw).toBe(false);
    }
  });
});

test.describe("isSafeExternalUrl", () => {
  test("allows public hostnames after dns resolution", async () => {
    const result = await isSafeExternalUrl("https://example.com/");
    expect(result.safe).toBe(true);
  });

  test("blocks urls resolving to internal ips", async () => {
    const result = await isSafeExternalUrl("http://127.0.0.1/");
    expect(result.safe).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  test("blocks private ip literals", async () => {
    const result = await isSafeExternalUrl("http://169.254.169.254/latest/meta-data/");
    expect(result.safe).toBe(false);
    expect(result.reason).toBe("blocked hostname: 169.254.169.254");
  });
});