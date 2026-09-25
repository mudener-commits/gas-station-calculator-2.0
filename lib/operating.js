const VERSION = '2.0.0';
function initialForm() {
  return {
    vol92: 0, vol95: 0, volDiesel: 0, hasLng: false, volLng: 0,
    customMargin: false, margin92: 1370, margin95: 1781, marginDiesel: 357, marginLng: 0.5,
    customPrice: false, taxMode: 'gross', purchase92: 7500, sale92: 8870,
    purchase95: 8000, sale95: 9781, purchaseDiesel: 6500, saleDiesel: 6857,
    purchaseLng: 4000, saleLng: 4500, employeeCount: 0, avgSalary: 0,
    salaryTotal: 0, stationSalary: 0, hasSocial: false, opsCost: 0, giftCost: 0,
    hasLicense: true, licenseCost: 5000, adminCost: 0, cardShare: 100, cardRate: 3,
    gasCostWeight: 3, dieselCostWeight: 1, lngCostWeight: 1,
    insuranceCost: 3500, propertyTax: 0, landUseTax: 10000, cityTaxRate: 0.07
  };
}
function cleanForm(input) {
  const output = initialForm();
  Object.keys(output).forEach(k => { if (input && input[k] !== undefined) output[k] = input[k]; });
  return output;
}
// Keep the calculation engine compatible with saved net-price records; only
// normalize the editable form. Never relabel a saved net price as gross.
function grossForm(input) {
  const form = cleanForm(input);
  if (form.taxMode === 'net') {
    ['purchase92', 'sale92', 'purchase95', 'sale95', 'purchaseDiesel', 'saleDiesel', 'purchaseLng', 'saleLng'].forEach(key => {
      if (form[key] !== '' && Number.isFinite(Number(form[key]))) {
        form[key] = Number(form[key]) * (key.endsWith('Lng') ? 1.09 : 1.13);
      }
    });
  }
  form.taxMode = 'gross';
  return form;
}
function number(value, label, signed = false) {
  const n = value === '' || value === undefined ? 0 : Number(value);
  if (!Number.isFinite(n) || (!signed && n < 0)) throw new Error(label + '请填写有效' + (signed ? '数字' : '非负数字'));
  if (Math.abs(n) > 1e12) throw new Error(label + '数值过大，请核对金额和单位');
  return n;
}
function calculate(input, wageMode = 'people', periodKey = 'year') {
  const form = cleanForm(input);
  const n = (k, signed) => number(form[k], k, signed);
  const products = [
    ['92#', 'vol92', 'purchase92', 'sale92', 'margin92', 0.73, 0.13, 7500, 1 / 0.73 * 1000, 'gasCostWeight'],
    ['95#', 'vol95', 'purchase95', 'sale95', 'margin95', 0.73, 0.13, 8000, 1.3 / 0.73 * 1000, 'gasCostWeight'],
    ['柴油', 'volDiesel', 'purchaseDiesel', 'saleDiesel', 'marginDiesel', 0.84, 0.13, 6500, 0.3 / 0.84 * 1000, 'dieselCostWeight']
  ];
  if (form.hasLng) products.push(['LNG（液化天然气）', 'volLng', 'purchaseLng', 'saleLng', 'marginLng', 1, 0.09, 4000, 500, 'lngCostWeight']);
  const rows = products.map(([name, vol, p, s, margin, density, vatRate, reference, defaultMargin, weight]) => {
    const lng = vol === 'volLng';
    const daily = n(vol), tons = daily * 365 * density / 1000;
    const gross = !form.customPrice || form.taxMode !== 'net';
    const purchase = form.customPrice ? n(p) : reference;
    const sale = form.customPrice ? n(s) : reference + (form.customMargin ? n(margin, true) * (lng ? 1000 : 1) : defaultMargin);
    if (sale < 0) throw new Error(name + '销售价格不能为负，请核对毛利');
    const netPurchase = purchase / (gross ? 1 + vatRate : 1);
    const netSale = sale / (gross ? 1 + vatRate : 1);
    return { name, daily, unit: lng ? '公斤/天' : '升/天', costUnit: lng ? '元/公斤' : '元/升', tons, weight: n(weight),
      revenue: netSale * tons, purchase: netPurchase * tons,
      grossSales: sale * tons * (gross ? 1 : 1 + vatRate),
      grossPurchase: purchase * tons * (gross ? 1 : 1 + vatRate),
      outputVat: netSale * tons * vatRate, inputVat: netPurchase * tons * vatRate };
  });
  if (!rows.some(x => x.daily > 0)) throw new Error('请至少填写一种油气的日均销量');
  if (form.hasLng && n('volLng') <= 0) throw new Error('请填写液化天然气日均销量，或关闭该业务');
  if (n('cardShare') > 100) throw new Error('支付占比不能超过 100%');
  if (!Number.isInteger(n('employeeCount'))) throw new Error('员工人数需填写整数');
  const sum = key => rows.reduce((s, row) => s + row[key], 0);
  const wage = ((wageMode === 'total' ? n('salaryTotal') : n('employeeCount') * n('avgSalary')) + n('stationSalary')) * 12;
  const costs = [
    ['人工工资', wage], ['企业社保', form.hasSocial ? wage * 0.32 : 0],
    ['综合运营费用', n('opsCost') * 12], ['营销成本', n('giftCost') * 12],
    ['证照及行政合规', (form.hasLicense ? n('licenseCost') : 0) + n('adminCost')],
    ['支付手续费', sum('grossSales') * n('cardShare') / 100 * n('cardRate') / 1000],
    ['商业保险', n('insuranceCost')], ['房产税', n('propertyTax')], ['土地使用税', n('landUseTax')]
  ].map(([label, value]) => ({ label, value }));
  const revenue = sum('revenue'), purchase = sum('purchase');
  const outputVat = sum('outputVat'), inputVat = sum('inputVat');
  const vat = Math.max(0, outputVat - inputVat), vatCredit = Math.max(0, inputVat - outputVat);
  // VAT is a pass-through: net-of-VAT revenue/cost must not deduct VAT again.
  const surtax = vat * (n('cityTaxRate') + 0.03 + 0.02);
  const stamp = revenue * 0.0003;
  const operatingCost = costs.reduce((s, r) => s + r.value, 0);
  const ebitda = revenue - purchase - operatingCost - surtax - stamp;
  const base = rows.reduce((s, r) => s + r.tons * r.weight, 0);
  if (!base) throw new Error('有销量的油气品类至少有一个费用分摊系数大于 0');
  rows.forEach(r => { r.allocatedCost = (operatingCost + surtax + stamp) * r.tons * r.weight / base;
    r.costPerTon = r.tons ? r.allocatedCost / r.tons : 0;
    r.costPerUnit = r.daily ? r.allocatedCost / (r.daily * 365) : null; });
  return { version: VERSION, periodKey, scale: periodKey === 'month' ? 1 / 12 : 1,
    annualEbitda: ebitda, revenue, purchase, operatingCost, surtax, stamp, vat,
    grossSales: sum('grossSales'), grossPurchase: sum('grossPurchase'), outputVat, inputVat, vatCredit,
    rows, costs, time: new Date().toISOString(), form, wageMode,
    warnings: [...(!wage ? ['人工工资为 0，请核实是否漏填。'] : []),
      ...(!n('opsCost') ? ['综合运营费用为 0，请核实是否漏填。'] : []),
      ...(ebitda < 0 ? ['当前经营 EBITDA 为负，经营收入不足以覆盖所填日常成本。'] : [])] };
}
function sample(hasLng) {
  return { ...initialForm(), vol92: 5000, vol95: 2000, volDiesel: 3000,
    hasLng: !!hasLng, volLng: hasLng ? 15000 : 0, employeeCount: 5, avgSalary: 4000,
    stationSalary: 8000, opsCost: 8000, giftCost: 2000, licenseCost: 8000,
    insuranceCost: 3500, landUseTax: 10000 };
}
module.exports = { VERSION, initialForm, cleanForm, grossForm, calculate, sample, number };
