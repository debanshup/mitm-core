import assert from "assert/strict";
import * as http from "http";
import net from "net";
import {
  parseConnectData,
  parseHttpRequestData,
} from "../../../src/utils/parser/parseReqData";

describe("parseConnectData()", () => {
  it("should parse host and default HTTPS port", () => {
    const req = {
      url: "example.com",
    } as http.IncomingMessage;

    const result = parseConnectData(req);

    assert.equal(result.host, "example.com");
    assert.equal(result.port, 443);
    assert.equal(result.url, "example.com");
  });

  it("should parse host and explicit port", () => {
    const req = {
      url: "example.com:8443",
    } as http.IncomingMessage;

    const result = parseConnectData(req);

    assert.equal(result.host, "example.com");
    assert.equal(result.port, 8443);
    assert.equal(result.url, "example.com:8443");
  });

  it("should parse an IPv6 CONNECT target", () => {
    const req = {
      url: "[::1]:443",
    } as http.IncomingMessage;

    const result = parseConnectData(req);

    assert.equal(result.host, "::1");
    assert.equal(result.port, 443);
    assert.equal(result.url, "[::1]:443");
  });

  it("should return empty values when the request URL is missing", () => {
    const req = {
      url: undefined,
    } as http.IncomingMessage;

    const result = parseConnectData(req);

    assert.equal(result.host, "");
    assert.equal(result.port, null);
    assert.equal(result.url, "");
  });

  it("should return an empty host and null port for an invalid target", () => {
    const req = {
      url: "not a valid target",
    } as http.IncomingMessage;

    const result = parseConnectData(req);

    assert.equal(result.host, "");
    assert.equal(result.port, null);
    assert.equal(result.url, "not a valid target");
  });
});

describe("parseHttpRequestData()", () => {
  it("should parse a normal HTTP request", () => {
    const req = {
      url: "/api/users?page=1",
      headers: {
        host: "example.com",
      },
      socket: new net.Socket(),
    } as http.IncomingMessage;

    const result = parseHttpRequestData(req);

    assert.equal(result.protocol, "http:");
    assert.equal(result.host, "example.com");
    assert.equal(result.port, 80);
    assert.equal(result.path, "/api/users?page=1");
    assert.equal(result.fullUrl, "http://example.com/api/users?page=1");
    assert.equal(result.isEncrypted, false);
    assert.equal(result.applicationProtocol, "http");
  });

  it("should parse an explicit port from the Host header", () => {
    const req = {
      url: "/test",
      headers: {
        host: "example.com:8080",
      },
      socket: new net.Socket(),
    } as http.IncomingMessage;

    const result = parseHttpRequestData(req);

    assert.equal(result.host, "example.com");
    assert.equal(result.port, 8080);
  });

  it("should parse an absolute HTTP URL", () => {
    const req = {
      url: "http://example.com/test?q=1",
      headers: {
        host: "proxy.example",
      },
      socket: new net.Socket(),
    } as http.IncomingMessage;

    const result = parseHttpRequestData(req);

    assert.equal(result.protocol, "http:");
    assert.equal(result.host, "example.com");
    assert.equal(result.port, 80);
    assert.equal(result.path, "/test?q=1");
    assert.equal(result.fullUrl, "http://example.com/test?q=1");
  });

  it("should detect HTTPS using forceEncrypted", () => {
    const req = {
      url: "/secure",
      headers: {
        host: "example.com",
      },
      socket: new net.Socket(),
    } as http.IncomingMessage;

    const result = parseHttpRequestData(req, undefined, true);

    assert.equal(result.protocol, "https:");
    assert.equal(result.host, "example.com");
    assert.equal(result.port, 443);
    assert.equal(result.isEncrypted, true);
  });

  it("should detect WebSocket requests", () => {
    const req = {
      url: "/socket",
      headers: {
        host: "example.com",
        upgrade: "websocket",
      },
      socket: new net.Socket(),
    } as http.IncomingMessage;

    const result = parseHttpRequestData(req);

    assert.equal(result.applicationProtocol, "websocket");
  });

  it("should treat a normal request as HTTP", () => {
    const req = {
      url: "/test",
      headers: {
        host: "example.com",
      },
      socket: new net.Socket(),
    } as http.IncomingMessage;

    const result = parseHttpRequestData(req);

    assert.equal(result.applicationProtocol, "http");
  });
});
