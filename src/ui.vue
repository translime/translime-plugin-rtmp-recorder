<script setup>
import { ref, onMounted, toRaw } from 'vue';

const ipc = window.electron.useIpc();
const pluginId = 'translime-plugin-rtmp-recorder';

const url = ref('');
const saveDir = ref('');
const otherOptions = ref({
  splitTimeout: 60,
  saveFilenameTemplate: 'test_%03d',
  audioCodec: 'copy',
  videoCodec: 'copy',
});
const isProcessing = ref(false);
const saveOptions = async () => {
  await window.ts.setPluginSetting(pluginId, 'url', url.value);
  await window.ts.setPluginSetting(pluginId, 'save-dir', saveDir.value);
  await window.ts.setPluginSetting(pluginId, 'split-timeout', otherOptions.value.splitTimeout);
  await window.ts.setPluginSetting(pluginId, 'save-filename-template', otherOptions.value.saveFilenameTemplate);
  await window.ts.setPluginSetting(pluginId, 'audio-codec', otherOptions.value.audioCodec);
  await window.ts.setPluginSetting(pluginId, 'video-codec', otherOptions.value.videoCodec);
};
const start = () => {
  ipc.send(`record@${pluginId}`, url.value, saveDir.value, toRaw(otherOptions.value));
  isProcessing.value = true;
  saveOptions();
};
const stop = () => {
  ipc.send(`stop@${pluginId}`);
};

// 进度
const currentProgress = ref({});
const onProgress = () => {
  ipc.on(`progress-reply@${pluginId}`, (p) => {
    console.log({ p });
    currentProgress.value = p;
    isProcessing.value = true;
  });
};

// 报错
const error = ref('');
const onError = () => {
  ipc.on(`error-reply@${pluginId}`, (err) => {
    error.value = err;
    isProcessing.value = false;
  });
};

// 结束
const onStop = () => {
  ipc.on(`stop-reply@${pluginId}`, () => {
    isProcessing.value = false;
  });
};

const getSetting = async () => {
  const setting = await window.ts.getPluginSetting(pluginId);
  if (typeof setting.url !== 'undefined') {
    url.value = setting.url;
  }
  if (typeof setting['save-dir'] !== 'undefined') {
    saveDir.value = setting['save-dir'];
  }
  if (typeof setting['split-timeout'] !== 'undefined') {
    otherOptions.value.splitTimeout = setting['split-timeout'];
  }
  if (typeof setting['save-filename-template'] !== 'undefined') {
    otherOptions.value.saveFilenameTemplate = setting['save-filename-template'];
  }
  if (typeof setting['audio-codec'] !== 'undefined') {
    otherOptions.value.audioCodec = setting['audio-codec'];
  }
  if (typeof setting['video-codec'] !== 'undefined') {
    otherOptions.value.videoCodec = setting['video-codec'];
  }
};

onMounted(() => {
  onProgress();
  onError();
  onStop();
  getSetting();
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
      <v-list>
        <v-list-item>
          <v-list-item-title>填写直播源开始录制</v-list-item-title>
        </v-list-item>
      </v-list>

      <v-card-text>
        <div>
          <v-text-field v-model="url" color="primary" label="直播源" hint="设置直播来源" />
        </div>

        <div class="mt-4">
          <v-text-field v-model="saveDir" color="primary" label="保存文件夹" hint="设置保存文件夹" />
        </div>

        <div v-if="error" class="mt-4">
          出错了：{{ error }}
        </div>

        <div v-if="isProcessing" class="mt-4">
          <span>当前帧：</span>
          <span v-text="currentProgress?.frames"></span>
          <span class="ml-2">fps：</span>
          <span v-text="currentProgress?.currentFps"></span>
          <span class="ml-2">时长：</span>
          <span v-text="currentProgress?.timemark"></span>
        </div>

        <div class="d-flex align-center mt-4">
          <v-spacer />

          <div v-if="isProcessing" class="mr-4">🔴</div>
          <v-btn v-if="!isProcessing" color="primary" rounded="pill" @click="start">开始录制</v-btn>
          <v-btn v-else color="primary" rounded="pill" variant="outlined" @click="stop">停止录制</v-btn>
        </div>
      </v-card-text>
    </v-card>

    <v-card class="mt-4" rounded="xl" variant="tonal">
      <v-list>
        <v-list-item>
          <v-list-item-title>设置更多录制参数</v-list-item-title>
        </v-list-item>
      </v-list>

      <v-card-text>
        <div>
          <v-text-field v-model="otherOptions.saveFilenameTemplate" color="primary" label="直播源" hint="设置直播来源" />
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>
