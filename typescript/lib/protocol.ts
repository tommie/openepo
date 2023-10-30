export interface ProtectedFrame<F extends {unencrypted: Unencrypted, encrypted?: EncryptedBase}> {
  unencrypted: F["unencrypted"];
  encrypted: ProtectedEncrypted<F["encrypted"]>;
}

interface ProtectedEncrypted<T extends EncryptedBase | undefined> {
  algo: ProtectionAlgorithm;
  protected?: T;
}

export function protectFrame<F extends {unencrypted: Unencrypted, encrypted?: EncryptedBase}>(algo: ProtectionAlgorithm, frame: F): ProtectedFrame<F> {
  return {
    unencrypted: frame.unencrypted,
    encrypted: {
      algo,
      protected: frame.encrypted,
    },
  };
}

export function deprotectFrame<F extends {unencrypted: Unencrypted, encrypted?: EncryptedBase}>(algo: ProtectionAlgorithm, frame: ProtectedFrame<F>): F | null {
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

export enum Version {
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

export const BUTTON_ACT_INTERFACE = {
  type: InterfaceType.BUTTON_ACT,
};
