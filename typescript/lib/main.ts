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

export interface ProtectedFrame<F extends {unencrypted: Unencrypted, encrypted?: EncryptedBase}> {
  unencrypted: F["unencrypted"];
  encrypted: ProtectedEncrypted<F["encrypted"]>;
}

interface ProtectedEncrypted<T extends EncryptedBase | undefined> {
  algo: ProtectionAlgorithm;
  protected?: T;
}

function protectFrame<F extends {unencrypted: Unencrypted, encrypted?: EncryptedBase}>(algo: ProtectionAlgorithm, frame: F): ProtectedFrame<F> {
  return {
    unencrypted: frame.unencrypted,
    encrypted: {
      algo,
      protected: frame.encrypted,
    },
  };
}

function deprotectFrame<F extends {unencrypted: Unencrypted, encrypted?: EncryptedBase}>(algo: ProtectionAlgorithm, frame: ProtectedFrame<F>): F | null {
  if (frame.encrypted.algo !== algo && JSON.stringify(frame.encrypted.algo) !== JSON.stringify(algo)) {
    return null;
  }

  return {
    unencrypted: frame.unencrypted,
    encrypted: frame.encrypted.protected,
  } as F;
}

export interface FrameBase {
  unencrypted: Unencrypted;
  encrypted?: EncryptedBase;
}

export interface Unencrypted {
  header: UnencryptedHeader;
}

export type UnboundUnencrypted<M extends MessageType = MessageType> = Omit<Unencrypted, "header"> & {
  header: UnboundUnencryptedHeader<M>;
};
export type BoundUnencrypted<M extends MessageType = MessageType> = Omit<Unencrypted, "header"> & {
  header: BoundUnencryptedHeader<M>;
};

export type UnencryptedHeader = UnencryptedHeaderV1;

export interface UnencryptedHeaderBase<M extends MessageType = MessageType> {
  version: Version;
  type: M;
}

export type UnboundUnencryptedHeader<M extends MessageType = MessageType> = UnboundUnencryptedHeaderV1<M>;
export type BoundUnencryptedHeader<M extends MessageType = MessageType> = BoundUnencryptedHeaderV1<M>;

export interface UnencryptedHeaderV1<M extends MessageType = MessageType> {
  version: Version.V1;
  type: M;
  sessionId: string;
  protection?: ProtectionAlgorithmHeader;
}

export type UnboundUnencryptedHeaderV1<M extends MessageType = MessageType> = Omit<UnencryptedHeaderV1<M>, "protection">;
export type BoundUnencryptedHeaderV1<M extends MessageType = MessageType> = Omit<UnencryptedHeaderV1<M>, "protection"> & {
  protection: ProtectionAlgorithmHeader;
};

enum Version {
  UNKNOWN = 0,
  V1 = 1,
}

export enum MessageType {
  UNKNOWN = 0,

  // Start of control messages.
  HELLO = 1,
  BOUND = 2,
  BIND = 3,
  UNBIND = 4,
  CONFIGURE = 5,

  // Start of messages for normal operation.
  ACT = 8,
}

export type ProtectionAlgorithmHeader = Aes128OcbHeader & ProtectionAlgorithmHeaderBase;

export interface ProtectionAlgorithmHeaderBase {}

export interface Aes128OcbHeader extends ProtectionAlgorithmHeaderBase {
  nonce: string; // 16 bytes
}

export interface EncryptedBase {
  header: Header;
}

export type Header = HeaderV1;

export interface HeaderV1 {
  seqNo: number;
}

export type PublicFrame = PublicControlFrame | PublicDataFrame;
export type PrivateFrame = PrivateControlFrame;
export type PrivateControlFrame = HelloFrame | BoundFrame;
export type PublicControlFrame = BindFrame | UnbindFrame | ConfigureFrame;
export type PublicDataFrame = ButtonActFrame;

export type ProtectionAlgorithm = Aes128OcbParameters & ProtectionAlgorithmBase;

export interface ProtectionAlgorithmBase {
  type: ProtectionAlgorithmType;
}

export enum ProtectionAlgorithmType {
  UNKNOWN = 0,
  AEAD_AES_128_OCB_TAGLEN128 = 20,
  AEAD_AES_128_OCB_TAGLEN64 = 22,
}

