const store = new Map();
global.wx = {
  getStorageSync: k => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => store.set(k, v),
  removeStorageSync: k => store.delete(k),
};

const cat = require('../miniprogram/services/categories');
const things = require('../miniprogram/services/things');
const { groupByCategory, calcProgress } = require('../miniprogram/utils/format');

(async () => {
  const log = (...a) => console.log(...a);

  let list = await cat.list();
  log('1 内置分类:', list.length, '| 首个:', list[0].key, list[0].name, '| editable:', list[0].editable);

  const c1 = await cat.create('旅行');
  log('2 新建「旅行」:', c1.ok, c1.item && c1.item.key, c1.item && c1.item.name);

  const dup = await cat.create('旅行');
  log('3 重复新建:', dup.ok, dup.reason);

  const dupBuiltin = await cat.create(' 青春日常 ');
  log('4 与内置重名(带空格):', dupBuiltin.ok, dupBuiltin.reason);

  const empty = await cat.create('   ');
  log('5 空名:', empty.ok, empty.reason);

  list = await cat.list();
  log('6 列表长度:', list.length, '| 末位:', list[list.length - 1].name);

  const rn = await cat.rename(c1.item.key, '旅行日记');
  log('7 改名:', rn.ok, rn.item && rn.item.name);

  const rnDup = await cat.rename(c1.item.key, '一起长大');
  log('8 改成内置名:', rnDup.ok, rnDup.reason);

  const rnBuiltin = await cat.rename('youth', '随便');
  log('9 改内置分类:', rnBuiltin.ok, rnBuiltin.reason);

  const seeded = await things.list();
  log('10 初始清单:', seeded.length, '件');

  await things.upsert({ title: '去看一次极光', category: c1.item.key });
  const all = await things.list();
  const custom = all.filter(t => t.category === c1.item.key);
  log('11 自定义分类下条目:', custom.length, '| 编号:', custom[0] && custom[0].no);

  const groups = groupByCategory(all, await cat.list());
  log('12 分组数:', groups.length, '| 首组:', groups[0].name, '| 末组:', groups[groups.length - 1].name, '| 末组条数:', groups[groups.length - 1].items.length);

  const p = calcProgress(all);
  log('13 进度:', `${p.done}/${p.total}`, p.pct + '%', p.levelText, '距下一级', p.gap);

  const ghost = groupByCategory([{ category: 'c_ghost', title: 'x' }], await cat.list());
  log('14 未知分类兜底:', ghost[0].name, '| 排序值:', ghost[0].order);

  const del = await cat.remove(c1.item.key);
  log('15 删除分类:', del.ok, '| 剩余分类:', (await cat.list()).length);

  const delAgain = await cat.remove(c1.item.key);
  log('16 重复删除:', delAgain.ok, delAgain.reason);
})();
