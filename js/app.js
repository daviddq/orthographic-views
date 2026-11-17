/* Interfaz y modos de la aplicación. */
(function () {
  'use strict';
  const DT = window.DT;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const MODES = ['libre', 'construir', 'identificar', 'dibujar'];
  const EDITABLE = { libre: true, construir: true };
  const VIEW_PHRASE = { alzado: 'el ALZADO', planta: 'la PLANTA', perfil: 'el PERFIL IZQUIERDO' };
  const STORE_KEY = 'orthographic-views.figuras';

  const state = {
    mode: 'libre',
    figs: { libre: DT.empty(), construir: DT.empty(), identificar: null, dibujar: null },
    undo: { libre: [], construir: [] },
    redo: { libre: [], construir: [] },
    target: null,
    buildResult: null,
    identify: null,
    idScore: { ok: 0, total: 0 },
    drawing: null,
    drawTool: 'v',
    drawResult: null,
    drawSolution: false,
  };

  const scene = new DT.Scene3D($('#viewport'), {
    onAction: (type, cell) => editCell(cell, type === 'add' ? 1 : 0),
  });

  /* ================= utilidades ================= */

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function copyText(text) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? 'Enlace copiado' : 'No se pudo copiar: ' + text);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => toast('Enlace copiado'), fallback);
    } else fallback();
  }

  function linkFor(mode, cells) {
    const base = location.href.split('#')[0];
    const code = DT.encode(cells);
    return base + (mode === 'libre' ? '#f=' + code : '#m=' + mode + '&f=' + code);
  }

  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const exampleCells = (name) => {
    const e = DT.EXAMPLES.find((x) => x.name === name);
    return e ? DT.fromLayers(e.layers) : null;
  };

  /* ================= figura actual / edición ================= */

  const currentFig = () => state.figs[state.mode] || DT.empty();

  function editCell(cell, val) {
    const m = state.mode;
    if (!EDITABLE[m]) return;
    const fig = state.figs[m];
    const i = DT.idx(cell[0], cell[1], cell[2]);
    if (fig[i] === val) return;
    const next = DT.clone(fig);
    next[i] = val;
    commit(next);
  }

  /** Cambia la figura editable del modo actual guardando historial. */
  function commit(next) {
    const m = state.mode;
    if (DT.equals(next, state.figs[m])) return;
    state.undo[m].push(DT.encode(state.figs[m]));
    if (state.undo[m].length > 200) state.undo[m].shift();
    state.redo[m] = [];
    state.figs[m] = next;
    onFigChanged();
  }

  function undo() {
    const m = state.mode;
    if (!EDITABLE[m] || !state.undo[m].length) return;
    state.redo[m].push(DT.encode(state.figs[m]));
    state.figs[m] = DT.decode(state.undo[m].pop());
    onFigChanged();
  }

  function redo() {
    const m = state.mode;
    if (!EDITABLE[m] || !state.redo[m].length) return;
    state.undo[m].push(DT.encode(state.figs[m]));
    state.figs[m] = DT.decode(state.redo[m].pop());
    onFigChanged();
  }

  function onFigChanged() {
    if (state.mode === 'construir') state.buildResult = null;
    refresh();
  }

  /* ================= refresco general ================= */

  function refresh() {
    const m = state.mode;
    const fig = currentFig();
    scene.setCells(fig);
    scene.setEditable(!!EDITABLE[m]);

    if (EDITABLE[m]) {
      $('#btn-undo').disabled = !state.undo[m].length;
      $('#btn-redo').disabled = !state.redo[m].length;
      const n = DT.count(fig);
      $('#block-count').textContent = n + (n === 1 ? ' bloque' : ' bloques');
      renderLayers();
    }
    if (m === 'libre') renderFree();
    if (m === 'construir') renderBuild();
    if (m === 'dibujar') renderDraw();
    if (m === 'identificar') renderIdentify();
    updateHash();
  }

  function updateHash() {
    const m = state.mode;
    const cells = m === 'construir' ? state.target : state.figs[m];
    if (!cells) return;
    const h = m === 'libre' ? '#f=' + DT.encode(cells) : '#m=' + m + '&f=' + DT.encode(cells);
    if (location.hash !== h) {
      try { history.replaceState(null, '', h); } catch (e) { /* file:// en algunos navegadores */ }
    }
  }

  /* ================= modo libre ================= */

  function renderFree() {
    const fig = state.figs.libre;
    DT.svg.renderLayout($('#views-libre'), (k) => ({ segs: DT.computeView(fig, k), opts: {} }), DT.svg.legend());
    const code = $('#code');
    if (document.activeElement !== code) code.value = DT.encode(fig);
  }

  /* ================= editor por capas ================= */

  function buildLayers() {
    const wrap = $('#layers');
    wrap.innerHTML = '';
    for (let y = 0; y < 3; y++) {
      const L = document.createElement('div');
      L.className = 'layer';
      L.innerHTML = `<div class="layer-title">Nivel ${y + 1}${y === 0 ? ' (suelo)' : y === 2 ? ' (arriba)' : ''}</div>`;
      const g = document.createElement('div');
      g.className = 'layer-grid';
      for (let z = 0; z < 3; z++)
        for (let x = 0; x < 3; x++) {
          const b = document.createElement('button');
          b.dataset.cell = [x, y, z].join(',');
          b.title = `Nivel ${y + 1}, columna ${x + 1}, fila ${3 - z} desde el frente`;
          b.addEventListener('click', () => {
            const fig = state.figs[state.mode];
            editCell([x, y, z], DT.get(fig, x, y, z) ? 0 : 1);
            const now = DT.get(state.figs[state.mode], x, y, z);
            scene.previewCell([x, y, z], !!now);
          });
          b.addEventListener('mouseenter', () => scene.previewCell([x, y, z], !!DT.get(state.figs[state.mode], x, y, z)));
          b.addEventListener('mouseleave', () => scene.previewCell(null));
          g.appendChild(b);
        }
      L.appendChild(g);
      const f = document.createElement('div');
      f.className = 'layer-front';
      f.textContent = '▼ FRENTE';
      L.appendChild(f);
      wrap.appendChild(L);
    }
  }

  function renderLayers() {
    const fig = state.figs[state.mode];
    $$('#layers button').forEach((b) => {
      const [x, y, z] = b.dataset.cell.split(',').map(Number);
      b.classList.toggle('on', !!DT.get(fig, x, y, z));
    });
  }

  /* ================= ejercicio: vistas -> pieza ================= */

  function renderBuild() {
    const tgt = state.target;
    const box = $('#views-target');
    DT.svg.renderLayout(box, (k) => ({ segs: DT.computeView(tgt, k), opts: {} }), DT.svg.legend());
    const fb = $('#build-feedback');
    const r = state.buildResult;
    if (r) {
      DT.MAIN_VIEWS.forEach((k) => DT.svg.setBadge(box, k, r[k]));
      const all = DT.MAIN_VIEWS.every((k) => r[k]);
      if (all) {
        const same = DT.equals(state.figs.construir, tgt);
        fb.className = 'feedback ok';
        fb.textContent = same
          ? '¡Correcto! Has construido la pieza.'
          : '¡Correcto! Tu pieza no es igual que la original, pero tiene las mismas tres vistas, así que también es válida.';
      } else {
        const bad = DT.MAIN_VIEWS.filter((k) => !r[k]).map((k) => DT.VIEWS[k].name.toLowerCase());
        fb.className = 'feedback bad';
        fb.textContent = 'Todavía no. No coincide: ' + bad.join(', ') + '.';
      }
    } else {
      fb.textContent = '';
    }
    const mine = $('#views-mine');
    if ($('#build-mine').checked) {
      const fig = state.figs.construir;
      DT.svg.renderLayout(mine, (k) => ({ segs: DT.computeView(fig, k), opts: {} }));
      const t = document.createElement('div');
      t.className = 'mine-title';
      t.textContent = 'Vistas de tu pieza:';
      mine.prepend(t);
    } else {
      mine.innerHTML = '';
      mine.classList.remove('views-layout');
    }
  }

  function checkBuild() {
    const mine = DT.computeAllViews(state.figs.construir);
    const tgt = DT.computeAllViews(state.target);
    state.buildResult = {};
    DT.MAIN_VIEWS.forEach((k) => (state.buildResult[k] = DT.segsKey(mine[k]) === DT.segsKey(tgt[k])));
    renderBuild();
  }

  /* ================= ejercicio: identificar vista ================= */

  function makeIdentify(cells) {
    const view = DT.MAIN_VIEWS[Math.floor(Math.random() * 3)];
    const correct = DT.computeView(cells, view);
    const ck = DT.segsKey(correct);
    const cands = [];
    const add = (segs, why, weight = 1) => cands.push({ segs, why, weight });
    DT.MAIN_VIEWS.filter((v) => v !== view).forEach((v) =>
      add(DT.computeView(cells, v), `Es ${VIEW_PHRASE[v].toLowerCase()}, no ${VIEW_PHRASE[view].toLowerCase()}.`));
    if (view === 'perfil') add(DT.computeView(cells, 'perfilDerecho'), 'Es el perfil derecho (mirando desde la derecha).', 3);
    add(DT.mirrorU(correct), 'Está dada la vuelta de izquierda a derecha.', 2);
    if (view === 'planta') add(DT.flipV(correct), 'El frente de la pieza debe quedar abajo en la planta (sistema europeo).', 3);
    add(DT.withoutHidden(correct), 'Le faltan las aristas ocultas (discontinuas).', 2);
    add(DT.hiddenAsVisible(correct), 'Las aristas ocultas deben dibujarse con línea discontinua.', 2);
    for (let i = 0; i < 6; i++) add(DT.computeView(DT.mutate(cells), view), 'Corresponde a otra pieza: fíjate en los bloques.');

    // Únicas y distintas de la correcta
    const seen = new Set([ck]);
    const pool = [];
    cands.forEach((c) => {
      const k = DT.segsKey(c.segs);
      if (!k || seen.has(k)) return;
      seen.add(k);
      pool.push(c);
    });
    // Elección ponderada de 3 distractores
    const chosen = [];
    while (chosen.length < 3 && pool.length) {
      const tot = pool.reduce((a, c) => a + c.weight, 0);
      let r = Math.random() * tot;
      let i = 0;
      while ((r -= pool[i].weight) > 0) i++;
      chosen.push(pool.splice(i, 1)[0]);
    }
    const options = shuffle([{ segs: correct, ok: true }].concat(chosen));
    return { view, options, answered: null };
  }

  function newIdentify(cells) {
    state.figs.identificar = cells;
    state.identify = makeIdentify(cells);
  }

  function renderIdentify() {
    const q = state.identify;
    if (!q) return;
    $('#id-question').innerHTML = `¿Cuál es <span class="c-${q.view}">${VIEW_PHRASE[q.view]}</span> de esta pieza?`;
    const box = $('#id-options');
    box.innerHTML = '';
    q.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'option';
      b.innerHTML = `<span class="opt-letter">${'ABCD'[i]}</span>`;
      b.appendChild(DT.svg.renderView(o.segs, { grid: true }));
      if (q.answered !== null) {
        if (o.ok) b.classList.add('correct');
        else if (q.answered === i) {
          b.classList.add('wrong');
          const w = document.createElement('span');
          w.className = 'why';
          w.textContent = o.why;
          b.appendChild(w);
        }
      }
      b.addEventListener('click', () => answerIdentify(i));
      box.appendChild(b);
    });
    const fb = $('#id-feedback');
    if (q.answered === null) fb.textContent = '';
    else if (q.options[q.answered].ok) { fb.className = 'feedback ok'; fb.textContent = '¡Correcto!'; }
    else { fb.className = 'feedback bad'; fb.textContent = 'No es esa. La correcta está marcada en verde.'; }
    const s = state.idScore;
    $('#id-score').textContent = s.total ? `Aciertos: ${s.ok} / ${s.total}` : '';
  }

  function answerIdentify(i) {
    const q = state.identify;
    if (q.answered !== null) return;
    q.answered = i;
    state.idScore.total++;
    if (q.options[i].ok) state.idScore.ok++;
    renderIdentify();
  }

  /* ================= ejercicio: dibujar vistas ================= */

  function newDraw(cells) {
    state.figs.dibujar = cells;
    state.drawing = { alzado: {}, planta: {}, perfil: {} };
    state.drawResult = null;
    state.drawSolution = false;
  }

  function renderDraw() {
    const fig = state.figs.dibujar;
    if (!fig) return;
    const box = $('#views-draw');
    const exp = DT.computeAllViews(fig);
    const r = state.drawResult;
    DT.svg.renderLayout(box, (k) => ({
      segs: state.drawing[k],
      opts: {
        editable: true,
        onSeg: (key) => drawSeg(k, key),
        solution: state.drawSolution ? exp[k] : null,
        errors: r ? r.errors[k] : null,
        expected: exp[k],
      },
    }), DT.svg.legend());
    $('#draw-solution').textContent = state.drawSolution ? 'Ocultar solución' : 'Ver solución';
    const fb = $('#draw-feedback');
    if (r) {
      const bad = (k) => r.wrong[k] + r.missing[k];
      DT.MAIN_VIEWS.forEach((k) => DT.svg.setBadge(box, k, bad(k) === 0));
      if (DT.MAIN_VIEWS.every((k) => !bad(k))) {
        fb.className = 'feedback ok';
        fb.textContent = '¡Perfecto! Las tres vistas son correctas.';
      } else {
        const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);
        fb.className = 'feedback bad';
        fb.innerHTML = '<b>Revisa:</b><ul>' + DT.MAIN_VIEWS.filter(bad).map((k) => {
          const parts = [];
          if (r.wrong[k]) parts.push(plural(r.wrong[k], 'tramo mal (en rojo)', 'tramos mal (en rojo)'));
          if (r.missing[k]) parts.push(r.missing[k] === 1 ? 'falta 1 tramo' : 'faltan ' + r.missing[k] + ' tramos');
          return `<li>${DT.VIEWS[k].name}: ${parts.join(' y ')}</li>`;
        }).join('') + '</ul>';
      }
    } else fb.textContent = '';
  }

  function drawSeg(view, key) {
    const d = state.drawing[view];
    const t = state.drawTool;
    if (t === 'x' || d[key] === t) delete d[key];
    else d[key] = t;
    state.drawResult = null;
    renderDraw();
  }

  function checkDraw() {
    const exp = DT.computeAllViews(state.figs.dibujar);
    const res = { errors: {}, wrong: {}, missing: {} };
    DT.MAIN_VIEWS.forEach((k) => {
      const e = exp[k], g = state.drawing[k];
      const errs = {};
      let missing = 0;
      DT.ALL_SEG_KEYS.forEach((s) => {
        if ((e[s] || null) === (g[s] || null)) return;
        if (g[s]) errs[s] = true; // sobra o tipo de línea equivocado: se marca en rojo
        else missing++;           // falta: solo se cuenta, para no revelar la solución
      });
      res.errors[k] = errs;
      res.wrong[k] = Object.keys(errs).length;
      res.missing[k] = missing;
    });
    state.drawResult = res;
    renderDraw();
  }

  /* ================= origen de la pieza de los ejercicios ================= */

  function newExercise(cells) {
    const m = state.mode;
    if (!cells || !DT.count(cells)) { toast('La figura está vacía'); return; }
    if (m === 'construir') {
      state.target = DT.clone(cells);
      state.figs.construir = DT.empty();
      state.undo.construir = [];
      state.redo.construir = [];
      state.buildResult = null;
    } else if (m === 'identificar') newIdentify(DT.clone(cells));
    else if (m === 'dibujar') newDraw(DT.clone(cells));
    refresh();
  }

  function randomExercise() {
    const level = $('#ex-level').value;
    const prev = state.mode === 'construir' ? state.target : state.figs[state.mode];
    newExercise(DT.randomFigure(level, prev ? DT.encode(prev) : null));
  }

  function ensureExercise() {
    const m = state.mode;
    if (m === 'construir' && !state.target) randomExercise();
    else if ((m === 'identificar' || m === 'dibujar') && !state.figs[m]) randomExercise();
  }

  /* ================= cambio de modo ================= */

  const HINTS = {
    edit: 'Clic: añadir bloque · Clic derecho o Mayús+clic: quitar · Arrastrar: girar · Rueda: zoom',
    view: 'Arrastrar: girar la pieza · Rueda o pellizco: zoom',
  };

  function setMode(m) {
    if (!MODES.includes(m)) return;
    state.mode = m;
    document.body.dataset.mode = m;
    $$('#modes button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    $('#hint').textContent = EDITABLE[m] ? HINTS.edit : HINTS.view;
    scene.previewCell(null);
    if (m !== 'libre') ensureExercise();
    refresh();
  }

  /* ================= guardar / cargar ================= */

  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch (e) { return []; }
  }
  function storeSaved(list) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }

  function renderSaved() {
    const ul = $('#saved');
    ul.innerHTML = '';
    const list = loadSaved();
    if (!list.length) {
      ul.innerHTML = '<li class="muted">No hay figuras guardadas en este navegador.</li>';
      return;
    }
    list.forEach((f, i) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = f.name;
      const code = document.createElement('code');
      code.textContent = f.code;
      const load = document.createElement('button');
      load.textContent = 'Abrir';
      load.addEventListener('click', () => {
        const c = DT.decode(f.code);
        if (c) { commit(c); toast('Figura «' + f.name + '» cargada'); }
      });
      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = 'Eliminar';
      del.addEventListener('click', () => {
        if (!confirm('¿Eliminar «' + f.name + '»?')) return;
        const l = loadSaved();
        l.splice(i, 1);
        storeSaved(l);
        renderSaved();
      });
      li.append(name, code, load, del);
      ul.appendChild(li);
    });
  }

  function saveCurrent() {
    const fig = state.figs.libre;
    if (!DT.count(fig)) { toast('La figura está vacía'); return; }
    const name = $('#save-name').value.trim() || 'Figura ' + (loadSaved().length + 1);
    const list = loadSaved();
    list.unshift({ name, code: DT.encode(fig), date: Date.now() });
    if (!storeSaved(list.slice(0, 100))) { toast('No se pudo guardar en este navegador'); return; }
    $('#save-name').value = '';
    renderSaved();
    toast('Guardada «' + name + '»');
  }

  /* ================= eventos ================= */

  function bind() {
    $$('#modes button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

    $$('#tool-mode button').forEach((b) => b.addEventListener('click', () => {
      $$('#tool-mode button').forEach((x) => x.classList.toggle('active', x === b));
      scene.setMode(b.dataset.tool);
    }));
    $('#btn-undo').addEventListener('click', undo);
    $('#btn-redo').addEventListener('click', redo);
    $('#btn-clear').addEventListener('click', () => commit(DT.empty()));

    $$('.tb-cam [data-cam]').forEach((b) => b.addEventListener('click', () => scene.viewFrom(b.dataset.cam)));
    $('#opt-ortho').addEventListener('change', (e) => scene.setOrtho(e.target.checked));
    $('#opt-xray').addEventListener('change', (e) => {
      scene.setXray(e.target.checked);
      document.body.classList.toggle('xray', e.target.checked);
    });
    $('#opt-dirs').addEventListener('change', (e) => scene.setShowDirections(e.target.checked));
    $('#opt-color').addEventListener('change', (e) => scene.setColorByView(e.target.checked));
    $('#opt-blocks').addEventListener('change', (e) => scene.setShowBlockEdges(e.target.checked));

    // Ejemplos (modo libre)
    const chips = $('#examples');
    const sel = $('#ex-example');
    DT.EXAMPLES.forEach((e) => {
      const b = document.createElement('button');
      b.textContent = e.name;
      b.addEventListener('click', () => commit(DT.fromLayers(e.layers)));
      chips.appendChild(b);
      const o = document.createElement('option');
      o.value = e.name;
      o.textContent = e.name;
      sel.appendChild(o);
    });
    $('#btn-random').addEventListener('click', () => commit(DT.randomFigure('media', DT.encode(state.figs.libre))));

    // Código / enlace (modo libre)
    const loadCode = (input, fn) => {
      const c = DT.decode(input.value);
      if (!c) { toast('Código no válido'); return; }
      fn(c);
    };
    $('#btn-load-code').addEventListener('click', () => loadCode($('#code'), (c) => commit(c)));
    $('#code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-load-code').click(); });
    $('#btn-copy-link').addEventListener('click', () => copyText(linkFor('libre', state.figs.libre)));
    $('#btn-save').addEventListener('click', saveCurrent);
    $('#save-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveCurrent(); });

    // Ejercicios: origen de la pieza
    $('#ex-new').addEventListener('click', randomExercise);
    $('#ex-from-editor').addEventListener('click', () => {
      if (!DT.count(state.figs.libre)) { toast('Primero construye una figura en el editor libre'); return; }
      newExercise(state.figs.libre);
    });
    sel.addEventListener('change', () => {
      if (sel.value) newExercise(exampleCells(sel.value));
      sel.value = '';
    });
    $('#ex-load-code').addEventListener('click', () => loadCode($('#ex-code'), newExercise));
    $('#ex-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#ex-load-code').click(); });
    $('#ex-copy-link').addEventListener('click', () => {
      const m = state.mode;
      copyText(linkFor(m, m === 'construir' ? state.target : state.figs[m]));
    });

    // Construir
    $('#build-check').addEventListener('click', checkBuild);
    $('#build-solution').addEventListener('click', () => commit(DT.clone(state.target)));
    $('#build-mine').addEventListener('change', renderBuild);

    // Identificar
    $('#id-next').addEventListener('click', randomExercise);

    // Dibujar
    $$('#draw-tool button').forEach((b) => b.addEventListener('click', () => {
      $$('#draw-tool button').forEach((x) => x.classList.toggle('active', x === b));
      state.drawTool = b.dataset.t;
    }));
    $('#draw-check').addEventListener('click', checkDraw);
    $('#draw-solution').addEventListener('click', () => { state.drawSolution = !state.drawSolution; renderDraw(); });
    $('#draw-clear').addEventListener('click', () => {
      state.drawing = { alzado: {}, planta: {}, perfil: {} };
      state.drawResult = null;
      renderDraw();
    });

    // Teclado
    window.addEventListener('keydown', (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    });
  }

  /* ================= inicio ================= */

  function init() {
    buildLayers();
    bind();
    renderSaved();
    applyHash();
    // Pegar otro enlace en la misma pestaña solo cambia el #: se vuelve a leer.
    window.addEventListener('hashchange', applyHash);
  }

  function applyHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const mode = p.get('m');
    const cells = DT.decode(p.get('f'));
    if (mode && MODES.includes(mode) && mode !== 'libre' && cells) {
      state.mode = mode;
      newExercise(cells);
      setMode(mode);
    } else {
      if (cells) state.figs.libre = cells;
      else if (!DT.count(state.figs.libre)) state.figs.libre = exampleCells('Escalera');
      setMode('libre');
    }
  }

  init();
})();