export interface Aes128OcbParameters extends ProtectionAlgorithmBase {
  type: ProtectionAlgorithmType.AEAD_AES_128_OCB_TAGLEN128 | ProtectionAlgorithmType.AEAD_AES_128_OCB_TAGLEN64;
  sessionKey: string;
}

export type Interface = InterfaceBase;

export interface InterfaceBase {
  type: InterfaceType;
}

export enum InterfaceType {
  UNKNOWN = 0,
  BUTTON_ACT = 1,
}

export interface HelloFrame {
  unencrypted: UnboundUnencrypted<MessageType.HELLO> & {
    protectionAlgorithms: ProtectionAlgorithm[];
    supportedInterfaces: Interface[];
  };
}

export interface BoundFrame {
  unencrypted: BoundUnencrypted<MessageType.BOUND>;
  encrypted: EncryptedBase;
}

export interface BindFrame {
  unencrypted: BoundUnencrypted<MessageType.BIND> & {
    protectionAlgorithmType: ProtectionAlgorithmType;
  };
  encrypted: EncryptedBase & {
    transmitterId: string; // 8 bytes
    interfaceTypes: InterfaceType[];
  };
}

export interface UnbindFrame {
  unencrypted: BoundUnencrypted<MessageType.UNBIND>;
  encrypted: EncryptedBase;
}

export interface ConfigureFrame {
  unencrypted: BoundUnencrypted<MessageType.CONFIGURE>;
  encrypted: EncryptedBase;
}

export interface ActFrameBase {
  unencrypted: BoundUnencrypted<MessageType.ACT>;
  encrypted: EncryptedBase & {
    interface: InterfaceType;
  };
}

export interface ButtonActFrame extends ActFrameBase {}

export interface Action {
  interface: InterfaceType;
}

const BUTTON_ACT_INTERFACE = {
  type: InterfaceType.BUTTON_ACT,
};

export enum TransmitterState {
  IDLE = 1,
  PAIRING = 2,
}

export interface TransmitterActor {
  stateChanged(state: TransmitterState): void;
  pairingChanged(paired: boolean): void;
}

export interface TransmitterConfig {
  id: string;
  filterInterfaces?: (ifaces: Interface[]) => InterfaceType[];
  actor: TransmitterActor;
  scheduler: Scheduler;
  prng: PRNG;
}

export class Transmitter {
  private readonly privateStop: () => void;

  private protection?: ProtectionAlgorithm;
  private sessionId?: string;
  private prevSeqNo = 0;
  private unbound = false;
  private state: TransmitterState = TransmitterState.IDLE;
  private stateTimeout?: () => void;

  constructor(private readonly publicMedium: Bus<ProtectedFrame<PublicFrame>>, privateMedium: Bus<PrivateFrame>, private readonly config: TransmitterConfig) {
    this.privateStop = privateMedium.on(this.onPrivateMsg.bind(this));
  }

  public close() {
    this.privateStop();
  }

  public act(action: Action) {
    if (!this.isPaired()) {
      return;
    }
    if (this.state !== TransmitterState.IDLE) {
      this.setState(TransmitterState.IDLE);
    }

    this.send(MessageType.ACT, {
      encrypted: {
        interface: action.interface,
      },
    });
  }

  public unpair() {
    if (!this.isPaired()) {
      return;
    }

    this.send(MessageType.UNBIND, {
      encrypted: {
        transmitterId: this.config.id,
      },
    });

    // Because the transmitter cannot know if the UNBIND was received
    // correctly, it cannot clear the sessionId.
    this.unbound = true;
    this.config.actor.pairingChanged(false);
  }

  public setConfiguring() {
    if (this.unbound) {
      return;
    }

    this.send(MessageType.CONFIGURE, {});
  }

  public setPairing() {
    this.setState(TransmitterState.PAIRING, 10000);
  }

  public isPaired() {
    return this.sessionId !== undefined && !this.unbound;
  }

  private setState(state: TransmitterState.IDLE): void;
  private setState(state: Exclude<TransmitterState, TransmitterState.IDLE>, idleTimeoutMs: number): void;
  private setState(state: TransmitterState, idleTimeoutMs?: number) {
    const notify = this.state !== state;
    this.state = state;
    if (idleTimeoutMs !== undefined) {
      this.stateTimeout?.();
      this.stateTimeout = this.config.scheduler.setTimeout(idleTimeoutMs, () => {
        this.stateTimeout = undefined;
        this.setState(TransmitterState.IDLE)
      });
    }

    if (notify) {
      this.config.actor.stateChanged(this.state);
    }
  }

