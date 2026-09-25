const investment = require('./investment');
const PRODUCTS = [
  { key: '92', name: '92 号汽油', unit: '升', vat: 0.13, ratio: 50, margin: 1, cost: 0.3 },
  { key: '95', name: '95 号汽油', unit: '升', vat: 0.13, ratio: 20, margin: 1.3, cost: 0.3 },
  { key: 'diesel', name: '柴油', unit: '升', vat: 0.13, ratio: 30, margin: 0.3, cost: 0.1 },
  { key: 'lng', name: 'LNG', unit: '公斤', vat: 0.09, ratio: 0, margin: 0.5, cost: 0.1 }
];
function initialInputs() { return PRODUCTS.map(p => ({ ...p })); }
function restoreInputs(saved) {
  const defaults = initialInputs();
  if (!Array.isArray(saved) || saved.length !== 4 || saved.some(p => !p || typeof p !== 'object')) return defaults;
  return defaults.map((p, i) => ({ ...p, ratio: saved[i].ratio, margin: saved[i].margin, cost: saved[i].cost }));
}
function calculate(form, inputs) {
  if (!Array.isArray(inputs) || inputs.length !== PRODUCTS.length || inputs.some(p => !p || typeof p !== 'object')) throw new Error('请填写四类油气品种的配比、毛利与费用');
  const products = PRODUCTS.map((p, i) => {
    const read = (key, label, signed = false) => {
      const raw = inputs[i][key], v = Number(raw);
      if (raw === '' || raw === null || raw === undefined || !Number.isFinite(v) || (!signed && v < 0) || Math.abs(v) > 1e6) throw new Error(p.name + label + '填写不正确');
      return v;
    };
    const ratio = read('ratio', '配比'), margin = read('margin', '含税毛利', true), cost = read('cost', '单位经营费用');
    if (ratio > 100) throw new Error('各品种配比需为 0%–100%');
    return { ...p, ratio, margin, cost, contribution: margin / (1 + p.vat) - cost };
  });
  if (Math.abs(products.reduce((s, p) => s + p.ratio, 0) - 100) > 1e-6) throw new Error('油气销量配比合计必须为 100%');
  const contribution = products.reduce((s, p) => s + p.ratio / 100 * p.contribution, 0);
  // Reuse the actual rental, depreciation, tax, financing and monthly payment model.
  // The supplied operating source is not consumed: the candidate replaces EBITDA only here.
  const cache = new Map();
  const evaluate = annual => {
    if (!cache.has(annual)) {
      const r = investment.calculate({ ...form, annualEbitda: annual });
      cache.set(annual, { accounting: r.averages.netProfit, investment: r.shareholder.npv });
    }
    return cache.get(annual);
  };
  const zero = evaluate(0); // Also validates all shared investment assumptions.
  let multiplier = 1, maxMultiplier = 1;
  form.growth.slice(0, Number(form.years)).forEach(g => {
    multiplier *= 1 + Number(g) / 100; maxMultiplier = Math.max(maxMultiplier, multiplier);
  });
  // Stay within the forward model's numeric range, including extreme annual revisions.
  const cap = Math.min(1e12, 0.99e15 / maxMultiplier);
  const solve = kind => {
    const result = (annual, note) => {
      const scale = annual === 0 ? 0 : annual / (365 * contribution);
      if (!Number.isFinite(scale)) return { status: 'unreachable', note: '所需销量超出可计算范围，请检查毛利和单位费用。' };
      return { status: 'solved', annualEbitda: annual, residual: evaluate(annual)[kind], note,
        volumes: products.filter(p => p.ratio > 0).map(p => ({ key: p.key, name: p.name, unit: p.unit, daily: scale * p.ratio / 100, dailyText: (scale * p.ratio / 100).toFixed(2) })) };
    };
    if (zero[kind] >= 0) return result(0, '零销量已满足这一口径，不代表已有经营利润。');
    if (contribution <= 0) return { status: 'unreachable', note: '当前配比的综合单位贡献不为正，增加销量无法弥补缺口。请调整毛利、费用或配比。' };
    let low = 0, high = Math.min(1000000, cap);
    while (evaluate(high)[kind] < 0 && high < cap) { low = high; high = Math.min(high * 2, cap); }
    if (evaluate(high)[kind] < 0) return { status: 'unreachable', note: '在模型可计算范围内未找到平衡销量，请检查年度修正、税率、业主租金比例及投入；不显示为 0。' };
    for (let n = 0; n < 64 && high - low > Math.max(Number.MIN_VALUE, high * 1e-13); n++) {
      const mid = (low + high) / 2;
      if (evaluate(mid)[kind] >= 0) high = mid; else low = mid;
    }
    return result(high, '约数，未预留经营安全余量。');
  };
  return { form: JSON.parse(JSON.stringify(form)), time: new Date().toISOString(), products, contribution, accounting: solve('accounting'), investment: solve('investment') };
}
module.exports = { initialInputs, restoreInputs, calculate };
