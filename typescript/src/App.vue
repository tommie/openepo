<script setup lang="ts">
import { PrivateFrame, ProtectedFrame, PublicFrame, SimpleBus, TaggedFrame } from "../lib/main";
import Receiver from "./Receiver.vue";
import Transmitter from "./Transmitter.vue";
import TrafficLog, { useLogger } from "./TrafficLog.vue";

const pub = new SimpleBus<TaggedFrame<ProtectedFrame<PublicFrame>>>();
const priv = new SimpleBus<TaggedFrame<PrivateFrame>>();
const { log, logger } = useLogger();
</script>

<template>
  <div class="d-flex flex-row align-items-stretch">
    <div class="flex-grow-1 text-center p-4">
      <h2>Transmitter</h2>

      <Transmitter :public-medium="pub" :private-medium="priv" :logger="logger" tag="Tx" />
    </div>
    <div class="flex-grow-1 bg-light p-4">
      <TrafficLog :log="log" />
    </div>
    <div class="flex-grow-1 text-center p-4">
      <h2>Receiver</h2>

      <Receiver :public-medium="pub" :private-medium="priv" :logger="logger" tag="Tx" />
    </div>
  </div>
</template>
