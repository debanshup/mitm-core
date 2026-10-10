import path from "path";
import { WatchableRuleFile, type IRuleParser } from "./ruleStore";

/**
 * Abstract base class for managing rule configurations backed by files.
 *
 * Provides a shared factory and store registry for rule-engine implementations.
 * Concrete subclasses define the rule name, file path, parser, and default
 * state used to initialize their rule store.
 *
 * @typeParam T - The type of state managed by the rule engine.
 */
export abstract class RuleEngine<T> {
  private static stores = new Map<string, WatchableRuleFile<any>>();

  /** Unique name used to identify this rule engine and its registered store. */
  protected abstract readonly ruleName: string;

  /** File-system path used to locate the rule configuration. */
  protected abstract readonly rulePath: string;

  /** Parser used to interpret and validate the rule configuration. */
  protected abstract readonly parser: IRuleParser<T>;

  /** Initial state supplied when creating the rule store. */
  protected abstract readonly defaultState: T;

  /**
   * Store associated with this rule-engine instance.
   *
   * Assigned by {@link createRule} during initialization.
   */
  public store!: WatchableRuleFile<T>;

  /**
   * Creates and initializes an instance of a concrete rule engine.
   *
   * Instantiates the supplied subclass, creates a watchable rule store
   * using the subclass's configuration, registers the store by rule name,
   * and assigns it to the new instance.
   *
   * @typeParam E - The concrete rule-engine type to instantiate.
   * @param ChildClass - Constructor of the concrete rule-engine subclass.
   * @returns The initialized rule-engine instance.
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
   * Retrieves a registered rule store by its name.
   *
   * @param storeName - Name used to register the rule store.
   * @returns The matching rule store, or `undefined` if no store is registered
   *          under that name.
   */
  public static getRuleStore(storeName: string) {
    return this.stores.get(storeName);
  }
}
