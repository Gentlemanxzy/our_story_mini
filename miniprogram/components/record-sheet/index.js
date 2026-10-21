const { STATUSES, MOODS } = require('../../constants');
const { toISODate } = require('../../utils/format');

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    visible: { type: Boolean, value: false },
    thing: { type: Object, value: null },
  },

  data: {
    statuses: STATUSES,
    moods: MOODS,
    today: '',
    form: {
      status: 'want',
      doneDate: '',
      mood: '',
      note: '',
    },
  },

  observers: {
    'visible, thing': function (visible, thing) {
      if (!visible || !thing) return;
      this.setData({
        today: toISODate(),
        form: {
          status: thing.status || 'want',
          doneDate: thing.doneDate || '',
          mood: thing.mood || '',
          note: thing.note || '',
        },
      });
    },
  },

  methods: {
    noop() {},

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
