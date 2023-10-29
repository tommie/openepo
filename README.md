# Openepo - Open Secure Remote Control

This repository contains the specification and reference implementation of a 433 MHz remote control with rolling codes.
The goal is to create a more secure replacement for the venerable KeeLoq (classic and new,) and to generally improve the security of the world's garage doors.


## Background

There are three types of remote control protocols in use today:

* **Fixed code**, where both the transmitter and receiver sets the code using small switches.
  They are highly susceptible to replay attacks.
* **Learning code**, where the transmitter has a fixed code, and the receiver can learn remotes.
  They are highly susceptible to replay attacks.
  A receiver has a limited number of remotes it can support.
* **Rolling code**; or **code hopping**, where the transmitter and receiver shares a key.
  The key is used to generate a new message every time.
  The receiver can detect if a message has already been used, and discard it.
  A very common implementation is KeeLoq.

### Thread and Matter

The message layout would probably have been compatible with Thread, if its specification was not behind an unnecessary data privacy infringing request form.


## Requirements and Scope

* **Secure:** It must be possible to construct transmitters that cannot be cloned within one hour.
* **Open:** There are no manufacturer keys, or other shared secrets that limit a user's ability to create a replacement transmitter.
            In KeeLoq, a manufacturer programs their devices with a shared 64-bit key.
            If this key is leaked, all devices of that manufacturer are compromised.
            It also means users are not able to create a replacement key, even if they have access to KeeLoq ICs.
* **NIH:** The system should use established cryptographic primitives, preferably ones with available hardware acceleration.
* **Tiny:** The system must be possible to implement in 8-bit microcontrollers with limited RAM and speed.
            The transmissions are bounded to a reasonably small size, allowing small devices to perform decoding.
* **Low-Power:** The transmitter must be user-friendly even on devices with limited battery capacity.
                 The receiver should be user-friendly even on devices with limited battery capacity.
* **Tamper-Safe:** Access to the receiver should not be enough to pair a new transmitter without difficulty.
                   A garage door being left open unattended should not make it possible for an attacker to simply pair a new key without being noticed.
* **Versatility:** The transmissions are infrequent bursts, able to carry messages consisting of a vector of arbitrary-length integers.
* **Interoperability:** The transmissions use a tag to help describe the message, but does not enforce the use of standardized tags.
* **Replay-Safe:** Captured transmissions cannot be re-issued using a replay.
* **Anonymous:** There is no plain text transmitter identifier to be learned by eavesdropping on the medium.
                 Guarding against fingerprinting is out-of-scope, but devices are encouraged to transmit as little data as possible.


## Operations

### Pairing

A transmitter and a receiver are paired, authorizing the receiver to act on the transmitter's messages, using the following procedure:

1. If the receiver has transmitters already registered, an existing transmitter must send a message.
   Care must be taken to help the user accidentally enabling configuration mode, e.g. by requiring a minimum button press time.
   A time window of configurability opens, indicated on the receiver using some means.
2. An external action is taken on the receiver to enable pairing.
   Care must be taken to help the user accidentally enabling pairing mode, e.g. by requiring a minimum button press time.
   A time window of pairability opens, indicated on the receiver using some means other than configurability.
3. If the receiver does not have room for another paired transmitter, it indicates this using some means.
4. Otherwise, the receiver repeatedly sends a *Hello* message with a *session key* to the transmitter using a line-of-sight modality, e.g. a visible-light LED.
   This symmetric key is freshly minted, stored in a temporary buffer, and transmitted unencrypted.
   Care must be taken to avoid excessive reach of the transmission, e.g. using low intensity, a collimating lens, a shroud and/or an enclosed space.
5. If the transmitter does not recognize any requested device interface, it stops sending the *Hello* message.
   It indicates that the *Hello* message is no longer being sent, and that a failure occurred, using some means.
   Likewise, the transmitter stops after a timeout, e.g. 30 seconds.
6. Otherwise, the transmitter receives the key and sends an *Establish* message over RF, encrypted using the key.
   The transmitter may require external action to enable reception, e.g. the user pressing a button, to simplify battery management.
7. The receiver stores the new key as a valid session key.
   It indicates the successful pairing using some means.
