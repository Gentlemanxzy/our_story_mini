/**
 * 云调用薄封装
 *
 * 目的：给上层一个「要么成功、要么立刻抛错」的统一入口，
 * 让 services 层能用同一个 try/catch 决定「入队待补传」还是「清队列」。
 *
 * 连续失败 2 次后本会话内直接短路（fail fast），
 * 避免每点一次卡片都等一次超时；flush() 会 reset() 重新试探。
 */
let disabled = false;
let failStreak = 0;

function available() {
  return !!wx.cloud && !disabled;
}

function isDown() {
  return disabled;
}

function reset() {
  disabled = false;
  failStreak = 0;
}

function noteFail() {
  failStreak += 1;
  if (failStreak >= 2) disabled = true;
}

function noteOk() {
  failStreak = 0;
  disabled = false;
}

/**
 * 调用云函数，返回 result。
 * 超时、函数未部署、网络断开都会 reject，由调用方兜底。
 */
function call(name, data = {}, options = {}) {
  const timeout = options.timeout || 8000;

  return new Promise((resolve, reject) => {
    if (!available()) {
      reject(new Error('cloud unavailable'));
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      noteFail();
      reject(new Error(`cloud timeout: ${name}`));
    }, timeout);

    wx.cloud.callFunction({ name, data }).then(
      res => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        noteOk();
        resolve((res && res.result) || {});
      },
      err => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        noteFail();
        reject(err);
      }
    );
  });
}

module.exports = {
  available,
  isDown,
  reset,
  call,
};
