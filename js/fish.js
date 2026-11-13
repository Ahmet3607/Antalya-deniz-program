// Balık aktivitesi ve tekne avı önerileri.
// Canlı bir "balık çıkma oranı" verisi yayınlayan kaynak yoktur. Buradaki yüzdeler; mevsim,
// su sıcaklığı ve o saatin deniz koşullarından hesaplanan kural tabanlı AKTİVİTE TAHMİNİDİR.
// Mevsim ve yem bilgileri genel Akdeniz amatör balıkçılık bilgisidir; kendi tecrübene göre düzelt.

import { moonPhase, visibilityEstimate, isDaylight, rainInfo } from './advisor.js';

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// likes: clear (temiz su), murky (bulanık), current (hafif akıntı), twilight (gün doğumu/batımı),
//        surge (köpüklü hafif dalga), calm (sakin su), river (dere ağzı)
export const SPEAR_SPECIES = [
  { name: 'Sinarit', months: [9, 10, 11, 12, 1, 2, 3, 4, 5], temp: [16, 25], depth: '10–30 m', where: 'akıntılı burunlar, kayalık düşüşler', likes: ['clear', 'current', 'twilight'] },
  { name: 'Akya', months: [5, 6, 7, 8, 9, 10, 11], temp: [20, 29], depth: 'yüzey–15 m', where: 'burun uçları, yem balığı sürüleri', likes: ['current', 'twilight'] },
  { name: 'Sarıkuyruk', months: [4, 5, 6, 9, 10, 11, 12], temp: [18, 26], depth: '15–35 m', where: 'ada çevreleri, açık sığlıklar', likes: ['current', 'clear'] },
  { name: 'Sargos / karagöz', months: ALL, temp: [14, 28], depth: '2–15 m', where: 'köpüklü kayalık sığlıklar', likes: ['surge'] },
  { name: 'Eşkina', months: ALL, temp: [17, 27], depth: '5–25 m', where: 'kovuk ve mağara ağızları', likes: ['twilight', 'calm'] },
  { name: 'İskaroz', months: [4, 5, 6, 7, 8, 9, 10, 11], temp: [19, 29], depth: '3–20 m', where: 'yosunlu kayalıklar', likes: ['calm', 'clear'] },
  { name: 'Çipura', months: [9, 10, 11, 12, 1], temp: [15, 25], depth: '3–15 m', where: 'kumluk–eriştelik geçişleri', likes: ['calm'] },
  { name: 'Levrek', months: [11, 12, 1, 2, 3], temp: [12, 20], depth: '1–8 m', where: 'dere ağızları, köpüklü sığlıklar', likes: ['murky', 'surge', 'river'] },
  { name: 'Aslan balığı', months: ALL, temp: [18, 30], depth: '5–30 m', where: 'kaya kovukları, batıklar (istilacı tür)', likes: [] },
];

// needs: yöntemin rahat uygulanabildiği en yüksek dalga (m) ve rüzgâr (km/sa)
export const BOAT_METHODS = [
  {
    id: 'slow', name: 'Slow jig', depth: '40–90 m', where: 'sert zemin, kayalık kenarları', needs: { wave: 0.8, wind: 25 },
    targets: [{ n: 'Mercan / fangri', m: ALL }, { n: 'Sinarit', m: [9, 10, 11, 12, 1, 2, 3, 4, 5] }, { n: 'Sarıkuyruk', m: [4, 5, 6, 9, 10, 11, 12] }, { n: 'Trança', m: ALL }],
  },
  {
    id: 'live', name: 'Canlı yemle sürütme', depth: '30–70 m', where: 'kayalık kenarları, dipten 2–5 m yukarı', needs: { wave: 0.8, wind: 28 },
    lure: 'Canlı kalamar, zargana veya istavrit',
    targets: [{ n: 'Sinarit', m: [9, 10, 11, 12, 1, 2, 3, 4, 5] }, { n: 'Akya', m: [5, 6, 7, 8, 9, 10, 11] }, { n: 'Sarıkuyruk', m: [4, 5, 6, 9, 10, 11, 12] }],
  },
  {
    id: 'troll', name: 'Sırtı (trolling)', depth: 'yüzey', where: '30 m ve daha derin açıklar, kuş ve yem sürüsü olan yerler', needs: { wave: 1.0, wind: 32 },
    lure: '7–11 cm maket balık veya tüy takımı, 4–6 mil hız',
    targets: [{ n: 'Lambuka', m: [8, 9, 10, 11] }, { n: 'Yazılı orkinos', m: [6, 7, 8, 9, 10, 11] }, { n: 'Palamut', m: [9, 10, 11, 12] }, { n: 'İskarmoz', m: [6, 7, 8, 9, 10, 11] }],
  },
  {
    id: 'light', name: 'Hafif jig / at-çek', depth: '10–30 m', where: 'burun önleri, gün doğumu ve batımı', needs: { wave: 1.0, wind: 32 },
    lure: '20–40 g metal jig',
    targets: [{ n: 'İskarmoz', m: [6, 7, 8, 9, 10, 11] }, { n: 'Palamut', m: [9, 10, 11, 12] }, { n: 'Yazılı orkinos', m: [6, 7, 8, 9, 10, 11] }, { n: 'Akya', m: [5, 6, 7, 8, 9, 10, 11] }],
  },
  {
    id: 'bottom', name: 'Dip oltası', depth: '15–50 m', where: 'kumluk–kayalık geçişleri', needs: { wave: 1.0, wind: 30 },
    lure: 'Karides, kalamar şeridi, boru kurdu',
    targets: [{ n: 'Mercan', m: ALL }, { n: 'Fangri', m: ALL }, { n: 'Karagöz', m: ALL }, { n: 'Çipura', m: [9, 10, 11, 12, 1] }],
  },
  {
    id: 'egi', name: 'Kalamar', depth: '5–25 m', where: 'eriştelik üstü, akşam alacası ve gece', needs: { wave: 0.6, wind: 22 },
    lure: '3.0–3.5 numara kalamar zokası',
    targets: [{ n: 'Kalamar', m: [11, 12, 1, 2, 3] }],
  },
];

