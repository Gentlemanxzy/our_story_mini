const thingsSvc = require('../../services/things');
const { DEFAULT_THINGS } = require('../../data/default-things');
const { CATEGORIES, CATEGORY_MAP } = require('../../constants');

Page({
  data: {
    categoryNames: CATEGORIES.map(c => c.name),
    catIndex: 0,
    newTitle: '',
    items: [],
    library: [],
    showLibrary: false,
    loaded: false,
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    const all = await thingsSvc.list();

    const items = all.map(t => Object.assign({}, t, {
      categoryName: CATEGORY_MAP[t.category] || t.category,
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

    this.setData({ items, library, loaded: true });
  },

  onTitleInput(e) {
    this.setData({ newTitle: e.detail.value });
  },

  onCatChange(e) {
    this.setData({ catIndex: Number(e.detail.value) });
  },

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
    const category = CATEGORIES[this.data.catIndex].key;
    await thingsSvc.upsert({ title, category });
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
