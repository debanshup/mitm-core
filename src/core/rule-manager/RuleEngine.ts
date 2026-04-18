import path from "path";
import { WatchableRuleFile, type IRuleParser } from "./ruleStore";

/**
 * An abstract base class that provides a framework for managing rule configurations.
 * Handles file watching, state parsing, and storage for specific rule implementations.
 */
export abstract class RuleEngine<T> {
  private static stores = new Map<string, WatchableRuleFile<any>>();
  protected abstract readonly ruleName: string;
  protected abstract readonly rulePath: string;
  protected abstract readonly parser: IRuleParser<T>;
  protected abstract readonly defaultState: T;

  // active store for this specific instance
  public store!: WatchableRuleFile<T>;

  /**
   * Factory method to instantiate a rule engine, initialize its file watcher,
   * and link the resulting store to the instance.
   *
   * @param ChildClass - The constructor of the rule class to instantiate.
   * @returns An initialized instance of the rule engine.
   */
  public static createRule<E extends RuleEngine<any>>(
    ChildClass: new () => E,
  ): E {
    const instance = new ChildClass();
    const fullPath = path.join(instance.rulePath);

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

  /**
   * Retrieves a rule store instance by its unique name.
   */
  public static getRuleStore(storeName: string) {
    return this.stores.get(storeName);
  }
}