8. If the receiver is unable to pair the transmitter, e.g. due to incompatible interface types, it indicates this using some means.

### Unpairing

A transmitter and a receiver that have been paired, can be deauthorized using the following procedure:

1. An existing transmitter sends a message.
   This may or may not be the transmitter that is to be unpaired.
   Care must be taken to help the user accidentally enabling configuration mode, e.g. by requiring a minimum button press time.
   A time window of configurability opens, indicated on the receiver using some means.
2. An external action is taken on the receiver to enable unpairing.
   Care must be taken to help the user accidentally enabling pairing mode, e.g. by requiring a minimum button press time.
   A time window of pairability opens, indicated on the receiver using some means other than configurability.
3. An external action is taken on the the transmitter to be unpaired.
   Care must be taken to help the user avoid accidentally unpairing, e.g. by requiring multiple button presses in sequence.
4. The transmitter sends a *Terminate* message, encrypted using the session key.
5. The receiver removes the session key that was used to decrypt the message.
   Success is indicated using some means.
   Success is indicated whether or not the session key was found, indicating that the transmitter is no longer accepted.

### Receiver Factory Reset

A receiver can have all settings cleared using the following procedure:

1. If the receiver has transmitters already registered, an existing transmitter must send a message.
   Care must be taken to help the user accidentally enabling configuration mode, e.g. by requiring a minimum button press time.
   A time window of configurability opens, indicated on the receiver using some means.
2. An external action is taken on the receiver to perform the reset.
   Care must be taken to help the user accidentally performing a reset, e.g. by requiring multiple long button presses.
   A time window of pairability opens, indicated on the receiver using some means other than configurability.
3. The receiver erases all session keys.
   It should indicate success using some means.

### Perform Action

A user can perform an action on the receiver using the transmitter, following this procedure:

1. The user performs an external action on the transmitter.
2. The transmitter sends an *Act* message, encrypted using the session key.
3. The receiver decrypts the message, and performs the action.
4. If the message could not be decrypted, or could not be interpreted, the receiver indicates this using some means.
   This gives the user feedback that the pairing and transmission worked, and that something else is wrong.


## Protocol Framing

Each message consists of a preamble, a start sequence, message data, and a stop sequence.
Both line-of-sight and radio use the same framing.

### Modulation

Messages a modulated using on/off-keying (OOK; binary ASK) with pulse-width modulation (PWM).
A zero is a one-duration on and two-duration off and a one is a two-duration on and one-duration off.

Each duration is no shorter than 10 µs, giving a maximum transmission rate of 33 kbps.

### Frame and Message Layout

Messages are byte-aligned frames of symbols.
Each frame byte after *S* is preceded by a one-bit one, making each message byte nine bits.

Each frame has the following layout:

```
            .----------+-----+--------+-------------+---------+-----------+-----+-----.
   Delay... | Preamble | SOF | Header | Unencrypted | EHeader | Encrypted | MIC | EOF | Delay...
            '----------+-----+--------+-------------+---------+-----------+-----+-----'
```

