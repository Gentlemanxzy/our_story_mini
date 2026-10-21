const thingsSvc = require('../../services/things');
const { CATEGORIES, STATUS_MAP, MOOD_MAP } = require('../../constants');
const { calcProgress, groupByCategory, formatDate } = require('../../utils/format');

Page({
  data: {
    categories: [{ key: '', name: '全部' }].concat(CATEGORIES),
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
    return Object.assign({}, t, {
      noText: String(t.no).padStart(3, '0'),
      statusName: st.name,
      tone: st.tone,
      dateText: t.doneDate ? formatDate(t.doneDate) : '',
      moodGlyph: mood ? mood.glyph : '',
    });
  },

  async refresh() {
    const all = await thingsSvc.list();
    const progress = calcProgress(all);
    const view = await thingsSvc.list({
      keyword: this.data.keyword,
      category: this.data.activeCategory,
    });
    const groups = groupByCategory(view.map(t => this.decorate(t)));
    this.setData({ groups, progress, loaded: true });
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

  onOpen(e) {
    const id = e.currentTarget.dataset.id;
    const flat = [];
    this.data.groups.forEach(g => flat.push.apply(flat, g.items));
    const thing = flat.find(t => t._id === id);
    if (!thing) return;
    this.setData({ current: thing, sheetVisible: true });
  },

  onSheetClose() {
    this.setData({ sheetVisible: false });
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
