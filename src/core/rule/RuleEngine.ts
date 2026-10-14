import path from "path";
import { WatchableRuleFile, type IRuleParser } from "./ruleStore";

/**
 * Abstract base class for managing file-backed rule configurations.
 * Provides a factory for creating concrete rule-engine instances and a
 * shared registry of their associated rule stores. Subclasses define the
 * rule name, configuration path, parser, and initial state.
 *
 * @typeParam T - The type of state managed by the rule engine.
 *
 * @example
 * ```ts
 * class PortRuleEngine extends RuleEngine<number[]> {
 *   // Implement the required rule-engine properties.
 * }
 * ```
 *
 * For a complete implementation, see the
 * [rule engine example](https://github.com/debanshup/mitm-core/blob/main/example/advanced/rules/bypass.Rule.ts).
 */

export abstract class RuleEngine<T> {
  private static stores = new Map<string, WatchableRuleFile<any>>();

  /** Name used to register and retrieve the associated rule store. */
  protected abstract readonly ruleName: string;

  /** Path to the rule configuration file. */
  protected abstract readonly rulePath: string;

  /** Parser used to parse and match rules. */
  protected abstract readonly parser: IRuleParser<T>;

  /** Initial state supplied when creating the rule store. */
  protected abstract readonly defaultState: T;

  /**
   * Rule store associated with this engine instance.
   *
   * Assigned by {@link createRule} when the instance is created through
   * the factory method.
   */
  public store!: WatchableRuleFile<T>;

  /**
   * Constructs a concrete rule engine and creates its associated rule store.
   *
   * The store is registered under the instance's rule name and assigned
   * to the resulting engine instance.
   *
   * @typeParam E - The concrete rule-engine type.
   * @param ChildClass - Constructor of the rule-engine subclass to instantiate.
   * @returns The created rule-engine instance.
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
   * Retrieves a rule store registered under the specified name.
   *
   * @param storeName - Name used to register the rule store.
   * @returns The matching store, or `undefined` if no store is registered
   *          under that name.
   */
  public static getRuleStore(storeName: string) {
    return this.stores.get(storeName);
  }
}
