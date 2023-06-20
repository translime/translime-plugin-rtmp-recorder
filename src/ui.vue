<script setup>
import {
  ref,
  onMounted,
  toRaw,
} from 'vue';
import dayjs from 'dayjs';

const ipc = window.electron.useIpc();
const pluginId = 'translime-plugin-rtmp-recorder';

const url = ref('');
const saveDir = ref('');
const otherOptions = ref({
  splitTimeout: 3600,
  saveFilenameTemplate: '[record]_YYYY-MM-DD_HH-mm-ss_[%03d]',
  audioCodec: 'copy',
  videoCodec: 'copy',
});
const isProcessing = ref(false);
const previewFilenameError = ref(false);
const previewFilenameResult = ref('');
const currentProgress = ref({});
const error = ref('');
const checkProgressTimer = ref(null);

const useAlert = () => {
  const isVisible = ref(false);
  const confirmPromise = ref(null);
  const message = ref('');

  function onConfirm() {
    confirmPromise.value(true);
    confirmPromise.value = null;
    isVisible.value = false;
  }
  function onCancel() {
    if (confirmPromise.value) {
      confirmPromise.value(false);
    }
    confirmPromise.value = null;
    isVisible.value = false;
  }

  function show(msg) {
    message.value = msg;
    isVisible.value = true;
    return new Promise((resolve) => {
      confirmPromise.value = resolve;
    });
  }

  return {
    isVisible,
    show,
    onConfirm,
    onCancel,
    message,
  };
};
const alert = useAlert();

const useSelectDir = () => {
  const { dialog } = window.electron;
  const selectDirError = ref('');
  const openDialog = async (options = {}) => {
    const result = await dialog.showOpenDialog(`plugin-window-${pluginId}`, {
      properties: ['openDirectory', 'dontAddToRecent'],
      ...options,
    });
    if (result.err) {
      selectDirError.value = '读取文件出错';
    } else if (!result.data.canceled) {
      [saveDir.value] = result.data.filePaths;
    }
  };

  return {
    error: selectDirError,
    openDialog,
  };
};
const selectDir = useSelectDir();

const saveOptions = async () => {
  await window.ts.setPluginSetting(pluginId, 'record-setting', {
    url: url.value,
    'save-dir': saveDir.value,
    'split-timeout': otherOptions.value.splitTimeout,
    'save-filename-template': otherOptions.value.saveFilenameTemplate,
    'audio-codec': otherOptions.value.audioCodec,
    'video-codec': otherOptions.value.videoCodec,
  });
};
const getSaveFilenameTemplate = () => dayjs().format(otherOptions.value.saveFilenameTemplate);
const checkOptions = () => {
  if (previewFilenameError.value) {
    return '文件模板格式不正确';
  }
  if (!url.value) {
    return '请设置直播源';
  }
  if (!saveDir.value) {
    return '请设置保存位置';
  }

  return false;
};
const stop = () => {
  ipc.send(`stop@${pluginId}`);
};
const start = () => {
  const checkResult = checkOptions();
  if (checkResult) {
    alert.show(checkResult);
    return;
  }
  currentProgress.value = {};
  error.value = '';
  checkProgressTimer.value = setTimeout(() => {
    stop();
    alert.show('录制进程30没有返回进度信息，进程已强制关闭。');
  }, 30000);
  ipc.send(`record@${pluginId}`, {
    url: url.value,
    saveDir: saveDir.value,
    options: { ...toRaw(otherOptions.value), saveFilenameTemplate: getSaveFilenameTemplate() },
  });
  isProcessing.value = true;
  saveOptions();
};

// 进度
const onProgress = () => {
  ipc.on(`progress-reply@${pluginId}`, (p) => {
    currentProgress.value = p;
    isProcessing.value = true;
    if (checkProgressTimer.value) {
      clearTimeout(checkProgressTimer.value);
      checkProgressTimer.value = null;
    }
  });
};

// 报错
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

const onQuickSelectSplitTimeout = (val) => {
  otherOptions.value.splitTimeout = val;
};

const getPreviewFilename = () => {
  previewFilenameError.value = false;
  let formattedFilename = getSaveFilenameTemplate();
  const ffStringTempReg = /%(\d*)d/;
  const ffStringTempMatch = formattedFilename.match(ffStringTempReg);
  if (ffStringTempMatch?.length) {
    formattedFilename = formattedFilename.replace(ffStringTempReg, ffStringTempMatch[1] ? (`${'0'.repeat(+ffStringTempMatch[1] - 1)}1`) : '1');
  }
  if (formattedFilename.match(ffStringTempReg)?.length) {
    previewFilenameError.value = true;
    previewFilenameResult.value = '';
    return;
  }
  previewFilenameResult.value = `${formattedFilename}.mp4`;
};

