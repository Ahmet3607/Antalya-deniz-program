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
