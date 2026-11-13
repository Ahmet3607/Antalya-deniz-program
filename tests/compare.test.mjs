// Çalıştırma: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { circularMean, compareValues, decisionValue, sourceWeight, describe } from '../js/compare.js';
import { exposureFactor } from '../js/analysis.js';

const wave = { key: 'wave_height', label: 'Dalga yüksekliği', unit: 'm', digits: 1, tolAbs: 0.2, tolRel: 0.3 };
const dir = { key: 'wave_direction', label: 'Dalga yönü', unit: '°', circular: true, calmBelow: 0.2 };
const e = (name, value, weight = 1, strength = 1) => ({ id: name, name, value, weight, strength });

test('yön ortalaması daireseldir', () => {
  const m = circularMean([350, 10]);
  assert.ok(m < 1 || m > 359);
});

test('uyumlu kaynaklar', () => {
  const c = compareValues(wave, [e('A', 0.5), e('B', 0.6), e('C', 0.7)]);
  assert.equal(c.agreement, 'good');
  assert.equal(c.min, 0.5);
  assert.equal(c.max, 0.7);
  assert.ok(Math.abs(c.mean - 0.6) < 1e-9);
  assert.match(describe(wave, c), /3 kaynak 0,5–0,7 m/);
});

test('ayrışan kaynaklarda karar en yüksek değere göre', () => {
  const c = compareValues(wave, [e('A', 0.5), e('B', 1.2)]);
  assert.equal(c.agreement, 'poor');
  assert.equal(decisionValue(c), 1.2);
  assert.match(describe(wave, c), /önemli fark/);
});

test('eksik veri gizlenmez', () => {
  const c = compareValues(wave, [e('A', 0.5), e('B', null)]);
  assert.equal(c.agreement, 'single');
  assert.deepEqual(c.missing, ['B']);
  assert.equal(compareValues(wave, [e('A', null)]).agreement, 'none');
});

test('yön farkı', () => {
  assert.equal(compareValues(dir, [e('A', 350), e('B', 10)]).agreement, 'good');
  assert.equal(compareValues(dir, [e('A', 90), e('B', 270)]).agreement, 'poor');
});

test('yüksek çözünürlüklü ve güncel model daha ağır', () => {
  const fine = sourceWeight({ resKm: 5, runAgeH: 6, distKm: 3 });
  const coarse = sourceWeight({ resKm: 25, runAgeH: 30, distKm: 20 });
  assert.ok(fine > coarse * 3);
});

test('koy açıklığı', () => {
  const spot = { open: [90, 170], shelter: 1 };
  assert.equal(exposureFactor(spot, 120), 1);
  assert.equal(exposureFactor(spot, 300), 0.15);
  assert.ok(exposureFactor(spot, 185) < 1 && exposureFactor(spot, 185) > 0.5);
});

// ---- saat aralığı raporu ----
import { groupNotes, trendNote, waveWord, windWord, rainWord, aboveFlatCm } from '../js/advisor.js';

test('sözle anlatım', () => {
  assert.equal(windWord(3).word, 'esmez');
  assert.equal(windWord(10).word, 'hafif eser');
  assert.equal(windWord(50).word, 'çok sert, fırtına');
  assert.equal(waveWord(0.05).word, 'çarşaf gibi');
  assert.equal(rainWord(0.3).word, 'çiseleme');
  assert.equal(rainWord(12).word, 'sağanak');
  assert.equal(aboveFlatCm(0.5), 25); // 0,5 m tepe–çukur = düz denizden 25 cm
});

test('ardışık saatlerdeki aynı uyarı birleşir', () => {
  const out = groupNotes([
    { time: '2026-11-14T06:00', notes: [] },
    { time: '2026-11-14T09:00', notes: ['Koy içinde dalga var (0,6 m): zor.'] },
    { time: '2026-11-14T10:00', notes: ['Koy içinde dalga var (0,7 m): zor.'] },
  ]);
  assert.deepEqual(out, ['09:00–10:59: Koy içinde dalga var (0,6 m): zor.']);
});

test('aralık içinde dalga artınca saatiyle haber verir', () => {
  const hours = [0.1, 0.15, 0.4, 0.5].map((v, i) => ({ time: `2026-11-14T0${6 + i}:00`, w: v }));
  const note = trendNote(hours, (h) => h.w, waveWord, (first, peak) => `${first.time.slice(11, 16)}/${peak.time.slice(11, 16)}`);
  assert.equal(note, '08:00/09:00');
  assert.equal(trendNote(hours.slice(0, 2).map((h) => ({ ...h, w: 0.15 })), (h) => h.w, waveWord, () => 'x'), null);
});
