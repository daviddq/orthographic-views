/*
 * Modelo de la figura (3x3x3 bloques) y cálculo de vistas diédricas.
 *
 * Coordenadas de la rejilla:
 *   x: 0..2 de izquierda a derecha (mirando la pieza de frente)
 *   y: 0..2 de abajo arriba
 *   z: 0..2 de atrás hacia delante (z = 2 es la fila más cercana al observador del alzado)
 *
 * Cada vista se calcula en un "espacio de vista" (u, v, d):
 *   u: hacia la derecha del dibujo, v: hacia arriba del dibujo, d: profundidad desde el observador.
 * Las aristas proyectadas caen siempre sobre la cuadrícula 3x3 de la vista, así que cada vista
 * se describe como un conjunto de segmentos unitarios:
 *   "H:i:vb" segmento horizontal de (i, vb) a (i+1, vb)
 *   "V:ub:j" segmento vertical de (ub, j) a (ub, j+1)
 * con valor 'v' (arista vista, línea continua) o 'h' (arista oculta, línea discontinua).
 */
(function (root) {
  'use strict';

  const N = 3;
  const SIZE = N * N * N;

  const idx = (x, y, z) => y * 9 + z * 3 + x;
  const inRange = (x, y, z) => x >= 0 && x < N && y >= 0 && y < N && z >= 0 && z < N;
  const empty = () => new Uint8Array(SIZE);
  const clone = (c) => new Uint8Array(c);
  const get = (c, x, y, z) => (inRange(x, y, z) ? c[idx(x, y, z)] : 0);
  const count = (c) => c.reduce((a, b) => a + b, 0);
  const equals = (a, b) => a.every((v, i) => v === b[i]);

  /* ---------- Codificación (27 bits en base 36) ---------- */

  function encode(c) {
    let n = 0;
    for (let i = SIZE - 1; i >= 0; i--) n = n * 2 + (c[i] ? 1 : 0);
    return n.toString(36).toUpperCase();
  }

  function decode(s) {
    s = String(s == null ? '' : s).trim();
    if (!/^[0-9a-z]{1,6}$/i.test(s)) return null;
    let n = parseInt(s, 36);
    if (!(n >= 0) || n >= 2 ** SIZE) return null;
    const c = empty();
    for (let i = 0; i < SIZE; i++) {
      c[i] = n % 2;
      n = Math.floor(n / 2);
    }
    return c;
  }

  /** levels[y][fila z (0 = atrás)][x] con '#' = bloque. */
  function fromLayers(levels) {
    const c = empty();
    levels.forEach((rows, y) => rows.forEach((row, z) => {
      for (let x = 0; x < N; x++) if (row[x] === '#') c[idx(x, y, z)] = 1;
    }));
    return c;
  }

  /** ¿Todos los bloques están en el suelo o sobre otro bloque? */
  function isSupported(c) {
    for (let y = 1; y < N; y++)
      for (let z = 0; z < N; z++)
        for (let x = 0; x < N; x++)
          if (get(c, x, y, z) && !get(c, x, y - 1, z)) return false;
    return true;
  }

  /* ---------- Aristas ---------- */

  /**
   * Una arista de la red está rodeada por 4 celdas (en orden cíclico).
   * Es una arista real del sólido si la superficie no es plana en ella:
   * 1 o 3 celdas llenas (esquina convexa/cóncava) o 2 en diagonal.
   * Dos bloques contiguos con caras coplanarias NO generan arista.
   */
  function isFeature(a, b, c, d) {
    const n = a + b + c + d;
    if (n === 1 || n === 3) return true;
    if (n === 2) return !!((a && c) || (b && d));
    return false;
  }

  /** Aristas del sólido en 3D (coordenadas de la red, 0..3). */
  function featureEdges3D(cells) {
    const C = (x, y, z) => get(cells, x, y, z);
    const out = [];
    for (let i = 0; i < N; i++)
      for (let a = 0; a <= N; a++)
        for (let b = 0; b <= N; b++) {
          // paralela a X en (y=a, z=b)
          if (isFeature(C(i, a - 1, b - 1), C(i, a, b - 1), C(i, a, b), C(i, a - 1, b)))
            out.push([i, a, b, i + 1, a, b]);
          // paralela a Y en (x=a, z=b)
          if (isFeature(C(a - 1, i, b - 1), C(a, i, b - 1), C(a, i, b), C(a - 1, i, b)))
            out.push([a, i, b, a, i + 1, b]);
          // paralela a Z en (x=a, y=b)
          if (isFeature(C(a - 1, b - 1, i), C(a, b - 1, i), C(a, b, i), C(a - 1, b, i)))
            out.push([a, b, i, a, b, i + 1]);
        }
    return out;
  }

  /* ---------- Vistas (sistema europeo) ---------- */

  // map(u, v, d) -> [x, y, z]
  const VIEWS = {
    // Observador delante (z+), mirando hacia atrás.
    alzado: { name: 'Alzado', map: (u, v, d) => [u, v, 2 - d] },
    // Observador encima. En el sistema europeo la planta va debajo del alzado
    // y la parte frontal de la pieza queda abajo en el dibujo.
    planta: { name: 'Planta', map: (u, v, d) => [u, 2 - d, 2 - v] },
    // Observador a la izquierda (x-). Se dibuja a la derecha del alzado;
    // la parte frontal de la pieza queda a la derecha en el dibujo.
    perfil: { name: 'Perfil izquierdo', map: (u, v, d) => [d, v, u] },
    // Solo se usa para generar respuestas erróneas plausibles.
    perfilDerecho: { name: 'Perfil derecho', map: (u, v, d) => [2 - d, v, 2 - u] },
  };
  const MAIN_VIEWS = ['alzado', 'planta', 'perfil'];

  function computeView(cells, viewKey) {
    const map = VIEWS[viewKey].map;
    const G = (u, v, d) => {
      if (u < 0 || u >= N || v < 0 || v >= N || d < 0 || d >= N) return 0;
      const p = map(u, v, d);
      return cells[idx(p[0], p[1], p[2])];
    };
    // ¿Hay material en la columna (u, v) delante de la profundidad k?
    const front = (u, v, k) => {
      for (let d = 0; d < k; d++) if (G(u, v, d)) return true;
      return false;
    };
    const segs = {};
    for (let i = 0; i < N; i++) {
      for (let b = 0; b <= N; b++) {
        // Segmento horizontal H:i:b (aristas paralelas a u)
        let t = null;
        for (let k = 0; k <= N; k++) {
          if (!isFeature(G(i, b - 1, k - 1), G(i, b, k - 1), G(i, b, k), G(i, b - 1, k))) continue;
          // Oculta si a ambos lados del segmento hay material más cerca del observador.
          if (front(i, b - 1, k) && front(i, b, k)) t = 'h';
          else { t = 'v'; break; }
        }
        if (t) segs['H:' + i + ':' + b] = t;

        // Segmento vertical V:b:i (aristas paralelas a v)
        t = null;
        for (let k = 0; k <= N; k++) {
          if (!isFeature(G(b - 1, i, k - 1), G(b, i, k - 1), G(b, i, k), G(b - 1, i, k))) continue;
          if (front(b - 1, i, k) && front(b, i, k)) t = 'h';
          else { t = 'v'; break; }
        }
        if (t) segs['V:' + b + ':' + i] = t;
      }
    }
    return segs;
  }

  function computeAllViews(cells) {
    const r = {};
    MAIN_VIEWS.forEach((k) => (r[k] = computeView(cells, k)));
    return r;
  }

  /** Todas las claves de segmento posibles de una vista (24). */
  const ALL_SEG_KEYS = (() => {
    const keys = [];
    for (let i = 0; i < N; i++)
      for (let b = 0; b <= N; b++) {
        keys.push('H:' + i + ':' + b);
        keys.push('V:' + b + ':' + i);
      }
    return keys;
  })();

  function segCoords(key) {
    const [dir, a, b] = key.split(':');
    const p = +a, q = +b;
    return dir === 'H' ? [p, q, p + 1, q] : [p, q, p, q + 1];
  }

  /** Une segmentos unitarios colineales del mismo tipo en líneas largas. */
  function segsToLines(segs) {
    const lines = [];
    const run = (keyAt, mk) => {
      let cur = null;
      for (let i = 0; i <= N; i++) {
        const t = i < N ? segs[keyAt(i)] : undefined;
        if (cur && cur.t === t) { cur.len++; continue; }
        if (cur) lines.push(mk(cur));
        cur = t ? { s: i, len: 1, t } : null;
      }
    };
    for (let b = 0; b <= N; b++) {
      run((i) => 'H:' + i + ':' + b, (r) => ({ x1: r.s, y1: b, x2: r.s + r.len, y2: b, t: r.t }));
      run((i) => 'V:' + b + ':' + i, (r) => ({ x1: b, y1: r.s, x2: b, y2: r.s + r.len, t: r.t }));
    }
    return lines;
  }

  function segsKey(segs) {
    return Object.keys(segs).sort().map((k) => k + '=' + segs[k]).join(',');
  }

  function mapSegs(segs, fn) {
    const r = {};
    Object.keys(segs).forEach((k) => {
      const out = fn(k, segs[k]);
      if (out && out[1]) r[out[0]] = out[1];
    });
    return r;
  }

  /** Simetría izquierda-derecha del dibujo. */
  const mirrorU = (segs) => mapSegs(segs, (k, t) => {
    const [d, a, b] = k.split(':');
    return d === 'H' ? ['H:' + (N - 1 - a) + ':' + b, t] : ['V:' + (N - +a) + ':' + b, t];
  });
  /** Simetría arriba-abajo del dibujo. */
  const flipV = (segs) => mapSegs(segs, (k, t) => {
    const [d, a, b] = k.split(':');
    return d === 'H' ? ['H:' + a + ':' + (N - +b), t] : ['V:' + a + ':' + (N - 1 - b), t];
  });
  const withoutHidden = (segs) => mapSegs(segs, (k, t) => (t === 'h' ? null : [k, t]));
  const hiddenAsVisible = (segs) => mapSegs(segs, (k) => [k, 'v']);

  function hasHidden(cells) {
    return MAIN_VIEWS.some((v) => Object.values(computeView(cells, v)).includes('h'));
  }

  /* ---------- Generación aleatoria ---------- */

  const DIFFICULTY = {
    facil: { min: 3, max: 6, hidden: false },
    media: { min: 6, max: 10, hidden: false },
    dificil: { min: 9, max: 15, hidden: true },
  };

  const randInt = (n) => Math.floor(Math.random() * n);

  /** Pieza aleatoria conexa y apoyada (todos los bloques sobre el suelo u otro bloque). */
  function randomFigure(level, avoidCode) {
    const cfg = DIFFICULTY[level] || DIFFICULTY.media;
    for (let attempt = 0; attempt < 200; attempt++) {
      const c = empty();
      c[idx(randInt(N), 0, randInt(N))] = 1;
      const target = cfg.min + randInt(cfg.max - cfg.min + 1);
      let n = 1;
      while (n < target) {
        const cand = [];
        for (let y = 0; y < N; y++)
          for (let z = 0; z < N; z++)
            for (let x = 0; x < N; x++) {
              if (get(c, x, y, z)) continue;
              if (y > 0 && !get(c, x, y - 1, z)) continue;
              const adj = get(c, x - 1, y, z) || get(c, x + 1, y, z) || get(c, x, y - 1, z) ||
                get(c, x, y + 1, z) || get(c, x, y, z - 1) || get(c, x, y, z + 1);
              if (!adj) continue;
              // Favorece crecer hacia arriba para que haya relieve.
              const w = y > 0 ? 3 : 2;
              for (let i = 0; i < w; i++) cand.push([x, y, z]);
            }
        if (!cand.length) break;
        const p = cand[randInt(cand.length)];
        c[idx(p[0], p[1], p[2])] = 1;
        n++;
      }
      if (n < cfg.min) continue;
      if (cfg.hidden && !hasHidden(c)) continue;
      // Que tenga altura (si no, las vistas son demasiado triviales).
      if (cfg.min > 3 && ![9, 10, 11, 12, 13, 14, 15, 16, 17].some((i) => c[i])) continue;
      if (avoidCode && encode(c) === avoidCode) continue;
      return c;
    }
    return fromLayers([['...', '##.', '###'], ['...', '#..', '#..'], ['...', '...', '...']]);
  }

  /** Cambia un bloque al azar (para respuestas erróneas). */
  function mutate(cells) {
    const c = clone(cells);
    for (let t = 0; t < 50; t++) {
      const i = randInt(SIZE);
      c[i] = c[i] ? 0 : 1;
      if (count(c) > 0 && !equals(c, cells)) return c;
      c[i] = cells[i];
    }
    return c;
  }

  /* ---------- Figuras de ejemplo ---------- */

  const EXAMPLES = [
    { name: 'Escalera', layers: [['###', '###', '###'], ['###', '###', '...'], ['###', '...', '...']] },
    { name: 'Ele', layers: [['#..', '#..', '###'], ['#..', '...', '...'], ['#..', '...', '...']] },
    { name: 'Cruz', layers: [['.#.', '###', '.#.'], ['...', '.#.', '...'], ['...', '.#.', '...']] },
    { name: 'Pirámide', layers: [['###', '###', '###'], ['...', '.#.', '...'], ['...', '.#.', '...']] },
    { name: 'Puente', layers: [['#.#', '#.#', '#.#'], ['###', '###', '###'], ['...', '...', '...']] },
    { name: 'Silla', layers: [['#.#', '...', '#.#'], ['###', '###', '###'], ['###', '...', '...']] },
    { name: 'Hueco trasero', layers: [['#.#', '###', '###'], ['###', '#.#', '...'], ['...', '...', '...']] },
    { name: 'Voladizo', layers: [['#..', '#..', '#..'], ['###', '#..', '#..'], ['###', '...', '...']] },
    { name: 'Cubo mordido', layers: [['###', '###', '###'], ['###', '###', '###'], ['###', '###', '##.']] },
    { name: 'Torre y muro', layers: [['###', '...', '..#'], ['###', '...', '..#'], ['...', '...', '..#']] },
  ];

  const api = {
    N, SIZE, idx, inRange, empty, clone, get, count, equals,
    encode, decode, fromLayers, isSupported,
    isFeature, featureEdges3D,
    VIEWS, MAIN_VIEWS, computeView, computeAllViews, ALL_SEG_KEYS, segCoords, segsToLines, segsKey,
    mirrorU, flipV, withoutHidden, hiddenAsVisible, hasHidden,
    DIFFICULTY, randomFigure, mutate, EXAMPLES,
  };

  root.DT = Object.assign(root.DT || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
