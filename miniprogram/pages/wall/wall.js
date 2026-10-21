const thingsSvc = require('../../services/things');
const categoriesSvc = require('../../services/categories');
const { CATEGORIES, STATUS_MAP, MOOD_MAP } = require('../../constants');
const { calcProgress, groupByCategory, formatDate } = require('../../utils/format');

const ALL = { key: '', name: '全部' };

Page({
  data: {
    // 首屏先用内置分类占位，拿到分类表后替换
    categories: [ALL].concat(CATEGORIES.map(c => ({ key: c.key, name: c.name }))),
    catList: [],
    activeCategory: '',
    keyword: '',
    groups: [],
    progress: { total: 0, done: 0, pct: 0, levelText: '', gap: 0 },
    sheetVisible: false,
    current: null,
    loaded: false,
  },

  onShow() {
    this.refresh();
  },

  /** 给列表项补齐展示字段（WXML 里不能调用函数） */
  decorate(t) {
    const st = STATUS_MAP[t.status] || STATUS_MAP.want;
    const mood = t.mood ? MOOD_MAP[t.mood] : null;
    const photos = Array.isArray(t.photos) ? t.photos.filter(Boolean) : [];
    return Object.assign({}, t, {
      noText: String(t.no).padStart(3, '0'),
      statusName: st.name,
      tone: st.tone,
      dateText: t.doneDate ? formatDate(t.doneDate) : '',
      moodGlyph: mood ? mood.glyph : '',
      cover: photos[0] || '',
      photoCount: photos.length,
    });
  },

  async refresh() {
    const cats = await categoriesSvc.list();

    // 选中的自定义分类若已被删除，回落到「全部」
    let active = this.data.activeCategory;
    if (active && !cats.some(c => c.key === active)) {
      active = '';
    }

    const all = await thingsSvc.list();
    const progress = calcProgress(all);
    const view = await thingsSvc.list({
      keyword: this.data.keyword,
      category: active,
    });
    const groups = groupByCategory(view.map(t => this.decorate(t)), cats);

    this.setData({
      catList: cats,
      categories: [ALL].concat(cats.map(c => ({ key: c.key, name: c.name }))),
      activeCategory: active,
      groups,
      progress,
      loaded: true,
    });
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value }, () => this.refresh());
  },

  onSearchClear() {
    this.setData({ keyword: '' }, () => this.refresh());
  },

  onCategoryTap(e) {
    this.setData({ activeCategory: e.currentTarget.dataset.key }, () => this.refresh());
  },

  findThing(id) {
    const flat = [];
    this.data.groups.forEach(g => flat.push.apply(flat, g.items));
    return flat.find(t => t._id === id);
  },

  onOpen(e) {
    const thing = this.findThing(e.currentTarget.dataset.id);
    if (!thing) return;
    this.setData({ current: thing, sheetVisible: true });
  },

  /** 点缩略图直接看大图，不打开记录面板 */
  onPreview(e) {
    const thing = this.findThing(e.currentTarget.dataset.id);
    const urls = (thing && thing.photos ? thing.photos : []).filter(Boolean);
    if (!urls.length) return;
    wx.previewImage({ urls, current: urls[0] });
  },

  onSheetClose() {
    this.setData({ sheetVisible: false });
    // 记录面板里可能新建了分类，回来时同步筛选条
    this.refresh();
  },

  async onSheetSave(e) {
    const detail = e.detail;
    await thingsSvc.upsert(Object.assign({ _id: this.data.current._id }, detail));
    this.setData({ sheetVisible: false });
    await this.refresh();
    wx.showToast({
      title: detail.status === 'treasured' ? '已珍藏' : '已更新',
      icon: 'none',
    });
  },

  goManage() {
    wx.navigateTo({ url: '/pages/things-manage/things-manage' });
  },
});
