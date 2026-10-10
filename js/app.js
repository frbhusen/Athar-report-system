/* Form page controller: session guard, draft autosave, JSON import/export, print. */
(function () {
  const session = AtharAuth.requireSession();
  if (!session) return;

  // The section comes ONLY from the validated session; the URL / hash is never consulted.
  const tpl = ATHAR_TEMPLATES[session.section];
  const ctx = { manager: session.manager };
  const DRAFT_KEY = 'athar:draft:' + session.section;

  const $ = (id) => document.getElementById(id);
  const formRoot = $('form-root');
  const printRoot = $('print-root');
  const status = $('save-status');

  function readDraft() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; }
  }
  function writeDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
      status.textContent = 'تم حفظ المسودة تلقائياً';
    } catch (e) { status.textContent = 'تعذّر الحفظ التلقائي في هذا المتصفح'; }
  }

  let data = AtharRender.mergeData(tpl, ctx, readDraft());
  let timer = null;
  const notify = () => {
    status.textContent = 'جارٍ الحفظ…';
    clearTimeout(timer);
    timer = setTimeout(writeDraft, 400);
  };

  function render() { AtharRender.buildForm(tpl, data, formRoot, notify); }

  /* header */
  $('sec-name').textContent = tpl.name;
  $('user-email').textContent = session.email;
  document.title = tpl.name + ' — أثر Report Hub';
  $('btn-logout').addEventListener('click', AtharAuth.logout);

  /* print / PDF */
  function preparePrint() {
    AtharRender.buildPrint(tpl, data, printRoot);
    // Chrome uses document.title as the default PDF file name.
    document.title = 'تقرير ' + tpl.name + ' ' + new Date().toISOString().slice(0, 10);
  }
  window.addEventListener('beforeprint', preparePrint);
  window.addEventListener('afterprint', () => { document.title = tpl.name + ' — أثر Report Hub'; });
  $('btn-pdf').addEventListener('click', async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    preparePrint();
    window.print();
  });

  /* JSON save / load */
  $('btn-save-json').addEventListener('click', () => {
    const payload = { app: 'athar-report-hub', version: 1, section: session.section, savedAt: new Date().toISOString(), data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'athar-' + session.section + '-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  const fileIn = $('file-json');
  $('btn-load-json').addEventListener('click', () => { fileIn.value = ''; fileIn.click(); });
  fileIn.addEventListener('change', () => {
    const f = fileIn.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const p = JSON.parse(r.result);
        if (p.app !== 'athar-report-hub' || !p.data) throw new Error('bad');
        if (p.section !== session.section) { alert('هذا الملف يخص قسماً آخر ولا يمكن تحميله هنا.'); return; }
        if (!confirm('سيتم استبدال البيانات الحالية بمحتوى الملف. متابعة؟')) return;
        data = AtharRender.mergeData(tpl, ctx, p.data);
        render(); writeDraft();
      } catch (e) { alert('ملف غير صالح.'); }
    };
    r.readAsText(f);
  });

  /* clear */
  $('btn-clear').addEventListener('click', () => {
    if (!confirm('سيتم مسح كل ما أدخلته في هذا النموذج. متابعة؟')) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
    data = AtharRender.mergeData(tpl, ctx, null);
    render();
    status.textContent = 'تم مسح النموذج';
  });

  render();
})();
