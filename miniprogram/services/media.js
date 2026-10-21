/**
 * 照片存取
 *
 * 三级策略，和头像一致：
 *   chooseMedia 给的是【临时路径】，约 24 小时后失效
 *     → 优先 wx.cloud.uploadFile 转成 fileID（长期有效，换手机也在，对方能看到）
 *     → 云不可用则落盘到 USER_DATA_PATH（本机长期有效，重装会丢，对方看不到）
 *     → 都失败才保留临时路径（仅本次会话可见）
 *
 * 本地路径的照片不会丢：下次 flush 时 upgradeLocal() 会尝试补传，
 * 传成功后替换成 fileID 再推给云端，所以「先离线记、后补传」是走得通的。
 */
const { MAX_PHOTOS } = require('../config');

const CLOUD_DIR = 'photos';

function isCloud(src) {
  return typeof src === 'string' && src.indexOf('cloud://') === 0;
}

function userDataPath() {
  try {
    return wx.env && wx.env.USER_DATA_PATH ? wx.env.USER_DATA_PATH : '';
  } catch (e) {
    return '';
  }
}

/** 是否落在本机 USER_DATA_PATH（不是临时路径） */
function isLocal(src) {
  const base = userDataPath();
  return !!base && typeof src === 'string' && src.indexOf(base) === 0;
}

function isTemp(src) {
  return !!src && !isCloud(src) && !isLocal(src);
}

function extOf(path) {
  const m = String(path).match(/\.(png|jpe?g|gif|webp|heic)(?:\?|$)/i);
  return m ? m[1].toLowerCase() : 'jpg';
}

function cloudPathFor(path) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${CLOUD_DIR}/${Date.now()}_${rand}.${extOf(path)}`;
}

/** 落盘到 USER_DATA_PATH；失败返回空串 */
function saveToLocal(tempFilePath) {
  return new Promise(resolve => {
    const base = userDataPath();
    if (!base) {
      resolve('');
      return;
    }
    try {
      const fs = wx.getFileSystemManager();
      const filePath = `${base}/photo_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 6)}.${extOf(tempFilePath)}`;
      fs.saveFile({
        tempFilePath,
        filePath,
        success: r => resolve(r.savedFilePath || filePath),
        fail: () => resolve(''),
      });
    } catch (e) {
      resolve('');
    }
  });
}

/** 只尝试上云；失败原样返回（用于把本地文件补传上去） */
function uploadOnly(src) {
  return new Promise(resolve => {
    if (!wx.cloud || !wx.cloud.uploadFile) {
      resolve('');
      return;
    }
    wx.cloud
      .uploadFile({ cloudPath: cloudPathFor(src), filePath: src })
      .then(res => resolve((res && res.fileID) || ''))
      .catch(() => resolve(''));
  });
}

/**
 * 持久化单张：临时路径 → fileID / 本地文件路径 / 临时路径
 * 返回 { src, where: 'cloud' | 'local' | 'temp' }
 */
function persistOne(src) {
  if (isCloud(src)) return Promise.resolve({ src, where: 'cloud' });

  // 已经是本机长期路径：只补传，失败保持原样，不再复制一份
  if (isLocal(src)) {
    return uploadOnly(src).then(fileID =>
      fileID ? { src: fileID, where: 'cloud' } : { src, where: 'local' }
    );
  }

  return uploadOnly(src).then(fileID => {
    if (fileID) return { src: fileID, where: 'cloud' };
    return saveToLocal(src).then(saved =>
      saved ? { src: saved, where: 'local' } : { src, where: 'temp' }
    );
  });
}

/**
 * 批量持久化（串行，避免并发上传被限流）。
 * onProgress(done, total) 用于显示「上传中 i/n」。
 */
async function persistMany(paths, onProgress) {
  const list = Array.isArray(paths) ? paths : [];
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    if (onProgress) onProgress(i + 1, list.length);
    const r = await persistOne(list[i]);
    out.push(r.src);
  }
  return out;
}

/** flush 时调用：本地照片补传，返回 { photos, changed } */
async function upgradeLocal(paths) {
  const list = Array.isArray(paths) ? paths : [];
  const out = [];
  let changed = false;

  for (let i = 0; i < list.length; i += 1) {
    const src = list[i];
    if (!isLocal(src)) {
      out.push(src);
      continue;
    }
    const fileID = await uploadOnly(src);
    if (fileID) {
      out.push(fileID);
      changed = true;
    } else {
      out.push(src);
    }
  }

  return { photos: out, changed };
}

/** 清理：云端文件走 deleteFile，本机文件 unlink；全部忽略失败 */
function remove(list) {
  const arr = Array.isArray(list) ? list.filter(Boolean) : [];
  if (!arr.length) return;

  const cloudFiles = arr.filter(isCloud);
  if (cloudFiles.length && wx.cloud && wx.cloud.deleteFile) {
    wx.cloud.deleteFile({ fileList: cloudFiles, fail: () => {} });
  }

  arr.filter(isLocal).forEach(p => {
    try {
      wx.getFileSystemManager().unlink({ filePath: p, fail: () => {} });
    } catch (e) {
      // 清理失败无所谓
    }
  });
}

/** 还有几张没上云（用于界面提示） */
function countLocal(paths) {
  const arr = Array.isArray(paths) ? paths : [];
  return arr.filter(p => !isCloud(p)).length;
}

module.exports = {
  MAX_PHOTOS,
  isCloud,
  isLocal,
  isTemp,
  persistOne,
  persistMany,
  upgradeLocal,
  remove,
  countLocal,
};
