<script setup lang="ts">
import { ref } from "vue";
import { Action, Bus, BusTap, InterfaceType, Log, PrivateFrame, PRNG, ProtectedFrame, PublicFrame, Receiver, ReceiverState, Scheduler, TaggedFrame } from "../lib/main";

const props = defineProps<{
  publicMedium: Bus<TaggedFrame<ProtectedFrame<PublicFrame>>>,
  privateMedium: Bus<TaggedFrame<PrivateFrame>>,
  logger: Log<ProtectedFrame<PublicFrame> | PrivateFrame>,
  tag: string,
}>();

const rxState = ref<ReceiverState>(ReceiverState.STARTING);
const rxSessionIds = ref<string[]>([]);
const rx = ref(newReceiver());
const rxActing = ref(false);

function newReceiver() {
  return new Receiver(new BusTap<ProtectedFrame<PublicFrame>>(props.publicMedium, props.logger, props.tag), new BusTap<PrivateFrame>(props.privateMedium, props.logger, props.tag), {
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
    prng: new PRNG(),
  });
}

function onRxFactoryReset() {
  rxState.value = ReceiverState.STARTING;
  rxSessionIds.value = [];
  rx.value = newReceiver();
}
</script>

<template>
  <div>
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
</template>

<style scoped>
.rx-acting {
  transition: opacity 200ms ease-in;
}
</style>
