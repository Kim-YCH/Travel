(function (window) {
  'use strict';

  const normalizeName = value => String(value || '').trim();

  const normalizeCurrency = value => (
    String(value || '').trim().toUpperCase() === 'FOREIGN' ? 'FOREIGN' : 'TWD'
  );

  const normalizePeople = value => {
    let source = value;
    if (!Array.isArray(source)) {
      const text = String(source || '').trim();
      if (!text) return [];
      if (text.startsWith('[')) {
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) source = parsed;
        } catch (_) {}
      }
      if (!Array.isArray(source)) source = text.split(',');
    }
    return Array.from(new Set(source.map(normalizeName).filter(Boolean)));
  };

  const tripMemberNames = people => Array.from(new Set(
    (Array.isArray(people) ? people : [])
      .map(person => normalizeName(typeof person === 'string' ? person : person?.name))
      .filter(Boolean)
  ));

  const persistedLedgerPeople = people => (Array.isArray(people) ? people : [])
    .filter(person => (
      person
      && String(person.id || '').trim()
      && String(person.id || '').trim() !== 'default'
      && person.is_placeholder !== true
    ));

  const applyManualEntryRollback = (entries, rollback) => {
    const next = (Array.isArray(entries) ? entries : []).map(item => ({ ...item }));
    const action = String(rollback?.action || '');
    const id = String(rollback?.id || rollback?.entry?.id || '');
    if (!id) return next;

    if (action === 'remove') {
      return next.filter(item => String(item?.id || '') !== id);
    }

    if (action === 'replace') {
      const index = next.findIndex(item => String(item?.id || '') === id);
      const entry = rollback?.entry ? { ...rollback.entry } : null;
      if (!entry) return next;
      if (index === -1) next.push(entry);
      else next.splice(index, 1, entry);
      return next;
    }

    if (action === 'insert' && rollback?.entry) {
      if (next.some(item => String(item?.id || '') === id)) return next;
      const index = Math.max(0, Math.min(next.length, Number(rollback.index) || 0));
      next.splice(index, 0, { ...rollback.entry });
    }
    return next;
  };

  const parseMutationData = payload => {
    if (payload?.data && typeof payload.data === 'object') return { ...payload.data };
    if (typeof payload?.data !== 'string') return {};
    try {
      const parsed = JSON.parse(payload.data);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  };

  const isManualEntryMutation = payload => (
    String(payload?.type || '') === 'personal_ledger'
    && ['add', 'edit', 'del'].includes(String(payload?.action || ''))
  );

  const applyManualEntryMutation = (entries, payload) => {
    const next = (Array.isArray(entries) ? entries : []).map(item => ({ ...item }));
    if (!isManualEntryMutation(payload)) return next;
    const data = parseMutationData(payload);
    const id = String(data.id || payload?.id || '');
    if (!id) return next;
    if (payload.action === 'del') {
      return next.filter(item => String(item?.id || '') !== id);
    }
    const entry = { ...data, id };
    const index = next.findIndex(item => String(item?.id || '') === id);
    if (index === -1) next.push(entry);
    else next.splice(index, 1, entry);
    return next;
  };

  const createManualEntryRollback = (entries, payload) => {
    if (!isManualEntryMutation(payload)) return null;
    const data = parseMutationData(payload);
    const id = String(data.id || payload?.id || '');
    if (!id) return null;
    const source = Array.isArray(entries) ? entries : [];
    const index = source.findIndex(item => String(item?.id || '') === id);
    if (payload.action === 'add') return { action: 'remove', id };
    if (payload.action === 'edit') {
      return index === -1
        ? { action: 'remove', id }
        : { action: 'replace', entry: { ...source[index] } };
    }
    return index === -1
      ? null
      : { action: 'insert', entry: { ...source[index] }, index };
  };

  const rebaseManualEntryJobs = (entries, jobs, rejectedJobIds = []) => {
    const sourceJobs = Array.isArray(jobs) ? jobs : [];
    const rejected = new Set((Array.isArray(rejectedJobIds) ? rejectedJobIds : []).map(String));
    let next = (Array.isArray(entries) ? entries : []).map(item => ({ ...item }));

    sourceJobs.slice().reverse().forEach(job => {
      if (isManualEntryMutation(job?.payload)) {
        next = applyManualEntryRollback(next, job?.rollback);
      }
    });

    const rollbacks = {};
    sourceJobs.forEach(job => {
      if (!isManualEntryMutation(job?.payload) || rejected.has(String(job?.id || ''))) return;
      const rollback = createManualEntryRollback(next, job.payload);
      if (rollback && job?.id) rollbacks[String(job.id)] = rollback;
      next = applyManualEntryMutation(next, job.payload);
    });
    return { entries: next, rollbacks };
  };

  const formatTaiwanDate = value => {
    if (!value) return '';
    const direct = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
    if (direct && !String(value).includes('T')) return `${direct[1]}-${direct[2]}-${direct[3]}`;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return direct ? `${direct[1]}-${direct[2]}-${direct[3]}` : '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(parsed);
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  };

  const recordDate = (record, fallback = '') => {
    const explicit = formatTaiwanDate(fallback || record?.date || record?.created_at || record?.updated_at);
    if (explicit) return explicit;
    const timestamp = Number(String(record?.id || '').split('_')[0]);
    if (Number.isFinite(timestamp) && timestamp >= 1000000000000 && timestamp <= 9999999999999) {
      return formatTaiwanDate(timestamp);
    }
    return '';
  };

  const normalizeManualEntry = item => ({
    ...item,
    id: String(item?.id || ''),
    trip_id: String(item?.trip_id || ''),
    owner: normalizeName(item?.owner),
    date: recordDate(item, item?.date),
    title: String(item?.title || '').trim(),
    amount: Number(item?.amount) || 0,
    currency: normalizeCurrency(item?.currency),
    category: String(item?.category || '其他').trim() || '其他',
    note: String(item?.note || '').trim(),
    source: 'manual',
    sourceLabel: '記帳',
    sourceId: String(item?.id || ''),
    readOnly: false,
    created_at: String(item?.created_at || ''),
    updated_at: String(item?.updated_at || '')
  });

  const validParticipants = (rawValue, allMembers) => {
    const requested = normalizePeople(rawValue);
    if (!requested.length) return allMembers.slice();
    return requested.filter(name => allMembers.includes(name));
  };

  const derivedEntry = (source, item, owner, participants, index) => {
    const amount = Number(item?.amount) || 0;
    if (amount <= 0 || !participants.includes(owner) || !participants.length) return null;
    const sourceId = String(item?.id || `${source}-${index}`);
    return {
      id: `${source}:${sourceId}:${owner}`,
      owner,
      date: recordDate(item, source === 'wallet' ? item?.date : ''),
      title: String(item?.title || (source === 'wallet' ? '公帳支出' : '分帳項目')).trim(),
      amount: amount / participants.length,
      currency: normalizeCurrency(item?.currency),
      category: String(item?.category || '其他').trim() || '其他',
      note: String(item?.note || '').trim(),
      source,
      sourceLabel: '分帳',
      sourceId,
      readOnly: true,
      created_at: String(item?.created_at || ''),
      updated_at: String(item?.updated_at || '')
    };
  };

  const buildPersonalLedgerEntries = input => {
    const owner = normalizeName(input?.owner);
    const members = tripMemberNames(input?.people);
    if (!owner || !members.includes(owner)) return [];

    const entries = [];
    (Array.isArray(input?.expenses) ? input.expenses : []).forEach((item, index) => {
      const entry = derivedEntry('split', item, owner, validParticipants(item?.involved, members), index);
      if (entry) entries.push(entry);
    });

    (Array.isArray(input?.walletTransactions) ? input.walletTransactions : []).forEach((item, index) => {
      if (String(item?.type || '').trim().toLowerCase() !== 'payment') return;
      const participants = validParticipants(item?.persons ?? item?.person, members);
      const entry = derivedEntry('wallet', item, owner, participants, index);
      if (entry) entries.push(entry);
    });

    (Array.isArray(input?.manualEntries) ? input.manualEntries : [])
      .map(normalizeManualEntry)
      .filter(item => item.id && item.owner === owner && item.amount > 0)
      .forEach(item => entries.push(item));

    return entries.sort((a, b) => (
      String(b.date || '').localeCompare(String(a.date || ''))
      || String(b.created_at || b.updated_at || '').localeCompare(String(a.created_at || a.updated_at || ''))
      || String(b.id || '').localeCompare(String(a.id || ''))
    ));
  };

  const hashTripIdentity = value => {
    const text = String(value || '');
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(index);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  };

  const personalLedgerOwnerKey = tripId => `travel_personal_ledger_owner_${hashTripIdentity(tripId)}`;
  const prepOwnerKey = tripId => `travel_prep_owner_${hashTripIdentity(tripId)}`;

  const resolveSelectedOwner = input => {
    const names = tripMemberNames(input?.people);
    if (!names.length) return '';
    const stored = normalizeName(input?.storedOwner);
    if (names.includes(stored)) return stored;
    const prep = normalizeName(input?.prepOwner);
    if (names.includes(prep)) return prep;
    return names[0];
  };

  window.TravelPersonalLedger = Object.freeze({
    normalizeManualEntry,
    applyManualEntryRollback,
    applyManualEntryMutation,
    createManualEntryRollback,
    rebaseManualEntryJobs,
    persistedLedgerPeople,
    buildPersonalLedgerEntries,
    hashTripIdentity,
    personalLedgerOwnerKey,
    prepOwnerKey,
    resolveSelectedOwner
  });
})(window);
