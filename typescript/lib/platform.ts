export interface Bus<T> {
  send(msg: T): void;
  on(fn: (msg: T) => void): () => void;
}

export class SimpleBus<T> implements Bus<T> {
  private readonly fns = new Set<(msg: T) => void>();

  public send(msg: T) {
    for (const fn of this.fns.values()) {
      fn(msg);
    }
  }

  public on(fn: (msg: T) => void): () => void {
    this.fns.add(fn);

    return () => {
      this.fns.delete(fn);
    };
  }
}

export interface Log<T> {
  received(msg: T, src: string | Symbol): void;
  sent(msg: T, src: string | Symbol): void;
}

export type TaggedFrame<T> = T & {
  tag: string;
};

export class BusTap<T> implements Bus<T> {
  private prevTag = 0;

  constructor(private readonly bus: Bus<TaggedFrame<T>>, private readonly log: Log<TaggedFrame<T>>, private readonly src: string | Symbol) {}

  public send(msg: T) {
    const tagged = { ...msg, tag: `${this.src}/${++this.prevTag}` };
    this.log.sent(tagged, this.src);
    return this.bus.send(tagged);
  }

  public on(fn: (msg: T) => void) {
    return this.bus.on((msg: TaggedFrame<T>) => {
      this.log.received(msg, this.src);
      return fn(msg);
    });
  }
}

export class Scheduler {
  public setTimeout(delayMs: number, fn: () => void) {
    const id = setTimeout(fn, delayMs);

    return () => {
      clearTimeout(id);
    };
  }

  public setInterval(periodMs: number, fn: () => void) {
    const id = setInterval(fn, periodMs);

    return () => {
      clearInterval(id);
    };
  }
}

export class PRNG {
  public getRandomBytes(n: number) {
    return (Math.pow(2, n) * Math.random()).toFixed(0);
  }
}
