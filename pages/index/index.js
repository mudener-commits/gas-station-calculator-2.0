const engine = require('../../lib/operating');
const storage = require('../../lib/storage');
const ui = require('../../lib/ui');
const reports = require('../../lib/report');
const fields = (items) => items.map(([key, label, signed]) => ({ key, label, signed: !!signed }));
const dailyFields = fields([['vol92', '92# 汽油（升/天）'], ['vol95', '95# 汽油（升/天）'], ['volDiesel', '柴油（升/天）']]);
const costGroups = [
  { title: '日常运营 · 元/月', fields: fields([['opsCost', '综合运营费（水电、办公、耗材、小额维修等）'], ['giftCost', '营销成本（赠品、增值服务、促销物料等）']]) },
  { title: '保险及持有税费 · 元/年', fields: fields([['insuranceCost', '商业保险'], ['propertyTax', '房产税'], ['landUseTax', '城镇土地使用税']]) },
  { title: '支付费用', fields: fields([['cardShare', '刷卡/支付占比（%）'], ['cardRate', '刷卡/支付手续费率（‰）']]) },
  { title: '共同费用分摊', fields: fields([['gasCostWeight', '汽油分摊系数'], ['dieselCostWeight', '柴油分摊系数']]) }
];
Page({
  data: { form: engine.initialForm(), dailyFields, costGroups, wageMode: 'people', wageIndex: 0, wageOptions: ['按人数填写', '填普通员工工资总额'],
    priceIndex: 0, priceOptions: ['使用参考毛利', '自定义毛利', '自定义采购价 / 售价'],
    priceConversionNote: '', cityIndex: 0, cityOptions: ['市区 · 7%', '县城 / 镇 · 5%', '其他 · 1%'],
    stationName: '', result: null, report: null, history: [], periodKey: 'year',
    marginFields: fields([['margin92', '92# 毛利（元/吨）', true], ['margin95', '95# 毛利（元/吨）', true], ['marginDiesel', '柴油毛利（元/吨）', true]]),
    priceFields: fields([['purchase92', '92# 采购价（元/吨）'], ['sale92', '92# 售价（元/吨）'], ['purchase95', '95# 采购价（元/吨）'], ['sale95', '95# 售价（元/吨）'], ['purchaseDiesel', '柴油采购价（元/吨）'], ['saleDiesel', '柴油售价（元/吨）']]) },
  onLoad() { ui.menu(); this.refreshHistory(); },
  onShow() { this.refreshHistory(); },
  refreshHistory() {
    this.setData({ history: storage.list(storage.KEYS.history).map(record => {
      let value = '数据待核对';
      try { const r = engine.calculate(record.form, record.wageMode, record.periodKey); value = ui.money(r.annualEbitda * r.scale); } catch (_) { /* keep invalid records recoverable */ }
      return { ...record, date: ui.date(record.createdAt), value, periodLabel: record.periodKey === 'month' ? '月均' : '年度', volumes: this.volumes(record.form || {}) };
    }) });
  },
  volumes(f) { return ['92# ' + (f.vol92 || 0) + ' 升/天', '95# ' + (f.vol95 || 0) + ' 升/天', '柴油 ' + (f.volDiesel || 0) + ' 升/天'].concat(f.hasLng ? ['液化天然气 ' + (f.volLng || 0) + ' 公斤/天'] : []); },
  invalidate(extra) { this.setData({ result: null, report: null, savedId: '', ...extra }); },
  input(e) { this.invalidate({ ['form.' + e.currentTarget.dataset.key]: e.detail.value }); },
  switchField(e) { this.invalidate({ ['form.' + e.currentTarget.dataset.key]: e.detail.value }); },
  nameInput(e) { this.setData({ stationName: e.detail.value }); },
  priceMode(e) { const i = Number(e.detail.value); this.invalidate({ priceIndex: i, 'form.customPrice': i === 2, 'form.customMargin': i === 1 }); },
  wageMode(e) { const i = Number(e.detail.value); this.invalidate({ wageIndex: i, wageMode: i ? 'total' : 'people' }); },
  cityMode(e) { const i = Number(e.detail.value); this.invalidate({ cityIndex: i, 'form.cityTaxRate': [0.07, 0.05, 0.01][i] }); },
  syncForm(form, wageMode) {
    const f = engine.grossForm(form);
    this.invalidate({ form: f, wageMode: wageMode || 'people', wageIndex: wageMode === 'total' ? 1 : 0,
      priceIndex: f.customPrice ? 2 : f.customMargin ? 1 : 0,
      priceConversionNote: form && form.taxMode === 'net' ? '原记录中的不含税价格已自动换算为含税价格，测算口径保持不变。' : '',
      cityIndex: Math.max(0, [0.07, 0.05, 0.01].indexOf(Number(f.cityTaxRate))) });
  },
  sample() { this.syncForm(engine.sample(this.data.form.hasLng), 'people'); },
  reset() { wx.showModal({ title: '清空当前填写？', content: '已保存的本地历史和默认数据会保留。', success: r => { if (r.confirm) { this.syncForm(engine.initialForm(), 'people'); this.setData({ stationName: '' }); } } }); },
  calculate(e) {
    try {
      const periodKey = e.currentTarget.dataset.period || this.data.periodKey;
      const result = engine.calculate(this.data.form, this.data.wageMode, periodKey);
      const record = storage.record(this.data.form, this.data.wageMode, periodKey, this.data.stationName.trim());
      this.setData({ result, periodKey, report: reports.operating(result, this.data.stationName), savedId: '', record }, () => {
        wx.pageScrollTo({ selector: '#result', duration: 300 });
      });
      storage.add(storage.KEYS.recent, record, 5);
    } catch (error) { ui.error(error); }
  },
  saveHistory() {
    if (!this.data.result) return;
    try { const record = storage.record(this.data.form, this.data.wageMode, this.data.periodKey, this.data.stationName.trim());
      storage.add(storage.KEYS.history, record, 100); this.setData({ savedId: record.id }); this.refreshHistory(); wx.showToast({ title: '填写数据已保存' });
    } catch (error) { ui.error(error); }
  },
  restore(e) {
    const record = storage.list(storage.KEYS.history).find(x => x.id === e.currentTarget.dataset.id);
    if (!record) return;
    this.syncForm(record.form, record.wageMode); this.setData({ stationName: record.stationName || '', periodKey: record.periodKey || 'year' });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 }); wx.showToast({ title: '已恢复，请重新计算', icon: 'none' });
  },
  remove(e) {
    wx.showModal({ title: '删除本地历史记录？', success: res => { if (!res.confirm) return;
      try { storage.write(storage.KEYS.history, storage.list(storage.KEYS.history).filter(x => x.id !== e.currentTarget.dataset.id)); this.refreshHistory(); } catch (err) { ui.error(err); }
    } });
  },
  clearHistory() { wx.showModal({ title: '清空全部历史报告？', content: '此操作无法恢复。', success: r => { if (r.confirm) { try { storage.write(storage.KEYS.history, []); this.refreshHistory(); } catch (err) { ui.error(err); } } } }); },
  saveDefaults() {
    try { const form = engine.cleanForm(this.data.form); ['vol92', 'vol95', 'volDiesel', 'volLng'].forEach(k => delete form[k]);
      storage.write(storage.KEYS.defaults, { form, wageMode: this.data.wageMode }); wx.showToast({ title: '默认数据已保存' });
    } catch (err) { ui.error(err); }
  },
  applyDefaults() { const saved = storage.defaults(); if (!saved || !saved.form) return wx.showToast({ title: '暂无默认数据', icon: 'none' });
    const form = { ...engine.cleanForm(saved.form) }; ['vol92', 'vol95', 'volDiesel', 'volLng'].forEach(k => { form[k] = this.data.form[k]; }); this.syncForm(form, saved.wageMode); },
  clearDefaults() { wx.showModal({ title: '清除我的默认数据？', success: r => { if (r.confirm) { try { storage.write(storage.KEYS.defaults, { form: engine.initialForm(), wageMode: 'people' }); wx.showToast({ title: '已清除默认数据' }); } catch (err) { ui.error(err); } } } }); },
  report() { if (!this.data.result) return; try { storage.write(storage.KEYS.report, reports.operating(this.data.result, this.data.stationName)); wx.navigateTo({ url: '/pages/report/report' }); } catch (err) { ui.error(err); } },
  invest() { if (!this.data.record) return; wx.navigateTo({ url: '/pages/investment/investment?recent=' + encodeURIComponent(this.data.record.id) }); },
  guide() { wx.navigateTo({ url: '/pages/guide/guide' }); }, explain: ui.explain,
  onShareAppMessage: ui.share, onShareTimeline() { return { title: '加油站经营 EBITDA（息税折旧摊销前利润）测算' }; }
});
