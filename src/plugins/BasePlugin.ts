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

  constructor() {
    const ctor = this.constructor as typeof BasePlugin;
    if (!ctor.isRegistered()) {
      throw new Error(`${ctor.name} is not registered`);
    }
  }
}
