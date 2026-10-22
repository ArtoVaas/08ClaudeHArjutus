(() => {
  'use strict';

  const MAX_LEN = 5000;
  const DELIBERATION_MS = 1500;
  const DEFAULTS = { court: 'district', sarcasm: 0.5, strictness: 0.5 };

  const $ = (id) => document.getElementById(id);
  const el = {
    sidebar: $('sidebar'), backdrop: $('backdrop'), hamburger: $('hamburger'), sidebarClose: $('sidebarClose'),
    caseList: $('caseList'), newCaseBtn: $('newCaseBtn'), hallLink: $('hallLink'),
    courtSelect: $('courtSelect'), judgeSelect: $('judgeSelect'), manageJudgesBtn: $('manageJudgesBtn'), settingsBtn: $('settingsBtn'),
    dbError: $('dbError'), chatView: $('chatView'), chat: $('chat'), hallView: $('hallView'), hallBack: $('hallBack'),
    hallTop: $('hallTop'), hallBottom: $('hallBottom'),
    composer: $('composer'), input: $('reportInput'), charCount: $('charCount'), inputError: $('inputError'),
    fileInput: $('fileInput'), fileChip: $('fileChip'), fileName: $('fileName'), fileRemove: $('fileRemove'),
    sampleBtn: $('sampleBtn'), clearBtn: $('clearBtn'), submitBtn: $('submitBtn'),
    settingsModal: $('settingsModal'), sarcasmRange: $('sarcasmRange'), sarcasmVal: $('sarcasmVal'),
    strictnessRange: $('strictnessRange'), strictnessVal: $('strictnessVal'), multiplierVal: $('multiplierVal'),
    judgesModal: $('judgesModal'), judgesClose: $('judgesClose'), judgeList: $('judgeList'), judgeForm: $('judgeForm'),
    judgeFormTitle: $('judgeFormTitle'), judgeId: $('judgeId'), judgeName: $('judgeName'), judgeTone: $('judgeTone'),
    judgeIntro: $('judgeIntro'), judgeError: $('judgeError'), judgeCancel: $('judgeCancel'), judgeSave: $('judgeSave'),
    toast: $('toast'),
  };

  const state = {
    judges: [],
    cases: [],
    caseId: null,          // null = new, not yet saved case
    settings: { ...DEFAULTS, judgeId: null },
    attachment: null,
    busy: false,
  };

  // ---------- Helpers ----------
  class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  async function api(path, options = {}) {
    let res;
    try {
      res = await fetch(path, {
        method: options.method || 'GET',
        headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch {
      throw new ApiError(0, 'Cannot reach the courthouse. Check your internet connection and try again.');
    }
    if (res.status === 204) return null;
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON response */ }
    if (!res.ok) {
      const err = new ApiError(res.status, (data && data.error) || `Request failed (${res.status}).`);
      if (res.status === 503) showDbError(err.message);
      throw err;
    }
    hideDbError();
    return data;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtTime(iso, withDate = false) {
    const d = new Date(iso);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (!withDate) return time;
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return `Today ${time}`;
    return `${d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })} ${time}`;
  }

  function fmtScore(n) {
    return Number(n).toFixed(1).replace(/\.0$/, '');
  }

  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3000);
  }

  function showDbError(msg) {
    el.dbError.textContent = `⚠️ ${msg}`;
    el.dbError.hidden = false;
  }
  function hideDbError() { el.dbError.hidden = true; }

  function showInputError(msg) {
    el.inputError.textContent = msg;
    el.inputError.hidden = false;
  }
  function hideInputError() { el.inputError.hidden = true; }

  // ---------- Sidebar ----------
  function openSidebar() { el.sidebar.classList.add('open'); el.backdrop.hidden = false; }
  function closeSidebar() { el.sidebar.classList.remove('open'); el.backdrop.hidden = true; }

  function renderCaseList() {
    if (!state.cases.length) {
      el.caseList.innerHTML = '<li class="case-empty">No cases yet. Submit a report to open one.</li>';
      return;
    }
    el.caseList.innerHTML = state.cases.map((c) => `
      <li class="case-item ${c.id === state.caseId ? 'active' : ''}" data-id="${c.id}" tabindex="0" role="button" aria-label="Open case ${esc(c.title)}">
        <div class="case-text">
          <div class="case-title">${esc(c.title)}</div>
          <div class="case-time">${esc(fmtTime(c.createdAt, true))}</div>
        </div>
        <button class="case-delete" data-delete="${c.id}" aria-label="Delete case" title="Delete case">🗑</button>
      </li>`).join('');
  }

  async function loadCases() {
    try {
      state.cases = await api('/api/cases');
    } catch {
      state.cases = [];
    }
    renderCaseList();
  }

  el.caseList.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-delete]');
    if (del) {
      e.stopPropagation();
      const id = Number(del.dataset.delete);
      if (!confirm('Delete this case and all its messages?')) return;
      try {
        await api(`/api/cases/${id}`, { method: 'DELETE' });
        if (state.caseId === id) newCase();
        await loadCases();
        toast('Case deleted.');
      } catch (err) { toast(err.message); }
      return;
    }
    const item = e.target.closest('.case-item');
    if (item) { openCase(Number(item.dataset.id)); closeSidebar(); }
  });
  el.caseList.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('case-item')) {
      e.preventDefault();
      openCase(Number(e.target.dataset.id));
      closeSidebar();
    }
  });

  // ---------- Views ----------
  function showChat() {
    el.hallView.hidden = true;
    el.chatView.hidden = false;
    el.composer.hidden = false;
    el.hallLink.classList.remove('active');
  }

  async function showHall() {
    el.chatView.hidden = true;
    el.composer.hidden = true;
    el.hallView.hidden = false;
    el.hallLink.classList.add('active');
    closeSidebar();
    el.hallTop.innerHTML = el.hallBottom.innerHTML = '<li class="hall-empty">Loading…</li>';
    try {
      const { top, bottom } = await api('/api/hall');
      el.hallTop.innerHTML = renderHallList(top);
      el.hallBottom.innerHTML = renderHallList(bottom);
    } catch (err) {
      el.hallTop.innerHTML = el.hallBottom.innerHTML = `<li class="hall-empty">${esc(err.message)}</li>`;
    }
  }

  const VERDICT_INFO = {
    GUILTY: { label: 'GUILTY', color: 'red' },
    PROBATION: { label: 'GUILTY WITH PROBATION', color: 'amber' },
    ACQUITTED: { label: 'ACQUITTED', color: 'green' },
    HALL_OF_FAME: { label: 'HALL OF FAME', color: 'gold' },
  };

  function renderHallList(items) {
    if (!items.length) return '<li class="hall-empty">No reports submitted to the Hall yet.</li>';
    return items.map((h) => {
      const v = VERDICT_INFO[h.verdict] || { label: h.verdict, color: 'amber' };
      const report = h.report.length > 280 ? `${h.report.slice(0, 280)}…` : h.report;
      return `<li class="hall-card">
        <div class="row">
          <span class="hscore">${fmtScore(h.score)} / 10</span>
          <span class="badge ${v.color}">${esc(v.label)}</span>
          <span class="meta">${esc(h.judgeName || '')} · ${esc(fmtTime(h.createdAt, true))}</span>
        </div>
        <pre>${esc(report)}</pre>
      </li>`;
    }).join('');
  }

  // ---------- Top bar ----------
  function renderJudgeSelect() {
    const options = state.judges.map((j) => `<option value="${j.id}">${esc(j.name)}</option>`);
    if (!state.judges.length) options.push('<option value="">No judges – add one</option>');
    el.judgeSelect.innerHTML = options.join('');
    const exists = state.judges.some((j) => j.id === state.settings.judgeId);
    if (!exists) state.settings.judgeId = state.judges[0] ? state.judges[0].id : null;
    el.judgeSelect.value = state.settings.judgeId ?? '';
  }

  function renderSettingsControls() {
    el.courtSelect.value = state.settings.court;
    renderJudgeSelect();
    el.sarcasmRange.value = state.settings.sarcasm;
    el.strictnessRange.value = state.settings.strictness;
    updateSliderLabels();
  }

  function updateSliderLabels() {
    el.sarcasmVal.textContent = Number(el.sarcasmRange.value).toFixed(1);
    el.strictnessVal.textContent = Number(el.strictnessRange.value).toFixed(1);
    el.multiplierVal.textContent = `×${(0.5 + Number(el.strictnessRange.value)).toFixed(1)}`;
  }

  async function saveSettings(patch) {
    Object.assign(state.settings, patch);
    if (!state.caseId) return; // new case: settings are saved when it is created
    try {
      await api(`/api/cases/${state.caseId}`, { method: 'PATCH', body: patch });
    } catch (err) {
      toast(`Settings not saved: ${err.message}`);
    }
  }

  el.courtSelect.addEventListener('change', () => saveSettings({ court: el.courtSelect.value }));
  el.judgeSelect.addEventListener('change', () => {
    const id = Number(el.judgeSelect.value) || null;
    saveSettings({ judgeId: id });
  });

  el.settingsBtn.addEventListener('click', () => { renderSettingsControls(); el.settingsModal.showModal(); });
  el.sarcasmRange.addEventListener('input', updateSliderLabels);
  el.strictnessRange.addEventListener('input', updateSliderLabels);
  el.sarcasmRange.addEventListener('change', () => saveSettings({ sarcasm: Number(el.sarcasmRange.value) }));
  el.strictnessRange.addEventListener('change', () => saveSettings({ strictness: Number(el.strictnessRange.value) }));

  // ---------- Judges ----------
  async function loadJudges() {
    try {
      state.judges = await api('/api/judges');
    } catch {
      state.judges = [];
    }
    renderJudgeSelect();
  }

  function renderJudgeList() {
    if (!state.judges.length) {
      el.judgeList.innerHTML = '<li class="muted">No judges. Add one below.</li>';
      return;
    }
    el.judgeList.innerHTML = state.judges.map((j) => `
      <li class="judge-row">
        <div class="info">
          <div class="name">${esc(j.name)}</div>
          <div class="desc">${esc(j.tone)}</div>
          <div class="desc"><em>${esc(j.intro)}</em></div>
        </div>
        <div class="actions">
          <button class="btn btn-secondary btn-sm" data-edit="${j.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-remove="${j.id}">Delete</button>
        </div>
      </li>`).join('');
  }

  function resetJudgeForm() {
    el.judgeForm.reset();
    el.judgeId.value = '';
    el.judgeFormTitle.textContent = 'Add a judge';
    el.judgeSave.textContent = 'Add judge';
    el.judgeCancel.hidden = true;
    el.judgeError.hidden = true;
  }

  el.manageJudgesBtn.addEventListener('click', async () => {
    resetJudgeForm();
    await loadJudges();
    renderJudgeList();
    el.judgesModal.showModal();
  });
  el.judgesClose.addEventListener('click', () => el.judgesModal.close());
  el.judgeCancel.addEventListener('click', resetJudgeForm);

  el.judgeList.addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit]');
    const remove = e.target.closest('[data-remove]');
    if (edit) {
      const j = state.judges.find((x) => x.id === Number(edit.dataset.edit));
      if (!j) return;
      el.judgeId.value = j.id;
      el.judgeName.value = j.name;
      el.judgeTone.value = j.tone;
      el.judgeIntro.value = j.intro;
      el.judgeFormTitle.textContent = `Edit ${j.name}`;
      el.judgeSave.textContent = 'Save changes';
      el.judgeCancel.hidden = false;
      el.judgeName.focus();
    } else if (remove) {
      const j = state.judges.find((x) => x.id === Number(remove.dataset.remove));
      if (!j || !confirm(`Delete ${j.name}?`)) return;
      try {
        await api(`/api/judges/${j.id}`, { method: 'DELETE' });
        await loadJudges();
        renderJudgeList();
        if (Number(el.judgeId.value) === j.id) resetJudgeForm();
        if (state.caseId && state.settings.judgeId !== Number(el.judgeSelect.value)) {
          saveSettings({ judgeId: Number(el.judgeSelect.value) || null });
        }
      } catch (err) { toast(err.message); }
    }
  });

  el.judgeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    el.judgeError.hidden = true;
    const body = { name: el.judgeName.value, tone: el.judgeTone.value, intro: el.judgeIntro.value };
    if (!body.name.trim()) {
      el.judgeError.textContent = 'Name is required.';
      el.judgeError.hidden = false;
      return;
    }
    const id = Number(el.judgeId.value);
    try {
      const saved = id
        ? await api(`/api/judges/${id}`, { method: 'PUT', body })
        : await api('/api/judges', { method: 'POST', body });
      await loadJudges();
      renderJudgeList();
      resetJudgeForm();
      toast(id ? 'Judge updated.' : `${saved.name} has joined the bench.`);
    } catch (err) {
      el.judgeError.textContent = err.message;
      el.judgeError.hidden = false;
    }
  });

  // ---------- Chat ----------
  const GAVEL_SVG = '<svg class="gavel" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 2.8l6.7 6.7-2.1 2.1-1.1-1.1-4.2 4.2 1.1 1.1-2.1 2.1-6.7-6.7 2.1-2.1 1.1 1.1 4.2-4.2-1.1-1.1zM9.4 14.6l1.4 1.4-6.4 6.4a1 1 0 01-1.4-1.4zM13 20h9v2h-9z"/></svg>';

  function renderEmpty() {
    el.chat.innerHTML = `<div class="empty-state">
      ${GAVEL_SVG}
      <h1>The court is in session</h1>
      <p>Paste a defect report below and the judge will score it from 0 to 10, list the charges and tell you how to fix it.</p>
    </div>`;
  }

  function userMessageHtml(m) {
    const attach = m.attachmentName ? `<div class="attach-note">📎 ${esc(m.attachmentName)}</div>` : '';
    return `<div class="msg user"><div class="bubble">${esc(m.content)}${attach}</div><div class="time">${esc(fmtTime(m.createdAt))}</div></div>`;
  }

  function judgeMessageHtml(m) {
    const d = m.details || {};
    const v = d.verdict || VERDICT_INFO[m.verdict] || { label: m.verdict, color: 'amber' };
    const charges = (d.charges || []).length
      ? `<ul class="charges">${d.charges.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
      : '<p class="sentence">None. The report is complete.</p>';
    const hallBtn = m.inHall
      ? '<button class="btn btn-secondary btn-sm" disabled>✓ In the Hall</button>'
      : `<button class="btn btn-secondary btn-sm" data-hall="${m.id}">🏆 Submit to Hall</button>`;
    return `<div class="msg judge"><div class="bubble">
        <div class="judge-head">⚖️ ${esc(d.judgeName || 'The Court')}</div>
        ${d.judgeIntro ? `<div class="judge-intro">${esc(d.judgeIntro)}</div>` : ''}
        <div class="score-row">
          <div class="score">${fmtScore(m.score)} <small>/ ${d.maxScore || 10}</small></div>
          <div>
            <span class="badge ${esc(v.color)}">${esc(v.label)}</span>
            <div class="meta">${esc(d.courtLabel || '')}${v.detail ? ` · ${esc(v.detail)}` : ''}${d.penalty ? ` · penalties −${fmtScore(d.penalty)}` : ''}</div>
          </div>
        </div>
        <div class="section-label">Charges</div>
        ${charges}
        <div class="section-label">Sentence</div>
        <p class="sentence">${esc(d.sentence || m.content)}</p>
        <details class="fix">
          <summary>How to fix</summary>
          <pre>${esc(d.template || '')}</pre>
          <div class="fix-actions"><button class="btn btn-ghost btn-sm" data-use-template="${m.id}">Use this template</button></div>
        </details>
        <div class="judge-actions">${hallBtn}</div>
      </div><div class="time">${esc(fmtTime(m.createdAt))}</div></div>`;
  }

  function renderMessages(messages) {
    state.messages = messages;
    if (!messages.length) return renderEmpty();
    el.chat.innerHTML = messages.map((m) => (m.role === 'user' ? userMessageHtml(m) : judgeMessageHtml(m))).join('');
    scrollToBottom();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => { el.chatView.scrollTop = el.chatView.scrollHeight; });
  }

  el.chat.addEventListener('click', async (e) => {
    const hall = e.target.closest('[data-hall]');
    const useTpl = e.target.closest('[data-use-template]');
    if (hall) {
      hall.disabled = true;
      try {
        await api('/api/hall', { method: 'POST', body: { messageId: Number(hall.dataset.hall) } });
        hall.textContent = '✓ In the Hall';
        toast('Submitted to the Hall of Fame / Shame.');
      } catch (err) {
        if (err.status === 409) hall.textContent = '✓ In the Hall';
        else hall.disabled = false;
        toast(err.message);
      }
    } else if (useTpl) {
      const m = (state.messages || []).find((x) => x.id === Number(useTpl.dataset.useTemplate));
      if (m && m.details) {
        el.input.value = m.details.template;
        onInputChange();
        el.input.focus();
      }
    }
  });

  async function openCase(id) {
    showChat();
    try {
      const c = await api(`/api/cases/${id}`);
      state.caseId = c.id;
      state.settings = { court: c.court, judgeId: c.judgeId, sarcasm: c.sarcasm, strictness: c.strictness };
      history.replaceState(null, '', `#case-${c.id}`);
      renderSettingsControls();
      renderMessages(c.messages);
      renderCaseList();
    } catch (err) {
      if (err.status === 404) { toast('Case not found.'); newCase(); }
      else toast(err.message);
    }
  }

  function newCase() {
    showChat();
    state.caseId = null;
    state.settings = { ...DEFAULTS, judgeId: state.judges[0] ? state.judges[0].id : null };
    state.messages = [];
    history.replaceState(null, '', location.pathname);
    clearInput();
    renderSettingsControls();
    renderEmpty();
    renderCaseList();
  }

  // ---------- Composer ----------
  function autoGrow() {
    el.input.style.height = 'auto';
    el.input.style.height = `${Math.min(el.input.scrollHeight + 2, window.innerHeight * 0.4)}px`;
  }

  function onInputChange() {
    autoGrow();
    const len = el.input.value.length;
    el.charCount.textContent = `${len} / ${MAX_LEN}`;
    el.charCount.classList.toggle('over', len > MAX_LEN);
    if (len > MAX_LEN) showInputError(`Your report is ${len} characters long. The court accepts at most ${MAX_LEN} characters.`);
    else hideInputError();
  }

  function clearInput() {
    el.input.value = '';
    clearAttachment();
    onInputChange();
  }

  function clearAttachment() {
    state.attachment = null;
    el.fileInput.value = '';
    el.fileChip.hidden = true;
  }

  el.input.addEventListener('input', onInputChange);
  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
  });

  el.fileInput.addEventListener('change', () => {
    const f = el.fileInput.files[0];
    if (!f) return;
    // Only the file name is used; the content is never read or uploaded.
    state.attachment = f.name;
    el.fileName.textContent = f.name;
    el.fileName.title = f.name;
    el.fileChip.hidden = false;
  });
  el.fileRemove.addEventListener('click', clearAttachment);

  el.sampleBtn.addEventListener('click', async () => {
    el.sampleBtn.disabled = true;
    try {
      const s = await api('/api/samples/random');
      el.input.value = s.report;
      onInputChange();
      el.input.focus();
    } catch (err) { toast(err.message); }
    el.sampleBtn.disabled = false;
  });

  el.clearBtn.addEventListener('click', newCase);
  el.newCaseBtn.addEventListener('click', () => { newCase(); closeSidebar(); el.input.focus(); });

  async function submit() {
    if (state.busy) return;
    const text = el.input.value.trim();
    if (!text) { showInputError('The court cannot judge an empty report. Please paste your defect report first.'); el.input.focus(); return; }
    if (text.length > MAX_LEN) { showInputError(`Your report is ${text.length} characters long. The court accepts at most ${MAX_LEN} characters.`); return; }
    hideInputError();

    state.busy = true;
    el.submitBtn.disabled = true;
    const attachmentName = state.attachment;

    // Optimistic user bubble + deliberating indicator
    if (!state.messages || !state.messages.length) el.chat.innerHTML = '';
    el.chat.insertAdjacentHTML('beforeend', userMessageHtml({ content: text, attachmentName, createdAt: new Date().toISOString() }));
    el.chat.insertAdjacentHTML('beforeend', '<div class="deliberating" id="deliberating"><span class="dots"><span></span><span></span><span></span></span> The judge is deliberating...</div>');
    scrollToBottom();
    const savedInput = el.input.value;
    clearInput();

    try {
      if (!state.caseId) {
        const c = await api('/api/cases', { method: 'POST', body: state.settings });
        state.caseId = c.id;
        history.replaceState(null, '', `#case-${c.id}`);
      }
      const [result] = await Promise.all([
        api(`/api/cases/${state.caseId}/messages`, { method: 'POST', body: { text, attachmentName } }),
        sleep(DELIBERATION_MS),
      ]);
      renderMessages([...(state.messages || []), ...result.messages]);
      loadCases();
    } catch (err) {
      // Restore the report so nothing is lost
      renderMessages(state.messages || []);
      el.input.value = savedInput;
      if (attachmentName) { state.attachment = attachmentName; el.fileName.textContent = attachmentName; el.fileChip.hidden = false; }
      onInputChange();
      showInputError(err.message);
    } finally {
      state.busy = false;
      el.submitBtn.disabled = false;
    }
  }
  el.submitBtn.addEventListener('click', submit);

  // ---------- Navigation ----------
  el.hamburger.addEventListener('click', openSidebar);
  el.sidebarClose.addEventListener('click', closeSidebar);
  el.backdrop.addEventListener('click', closeSidebar);
  el.hallLink.addEventListener('click', showHall);
  el.hallBack.addEventListener('click', showChat);
  window.addEventListener('hashchange', () => {
    const m = location.hash.match(/^#case-(\d+)$/);
    if (m && Number(m[1]) !== state.caseId) openCase(Number(m[1]));
  });

  // ---------- Init ----------
  async function init() {
    renderEmpty();
    onInputChange();
    try {
      const health = await api('/api/health');
      if (!health.db) showDbError('The courthouse archive (database) is not reachable right now. Please try again in a moment.');
    } catch { /* api() already showed the error */ }
    await Promise.all([loadJudges(), loadCases()]);
    const m = location.hash.match(/^#case-(\d+)$/);
    if (m) await openCase(Number(m[1]));
    else newCase();
  }

  init();
})();
