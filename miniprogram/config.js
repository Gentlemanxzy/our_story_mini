/**
 * 环境与项目级配置
 * 换云环境时只改这里，app.js / 云函数调用都从这里取。
 */
const ENV_ID = 'cloud1-d0gg6c2cv301bef68';

module.exports = {
  ENV_ID,

  // 业务限制
  MAX_PHOTOS: 9,
  MAX_NOTE_LEN: 140,

  // 本地缓存 key（v2 接云后仅作离线草稿用）
  STORAGE_KEY: 'ourstory.things.v1',
};
