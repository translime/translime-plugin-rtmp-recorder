import { resolve } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import pkg from '../package.json';

const id = pkg.name;

const setFfmpegPath = (ff, settingPath) => {
  if (typeof settingPath?.[0] === 'string') {
    ff.setFfmpegPath(settingPath[0]);
  }
};

const tasks = {};
const stopRecord = (taskId, force = false) => {
  // todo: 处理 ffprobe 进程残留
  if (tasks[taskId] && tasks[taskId].command) {
    tasks[taskId]?.command?.ffmpegProc?.stdin?.write('q');
    if (force) {
      tasks[taskId]?.command?.ffmpegProc?.stdin?.write('\x03');
    }
    const commandCopy = tasks[taskId]?.command;
    delete tasks[taskId];
    setTimeout(() => {
      commandCopy?.kill('SIGINT');
    }, 5000);
  }
};
const stopAll = () => {
  const ids = Object.keys(tasks);
  if (!ids.length) {
    return;
  }
  ids.forEach((taskId) => {
    stopRecord(taskId, true);
  });
};

// ipc 定义
const ipcHandlers = [
  {
    type: 'record',
    handler: ({ sendToClient }) => ({
      taskId,
      url,
      saveDir,
      options = {},
    }) => {
      const finalOptions = {
        ...{
          splitTimeout: 60,
          saveFilenameTemplate: 'record',
          saveFormat: 'mp4',
          audioCodec: 'copy',
          videoCodec: 'copy',
        },
        ...options,
      };

      const autoSplit = typeof finalOptions.splitTimeout === 'number' && finalOptions.splitTimeout > 0;
      const getOutputFilePath = () => resolve(saveDir, `${finalOptions.saveFilenameTemplate}${autoSplit ? '_%03d' : ''}.${finalOptions.saveFormat}`);
      const startRecord = () => {
        tasks[taskId] = {
          command: null,
          progress: {},
        };
        tasks[taskId].command = ffmpeg(url)
          .output(getOutputFilePath())
          .audioCodec(finalOptions.audioCodec)
          .videoCodec(finalOptions.videoCodec);
        if (autoSplit) {
          tasks[taskId].command.outputOptions([
            '-f segment', // 分割输出为多个文件
            `-segment_time ${finalOptions.splitTimeout}`, // 分割时长
            '-reset_timestamps 1', // 重置分段文件的时间戳
          ]);
        }
        tasks[taskId].command.on('end', () => {
          sendToClient(`stop-reply@${id}`, { taskId });
        })
          .on('progress', (progress) => {
            if (!tasks[taskId]) {
              return;
            }
            tasks[taskId].progress = progress;
            sendToClient(`progress-reply@${id}`, { taskId, progress: tasks[taskId].progress });
          })
          .on('stderr', (stderrLine) => {
            sendToClient(`stderr-reply@${id}`, { taskId, stderrLine });
          })
          .on('error', (err) => {
            sendToClient(`error-reply@${id}`, { taskId, error: err.message });
          })
          .run();
      };

      startRecord();
    },
  },
  {
    type: 'stop',
    handler: () => (taskId) => {
      if (taskId) {
        stopRecord(taskId, true);
      } else {
        stopAll();
      }
    },
  },
];

// 加载时执行
const pluginDidLoad = () => {
  const setting = global.store.get(`plugin.${id}.settings`, {});
  if (setting['ffmpeg-path']) {
    setFfmpegPath(ffmpeg, setting['ffmpeg-path']);
  }
};

// 禁用时执行
const pluginWillUnload = () => {
  stopAll();
};

const pluginSettingSaved = () => {
  const setting = global.store.get(`plugin.${id}.settings`, {});
  if (setting['ffmpeg-path']) {
    setFfmpegPath(ffmpeg, setting['ffmpeg-path']);
  }
};

// 插件设置表单
const settingMenu = [
  {
    key: 'ffmpeg-path',
    type: 'file',
    name: 'ffmpeg 路径',
    required: false,
    placeholder: '不设置则会查找系统环境变量中的 ffmpeg，没有找到则无法运行',
    dialogOptions: {
      filters: [
        { name: 'ffmpeg', extensions: ['exe'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile', 'dontAddToRecent'],
    },
  },
];

module.exports = {
  pluginDidLoad,
  pluginWillUnload,
  pluginSettingSaved,
  settingMenu,
  ipcHandlers,
};