function twilightAt(series, time) {
  const hr = Number(time.slice(11, 13));
  const d = series.daily ? series.daily.time.indexOf(time.slice(0, 10)) : -1;
  if (d < 0) return hr <= 8 || hr >= 16;
  const rise = Number(series.daily.sunrise[d].slice(11, 13));
  const set = Number(series.daily.sunset[d].slice(11, 13));
  return Math.abs(hr - rise) <= 1 || Math.abs(set - hr) <= 1;
}

// Zıpkın için türlerin aktivite tahmini (%).
export function spearFish(series, i, spot) {
  const h = series.hours[i];
  const month = Number(h.time.slice(5, 7));
  const sst = h.dv.sea_surface_temperature;
  const cur = h.dv.ocean_current_velocity;
  const lw = h.localWave;
  const vis = visibilityEstimate(series, i, spot);
  const cond = {
    clear: vis.cls === 'clear' || vis.cls === 'medium',
    murky: vis.cls === 'murky' || vis.cls === 'bad',
    current: cur != null && cur >= 0.2 && cur <= 0.8,
    twilight: twilightAt(series, h.time),
    surge: lw != null && lw >= 0.3 && lw <= 0.8,
    calm: lw != null && lw < 0.3,
    river: spot.river >= 0.8,
  };
  const past = series.hours[Math.max(0, i - 6)];
  const dp = h.pressure != null && past.pressure != null ? h.pressure - past.pressure : null;
  const moon = moonPhase(new Date(h.time + ':00+03:00'));

  const list = SPEAR_SPECIES.map((sp) => {
    let score = 20;
    const inSeason = sp.months.includes(month);
    score += inSeason ? 20 : -12;
    if (sst != null) {
      if (sst >= sp.temp[0] && sst <= sp.temp[1]) score += 15;
      else if (sst < sp.temp[0] - 2 || sst > sp.temp[1] + 2) score -= 15;
    }
    for (const k of sp.likes) if (cond[k]) score += 10;
    if (dp != null && dp <= -2) score += 5;
    if (dp != null && dp >= 3) score -= 5;
    if (moon.nearSyzygy) score += 3;
    return { ...sp, inSeason, pct: Math.max(5, Math.min(90, Math.round(score))) };
  }).sort((a, b) => b.pct - a.pct);

  return { list, moon, sstKnown: sst != null };
}

// Tekne için yöntem önerileri: nerede, kaç metrede, hangi balık, hangi yem ya da jig.
export function boatFishing(series, i) {
  const h = series.hours[i];
  const month = Number(h.time.slice(5, 7));
  const wave = h.dv.wave_height;
  const wind = h.dv.wind_speed_10m;
  const cur = h.dv.ocean_current_velocity;
  const rain = rainInfo(h);
  const lowLight = !isDaylight(series, h.time) || twilightAt(series, h.time) || rain.cls === 'moderate' || rain.cls === 'heavy';
  const colour = lowLight ? 'fosforlu (glow), pembe veya turuncu' : 'gümüş-mavi, sardalya deseni';

  // Slow jig ağırlığı: tekne ne kadar hızlı sürükleniyorsa o kadar ağır.
  let weight = '100–150 g';
  if (wind != null && wind < 12 && (cur == null || cur < 0.4)) weight = '60–100 g';
  else if (wind != null && wind >= 22) weight = '150–200 g';

  return BOAT_METHODS.map((m) => {
    const targets = m.targets.filter((t) => t.m.includes(month)).map((t) => t.n);
    let status = 'ok';
    let statusText = 'Uygun';
    if (targets.length === 0) { status = 'off'; statusText = 'Mevsimi değil'; }
    else if (wave == null || wind == null) { status = 'unknown'; statusText = 'Veri eksik'; }
    else if (wave > m.needs.wave * 1.5 || wind > m.needs.wind * 1.4 || rain.thunder) { status = 'no'; statusText = 'Bu havada olmaz'; }
    else if (wave > m.needs.wave || wind > m.needs.wind) { status = 'hard'; statusText = 'Zor'; }
    const lure = m.id === 'slow' ? `${weight} slow jig; renk: ${colour}` : m.lure;
    return { ...m, targets, status, statusText, lure };
  }).sort((a, b) => ['ok', 'hard', 'unknown', 'no', 'off'].indexOf(a.status) - ['ok', 'hard', 'unknown', 'no', 'off'].indexOf(b.status));
}
