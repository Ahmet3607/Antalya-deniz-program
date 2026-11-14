// Ham model verisinden, konum bazında saatlik karşılaştırma ve karar girdileri üretir.

import { VARIABLES, VARS_BY_GROUP } from './config.js';
import { compareValues, decisionValue, sourceWeight, angDiff } from './compare.js';

const indexCache = new WeakMap();

function timeIndex(spotData, time) {
  let map = indexCache.get(spotData);
  if (!map) {
    map = new Map(spotData.time.map((t, i) => [t, i]));
    indexCache.set(spotData, map);
  }
  return map.get(time);
}

export function valueAt(source, spotId, key, time) {
  const sd = source?.ok ? source.spots[spotId] : null;
  const arr = sd?.vars[key];
  if (!arr) return null;
  const i = timeIndex(sd, time);
  return i == null ? null : arr[i] ?? null;
}

// Bu değişkeni vermesi beklenen kaynaklar (çalışmayanlar dahil; eksik veri gizlenmez).
export function sourcesFor(store, key) {
  return Object.values(store).filter((s) => {
    if (s.def.blend) return true;
    return VARS_BY_GROUP[s.def.group]?.includes(key);
  });
}

function weightOf(source, spotId) {
  const sd = source.ok ? source.spots[spotId] : null;
  return sourceWeight({
    resKm: source.def.resKm,
    blend: source.def.blend,
    distKm: sd?.distKm ?? null,
    runAgeH: source.runTime ? (Date.now() - source.runTime) / 3600000 : null,
  });
}

// Bir konum ve saat için tüm değişkenlerin kaynak karşılaştırması.
export function snapshot(store, spot, time) {
  const entries = {};
  const cmp = {};
  const dv = {};
  for (const v of VARIABLES) {
    entries[v.key] = sourcesFor(store, v.key).map((s) => ({
      id: s.def.id,
      name: s.def.name,
      failed: !s.ok,
      value: valueAt(s, spot.id, v.key, time),
      weight: weightOf(s, spot.id),
      strength: v.strengthKey ? valueAt(s, spot.id, v.strengthKey, time) : null,
    }));
    cmp[v.key] = compareValues(v, entries[v.key]);
    dv[v.key] = decisionValue(cmp[v.key]);
  }
  return { time, entries, cmp, dv };
}

function meanAcross(store, spotId, key, time, reducer = 'mean') {
  const vals = sourcesFor(store, key)
    .map((s) => valueAt(s, spotId, key, time))
    .filter((x) => x != null);
  if (vals.length === 0) return null;
  if (reducer === 'max') return Math.max(...vals);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Dalganın geldiği yöne göre koyun ne kadar açık olduğu (1 = tam açık, 0,15 = arkada kalıyor).
export function exposureFactor(spot, waveDir) {
  if (waveDir == null || !spot.open) return 1; // aramayla eklenen yerde açıklık bilinmiyor
  const [a, b] = spot.open;
  const span = (b - a + 360) % 360;
  const rel = (waveDir - a + 360) % 360;
  if (rel <= span) return 1;
  const outside = Math.min(angDiff(waveDir, a), angDiff(waveDir, b));
  if (outside <= 30) return 1 - (outside / 30) * 0.5;
  if (outside <= 90) return 0.5 - ((outside - 30) / 60) * 0.35;
  return 0.15;
}

// Konumun tüm saatleri için seri: karşılaştırma + koy içi dalga + yağış + basınç + hava kodu.
export function buildSeries(store, spot) {
  const first = Object.values(store).find((s) => s.ok && !s.def.blend && s.spots[spot.id]?.time.length);
  if (!first) return { times: [], hours: [], daily: null };
  const times = first.spots[spot.id].time;
  const hours = times.map((time) => {
    const snap = snapshot(store, spot, time);
    const hs = snap.dv.wave_height;
    const factor = exposureFactor(spot, snap.dv.wave_direction) * spot.shelter;
    return {
      ...snap,
      exposure: factor,
      localWave: hs == null ? null : hs * factor,
      rain: meanAcross(store, spot.id, 'precipitation', time),
      pressure: meanAcross(store, spot.id, 'pressure_msl', time),
      weatherCode: meanAcross(store, spot.id, 'weather_code', time, 'max'),
    };
  });
  const dailySrc = Object.values(store).find((s) => s.ok && s.spots[spot.id]?.daily?.sunrise);
  return { times, hours, daily: dailySrc ? dailySrc.spots[spot.id].daily : null };
}
