import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { CertificateCacheManager } from "../../../src/core/cache/CertificateCacheManager";
import { pool } from "../../../src/core/workers/pool/Worker_pool";
import { LEAF_PATH } from "../../../constants/path";

const caConfig = {
  cert: "CA CERT",
  key: "CA KEY",
};

const createWorkerResult = () => ({
  cert: Buffer.from("CERTIFICATE"),
  key: Buffer.from("PRIVATE KEY"),
});

const cleanupHost = (host: string) => {
  const dir = path.join(LEAF_PATH.CERT_DIR, host);

  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe("CertificateCacheManager", () => {
  it("should generate, cache, and return a certificate", async () => {
    const host = `generated-${Date.now()}.example.com`;
    cleanupHost(host);

    const originalRun = pool.run;
    let workerCalled = 0;

    pool.run = (async () => {
      workerCalled++;

      return createWorkerResult();
    }) as typeof pool.run;

    try {
      const result = await CertificateCacheManager.getCAFromCache(
        host,
        caConfig,
      );

      assert.deepEqual(result.cert, Buffer.from("CERTIFICATE"));
      assert.deepEqual(result.key, Buffer.from("PRIVATE KEY"));
      assert.equal(workerCalled, 1);

      const certPath = path.join(LEAF_PATH.CERT_DIR, host, "cert.crt");

      const keyPath = path.join(LEAF_PATH.CERT_DIR, host, "key.pem");

      assert.equal(fs.existsSync(certPath), true);
      assert.equal(fs.existsSync(keyPath), true);
    } finally {
      pool.run = originalRun;
      cleanupHost(host);
    }
  });

  it("should load an existing certificate from the filesystem", async () => {
    const host = `filesystem-${Date.now()}.example.com`;
    cleanupHost(host);

    const dir = path.join(LEAF_PATH.CERT_DIR, host);
    fs.mkdirSync(dir, { recursive: true });

    const cert = Buffer.from("FILE CERT");
    const key = Buffer.from("FILE KEY");

    fs.writeFileSync(path.join(dir, "cert.crt"), cert);
    fs.writeFileSync(path.join(dir, "key.pem"), key);

    const originalRun = pool.run;
    let workerCalled = false;

    pool.run = (async () => {
      workerCalled = true;
      return createWorkerResult();
    }) as typeof pool.run;

    try {
      const result = await CertificateCacheManager.getCAFromCache(
        host,
        caConfig,
      );

      assert.deepEqual(result.cert, cert);
      assert.deepEqual(result.key, key);
      assert.equal(workerCalled, false);
    } finally {
      pool.run = originalRun;
      cleanupHost(host);
    }
  });

  it("should return the cached certificate without generating again", async () => {
    const host = `cache-${Date.now()}.example.com`;
    cleanupHost(host);

    const originalRun = pool.run;
    let workerCalled = 0;

    pool.run = (async () => {
      workerCalled++;

      return createWorkerResult();
    }) as typeof pool.run;

    try {
      const first = await CertificateCacheManager.getCAFromCache(
        host,
        caConfig,
      );

      const second = await CertificateCacheManager.getCAFromCache(
        host,
        caConfig,
      );

      assert.deepEqual(second, first);
      assert.equal(workerCalled, 1);
    } finally {
      pool.run = originalRun;
      cleanupHost(host);
    }
  });

  it("should deduplicate concurrent certificate generation", async () => {
    const host = `concurrent-${Date.now()}.example.com`;
    cleanupHost(host);

    const originalRun = pool.run;
    let workerCalled = 0;

    pool.run = (async () => {
      workerCalled++;

      await new Promise((resolve) => setTimeout(resolve, 50));

      return createWorkerResult();
    }) as typeof pool.run;

    try {
      const first = CertificateCacheManager.getCAFromCache(host, caConfig);

      const second = CertificateCacheManager.getCAFromCache(host, caConfig);

      const [firstResult, secondResult] = await Promise.all([first, second]);

      assert.deepEqual(firstResult, secondResult);
      assert.equal(workerCalled, 1);
    } finally {
      pool.run = originalRun;
      cleanupHost(host);
    }
  });

  it("should clear the in-flight task when generation fails", async () => {
    const host = `failure-${Date.now()}.example.com`;
    cleanupHost(host);

    const originalRun = pool.run;
    let workerCalled = 0;

    pool.run = (async () => {
      workerCalled++;
      throw new Error("worker failure");
    }) as typeof pool.run;

    try {
      await assert.rejects(
        CertificateCacheManager.getCAFromCache(host, caConfig),
        /worker failure/,
      );

      assert.equal(workerCalled, 1);

      await assert.rejects(
        CertificateCacheManager.getCAFromCache(host, caConfig),
        /worker failure/,
      );

      assert.equal(workerCalled, 2);
    } finally {
      pool.run = originalRun;
      cleanupHost(host);
    }
  });
});
