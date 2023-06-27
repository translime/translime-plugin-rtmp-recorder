<script setup>
import {
  ref,
  onMounted,
  toRaw,
} from 'vue';
import dayjs from 'dayjs';

const useStore = () => {
  const pluginId = 'translime-plugin-rtmp-recorder';
  const url = ref('');
  const saveDir = ref('');
  const otherOptions = ref({
    splitTimeout: 3600,
    saveFilenameTemplate: '[record]_YYYY-MM-DD_HH-mm-ss',
    saveFormat: 'mp4',
    audioCodec: 'copy',
    videoCodec: 'copy',
  });
  const isProcessing = ref(false);
  const tryStop = ref(false);
  const previewFilenameError = ref(false);
  const previewFilenameResult = ref('');
  const currentProgress = ref({});
  const error = ref('');
  const checkProgressTimer = ref(null);
  const stdLines = ref({
    logs: [],
    latest: '',
    oneLine: true,
  });
  const tasks = ref([]);

  return {
    pluginId,
    url,
    saveDir,
    otherOptions,
    isProcessing,
    tryStop,
    previewFilenameError,
    previewFilenameResult,
    currentProgress,
    error,
    checkProgressTimer,
    stdLines,
    tasks,
  };
};
const store = useStore();
const {
  url,
  saveDir,
  otherOptions,
  isProcessing,
  tryStop,
  previewFilenameError,
  previewFilenameResult,
  currentProgress,
  error,
  stdLines,
  tasks,
} = store;
const ipc = window.electron.useIpc();
const { showOpenDialog } = window.electron.dialog;
const { getPluginSetting, setPluginSetting } = window.ts;
const getSaveFilenameTemplate = () => dayjs().format(store.otherOptions.value.saveFilenameTemplate);
const getUuiD = (randomLength = 8) => Number(Math.random().toString().substring(2, 2 + randomLength) + +Date.now()).toString(36);

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
  const selectDirError = ref('');
  const openDialog = async (options = {}) => {
    const result = await showOpenDialog(`plugin-window-${store.pluginId}`, {
      properties: ['openDirectory', 'dontAddToRecent'],
      ...options,
    });
    if (result.err) {
      selectDirError.value = '读取文件出错';
    } else if (!result.data.canceled) {
      [store.saveDir.value] = result.data.filePaths;
    }
  };

  return {
    error: selectDirError,
    openDialog,
  };
};
const selectDir = useSelectDir();

