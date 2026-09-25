const operating = require('./operating');
const KEYS = { breakEvenDraft: 'gasStationBreakEvenDraftV2', growthSettings: 'gasStationInvestmentGrowthSettingsV2', recent: 'gasStationRecentV2', history: 'gasStationReportHistoryV1', defaults: 'gasStationUserDefaultsV2', oldDefaults: 'gasStationUserDefaultsV1', draft: 'gasStationInvestmentDraftV2', plans: 'gasStationInvestmentPlansV2', report: 'gasStationActiveReportV2' };
function read(key, fallback) { try { const v = wx.getStorageSync(key); return v === '' || v === undefined ? fallback : v; } catch (_) { return fallback; } }
function list(key) { const v = read(key, []); return Array.isArray(v) ? v : []; }
function write(key, value) { try { wx.setStorageSync(key, value); } catch (_) { throw new Error('本地存储失败，请清理存储空间后重试；本次结果仍可查看'); } }
// Copy the former embedded calculator once; never overwrite an independent draft.
function migrateBreakEvenDraft() {
  if (read(KEYS.breakEvenDraft, null)) return;
  const old = read(KEYS.draft, null);
  if (old && old.form && Array.isArray(old.breakEvenInputs)) {
    write(KEYS.breakEvenDraft, { form: old.form, breakEvenInputs: old.breakEvenInputs });
  }
}
function id() { return Date.now() + '-' + Math.random().toString(36).slice(2, 8); }
function record(form, wageMode, periodKey, stationName) { return { id: id(), version: '2.0.0', createdAt: new Date().toISOString(), form: operating.cleanForm(form), wageMode, periodKey, stationName: stationName || '' }; }
function add(key, value, limit) { write(key, [value, ...list(key)].slice(0, limit)); }
function defaults() { return read(KEYS.defaults, null) || read(KEYS.oldDefaults, null); }
function source(record, kind) {
  if (!record || !record.form) throw new Error('这条记录缺少经营数据');
  const result = operating.calculate(record.form, record.wageMode || 'people', record.periodKey || 'year');
  return { id: record.id, kind, name: record.stationName || '未命名站点', createdAt: record.createdAt,
    periodKey: record.periodKey || 'year', annualEbitda: result.annualEbitda,
    version: '2.0.0', legacy: record.version !== '2.0.0', input: record,
    legacyInvestment: record.version !== '2.0.0' ? Number(record.form.totalInvestment) || 0 : 0 };
}
module.exports = { KEYS, read, list, write, migrateBreakEvenDraft, id, record, add, defaults, source };
