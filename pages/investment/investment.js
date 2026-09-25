const engine = require('../../lib/investment');
const financialForm = require('../../lib/investment-form');
const storage = require('../../lib/storage');
const ui = require('../../lib/ui');
const reports = require('../../lib/report');
Page({
  ...financialForm,
  data: { form: engine.initialForm(), source: null, sourceTab: 'recent', sources: [], result: null, report: null,
    modeOptions: engine.MODES, legacyJointMode: false,
    repaymentOptions: ['等额本息 · 按月还款', '按期还息 · 每月付息，到期还本'],
    paymentYearOptions: [2, 3, 5],
    frequencies: [1, 3, 6, 12], frequencyOptions: ['每月预付', '每季预付', '每半年预付', '每年预付'], frequencyIndex: 3,
    plans: [], growthRows: [], hasGrowthSettings: false, sourceError: '', funding: '' },
  onLoad(query) {
    ui.menu();
    try { storage.migrateBreakEvenDraft(); } catch (err) { ui.error(err); }
    this.setData({ hasGrowthSettings: !!storage.read(storage.KEYS.growthSettings, null) });
    const draft = storage.read(storage.KEYS.draft, null);
    if (draft && draft.form) this.setData({ form: { ...engine.initialForm(), workingCapital: 0, cooperation: draft.form.mode === 3 ? 0 : 1, ...draft.form }, source: draft.source || null });
    this.yearsBlur(); this.refreshSources(); this.refreshPlans(); this.refreshGrowth(); this.refreshFunding();
    if (query.recent) {
      const record = storage.list(storage.KEYS.recent).find(x => x.id === query.recent);
      if (record) this.useRecord(record, 'recent');
      else this.setData({ sourceError: '这条近期记录已不在最近 5 条中，请重新选择。' });
    }
  },
  onHide() { this.persistDraft(); },
  onUnload() { this.persistDraft(); },
  persistDraft() { try { storage.write(storage.KEYS.draft, { ...storage.read(storage.KEYS.draft, {}), form: this.data.form, source: this.data.source }); } catch (_) { /* Explicit save remains available and reports storage errors. */ } },
  refreshSources() {
    const key = this.data.sourceTab === 'recent' ? storage.KEYS.recent : storage.KEYS.history;
    this.setData({ sources: storage.list(key).map(r => {
      try { const s = storage.source(r, this.data.sourceTab); return { id: r.id, name: s.name, date: ui.date(r.createdAt), value: ui.money(s.annualEbitda), legacy: s.legacy, period: s.periodKey === 'month' ? '月均记录 · 按年化引用' : '年度记录' }; }
      catch (_) { return { id: r.id, name: r.stationName || '未命名站点', date: ui.date(r.createdAt), invalid: true, value: '数据缺失，需先恢复经营填写' }; }
    }) });
  },
  tab(e) { this.setData({ sourceTab: e.currentTarget.dataset.tab }); this.refreshSources(); },
  selectSource(e) {
    const record = storage.list(this.data.sourceTab === 'recent' ? storage.KEYS.recent : storage.KEYS.history).find(x => x.id === e.currentTarget.dataset.id);
    this.useRecord(record, this.data.sourceTab);
  },
  useRecord(record, kind) {
    try {
      const source = storage.source(record, kind);
      const extra = {};
      if (source.legacyInvestment > 0 && !Number(this.data.form.otherInitial) && !this.data.form.assets.some(a => Number(a.amount))) {
        extra['form.otherInitial'] = source.legacyInvestment;
        extra.sourceError = '旧记录总投资额已带入“其他前期投入”。若改填资产明细，请相应减少该金额，避免重复计算。';
      } else extra.sourceError = source.legacy ? '旧记录已按 2.0 经营口径重新计算，租金、折旧、利息已排除。' : '';
      this.invalidate({ source, 'form.annualEbitda': source.annualEbitda, ...extra });
      this.setData({ sourceDate: ui.date(source.createdAt) });
    } catch (err) { ui.error(err); }
  },
  manual() { this.invalidate({ source: null, sourceError: '' }); },
  nameInput(e) { this.setData({ 'form.name': e.detail.value }); },
  invalidate(extra) { this.setData({ result: null, report: null, ...extra }); this.refreshFunding(); },
  sample() {
    const form = engine.initialForm();
    form.name = '示例投资方案'; form.annualEbitda = 1000000; form.assets[0].amount = 2000000; form.assets[1].amount = 1000000;
    form.rent = 200000; form.loanAmount = 1000000;
    this.invalidate({ form, source: null, sourceError: '' });
  },
  calculate() {
    try { this.yearsBlur(); const result = engine.calculate(this.data.form); const report = reports.investment(result, this.data.source);
      this.setData({ result, report, table: result.rows.map(x => ({ ...x, ebitdaText: ui.money(x.ebitda), profitText: ui.money(x.netProfit), projectText: ui.money(x.projectCash), equityText: ui.money(x.shareholderCash), cumulativeText: ui.money(x.shareholderTotal) })) }, () => wx.pageScrollTo({ selector: '#investment-result', duration: 300 }));
      this.persistDraft();
    } catch (err) { ui.error(err); }
  },
  refreshPlans() { this.setData({ plans: storage.list(storage.KEYS.plans).map(p => ({ ...p, date: ui.date(p.createdAt) })) }); },
  savePlan() {
    try { if (!this.data.result) return;
      storage.add(storage.KEYS.plans, { id: storage.id(), createdAt: new Date().toISOString(), name: this.data.form.name || '未命名方案', form: this.data.form, source: this.data.source }, 100);
      this.refreshPlans(); wx.showToast({ title: '投资方案已保存' });
    } catch (err) { ui.error(err); }
  },
  restorePlan(e) { const plan = storage.list(storage.KEYS.plans).find(p => p.id === e.currentTarget.dataset.id); if (!plan) return;
    this.invalidate({ form: { ...engine.initialForm(), workingCapital: 0, cooperation: plan.form.mode === 3 ? 0 : 1, ...plan.form }, source: plan.source || null, sourceError: '' }); this.yearsBlur(); wx.pageScrollTo({ scrollTop: 0, duration: 200 }); },
  removePlan(e) { wx.showModal({ title: '删除本地投资方案？', success: r => { if (r.confirm) { try { storage.write(storage.KEYS.plans, storage.list(storage.KEYS.plans).filter(p => p.id !== e.currentTarget.dataset.id)); this.refreshPlans(); } catch (err) { ui.error(err); } } } }); },
  report() { if (!this.data.result) return; try { const result = { ...this.data.result, form: { ...this.data.result.form, name: this.data.form.name } }; storage.write(storage.KEYS.report, reports.investment(result, this.data.source)); wx.navigateTo({ url: '/pages/report/report' }); } catch (err) { ui.error(err); } },
  guide() { wx.navigateTo({ url: '/pages/guide/guide' }); }, explain: ui.explain,
  onShareAppMessage: ui.share, onShareTimeline() { return { title: '油站投资回报与年度净利润测算' }; }
});
