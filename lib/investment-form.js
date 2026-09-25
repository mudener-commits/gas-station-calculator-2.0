// Shared financial input behavior for the investment and break-even pages.
const engine = require('./investment');
const storage = require('./storage');
const ui = require('./ui');
module.exports = {
  onShow() { this.setData({ hasGrowthSettings: !!storage.read(storage.KEYS.growthSettings, null) }); },
  input(e) { const key = e.currentTarget.dataset.key; const previousYears = Number(this.data.form.years);
    if (key === 'years' && this.previousYears === undefined) this.previousYears = previousYears;
    this.invalidate({ ['form.' + key]: e.detail.value });
  },
  assetInput(e) { const { index, key } = e.currentTarget.dataset;
    this.invalidate({ ['form.assets[' + index + '].' + key]: e.detail.value });
  },
  saveGrowthSettings() {
    try {
      const years = Number(this.data.form.years);
      if (!Number.isInteger(years) || years < 1 || years > 20) throw new Error('请先填写 1–20 年经营期限');
      const growth = Array.from({ length: years }, (_, i) => {
        const value = Number(this.data.form.growth[i] === undefined ? 0 : this.data.form.growth[i]);
        if (!Number.isFinite(value) || value < -100 || value > 1000) throw new Error('第 ' + (i + 1) + ' 年修正比例需为 −100% 至 1000%');
        return value;
      });
      storage.write(storage.KEYS.growthSettings, { growth });
      this.setData({ hasGrowthSettings: true }); wx.showToast({ title: '已保存，覆盖原设置' });
    } catch (err) { ui.error(err); }
  },
  applyGrowthSettings() {
    try {
      const saved = storage.read(storage.KEYS.growthSettings, null);
      if (!saved || !Array.isArray(saved.growth)) throw new Error('尚未保存年度修正设置');
      if (!saved.growth.length || saved.growth.length > 20 || saved.growth.some(v => !Number.isFinite(Number(v)) || Number(v) < -100 || Number(v) > 1000)) throw new Error('已保存的年度修正设置无效，请重新保存');
      const years = Number(this.data.form.years);
      if (!Number.isInteger(years) || years < 1 || years > 20) throw new Error('请先填写 1–20 年经营期限');
      this.invalidate({ 'form.growth': Array.from({ length: years }, (_, i) => Number(saved.growth[i] || 0)) });
      wx.showToast({ title: '已填入年度修正' });
    } catch (err) { ui.error(err); }
  },
  resetGrowth() {
    this.invalidate({ 'form.growth': Array(20).fill(0) });
    wx.showToast({ title: '年度修正已归零' });
  },
  growthInput(e) { this.invalidate({ ['form.growth[' + e.currentTarget.dataset.index + ']']: e.detail.value }); this.refreshGrowth(); },
  growthStep(e) { const { index, step } = e.currentTarget.dataset;
    const current = Number(this.data.form.growth[index]) || 0;
    const value = Math.max(-100, Math.min(1000, Math.round((current + Number(step)) * 100) / 100));
    this.invalidate({ ['form.growth[' + index + ']']: value });
  },
  choice(e) { const key = e.currentTarget.dataset.key, value = Number(e.detail.value);
    this.invalidate({ ['form.' + key]: value, ...(key === 'mode' && value === 3 ? { 'form.cooperation': 1 } : {}) });
  },
  frequency(e) { const i = Number(e.detail.value); this.invalidate({ frequencyIndex: i, 'form.frequency': this.data.frequencies[i] }); },
  yearsBlur(previousYears) {
    const years = Number(this.data.form.years);
    if (!Number.isInteger(years) || years < 1 || years > 20) return;
    previousYears = typeof previousYears === 'number' ? previousYears : this.previousYears === undefined ? years : this.previousYears;
    this.previousYears = undefined;
    const growth = this.data.form.growth.slice();
    while (growth.length < years) growth.push(0);
    const assets = this.data.form.assets.map(a => ({ ...a,
      life: Number(a.life) === previousYears ? years : Math.min(years, Number(a.life) || years) }));
    this.setData({ 'form.growth': growth, 'form.assets': assets, 'form.paymentYears': Math.min(years, Number(this.data.form.paymentYears) || 2) }); this.refreshFunding();
  },
  refreshGrowth() {
    const years = Math.min(20, Math.max(1, Number(this.data.form.years) || 10));
    let annual = Number(this.data.form.annualEbitda);
    const rows = Array.from({ length: years }, (_, i) => {
      const growth = this.data.form.growth[i] === undefined ? 0 : this.data.form.growth[i];
      annual *= 1 + Number(growth) / 100;
      return { index: i, year: i + 1, growth, preview: this.data.form.annualEbitda === '' || !Number.isFinite(annual) ? '待填写基础数据' : ui.money(annual) };
    });
    this.setData({ growthRows: rows, frequencyIndex: Math.max(0, this.data.frequencies.indexOf(Number(this.data.form.frequency))), sourceDate: this.data.source ? ui.date(this.data.source.createdAt) : '' });
  },
  refreshFunding() {
    const f = this.data.form;
    const assets = f.assets.reduce((s, a) => s + (Number(a.amount) || 0), 0);
    let prepaid = 0;
    if (Number.isInteger(Number(f.years)) && Number(f.years) >= 1 && Number(f.years) <= 20 &&
      ((f.mode === 1 && Number(f.prepaidPeriods) > 0 && [1, 3, 6, 12].includes(Number(f.frequency))) ||
      (f.mode === 4 && Number.isInteger(Number(f.paymentYears)) && Number(f.paymentYears) >= 1))) prepaid = engine.rentPlan(f).paid[0] || 0;
    const equity = assets + (Number(f.otherInitial) || 0) + (Number(f.workingCapital) || 0) + prepaid - (Number(f.loanAmount) || 0);
    this.setData({ funding: ui.money(equity), legacyJointMode: f.mode === 3 && f.cooperation === 0 });
    this.refreshGrowth();
  },
};