  private send<T extends PublicFrame>(type: T["unencrypted"]["header"]["type"], msg: {unencrypted?: Omit<T["unencrypted"], "header">, encrypted?: Omit<T["encrypted"], "header">}) {
    if (!this.protection) {
      throw new Error("Unable to send without being paired");
    }

    ++this.prevSeqNo;
    this.publicMedium.send(protectFrame(this.protection, {
      unencrypted: {
        ...msg.unencrypted,
        header: {
          version: Version.V1,
          type,
          sessionId: this.sessionId,
          protection: {
            nonce: this.config.prng.getRandomBytes(16 * 8),
          },
        }
      },
      encrypted: {
        ...msg.encrypted,
        header: {
          seqNo: this.prevSeqNo,
        },
      },
    } as T));
  }

  private onPrivateMsg(msg: PrivateFrame) {
    switch (msg.unencrypted.header.type) {
      case MessageType.HELLO:
        if (this.state === TransmitterState.PAIRING) {
          this.protection = (msg as HelloFrame).unencrypted.protectionAlgorithms[0];
          if (!this.protection) return;

          this.sessionId = msg.unencrypted.header.sessionId;
          this.unbound = true;
          this.send<BindFrame>(MessageType.BIND, {
            unencrypted: {
              protectionAlgorithmType: this.protection.type,
            },
            encrypted: {
              transmitterId: this.config.id,
              interfaceTypes: this.config.filterInterfaces ? this.config.filterInterfaces((msg as HelloFrame).unencrypted.supportedInterfaces) : (msg as HelloFrame).unencrypted.supportedInterfaces.map(iface => iface.type),
            },
          });
        }
        break;

      case MessageType.BOUND:
        if (this.state === TransmitterState.PAIRING) {
          this.unbound = false;
          this.config.actor.pairingChanged(true);
          this.setState(TransmitterState.IDLE);
        }
        break;
    }
  }
}

export enum ReceiverState {
  STARTING = 1,
  IDLE = 2,
  CONFIGURING = 3,
  PAIRING = 4,
  UNPAIRING = 5,
}

export interface ReceiverActor {
  stateChanged(state: ReceiverState): void;
  act(action: Action): void;
}

export interface ReceiverConfig {
  protectionAlgorithms?: ((sessionKey: string) => ProtectionAlgorithm)[];
  supportedInterfaces?: Interface[];
  actor: ReceiverActor;
  scheduler: Scheduler;
  prng: PRNG;
}

const DEFAULT_PROTECTION_ALGORITHMS = [
  (sessionKey: string) => ({type: ProtectionAlgorithmType.AEAD_AES_128_OCB_TAGLEN64, sessionKey}),
] satisfies ((sessionKey: string) => ProtectionAlgorithm)[];

interface SessionRecord {
  protection: ProtectionAlgorithm;
  prevSeqNo: number;
}

export class Receiver {
  private readonly publicStop: () => void;

  private state: ReceiverState = ReceiverState.STARTING;
  private stateTimeout?: () => void;
  private pairingInterval?: () => void;
  private readonly sessions = new Map<string, SessionRecord>();

  private newSessionId?: string;
  private newProtections?: ProtectionAlgorithm[];

  constructor(publicMedium: Bus<ProtectedFrame<PublicFrame>>, private readonly privateMedium: Bus<PrivateFrame>, private readonly config: ReceiverConfig) {
    this.publicStop = publicMedium.on(this.onPublicMsg.bind(this));
    this.setState(ReceiverState.STARTING, 100);
  }

  public close() {
    this.publicStop();
    this.stateTimeout?.();
  }

  public get sessionIds() {
    const ids = Array.from(this.sessions.keys());
    ids.sort((a, b) => a.localeCompare(b));
    return ids;
  }

  public setPairing() {
    if (this.state !== ReceiverState.CONFIGURING) {
      return;
    }

    const sessionId = this.generateSessionId();
    const sessionKey = this.config.prng.getRandomBytes(16 * 8);
    this.newSessionId = sessionId;
    this.newProtections = (this.config.protectionAlgorithms ?? DEFAULT_PROTECTION_ALGORITHMS).map(fn => fn(sessionKey));
    this.setState(ReceiverState.PAIRING, 10000);

    this.pairingInterval = this.config.scheduler.setInterval(400, () => {
      this.privateMedium.send({
        unencrypted: {
          header: {
            version: Version.V1,
            type: MessageType.HELLO,
            sessionId: sessionId,
          },
          protectionAlgorithms: this.newProtections!,
          supportedInterfaces: this.config.supportedInterfaces ?? [BUTTON_ACT_INTERFACE],
        },
      } satisfies HelloFrame);
    });
  }

