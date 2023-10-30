<script lang="ts">
import { reactive, ref } from "vue";
import { MessageType, PrivateFrame, ProtectedFrame, PublicFrame, TaggedFrame } from "../lib/main";

export interface LogEntry {
  type: string;
  src: string | Symbol;
  tag: string;
  msg: ProtectedFrame<PublicFrame> | PrivateFrame;
  followUps: { type: string, src: string | Symbol }[];
}

export function useLogger() {
  const log = reactive<LogEntry[]>([]);
  function appendTrafficLog(type: string, src: string | Symbol, msg: TaggedFrame<ProtectedFrame<PublicFrame> | PrivateFrame>) {
    const { tag, ...msg2 } = msg;
    const prev = log.find((entry) => entry.tag === tag);
    if (prev === undefined) {
      log.push({ type, src, tag, msg: msg2, followUps: [] });
    } else {
      prev.followUps.push({ type, src });
    }
  }

  return {
    log,
    logger: {
      received(msg: TaggedFrame<ProtectedFrame<PublicFrame> | PrivateFrame>, src: string | Symbol) {
        appendTrafficLog('rx', src, msg);
      },

      sent(msg: TaggedFrame<ProtectedFrame<PublicFrame> | PrivateFrame>, src: string | Symbol) {
        appendTrafficLog('tx', src, msg);
      },
    },
  };
}
</script>

<script setup lang="ts">
defineProps<{
  log: LogEntry[],
}>();

const expandedLogEntry = ref<string>();
</script>

<template>
  <div>
    <button class="btn btn-secondary p-4" @click="() => log.splice(0)">Clear</button>
    <ol>
      <li v-for="(entry, index) in log" :key="index" style="cursor: pointer" @click="() => { expandedLogEntry = expandedLogEntry === entry.tag ? undefined : entry.tag; }">
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
</template>