const getSetting = async () => {
  const setting = await window.ts.getPluginSetting(pluginId);
  if (typeof setting?.['record-setting']?.url !== 'undefined') {
    url.value = setting['record-setting'].url;
  }
  if (typeof setting?.['record-setting']?.['save-dir'] !== 'undefined') {
    saveDir.value = setting['record-setting']['save-dir'];
  }
  if (typeof setting?.['record-setting']?.['split-timeout'] !== 'undefined') {
    otherOptions.value.splitTimeout = setting['record-setting']['split-timeout'];
  }
  if (typeof setting?.['record-setting']?.['save-filename-template'] !== 'undefined') {
    otherOptions.value.saveFilenameTemplate = setting['record-setting']['save-filename-template'];
  }
  if (typeof setting?.['record-setting']?.['audio-codec'] !== 'undefined') {
    otherOptions.value.audioCodec = setting['record-setting']['audio-codec'];
  }
  if (typeof setting?.['record-setting']?.['video-codec'] !== 'undefined') {
    otherOptions.value.videoCodec = setting['record-setting']['video-codec'];
  }
};

const selectSaveDir = async () => {
  await selectDir.openDialog();
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
          <template v-slot:prepend>
            <v-avatar color="primary">
              <v-icon>radio_button_checked</v-icon>
            </v-avatar>
          </template>
          <v-list-item-title>填写直播源开始录制</v-list-item-title>
        </v-list-item>
      </v-list>

      <v-card-text>
        <div>
          <!-- todo: 选择直播平台填入房间号自动获取直播源，原直播源选项放入自定义选项中 -->
          <v-text-field v-model="url" color="primary" label="直播源" placeholder="设置直播来源" />
        </div>

        <div class="mt-4">
          <v-text-field
            v-model="saveDir"
            color="primary"
            label="保存文件夹"
            readonly
            append-icon="folder_open"
            @click:append="selectSaveDir"
          />
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
          <template v-slot:prepend>
            <v-avatar color="primary">
              <v-icon>settings</v-icon>
            </v-avatar>
          </template>
          <v-list-item-title>设置更多录制参数</v-list-item-title>
        </v-list-item>
      </v-list>

      <v-card-text>
        <v-row>
          <v-col cols="6">
            <v-text-field
              v-model="otherOptions.splitTimeout"
              color="primary"
              label="自动分割(单位：秒)"
              placeholder="设置自动分割间隔"
              hide-details
            />
          </v-col>

          <v-col cols="6">
            <v-select
              color="primary"
              label="快捷选择自动分割"
              hide-details
              :items="[
                { title: '不分割', value: 0 },
                { title: '1分钟', value: 60 },
                { title: '2分钟', value: 120 },
                { title: '3分钟', value: 180 },
                { title: '5分钟', value: 300 },
                { title: '10分钟', value: 600 },
                { title: '15分钟', value: 900 },
                { title: '20分钟', value: 1200 },
                { title: '30分钟', value: 1800 },
                { title: '45分钟', value: 2700 },
                { title: '1小时', value: 3600 },
                { title: '2小时', value: 7200 },
              ]"
              @update:model-value="onQuickSelectSplitTimeout"
            />
          </v-col>
        </v-row>

        <v-row class="mt-4">
          <v-col cols="6">
            <v-text-field
              v-model="otherOptions.audioCodec"
              color="primary"
              label="音频编码"
              placeholder="设置音频编码"
              hide-details
            />
          </v-col>

          <v-col cols="6">
            <v-text-field
              v-model="otherOptions.videoCodec"
              color="primary"
              label="视频编码"
              placeholder="设置视频编码"
              hide-details
            />
          </v-col>
        </v-row>

        <div class="mt-4">
          <v-text-field
            v-model="otherOptions.saveFilenameTemplate"
            color="primary"
            label="保存文件名模板"
            :hint="`预览：${previewFilenameResult}`"
            :error="previewFilenameError"
            @update:model-value="getPreviewFilename"
            @focus="getPreviewFilename"
          />
        </div>
      </v-card-text>
    </v-card>

    <v-dialog
      :model-value="alert.isVisible.value"
      :update:modelValue="alert.onCancel"
      width="350"
      persistent
    >
      <v-card rounded="xl">
        <v-card-title>出错了</v-card-title>

        <v-card-text>{{ alert.message.value }}</v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" rounded="pill" @click="alert.onCancel">确定</v-btn>
          <v-spacer />
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
