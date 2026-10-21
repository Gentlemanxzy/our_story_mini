/**
 * 登录态
 *
 * 说明：小程序拿 openid 不需要用户授权，也不需要 wx.login 换 code ——
 * 云函数里 cloud.getWXContext().OPENID 直接就有。所以「登录」对用户是无感的。
 *
 * 头像昵称是另一回事：wx.getUserProfile 已于 2022-10-25 被回收，
 * 必须由用户通过「头像昵称填写能力」主动确认，见 pages/profile-edit。
 */
const { ENV_ID } = require('../config');

const OPENID_KEY = 'ourstory.openid.v1';

/**
 * 把云调用的失败原因归类，让界面能给出可执行的提示，
 * 而不是笼统地说「未连接云端」。
 */
function classify(err) {
  const msg = String((err && (err.errMsg || err.message)) || '');
  if (!msg) return 'call_failed';
  if (/-501000|FUNCTION_NOT_FOUND|FunctionName parameter could not be found/i.test(msg)) {
    return 'no_function';
  }
  if (/-501\d{3}|ENV_NOT_EXIST|INVALID_ENV|env not exists/i.test(msg)) return 'env';
  if (/timeout|network|request:fail|ERR_INTERNET/i.test(msg)) return 'network';
  return 'call_failed';
}

const HINT = {
  no_function: envId => `函数 login 未部署到环境 ${envId}`,
  env: envId => `环境 ${envId} 不可用（ID 不对或已删除）`,
  network: () => '网络请求失败',
  call_failed: () => '云调用失败',
};

let state = {
  openid: '',
  checked: false,
  cloudOk: false,
  reason: '',
};

function readCache() {
  try {
    return wx.getStorageSync(OPENID_KEY) || '';
  } catch (e) {
    return '';
  }
}

function getState() {
  return state;
}

/**
 * 确保拿到 openid。
 * 失败不抛异常、不弹窗，只把 cloudOk 置 false，让界面走本地模式。
 */
async function ensureLogin(force) {
  if (state.checked && !force) return state;

  const cached = readCache();
  if (cached && !force) {
    state = { openid: cached, checked: true, cloudOk: true, reason: 'cache' };
    return state;
  }

  if (!wx.cloud) {
    state = { openid: '', checked: true, cloudOk: false, reason: 'no_cloud' };
    return state;
  }

  try {
    const res = await wx.cloud.callFunction({ name: 'login' });
    const r = (res && res.result) || {};

    if (r.ok && r.openid) {
      state = { openid: r.openid, checked: true, cloudOk: true, reason: 'cloud' };
      try {
        wx.setStorageSync(OPENID_KEY, r.openid);
      } catch (e) {
        // 缓存失败不影响登录态
      }
    } else {
      state = { openid: '', checked: true, cloudOk: false, reason: r.msg || 'login_failed' };
    }
  } catch (e) {
    // 常见原因：login 云函数还没部署、云环境 ID 不对、网络不通
    const reason = classify(e);
    const detail = String((e && (e.errMsg || e.message)) || '');
    state = { openid: '', checked: true, cloudOk: false, reason, detail };
    const describe = HINT[reason] || HINT.call_failed;
    console.warn(
      `[auth] ${describe(ENV_ID)}，已切到本地模式（数据在本地完整保存，功能不受影响）`,
      detail
    );
  }

  return state;
}

/** 给界面用的一句话诊断；已连上云端时返回空串 */
function hint(reason) {
  const map = {
    no_function: '云函数未部署 · 上传 cloudfunctions/ 后重试',
    env: '云环境不可用 · 检查 config.js 的 ENV_ID',
    network: '网络异常 · 稍后自动重试',
    login_failed: '云函数返回失败 · 检查 users 集合',
    no_cloud: '基础库过低 · 无法使用云能力',
    call_failed: '云调用失败 · 稍后自动重试',
  };
  return map[reason] || '';
}

module.exports = {
  ensureLogin,
  getState,
  hint,
};
