(function (window) {
  'use strict';

  const EXPENSE_CATEGORIES = Object.freeze(['飲食', '交通', '住宿', '購物', '門票', '其他']);

  const expenseCategoryIcons = Object.freeze({
    '飲食': '🍽️',
    '交通': '🚆',
    '住宿': '🏨',
    '購物': '🛍️',
    '門票': '🎟️',
    '其他': '🧾'
  });

  const getExpenseCategoryIcon = (category) => expenseCategoryIcons[category] || expenseCategoryIcons['其他'];

  const normalizeInvolved = (list) => {
    if (Array.isArray(list)) return list.filter(Boolean);
    if (typeof list === 'string') {
      return list.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  };

  const formatInvolved = (list) => {
    const arr = normalizeInvolved(list);
    return arr.length === 0 ? '全員' : arr.join(', ');
  };

  const normalizeExpenseRecord = (item) => ({
    ...item,
    amount: Number(item?.amount) || 0,
    day: item?.day ? parseInt(item.day, 10) || 1 : 1,
    involved: normalizeInvolved(item?.involved),
    category: item?.category || '其他',
    payer: item?.payer || ''
  });

  // 舊公帳資料保留在後端，但新版前端不再把公帳視為旅伴或一般分帳資料。
  const PUBLIC_ACCOUNT_NAME = '公帳';

  const normalizePersonName = (name) => String(name || '').trim();

  const normalizeSharedWalletPeople = (value) => {
    if (Array.isArray(value)) {
      return Array.from(new Set(value.map(normalizePersonName).filter(Boolean)));
    }
    const text = String(value || '').trim();
    if (!text) return [];
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return normalizeSharedWalletPeople(parsed);
      } catch (err) {}
    }
    return Array.from(new Set(text.split(',').map(normalizePersonName).filter(Boolean)));
  };

  const isSystemWalletPerson = (person) => {
    const name = normalizePersonName(typeof person === 'string' ? person : person?.name);
    const role = String(person?.role || '').trim().toLowerCase();
    const type = String(person?.type || '').trim().toLowerCase();
    return name === PUBLIC_ACCOUNT_NAME || role === 'public_wallet' || type === 'wallet';
  };

  const filterActualPeople = (items) => (Array.isArray(items) ? items : []).filter(person => !isSystemWalletPerson(person));

  const isLegacyPublicAccountExpense = (expense) => {
    const payer = normalizePersonName(expense?.payer);
    const involved = normalizeInvolved(expense?.involved).map(normalizePersonName);
    const category = String(expense?.category || '').trim();
    const title = String(expense?.title || '').trim();
    return payer === PUBLIC_ACCOUNT_NAME
      || involved.includes(PUBLIC_ACCOUNT_NAME)
      || category.includes('公帳')
      || category.includes('公費')
      || title === '存入公費';
  };

  const parseBooleanFlag = (value) => value === true || value === 1 || ['1', 'true', 'yes', 'on', 'v'].includes(String(value || '').trim().toLowerCase());

  const normalizeSharedWalletTransaction = (item) => ({
    ...item,
    id: String(item?.id || ''),
    trip_id: String(item?.trip_id || item?.tripId || ''),
    type: String(item?.type || '').trim().toLowerCase(),
    date: String(item?.date || '').slice(0, 10),
    title: String(item?.title || '').trim(),
    person: normalizeSharedWalletPeople(item?.person).join(','),
    amount: Number(item?.amount) || 0,
    category: String(item?.category || '其他').trim() || '其他',
    note: String(item?.note || '').trim()
  });

  const formatSharedWalletUsers = (item) => {
    const selected = normalizeSharedWalletPeople(item?.person);
    return selected.length ? `${selected.join('、')}使用` : '所有人分攤';
  };

  const expenseCreatedTime = (expense) => {
    const fromId = parseInt(String(expense?.id || '').split('_')[0], 10);
    if (Number.isFinite(fromId)) return fromId;
    const fromDate = Date.parse(expense?.created_at || expense?.updated_at || '');
    return Number.isFinite(fromDate) ? fromDate : 0;
  };

  /**
   * 從每個人的淨額算出實際轉帳清單。
   *
   * balanceSheet 只回答「誰多付了多少」，但旅程結束時真正要做的是轉帳。
   * 這裡用貪婪配對：每次拿欠最多的人去還給被欠最多的人，兩者取較小值結清一邊。
   * 每一輪至少有一個人歸零，所以 N 個人最多 N-1 筆轉帳。
   *
   * 金額以「元」為單位四捨五入，並用 0.5 元作為忽略門檻，
   * 避免分攤除不盡時跑出 0.0001 這種毫無意義的轉帳。
   */
  const buildSettlementPlan = (balances) => {
    const EPSILON = 0.5;

    const debtors = [];
    const creditors = [];
    (Array.isArray(balances) ? balances : []).forEach((entry) => {
      const name = normalizePersonName(entry?.name);
      const balance = Number(entry?.balance) || 0;
      if (!name) return;
      if (balance < -EPSILON) debtors.push({ name, amount: -balance });
      else if (balance > EPSILON) creditors.push({ name, amount: balance });
    });

    // 由大到小配對，讓大額先被消化，轉帳筆數比隨機順序少。
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const plan = [];
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const pay = Math.min(debtors[i].amount, creditors[j].amount);
      if (pay > EPSILON) {
        plan.push({ from: debtors[i].name, to: creditors[j].name, amount: Math.round(pay) });
      }
      debtors[i].amount -= pay;
      creditors[j].amount -= pay;
      if (debtors[i].amount <= EPSILON) i++;
      if (creditors[j].amount <= EPSILON) j++;
    }

    return plan.filter((item) => item.amount > 0);
  };

  window.TravelExpenses = Object.freeze({
    buildSettlementPlan,
    EXPENSE_CATEGORIES,
    PUBLIC_ACCOUNT_NAME,
    expenseCategoryIcons,
    getExpenseCategoryIcon,
    normalizeInvolved,
    formatInvolved,
    normalizeExpenseRecord,
    normalizePersonName,
    normalizeSharedWalletPeople,
    isSystemWalletPerson,
    filterActualPeople,
    isLegacyPublicAccountExpense,
    parseBooleanFlag,
    normalizeSharedWalletTransaction,
    formatSharedWalletUsers,
    expenseCreatedTime
  });
})(window);
