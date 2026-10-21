const { STATUSES, MOODS } = require('../../constants');
const { toISODate, buildCategoryMap } = require('../../utils/format');
const categoriesSvc = require('../../services/categories');

const REASON_TEXT = {
  EMPTY: '给分类起个名字',
  DUP: '已经有这个分类了',
  LIMIT: '分类太多了，先删几个吧',
  NOT_FOUND: '分类不存在',
};

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    visible: { type: Boolean, value: false },
    thing: { type: Object, value: null },
    categories: { type: Array, value: [] },
  },

  data: {
    statuses: STATUSES,
    moods: MOODS,
    today: '',
    catList: [],
    catName: '',
    catPickerVisible: false,
    form: {
      status: 'want',
      doneDate: '',
      mood: '',
      note: '',
      category: '',
    },
  },

  observers: {
    'visible, thing': function (visible, thing) {
      if (!visible || !thing) return;
      this.setData({
        today: toISODate(),
        catList: this.data.categories,
        catName: this.pickName(thing.category),
        form: {
          status: thing.status || 'want',
          doneDate: thing.doneDate || '',
          mood: thing.mood || '',
          note: thing.note || '',
          category: thing.category || '',
        },
      });
    },

    'form.category, categories': function (category, list) {
      if (list && list.length) {
        this.setData({ catName: this.pickName(category, list) });
      }
    },
  },

  methods: {
    noop() {},

    pickName(key, list) {
      const src = list || this.data.categories || [];
      const hit = src.find(c => c.key === key);
      if (hit) return hit.name;
      return buildCategoryMap(src)[key] || '未分类';
    },

    onClose() {
      this.triggerEvent('close');
    },

    onStatusTap(e) {
      const status = e.currentTarget.dataset.key;
      const patch = { status };
      // 标为「已经珍藏」时默认补当天日期，少一次操作
      if (status === 'treasured' && !this.data.form.doneDate) {
        patch.doneDate = toISODate();
      }
      if (status !== 'treasured') {
        patch.doneDate = '';
      }
      this.setData({
        'form.status': patch.status,
        'form.doneDate': patch.doneDate !== undefined ? patch.doneDate : this.data.form.doneDate,
      });
    },

    onDateChange(e) {
      this.setData({ 'form.doneDate': e.detail.value });
    },

    onMoodTap(e) {
      const key = e.currentTarget.dataset.key;
      // 再点一次取消选择
      this.setData({ 'form.mood': this.data.form.mood === key ? '' : key });
    },

    onNoteInput(e) {
      this.setData({ 'form.note': e.detail.value });
    },

    /* ── 分类 ── */

    onOpenCat() {
      this.setData({ catList: this.data.categories, catPickerVisible: true });
    },

    onCatPickerClose() {
      this.setData({ catPickerVisible: false });
    },

    onCatSelect(e) {
      this.setData({
        'form.category': e.detail.key,
        catPickerVisible: false,
      });
    },

    async onCatCreate(e) {
      const res = await categoriesSvc.create(e.detail.name);
      if (!res.ok) {
        wx.showToast({ title: REASON_TEXT[res.reason] || '建不了', icon: 'none' });
        return;
      }
      const list = await categoriesSvc.list();
      this.setData({
        catList: list,
        'form.category': res.item.key,
        catName: res.item.name,
        catPickerVisible: false,
      });
      wx.showToast({ title: '分类建好了', icon: 'none' });
    },

    onSave() {
      const { form } = this.data;
      if (form.status === 'treasured' && !form.doneDate) {
        wx.showToast({ title: '选个完成的日期吧', icon: 'none' });
        return;
      }
      this.triggerEvent('save', form);
    },
  },
});
