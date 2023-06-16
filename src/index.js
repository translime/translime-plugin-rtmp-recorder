import fs from 'node:fs';
import pkg from '../package.json';

const ffmpeg = require('fluent-ffmpeg');

const id = pkg.name;

const setFfmpegPath = (ff, path) => {
  try {
    fs.accessSync(path);
    ff.setFfmpegPath(path);
  } catch (err) {
    // mute
  }
};
// 加载时执行
const pluginDidLoad = () => {
  const setting = global.store.get(`plugin.${id}.settings`, {});
  if (setting['ffmpeg-path']) {
    setFfmpegPath(ffmpeg, setting['ffmpeg-path']);
  }
};

// 禁用时执行
const pluginWillUnload = () => {
  console.log('plugin unloaded');
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

// 插件上下文菜单
// https://www.electronjs.org/zh/docs/latest/api/menu-item
const pluginMenu = [
  {
    id: `${id}-custom-menu`,
    label: 'custom menu',
    click() {
      console.log('custom menu clicked');
    },
  },
];

let currentProgress = {};
// ipc 定义
const ipcHandlers = [
  {
    type: 'record', // 调用时需加上`@${id}`，此处为 'test-ipc@translime-plugin-my-plugin'
    handler: () => (url) => {
      const outputFilePath = 'C:\\Users\\admin\\AppData\\Roaming\\translime\\recorder-test\\test.mp4';
      const durationInSeconds = 60;
      let fileCounter = 1;

      const startRecord = () => {
        const setting = global.store.get(`plugin.${id}.settings`, {});
        const command = ffmpeg(url);
        setFfmpegPath(command, setting['ffmpeg-path']);
        command.output(outputFilePath)
          .on('end', () => {
            console.log('on end event');
          })
          .on('progress', (progress) => {
            currentProgress = progress;
            console.log(`Processing: ${progress.percent}% done`);
          })
          .run();
      };

      startRecord();
    },
  },
  {
    type: 'progress',
    handler: ({ sendToClient }) => () => {
      sendToClient(`progress-reply@${id}`, currentProgress);
    },
  },
];

module.exports = {
  pluginDidLoad,
  pluginWillUnload,
  pluginSettingSaved,
  settingMenu,
  pluginMenu,
  ipcHandlers,
};
