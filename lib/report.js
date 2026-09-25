const { money, date, percent, payback } = require('./ui');
const breakEvenReport = require('./break-even-report');
const glossary = require('./terms');
function row(label, value, highlight = false) { return { label, value, highlight }; }
function metric(label, value, term) { return { label, value, term }; }
function unitCostRow(product) {
  const primaryValue = product.costPerUnit === null ? '无销量，暂不计算' : product.costPerUnit.toFixed(3) + ' ' + product.costUnit;
  const secondaryValue = product.costPerUnit === null ? '' : '（' + product.costPerTon.toFixed(2) + ' 元/吨）';
  return { ...row(product.name + (product.costUnit === '元/公斤' ? '每公斤经营费用' : '升油费用'), primaryValue + secondaryValue, true),
    primaryValue, secondaryValue, unitCost: true };
}
function annualTable(result) {
  const columns = [
    { key: 'year', label: '年份' },
    { key: 'ebitda', label: '经营\n收益' },
    { key: 'netProfit', label: '年度\n净利润', highlight: true },
    { key: 'projectCash', label: '项目\n现金流', highlight: true },
    { key: 'shareholderCash', label: '我方股东\n现金流', highlight: true },
    { key: 'shareholderTotal', label: '我方累计\n现金流', highlight: true }
  ];
  return { title: '逐年利润与现金流', unit: '单位：万元', columns,
    note: '经营收益为租金前经营 EBITDA（息税折旧摊销前利润）；年度净利润为项目整体，项目现金流不含融资，我方现金流扣除贷款本息，业主动态租金已作为成本扣除；我方累计现金流包含初始出资。现金流按实际付款安排，期末含流动资金回收；与按租金归属年度计算的年均回笼口径不同。',
    rows: result.rows.map(y => ({ year: y.year, cells: columns.map(c => ({
      key: c.key, value: c.key === 'year' ? String(y.year) : (y[c.key] / 10000).toFixed(2), highlight: !!c.highlight
    })) })) };
}
function operating(result, name) {
  const factor = result.scale, period = result.periodKey === 'month' ? '月均' : '年度';
  const amount = x => money(x * factor);
  // Presentation only: separate the holding taxes from daily expenses so the
  // summary and its breakdown never count property/land taxes twice.
  const holdingTaxes = result.costs.filter(x => ['房产税', '土地使用税'].includes(x.label));
  const dailyCosts = result.costs.filter(x => !['房产税', '土地使用税'].includes(x.label));
  const dailyTotal = dailyCosts.reduce((sum, x) => sum + x.value, 0);
  const taxTotal = result.vat + result.surtax + result.stamp + holdingTaxes.reduce((sum, x) => sum + x.value, 0);
  return conciseExplanations({ type: 'operating', title: period + '经营测算报告', name: name || '未命名站点', time: date(result.time),
    metrics: [metric(period + '租金前经营收益', amount(result.annualEbitda), 'ebitda')],
    sections: [
      { title: '经营收支概览', rows: [row('销售额（含税）', amount(result.grossSales)), row('采购成本（含税）', amount(result.grossPurchase)),
        row('日常经营费用', amount(dailyTotal)), row('经营税费', amount(taxTotal)), row('租金前经营收益', amount(result.annualEbitda), true)] },
      { title: '日常经营费用明细', rows: dailyCosts.map(x => row(x.label, amount(x.value))) },
      { title: '经营税费明细（测算）', rows: [row('应交增值税额', amount(result.vat)), row('附加税费', amount(result.surtax)), row('印花税', amount(result.stamp)), ...holdingTaxes.map(x => row(x.label, amount(x.value)))] },
      { title: '销量与升油费用', rows: result.rows.reduce((list, x) => list.concat([
        row(x.name + '日均销量', x.daily + ' ' + x.unit), row(x.name + '期间销量', (x.tons * factor).toFixed(2) + ' 吨'),
        unitCostRow(x)]), []) }
    ], notes: [glossary.operatingSummary,
      '采购与销售均按含税、带票口径填写，经营税费由程序测算。采购成本按销售对应数量估算，不代表当期采购付款额；日常经营费用与经营税费的明细为汇总项目的展开，不重复扣除。',
      ...(result.vatCredit > 0 ? ['本次存在可留待后续抵扣的税款，经营收益包含这部分尚未变成现金的权益，不能直接用含税收支和本期应交税费相减来核对现金结余；不代表已收到退税。'] : []),
      '升油费用为共同日常经营费用、房产税、土地使用税、附加税及印花税的分摊，不包含采购成本、增值税、租金、折旧和融资；按吨销量与分摊系数分配，再换算成每升（液化天然气为每公斤）。',
      '按一般计税及采购税款符合抵扣条件估算，未模拟库存、期初留抵、抵扣时点及其他经营费用税款抵扣；税费以实际申报为准。参考毛利模式为估算，建议按实际采购价和售价填写。',
      glossary.scope[2], ...result.warnings, glossary.scope[8]],
    terms: glossary.forReport('operating', result.form.hasLng) });
}
function investment(result, source) {
  const averages = result.averages;
  const relevantIds = ['ebitda', 'irr', 'npv', 'pretax', 'net', 'project', 'equity', 'payback', 'discount', 'depreciation'];
  if (result.form.mode === 0) relevantIds.push('rent');
  if (result.form.mode === 1) relevantIds.push('prepay');
  if (result.form.mode === 4) relevantIds.push('longpay');
  if (result.form.mode === 2) relevantIds.push('sharing');
  if (result.form.mode === 3) relevantIds.push('cooperation');
  if (Number(result.form.loanAmount) > 0) relevantIds.push(result.form.repayment === 1 ? 'bullet' : 'annuity');
  return conciseExplanations({ type: 'investment', title: '投资回报测算报告', name: result.form.name || '未命名方案', time: date(result.time),
    metrics: [metric('年均净利润（项目整体）', money(averages.netProfit), 'average-net'),
      metric('项目年度净现金回笼（年均）', money(averages.projectCash), 'annual-project-cash'),
      metric('我方年度净现金回笼（年均）', money(averages.shareholderCash), 'annual-equity-cash'),
      metric('项目全周期累计净现金收益', money(result.project.total), 'total-project-cash'),
      metric('我方全周期累计净现金收益', money(result.shareholder.total), 'total-equity-cash'),
      metric('项目静态回收期', result.initial ? payback(result.project.payback) : '初始投入为 0，不适用', 'payback'),
      metric('我方静态回收期', result.ownInitial ? payback(result.shareholder.payback) : '初始出资为 0，不适用', 'payback'),
      metric('项目 NPV（净现值）', money(result.project.npv), 'npv'),
      metric('我方股东 NPV（净现值）', money(result.shareholder.npv), 'npv'),
      metric('项目 IRR（内部收益率·年化）', percent(result.project.irr), 'irr'),
      metric('我方 IRR（内部收益率·年化）', percent(result.shareholder.irr), 'irr')],
    sections: [{ title: '基础数据与合同', rows: [
      row('经营基础来源', source ? source.name + ' · ' + date(source.createdAt) + ' · ' + (source.periodKey === 'month' ? '月均记录年化' : '年度记录') : '手动录入'),
      row('基准年度租金前经营 EBITDA（息税折旧摊销前利润）', money(Number(result.form.annualEbitda))),
      row('合作方式', result.modeName),
      row('经营/预测期', result.form.years + ' 年'), row('年折现率（期望年回报率）', result.form.discountRate + '%'), row('企业所得税测算率', result.form.incomeTaxRate + '%'),
      ...result.form.assets.map(a => row(a.name, money(Number(a.amount)) + ' · 折旧 ' + a.life + ' 年')),
      row('其他前期投入', money(Number(result.form.otherInitial))),
      row('流动资金（期初投入）', money(result.workingCapital || 0)), row('期末流动资金回收', money(result.workingCapitalRecovery || 0)),
      row('初始投入合计', money(result.initial)), row('其中首期预付租金', money(result.initialRent)),
      row('贷款金额', money(Number(result.form.loanAmount))), row('我方初始出资', money(result.ownInitial)),
      ...(result.form.mode < 2 || result.form.mode === 4 ? [row('首年租金成本', money(Number(result.form.rent))), row('租金年递增', result.form.rentGrowth + '%')] : []),
      ...(result.form.mode === 1 ? [row('租金支付安排', '每 ' + result.form.frequency + ' 个月预付；首期 ' + result.form.prepaidPeriods + ' 期')] : []),
      ...(result.form.mode === 4 ? [row('租金支付安排', '每 ' + result.form.paymentYears + ' 年期初预付，末期按剩余年数支付')] : []),
      ...(result.form.mode === 2 ? [row('业主动态租金比例', result.form.shareRate + '%'),
        row('租金（业主分红）·年均', money(result.averages.ownerRent)),
        row('租金（业主分红）·全期', money(result.rows.reduce((s, y) => s + y.ownerRent, 0))),
        ...(Number(result.form.loanAmount) > 0 ? [row('无融资口径业主租金·年均', money(result.averages.projectOwnerRent))] : [])] : []),
      ...(result.form.mode === 3 && result.form.cooperation === 1 ? [row('年度固定管理费', money(Number(result.form.managementFee)))] : []),
      ...(Number(result.form.loanAmount) > 0 ? [row('贷款年利率 / 期限', result.form.loanRate + '% / ' + result.form.loanYears + ' 年'), row('还款方式', result.form.repayment === 1 ? '按期还息 · 每月付息，到期还本' : '等额本息')] : [])
    ] }], annualTable: annualTable(result),
    notes: [...result.warnings, ...(result.project.irrReason ? ['项目 IRR：' + result.project.irrReason] : []), ...(result.shareholder.irrReason ? ['股东 IRR：' + result.shareholder.irrReason] : []),
      ...([1, 4].includes(result.form.mode) ? ['首期预付租金计入初始投入，不在第 1 年现金流重复扣除；后续预付在付款周期开始的年份列示，年度租金成本仍按当年应承担金额计算。内部收益率和净现值按实际付款时点计算。'] : []),
      glossary.scope[3], glossary.scope[4], glossary.scope[5], glossary.scope[6], glossary.scope[8]],
    terms: relevantIds.map(glossary.get) });
}
// One explanation block for both image variants and the page report.
// Detailed definitions remain available through the guide and metric help.
function conciseExplanations(report) {
  if (report.type === 'break-even') {
    // Update cached report labels too; retain the original results and user-entered name.
    const rename = text => text.replace(/会计盈亏平衡/g, '财务盈亏平衡').replace(/会计平衡/g, '财务平衡');
    return { ...report, metrics: report.metrics.map(m => ({ ...m, label: rename(m.label) })),
      notes: report.notes.map(rename), terms: report.terms.map(t => ({ ...t, title: rename(t.title) })) };
  }
  const isOperating = report.type === 'operating';
  const retiredJoint = !!report.retiredJoint || (report.sections || []).some(s => (s.rows || []).some(r => r.label === '我方权益比例' || r.label === '合作方初始出资'));
  return { ...report, ...(retiredJoint ? { retiredJoint: true } : {}),
    notes: [isOperating ? glossary.operatingSummary : retiredJoint ? '历史双方出资合作报告：原结果按原权益比例分配，未自动改为业主动态租金。该模式已取消，请恢复方案并重新选择模式后生成新报告。' : '净利润为项目整体；项目回报不含融资，我方股东回报包含融资影响。流动资金计入期初投入、期末全额收回，不计入利润。',
      ...(!isOperating && !retiredJoint ? [
        '年度净现金回笼为经营期内年均值：租金按归属年度扣除，不扣折旧；我方口径扣贷款本息；业主分红已作为动态租金扣除。不含期初投入及流动资金返还，不代表各年实际到账或可分红金额。',
        '全周期累计净现金收益已扣初始投入并计入期末回收；回收期、NPV 和 IRR 按实际收付时点计算，不用年均回笼替代。静态回收期为首次回本，之后仍可能因集中支出再次转负。'
      ] : []),
      '详细测算假设请查看小程序“测算口径与财务概念说明”；结果不替代财务报表、税务申报或正式投资决策。',
      ...new Set((report.notes || []).filter(n => /不代表已收到退税|请核实|IRR：|经营收入不足|^租金（业主分红）/.test(n)))],
    terms: (isOperating ? ['ebitda'] : ['irr', 'npv']).map(glossary.get) };
}
// Select already-formatted results; never recalculate or mutate the full report.
function brief(report) {
  if (report.type === 'break-even') return breakEvenReport.brief(report);
  const isOperating = report.type === 'operating';
  const sections = isOperating
    ? [{ title: '经营收支概览', rows: report.sections[0].rows.filter(r => r.label !== '租金前经营收益') }]
    : [{ title: '投资方案概览', rows: report.sections[0].rows.filter(r => ['合作方式', '经营/预测期', '初始投入合计', '流动资金（期初投入）', '我方初始出资', '年折现率（期望年回报率）', '业主动态租金比例', '租金（业主分红）·年均'].includes(r.label)) }];
  if (isOperating) sections.push({ title: '单位经营费用', rows: report.sections.flatMap(s => s.rows).filter(r => r.unitCost) });
  const explanation = conciseExplanations(report);
  return { type: report.type, variant: 'brief', title: report.title.replace('报告', '摘要'), name: report.name, time: report.time,
    metrics: report.metrics, sections, ...(explanation.retiredJoint ? { retiredJoint: true } : {}),
    notes: explanation.notes, terms: explanation.terms };
}
module.exports = { breakEven: breakEvenReport.build, operating, investment, brief, conciseExplanations };
