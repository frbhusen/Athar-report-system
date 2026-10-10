/*
 * Generic renderer: turns a template (templates.js) + data into
 *   - an editable form        (AtharRender.buildForm)
 *   - a printable A4 report   (AtharRender.buildPrint)
 *
 * Data shape (flat object, keys derived from template positions):
 *   text / date / number / textarea / single-choice -> string
 *   multi-choice                                    -> array of strings
 *   table                                           -> array of row objects { c0: '..', c1: '..' }
 */
(function () {
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  /* ───────── spec parsing ───────── */
  function parseSpec(str) {
    const parts = str.split('|');
    const s = { label: parts[0].trim(), type: 't', opts: null, w: null, unit: '', prev: false, def: '', hide: false, corner: false };
    for (const raw of parts.slice(1)) {
      const p = raw.trim();
      if (p === 'd' || p === 'n' || p === 'a') s.type = p;
      else if (p.startsWith('c:')) { s.type = 'c'; s.opts = p.slice(2).split('/'); }
      else if (p.startsWith('m:')) { s.type = 'm'; s.opts = p.slice(2).split('/'); }
      else if (/^w\d+$/.test(p)) s.w = parseInt(p.slice(1), 10);
      else if (p.startsWith('u:')) s.unit = p.slice(2);
      else if (p === 'prev') s.prev = true;
      else if (p === 'hide') s.hide = true;
      else if (p === 'corner') s.corner = true;
      else if (p.startsWith('=')) s.def = p.slice(1);
    }
    if (!s.w) s.w = s.type === 'a' || s.type === 'c' || s.type === 'm' ? 12 : (s.type === 't' ? 6 : 4);
    return s;
  }

  function parseItem(item, key) {
    if (typeof item === 'string') return { kind: 'field', key, spec: parseSpec(item) };
    if (item.note) return { kind: 'note', text: item.note };
    if (item.table) {
      return {
        kind: 'table', key, title: item.title || '', rows: item.rows || 1,
        cols: item.cols.map((c, j) => ({ key: 'c' + j, spec: parseSpec(c) })),
      };
    }
    throw new Error('Unknown item in template');
  }

  // Assigns keys and parses every spec once. Result is what both renderers consume.
  function normalize(tpl) {
    if (tpl._norm) return tpl._norm;
    const n = { tpl, plain: tpl.style === 'plain' };
    if (!n.plain) {
      n.cards = tpl.cards.map((c, i) => ({
        num: i + 1, title: c.title,
        items: c.items.map((it, j) => parseItem(it, 'c' + i + '.i' + j)),
      }));
    } else {
      n.blocks = tpl.blocks.map((b, i) => {
        const o = { pageBreak: !!b.pageBreak };
        if (b.period) { o.type = 'period'; }
        else if (b.heading) { o.type = 'heading'; o.heading = b.heading; o.items = b.items.map((it, j) => parseItem(it, 'b' + i + '.i' + j)); }
        else if (b.cards) {
          o.type = 'cards';
          o.cards = b.cards.map((c, ci) => ({ title: c.title, items: c.items.map((it, j) => parseItem(it, 'b' + i + '.c' + ci + '.i' + j)) }));
        } else if (b.plainFields) { o.type = 'fields'; o.items = b.plainFields.map((it, j) => parseItem(it, 'b' + i + '.i' + j)); }
        return o;
      });
    }
    tpl._norm = n;
    return n;
  }

  function allItems(n) {
    const out = [];
    if (!n.plain) n.cards.forEach((c) => out.push(...c.items));
    else n.blocks.forEach((b) => {
      if (b.items) out.push(...b.items);
      if (b.cards) b.cards.forEach((c) => out.push(...c.items));
    });
    return out;
  }

  function defaults(tpl, ctx) {
    const data = {};
    const n = normalize(tpl);
    if (n.plain) { data['period.from'] = ''; data['period.to'] = ''; }
    allItems(n).forEach((it) => {
      if (it.kind === 'field') {
        data[it.key] = it.spec.type === 'm' ? [] : '';
        const d = it.spec.def;
        if (d === 'section') data[it.key] = tpl.name;
        else if (d === 'today') data[it.key] = today();
        else if (d === 'manager') data[it.key] = (ctx && ctx.manager) || '';
        if (it.spec.prev) data[it.key + '.prev'] = '';
      } else if (it.kind === 'table') {
        data[it.key] = Array.from({ length: it.rows }, () => ({}));
      }
    });
    return data;
  }

  // Merge loaded/saved data over defaults, dropping unknown keys.
  function mergeData(tpl, ctx, saved) {
    const base = defaults(tpl, ctx);
    if (!saved || typeof saved !== 'object') return base;
    Object.keys(base).forEach((k) => {
      if (!(k in saved)) return;
      const v = saved[k];
      if (Array.isArray(base[k]) && !Array.isArray(v)) return;
      if (!Array.isArray(base[k]) && typeof v !== 'string') return;
      base[k] = v;
    });
    return base;
  }

  /* ───────── form controls ───────── */
  let uid = 0;
  function control(spec, get, set, notify) {
    const id = 'f' + (++uid);
    const wrap = el('div', 'fld fld-' + spec.type);
    wrap.style.setProperty('--w', spec.w);
    const lab = el('label', 'fld-label' + (spec.hide ? ' sr-only' : ''), spec.label);
    wrap.appendChild(lab);

    if (spec.type === 'c' || spec.type === 'm') {
      const grp = el('div', 'chk-group');
      grp.setAttribute('role', spec.type === 'c' ? 'radiogroup' : 'group');
      lab.removeAttribute('for');
      const refresh = () => {
        const v = get();
        grp.querySelectorAll('input').forEach((i) => {
          i.checked = spec.type === 'm' ? (v || []).includes(i.value) : v === i.value;
        });
      };
      spec.opts.forEach((o) => {
        const l = el('label', 'chk');
        const i = el('input'); i.type = 'checkbox'; i.value = o;
        i.addEventListener('change', () => {
          if (spec.type === 'm') {
            const cur = new Set(get() || []);
            i.checked ? cur.add(o) : cur.delete(o);
            set(spec.opts.filter((x) => cur.has(x)));
          } else {
            // single choice: tick to select, tick again to clear
            set(i.checked ? o : '');
          }
          refresh(); notify();
        });
        l.append(i, el('span', 'chk-box'), el('span', 'chk-text', o));
        grp.appendChild(l);
      });
      refresh();
      wrap.appendChild(grp);
      return wrap;
    }

    let input;
    if (spec.type === 'a') {
      input = el('textarea'); input.rows = 2;
      const grow = () => { input.style.height = 'auto'; input.style.height = Math.max(input.scrollHeight, 44) + 'px'; };
      input.addEventListener('input', grow);
      setTimeout(grow, 0);
      input._grow = grow;
    } else {
      input = el('input');
      input.type = spec.type === 'd' ? 'date' : spec.type === 'n' ? 'text' : 'text';
      if (spec.type === 'n') { input.inputMode = 'decimal'; }
    }
    input.id = id; lab.htmlFor = id;
    input.value = get() || '';
    input.addEventListener('input', () => { set(input.value); notify(); });
    if (spec.unit) {
      const row = el('div', 'with-unit');
      row.append(input, el('span', 'unit', spec.unit));
      wrap.appendChild(row);
    } else wrap.appendChild(input);
    return wrap;
  }

  function fieldNode(it, data, notify) {
    const spec = it.spec;
    const box = el('div', 'fld-wrap');
    box.style.setProperty('--w', spec.w);
    box.appendChild(control(spec, () => data[it.key], (v) => { data[it.key] = v; }, notify));
    if (spec.prev) {
      const pv = parseSpec('السابق|' + (spec.type === 'n' ? 'n' : 't') + (spec.unit ? '|u:' + spec.unit : ''));
      pv.w = 4;
      const c = control(pv, () => data[it.key + '.prev'], (v) => { data[it.key + '.prev'] = v; }, notify);
      c.classList.add('prev');
      box.appendChild(c);
    }
    return box;
  }

  function tableNode(it, data, notify) {
    const wrap = el('div', 'tbl');
    if (it.title) wrap.appendChild(el('h4', 'tbl-title', it.title));
    const list = el('div', 'rows');
    const render = () => {
      list.textContent = '';
      data[it.key].forEach((row, ri) => {
        const rec = el('div', 'rec');
        const head = el('div', 'rec-head');
        head.appendChild(el('span', 'rec-num', '#' + (ri + 1)));
        const del = el('button', 'btn btn-sm btn-danger', 'حذف الصف');
        del.type = 'button';
        del.addEventListener('click', () => {
          if (data[it.key].length === 1) data[it.key][0] = {};
          else data[it.key].splice(ri, 1);
          render(); notify();
        });
        head.appendChild(del);
        rec.appendChild(head);
        const grid = el('div', 'grid');
        it.cols.forEach((c) => grid.appendChild(control(c.spec, () => row[c.key], (v) => { row[c.key] = v; }, notify)));
        rec.appendChild(grid);
        list.appendChild(rec);
      });
    };
    render();
    wrap.appendChild(list);
    const add = el('button', 'btn btn-sm btn-add', '+ إضافة صف');
    add.type = 'button';
    add.addEventListener('click', () => { data[it.key].push({}); render(); notify(); list.lastChild.querySelector('input,textarea')?.focus(); });
    wrap.appendChild(add);
    return wrap;
  }

  function itemsNode(items, data, notify) {
    const grid = el('div', 'grid');
    items.forEach((it) => {
      if (it.kind === 'field') grid.appendChild(fieldNode(it, data, notify));
      else if (it.kind === 'note') grid.appendChild(el('p', 'note', it.text));
      else if (it.kind === 'table') { const t = tableNode(it, data, notify); t.classList.add('span-all'); grid.appendChild(t); }
    });
    return grid;
  }

  function buildForm(tpl, data, root, notify) {
    const n = normalize(tpl);
    root.textContent = '';
    if (!n.plain) {
      root.appendChild(goalBox(tpl));
      n.cards.forEach((c) => {
        const card = el('section', 'card');
        card.appendChild(el('h3', 'card-title', c.num + '. ' + c.title));
        card.appendChild(itemsNode(c.items, data, notify));
        root.appendChild(card);
      });
      return;
    }
    // plain style (coordinator)
    root.appendChild(el('h2', 'plain-title', tpl.title));
    n.blocks.forEach((b) => {
      if (b.type === 'period') {
        const card = el('section', 'card');
        const g = el('div', 'grid');
        g.appendChild(control(parseSpec('الفترة: من|d|w6'), () => data['period.from'], (v) => { data['period.from'] = v; }, notify));
        g.appendChild(control(parseSpec('إلى|d|w6'), () => data['period.to'], (v) => { data['period.to'] = v; }, notify));
        card.appendChild(g); root.appendChild(card);
      } else if (b.type === 'heading' || b.type === 'fields') {
        const card = el('section', 'card');
        if (b.heading) card.appendChild(el('h3', 'card-title', b.heading));
        card.appendChild(itemsNode(b.items, data, notify));
        root.appendChild(card);
      } else if (b.type === 'cards') {
        b.cards.forEach((c) => {
          const card = el('section', 'card card-accent');
          card.appendChild(el('h3', 'card-title', c.title));
          card.appendChild(itemsNode(c.items, data, notify));
          root.appendChild(card);
        });
      }
    });
  }

  function goalBox(tpl) {
    const g = el('section', 'goal');
    g.appendChild(el('h3', 'goal-title', 'هدف التقرير'));
    g.appendChild(el('p', 'goal-text', 'الهدف: ' + tpl.goal));
    return g;
  }

  /* ───────── print view ───────── */
  function pBox(on) { const b = el('span', 'pbox' + (on ? ' on' : '')); return b; }

  function printField(spec, val, label) {
    const f = el('div', 'pf pf-' + spec.type + (spec.corner ? ' pf-corner' : ''));
    f.style.setProperty('--w', spec.w);
    if (!spec.hide) f.appendChild(el('span', 'pl', (label || spec.label) + ':'));
    if (spec.type === 'c' || spec.type === 'm') {
      const g = el('span', 'pchecks');
      spec.opts.forEach((o) => {
        const on = spec.type === 'm' ? (val || []).includes(o) : val === o;
        const s = el('span', 'popt' + (on ? ' sel' : ''));
        s.append(pBox(on), el('span', null, o));
        g.appendChild(s);
      });
      f.appendChild(g);
    } else {
      const v = el('span', 'pv' + (val ? '' : ' empty'));
      v.setAttribute('dir', 'auto');
      v.textContent = val ? val + (spec.unit && /\d/.test(val) ? ' ' + spec.unit : '') : '';
      f.appendChild(v);
    }
    return f;
  }

  function printItems(items, data) {
    const g = el('div', 'pgrid');
    items.forEach((it) => {
      if (it.kind === 'note') { g.appendChild(el('p', 'pnote', it.text)); return; }
      if (it.kind === 'field') {
        const f = printField(it.spec, data[it.key]);
        if (it.spec.prev) {
          const w = el('div', 'pf-pair');
          w.style.setProperty('--w', it.spec.w + 2);
          f.style.setProperty('--w', 12);
          w.appendChild(f);
          const pv = printField(parseSpec('السابق|' + (it.spec.type === 'n' ? 'n' : 't') + (it.spec.unit ? '|u:' + it.spec.unit : '')), data[it.key + '.prev']);
          pv.classList.add('prev');
          w.appendChild(pv);
          g.appendChild(w);
        } else g.appendChild(f);
        return;
      }
      // table
      const rows = data[it.key] || [];
      const box = el('div', 'ptbl');
      if (it.title) box.appendChild(el('div', 'ptbl-title', it.title));
      const asTable = it.cols.length <= 5 && it.cols.every((c) => 'tdn'.includes(c.spec.type));
      const isEmpty = (r) => it.cols.every((c) => !r[c.key] || !String(r[c.key]).length);
      if (asTable) {
        const t = el('table', 'ptable');
        const th = el('tr');
        it.cols.forEach((c) => th.appendChild(el('th', null, c.spec.label)));
        t.appendChild(el('thead')).appendChild(th);
        const tb = el('tbody');
        (rows.length ? rows : [{}]).forEach((r) => {
          const tr = el('tr');
          it.cols.forEach((c) => { const td = el('td'); td.setAttribute('dir', 'auto'); td.textContent = r[c.key] || ''; tr.appendChild(td); });
          tb.appendChild(tr);
        });
        t.appendChild(tb);
        box.appendChild(t);
      } else {
        let list = rows.filter((r) => !isEmpty(r));
        if (!list.length) list = [{}];
        list.forEach((r, ri) => {
          const rec = el('div', 'prec');
          if (list.length > 1) rec.appendChild(el('span', 'prec-n', String(ri + 1)));
          const grid = el('div', 'pgrid');
          it.cols.forEach((c) => grid.appendChild(printField(c.spec, r[c.key])));
          rec.appendChild(grid);
          box.appendChild(rec);
        });
      }
      box.classList.add('span-all');
      g.appendChild(box);
    });
    return g;
  }

  function printCard(num, title, items, data, cls) {
    const c = el('section', 'pcard' + (cls ? ' ' + cls : ''));
    c.appendChild(el('h3', 'pcard-title', (num ? num + '. ' : '') + title));
    c.appendChild(printItems(items, data));
    return c;
  }

  // Wraps content in a table whose <thead> (the banner) repeats on every physical page.
  function sheetWithBanner(tpl, children, last) {
    const sheet = el('section', 'sheet' + (last ? ' last' : ''));
    const t = el('table', 'sheet-t');
    const th = el('thead'), tr = el('tr'), td = el('td');
    const b = el('div', 'banner');
    b.appendChild(el('div', 'banner-title', tpl.name));
    b.appendChild(el('div', 'banner-sub', tpl.subtitle));
    td.appendChild(b); tr.appendChild(td); th.appendChild(tr); t.appendChild(th);
    const tb = el('tbody'), r2 = el('tr'), c2 = el('td', 'sheet-body');
    children.forEach((c) => c2.appendChild(c));
    r2.appendChild(c2); tb.appendChild(r2); t.appendChild(tb);
    sheet.appendChild(t);
    return sheet;
  }

  function buildPrint(tpl, data, root) {
    const n = normalize(tpl);
    root.textContent = '';
    root.className = 'print-root ' + (n.plain ? 'style-plain' : 'style-banner');
    if (!n.plain) {
      const per = tpl.perPage || 3;
      const groups = [];
      for (let i = 0; i < n.cards.length; i += per) groups.push(n.cards.slice(i, i + per));
      groups.forEach((g, gi) => {
        const kids = [];
        if (gi === 0) {
          const goal = el('section', 'pgoal');
          goal.appendChild(el('h3', null, 'هدف التقرير'));
          goal.appendChild(el('p', null, 'الهدف: ' + tpl.goal));
          kids.push(goal);
        }
        g.forEach((c) => kids.push(printCard(c.num, c.title, c.items, data)));
        root.appendChild(sheetWithBanner(tpl, kids, gi === groups.length - 1));
      });
      return;
    }
    // plain style: split blocks into pages at pageBreak markers
    const pages = [[]];
    n.blocks.forEach((b) => { if (b.pageBreak) pages.push([]); pages[pages.length - 1].push(b); });
    pages.forEach((blocks, pi) => {
      const sheet = el('section', 'sheet plain-sheet' + (pi === pages.length - 1 ? ' last' : ''));
      if (pi === 0) {
        const logo = el('div', 'plain-logo'); const img = el('img'); img.src = 'assets/logo.jpg'; img.alt = 'أثر';
        logo.appendChild(img); sheet.appendChild(logo);
        sheet.appendChild(el('h1', 'plain-h1', tpl.title));
      }
      blocks.forEach((b) => {
        if (b.type === 'period') {
          const row = el('div', 'pperiod');
          row.append(el('span', 'pl', 'الفترة:'), valSpan(data['period.from']), el('span', 'pto', 'إلى'), valSpan(data['period.to']));
          sheet.appendChild(row);
        } else if (b.type === 'heading') {
          const s = el('section', 'pblock');
          s.appendChild(el('h2', 'pblock-h', b.heading));
          s.appendChild(printItems(b.items, data));
          sheet.appendChild(s);
        } else if (b.type === 'fields') {
          const s = el('section', 'pblock'); s.appendChild(printItems(b.items, data)); sheet.appendChild(s);
        } else if (b.type === 'cards') {
          b.cards.forEach((c) => sheet.appendChild(printCard(null, c.title, c.items, data, 'pcard-accent')));
        }
      });
      root.appendChild(sheet);
    });
  }

  function valSpan(v) {
    const s = el('span', 'pv' + (v ? '' : ' empty')); s.setAttribute('dir', 'auto'); s.textContent = v || ''; return s;
  }

  window.AtharRender = { normalize, defaults, mergeData, buildForm, buildPrint, parseSpec };
})();
