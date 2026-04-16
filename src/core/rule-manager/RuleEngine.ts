import path from "path";
import { WatchableRuleFile, type RuleParser } from "./ruleStore.ts";

export abstract class RuleEngine<T> {
  private static stores = new Map<string, WatchableRuleFile<any>>();
  protected abstract readonly ruleName: string;
  protected abstract readonly relativePath: string;
  protected abstract readonly parser: RuleParser<T>;
  protected abstract readonly defaultState: T;

  // active store for this specific instance
  public store!: WatchableRuleFile<T>;

  /** * The Factory: Instantiates the child, sets up the file watcher,
   * and attaches the active store to the instance.
   */
  public static createRule<E extends RuleEngine<any>>(
    ChildClass: new () => E,
  ): E {
    const instance = new ChildClass();
    const fullPath = path.join(process.cwd(), instance.relativePath);

    const store = new WatchableRuleFile(
      instance.ruleName,
      fullPath,
      instance.parser,
      instance.defaultState,
    );

    this.stores.set(instance.ruleName, store);
    instance.store = store;

    return instance;
  }

  public static getRuleStore(storeName: string) {
    return this.stores.get(storeName);
  }
}
