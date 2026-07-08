(function (window) {
  'use strict';

  const normalizeInvolved = (list) => {
    if (Array.isArray(list)) return list.filter(Boolean);
    if (typeof list === 'string') {
      return list.split(',').map((value) => value.trim()).filter(Boolean);
    }
    return [];
  };

  const normalizeExpenseRecord = (item) => ({
    ...item,
    amount: Number(item?.amount) || 0,
    day: item?.day ? parseInt(item.day, 10) || 1 : 1,
    involved: normalizeInvolved(item?.involved),
    category: item?.category || '其他',
    payer: item?.payer || ''
  });

  const normalizePersonName = (name) => String(name || '').trim();

  const isPublicAccountFund = (expense, publicAccountName = '公帳') => {
    const involved = normalizeInvolved(expense?.involved).map(normalizePersonName);
    return involved.includes(publicAccountName);
  };

  const expenseCreatedTime = (expense) => {
    const fromId = parseInt(String(expense?.id || '').split('_')[0], 10);
    if (Number.isFinite(fromId)) return fromId;
    const fromDate = Date.parse(expense?.created_at || expense?.updated_at || '');
    return Number.isFinite(fromDate) ? fromDate : 0;
  };

  const formatInvolved = (list, emptyLabel = '未指定') => {
    const arr = normalizeInvolved(list);
    return arr.length === 0 ? emptyLabel : arr.join(', ');
  };

  window.TravelExpenses = Object.freeze({
    normalizeInvolved,
    normalizeExpenseRecord,
    normalizePersonName,
    isPublicAccountFund,
    expenseCreatedTime,
    formatInvolved
  });
})(window);
