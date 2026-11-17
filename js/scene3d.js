/*
 * Escena 3D (Three.js r147, sin módulos para que funcione abriendo index.html con doble clic).
 * Coordenadas del mundo: centro de la base en el origen, frente hacia +Z.
 * Celda (x, y, z) de la rejilla -> centro en (x - 1, y + 0.5, z - 1).
 */
(function (root) {
  'use strict';
  const THREE = root.THREE;
  const DT = root.DT;

  const COLORS = {
    block: 0xf2c48d,
    other: 0xe9e1d3,
    alzado: 0x5b9ee6,
    planta: 0x5fc373,
    perfil: 0xec7f73,
    featureEdge: 0x1b2027,
    hiddenEdge: 0x1b2027,
    blockEdge: 0x8a6a45,
  };

  const PRESETS = {
    iso: new THREE.Vector3(-1, 0.9, 1.3),
    frente: new THREE.Vector3(0, 0, 1),
    arriba: new THREE.Vector3(0, 1, 0.0005),
    izquierda: new THREE.Vector3(-1, 0, 0),
  };
  const DIST = 15;

  function textSprite(text, color, w = 1.7) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 128;
    const g = cv.getContext('2d');
    g.font = 'bold 64px system-ui, Segoe UI, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.strokeText(text, 256, 64);
    g.fillStyle = color; g.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(cv);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(w, w / 4, 1);
    s.renderOrder = 10;
    return s;
  }

  function floorText(text, color) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 128;
    const g = cv.getContext('2d');
    g.font = 'bold 72px system-ui, Segoe UI, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color; g.fillText(text, 256, 64);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.4),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  function arrow(tail, dir, len, color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len - 0.4, 12), mat);
    shaft.position.y = (len - 0.4) / 2;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.4, 20), mat);
    head.position.y = len - 0.2;
    g.add(shaft, head);
    g.position.copy(tail);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return g;
  }

  class Scene3D {
    constructor(container, opts = {}) {
      this.container = container;
      this.onAction = opts.onAction || (() => {});
      this.editable = true;
      this.mode = 'add';
      this.cells = DT.empty();
      this.voxelMeshes = [];
      this.anim = null;

      const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }));
      r.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
      container.appendChild(r.domElement);
      r.domElement.style.touchAction = 'none';

      this.scene = new THREE.Scene();
      this.target = new THREE.Vector3(0, 1.6, 0);
      this.persp = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
      this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
      this.camera = this.persp;
      this.persp.position.copy(PRESETS.iso).normalize().multiplyScalar(DIST).add(this.target);

      const c = (this.controls = new THREE.OrbitControls(this.persp, r.domElement));
      c.target.copy(this.target);
      c.enableDamping = true;
      c.dampingFactor = 0.12;
      c.enablePan = false;
      c.minDistance = 5;
      c.maxDistance = 40;
      c.minZoom = 0.4;
      c.maxZoom = 3;
      c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: -1 };
      c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
      c.update();

      this._buildStatic();
      this._buildMaterials();
      this.voxels = new THREE.Group();
      this.scene.add(this.voxels);

      const ghostGeo = new THREE.BoxGeometry(1.04, 1.04, 1.04);
      this.ghost = new THREE.Mesh(ghostGeo, new THREE.MeshBasicMaterial({
        color: 0x22aa55, transparent: true, opacity: 0.35, depthWrite: false,
      }));
      this.ghost.visible = false;
      this.ghost.renderOrder = 5;
      this.scene.add(this.ghost);

      this.raycaster = new THREE.Raycaster();
      this._bindPointer();

      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(container);
      this.resize();

      const loop = () => {
        requestAnimationFrame(loop);
        this._tick();
      };
      loop();
    }

    /* ---------- construcción de la escena ---------- */

    _buildStatic() {
      const s = this.scene;
      s.add(new THREE.HemisphereLight(0xffffff, 0x8a96a8, 0.75));
      const d1 = new THREE.DirectionalLight(0xffffff, 0.55);
      d1.position.set(-4, 9, 6);
      s.add(d1);
      const d2 = new THREE.DirectionalLight(0xffffff, 0.2);
      d2.position.set(5, 3, -4);
      s.add(d2);

      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(3.5, 0.12, 3.5),
        new THREE.MeshLambertMaterial({ color: 0xc8d2de })
      );
      slab.position.y = -0.062;
      s.add(slab);

      this.ground = new THREE.Mesh(
        new THREE.PlaneGeometry(3, 3),
        new THREE.MeshLambertMaterial({ color: 0xeef2f7, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
      );
      this.ground.rotation.x = -Math.PI / 2;
      s.add(this.ground);

      const pts = [];
      for (let i = 0; i <= 3; i++) {
        const p = i - 1.5;
        pts.push(p, 0.003, -1.5, p, 0.003, 1.5, -1.5, 0.003, p, 1.5, 0.003, p);
      }
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      s.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x9aa8b8 })));

      // Caja límite 3x3x3
      const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(3, 3, 3)),
        new THREE.LineBasicMaterial({ color: 0x9aa8b8, transparent: true, opacity: 0.45 })
      );
      box.position.y = 1.5;
      this.boundBox = box;
      s.add(box);

      // Marca del frente (siempre visible)
      const front = new THREE.Mesh(
        new THREE.BoxGeometry(3.5, 0.05, 0.08),
        new THREE.MeshLambertMaterial({ color: COLORS.alzado })
      );
      front.position.set(0, 0.0, 1.72);
      s.add(front);
      const ft = floorText('FRENTE', '#1f5fae');
      ft.position.set(0, 0.006, 2.15);
      s.add(ft);
      const frontArrow = arrow(new THREE.Vector3(0, 0.15, 3.3), new THREE.Vector3(0, 0, -1), 0.9, COLORS.alzado);
      s.add(frontArrow);

      // Direcciones de observación
      const dirs = (this.dirGroup = new THREE.Group());
      // Flechas que se ocultan cuando apuntan casi hacia la cámara (se verían como un punto).
      this.facingArrows = [{ items: [frontArrow], dir: new THREE.Vector3(0, 0, -1) }];
      const addDir = (tail, dir, color, text, textColor, labelPos) => {
        const a = arrow(tail, dir, 2, color);
        const l = textSprite(text, textColor);
        l.position.copy(labelPos);
        dirs.add(a, l);
        this.facingArrows.push({ items: [a, l], dir });
      };
      addDir(new THREE.Vector3(0, 1.5, 5.2), new THREE.Vector3(0, 0, -1), COLORS.alzado, 'ALZADO', '#1f5fae', new THREE.Vector3(0, 2.15, 4.4));
      addDir(new THREE.Vector3(0, 6.0, 0), new THREE.Vector3(0, -1, 0), COLORS.planta, 'PLANTA', '#23853a', new THREE.Vector3(0, 6.4, 0));
      addDir(new THREE.Vector3(-5.2, 1.5, 0), new THREE.Vector3(1, 0, 0), COLORS.perfil, 'PERFIL', '#b8392c', new THREE.Vector3(-4.4, 2.15, 0));
      s.add(dirs);
    }

    _buildMaterials() {
      const mk = (color) => new THREE.MeshLambertMaterial({
        color, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      });
      const plain = mk(COLORS.block);
      this.matPlain = [plain, plain, plain, plain, plain, plain];
      const other = mk(COLORS.other);
      // Orden de caras de BoxGeometry: +x, -x, +y, -y, +z, -z
      this.matByView = [other, mk(COLORS.perfil), mk(COLORS.planta), other, mk(COLORS.alzado), other];
      this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
      this.blockEdgeGeo = new THREE.EdgesGeometry(this.boxGeo);
      this.blockEdgeMat = new THREE.LineBasicMaterial({ color: COLORS.blockEdge, transparent: true, opacity: 0.45 });
      this.featureMat = new THREE.LineBasicMaterial({ color: COLORS.featureEdge });
      this.colorByView = false;
      this.showBlockEdges = true;

      // Modo rayos X: superficie exterior translúcida + aristas ocultas discontinuas.
      // Todo va en la cola de transparentes y se ordena por renderOrder:
      // 1) caras (escriben profundidad), 2) aristas vistas, 3) aristas ocultas
      // (solo se pintan donde hay una cara delante: GreaterDepth).
      this.xray = false;
      this.xrayFaceMat = new THREE.MeshLambertMaterial({
        vertexColors: true, transparent: true, opacity: 0.3, depthWrite: true,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      });
      this.xrayVisibleMat = new THREE.LineBasicMaterial({
        color: COLORS.featureEdge, transparent: true, depthWrite: false,
      });
      this.xrayHiddenMat = new THREE.LineDashedMaterial({
        color: COLORS.hiddenEdge, dashSize: 0.11, gapSize: 0.07, transparent: true, opacity: 0.95,
        depthWrite: false, depthFunc: THREE.GreaterDepth,
      });
    }

    /** Caras exteriores (las que dan a una celda vacía) como una sola malla. */
    _surfaceGeometry() {
      const FACES = [
        { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], k: 'other' },
        { n: [-1, 0, 0], c: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], k: 'perfil' },
        { n: [0, 1, 0], c: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], k: 'planta' },
        { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], k: 'other' },
        { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], k: 'alzado' },
        { n: [0, 0, -1], c: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], k: 'other' },
      ];
      const pos = [], nor = [], col = [];
      const color = new THREE.Color();
      const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      for (let y = 0; y < 3; y++)
        for (let z = 0; z < 3; z++)
          for (let x = 0; x < 3; x++) {
            if (!DT.get(this.cells, x, y, z)) continue;
            FACES.forEach((f) => {
              if (DT.get(this.cells, x + f.n[0], y + f.n[1], z + f.n[2])) return;
              let p = f.c.map((c) => [x + c[0] - 1.5, y + c[1], z + c[2] - 1.5]);
              const cr = cross(sub(p[1], p[0]), sub(p[2], p[0]));
              if (cr[0] * f.n[0] + cr[1] * f.n[1] + cr[2] * f.n[2] < 0) p = p.reverse();
              color.setHex(this.colorByView ? COLORS[f.k] : COLORS.block);
              [p[0], p[1], p[2], p[0], p[2], p[3]].forEach((v) => {
                pos.push(v[0], v[1], v[2]);
                nor.push(f.n[0], f.n[1], f.n[2]);
                col.push(color.r, color.g, color.b);
              });
            });
          }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return geo;
    }

    /* ---------- API ---------- */

    setCells(cells) {
      this.cells = DT.clone(cells);
      this._rebuild();
    }

    _rebuild() {
      const g = this.voxels;
      while (g.children.length) {
        const ch = g.children.pop();
        if (ch.userData.ownGeometry) ch.geometry.dispose();
      }
      this.voxelMeshes = [];
      const mats = this.colorByView ? this.matByView : this.matPlain;
      for (let y = 0; y < 3; y++)
        for (let z = 0; z < 3; z++)
          for (let x = 0; x < 3; x++) {
            if (!DT.get(this.cells, x, y, z)) continue;
            const m = new THREE.Mesh(this.boxGeo, mats);
            m.position.set(x - 1, y + 0.5, z - 1);
            m.userData.cell = [x, y, z];
            // En rayos X los cubos no se ven, pero siguen sirviendo para el clic (raycast).
            m.visible = !this.xray;
            g.add(m);
            this.voxelMeshes.push(m);
            if (this.showBlockEdges && !this.xray) {
              const e = new THREE.LineSegments(this.blockEdgeGeo, this.blockEdgeMat);
              e.position.copy(m.position);
              g.add(e);
            }
          }
      const pos = [];
      DT.featureEdges3D(this.cells).forEach((e) => {
        pos.push(e[0] - 1.5, e[1], e[2] - 1.5, e[3] - 1.5, e[4], e[5] - 1.5);
      });
      if (pos.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const fe = new THREE.LineSegments(geo, this.xray ? this.xrayVisibleMat : this.featureMat);
        fe.userData.ownGeometry = true;
        fe.renderOrder = 2;
        g.add(fe);
        if (this.xray) {
          const surf = new THREE.Mesh(this._surfaceGeometry(), this.xrayFaceMat);
          surf.userData.ownGeometry = true;
          surf.renderOrder = 1;
          g.add(surf);
          const hidden = new THREE.LineSegments(geo, this.xrayHiddenMat);
          hidden.computeLineDistances();
          hidden.renderOrder = 3;
          g.add(hidden);
        }
      }
      this._refreshHover();
    }

    setXray(v) { this.xray = v; this._rebuild(); }

    setEditable(v) {
      this.editable = v;
      if (!v) this.ghost.visible = false;
    }

    setMode(m) {
      this.mode = m;
      this._refreshHover();
    }

    setColorByView(v) { this.colorByView = v; this._rebuild(); }
    setShowBlockEdges(v) { this.showBlockEdges = v; this._rebuild(); }
    setShowDirections(v) { this.dirGroup.visible = v; }

    /** Resalta una celda (desde el editor por capas). */
    previewCell(cell, remove) {
      if (!cell) { this.ghost.visible = false; this._preview = null; return; }
      this._preview = { cell, remove };
      this._showGhost(cell, remove);
    }

    setOrtho(on) {
      const from = this.camera;
      const to = on ? this.ortho : this.persp;
      if (from === to) return;
      const dist = from.position.distanceTo(this.controls.target);
      to.position.copy(from.position);
      to.quaternion.copy(from.quaternion);
      if (on) {
        // misma escala aparente que en perspectiva
        const visH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2));
        this.ortho.zoom = (2 * this._orthoHalf) / visH;
      } else {
        const visH = (2 * this._orthoHalf) / this.ortho.zoom;
        const d = visH / (2 * Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2)));
        const dir = from.position.clone().sub(this.controls.target).normalize();
        to.position.copy(this.controls.target).addScaledVector(dir, d);
      }
      to.updateProjectionMatrix();
      this.camera = to;
      this.controls.object = to;
      this.controls.update();
    }

    viewFrom(name) {
      const dir = PRESETS[name];
      if (!dir) return;
      const cam = this.camera;
      const dist = cam === this.persp ? this._fitDist() : cam.position.distanceTo(this.controls.target);
      this.anim = {
        t0: performance.now(),
        dur: 550,
        fromDir: cam.position.clone().sub(this.controls.target).normalize(),
        fromDist: cam.position.distanceTo(this.controls.target),
        toDir: dir.clone().normalize(),
        toDist: dist,
        fromTarget: this.controls.target.clone(),
        toTarget: this.target.clone(),
        fromZoom: cam.zoom,
        // En ortográfica, las vistas principales se acercan para que la pieza se vea grande.
        toZoom: cam === this.ortho ? (name === 'iso' ? 1 : 1.6) : cam.zoom,
      };
    }

    resize() {
      const w = this.container.clientWidth || 1;
      const h = this.container.clientHeight || 1;
      this.renderer.setSize(w, h);
      const a = w / h;
      this.persp.aspect = a;
      this.persp.updateProjectionMatrix();
      // Semialtura del encuadre ortográfico: que quepan pieza y flechas.
      this._orthoHalf = a < 1.3 ? 5.6 * 1.3 / a : 5.6;
      const hh = this._orthoHalf;
      Object.assign(this.ortho, { left: -hh * a, right: hh * a, top: hh, bottom: -hh });
      this.ortho.updateProjectionMatrix();
      if (!this._placed) {
        this._placed = true;
        this.persp.position.copy(PRESETS.iso).normalize().multiplyScalar(this._fitDist()).add(this.target);
        this.controls.update();
      }
    }

    /** Distancia para que pieza y flechas quepan según la proporción del visor. */
    _fitDist() {
      return DIST * Math.max(1, 1.3 / (this.persp.aspect || 1));
    }

    /* ---------- bucle ---------- */

    _tick() {
      const a = this.anim;
      if (a) {
        let t = (performance.now() - a.t0) / a.dur;
        if (t >= 1) { t = 1; this.anim = null; }
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const dir = a.fromDir.clone().lerp(a.toDir, e);
        if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0.001);
        dir.normalize();
        const tg = a.fromTarget.clone().lerp(a.toTarget, e);
        this.controls.target.copy(tg);
        this.camera.position.copy(tg).addScaledVector(dir, a.fromDist + (a.toDist - a.fromDist) * e);
        if (this.camera === this.ortho) {
          this.ortho.zoom = a.fromZoom + (a.toZoom - a.fromZoom) * e;
          this.ortho.updateProjectionMatrix();
        }
      }
      this.controls.update();
      const view = this.camera.getWorldDirection(this._tmpDir || (this._tmpDir = new THREE.Vector3()));
      this.facingArrows.forEach((f) => {
        const show = view.dot(f.dir) < 0.95;
        f.items.forEach((o) => (o.visible = show));
      });
      this.renderer.render(this.scene, this.camera);
    }

    /* ---------- interacción ---------- */

    _bindPointer() {
      const el = this.renderer.domElement;
      const pointers = new Map();
      let down = null;
      this._shift = false;

      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.addEventListener('pointerdown', (e) => {
        pointers.set(e.pointerId, true);
        if (pointers.size > 1) { down = null; return; }
        down = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button, shift: e.shiftKey };
        this.anim = null;
      });
      const up = (e) => {
        pointers.delete(e.pointerId);
        if (!down) return;
        const d = down;
        down = null;
        if (e.type !== 'pointerup') return;
        const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
        if (moved > 6 || performance.now() - d.t > 600) return;
        if (!this.editable) return;
        const remove = d.button === 2 || d.shift || this.mode === 'remove';
        if (d.button !== 0 && d.button !== 2) return;
        const p = this._pick(e.clientX, e.clientY);
        if (!p) return;
        if (remove && p.hit) this.onAction('remove', p.hit);
        else if (!remove && p.add) this.onAction('add', p.add);
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointermove', (e) => {
        if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down = null;
        if (e.pointerType !== 'mouse' || e.buttons) { if (e.pointerType !== 'mouse') this.ghost.visible = false; return; }
        this._lastMouse = { x: e.clientX, y: e.clientY };
        this._shift = e.shiftKey;
        this._refreshHover();
      });
      el.addEventListener('pointerleave', () => {
        this._lastMouse = null;
        this._refreshHover();
      });
      root.addEventListener('keydown', (e) => { if (e.key === 'Shift') { this._shift = true; this._refreshHover(); } });
      root.addEventListener('keyup', (e) => { if (e.key === 'Shift') { this._shift = false; this._refreshHover(); } });
    }

    _pick(cx, cy) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hits = this.raycaster.intersectObjects(this.voxelMeshes.concat([this.ground]), false);
      if (!hits.length) return null;
      const h = hits[0];
      if (h.object === this.ground) {
        const x = Math.floor(h.point.x + 1.5), z = Math.floor(h.point.z + 1.5);
        if (!DT.inRange(x, 0, z) || DT.get(this.cells, x, 0, z)) return null;
        return { hit: null, add: [x, 0, z] };
      }
      const c = h.object.userData.cell;
      const n = h.face.normal;
      const a = [c[0] + Math.round(n.x), c[1] + Math.round(n.y), c[2] + Math.round(n.z)];
      return { hit: c, add: DT.inRange(a[0], a[1], a[2]) ? a : null };
    }

    _showGhost(cell, remove) {
      this.ghost.material.color.setHex(remove ? 0xdd3333 : 0x22aa55);
      this.ghost.material.opacity = remove ? 0.45 : 0.35;
      this.ghost.position.set(cell[0] - 1, cell[1] + 0.5, cell[2] - 1);
      this.ghost.visible = true;
    }

    _refreshHover() {
      if (this._preview) { this._showGhost(this._preview.cell, this._preview.remove); return; }
      if (!this.editable || !this._lastMouse) { this.ghost.visible = false; return; }
      const p = this._pick(this._lastMouse.x, this._lastMouse.y);
      const remove = this._shift || this.mode === 'remove';
      if (p && remove && p.hit) this._showGhost(p.hit, true);
      else if (p && !remove && p.add) this._showGhost(p.add, false);
      else this.ghost.visible = false;
    }
  }

  root.DT.Scene3D = Scene3D;
  root.DT.COLORS3D = COLORS;
})(window);
