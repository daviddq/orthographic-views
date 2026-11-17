// Pruebas de la lógica de vistas: node tests/voxels.test.js
const DT = require('../js/voxels.js');
let fail = 0;
const eq = (name, got, exp) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (!ok) { fail++; console.log('FAIL', name, '\n  got', got, '\n  exp', exp); } else console.log('ok  ', name);
};
const sorted = (o) => Object.fromEntries(Object.entries(o).sort());
const square = (u, v, t = 'v') => ({ [`H:${u}:${v}`]: t, [`H:${u}:${v + 1}`]: t, [`V:${u}:${v}`]: t, [`V:${u + 1}:${v}`]: t });

// 1 bloque en (0,0,2) (delante, abajo, izquierda)
let c = DT.empty(); c[DT.idx(0, 0, 2)] = 1;
eq('1 bloque alzado', sorted(DT.computeView(c, 'alzado')), sorted(square(0, 0)));
eq('1 bloque planta (frente abajo)', sorted(DT.computeView(c, 'planta')), sorted(square(0, 0)));
eq('1 bloque perfil izq (frente a la derecha)', sorted(DT.computeView(c, 'perfil')), sorted(square(2, 0)));

// Dos bloques contiguos: sin arista intermedia
c = DT.fromLayers([['...', '...', '##.'], ['...', '...', '...'], ['...', '...', '...']]);
eq('2 bloques coplanarios', sorted(DT.computeView(c, 'alzado')),
  sorted({ 'H:0:0': 'v', 'H:1:0': 'v', 'H:0:1': 'v', 'H:1:1': 'v', 'V:0:0': 'v', 'V:2:0': 'v' }));

// Muro de 2 de alto delante y bloque detrás de 1 de alto: no se ve nada nuevo
c = DT.fromLayers([['#..', '...', '###'], ['...', '...', '###'], ['...', '...', '...']]);
const alz = DT.computeView(c, 'alzado');
eq('bloque detrás de muro -> oculto', [alz['H:0:1'], alz['V:1:0']], ['h', 'h']);

// Hueco trasero: aristas ocultas verticales en el alzado
c = DT.fromLayers(DT.EXAMPLES.find(e => e.name === 'Hueco trasero').layers);
const a2 = DT.computeView(c, 'alzado');
eq('hueco trasero alzado', [a2['V:1:0'], a2['V:2:0']], ['h', 'h']);

// Puente: túnel visible en alzado, oculto en perfil
c = DT.fromLayers(DT.EXAMPLES.find(e => e.name === 'Puente').layers);
const pa = DT.computeView(c, 'alzado'), pp = DT.computeView(c, 'perfil');
eq('puente alzado túnel visible', [pa['V:1:0'], pa['V:2:0'], pa['H:1:1'], pa['H:1:0']], ['v', 'v', 'v', undefined]);
eq('puente perfil túnel oculto', [pp['H:0:1'], pp['H:1:1'], pp['H:2:1']], ['h', 'h', 'h']);

// Codificación
for (let i = 0; i < 200; i++) { const r = DT.randomFigure(['facil', 'media', 'dificil'][i % 3]); if (!DT.equals(DT.decode(DT.encode(r)), r)) { fail++; console.log('FAIL encode'); break; } if (!DT.isSupported(r)) { fail++; console.log('FAIL soporte'); break; } }
eq('decode inválido', DT.decode('zzzzzzz'), null);
// mirror/flip involutivos
const v = DT.computeView(DT.randomFigure('dificil'), 'planta');
eq('mirror involutivo', DT.segsKey(DT.mirrorU(DT.mirrorU(v))), DT.segsKey(v));
eq('flip involutivo', DT.segsKey(DT.flipV(DT.flipV(v))), DT.segsKey(v));
// perfil derecho = espejo del izquierdo en aristas vistas cuando no hay ocultas en el perfil de un solo bloque
c = DT.empty(); c[DT.idx(1, 0, 2)] = 1;
eq('perfil der = espejo (1 bloque)', DT.segsKey(DT.computeView(c, 'perfilDerecho')), DT.segsKey(DT.mirrorU(DT.computeView(c, 'perfil'))));
console.log(fail ? `\n${fail} FALLOS` : '\nTodo OK');
process.exit(fail ? 1 : 0);
