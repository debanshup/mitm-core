import { strict as assert } from "assert";
import { StateStore } from "../../../../src/core/state/StateStore";

describe("StateStore", () => {
  it("should store and retrieve a typed state value", () => {
    const store = new StateStore();

    store.set("request.finished", true);

    assert.equal(store.get("request.finished"), true);
  });

  it("should return undefined for a missing key", () => {
    const store = new StateStore();

    assert.equal(store.get("request.finished"), undefined);
  });

  it("should report whether a key exists", () => {
    const store = new StateStore();

    assert.equal(store.has("request.cacheHit"), false);

    store.set("request.cacheHit", true);

    assert.equal(store.has("request.cacheHit"), true);
  });

  it("should delete a stored key", () => {
    const store = new StateStore();

    store.set("error", true);

    assert.equal(store.delete("error"), true);
    assert.equal(store.has("error"), false);
    assert.equal(store.get("error"), undefined);
  });

  it("should return false when deleting a missing key", () => {
    const store = new StateStore();

    assert.equal(store.delete("error"), false);
  });

  it("should return the store from set()", () => {
    const store = new StateStore();

    assert.equal(store.set("error", true), store);
  });
});
