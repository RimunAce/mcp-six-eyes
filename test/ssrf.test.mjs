import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertPublicHttpUrl,
  hostnameToLiteralIPs,
  isBlockedHostname,
  isBlockedIP,
  isPrivateIPv4,
  isPrivateIPv6,
} from "../build/ssrf.js";

describe("ssrf guards", () => {
  it("classifies private IPv4 and metadata", () => {
    assert.equal(isPrivateIPv4("10.1.2.3"), true);
    assert.equal(isPrivateIPv4("172.16.0.1"), true);
    assert.equal(isPrivateIPv4("172.31.255.255"), true);
    assert.equal(isPrivateIPv4("192.168.0.1"), true);
    assert.equal(isPrivateIPv4("127.0.0.1"), true);
    assert.equal(isPrivateIPv4("169.254.1.1"), true);
    assert.equal(isPrivateIPv4("0.0.0.0"), true);
    assert.equal(isPrivateIPv4("8.8.8.8"), false);
    assert.equal(isBlockedIP("169.254.169.254"), true);
    assert.equal(isBlockedIP("100.100.100.200"), true);
    assert.equal(isBlockedIP("93.184.216.34"), false);
  });

  it("classifies private IPv6", () => {
    assert.equal(isPrivateIPv6("::1"), true);
    assert.equal(isPrivateIPv6("fe80::1"), true);
    assert.equal(isPrivateIPv6("fd12:3456:789a::1"), true);
    assert.equal(isPrivateIPv6("::ffff:127.0.0.1"), true);
    assert.equal(isPrivateIPv6("2001:4860:4860::8888"), false);
  });

  it("blocks localhost and metadata hostnames", () => {
    assert.equal(isBlockedHostname("localhost"), true);
    assert.equal(isBlockedHostname("metadata.google.internal"), true);
    assert.equal(isBlockedHostname("example.com"), false);
  });

  it("treats dword and short IPv4 as literals", () => {
    assert.deepEqual(hostnameToLiteralIPs("2130706433"), ["127.0.0.1"]);
    assert.deepEqual(hostnameToLiteralIPs("127.1"), ["127.0.0.1"]);
  });

  it("rejects private URLs before fetch", async () => {
    await assert.rejects(
      () => assertPublicHttpUrl("http://127.0.0.1/x"),
      /Blocked private or metadata/,
    );
    await assert.rejects(
      () =>
        assertPublicHttpUrl("https://internal.example", {
          lookup: async () => ["10.0.0.8"],
        }),
      /Blocked private or metadata/,
    );
    const url = await assertPublicHttpUrl("https://cdn.example/a.png", {
      lookup: async () => ["93.184.216.34"],
    });
    assert.equal(url.hostname, "cdn.example");
  });
});
