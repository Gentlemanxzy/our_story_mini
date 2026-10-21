/**
 * 本地逻辑冒烟测试（不需要开发者工具）
 *
 *   node tools/smoke-test.js
 *
 * 用内存 Map 模拟 wx 存储，用可切换的 cloudMode 模拟云端可用/不可用，
 * 覆盖：分类增删改查、清单本地优先、云端失败入队、恢复后补传、拉取合并、软删不复活。
 */
const store = new Map();

// 真机 wx.setStorageSync 会做 JSON 序列化，读写都是副本；
// mock 必须保持同样语义，否则数组/对象引用会被多个调用点共享，测出假象。
const clone = v => (v === undefined || v === '' ? v : JSON.parse(JSON.stringify(v)));

// 云端模拟：down = 所有云函数都失败；ok = 成功
let cloudMode = 'down';
let callLog = [];
let remoteThings = [];
let remoteCategories = [];

global.wx = {
  getStorageSync: k => (store.has(k) ? clone(store.get(k)) : ''),
  setStorageSync: (k, v) => store.set(k, clone(v)),
  removeStorageSync: k => store.delete(k),
  cloud: {
    callFunction({ name, data }) {
      callLog.push(name);
      if (cloudMode === 'down') {
        return Promise.reject({ errMsg: 'cloud.callFunction:fail -501000 function not found' });
      }
      if (name === 'sync_pull') {
        return Promise.resolve({
          result: { ok: true, things: remoteThings, categories: remoteCategories },
        });
      }
      return Promise.resolve({ result: { ok: true } });
    },
  },
};

const cat = require('../miniprogram/services/categories');
const things = require('../miniprogram/services/things');
const { groupByCategory, calcProgress } = require('../miniprogram/utils/format');

const log = (...a) => console.log(...a);
const reset = () => {
  callLog = [];
};

(async () => {
  /* ── 分类 ── */
  let list = await cat.list();
  log('1  内置分类:', list.length, '| 首个:', list[0].key, list[0].name, '| editable:', list[0].editable);

  const c1 = await cat.create('旅行');
  log('2  新建「旅行」:', c1.ok, c1.item && c1.item.key);

  log('3  重复新建:', (await cat.create('旅行')).reason);
  log('4  与内置重名(带空格):', (await cat.create(' 青春日常 ')).reason);
  log('5  空名:', (await cat.create('   ')).reason);

  list = await cat.list();
  log('6  分类列表长度:', list.length, '| 末位:', list[list.length - 1].name);

  const rn = await cat.rename(c1.item.key, '旅行日记');
  log('7  改名:', rn.ok, rn.item && rn.item.name);
  log('8  改成内置名:', (await cat.rename(c1.item.key, '一起长大')).reason);
  log('9  改内置分类:', (await cat.rename('youth', '随便')).reason);

  /* ── 清单：本地优先 ── */
  const seeded = await things.list();
  log('10 初始清单:', seeded.length, '件');

  await things.upsert({ title: '去看一次极光', category: c1.item.key });
  let all = await things.list();
  const custom = all.filter(t => t.category === c1.item.key);
  log('11 云端不可用时本地写入生效:', custom.length, '件 | 编号:', custom[0] && custom[0].no);

  const pendingAfterWrite = things.pendingCount();
  log('12 云端失败 → 入待传队列:', pendingAfterWrite, '条');

  const failed = await things.flush();
  log('13 flush 仍失败 → 队列保留:', failed.ok === false, '| 剩余:', things.pendingCount());

  /* ── 云端恢复 ── */
  cloudMode = 'ok';
  reset();
  const okFlush = await things.flush();
  log('14 云端恢复 → 补传成功:', okFlush.ok, '| 推送条数:', okFlush.pushed, '| 队列:', things.pendingCount());
  log('15 调用的云函数:', [...new Set(callLog)].join(', ') || '无');

  /* ── 拉取合并 ── */
  const first = all[0];
  remoteThings = [
    {
      _id: first._id,
      title: '远端改过的标题',
      order: first.order,
      status: 'want',
      updatedAt: new Date(Date.now() + 60000).toISOString(),
      deleted: false,
    },
  ];
  await things.pull();
  all = await things.list();
  log('16 远端更新 → 覆盖本地:', all[0].title === '远端改过的标题');

  remoteThings = [
    {
      _id: first._id,
      title: '更旧的远端版本',
      order: first.order,
      updatedAt: new Date(Date.now() - 600000).toISOString(),
      deleted: false,
    },
  ];
  await things.pull();
  all = await things.list();
  log('17 远端更旧 → 保留本地:', all[0].title === '远端改过的标题');

  /* ── 软删 ── */
  await things.remove(first._id);
  all = await things.list();
  log('18 删除后不在列表:', !all.some(t => t._id === first._id), '| 剩余:', all.length);

  remoteThings = [
    {
      _id: first._id,
      title: '远端改过的标题',
      order: first.order,
      updatedAt: new Date(Date.now() + 120000).toISOString(),
      deleted: true,
    },
  ];
  await things.pull();
  all = await things.list();
  log('19 远端墓碑 → 不会复活:', !all.some(t => t._id === first._id));

  /* ── 分组与进度 ── */
  const groups = groupByCategory(all, await cat.list());
  log('20 分组数:', groups.length, '| 首组:', groups[0].name);
  const p = calcProgress(all);
  log('21 进度:', `${p.done}/${p.total}`, p.pct + '%', p.levelText);

  /* ── 个人资料 ── */
  const user = require('../miniprogram/services/user');
  const auth = require('../miniprogram/utils/auth');

  wx.cloud = null;
  const st = await auth.ensureLogin();
  log('22 登录态(无云):', st.cloudOk, st.reason);

  const saved = await user.saveProfile({ nickName: '宇少', avatar: '' });
  log('23 保存昵称:', saved.nickName, '| 读回:', (await user.getProfile()).nickName);
  log('24 头像降级(无云无文件系统):', (await user.persistAvatar('/tmp/fake.png')).where);

  /* ── 云函数未部署时的诊断 ── */
  wx.cloud = {
    callFunction: () =>
      Promise.reject({
        errMsg:
          'cloud.callFunction:fail Error: errCode: -501000 | errMsg: FunctionName parameter could not be found.',
      }),
  };
  const st2 = await auth.ensureLogin(true);
  log('25 未部署云函数 → 归类:', st2.reason, '| 提示:', auth.hint(st2.reason));

  wx.cloud = {
    callFunction: () => Promise.resolve({ result: { ok: true, openid: 'oTest1234' } }),
  };
  const st3 = await auth.ensureLogin(true);
  log('26 部署后重新探测:', st3.cloudOk, st3.openid, '| 提示:', JSON.stringify(auth.hint(st3.reason)));
})();
