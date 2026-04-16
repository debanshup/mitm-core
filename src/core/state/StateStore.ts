type ProxyState = {
  certCacheHit: boolean;
  responseCacheHit: boolean;
  requestCacheHit: boolean;
  isFinished: boolean;
  error: boolean;
};

export class StateStore {
  private map = new Map<string, any>();
  // overload 1: strongly typed state
  public set<K extends keyof ProxyState>(key: K, value: ProxyState[K]): this;
  // overload:2 untyped custom state
  public set(key: string, value: any): this;
  // implementation
  public set(key: string, value: any): this {
    this.map.set(key, value);
    return this;
  }
  // same as set
  public get<K extends keyof ProxyState>(key: K): ProxyState[K] | undefined;
  public get<T = any>(key: string): T | undefined;
  public get(key: string): any {
    return this.map.get(key);
  }

  public has(key: string): boolean {
    return this.map.has(key);
  }

  public delete(key: string): boolean {
    return this.map.delete(key);
  }
}
