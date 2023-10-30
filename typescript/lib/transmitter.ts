import { Bus, Scheduler, PRNG } from "./platform";
import { Action, BindFrame, HelloFrame, Interface, InterfaceType, MessageType, ProtectionAlgorithm, PrivateFrame, ProtectedFrame, PublicFrame, Version, protectFrame } from "./protocol";

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
