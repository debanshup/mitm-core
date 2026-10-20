import assert from "node:assert/strict";
import tls from "node:tls";
import { CertificateCacheManager } from "../../../../src/core/cache/CertificateCacheManager";
import { pool } from "../../../../src/core/workers/pool/Worker_pool";
import { SecureContextManager } from "../../../../src/core/security/SecureContextManager";
import type { ProxyConfig } from "../../../../src/config.registry";

export const createProxyConfig = (
  overrides?: Partial<ProxyConfig>,
): ProxyConfig => {
  const rootCa = {
    cert: Buffer.from("ROOT CA CERT"),
    key: Buffer.from("ROOT CA KEY"),
  };
  return {
    useCertificateCache: true,
    useResponseCache: false,
    useDefaultPipelines: true,
    handshakeTimeoutMs: 5000,
    rootCa,
    ...overrides,
  };
};

const config = createProxyConfig();

describe("SecureContextManager", () => {
  const originalgetLeafFromCache = CertificateCacheManager.getLeafFromCache;

  const originalPoolRun = pool.run;
  const originalCreateSecureContext = tls.createSecureContext;

  afterEach(() => {
    CertificateCacheManager.getLeafFromCache = originalgetLeafFromCache;

    pool.run = originalPoolRun;
    tls.createSecureContext = originalCreateSecureContext;
  });

  it("should create a SecureContext from the cached CA", async () => {
    const host = `get-ca-${Date.now()}.example.com`;
    const fakeContext = {} as tls.SecureContext;
    const originalgetLeafFromCache = CertificateCacheManager.getLeafFromCache;
    const originalCreateSecureContext = tls.createSecureContext;
    CertificateCacheManager.getLeafFromCache = (async (
      receivedHost,
      receivedCaConfig,
    ) => {
      assert.equal(receivedHost, host);
      assert.deepEqual(receivedCaConfig, config.rootCa);

      return {
        cert: Buffer.from("CERT"),
        key: Buffer.from("KEY"),
      };
    }) as typeof CertificateCacheManager.getLeafFromCache;

    tls.createSecureContext = ((options: any) => {
      assert.deepEqual(options, {
        cert: Buffer.from("CERT"),
        key: Buffer.from("KEY"),
      });

      return fakeContext;
    }) as typeof tls.createSecureContext;

    try {
      const result = await SecureContextManager.getSecureContext(host, config);

      assert.equal(result, fakeContext);
    } finally {
      CertificateCacheManager.getLeafFromCache = originalgetLeafFromCache;
      tls.createSecureContext = originalCreateSecureContext;
    }
  });

  it("should return the cached SecureContext", async () => {
    const host = `cached-${Date.now()}.example.com`;
    const fakeContext = {} as tls.SecureContext;

    let createCalled = 0;

    CertificateCacheManager.getLeafFromCache = (async () => ({
      cert: Buffer.from("CERT"),
      key: Buffer.from("KEY"),
    })) as typeof CertificateCacheManager.getLeafFromCache;

    tls.createSecureContext = (() => {
      createCalled++;
      return fakeContext;
    }) as typeof tls.createSecureContext;

    const first = await SecureContextManager.getSecureContext(host, config);
    const second = await SecureContextManager.getSecureContext(host, config);

    assert.equal(first, fakeContext);
    assert.equal(second, fakeContext);
    assert.equal(createCalled, 1);
  });

  it("should generate and cache a SecureContext", async () => {
    const host = `generate-${Date.now()}.example.com`;
    const fakeContext = {} as tls.SecureContext;

    let workerCalled = 0;

    pool.run = (async () => {
      workerCalled++;

      return {
        cert: Buffer.from("GENERATED CERT"),
        key: Buffer.from("GENERATED KEY"),
      };
    }) as typeof pool.run;

    tls.createSecureContext = ((options: any) => {
      assert.deepEqual(options, {
        cert: Buffer.from("GENERATED CERT"),
        key: Buffer.from("GENERATED KEY"),
      });

      return fakeContext;
    }) as typeof tls.createSecureContext;

    const result = await SecureContextManager.generateSecureContext(host, config);

    assert.equal(result, fakeContext);
    assert.equal(workerCalled, 1);
  });

  it("should deduplicate concurrent generateSecureContext calls", async () => {
    const host = `concurrent-${Date.now()}.example.com`;
    const fakeContext = {} as tls.SecureContext;

    let workerCalled = 0;

    pool.run = (async () => {
      workerCalled++;

      await new Promise((resolve) => setTimeout(resolve, 50));

      return {
        cert: Buffer.from("CERT"),
        key: Buffer.from("KEY"),
      };
    }) as typeof pool.run;

    tls.createSecureContext = (() => {
      return fakeContext;
    }) as typeof tls.createSecureContext;

    const first = SecureContextManager.generateSecureContext(host, config);
    const second = SecureContextManager.generateSecureContext(host, config);

    const [firstResult, secondResult] = await Promise.all([first, second]);

    assert.equal(firstResult, fakeContext);
    assert.equal(secondResult, fakeContext);
    assert.equal(workerCalled, 1);
  });

  it("should clear the in-flight task after generation failure", async () => {
    const host = `failure-${Date.now()}.example.com`;

    let workerCalled = 0;

    pool.run = (async () => {
      workerCalled++;
      throw new Error("generation failed");
    }) as typeof pool.run;

    await assert.rejects(
      SecureContextManager.generateSecureContext(host, config),
      /generation failed/,
    );

    assert.equal(workerCalled, 1);

    await assert.rejects(
      SecureContextManager.generateSecureContext(host, config),
      /generation failed/,
    );

    assert.equal(workerCalled, 2);
  });

  it("should reject generateSecureContext when root CA is missing", async () => {
    const config = createProxyConfig({
      rootCa: undefined,
    });

    await assert.rejects(
      () => SecureContextManager.generateSecureContext("example.com", config),
      /No CA Provided/,
    );
  });
});
