export abstract class BasePlugin {
  private static registered = false;

  static register() {
    this.registered = true;
  }

  static unregister() {
    this.registered = false;
  }

  static isRegistered() {
    return this.registered;
  }

  // unused
  protected static assertRegistered(this: typeof BasePlugin) {
    if (!this.registered) {
      throw new Error(`${this.name} is not registered`);
    }
  }

  protected constructor() {}
}
