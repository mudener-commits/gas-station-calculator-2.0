// Pure cash-flow functions. Rates are decimals; cashFlows[0] is time zero.
function npv(rate, flows) {
  if (!Number.isFinite(rate) || rate <= -1) throw new Error('折现率必须大于 -100%');
  return flows.reduce((sum, cf, i) => sum + cf / Math.pow(1 + rate, i), 0);
}
function irr(flows) {
  const nonzero = flows.filter(x => Math.abs(x) > 1e-8);
  let changes = 0;
  for (let i = 1; i < nonzero.length; i++) if (nonzero[i] * nonzero[i - 1] < 0) changes++;
  if (!changes) return { value: null, reason: '没有正负现金流转换，无法计算' };
  if (changes > 1) return { value: null, reason: '现金流多次变号，可能存在多个收益率' };
  // Bisection avoids Newton iteration silently selecting a root.
  let lo = -0.999999, hi = 1;
  const low = npv(lo, flows);
  while (Math.sign(npv(hi, flows)) === Math.sign(low) && hi < 1e8) hi = hi * 2 + 1;
  if (Math.sign(npv(hi, flows)) === Math.sign(low)) return { value: null, reason: '收益率超出可计算范围' };
  for (let i = 0; i < 220; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(npv(mid, flows)) === Math.sign(low)) lo = mid; else hi = mid;
  }
  return { value: (lo + hi) / 2, reason: '' };
}
function payback(flows, periodsPerYear = 12) {
  if (flows[0] >= 0) return null;
  let total = flows[0];
  for (let i = 1; i < flows.length; i++) {
    const before = total;
    total += flows[i];
    if (total >= 0) return (i - 1 + (-before / flows[i])) / periodsPerYear;
  }
  return null;
}
function loanSchedule(amount, annualRate, months, method) {
  if (!amount) return [];
  const r = annualRate / 12;
  const payment = r === 0 ? amount / months : amount * r / (1 - Math.pow(1 + r, -months));
  let balance = amount;
  return Array.from({ length: months }, (_, i) => {
    const interest = balance * r;
    const principal = i === months - 1 ? balance : method === 'bullet' ? 0 : Math.min(balance, payment - interest);
    balance = Math.max(0, balance - principal);
    return { principal, interest, balance };
  });
}
module.exports = { npv, irr, payback, loanSchedule };