const useRecord = (state) => {
  const saveOptions = async () => {
    await setPluginSetting(state.pluginId, 'record-setting', {
      url: state.url.value,
      'save-dir': state.saveDir.value,
      'split-timeout': state.otherOptions.value.splitTimeout,
      'save-filename-template': state.otherOptions.value.saveFilenameTemplate,
      'save-format': state.otherOptions.value.saveFormat,
      'audio-codec': state.otherOptions.value.audioCodec,
      'video-codec': state.otherOptions.value.videoCodec,
    });
  };
  const checkOptions = () => {
    if (state.previewFilenameError.value) {
      return '文件模板格式不正确';
    }
    if (!state.url.value) {
      return '请设置直播源';
    }
    if (!state.saveDir.value) {
      return '请设置保存位置';
    }

    return false;
  };
  const getTask = (s, id) => s.tasks.value.find((t) => t.taskId === id);
  const clearCheckProgressTimeout = (taskId) => {
    const task = getTask(state, taskId);
    if (task && task.checkProgressTimer) {
      clearTimeout(task.checkProgressTimer);
      task.checkProgressTimer = null;
    }
  };

  const getOptions = async () => {
    const setting = await getPluginSetting(state.pluginId);
    if (typeof setting?.['record-setting']?.url !== 'undefined') {
      state.url.value = setting['record-setting'].url;
    }
    if (typeof setting?.['record-setting']?.['save-dir'] !== 'undefined') {
      state.saveDir.value = setting['record-setting']['save-dir'];
    }
    if (typeof setting?.['record-setting']?.['split-timeout'] !== 'undefined') {
      state.otherOptions.value.splitTimeout = setting['record-setting']['split-timeout'];
    }
    if (typeof setting?.['record-setting']?.['save-filename-template'] !== 'undefined') {
      state.otherOptions.value.saveFilenameTemplate = setting['record-setting']['save-filename-template'];
    }
    if (typeof setting?.['record-setting']?.['save-format'] !== 'undefined') {
      state.otherOptions.value.saveFormat = setting['record-setting']['save-format'];
    }
    if (typeof setting?.['record-setting']?.['audio-codec'] !== 'undefined') {
      state.otherOptions.value.audioCodec = setting['record-setting']['audio-codec'];
    }
    if (typeof setting?.['record-setting']?.['video-codec'] !== 'undefined') {
      state.otherOptions.value.videoCodec = setting['record-setting']['video-codec'];
    }
  };
  const stop = (taskId) => {
    const task = getTask(state, taskId);
    if (task) {
      task.tryStop = true;
    }
    ipc.send(`stop@${state.pluginId}`, taskId);
  };
  const start = () => {
    const checkResult = checkOptions();
    if (checkResult) {
      alert.show(checkResult);
      return;
    }
    const taskId = getUuiD();
    state.stdLines.value.latest = '';
    state.stdLines.value.logs = [];
    state.tasks.value.push({
      taskId,
      currentProgress: {},
      error: '',
      checkProgressTimer: setTimeout(() => {
        stop();
        alert.show('录制进程30没有返回进度信息，进程已强制关闭。');
      }, 30000),
      stdLines: {
        logs: [],
        latest: '',
        oneLine: true,
      },
      isProcessing: true,
      tryStop: false,
    });
    ipc.send(`record@${state.pluginId}`, {
      taskId,
      url: state.url.value,
      saveDir: state.saveDir.value,
      options: { ...toRaw(state.otherOptions.value), saveFilenameTemplate: getSaveFilenameTemplate() },
    });
    saveOptions();
  };
  // 进度
  const onProgress = () => {
    ipc.on(`progress-reply@${state.pluginId}`, ({ taskId, progress }) => {
      const task = getTask(state, taskId);
      if (task) {
        task.currentProgress = progress;
        task.isProcessing = true;
      }
      clearCheckProgressTimeout(taskId);
    });
  };
  // 报错
  const onError = () => {
    ipc.on(`error-reply@${state.pluginId}`, ({ taskId, error: err }) => {
      const task = getTask(state, taskId);
      if (task) {
        task.error = err;
        task.tryStop = false;
        task.isProcessing = false;
      }
      clearCheckProgressTimeout(taskId);
    });
  };
  // 结束
  const onStop = () => {
    ipc.on(`stop-reply@${state.pluginId}`, ({ taskId }) => {
      const task = getTask(state, taskId);
      if (task) {
        task.tryStop = false;
        task.isProcessing = false;
      }
      clearCheckProgressTimeout(taskId);
    });
  };
  // 输出
  const onStd = () => {
    ipc.on(`stderr-reply@${state.pluginId}`, ({ taskId, stderrLine }) => {
      if (!stderrLine || /^\s*$/.test(stderrLine)) {
        return;
      }
      const task = getTask(state, taskId);
      if (task) {
        const progressReg = /\s*frame=.*fps=.*speed=.*/i;
        if (!progressReg.test(task.stdLines.latest) && !progressReg.test(stderrLine)) {
          task.stdLines.logs.push(task.stdLines.latest);
        }
        task.stdLines.latest = stderrLine;
      }
    });
  };

  const onQuickSelectSplitTimeout = (val) => {
    store.otherOptions.value.splitTimeout = val;
  };

  return {
    getOptions,
    start,
    stop,
    onProgress,
    onError,
    onStop,
    onStd,
    onQuickSelectSplitTimeout,
  };
};
const record = useRecord(store);