  public setUnpairing() {
    if (this.state !== ReceiverState.CONFIGURING) {
      return;
    }

    this.setState(ReceiverState.UNPAIRING, 10000);
  }

  private setState(state: ReceiverState.IDLE | ReceiverState.CONFIGURING): void;
  private setState(state: Exclude<ReceiverState, ReceiverState.IDLE>, idleTimeoutMs: number): void;
  private setState(state: ReceiverState, idleTimeoutMs?: number) {
    const notify = this.state !== state;
    this.state = state;
    if (idleTimeoutMs !== undefined) {
      this.stateTimeout?.();
      this.stateTimeout = this.config.scheduler.setTimeout(idleTimeoutMs, () => {
        this.stateTimeout = undefined;
        this.setState(this.sessions.size > 0 ? ReceiverState.IDLE : ReceiverState.CONFIGURING)
      });
    }

    if (this.state !== ReceiverState.PAIRING) {
      this.pairingInterval?.();
      this.pairingInterval = undefined;
    }

    if (notify) {
      this.config.actor.stateChanged(this.state);
    }
  }

  private send<T extends PrivateFrame>(sessionId: string, type: T["unencrypted"]["header"]["type"], msg: {unencrypted?: Omit<T["unencrypted"], "header">}) {
    this.privateMedium.send({
      unencrypted: {
        ...msg.unencrypted,
        header: {
          version: Version.V1,
          type,
          sessionId: sessionId,
        }
      },
    } as T);
  }

  private onPublicMsg(pmsg: ProtectedFrame<PublicFrame>) {
    switch (pmsg.unencrypted.header.type) {
      case MessageType.BIND:
        const protection = this.newProtections?.filter((algo) => algo.type === (pmsg as ProtectedFrame<BindFrame>).unencrypted.protectionAlgorithmType)[0];
        if (!protection) return;

        const msg = deprotectFrame(protection, pmsg);
        if (!msg) return;

        if (this.state === ReceiverState.PAIRING) {
          const sessionId = (msg as BindFrame).unencrypted.header.sessionId;
          if (sessionId === this.newSessionId) {
            this.sessions.set(sessionId, {
              protection,
              prevSeqNo: msg.encrypted.header.seqNo,
            });

            this.send(sessionId, MessageType.BOUND, {});

            this.newSessionId = undefined;
            this.newProtections = undefined;
            this.setState(ReceiverState.CONFIGURING, 30000);
          }
        }
        return;
    }

    const session = this.findTransmitter(pmsg);
    if (!session) return;

    const msg = deprotectFrame(session.protection, pmsg);
    if (!msg) return;

    switch (msg.unencrypted.header.type) {
      case MessageType.UNBIND:
        if (this.state === ReceiverState.UNPAIRING) {
          this.sessions.delete((msg as UnbindFrame).unencrypted.header.sessionId);
          this.setState(ReceiverState.IDLE);
        }
        break;

      case MessageType.CONFIGURE:
        if (this.state === ReceiverState.IDLE) {
          this.setState(ReceiverState.CONFIGURING, 30000);
        }
        break;

      case MessageType.ACT: {
        if (this.state === ReceiverState.IDLE || this.state === ReceiverState.CONFIGURING) {
          this.setState(ReceiverState.CONFIGURING, 10000);

          if (session && session.prevSeqNo < msg.encrypted.header.seqNo) {
            session.prevSeqNo = msg.encrypted.header.seqNo;
            this.config.actor.act({
              interface: (msg as ActFrameBase).encrypted.interface,
            });
          }
        }
        break;
      }
    }
  }

  private findTransmitter(msg: ProtectedFrame<PublicFrame>): SessionRecord | null {
    return this.sessions.get(msg.unencrypted.header.sessionId) ?? null;
  }

  private generateSessionId() {
    for (;;) {
      const sessionId = this.config.prng.getRandomBytes(8 * 8);
      if (!this.sessions.has(sessionId)) return sessionId;
    }
  }
}
