import { Bus, Scheduler, PRNG } from "./platform";
import { BUTTON_ACT_INTERFACE, ActFrameBase, Action, BindFrame, HelloFrame, UnbindFrame, Interface, MessageType, ProtectionAlgorithm, ProtectionAlgorithmType, PrivateFrame, ProtectedFrame, PublicFrame, Version, deprotectFrame } from "./protocol";

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
