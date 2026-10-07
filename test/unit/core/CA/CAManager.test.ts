import assert from "node:assert/strict";
import tls from "node:tls";
import { CertificateCacheManager } from "../../../../src/core/cache/CertificateCacheManager";
import { pool } from "../../../../src/core/workers/pool/Worker_pool";
import { CAManager } from "../../../../src/core/CA/CAManager";
import type { ProxyConfig } from "../../../../src/lib/Proxy";

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

describe("CAManager", () => {
  const originalGetCAFromCache = CertificateCacheManager.getCAFromCache;

  const originalPoolRun = pool.run;
  const originalCreateSecureContext = tls.createSecureContext;

  afterEach(() => {
    CertificateCacheManager.getCAFromCache = originalGetCAFromCache;

    pool.run = originalPoolRun;
    tls.createSecureContext = originalCreateSecureContext;
  });

  it("should create a SecureContext from the cached CA", async () => {
    const host = `get-ca-${Date.now()}.example.com`;
    const fakeContext = {} as tls.SecureContext;
    const originalGetCAFromCache = CertificateCacheManager.getCAFromCache;
    const originalCreateSecureContext = tls.createSecureContext;
    CertificateCacheManager.getCAFromCache = (async (
      receivedHost,
      receivedCaConfig,
    ) => {
      assert.equal(receivedHost, host);
      assert.deepEqual(receivedCaConfig, config.rootCa);

      return {
        cert: Buffer.from("CERT"),
        key: Buffer.from("KEY"),
      };
    }) as typeof CertificateCacheManager.getCAFromCache;

    tls.createSecureContext = ((options: any) => {
      assert.deepEqual(options, {
        cert: Buffer.from("CERT"),
        key: Buffer.from("KEY"),
      });

      return fakeContext;
    }) as typeof tls.createSecureContext;

    try {
      const result = await CAManager.getCA(host, config);

      assert.equal(result, fakeContext);
    } finally {
      CertificateCacheManager.getCAFromCache = originalGetCAFromCache;
      tls.createSecureContext = originalCreateSecureContext;
    }
  });

  it("should return the cached SecureContext", async () => {
    const host = `cached-${Date.now()}.example.com`;
    const fakeContext = {} as tls.SecureContext;

    let createCalled = 0;

    CertificateCacheManager.getCAFromCache = (async () => ({
      cert: Buffer.from("CERT"),
      key: Buffer.from("KEY"),
    })) as typeof CertificateCacheManager.getCAFromCache;

    tls.createSecureContext = (() => {
      createCalled++;
      return fakeContext;
    }) as typeof tls.createSecureContext;

    const first = await CAManager.getCA(host, config);
    const second = await CAManager.getCA(host, config);

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

    const result = await CAManager.generateCA(host, config);

    assert.equal(result, fakeContext);
    assert.equal(workerCalled, 1);
  });

  it("should deduplicate concurrent generateCA calls", async () => {
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

    const first = CAManager.generateCA(host, config);
    const second = CAManager.generateCA(host, config);

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
      CAManager.generateCA(host, config),
      /generation failed/,
    );

    assert.equal(workerCalled, 1);

    await assert.rejects(
      CAManager.generateCA(host, config),
      /generation failed/,
    );

    assert.equal(workerCalled, 2);
  });

  it("should reject generateCA when root CA is missing", async () => {
    const config = createProxyConfig({
      rootCa: undefined,
    });

    await assert.rejects(
      () => CAManager.generateCA("example.com", config),
      /No CA Provided/,
    );
  });
});
