import { strict as assert } from "assert";
import { PassThrough } from "stream";
import { ProxyUtils } from "../../../../src/core/utils/ProxyUtils";

describe("ProxyUtils", () => {
  it("should unpipe all streams before destroying them", () => {
    const stream1 = new PassThrough();
    const stream2 = new PassThrough();

    let unpipe1 = false;
    let unpipe2 = false;

    const originalUnpipe1 = stream1.unpipe.bind(stream1);
    const originalUnpipe2 = stream2.unpipe.bind(stream2);

    stream1.unpipe = ((dest?: any) => {
      unpipe1 = true;
      return originalUnpipe1(dest);
    }) as typeof stream1.unpipe;

    stream2.unpipe = ((dest?: any) => {
      unpipe2 = true;
      return originalUnpipe2(dest);
    }) as typeof stream2.unpipe;

    ProxyUtils.cleanUp([stream1, stream2]);

    assert.equal(unpipe1, true);
    assert.equal(unpipe2, true);
    assert.equal(stream1.destroyed, true);
    assert.equal(stream2.destroyed, true);
  });

  it("should destroy active streams", () => {
    const stream1 = new PassThrough();
    const stream2 = new PassThrough();

    ProxyUtils.cleanUp([stream1, stream2]);

    assert.equal(stream1.destroyed, true);
    assert.equal(stream2.destroyed, true);
  });

  it("should pass the error to destroy", async () => {
    const stream = new PassThrough();
    const expectedError = new Error("cleanup failure");

    let receivedError: Error | undefined;

    stream.once("error", (error) => {
      receivedError = error;
    });

    ProxyUtils.cleanUp([stream], expectedError);

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(receivedError, expectedError);
    assert.equal(stream.destroyed, true);
  });

  it("should not destroy an already destroyed stream", () => {
    const stream = new PassThrough();

    stream.destroy();

    let destroyCalled = false;

    stream.destroy = (() => {
      destroyCalled = true;
      return stream;
    }) as typeof stream.destroy;

    ProxyUtils.cleanUp([stream]);

    assert.equal(destroyCalled, false);
  });

  it("should ignore null or undefined streams", () => {
    assert.doesNotThrow(() => {
      ProxyUtils.cleanUp([undefined as any, null as any]);
    });
  });

  it("should fall back to end when destroy is unavailable", () => {
    let unpipeCalled = false;
    let endCalled = false;

    const stream: any = {
      destroyed: false,

      unpipe() {
        unpipeCalled = true;
      },

      end() {
        endCalled = true;
      },
    };

    ProxyUtils.cleanUp([stream]);

    assert.equal(unpipeCalled, true);
    assert.equal(endCalled, true);
  });
});
