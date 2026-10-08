    // ===================== DATA MODEL =====================
    const DEFAULT_YEAR = 2026;
    // v3: Bint Mariam & Rachel Wanjala — fees start at 0; user enters all figures
    const STORAGE_KEY = 'fee_recordings_v3';

    const DEFAULT_CHILDREN = [
      {
        id: 'bint',
        name: 'Bint Mariam',
        school: 'Rasual Al Amin Preparatory School',
        class: 'Grade 3',
        fees: {
          2026: { yearly: 0, term1: 0, term2: 0, term3: 0 }
        }
      },
      {
        id: 'rachel',
        name: 'Rachel Wanjala',
        school: 'Rasual Al Amin Preparatory School',
        class: 'Playgroup',
        fees: {
          2026: { yearly: 0, term1: 0, term2: 0, term3: 0 }
        }
      }
    ];

    // Term calendar (approximate for 2026)
    const TERM_DATES = {
      1: { start: '2026-01-06', end: '2026-03-15', months: [1,2,3], dueDays: [7,7,7] },
      2: { start: '2026-05-15', end: '2026-07-15', months: [5,6,7], dueDays: [7,7,7] },
      3: { start: '2026-08-15', end: '2026-10-15', months: [8,9,10], dueDays: [7,7,7] }
    };

    let state = {
      year: DEFAULT_YEAR,
      children: [],
      payments: [], // { id, childId, amount, date, method, ref, allocate, notes, receiptBase64, createdAt }
      arrears: {}   // { childId: { [year]: amount } }
    };

    // Tracks which payment is being edited (null = new payment)
    let editingPaymentId = null;
    // Remember which child tab is open across re-renders
    let activeChildTabId = null;

    // ===================== UTILITIES =====================
    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
    function formatKES(n) {
      return 'KES ' + Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 });
    }
    function todayISO() {
      const d = new Date();
      return d.toISOString().slice(0,10);
    }
    function parseDate(s) { return new Date(s + 'T00:00:00'); }
    function daysBetween(d1, d2) {
      return Math.floor((parseDate(d2) - parseDate(d1)) / 86400000);
    }

    function getCurrentTerm(year = state.year) {
      const today = new Date();
      const y = today.getFullYear();
      if (y < year) return 1;
      if (y > year) return 3;
      const m = today.getMonth() + 1;
      if (m <= 3) return 1;
      if (m <= 7) return 2;
      return 3;
    }

    function getTermDueDate(year, term, instalment = 1) {
      // instalment 1,2,3 within term
      const td = TERM_DATES[term];
      if (!td) return null;
      const month = td.months[instalment - 1];
      const day = td.dueDays[instalment - 1] || 7;
      return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }

    // ===================== PERSISTENCE =====================
    function loadState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          state = JSON.parse(raw);
          // Ensure defaults exist
          if (!state.children || state.children.length === 0) {
            state.children = JSON.parse(JSON.stringify(DEFAULT_CHILDREN));
          }
          if (!state.payments) state.payments = [];
          if (!state.arrears) state.arrears = {};
          if (!state.year) state.year = DEFAULT_YEAR;
        } else {
          state.children = JSON.parse(JSON.stringify(DEFAULT_CHILDREN));
          state.payments = [];
          state.arrears = {};
          state.year = DEFAULT_YEAR;
          saveState();
        }
      } catch (e) {
        console.error(e);
        state.children = JSON.parse(JSON.stringify(DEFAULT_CHILDREN));
        state.payments = [];
        state.arrears = {};
        state.year = DEFAULT_YEAR;
      }
    }

    function saveState() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    // ===================== CALCULATIONS =====================
    function getChildFees(childId, year) {
      const child = state.children.find(c => c.id === childId);
      if (!child) return { yearly:0, term1:0, term2:0, term3:0 };
      return child.fees[year] || { yearly:0, term1:0, term2:0, term3:0 };
    }

    function getArrears(childId, year) {
      return (state.arrears[childId] && state.arrears[childId][year]) || 0;
    }

    function getPaymentsFor(childId, year, term = null) {
      return state.payments.filter(p => {
        if (p.childId !== childId) return false;
        const py = parseInt(p.date.slice(0,4), 10);
        if (py !== year && p.allocate !== 'arrears') return false;
        if (term === null) return true;
        if (p.allocate === 'arrears') return false;
        if (p.allocate === 'current') {
          return getCurrentTerm(year) === term;
        }
        return p.allocate === `term${term}`;
      });
    }

    function sumPayments(payments) {
      return payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    }

    function getChildSummary(childId, year) {
      const fees = getChildFees(childId, year);
      const arrears = getArrears(childId, year);
      const allPays = state.payments.filter(p => p.childId === childId && (parseInt(p.date.slice(0,4)) === year || p.allocate === 'arrears'));
      const paidTotal = sumPayments(allPays);

      // Explicit allocation first (respects user choice of term / arrears / current)
      let arrearsCleared = 0;
      const termCleared = [0, 0, 0];
      const currentTerm = getCurrentTerm(year);

      allPays.forEach(p => {
        const amt = Number(p.amount || 0);
        if (p.allocate === 'arrears') {
          arrearsCleared += amt;
        } else if (p.allocate === 'current') {
          termCleared[currentTerm - 1] += amt;
        } else if (p.allocate === 'term1') {
          termCleared[0] += amt;
        } else if (p.allocate === 'term2') {
          termCleared[1] += amt;
        } else if (p.allocate === 'term3') {
          termCleared[2] += amt;
        } else {
          // Fallback: put into current term
          termCleared[currentTerm - 1] += amt;
        }
      });

      // Cap cleared amounts at the actual dues
      arrearsCleared = Math.min(arrears, arrearsCleared);
      termCleared[0] = Math.min(fees.term1, termCleared[0]);
      termCleared[1] = Math.min(fees.term2, termCleared[1]);
      termCleared[2] = Math.min(fees.term3, termCleared[2]);

      const totalDue = arrears + fees.yearly;
      const balance = Math.max(0, totalDue - paidTotal);
      const pct = totalDue > 0 ? Math.min(100, Math.round((paidTotal / totalDue) * 100)) : 100;

      try {
        const ledgers = getYearTermLedgers(childId, year);
        const ledgerPaid = ledgers.terms.reduce((s, t) => s + t.totalPaid, 0);
        const openArr = Math.max(0, ledgers.openingArrears);
        const yearFees = (fees.term1 || 0) + (fees.term2 || 0) + (fees.term3 || 0);
        const totalObligation = openArr + yearFees;
        return {
          fees,
          arrears: openArr,
          paidTotal: ledgerPaid,
          balance: Math.max(0, ledgers.terms[2].balance),
          pct: totalObligation > 0 ? Math.min(100, Math.round((ledgerPaid / totalObligation) * 100)) : 100,
          termDue: [fees.term1, fees.term2, fees.term3],
          termPaid: ledgers.terms.map(t => t.totalPaid),
          arrearsCleared: Math.min(openArr, ledgers.terms[0].totalPaid)
        };
      } catch (e) {
        return {
          fees, arrears, paidTotal, balance, pct,
          termDue: [fees.term1, fees.term2, fees.term3],
          termPaid: termCleared,
          arrearsCleared
        };
      }
    }

    /** Payments that belong to a given term for a child/year */
    function getTermPayments(childId, year, term) {
      const currentTerm = getCurrentTerm(year);
      return state.payments
        .filter(p => {
          if (p.childId !== childId) return false;
          const py = parseInt(p.date.slice(0, 4), 10);
          // Arrears-only payments count under Term 1 of the year they clear
          if (p.allocate === 'arrears') {
            return term === 1 && (py === year || !py);
          }
          if (py !== year) return false;
          if (p.allocate === `term${term}`) return true;
          if (p.allocate === 'current' && currentTerm === term) return true;
          return false;
        })
        .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    }

    /**
     * Opening arrears for a year (may be negative = credit):
     * - Manual value in state.arrears[childId][year] if set
     * - Else for year > base: previous year Term 3 raw balance (positive arrears or negative credit)
     * - Else 0
     */
    function getYearOpeningArrears(childId, year) {
      if (state.arrears[childId]) {
        if (Object.prototype.hasOwnProperty.call(state.arrears[childId], year)) {
          return Number(state.arrears[childId][year]) || 0;
        }
        if (Object.prototype.hasOwnProperty.call(state.arrears[childId], String(year))) {
          return Number(state.arrears[childId][String(year)]) || 0;
        }
      }
      if (year > DEFAULT_YEAR) {
        const prev = getYearTermLedgers(childId, year - 1);
        // Carry raw close balance: positive = arrears, negative = credit
        return prev.terms[2].rawBalance;
      }
      return 0;
    }

    /**
     * Build Term 1–3 ledgers for a child and year.
     * Positive close balance → arrears b/d next term.
     * Overpayment: displayed balance = 0; excess credit reduces next term total.
     */
    function getYearTermLedgers(childId, year) {
      const fees = getChildFees(childId, year);
      const opening = getYearOpeningArrears(childId, year);
      const termFees = [fees.term1 || 0, fees.term2 || 0, fees.term3 || 0];
      const terms = [];
      let creditFromPrev = 0;

      for (let t = 1; t <= 3; t++) {
        let arrearsBd = 0;
        let credit = 0;

        if (t === 1) {
          if (opening >= 0) {
            arrearsBd = opening;
            credit = 0;
          } else {
            arrearsBd = 0;
            credit = -opening; // opening credit into Term 1
          }
        } else {
          arrearsBd = Math.max(0, terms[t - 2].rawBalance);
          credit = creditFromPrev;
        }

        const feePayable = termFees[t - 1];
        const totalPayable = Math.max(0, arrearsBd + feePayable - credit);
        const payments = getTermPayments(childId, year, t);
        const totalPaid = sumPayments(payments);
        const rawBalance = totalPayable - totalPaid; // negative if overpaid
        const displayBalance = Math.max(0, rawBalance); // show 0 when excess
        creditFromPrev = rawBalance < 0 ? -rawBalance : 0;

        terms.push({
          term: t,
          arrearsBd,
          feePayable,
          credit,
          totalPayable,
          payments,
          totalPaid,
          rawBalance,
          balance: displayBalance,
          label: `Term ${t}`
        });
      }

      return { year, openingArrears: opening, fees, terms };
    }

    function getOverdueInfo(childId, year) {
      const currentTerm = getCurrentTerm(year);
      const fees = getChildFees(childId, year);
      const summary = getChildSummary(childId, year);
      const today = todayISO();
      let oldestOverdueDays = 0;
      let overdueAmount = 0;

      // Check monthly instalments for current and past terms
      for (let t = 1; t <= currentTerm; t++) {
        const termDue = [fees.term1, fees.term2, fees.term3][t-1];
        const instalment = termDue / 3;
        for (let i = 1; i <= 3; i++) {
          const dueDate = getTermDueDate(year, t, i);
          if (!dueDate || dueDate > today) continue;
          // Rough check: if cumulative paid for term is less than instalments due
          const paidForTerm = summary.termPaid[t-1];
          const expectedByNow = instalment * i;
          if (paidForTerm < expectedByNow - 1) {
            const days = daysBetween(dueDate, today);
            if (days > oldestOverdueDays) oldestOverdueDays = days;
            overdueAmount += Math.max(0, expectedByNow - paidForTerm);
          }
        }
      }
      // Also arrears
      if (summary.arrears > summary.arrearsCleared) {
        oldestOverdueDays = Math.max(oldestOverdueDays, 60);
        overdueAmount += (summary.arrears - summary.arrearsCleared);
      }

      let ageing = 'Current';
      if (oldestOverdueDays > 60) ageing = '61+ days';
      else if (oldestOverdueDays > 30) ageing = '31–60 days';
      else if (oldestOverdueDays > 0) ageing = '0–30 days';

      return { oldestOverdueDays, overdueAmount, ageing };
    }

    // ===================== ARREARS HELPERS =====================
    // Opening arrears is a user-set figure. Payments allocated to "arrears"
    // clear it via calculation only — they no longer mutate the stored amount.
    function setOpeningArrears(childId, year, amount) {
      if (!state.arrears[childId]) state.arrears[childId] = {};
      // Allow negative = credit brought forward
      state.arrears[childId][year] = Number(amount) || 0;
    }

    function setChildFees(childId, year, fees) {
      const child = state.children.find(c => c.id === childId);
      if (!child) return;
      if (!child.fees[year]) child.fees[year] = { yearly: 0, term1: 0, term2: 0, term3: 0 };
      const f = child.fees[year];
      if (fees.yearly !== undefined) f.yearly = Math.max(0, Number(fees.yearly) || 0);
      if (fees.term1 !== undefined) f.term1 = Math.max(0, Number(fees.term1) || 0);
      if (fees.term2 !== undefined) f.term2 = Math.max(0, Number(fees.term2) || 0);
      if (fees.term3 !== undefined) f.term3 = Math.max(0, Number(fees.term3) || 0);
    }

    // No-ops kept so older call sites remain safe (payments do not change opening arrears)
    function reverseArrearsEffect() { /* opening arrears is independent of payments */ }
    function applyArrearsEffect() { /* opening arrears is independent of payments */ }

    // One-time migration: restore opening arrears if older builds reduced the stored figure on payment
    function migrateOpeningArrears() {
      if (state._arrearsMigrated) return;
      state.children.forEach(c => {
        const yearKeys = Object.keys(state.arrears[c.id] || {}).map(Number);
        const payYears = state.payments
          .filter(p => p.childId === c.id)
          .map(p => parseInt(p.date.slice(0, 4), 10))
          .filter(Boolean);
        const years = new Set([state.year, ...yearKeys, ...payYears]);
        years.forEach(yr => {
          if (!yr) return;
          const stored = getArrears(c.id, yr);
          const paidToArrears = state.payments
            .filter(p => p.childId === c.id && p.allocate === 'arrears' && parseInt(p.date.slice(0, 4), 10) === yr)
            .reduce((s, p) => s + Number(p.amount || 0), 0);
          if (paidToArrears > 0) {
            setOpeningArrears(c.id, yr, stored + paidToArrears);
          }
        });
      });
      state._arrearsMigrated = true;
      saveState();
    }

    // ===================== RENDER =====================
    function renderAll() {
      document.getElementById('todayDate').textContent = new Date().toLocaleDateString('en-KE', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
      });
      const ct = getCurrentTerm();
      document.getElementById('currentTermLabel').textContent = `Term ${ct} ${state.year}`;

      // Year selector
      const ys = document.getElementById('yearSelect');
      ys.innerHTML = '';
      for (let y = state.year - 2; y <= state.year + 2; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === state.year) opt.selected = true;
        ys.appendChild(opt);
      }

      renderFamilySummary();
      renderChildCards();
      renderDetailTabs();
      populatePaymentForm();
    }

    function renderFamilySummary() {
      let totalDue = 0, totalPaid = 0, totalBalance = 0, totalArrears = 0;
      state.children.forEach(c => {
        const s = getChildSummary(c.id, state.year);
        totalDue += s.fees.yearly + s.arrears;
        totalPaid += s.paidTotal;
        totalBalance += s.balance;
        totalArrears += Math.max(0, s.arrears - s.arrearsCleared);
      });
      const pct = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 100;

      document.getElementById('familySummary').innerHTML = `
        <div class="summary-card clickable" onclick="showSummaryDetail('due')" title="Click for breakdown">
          <h3>Total Due (${state.year})</h3>
          <div class="value">${formatKES(totalDue)}</div>
          <div class="sub">Including arrears · Tap for details</div>
        </div>
        <div class="summary-card success clickable" onclick="showSummaryDetail('paid')" title="Click for breakdown">
          <h3>Total Paid</h3>
          <div class="value">${formatKES(totalPaid)}</div>
          <div class="sub">${pct}% of annual obligation · Tap for details</div>
        </div>
        <div class="summary-card ${totalBalance > 0 ? 'danger' : 'success'} clickable" onclick="showSummaryDetail('balance')" title="Click for breakdown">
          <h3>Outstanding Balance</h3>
          <div class="value">${formatKES(totalBalance)}</div>
          <div class="sub">${totalBalance === 0 ? 'All clear' : 'Across all children'} · Tap for details</div>
        </div>
        <div class="summary-card warning clickable" onclick="showSummaryDetail('arrears')" title="Click for breakdown">
          <h3>Open Arrears</h3>
          <div class="value">${formatKES(totalArrears)}</div>
          <div class="sub">Carried forward · Tap for details</div>
        </div>
      `;
    }

    function showSummaryDetail(type) {
      const titles = {
        due: 'Total Due — Breakdown',
        paid: 'Total Paid — Breakdown',
        balance: 'Outstanding Balance — Breakdown',
        arrears: 'Open Arrears — Breakdown'
      };
      document.getElementById('detailTitle').textContent = titles[type] || 'Summary Detail';

      let rows = '';
      let grand = 0;

      state.children.forEach(c => {
        const s = getChildSummary(c.id, state.year);
        let val = 0;
        let extra = '';
        if (type === 'due') {
          val = s.fees.yearly + s.arrears;
          extra = `Yearly ${formatKES(s.fees.yearly)} + Arrears ${formatKES(s.arrears)}`;
        } else if (type === 'paid') {
          val = s.paidTotal;
          const pays = state.payments.filter(p => p.childId === c.id && (parseInt(p.date.slice(0,4)) === state.year || p.allocate === 'arrears'));
          extra = `${pays.length} payment${pays.length === 1 ? '' : 's'}`;
        } else if (type === 'balance') {
          val = s.balance;
          extra = s.balance === 0 ? 'Fully paid' : 'Remaining';
        } else if (type === 'arrears') {
          val = Math.max(0, s.arrears - s.arrearsCleared);
          extra = `Original ${formatKES(s.arrears)} · Cleared ${formatKES(s.arrearsCleared)}`;
        }
        grand += val;
        rows += `
          <tr>
            <td><strong>${c.name}</strong><br><small style="color:var(--muted)">${c.school}</small></td>
            <td class="amount ${type === 'paid' ? 'paid' : (val > 0 && type !== 'due' ? 'due' : '')}">${formatKES(val)}</td>
            <td style="font-size:0.85rem;color:var(--muted)">${extra}</td>
          </tr>`;
      });

      // Optional deeper detail for "paid"
      let paymentList = '';
      if (type === 'paid') {
        const allPays = state.payments
          .filter(p => parseInt(p.date.slice(0,4)) === state.year || p.allocate === 'arrears')
          .sort((a,b) => b.date.localeCompare(a.date));
        if (allPays.length) {
          paymentList = `
            <h4 style="margin:1.25rem 0 0.5rem">Recent Payments</h4>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Child</th><th>Amount</th><th>Method</th><th>Allocated</th></tr></thead>
                <tbody>
                  ${allPays.slice(0, 15).map(p => {
                    const child = state.children.find(c => c.id === p.childId);
                    const alloc = p.allocate === 'arrears' ? 'Arrears' : p.allocate === 'current' ? 'Current Term' : (p.allocate || '').replace('term','Term ');
                    return `<tr>
                      <td>${p.date}</td>
                      <td>${child ? child.name.split(' ')[0] : p.childId}</td>
                      <td class="amount paid">${formatKES(p.amount)}</td>
                      <td>${p.method}</td>
                      <td>${alloc}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>`;
        }
      }

      document.getElementById('detailBody').innerHTML = `
        <p style="margin-bottom:1rem;color:var(--muted)">Year ${state.year} · Per-child breakdown</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Child</th><th>Amount</th><th>Detail</th></tr>
            </thead>
            <tbody>
              ${rows}
              <tr style="font-weight:700;background:#f7fafc">
                <td>Combined Total</td>
                <td class="amount">${formatKES(grand)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        ${paymentList}
      `;
      document.getElementById('detailModal').classList.add('open');
    }

    function renderChildCards() {
      const container = document.getElementById('childCards');
      const currentTerm = getCurrentTerm();
      container.innerHTML = state.children.map(child => {
        const s = getChildSummary(child.id, state.year);
        const od = getOverdueInfo(child.id, state.year);
        const termDue = s.termDue[currentTerm - 1];
        const termPaid = s.termPaid[currentTerm - 1];
        const termBal = Math.max(0, termDue - termPaid);
        const termPct = termDue > 0 ? Math.round((termPaid / termDue) * 100) : 100;

        let statusBadge = '<span class="badge badge-ok">Up to date</span>';
        if (s.balance > 0 && od.oldestOverdueDays > 0) {
          statusBadge = `<span class="badge badge-overdue">Overdue • ${od.ageing}</span>`;
        } else if (s.balance > 0) {
          statusBadge = '<span class="badge badge-partial">Balance remaining</span>';
        }
        if (s.arrears > s.arrearsCleared) {
          statusBadge += ' <span class="badge badge-arrears">Arrears</span>';
        }

        return `
          <div class="child-card">
            <div class="child-header">
              <div>
                <h2>${child.name}</h2>
                <div class="school">${child.school} • ${child.class}</div>
              </div>
              <div>${statusBadge}</div>
            </div>
            <div class="child-body">
              <div class="progress-wrap">
                <div class="progress-label">
                  <span>Year Progress</span>
                  <span>${s.pct}% • ${formatKES(s.paidTotal)} / ${formatKES(s.fees.yearly + s.arrears)}</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width:${s.pct}%"></div></div>
              </div>

              <div class="term-row">
                <span class="term-name">Arrears (brought forward)</span>
                <span class="amount ${s.arrears > s.arrearsCleared ? 'due' : 'paid'}">${formatKES(Math.max(0, s.arrears - s.arrearsCleared))}</span>
              </div>
              <div class="term-row">
                <span class="term-name">Term ${currentTerm} Due</span>
                <span class="amount">${formatKES(termDue)}</span>
              </div>
              <div class="term-row">
                <span class="term-name">Term ${currentTerm} Paid</span>
                <span class="amount paid">${formatKES(termPaid)}</span>
              </div>
              <div class="term-row">
                <span class="term-name">Term ${currentTerm} Balance</span>
                <span class="amount ${termBal > 0 ? 'due' : 'paid'}">${formatKES(termBal)}</span>
              </div>
              <div style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap">
                <button class="btn btn-sm btn-primary" onclick="openPaymentModal('${child.id}')">+ Payment</button>
                <button class="btn btn-sm btn-outline" onclick="openFeesArrearsEditor('${child.id}')">Edit Fees & Arrears</button>
                <button class="btn btn-sm btn-outline" onclick="showChildDetail('${child.id}')">Quick View</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function formatAllocate(alloc) {
      if (!alloc) return '—';
      if (alloc === 'arrears') return 'Arrears';
      if (alloc === 'current') return 'Current Term';
      if (alloc.startsWith('term')) return 'Term ' + alloc.replace('term', '');
      return alloc;
    }

    function renderTermPaymentSlots(childId, year, termLedger) {
      const pays = termLedger.payments;
      const minSlots = 3;
      const slotCount = Math.max(minSlots, pays.length);
      let html = '';

      for (let i = 0; i < slotCount; i++) {
        const letter = String.fromCharCode(97 + i); // a, b, c...
        const p = pays[i];
        if (p) {
          html += `
            <div class="ledger-pay-row filled">
              <div class="ledger-pay-label">${letter}. Payment ${i + 1}</div>
              <div class="ledger-pay-body">
                <div class="ledger-pay-main">
                  <span class="ledger-pay-meta"><strong>Date:</strong> ${p.date}</span>
                  <span class="amount paid">${formatKES(p.amount)}</span>
                  <span class="ledger-pay-meta"><strong>Allocation:</strong> ${formatAllocate(p.allocate)}</span>
                </div>
                <div class="ledger-pay-actions">
                  <button type="button" class="btn btn-sm btn-outline" onclick="editPayment('${p.id}')">Edit</button>
                  <button type="button" class="btn btn-sm btn-danger" onclick="deletePayment('${p.id}')">Delete</button>
                </div>
              </div>
            </div>`;
        } else {
          html += `
            <div class="ledger-pay-row empty-slot" onclick="openPaymentModal('${childId}', 'term${termLedger.term}')">
              <div class="ledger-pay-label">${letter}. Payment ${i + 1}</div>
              <div class="ledger-pay-body empty-body">
                <span class="empty-slot-text">Empty slot — tap to add payment</span>
              </div>
            </div>`;
        }
      }
      return html;
    }

    function renderTermBlock(childId, year, termLedger) {
      const t = termLedger.term;
      const arrearsLabel = t === 1
        ? `Arrears b/d from the previous year ${year - 1}`
        : `Arrears b/d from Term ${t - 1}`;
      const excess = termLedger.rawBalance < 0 ? -termLedger.rawBalance : 0;
      const balClass = termLedger.balance > 0 ? 'amount due' : 'amount paid';
      let balNote = 'Cleared';
      if (excess > 0) {
        balNote = `Balance shown as 0 · excess ${formatKES(excess)} credited to ${t < 3 ? 'Term ' + (t + 1) : 'Term 1 ' + (year + 1)}`;
      } else if (termLedger.balance > 0) {
        balNote = t < 3
          ? `Becomes arrears b/d for Term ${t + 1}`
          : `Becomes opening arrears for Term 1 ${year + 1}`;
      }

      // Term 1 opening input: show actual opening (may be negative credit)
      const openingInputVal = t === 1
        ? (termLedger.arrearsBd > 0 ? termLedger.arrearsBd : (termLedger.credit > 0 ? -termLedger.credit : 0))
        : termLedger.arrearsBd;

      return `
        <section class="term-ledger" id="term-${childId}-${t}">
          <div class="term-ledger-head">
            <h4>TERM ${t}</h4>
            <span class="term-year-tag">${year}</span>
          </div>

          <div class="ledger-line">
            <span class="ledger-roman">I.</span>
            <span class="ledger-desc">${arrearsLabel}${t === 1 ? ' <small>(use negative for credit b/d)</small>' : ''}</span>
            <span class="ledger-amt">
              ${t === 1 ? `
                <input type="number" step="1" class="ledger-input"
                  value="${openingInputVal}"
                  onchange="updateOpeningArrearsFromLedger('${childId}', ${year}, this.value)"
                  title="Opening arrears (positive) or credit (negative) for ${year}">
              ` : `<strong>${formatKES(termLedger.arrearsBd)}</strong>`}
            </span>
          </div>

          <div class="ledger-line">
            <span class="ledger-roman">II.</span>
            <span class="ledger-desc">Term ${t} Fee Payable</span>
            <span class="ledger-amt">
              <input type="number" min="0" step="1" class="ledger-input"
                value="${termLedger.feePayable}"
                onchange="updateTermFeeFromLedger('${childId}', ${year}, ${t}, this.value)"
                title="Enter Term ${t} fee">
            </span>
          </div>

          ${termLedger.credit > 0 ? `
          <div class="ledger-line credit-line">
            <span class="ledger-roman"></span>
            <span class="ledger-desc">Less: credit from previous term / year</span>
            <span class="ledger-amt amount paid">− ${formatKES(termLedger.credit)}</span>
          </div>` : ''}

          <div class="ledger-line total-line">
            <span class="ledger-roman">III.</span>
            <span class="ledger-desc">Total Fee Payable (I + II${termLedger.credit > 0 ? ' − credit' : ''})</span>
            <span class="ledger-amt"><strong>${formatKES(termLedger.totalPayable)}</strong></span>
          </div>

          <div class="ledger-payments">
            ${renderTermPaymentSlots(childId, year, termLedger)}
            <button type="button" class="btn btn-sm btn-outline btn-add-pay"
              onclick="openPaymentModal('${childId}', 'term${t}')">+ Add payment</button>
          </div>

          <div class="ledger-line total-line">
            <span class="ledger-roman">IV.</span>
            <span class="ledger-desc">TOTAL payments made for Term ${t}</span>
            <span class="ledger-amt amount paid"><strong>${formatKES(termLedger.totalPaid)}</strong></span>
          </div>

          <div class="ledger-line balance-line">
            <span class="ledger-roman">V.</span>
            <span class="ledger-desc">Balance at the close of Term ${t} <small>(${balNote})</small></span>
            <span class="ledger-amt ${balClass}"><strong>${formatKES(termLedger.balance)}</strong></span>
          </div>
        </section>`;
    }

    function renderDetailTabs() {
      const tabs = document.getElementById('childTabs');
      const panels = document.getElementById('detailPanels');

      if (!activeChildTabId || !state.children.some(c => c.id === activeChildTabId)) {
        activeChildTabId = state.children[0] ? state.children[0].id : null;
      }
      const activeChildId = activeChildTabId;
      const year = state.year;

      tabs.innerHTML = state.children.map((c) =>
        `<button type="button" class="tab ${c.id === activeChildId ? 'active' : ''}" onclick="switchTab('${c.id}')" data-child="${c.id}">${c.name.split(' ')[0]}</button>`
      ).join('');

      panels.innerHTML = state.children.map((child) => {
        const ledgers = getYearTermLedgers(child.id, year);
        const yearPaid = ledgers.terms.reduce((sum, t) => sum + t.totalPaid, 0);
        const yearClose = ledgers.terms[2].balance;
        const yearRaw = ledgers.terms[2].rawBalance;
        const termBlocks = ledgers.terms.map(tl => renderTermBlock(child.id, year, tl)).join('');

        const allPays = state.payments
          .filter(p => p.childId === child.id)
          .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));

        const historyRows = allPays.length ? allPays.map(p => `
          <tr>
            <td>${p.date}</td>
            <td class="amount paid">${formatKES(p.amount)}</td>
            <td>${formatAllocate(p.allocate)}</td>
            <td>${p.method || '—'}</td>
            <td>${p.ref || '—'}</td>
            <td class="actions-cell">
              <button type="button" class="btn btn-sm btn-outline" onclick="editPayment('${p.id}')">Edit</button>
              <button type="button" class="btn btn-sm btn-danger" onclick="deletePayment('${p.id}')">Delete</button>
            </td>
          </tr>
        `).join('') : `<tr><td colspan="6" class="empty-state">No payments yet for ${child.name.split(' ')[0]}</td></tr>`;

        return `
          <div class="panel ${child.id === activeChildId ? 'active' : ''}" id="panel-${child.id}">
            <div class="child-panel">
              <div class="child-panel-header">
                <div>
                  <h3>${child.name}</h3>
                  <p class="child-panel-sub">${child.school} · ${child.class}</p>
                </div>
                <div class="child-panel-header-actions">
                  <button type="button" class="btn btn-outline btn-sm" onclick="openFeesArrearsEditor('${child.id}')">Edit Fees & Arrears</button>
                  <button type="button" class="btn btn-primary btn-sm" onclick="openPaymentModal('${child.id}')">+ Payment</button>
                </div>
              </div>

              <div class="year-banner">YEAR ${year}</div>

              <div class="child-panel-stats">
                <div class="stat-box">
                  <div class="stat-label">Opening Arrears / Credit</div>
                  <div class="stat-value ${ledgers.openingArrears > 0 ? 'amount due' : (ledgers.openingArrears < 0 ? 'amount paid' : '')}">${formatKES(ledgers.openingArrears)}</div>
                </div>
                <div class="stat-box">
                  <div class="stat-label">Year Fees (T1+T2+T3)</div>
                  <div class="stat-value">${formatKES((ledgers.fees.term1||0)+(ledgers.fees.term2||0)+(ledgers.fees.term3||0))}</div>
                </div>
                <div class="stat-box highlight">
                  <div class="stat-label">Total Payments ${year}</div>
                  <div class="stat-value amount paid">${formatKES(yearPaid)}</div>
                </div>
                <div class="stat-box highlight">
                  <div class="stat-label">Balance end of Term 3</div>
                  <div class="stat-value ${yearClose > 0 ? 'amount due' : 'amount paid'}">${formatKES(yearClose)}</div>
                  <div class="stat-hint">${yearRaw < 0 ? 'Credit ' + formatKES(-yearRaw) + ' to Term 1 ' + (year + 1) : (yearClose > 0 ? 'Carries to Term 1 ' + (year + 1) : 'Cleared')}</div>
                </div>
              </div>

              <div class="term-ledgers">
                ${termBlocks}
              </div>

              <h4 class="payment-list-title" style="margin-top:1.5rem">Full payment history — ${child.name.split(' ')[0]}</h4>
              <p class="payment-list-hint">All payments for this child (any year). Date · Amount · Allocation</p>
              <div class="table-wrap">
                <table class="payments-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Allocation</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>${historyRows}</tbody>
                </table>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function updateOpeningArrearsFromLedger(childId, year, value) {
      setOpeningArrears(childId, year, value);
      saveState();
      renderAll();
      showToast(`Opening arrears for ${year} updated.`, 'success');
    }

    function updateTermFeeFromLedger(childId, year, term, value) {
      const field = 'term' + term;
      setChildFees(childId, year, { [field]: value });
      const child = state.children.find(c => c.id === childId);
      if (child && child.fees[year]) {
        const f = child.fees[year];
        f.yearly = (Number(f.term1) || 0) + (Number(f.term2) || 0) + (Number(f.term3) || 0);
      }
      saveState();
      renderAll();
      showToast(`Term ${term} fee updated.`, 'success');
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function switchTab(childId) {
      activeChildTabId = childId;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.child === childId));
      document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${childId}`));
    }

    function showToast(message, type) {
      let el = document.getElementById('appToast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'appToast';
        el.className = 'app-toast';
        document.body.appendChild(el);
      }
      el.className = 'app-toast ' + (type || 'success');
      el.textContent = message;
      el.classList.add('show');
      clearTimeout(el._hideTimer);
      el._hideTimer = setTimeout(() => el.classList.remove('show'), 2800);
    }

    function populatePaymentForm() {
      const sel = document.getElementById('payChild');
      sel.innerHTML = state.children.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      if (!editingPaymentId) {
        document.getElementById('payDate').value = todayISO();
      }
    }

    // ===================== ACTIONS =====================
    function openPaymentModal(childId, allocateTo) {
      editingPaymentId = null;
      populatePaymentForm();
      if (childId) document.getElementById('payChild').value = childId;
      document.getElementById('payAmount').value = '';
      document.getElementById('payRef').value = '';
      document.getElementById('payNotes').value = '';
      document.getElementById('payFile').value = '';
      document.getElementById('payMethod').value = 'M-Pesa';
      const alloc = allocateTo || 'term1';
      const allocEl = document.getElementById('payAllocate');
      if (allocEl) allocEl.value = alloc;
      document.getElementById('payDate').value = todayISO();
      document.getElementById('paymentModalTitle').textContent = 'Record Payment';
      document.getElementById('savePaymentBtn').textContent = 'Save Payment';
      document.getElementById('paymentModal').classList.add('open');
    }

    function editPayment(paymentId) {
      const p = state.payments.find(x => x.id === paymentId);
      if (!p) {
        alert('Payment not found.');
        return;
      }
      editingPaymentId = paymentId;
      populatePaymentForm();
      document.getElementById('payChild').value = p.childId;
      document.getElementById('payAmount').value = p.amount;
      document.getElementById('payDate').value = p.date;
      document.getElementById('payMethod').value = p.method || 'M-Pesa';
      document.getElementById('payRef').value = p.ref || '';
      document.getElementById('payAllocate').value = p.allocate || 'current';
      document.getElementById('payNotes').value = p.notes || '';
      document.getElementById('payFile').value = '';
      document.getElementById('paymentModalTitle').textContent = 'Edit Payment';
      document.getElementById('savePaymentBtn').textContent = 'Update Payment';
      document.getElementById('paymentModal').classList.add('open');
    }

    function deletePayment(paymentId) {
      const p = state.payments.find(x => x.id === paymentId);
      if (!p) return;
      const child = state.children.find(c => c.id === p.childId);
      const label = child ? child.name.split(' ')[0] : p.childId;
      if (!confirm(`Delete payment of ${formatKES(p.amount)} for ${label} dated ${p.date}?\nThis cannot be undone.`)) {
        return;
      }
      reverseArrearsEffect(p);
      activeChildTabId = p.childId;
      state.payments = state.payments.filter(x => x.id !== paymentId);
      saveState();
      renderAll();
      showToast(`Payment of ${formatKES(p.amount)} deleted.`, 'danger');
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove('open');
      if (id === 'paymentModal') {
        editingPaymentId = null;
      }
    }

    function savePayment() {
      const childId = document.getElementById('payChild').value;
      const amount = Number(document.getElementById('payAmount').value);
      const date = document.getElementById('payDate').value;
      const method = document.getElementById('payMethod').value;
      const ref = document.getElementById('payRef').value.trim();
      const allocate = document.getElementById('payAllocate').value;
      const notes = document.getElementById('payNotes').value.trim();
      const fileInput = document.getElementById('payFile');

      if (!amount || amount <= 0 || !date) {
        alert('Please enter a valid amount and date.');
        return;
      }

      const base = {
        childId,
        amount,
        date,
        method,
        ref,
        allocate,
        notes
      };

      if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
          base.receiptBase64 = e.target.result;
          finalizePayment(base);
        };
        reader.readAsDataURL(fileInput.files[0]);
      } else {
        // Keep existing receipt when editing if no new file chosen
        if (editingPaymentId) {
          const existing = state.payments.find(x => x.id === editingPaymentId);
          if (existing && existing.receiptBase64) {
            base.receiptBase64 = existing.receiptBase64;
          }
        }
        finalizePayment(base);
      }
    }

    function finalizePayment(paymentData) {
      const wasEdit = !!editingPaymentId;
      let targetChildId = paymentData.childId;

      if (editingPaymentId) {
        const idx = state.payments.findIndex(x => x.id === editingPaymentId);
        if (idx === -1) {
          alert('Original payment not found.');
          editingPaymentId = null;
          return;
        }
        const old = state.payments[idx];
        // Reverse old arrears effect, apply new
        reverseArrearsEffect(old);
        const updated = {
          ...old,
          ...paymentData,
          id: old.id,
          createdAt: old.createdAt,
          updatedAt: new Date().toISOString()
        };
        if (!paymentData.receiptBase64 && old.receiptBase64) {
          updated.receiptBase64 = old.receiptBase64;
        }
        state.payments[idx] = updated;
        applyArrearsEffect(updated);
        targetChildId = updated.childId;
        editingPaymentId = null;
      } else {
        const payment = {
          id: uid(),
          ...paymentData,
          receiptBase64: paymentData.receiptBase64 || null,
          createdAt: new Date().toISOString()
        };
        state.payments.push(payment);
        applyArrearsEffect(payment);
        targetChildId = payment.childId;
      }

      activeChildTabId = targetChildId;
      saveState();
      closeModal('paymentModal');
      renderAll();
      showToast(
        wasEdit
          ? `Payment updated — ${formatKES(paymentData.amount)} saved.`
          : `Payment recorded — ${formatKES(paymentData.amount)} confirmed.`,
        'success'
      );
    }

    function showChildDetail(childId) {
      const child = state.children.find(c => c.id === childId);
      const s = getChildSummary(childId, state.year);
      const od = getOverdueInfo(childId, state.year);
      document.getElementById('detailTitle').textContent = child.name;
      document.getElementById('detailBody').innerHTML = `
        <p><strong>School:</strong> ${child.school}<br>
        <strong>Class:</strong> ${child.class}<br>
        <strong>Year:</strong> ${state.year}</p>
        <div style="margin:1rem 0;display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
          <div>Yearly Fee: <strong>${formatKES(s.fees.yearly)}</strong></div>
          <div>Arrears: <strong>${formatKES(s.arrears)}</strong></div>
          <div>Paid: <strong class="amount paid">${formatKES(s.paidTotal)}</strong></div>
          <div>Balance: <strong class="${s.balance>0?'amount due':'amount paid'}">${formatKES(s.balance)}</strong></div>
          <div>Overdue Ageing: <strong>${od.ageing}</strong></div>
        </div>
        <p style="font-size:0.85rem;color:var(--muted)">Use the Detailed Accounts section below for full payment history and PDF export.</p>
      `;
      document.getElementById('detailModal').classList.add('open');
    }

    function switchYear(y) {
      state.year = parseInt(y, 10);
      // New year: fees start at 0; arrears/credit auto-carry from prior Term 3 if not set
      state.children.forEach(c => {
        if (!c.fees[state.year]) {
          c.fees[state.year] = { yearly: 0, term1: 0, term2: 0, term3: 0 };
        }
        const hasArr = state.arrears[c.id] && Object.prototype.hasOwnProperty.call(state.arrears[c.id], state.year);
        if (!hasArr && state.year > DEFAULT_YEAR) {
          try {
            const prev = getYearTermLedgers(c.id, state.year - 1);
            setOpeningArrears(c.id, state.year, prev.terms[2].rawBalance);
          } catch (e) { /* ignore */ }
        }
      });
      saveState();
      renderAll();
    }

    function buildFeesArrearsEditorHTML(focusChildId) {
      const list = focusChildId
        ? state.children.filter(c => c.id === focusChildId)
        : state.children;

      return list.map(c => {
        const f = c.fees[state.year] || { yearly: 0, term1: 0, term2: 0, term3: 0 };
        const arr = getArrears(c.id, state.year);
        const s = getChildSummary(c.id, state.year);
        const openArr = Math.max(0, s.arrears - s.arrearsCleared);
        return `
          <div class="fee-edit-block" data-child="${c.id}">
            <div class="fee-edit-block-header">
              <strong>${c.name}</strong>
              <span class="fee-edit-sub">${c.school} · ${state.year}</span>
            </div>

            <div class="form-group">
              <label>Opening Arrears (brought forward) — KES</label>
              <input type="number" min="0" step="1" data-child="${c.id}" data-kind="arrears" value="${arr}">
              <small class="field-hint">This is the full arrears figure for ${state.year}. Payments allocated to “Arrears” clear it automatically (open now: ${formatKES(openArr)}). Set to 0 to clear.</small>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Yearly Fee Payable</label>
                <input type="number" min="0" step="1" data-child="${c.id}" data-kind="fee" data-field="yearly" value="${f.yearly}">
              </div>
              <div class="form-group">
                <label>Term 1</label>
                <input type="number" min="0" step="1" data-child="${c.id}" data-kind="fee" data-field="term1" value="${f.term1}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Term 2</label>
                <input type="number" min="0" step="1" data-child="${c.id}" data-kind="fee" data-field="term2" value="${f.term2}">
              </div>
              <div class="form-group">
                <label>Term 3</label>
                <input type="number" min="0" step="1" data-child="${c.id}" data-kind="fee" data-field="term3" value="${f.term3}">
              </div>
            </div>

            <div class="fee-edit-actions">
              <button type="button" class="btn btn-sm btn-outline" onclick="syncYearlyFromTerms('${c.id}')">Sum terms → Yearly</button>
              <button type="button" class="btn btn-sm btn-danger" onclick="clearFeesAndArrears('${c.id}')">Clear fees & arrears (set 0)</button>
            </div>
          </div>
        `;
      }).join('');
    }

    function wireFeesArrearsInputs(container) {
      container.querySelectorAll('input[data-kind]').forEach(inp => {
        inp.addEventListener('change', () => {
          const childId = inp.dataset.child;
          const kind = inp.dataset.kind;
          const val = Math.max(0, Number(inp.value) || 0);
          inp.value = val;
          if (kind === 'arrears') {
            setOpeningArrears(childId, state.year, val);
          } else if (kind === 'fee') {
            const field = inp.dataset.field;
            setChildFees(childId, state.year, { [field]: val });
            if (field !== 'yearly') {
              const child = state.children.find(c => c.id === childId);
              const f = child.fees[state.year];
              const yearlyInp = container.querySelector(`input[data-child="${childId}"][data-field="yearly"]`);
              // Do not auto-overwrite yearly unless user uses the Sum button — keeps manual yearly free
            }
          }
          saveState();
        });
      });
    }

    function syncYearlyFromTerms(childId) {
      const child = state.children.find(c => c.id === childId);
      if (!child || !child.fees[state.year]) return;
      const f = child.fees[state.year];
      const sum = (Number(f.term1) || 0) + (Number(f.term2) || 0) + (Number(f.term3) || 0);
      f.yearly = sum;
      saveState();
      const yearlyInp = document.querySelector(`input[data-child="${childId}"][data-field="yearly"]`);
      if (yearlyInp) yearlyInp.value = sum;
      showToast(`Yearly fee for ${child.name.split(' ')[0]} set to ${formatKES(sum)}.`, 'success');
    }

    function clearFeesAndArrears(childId) {
      const child = state.children.find(c => c.id === childId);
      if (!child) return;
      if (!confirm(`Set all fee amounts and opening arrears for ${child.name} (${state.year}) to 0?\nPayments already recorded are kept.`)) return;
      setChildFees(childId, state.year, { yearly: 0, term1: 0, term2: 0, term3: 0 });
      setOpeningArrears(childId, state.year, 0);
      saveState();
      // Refresh open editors
      const settingsEditor = document.getElementById('feeEditor');
      if (settingsEditor && document.getElementById('settingsModal').classList.contains('open')) {
        settingsEditor.innerHTML = buildFeesArrearsEditorHTML();
        wireFeesArrearsInputs(settingsEditor);
      }
      const feesBody = document.getElementById('feesArrearsBody');
      if (feesBody && document.getElementById('feesArrearsModal').classList.contains('open')) {
        feesBody.innerHTML = buildFeesArrearsEditorHTML(childId);
        wireFeesArrearsInputs(feesBody);
      }
      showToast(`Fees & arrears cleared for ${child.name.split(' ')[0]}.`, 'danger');
      renderAll();
    }

    function openSettings() {
      const editor = document.getElementById('feeEditor');
      editor.innerHTML = buildFeesArrearsEditorHTML();
      wireFeesArrearsInputs(editor);
      document.getElementById('settingsModal').classList.add('open');
    }

    function openFeesArrearsEditor(childId) {
      const child = state.children.find(c => c.id === childId);
      document.getElementById('feesArrearsTitle').textContent = child
        ? `Edit Fees & Arrears — ${child.name}`
        : 'Edit Fees & Arrears';
      const body = document.getElementById('feesArrearsBody');
      body.innerHTML = buildFeesArrearsEditorHTML(childId || null);
      wireFeesArrearsInputs(body);
      document.getElementById('feesArrearsModal').classList.add('open');
    }

    function saveFeesArrearsModal() {
      // Values already saved on change; close and refresh
      closeModal('feesArrearsModal');
      renderAll();
      showToast('Fees & arrears updated.', 'success');
    }

    function exportData() {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `oguta-fees-backup-${todayISO()}.json`;
      a.click();
    }

    function importData(evt) {
      const file = evt.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const data = JSON.parse(e.target.result);
          if (data.children && data.payments) {
            state = data;
            saveState();
            renderAll();
            alert('Data imported successfully.');
          } else {
            alert('Invalid backup file.');
          }
        } catch (err) {
          alert('Could not read file: ' + err.message);
        }
      };
      reader.readAsText(file);
      evt.target.value = '';
    }

    function resetData() {
      state = {
        year: DEFAULT_YEAR,
        children: JSON.parse(JSON.stringify(DEFAULT_CHILDREN)),
        payments: [],
        arrears: {}
      };
      saveState();
      renderAll();
    }

    function exportPDF() {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const y0 = 14;
      let y = y0;

      doc.setFontSize(16);
      doc.text('Fee Payment Recordings — Statement', 14, y);
      y += 8;
      doc.setFontSize(11);
      doc.text(`Year: ${state.year}  |  Generated: ${todayISO()}`, 14, y);
      y += 10;

      state.children.forEach(child => {
        const s = getChildSummary(child.id, state.year);
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(child.name, 14, y);
        y += 6;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        doc.text(`${child.school} · ${child.class}`, 14, y);
        y += 5;
        doc.text(`Yearly: ${formatKES(s.fees.yearly)}  |  Arrears: ${formatKES(s.arrears)}  |  Paid: ${formatKES(s.paidTotal)}  |  Balance: ${formatKES(s.balance)}`, 14, y);
        y += 8;

        const pays = state.payments
          .filter(p => p.childId === child.id)
          .sort((a,b) => a.date.localeCompare(b.date));

        if (pays.length) {
          doc.autoTable({
            startY: y,
            head: [['Date', 'Amount', 'Method', 'Ref', 'Allocated', 'Notes']],
            body: pays.map(p => [
              p.date,
              formatKES(p.amount),
              p.method,
              p.ref || '—',
              p.allocate === 'arrears' ? 'Arrears' : p.allocate === 'current' ? 'Current' : (p.allocate || '').replace('term','T'),
              (p.notes || '').slice(0, 40)
            ]),
            margin: { left: 14, right: 14 },
            styles: { fontSize: 8 },
            headStyles: { fillColor: [26, 54, 93] }
          });
          y = doc.lastAutoTable.finalY + 10;
        } else {
          doc.text('No payments recorded.', 14, y);
          y += 10;
        }

        if (y > 260) {
          doc.addPage();
          y = 14;
        }
      });

      doc.save(`Fee-Payment-Recordings-${state.year}-${todayISO()}.pdf`);
    }

    // ===================== INIT =====================
    loadState();
    migrateOpeningArrears();
    renderAll();

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target === el) el.classList.remove('open');
      });
    });
