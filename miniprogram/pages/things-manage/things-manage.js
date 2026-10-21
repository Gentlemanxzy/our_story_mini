const thingsSvc = require('../../services/things');
const categoriesSvc = require('../../services/categories');
const { DEFAULT_THINGS } = require('../../data/default-things');
const { CATEGORY_MAP } = require('../../constants');
const { buildCategoryMap } = require('../../utils/format');

const REASON_TEXT = {
  EMPTY: '给分类起个名字',
  DUP: '已经有这个分类了',
  LIMIT: '分类太多了，先删几个吧',
  NOT_FOUND: '分类不存在',
};

Page({
  data: {
    newTitle: '',
    items: [],
    library: [],
    showLibrary: false,
    loaded: false,

    catList: [],
    customCats: [],
    selectedCatKey: '',
    selectedCatName: '',

    catPickerVisible: false,
    catPickerStartInCreate: false,
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    const cats = await categoriesSvc.list();
    const all = await thingsSvc.list();
    const nameMap = buildCategoryMap(cats);

    const counts = {};
    all.forEach(t => {
      counts[t.category] = (counts[t.category] || 0) + 1;
    });

    // 选中项失效（被删）时回落到第一个分类
    let sel = this.data.selectedCatKey;
    if (!sel || !cats.some(c => c.key === sel)) {
      sel = cats.length ? cats[0].key : '';
    }

    const catList = cats.map(c => Object.assign({}, c, { count: counts[c.key] || 0 }));
    const selHit = cats.find(c => c.key === sel);

    const items = all.map(t => Object.assign({}, t, {
      categoryName: nameMap[t.category] || '未分类',
      noText: String(t.no).padStart(3, '0'),
    }));

    // 默认库中尚未加入的条目
    const exist = new Set(all.map(t => t.title));
    const library = DEFAULT_THINGS
      .map((d, index) => Object.assign({ index }, d, {
        categoryName: CATEGORY_MAP[d.category] || d.category,
        added: exist.has(d.title),
      }))
      .filter(d => !d.added);

    this.setData({
      catList,
      customCats: catList.filter(c => !c.isDefault),
      selectedCatKey: sel,
      selectedCatName: selHit ? selHit.name : '未分类',
      items,
      library,
      loaded: true,
    });
  },

  onTitleInput(e) {
    this.setData({ newTitle: e.detail.value });
  },

  /* ── 分类选择 ── */

  onOpenCat() {
    this.setData({ catPickerStartInCreate: false, catPickerVisible: true });
  },

  onNewCat() {
    this.setData({ catPickerStartInCreate: true, catPickerVisible: true });
  },

  onCatPickerClose() {
    this.setData({ catPickerVisible: false });
  },

  onCatSelect(e) {
    const key = e.detail.key;
    const hit = this.data.catList.find(c => c.key === key);
    this.setData({
      selectedCatKey: key,
      selectedCatName: hit ? hit.name : '未分类',
      catPickerVisible: false,
    });
  },

  async onCatCreate(e) {
    const res = await categoriesSvc.create(e.detail.name);
    if (!res.ok) {
      wx.showToast({ title: REASON_TEXT[res.reason] || '建不了', icon: 'none' });
      return;
    }
    this.setData({
      selectedCatKey: res.item.key,
      catPickerVisible: false,
    }, () => this.refresh());
    wx.showToast({ title: '分类建好了', icon: 'none' });
  },

  /* ── 分类管理 ── */

  onRenameCat(e) {
    const { key, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '重命名分类',
      editable: true,
      placeholderText: '分类名，最多 8 个字',
      content: name,
      confirmText: '保存',
      confirmColor: '#C2603F',
      success: async res => {
        if (!res.confirm) return;
        const r = await categoriesSvc.rename(key, res.content);
        if (!r.ok) {
          wx.showToast({ title: REASON_TEXT[r.reason] || '改不了', icon: 'none' });
          return;
        }
        await this.refresh();
        wx.showToast({ title: '已改名', icon: 'none' });
      },
    });
  },

  onDeleteCat(e) {
    const { key, name, count } = e.currentTarget.dataset;
    // 只允许删除空分类，避免条目变成孤儿
    if (Number(count) > 0) {
      wx.showToast({ title: `还有 ${count} 件小事在里面`, icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除分类',
      content: `确定删除「${name}」吗？`,
      confirmText: '删除',
      confirmColor: '#C2603F',
      success: async res => {
        if (!res.confirm) return;
        await categoriesSvc.remove(key);
        await this.refresh();
        wx.showToast({ title: '已删除', icon: 'none' });
      },
    });
  },

  /* ── 新增条目 ── */

  async onAdd() {
    const title = String(this.data.newTitle).trim();
    if (!title) {
      wx.showToast({ title: '写一件想做的事', icon: 'none' });
      return;
    }
    if (this.data.items.some(t => t.title === title)) {
      wx.showToast({ title: '已经有这件小事了', icon: 'none' });
      return;
    }
    await thingsSvc.upsert({ title, category: this.data.selectedCatKey });
    this.setData({ newTitle: '' });
    await this.refresh();
    wx.showToast({ title: '已加入', icon: 'none' });
  },

  onDelete(e) {
    const { id, title, status } = e.currentTarget.dataset;
    const isDone = status === 'treasured';
    wx.showModal({
      title: '删除这件小事',
      content: isDone
        ? `「${title}」已经被珍藏过了，删除后记录一起消失。`
        : `确定删除「${title}」吗？`,
      confirmText: '删除',
      confirmColor: '#C2603F',
      success: async res => {
        if (!res.confirm) return;
        await thingsSvc.remove(id);
        await this.refresh();
        wx.showToast({ title: '已删除', icon: 'none' });
      },
    });
  },

  async onPickDefault(e) {
    const index = Number(e.currentTarget.dataset.index);
    await thingsSvc.seedFromDefaults([index]);
    await this.refresh();
    wx.showToast({ title: '已加入', icon: 'none' });
  },

  async onAddAllVisible() {
    const indexes = this.data.library.map(d => d.index);
    if (!indexes.length) return;
    await thingsSvc.seedFromDefaults(indexes);
    await this.refresh();
    wx.showToast({ title: `已加入 ${indexes.length} 件`, icon: 'none' });
  },

  toggleLibrary() {
    this.setData({ showLibrary: !this.data.showLibrary });
  },
});
