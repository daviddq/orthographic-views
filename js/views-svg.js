/*
 * Dibujo de las vistas en SVG.
 * Aristas vistas: línea continua gruesa. Aristas ocultas: línea discontinua fina
 * (empieza y termina en trazo, como indica la norma).
 */
(function (root) {
  'use strict';
  const DT = root.DT;
  const NS = 'http://www.w3.org/2000/svg';
  const U = 40; // unidades SVG por bloque
  const PAD = 12;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(e);
    return e;
  }

  const X = (u) => u * U;
  const Y = (v) => (3 - v) * U;

  function dashFor(len) {
    const d = 6, g0 = 3.6;
    const n = Math.max(2, Math.round((len + g0) / (d + g0)));
    const g = (len - n * d) / (n - 1);
    return d + ' ' + g.toFixed(2);
  }

  function drawLines(g, segs, cls) {
    DT.segsToLines(segs).forEach((l) => {
      const len = (Math.abs(l.x2 - l.x1) + Math.abs(l.y2 - l.y1)) * U;
      const a = { x1: X(l.x1), y1: Y(l.y1), x2: X(l.x2), y2: Y(l.y2), class: (l.t === 'v' ? 'ln-v' : 'ln-h') + (cls ? ' ' + cls : '') };
      if (l.t === 'h') a['stroke-dasharray'] = dashFor(len);
      el('line', a, g);
    });
  }

  /**
   * Crea el SVG de una vista.
   * opts.grid       cuadrícula de ayuda
   * opts.editable   añade zonas de clic por segmento -> opts.onSeg(key)
   * opts.solution   segmentos de la solución, dibujados en tenue debajo
   * opts.errors     { key: true } segmentos erróneos (se marcan en rojo)
   * opts.expected   segmentos esperados (para pintar los que faltan)
   */
  function renderView(segs, opts = {}) {
    const size = 3 * U + 2 * PAD;
    const svg = el('svg', { viewBox: `${-PAD} ${-PAD} ${size} ${size}`, class: 'view-svg', role: 'img' });
    if (opts.label) el('title', null, svg).textContent = opts.label;

    if (opts.grid !== false) {
      const g = el('g', { class: 'grid' }, svg);
      for (let i = 0; i <= 3; i++) {
        el('line', { x1: X(i), y1: Y(0), x2: X(i), y2: Y(3) }, g);
        el('line', { x1: X(0), y1: Y(i), x2: X(3), y2: Y(i) }, g);
      }
    }
    if (opts.solution) drawLines(el('g', { class: 'solution' }, svg), opts.solution);

    drawLines(el('g', { class: 'lines' }, svg), segs || {});

    if (opts.errors) {
      const g = el('g', { class: 'errors' }, svg);
      Object.keys(opts.errors).forEach((k) => {
        const [x1, y1, x2, y2] = DT.segCoords(k);
        const exp = opts.expected && opts.expected[k];
        const got = segs && segs[k];
        const a = { x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2) };
        if (!got) {
          a.class = 'err-missing ' + (exp === 'h' ? 'ln-h' : 'ln-v');
          if (exp === 'h') a['stroke-dasharray'] = dashFor(U);
        } else {
          a.class = 'err-wrong';
        }
        el('line', a, g);
      });
    }

    if (opts.editable) {
      const g = el('g', { class: 'hits' }, svg);
      DT.ALL_SEG_KEYS.forEach((k) => {
        const [x1, y1, x2, y2] = DT.segCoords(k);
        const h = el('line', { x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), class: 'hit', 'data-key': k }, g);
        h.addEventListener('click', () => opts.onSeg && opts.onSeg(k));
      });
    }
    return svg;
  }

  const VIEW_CLASS = { alzado: 'c-alzado', planta: 'c-planta', perfil: 'c-perfil' };

  /**
   * Disposición del sistema europeo:
   *   ALZADO   | PERFIL IZQ.
   *   PLANTA   | (extra)
   * get(viewKey) -> { segs, opts }
   */
  function renderLayout(container, get, extra) {
    container.innerHTML = '';
    container.classList.add('views-layout');
    const cell = (key) => {
      const d = document.createElement('div');
      d.className = 'view-cell v-' + key;
      const lab = document.createElement('div');
      lab.className = 'view-label ' + VIEW_CLASS[key];
      lab.innerHTML = `<span>${DT.VIEWS[key].name}</span><b class="badge"></b>`;
      d.appendChild(lab);
      const r = get(key);
      d.appendChild(renderView(r.segs, Object.assign({ label: DT.VIEWS[key].name }, r.opts)));
      return d;
    };
    container.appendChild(cell('alzado'));
    container.appendChild(cell('perfil'));
    container.appendChild(cell('planta'));
    const ex = document.createElement('div');
    ex.className = 'view-cell v-extra';
    if (extra) ex.appendChild(extra);
    container.appendChild(ex);
  }

  function setBadge(container, key, ok) {
    const b = container.querySelector('.v-' + key + ' .badge');
    if (!b) return;
    b.className = 'badge ' + (ok === true ? 'ok' : ok === false ? 'bad' : '');
    b.textContent = ok === true ? '✓' : ok === false ? '✗' : '';
  }

  function legend() {
    const d = document.createElement('div');
    d.className = 'legend';
    d.innerHTML = `
      <div><svg viewBox="0 0 60 10"><line x1="2" y1="5" x2="58" y2="5" class="ln-v"/></svg>Arista vista</div>
      <div><svg viewBox="0 0 60 10"><line x1="2" y1="5" x2="58" y2="5" class="ln-h" stroke-dasharray="${dashFor(56)}"/></svg>Arista oculta</div>
      <p>Sistema europeo: la planta va debajo del alzado y el perfil izquierdo a su derecha.</p>`;
    return d;
  }

  root.DT.svg = { renderView, renderLayout, setBadge, legend };
})(window);