const getPreviewFilename = () => {
  store.previewFilenameError.value = false;
  let formattedFilename = getSaveFilenameTemplate();
  const ffStringTempReg = /%(\d*)d/;
  if (store.otherOptions.value.splitTimeout > 0) {
    formattedFilename += '_000';
  }
  if (formattedFilename.match(ffStringTempReg)?.length) {
    store.previewFilenameError.value = true;
    store.previewFilenameResult.value = '';
    return;
  }
  store.previewFilenameResult.value = `${formattedFilename}.${store.otherOptions.value.saveFormat}`;
};

const selectSaveDir = async () => {
  await selectDir.openDialog();
};

onMounted(() => {
  record.onProgress();
  record.onError();
  record.onStop();
  record.onStd();
  record.getOptions();
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
              <v-icon>event_note</v-icon>
            </v-avatar>
          </template>
          <v-list-item-title>当前进行中的任务</v-list-item-title>
        </v-list-item>
      </v-list>

      <v-card-text>
        <pre v-text="tasks"></pre>
      </v-card-text>
    </v-card>

    <v-card class="mt-4" rounded="xl" variant="tonal">
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
          <v-btn
            v-if="stdLines.latest || stdLines.logs.length"
            class="mr-4"
            color="primary"
            rounded="pill"
            variant="outlined"
            @click="stdLines.oneLine = !stdLines.oneLine"
          >
            切换输出窗口
          </v-btn>

          <v-spacer />

          <v-btn
            v-if="tasks.length"
            class="mr-4"
            color="primary"
            rounded="pill"
            variant="outlined"
            :disabled="tryStop"
            @click="record.stop()"
          >
            停止录制
          </v-btn>

          <v-btn
            color="primary"
            rounded="pill"
            :disabled="tryStop"
            @click="record.start"
          >
            开始录制
          </v-btn>
        </div>

        <v-sheet v-if="stdLines.latest || stdLines.logs.length" class="mt-4 text-white" color="#300a24" rounded>
          <pre class="log-area pa-2" :class="{ 'one-line': stdLines.oneLine }"><span
            v-for="(line, index) in stdLines.logs"
            :key="index"
            v-text="`${line}\n`"
          ></span><span class="latest-line" v-text="stdLines.latest"></span></pre>
        </v-sheet>
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
              @update:model-value="record.onQuickSelectSplitTimeout"
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

        <v-row class="mt-4">
          <v-col>
            <v-text-field
              v-model="otherOptions.saveFilenameTemplate"
              color="primary"
              label="保存文件名模板"
              :hint="`预览：${previewFilenameResult}`"
              :error="previewFilenameError"
              @update:model-value="getPreviewFilename"
              @focus="getPreviewFilename"
            />
          </v-col>

          <v-col col="4">
            <v-select
              v-model="otherOptions.saveFormat"
              color="primary"
              label="视频格式"
              placeholder="选择要保存的视频格式"
              hide-details
              :items="[
                { title: 'MPEG-4(.mp4)', value: 'mp4' },
                { title: 'Flash Video(.flv)', value: 'flv' },
                { title: 'QuickTime(.mov)', value: 'mov' },
                { title: 'Matroska(.mkv)', value: 'mkv' },
              ]"
            ></v-select>
          </v-col>
        </v-row>
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

<style>
.log-area {
  max-height: 280px;
  color: #eeeeec;
  overflow: auto;
  overscroll-behavior: none;
}

.log-area.one-line span {
  display: none;
}

.log-area.one-line span.latest-line {
  display: inline;
}

.log-area::-webkit-scrollbar {
  width: 16px;
  background-color: transparent;
}

.log-area::-webkit-scrollbar-thumb {
  height: 56px;
  border-radius: 8px;
  border: 4px solid transparent;
  background-clip: content-box;
  background-color: #606060;
}
</style>
