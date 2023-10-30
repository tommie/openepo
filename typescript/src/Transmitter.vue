<script setup lang="ts">
import { ref } from "vue";
import { Bus, BusTap, InterfaceType, Log, PrivateFrame, PRNG, ProtectedFrame, PublicFrame, Scheduler, TaggedFrame, Transmitter, TransmitterState } from "../lib/main";

const props = defineProps<{
  publicMedium: Bus<TaggedFrame<ProtectedFrame<PublicFrame>>>,
  privateMedium: Bus<TaggedFrame<PrivateFrame>>,
  logger: Log<ProtectedFrame<PublicFrame> | PrivateFrame>,
  tag: string,
}>();

const prng = new PRNG();
const txState = ref<TransmitterState>(TransmitterState.IDLE);
const txIsPaired = ref(false);
const tx = ref(newTransmitter());

function newTransmitter() {
  return new Transmitter(new BusTap<ProtectedFrame<PublicFrame>>(props.publicMedium, props.logger, props.tag), new BusTap<PrivateFrame>(props.privateMedium, props.logger, props.tag), {
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

function onTxFactoryReset() {
  txState.value = TransmitterState.IDLE;
  txIsPaired.value = false;
  tx.value = newTransmitter();
}
</script>

<template>
  <div class="d-flex flex-column align-items-center gap-3">
    <div class="my-4">
      <span class="badge rounded-pill text-bg-info mx-2">{{ TransmitterState[txState] }}</span>
      <span class="badge rounded-pill text-bg-success mx-2" v-if="txIsPaired">Paired</span>
    </div>

    <button class="btn btn-primary" @click="() => tx.act({interface: InterfaceType.BUTTON_ACT })">Act</button>

    <button class="btn btn-secondary" @click="() => tx.setPairing()" :disabled="txState === TransmitterState.PAIRING">Set Pairing</button>
    <button class="btn btn-secondary" @click="() => tx.unpair()" :disabled="!txIsPaired">Unpair</button>
    <button class="btn btn-secondary" @click="() => tx.setConfiguring()" :disabled="!txIsPaired">Set Configuring</button>
    <button class="btn btn-danger" @click="onTxFactoryReset">Factory Reset</button>
  </div>
</template>
