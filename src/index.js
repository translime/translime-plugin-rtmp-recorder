import ffmpeg from 'fluent-ffmpeg';
import pkg from '../package.json';

const id = pkg.name;

const setFfmpegPath = (ff, settingPath) => {
  if (typeof settingPath?.[0] === 'string') {
    ff.setFfmpegPath(settingPath[0]);
  }
};

let currentProgress = {};
let command = null;
const stopRecord = () => {
  if (command) {
    command?.ffmpegProc?.stdin?.write('q');
  }
};

// ipc 定义
const ipcHandlers = [
  {
    type: 'record',
    handler: ({ sendToClient }) => (url, saveDir, options = {}) => {
      const finalOptions = {
        ...{
          splitTimeout: 60,
          saveFilenameTemplate: 'test_%03d',
          audioCodec: 'copy',
          videoCodec: 'copy',
        },
        ...options,
      };

      const getOutputFilePath = () => `${saveDir}${finalOptions.saveFilenameTemplate}.mp4`;
      const startRecord = () => {
        stopRecord();
        command = ffmpeg(url)
          .output(getOutputFilePath())
          .audioCodec(finalOptions.audioCodec)
          .videoCodec(finalOptions.videoCodec);
        if (typeof finalOptions.splitTimeout === 'number' && finalOptions.splitTimeout > 0) {
          command.outputOptions([
            '-f segment', // 分割输出为多个文件
            `-segment_time ${finalOptions.splitTimeout}`, // 分割时长
            '-reset_timestamps 1', // 重置分段文件的时间戳
          ]);
        }
        command.on('end', () => {
          sendToClient(`stop-reply@${id}`);
        })
          .on('progress', (progress) => {
            currentProgress = progress;
            sendToClient(`progress-reply@${id}`, currentProgress);
          })
          .on('error', (err) => {
            sendToClient(`error-reply@${id}`, err.message);
          })
          .run();
      };

      startRecord();
    },
  },
  {
    type: 'stop',
    handler: () => () => {
      stopRecord();
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
  stopRecord();
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