* **Delay** is a minimum hold-off time as indicated in [Collision Avoidance](#collision-avoidance).
* **Preamble** is seven zero bits.
  This is used to create attention, and can be used to determine baudrate.
* **SOF** is the start-of-frame; a single one bit.
  This is used to indicate to the receiver whether it is in sync with the transmitter or not.
* **Header** is an unencrypted piece, common to all messages.
  This is used to allow unpaired devices to understand each other, and is used sparingly.
* **Unencrypted** is an unencrypted piece of the message.
  This is used to allow unpaired devices to understand each other, and is used sparingly.
* **EHeader** is an encrypted piece, common to all messages.
* **Encrypted** is the main message piece, using a pre-shared session key.
  This is used to allow only paired devices to understand each other.
* **MIC** is the message integrity code used to detect message corruption.
  It covers the entire message, from *Header* to *Encrypted*.
  It may be part of the Encrypted plain text, depending on the algorithm in use.
* **EOF** is a single zero bit.
  Together with the leading one-bit of each message byte, this uniquely identifies the end of the frame.

### Collision Avoidance {#collision-avoidance}

The protocol performs no collision detection.
It uses two techniques to lower the probability of collisions.

#### Bursting

Each message that requires bursting is repeated three times, with a minimum of 128 preamble lengths in-between.
Whether a message requires bursting is documented for affected messages.

#### Spacing

Each burst (or message without bursting) is spaced with a minimum of 1024 preamble lengths apart.

#### Framing Errors

Framing and data errors can occur in multiple places:

* The pre-delay is not large enough.
* The preamble is too short.
* The SOF is invalid.
* The message is shorter than the expected header.
* The frame is too long for the device to handle.
* The MIC is invalid.
* The message type or other fields are unrecognized.

A receiver must discard erroneous frames and wait for half the bursting interval (i.e. 64 preamble lengths) before accepting a new preamble.

A receiver should not indicate that it is receiving, unless the data is likely an attempted Openepo frame.
I.e. framing errors do not cause the receiver to acknowledge the signal.
Message data errors cause the message to be discarded, but can also cause the receiver to indicate attempted reception.
This is to avoid flickering from unrelated devices.

### Message Structure

Message are tightly packed structs of fields.
Where variable-length data is needed, it is transmitted after all fixed-length data within its frame part.
This then naturally forms a header and a body.
It may be applied recursively, forming a chain of headers and bodies.

All integers are sent most significant bit first.

A type like `Interface[uint8]` means a variable-length list of `Interface` using a `uint8` to describe the number of elements.

### Message Header

```
struct UnencryptedHeader {
  Version version

  union {
    UnencryptedHeaderV1 header_v1
  } versioned
}

struct UnencryptedHeaderV1 {
  uint4 type

  union ProtectionAlgorithmHeader {} protection_algorithm
}

enum Version : uint4 {
  VERSION_1 = 1
}
```

### Encrypted Header

```
struct Header {
  union {
    HeaderV1 header_v1
  } versioned
}

struct HeaderV1 {
  uint32 sequence_number
}
```

## Protocol Messages

Message type zero is reserved and never used.

### Hello (type 1)

The Hello message is sent by the receiver over a line-of-sight medium to request pairing.

* Message Type: 1
* Unencrypted: `HelloUnencrypted`
* Encrypted: empty

```
struct HelloUnencrypted {
  ProtectionAlgorithm[uint8] protection_algorithm
  Interface[uint8] interfaces
}

struct ProtectionAlgorithm {
  ProtectionAlgorithmType type

  union Parameters {} parameters
}

// Follows https://www.iana.org/assignments/aead-parameters/aead-parameters.xhtml for values under 128.
// We reserve 128 and up for private use.
enum ProtectionAlgorithmType : uint8 {}

struct Interface {
  InterfaceType type
}

enum InterfaceType : uint8 {}
```

### Establish (type 2)

The Establish message is sent by the transmitter over radio, requesting pairing.
It is only valid in configuration mode.

* Message Type: 2
* Unencrypted: empty
* Encrypted: `Establish`

```
struct Establish {
  ProtectionAlgorithmType protection_algorithm_type
  uint8[16] transmitter_id
  InterfaceType[uint8] interface_types
}
```

### Terminate (type 3)

The Terminate message is sent by the transmitter over radio, requesting unpairing.
It is only valid in configuration mode.

* Message Type: 3
* Unencrypted: empty
* Encrypted: `Terminate`

```
struct Terminate {
  uint8[16] transmitter_id
}
```

### Configure (type 4)

The Configure message is sent by the transmitter over radio, asking that the receiver be placed into configuration mode.
The receiver should revert to normal mode after some time, e.g. 30 seconds.

A receiver may choose to go into configuration mode even for other messages, but this message is guaranteed to not cause other actions.

* Message type: 4
* Unencrypted: empty
* Encrypted: empty

### Act (type 8)

The Act message is sent by the transmitter over radio, requesting that the receiver performs a normal operation.

* Message type: 8
* Unencrypted: empty
* Encrypted: `Act`

```
struct Act {
  InterfaceType interface

  union Parameters {} parameters
}
```


## Protection Algorithms

### None

Just kidding, there is no unencrypted mode.

### AES128-OCB

Encryption uses AES-128 with the OCB3 block mode, defined in [RFC 7253](https://www.rfc-editor.org/rfc/rfc7253.txt).
It is an [AEAD](https://en.wikipedia.org/wiki/Authenticated_encryption#Authenticated_encryption_with_associated_data_(AEAD)), meaning the MIC is integrated into the block mode algorithm (where it is referred to as the "tag.")

```
enum ProtectionAlgorithmType {
  AEAD_AES_128_OCB_TAGLEN128 = 20
  AEAD_AES_128_OCB_TAGLEN64 = 22
}

union ProtectionAlgorithm::Parameters {
  Aes128OcbParameters aes128_ocb128
  Aes128OcbParameters aes128_ocb64
}

struct Aes128OcbParameters {
  uint8[16] shared_key
}

union UnencryptedHeaderV1::ProtectionAlgorithmHeader {
  Aes128Ocb128Header aes128_ocb128
  Aes128Ocb64Header aes128_ocb64
}

struct Aes128Ocb128Header {
  uint8[8] nonce
}

struct Aes128Ocb64Header {
  uint8[4] nonce
}
```

#### Security Considerations

* The same nonce must only be used to encrypt one message.
  It is the transmitter's responsibility to ensure this.
  Receivers do not have to perform any checks.
  It can be a counter, and is not secret.
* Because the nonce must be transmitted unencrypted, consider the implications to anonymity.
  If this is a simple counter, it would relatively easy for an eavesdropper to infer which transmitter is transmitting.
  Making it pseudo-random would help, but uniqueness must still be guaranteed.
  One way would be to use a small (32/64-bit) block cipher, but AES-128 is too large.
  This specification does not dictate a nonce algorithm, because combining anonymity and guaranteed uniqueness is a difficult trade-off in systems with limited memory.
  There are some possibilities:
  * [Skip32](https://wiki.postgresql.org/wiki/Skip32_(crypt_32_bits)) is in use for obfuscating sequence numbers.
  * [RC5](https://en.wikipedia.org/wiki/RC5) has a 32/64-bit block sizes.
  * [Speck](https://en.wikipedia.org/wiki/Speck_(cipher)), defined by the NSA, has 32/64-bit block sizes.
  * [KATAN/KTANTAN](https://link.springer.com/chapter/10.1007/978-3-642-04138-9_20) does not seem to have received much analysis after 2013.
* The same key should not be used to transmit more than 4 PiB of message data.
* The smaller taglen of 64 bits does not affect computations, only frame length.
  However, smaller frame lengths decrease the probability of transmission errors.


## Interfaces

This section defines "interfaces," or interaction profiles that a pair of devices may negotiate.
A single device may support multiple interfaces.
E.g. a remote control may support both a simple one-button interface, and distinguishing between up and down actions.
It is suggested that transmitters choose the most semantically meaningful interface both devices support.

### Button Act (type 1)

A single button is used to "act" without further specifying what that means.
It could be a button that moves a state machine forward to the next state.

The message sequence number is used to
```
enum InterfaceType {
  BUTTON_ACT = 1
}

struct Act::Parameters {
  ButtonAct button_act
}

struct ButtonAct {}
```


## Security Considerations

### Threat Model

* The radio medium must be considered public, and not trusted.
* The line-of-sight medium is considered private, and can be trusted.
  It should be easy for a user to inspect whether the communications are being eavesdropped or not.
  The line-of-sight medium should be used only to establish trust between devices.
* Receivers and transmitters should avoid timing attacks using constant-time algorithms, or time padding.
* Power-analysis attacks are well-known attack vector for KeeLoq remote controls.
  Transmitters, being reasonably easy to lose, should be kept to high standard and seek to mitigate power analysis.
  Receivers, requiring physical access during the attack and special tools to probe, are not considered in-scope.
* Likewise, power glitching attacks should not cause a transmitter to directly or indirectly leak keys.
  Receivers are not in-scope, as long as the attack requires physically opening the device with tools.
* Receivers should consider brute-force attacks.
  A possible mitigation is to limit the acceptance rate of messages.
  E.g. if all messages are expected to be triggered by humans, a limit of 3-10 messages per second is reasonable.
  The limit can be made per message type.
  Note that powering the device off and on again could circumvent a simple rate limiter.
  It is suggested to introduce a slight startup delay to enforce the limit.
