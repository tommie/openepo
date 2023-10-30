<script setup lang="ts">
import { reactive, ref } from "vue";
import { Action, BusTap, InterfaceType, MessageType, PrivateFrame, PRNG, ProtectedFrame, PublicFrame, Receiver, ReceiverState, Scheduler, SimpleBus, TaggedFrame, Transmitter, TransmitterState } from "../lib/main";

const pub = new SimpleBus<TaggedFrame<ProtectedFrame<PublicFrame>>>();
const priv = new SimpleBus<TaggedFrame<PrivateFrame>>();
const trafficLog = reactive<{ type: string, src: string | Symbol, tag: string, msg: ProtectedFrame<PublicFrame> | PrivateFrame, followUps: {type: string, src: string | Symbol}[] }[]>([]);
function appendTrafficLog(type: string, src: string | Symbol, msg: TaggedFrame<ProtectedFrame<PublicFrame> | PrivateFrame>) {
    const { tag, ...msg2 } = msg;
    const prev = trafficLog.find((entry) => entry.tag === tag);
    if (prev === undefined) {
      trafficLog.push({ type, src, tag, msg: msg2, followUps: [] });
    } else {
      prev.followUps.push({ type, src });
    }
}
const logger = {
  received(msg: TaggedFrame<ProtectedFrame<PublicFrame> | PrivateFrame>, src: string | Symbol) {
    appendTrafficLog('rx', src, msg);
  },

  sent(msg: TaggedFrame<ProtectedFrame<PublicFrame> | PrivateFrame>, src: string | Symbol) {
    appendTrafficLog('tx', src, msg);
  },
};

const expandedLogEntry = ref<string>();

const prng = new PRNG();
const txState = ref<TransmitterState>(TransmitterState.IDLE);
const txIsPaired = ref(false);
const tx = ref(newTransmitter());

function newTransmitter() {
  return new Transmitter(new BusTap<ProtectedFrame<PublicFrame>>(pub, logger, "TX"), new BusTap<PrivateFrame>(priv, logger, "TX"), {
    id: prng.getRandomBytes(8 * 8),
    actor: {
      stateChanged(state: TransmitterState) {
        txState.value = state;
      },
      pairingChanged(paired: boolean) {
        txIsPaired.value = paired;
      },
    },
    scheduler: new Scheduler(),
    prng,
  });
}

const rxState = ref<ReceiverState>(ReceiverState.STARTING);
const rxSessionIds = ref<string[]>([]);
const rx = ref(newReceiver());
const rxActing = ref(false);

function newReceiver() {
  return new Receiver(new BusTap<ProtectedFrame<PublicFrame>>(pub, logger, "RX"), new BusTap<PrivateFrame>(priv, logger, "RX"), {
    actor: {
      act(action: Action) {
        if (action.interface === InterfaceType.BUTTON_ACT) {
          rxActing.value = true;
          setTimeout(() => {
            rxActing.value = false;
          }, 500);
        }
      },

      stateChanged(state: ReceiverState) {
        rxState.value = state;
        rxSessionIds.value = rx.value.sessionIds;
      },
    },
    scheduler: new Scheduler(),
    prng,
  });
}

function onTxFactoryReset() {
  txState.value = TransmitterState.IDLE;
  txIsPaired.value = false;
  tx.value = newTransmitter();
}

function onRxFactoryReset() {
  rxState.value = ReceiverState.STARTING;
  rxSessionIds.value = [];
  rx.value = newReceiver();
}
</script>

<template>
  <div class="d-flex flex-row align-items-stretch">
    <div class="flex-grow-1 text-center p-4">
      <h2>Transmitter</h2>

      <section class="d-flex flex-column align-items-center gap-3">
        <div class="my-4">
          <span class="badge rounded-pill text-bg-info mx-2">{{ TransmitterState[txState] }}</span>
          <span class="badge rounded-pill text-bg-success mx-2" v-if="txIsPaired">Paired</span>
        </div>

        <button class="btn btn-primary" @click="() => tx.act({interface: InterfaceType.BUTTON_ACT })">Act</button>

        <button class="btn btn-secondary" @click="() => tx.setPairing()" :disabled="txState === TransmitterState.PAIRING">Set Pairing</button>
        <button class="btn btn-secondary" @click="() => tx.unpair()" :disabled="!txIsPaired">Unpair</button>
        <button class="btn btn-secondary" @click="() => tx.setConfiguring()" :disabled="!txIsPaired">Set Configuring</button>
        <button class="btn btn-danger" @click="onTxFactoryReset">Factory Reset</button>
      </section>
    </div>
    <div class="flex-grow-1 bg-light p-4">
      <button @click="() => trafficLog.splice(0)">Clear</button>
      <ol>
        <li v-for="(entry, index) in trafficLog" :key="index" style="cursor: pointer" @click="() => { expandedLogEntry = expandedLogEntry === entry.tag ? undefined : entry.tag; }">
          <span v-if="entry.src === 'RX'">
            ⇐ {{ MessageType[entry.msg.unencrypted.header.type] }}
          </span>
          <span v-else>
            ⇒ {{ MessageType[entry.msg.unencrypted.header.type] }}
          </span>
          <span v-if="entry.followUps.length" title="Received"> ✔</span>

          <pre v-if="expandedLogEntry === entry.tag">{{ JSON.stringify(entry.msg, undefined, 2) }}</pre>
        </li>
      </ol>
    </div>
    <div class="flex-grow-1 text-center p-4">
      <h2>Receiver</h2>

      <section class="d-flex flex-column align-items-center gap-3">
        <span class="badge rounded-pill text-bg-info my-4">{{ ReceiverState[rxState] }}</span>

        <div :style="{ opacity: rxActing ? 1 : 0 }" class="rx-acting text-success my-4">
          <div class="spinner-border"></div>
          <div>Acting</div>
        </div>

        <button class="btn btn-primary" @click="() => rx.setPairing()" :disabled="rxState !== ReceiverState.CONFIGURING">Set Pairing</button>
        <button class="btn btn-primary" @click="() => rx.setUnpairing()" :disabled="rxState !== ReceiverState.CONFIGURING">Set Unpairing</button>
        <button class="btn btn-danger" @click="onRxFactoryReset" :disabled="rxState === ReceiverState.STARTING">Factory Reset</button>
      </section>

      <section class="mt-4">
        <h3>Paired Sessions</h3>
        <ul class="list-unstyled">
          <li v-for="id in rxSessionIds" :key="id">{{ id }}</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.rx-acting {
  transition: opacity 200ms ease-in;
}
</style>
