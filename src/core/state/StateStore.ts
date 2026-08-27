// create stream based treansform

export type RequestState = {
  "cert.cacheHit": boolean;
  "request.cacheHit": boolean;
  "response.cacheHit": boolean;

  "request.finished": boolean;
  "request.aborted": boolean;
  "response.aborted": boolean;

  "upstream.connected": boolean;
  "upstream.responseReceived": boolean;

  "request.error": boolean;
  error: boolean;
};

export class StateStore {
  private map = new Map<string, unknown>();

  public set<K extends keyof RequestState>(
    key: K,
    value: RequestState[K],
  ): this;

  public set(key: string, value: unknown): this;

  public set(key: string, value: unknown): this {
    this.map.set(key, value);
    return this;
  }

  public get<K extends keyof RequestState>(key: K): RequestState[K] | undefined;

  public get<T = unknown>(key: string): T | undefined;

  public get(key: string): unknown {
    return this.map.get(key);
  }

  public has(key: string): boolean {
    return this.map.has(key);
  }

  public delete(key: string): boolean {
    return this.map.delete(key);
  }
}
