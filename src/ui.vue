<script setup>
import { ref, onMounted } from 'vue';

const ipc = window.electron.useIpc();
const pluginId = 'translime-plugin-rtmp-recorder';

const url = ref('');
const progress = ref({});
const start = () => {
  ipc.send(`record@${pluginId}`, url.value);
};
const onProgress = () => {
  ipc.on(`progress@${pluginId}`, (p) => {
    progress.value = p;
  });
};

onMounted(() => {
  onProgress();
});
</script>

<script>
const vuetify = window.vuetify$.components;

export default {
  name: 'PluginUi',

  components: {
    ...vuetify,
  },
};
</script>

<template>
  <v-container class="plugin-main">
    <v-card rounded="xl" variant="tonal">
      <v-card-text>
        <div>
          <v-text-field v-model="url" color="primary" label="直播源" hint="设置直播来源" />
        </div>

        <div class="mt-4">
          <v-btn>更多设置</v-btn>
        </div>

        <div class="d-flex mt-4">
          <v-spacer />

          <v-btn color="primary" rounded="pill" @click="start">开始录制</v-btn>
        </div>

        <div class="mt-4">
          <pre v-text="JSON.stringify(progress, null, 2)"></pre>
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>
