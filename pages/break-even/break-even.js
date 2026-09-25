const engine = require('../../lib/investment');
const breakEven = require('../../lib/break-even');
const financialForm = require('../../lib/investment-form');
const reports = require('../../lib/report');
const storage = require('../../lib/storage');
const ui = require('../../lib/ui');
Page({
  ...financialForm,
  data: {
    form: engine.initialForm(), breakEvenInputs: breakEven.initialInputs(), breakEvenResult: null,
    modeOptions: engine.MODES, legacyJointMode: false,
    repaymentOptions: ['等额本息 · 按月还款', '按期还息 · 每月付息，到期还本'],
    paymentYearOptions: [2, 3, 5], frequencies: [1, 3, 6, 12],
    frequencyOptions: ['每月预付', '每季预付', '每半年预付', '每年预付'], frequencyIndex: 3,
    growthRows: [], hasGrowthSettings: false, funding: ''
  },
  onLoad() {
    ui.menu();
    try { storage.migrateBreakEvenDraft(); } catch (err) { ui.error(err); }
    const draft = storage.read(storage.KEYS.breakEvenDraft, null);
    if (draft && draft.form) this.setData({
      form: { ...engine.initialForm(), workingCapital: 0, cooperation: draft.form.mode === 3 ? 0 : 1, ...draft.form, annualEbitda: '' },
      breakEvenInputs: breakEven.restoreInputs(draft.breakEvenInputs)
    });
    this.setData({ hasGrowthSettings: !!storage.read(storage.KEYS.growthSettings, null) });
    this.yearsBlur(); this.refreshFunding();
  },
  onHide() { this.persistDraft(); },
  onUnload() { this.persistDraft(); },
  persistDraft() {
    try { storage.write(storage.KEYS.breakEvenDraft, { form: this.data.form, breakEvenInputs: this.data.breakEvenInputs }); }
    catch (err) { ui.error(err); }
  },
  invalidate(extra) { this.setData({ breakEvenResult: null, ...extra }); this.refreshFunding(); },
  nameInput(e) { this.invalidate({ 'form.name': e.detail.value }); },
  report() {
    if (!this.data.breakEvenResult) return;
    try {
      storage.write(storage.KEYS.report, reports.breakEven(this.data.breakEvenResult));
      wx.navigateTo({ url: '/pages/report/report' });
    } catch (err) { ui.error(err); }
  },
  breakEvenInput(e) {
    const { index, key } = e.currentTarget.dataset;
    this.setData({ ['breakEvenInputs[' + index + '].' + key]: e.detail.value, breakEvenResult: null });
  },
  sample() {
    const form = engine.initialForm(); form.assets[0].amount = 2000000; form.assets[1].amount = 1000000;
    form.rent = 200000; form.loanAmount = 1000000;
    this.invalidate({ form, breakEvenInputs: breakEven.initialInputs() }); this.yearsBlur();
  },
  calculateBreakEven() {
    this.setData({ breakEvenResult: null });
    try {
      this.yearsBlur(); const result = breakEven.calculate(this.data.form, this.data.breakEvenInputs);
      this.setData({ breakEvenResult: result }, () => wx.pageScrollTo({ selector: '#break-even-result', duration: 300 }));
      this.persistDraft();
    } catch (err) { ui.error(err); }
  },
  guide() { wx.navigateTo({ url: '/pages/guide/guide' }); }, explain: ui.explain,
  onShareAppMessage() { return { ...ui.share(), title: '盈亏平衡销量计算器', path: '/pages/break-even/break-even' }; },
  onShareTimeline() { return { title: '盈亏平衡销量计算器' }; }
});
