const { number } = require('./operating');
const { npv, irr, payback, loanSchedule } = require('./finance');
// Keep existing indices stable for saved plans; append the new rental mode.
const MODES = ['固定租金', '长租短付', '动态租金（业主分红）', '固定管理费', '长租长付'];
const isRental = mode => [0, 1, 4].includes(mode);
function initialForm() {
  return { name: '', annualEbitda: '', years: 10, discountRate: 7, incomeTaxRate: 25,
    selfOwned: false, mode: 0, rent: 0, rentGrowth: 0, frequency: 12, prepaidPeriods: 1,
    shareRate: 50, cooperation: 1, ownContribution: 0, managementFee: 0, paymentYears: 2,
    loanAmount: 0, loanRate: 3, loanYears: 5, repayment: 1, otherInitial: 0, workingCapital: 500000,
    assets: [{ name: '站房及改造', amount: 0, life: 10 }, { name: '设备设施', amount: 0, life: 10 }, { name: '其他固定资产', amount: 0, life: 10 }],
    growth: Array(10).fill(0) };
}
function validate(form) {
  if (form.annualEbitda === '' || form.annualEbitda === null || form.annualEbitda === undefined) throw new Error('请引用经营测算或填写年度经营 EBITDA');
  const n = (key, signed = false) => number(form[key], key, signed);
  n('annualEbitda', true);
  if (!Number.isInteger(n('years')) || n('years') < 1 || n('years') > 20) throw new Error('预测期需为 1–20 年整数');
  if (n('discountRate') > 100 || n('incomeTaxRate') > 100) throw new Error('折现率和所得税率需在 0%–100% 内');
  if (![0, 1, 2, 3, 4].includes(form.mode) || ![0, 1].includes(form.cooperation) || ![0, 1].includes(form.repayment)) throw new Error('请选择有效合作及还款方式');
  ['otherInitial', 'workingCapital', 'loanAmount', 'loanRate'].forEach(k => n(k));
  if (n('loanRate') > 100) throw new Error('贷款年利率不能超过 100%');
  if (isRental(form.mode)) {
    n('rent');
    if (n('rentGrowth', true) < -100 || n('rentGrowth', true) > 100) throw new Error('年租金递增幅度需在 -100%–100% 内');
  }
  if (form.mode === 1 && (![1, 3, 6, 12].includes(Number(form.frequency)) || !Number.isInteger(n('prepaidPeriods')) || n('prepaidPeriods') < 1 || n('prepaidPeriods') * n('frequency') > n('years') * 12)) throw new Error('预付期数需为正整数，且预付月份不得超过合同期');
  if (form.mode === 2 && n('shareRate') > 100) throw new Error('业主动态租金比例需在 0%–100% 内');
  if (form.mode === 4 && (!Number.isInteger(n('paymentYears')) || n('paymentYears') < 1 || n('paymentYears') > n('years'))) throw new Error('每次预付年数需为 1 至经营年限之间的整数');
  if (form.mode === 3) {
    if (form.cooperation === 0) throw new Error('双方出资合作模式已取消，请重新选择租赁或合作方式后计算；原方案数据保留，不自动转换业主租金比例。');
    n('managementFee');
  }
  if (n('loanAmount') > 0 && (!Number.isInteger(n('loanYears')) || n('loanYears') < 1 || n('loanYears') > 30)) throw new Error('贷款期限需为 1–30 年整数');
  if (!Array.isArray(form.assets) || form.assets.length !== 3) throw new Error('请核实三类固定资产');
  form.assets.forEach(a => {
    number(a.amount, a.name);
    if (!Number.isInteger(Number(a.life)) || Number(a.life) < 1 || Number(a.life) > n('years')) throw new Error(a.name + '折旧年限需为 1 至经营年限之间的整数');
  });
  if (!Array.isArray(form.growth) || form.growth.length < n('years')) throw new Error('请核实逐年 EBITDA 修订');
  form.growth.slice(0, n('years')).forEach((g, i) => {
    const value = number(g, '第 ' + (i + 1) + ' 年修订比例', true);
    if (value < -100 || value > 1000) throw new Error('第 ' + (i + 1) + ' 年修订比例需为 -100%–1000%');
  });
}
function rentPlan(form) {
  const months = Number(form.years) * 12;
  if (form.selfOwned === true) return { expense: Array(months).fill(0), paid: Array(months + 1).fill(0) };
  const expense = Array.from({ length: months }, (_, i) => isRental(form.mode) ? Number(form.rent) * Math.pow(1 + Number(form.rentGrowth) / 100, Math.floor(i / 12)) / 12 : 0);
  const paid = Array(months + 1).fill(0);
  if (form.mode === 0) expense.forEach((amount, i) => { paid[i + 1] = amount; });
  if (form.mode === 1 || form.mode === 4) {
    // Contract payments at period START; index 0 is the initial payment.
    let start = 0;
    while (start < months) {
      const length = form.mode === 4 ? Number(form.paymentYears) * 12 : start === 0 ? Number(form.frequency) * Number(form.prepaidPeriods) : Number(form.frequency);
      if (!Number.isInteger(length) || length < 1) throw new Error('请核对租金付款周期');
      paid[start] += expense.slice(start, start + length).reduce((s, x) => s + x, 0);
      start += length;
    }
  }
  return { expense, paid };
}
function metrics(flows, rate) {
  const monthRate = Math.pow(1 + rate / 100, 1 / 12) - 1;
  const solved = flows[0] >= 0 ? { value: null, reason: '初始现金投入为 0，收益率不适用' } : irr(flows);
  return { npv: npv(monthRate, flows), irr: solved.value === null ? null : Math.pow(1 + solved.value, 12) - 1,
    irrReason: solved.reason, payback: payback(flows), total: flows.reduce((s, x) => s + x, 0) };
}
function calculate(input) {
  if (input.workingCapital !== undefined) number(input.workingCapital, '流动资金');
  const form = JSON.parse(JSON.stringify(input));
  if (form.selfOwned !== undefined && typeof form.selfOwned !== 'boolean') throw new Error('请重新选择是否自有站经营');
  // Apply ownership only to this calculation snapshot; preserve rental inputs in
  // the page/draft so unchecking restores the user's previous contract settings.
  if (form.selfOwned === true) Object.assign(form, { mode: 0, cooperation: 1, rent: 0, rentGrowth: 0, shareRate: 0, managementFee: 0 });
  // Old saved plans retain their original zero working-capital assumption.
  if (form.workingCapital === undefined) form.workingCapital = 0;
  if (form.mode === 3 && form.cooperation === undefined) form.cooperation = 0;
  validate(form);
  const years = Number(form.years), horizon = years * 12;
  const rentals = rentPlan(form);
  const fixedAssets = form.assets.reduce((s, a) => s + Number(a.amount), 0);
  const workingCapital = Number(form.workingCapital);
  const initial = fixedAssets + Number(form.otherInitial) + rentals.paid[0] + workingCapital;
  const debt = Number(form.loanAmount);
  if (debt > initial) throw new Error('贷款金额不得超过资产、其他前期投入、首期预付租金与流动资金之和');
  const equity = initial - debt;
  // Landlord payments are costs. The operator owns all remaining equity cash flow.
  const ownShare = 1;
  const loan = loanSchedule(debt, Number(form.loanRate) / 100, Number(form.loanYears) * 12, form.repayment === 1 ? 'bullet' : 'annuity');
  // Settle remaining debt at the forecast end; never hide unpaid principal.
  const terminalDebt = loan[horizon - 1] ? loan[horizon - 1].balance : 0;
  const projectFlows = [-initial], shareholderFlows = [-equity * ownShare];
  const rows = [];
  let ebitda = Number(form.annualEbitda), projectTotal = -initial, shareholderTotal = -equity * ownShare;
  const taxRate = Number(form.incomeTaxRate) / 100;
  for (let year = 1; year <= years; year++) {
    ebitda *= 1 + Number(form.growth[year - 1]) / 100;
    if (!Number.isFinite(ebitda) || Math.abs(ebitda) > 1e15) throw new Error('逐年修订后经营金额过大，请核对增幅与单位');
    const from = (year - 1) * 12, to = year * 12;
    const fixedRentExpense = rentals.expense.slice(from, to).reduce((s, x) => s + x, 0);
    const depreciation = form.assets.reduce((s, a) => s + (year <= Number(a.life) ? Number(a.amount) / Number(a.life) : 0), 0);
    const management = form.mode === 3 && form.cooperation === 1 ? Number(form.managementFee) : 0;
    const interest = loan.slice(from, to).reduce((s, x) => s + x.interest, 0);
    const principal = loan.slice(from, to).reduce((s, x) => s + x.principal, 0) + (year === years ? terminalDebt : 0);
    const beforeInterest = ebitda - fixedRentExpense - depreciation - management;
    const beforeSharing = beforeInterest - interest;
    const shareRate = form.mode === 2 ? Number(form.shareRate) / 100 : 0;
    const share = Math.max(0, beforeSharing) * shareRate;
    const projectShare = Math.max(0, beforeInterest) * shareRate;
    // The profit-linked payment is landlord rent, not an equity distribution.
    // Keep share/projectShare as compatibility aliases for existing result readers.
    const ownerRent = share, projectOwnerRent = projectShare;
    const rentExpense = fixedRentExpense + ownerRent;
    const projectRentExpense = fixedRentExpense + projectOwnerRent;
    const pretax = beforeSharing - ownerRent;
    const tax = Math.max(0, pretax) * taxRate;
    const projectTax = Math.max(0, beforeInterest - projectOwnerRent) * taxRate;
    const netProfit = pretax - tax;
    // Comparable annual earning capacity: rent follows the year it belongs to,
    // not the prepayment date. These values never feed the timed cash-flow arrays.
    const projectAnnualCash = ebitda - projectRentExpense - management - projectTax;
    const shareholderAnnualCash = (netProfit + depreciation - principal) * ownShare;
    let projectCash = 0, shareholderCash = 0, rentPaid = 0;
    for (let m = from; m < to; m++) {
      // Monthly fixed rent is paid at month end; prepaid rent is at month start.
      // Year tables attribute boundary payments to the year that is starting.
      const prepaid = form.mode === 1 || form.mode === 4;
      const payment = prepaid ? (m > 0 ? rentals.paid[m] : 0) : rentals.paid[m + 1];
      const debtMonth = loan[m] || { interest: 0, principal: 0 };
      const recovery = m === horizon - 1 ? workingCapital : 0;
      const pcf = ebitda / 12 - payment - management / 12 - projectOwnerRent / 12 - projectTax / 12 + recovery;
      const scf = (ebitda / 12 - payment - management / 12 - ownerRent / 12 - tax / 12 - debtMonth.interest - debtMonth.principal - (m === horizon - 1 ? terminalDebt : 0) + recovery) * ownShare;
      if (prepaid) {
        projectFlows[m] -= payment; shareholderFlows[m] -= payment * ownShare;
        projectFlows.push(pcf + payment); shareholderFlows.push(scf + payment * ownShare);
      } else { projectFlows.push(pcf); shareholderFlows.push(scf); }
      projectCash += pcf; shareholderCash += scf; rentPaid += payment + ownerRent / 12;
    }
    projectTotal += projectCash; shareholderTotal += shareholderCash;
    rows.push({ year, growth: Number(form.growth[year - 1]), ebitda, fixedRentExpense, rentExpense, projectRentExpense, ownerRent, projectOwnerRent, rentPaid, depreciation,
      management, interest, principal, beforeSharing, share, pretax, tax, netProfit,
      partnerPretax: 0,
      ownNetProfit: netProfit * ownShare, projectTax, projectShare, projectAnnualCash, shareholderAnnualCash,
      projectCash, shareholderCash, projectTotal, shareholderTotal });
  }
  const sum = key => rows.reduce((total, row) => total + row[key], 0);
  const averages = { netProfit: sum('netProfit') / years, ownerRent: sum('ownerRent') / years, projectOwnerRent: sum('projectOwnerRent') / years,
    projectCash: sum('projectAnnualCash') / years, shareholderCash: sum('shareholderAnnualCash') / years };
  const warnings = [];
  if (form.selfOwned) warnings.push('自有站经营：不计租金、业主动态租金或合作管理费；资产金额仍按期初投入计入，按所填年限折旧。');
  if (Number(form.annualEbitda) < 0) warnings.push('基准 EBITDA 为负时，“+10%”表示亏损金额扩大 10%，请核对逐年修订。');
  if (terminalDebt > 0) warnings.push('预测期短于贷款期，期末现金流已计入剩余本金偿还 ' + terminalDebt.toFixed(2) + ' 元。');
  if (form.mode === 2) warnings.push('租金（业主分红）按支付前税前利润的正数计算，已作为动态租金扣除一次；按合同租金可税前列支测算，不作为股东分配再次扣除。');
  if (projectFlows.some((x, i) => i > 0 && x < 0)) warnings.push('部分月份现金净流出，不等于实际资金不足；支付能力还需结合流动资金、留存回款和实际付款安排判断。首次回本后累计现金流仍可能再次转负。');
  return { type: 'investment', version: '2.0.0', time: new Date().toISOString(), form, modeName: form.selfOwned ? '自有站经营' : MODES[form.mode],
    initial, workingCapital, workingCapitalRecovery: workingCapital, equity, ownShare, ownInitial: equity * ownShare, partnerInitial: equity * (1 - ownShare),
    initialRent: rentals.paid[0], terminalDebt, rows, averages, projectFlows, shareholderFlows,
    project: metrics(projectFlows, Number(form.discountRate)), shareholder: metrics(shareholderFlows, Number(form.discountRate)), warnings };
}
module.exports = { MODES, initialForm, calculate, rentPlan, metrics, isRental };
