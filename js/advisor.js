// Akıllı sonuç: tekne, zıpkınla dalış, su altı görüşü, yağış, koy ve saat seçimi.
// Buradaki her şey kural tabanlı TAHMİNDİR; ölçüm değildir.

import { BOAT_LIMITS, DIVE_LIMITS } from './config.js';
import { angDiff } from './compare.js';

const n1 = (v) => v.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n0 = (v) => Math.round(v).toLocaleString('tr-TR');

// ---------- sözle anlatım ----------

const pick = (v, steps) => {
  let i = 0;
  while (i < steps.length - 1 && v >= steps[i][0]) i++;
  return { idx: i, word: steps[i][1] };
};

// Rüzgâr (km/sa)
export const windWord = (v) => (v == null ? null : pick(v, [
  [6, 'esmez'], [12, 'hafif eser'], [20, 'orta eser'], [30, 'kuvvetli eser'], [45, 'sert eser'], [Infinity, 'çok sert, fırtına'],
]));

// Dalga (m, tepe–çukur)
export const waveWord = (v) => (v == null ? null : pick(v, [
  [0.1, 'çarşaf gibi'], [0.3, 'hafif çırpıntı'], [0.6, 'hafif dalgalı'], [1.0, 'orta dalgalı'], [1.5, 'dalgalı'], [2.5, 'sert dalgalı'], [Infinity, 'çok sert'],
]));

// Yağış (mm/sa)
export const rainWord = (v) => (v == null ? null : pick(v, [
  [0.1, 'yağış yok'], [0.5, 'çiseleme'], [1, 'hafif yağmur'], [4, 'orta yağmur'], [10, 'kuvvetli yağmur'], [Infinity, 'sağanak'],
]));

// Dalganın düz deniz hizasından yüksekliği (cm). Tahmin tepe–çukur verdiği için yarısı alınır.
export const aboveFlatCm = (m) => (m == null ? null : Math.round(m * 50));

// ---------- yağış ----------

// Saatlik yağış: modellerin ortalaması, en yükseği ve kaç modelin yağış gösterdiği.
export function rainInfo(h) {
  const c = h.cmp.precipitation;
  const thunder = h.weatherCode != null && h.weatherCode >= 95;
  if (!c || c.count === 0) return { known: false, mm: null, max: null, models: 0, wet: 0, cls: 'unknown', label: 'veri yok', thunder };
  const wet = h.entries.precipitation.filter((e) => e.value != null && e.value >= 0.1).length;
  const mm = c.mean;
  let cls = 'none';
  let label = 'yağış yok';
  if (mm >= 10) { cls = 'violent'; label = 'sağanak'; }
  else if (mm >= 4) { cls = 'heavy'; label = 'kuvvetli yağmur'; }
  else if (mm >= 1) { cls = 'moderate'; label = 'orta yağmur'; }
  else if (mm >= 0.5) { cls = 'light'; label = 'hafif yağmur'; }
  else if (mm >= 0.1) { cls = 'drizzle'; label = 'çiseleme'; }
  else if (wet > 0) { cls = 'possible'; label = 'yağış beklenmez'; }
  if (thunder) label += ', gök gürültülü';
  return { known: true, mm, max: c.max, models: c.count, wet, cls, label, thunder };
}

// Seçilen günün yağış özeti.
export function dayRain(series, day) {
  const hours = series.hours.filter((h) => h.time.startsWith(day)).map((h) => ({ time: h.time, ...rainInfo(h) }));
  const known = hours.filter((h) => h.known);
  if (known.length === 0) return { known: false, hours, text: 'Bu gün için yağış verisi yok.' };
  const total = known.reduce((a, h) => a + h.mm, 0);
  const wetHours = known.filter((h) => h.mm >= 0.1);
  const peak = known.reduce((a, h) => (h.mm > a.mm ? h : a), known[0]);
  const thunder = known.some((h) => h.thunder);
  let text;
  if (wetHours.length === 0) {
    text = known.some((h) => h.wet > 0)
      ? 'Yağış beklenmiyor; yalnızca tek tük model çok hafif yağış gösteriyor.'
      : 'Yağış beklenmiyor.';
  } else {
    const from = wetHours[0].time.slice(11, 16);
    const to = wetHours[wetHours.length - 1].time.slice(11, 13) + ':59';
    text = `${from}–${to} arasında ${wetHours.length} saat yağış bekleniyor. En yoğun saat ${peak.time.slice(11, 16)}: ${peak.label}, ${n1(peak.mm)} mm.`;
  }
  if (thunder) text += ' Gök gürültülü fırtına riski var.';
  return { known: true, hours, total, wetHours: wetHours.length, peak, thunder, text };
}

// ---------- tekne ----------

// Eşik aşıldığında kullanıcıya nedenini ve sonucunu söyleyen cümleler.
const WHY_BOAT = {
  wave: {
    caution: (v) => `Açıkta dalga ${n1(v)} m: tekne sallanır, demirde durmak ve dalıcı almak zorlaşır.`,
    bad: (v) => `Açıkta dalga ${n1(v)} m: tekne sert vurur, demir tutmaz, dalıcıyı tekneye almak tehlikeli olur.`,
  },
  wind: {
    caution: (v) => `Rüzgâr ${n0(v)} km/sa: tekne demirde döner ve sürüklenir, serpinti yapar.`,
    bad: (v) => `Rüzgâr ${n0(v)} km/sa: dalgayı hızla büyütür, tekneyi kontrol etmek ve limana dönmek zorlaşır.`,
  },
  gust: {
    caution: (v) => `Hamleler ${n0(v)} km/sa hıza ulaşıyor: ani sarsıntılara hazırlıklı ol.`,
    bad: (v) => `Hamleler ${n0(v)} km/sa hıza ulaşıyor: ani darbeler tekneyi yatırır, güvertede durmak tehlikeli.`,
  },
};

export function boatVerdict(h) {
  const wave = h.dv.wave_height;
  const wind = h.dv.wind_speed_10m;
  const gust = h.dv.wind_gusts_10m;
  const period = h.dv.wave_period;
  // Dalga ya da rüzgâr hiç yoksa "uygun" denmez.
  if (wave == null || wind == null) {
    const what = wave == null && wind == null ? 'Dalga ve rüzgâr' : wave == null ? 'Dalga' : 'Rüzgâr';
    return { level: 'unknown', title: 'Karar verilemiyor', notes: [`${what} verisi alınamadı.`] };
  }
  const notes = [];
  const order = ['good', 'caution', 'bad'];
  let level = 'good';
  const bump = (to) => { if (order.indexOf(to) > order.indexOf(level)) level = to; };
  const check = (val, key, text) => {
    if (val == null) {
      notes.push(`${text} verisi yok; karar eksik bilgiyle verildi.`);
      bump('caution');
    } else if (val > BOAT_LIMITS.caution[key]) {
      bump('bad');
      notes.push(WHY_BOAT[key].bad(val));
    } else if (val > BOAT_LIMITS.good[key]) {
      bump('caution');
      notes.push(WHY_BOAT[key].caution(val));
    }
  };
  check(wave, 'wave', 'Dalga');
  check(wind, 'wind', 'Rüzgâr');
  check(gust, 'gust', 'Hamle');
  if (wave != null && period != null && wave >= 1 && period < 4.5) {
    notes.push('Dalgalar sık ve dik geliyor: tekne baş vurur, seyir sert ve yorucu olur.');
    bump('caution');
  }
  const rain = rainInfo(h);
  if (rain.thunder) {
    notes.push('Gök gürültülü fırtına riski var: yıldırım ve ani sert rüzgâr nedeniyle açıkta olmak tehlikeli.');
    bump('bad');
  } else if (rain.cls === 'heavy' || rain.cls === 'violent') {
    notes.push('Kuvvetli yağış var: görüş düşer, diğer tekneleri ve kıyıyı seçmek zorlaşır.');
    bump('caution');
  }
  if (['wave_height', 'wind_speed_10m'].some((k) => h.cmp[k].agreement === 'poor')) {
    notes.push('Kaynaklar birbirini tutmuyor; karar en yüksek tahmine göre verildi.');
    bump('caution');
  }
  const title = { good: 'Çıkmak mantıklı', caution: 'Çıkılır, dikkatli ol', bad: 'Çıkmak önerilmez' }[level];
  return { level, title, notes };
}

// ---------- su altı görüşü ----------

// Girdi: son 72 saatin koy içi dalgası, yağış, dere etkisi, rüzgâr.
export function visibilityEstimate(series, i, spot) {
  const h = series.hours[i];
  if (h.localWave == null) {
    return { cls: 'unknown', label: 'Tahmin edilemiyor', range: '', score: null, notes: ['Dalga verisi yok.'], confidence: 'yok' };
  }
  let stirred = h.localWave;
  let rain72 = 0;
  let rainKnown = false;
  for (let j = Math.max(0, i - 72); j < i; j++) {
    const p = series.hours[j];
    if (p.localWave != null) stirred = Math.max(stirred, p.localWave * Math.exp(-(i - j) / 36));
    if (p.rain != null) {
      rain72 += p.rain;
      rainKnown = true;
    }
  }
  const notes = [];
  let score = 0;
  if (stirred >= 1.5) score += 75;
  else if (stirred >= 1.0) score += 55;
  else if (stirred >= 0.6) score += 35;
  else if (stirred >= 0.3) score += 15;
  if (stirred >= 0.6) {
    notes.push(stirred > h.localWave + 0.05
      ? `Önceki günlerde koyda ${n1(stirred)} m etkili dalga vardı; dip kalkmış olabilir.`
      : `Koy içinde yaklaşık ${n1(h.localWave)} m dalga var; su karışık.`);
  } else if (stirred >= 0.3) {
    notes.push('Hafif dalga var; sığlarda az bulanıklık olabilir.');
  } else {
    notes.push('Son 3 günde suyu karıştıracak dalga yok.');
  }
  if (rainKnown) {
    let pts = 0;
    if (rain72 >= 30) pts = 40;
    else if (rain72 >= 10) pts = 25;
    else if (rain72 >= 3) pts = 10;
    const add = pts * spot.river;
    score += add;
    if (add >= 8) notes.push(`Son 3 günde ${n0(rain72)} mm yağış düştü; dere ağzı bulanıklık taşır.`);
    else if (rain72 >= 10) notes.push(`Son 3 günde ${n0(rain72)} mm yağış var ama burada dere etkisi az.`);
  } else {
    notes.push('Yağış verisi alınamadı; tahmin eksik bilgiyle yapıldı.');
  }
  const wind = h.dv.wind_speed_10m;
  const wdir = h.dv.wind_direction_10m;
  if (spot.open && wind != null && wdir != null && wind >= 28) {
    const [a, b] = spot.open;
    const mid = (a + ((b - a + 360) % 360) / 2) % 360;
    if (angDiff(wdir, mid) <= 60) {
      score += 10;
      notes.push('Rüzgâr kıyıya doğru esiyor; yüzey çalkantılı.');
    }
  }
  score = Math.min(100, score);
  let cls;
  let label;
  let range;
  if (score < 20) { cls = 'clear'; label = 'Temiz'; range = '15–25 m'; }
  else if (score < 45) { cls = 'medium'; label = 'Orta'; range = '8–15 m'; }
  else if (score < 70) { cls = 'murky'; label = 'Bulanık'; range = '4–8 m'; }
  else { cls = 'bad'; label = 'Çok bulanık'; range = '4 m altı'; }
  const waveCmp = h.cmp.wave_height;
  const confidence = waveCmp.count >= 3 && waveCmp.agreement === 'good' && rainKnown ? 'orta' : 'düşük';
  return { cls, label, range, score, notes, confidence };
}

export function isDaylight(series, time) {
  const d = series.daily ? series.daily.time.indexOf(time.slice(0, 10)) : -1;
  if (d < 0) {
    const hr = Number(time.slice(11, 13));
    return hr >= 7 && hr <= 17;
  }
  return time >= series.daily.sunrise[d].slice(0, 13) + ':00' && time <= series.daily.sunset[d];
}

// Seçilen günün gün doğumu ve batımı ("06:41" biçiminde); veri yoksa null.
export function sunTimes(series, day) {
  const d = series.daily ? series.daily.time.indexOf(day) : -1;
  if (d < 0) return null;
  return { rise: series.daily.sunrise[d].slice(11, 16), set: series.daily.sunset[d].slice(11, 16) };
}

// ---------- zıpkın ----------

export function diveVerdict(series, i, spot) {
  const h = series.hours[i];
  const boat = boatVerdict(h);
  const vis = visibilityEstimate(series, i, spot);
  const rain = rainInfo(h);
  const lw = h.localWave;
  const wind = h.dv.wind_speed_10m;
  const cur = h.dv.ocean_current_velocity;
  if (lw == null || wind == null) {
    return { level: 'unknown', title: 'Karar verilemiyor', notes: ['Dalga ya da rüzgâr verisi eksik.'], score: null, vis, boat, rain };
  }
  const notes = [];
  const rank = (val, key) => {
    if (val == null) return 1; // bilinmiyorsa ideal sayma
    if (val <= DIVE_LIMITS.ideal[key]) return 0;
    if (val <= DIVE_LIMITS.ok[key]) return 1;
    if (val <= DIVE_LIMITS.marginal[key]) return 2;
    return 3;
  };
  const rw = rank(lw, 'wave');
  const rwind = rank(wind, 'wind');
  const rc = rank(cur, 'current');
  let r = Math.max(rw, rwind, rc);
  const daylight = isDaylight(series, h.time);
  // En belirleyici neden en başta olsun.
  // Gece tek başına engel değildir; fenerle dalınabilir. Yalnızca bilgi olarak belirtilir.
  if (rain.thunder) { r = 3; notes.push('Gök gürültülü fırtına riski var: yıldırım nedeniyle suda olmak tehlikeli.'); }
  if (rw === 3) notes.push(`Koy içinde dalga sert (${n1(lw)} m): seni çabuk yorar, kayalara savurur, dibi kaldırıp suyu bulandırır.`);
  else if (rw === 2) notes.push(`Koy içinde dalga var (${n1(lw)} m): yüzeyde nefes almak zorlaşır, sığlarda su bulanır.`);
  if (rwind === 3) notes.push(`Rüzgâr sert (${n0(wind)} km/sa): yüzeyde seni ve şamandırayı sürükler, tekneye dönmek zorlaşır.`);
  else if (rwind === 2) notes.push(`Rüzgâr kuvvetli (${n0(wind)} km/sa): yüzey çırpıntılı olur, şamandırayı sürükler.`);
  if (cur == null) notes.push('Akıntı verisi yok; suya girince kendin kontrol et.');
  else if (rc === 3) notes.push(`Akıntı çok kuvvetli (${n1(cur)} kn): karşı yüzemezsin, tekneden uzaklaştırır.`);
  else if (rc === 2) notes.push(`Akıntı kuvvetli (${n1(cur)} kn): yüzmek yorar, dalış süren kısalır.`);
  if (vis.cls === 'murky') { r = Math.max(r, 2); notes.push(`Su bulanık (tahmini ${vis.range}): balığı geç görürsün, av verimi düşer.`); }
  if (vis.cls === 'bad') { r = 3; notes.push(`Su çok bulanık (tahmini ${vis.range}): hedefi seçemezsin, zıpkın kullanmak güvenli olmaz.`); }
  if (boat.level === 'bad') { r = 3; notes.push('Deniz tekneyle çıkmaya uygun değil; dalış noktasına ulaşmak ve geri dönmek riskli.'); }
  if (!rain.thunder && (rain.cls === 'heavy' || rain.cls === 'violent')) { r = Math.max(r, 2); notes.push('Kuvvetli yağış var: yüzeyde görüş düşer, dere ağızlarından bulanık su gelir.'); }
  const level = ['ideal', 'ok', 'marginal', 'no'][r];
  const title = { ideal: 'Çok uygun', ok: 'Uygun', marginal: 'Sınırda', no: 'Önerilmez' }[level];

  let score = 100;
  score -= Math.min(40, (lw / DIVE_LIMITS.marginal.wave) * 40);
  score -= Math.min(25, (wind / DIVE_LIMITS.marginal.wind) * 25);
  if (cur != null) score -= Math.min(10, (cur / DIVE_LIMITS.marginal.current) * 10);
  if (vis.score != null) score -= vis.score * 0.35;
  if (rain.known) score -= Math.min(10, rain.mm * 2.5);
  if (h.cmp.wave_height.agreement === 'poor' || h.cmp.wind_speed_10m.agreement === 'poor') score -= 8;
  if (r === 3) score = Math.min(score, 15);
  const info = daylight ? [] : ['Gece saati: fenerle dalınabilir; şamandıra ışığı ve teknede gözcü bulundur.'];
  return { level, title, notes, info, score: Math.max(0, Math.round(score)), vis, boat, rain, daylight };
}

// Saat kutusunun rengi: ikisi de uygunsa yeşil, biri uygunsa sarı, hiçbiri değilse kırmızı.
export function combined(series, i, spot) {
  const dive = diveVerdict(series, i, spot);
  const boat = dive.boat;
  if (boat.level === 'unknown') return { level: 'unknown', label: 'Veri yok', dive, boat };
  const diveOk = dive.level === 'ideal' || dive.level === 'ok';
  const boatOk = boat.level === 'good' || boat.level === 'caution';
  if (diveOk && boatOk) return { level: 'both', label: 'İkisi de', dive, boat };
  if (boatOk) return { level: 'one', label: 'Yalnız tekne', dive, boat };
  if (diveOk) return { level: 'one', label: 'Yalnız zıpkın', dive, boat };
  return { level: 'none', label: 'Uygun değil', dive, boat };
}

// Seçilen gün için en iyi ardışık 3 saat (gece saatleri dahil; fenerle dalınabiliyor).
// minTime verilirse (bugün için şimdiki saat) geçmiş saatler hesaba katılmaz.
// range = [başlangıç, bitiş] saat olarak verilirse yalnızca o aralığa bakılır.
export function bestWindow(series, spot, day, minTime = null, range = null) {
  const scored = [];
  series.hours.forEach((h, i) => {
    if (!h.time.startsWith(day) || (minTime && h.time < minTime)) return;
    if (range) {
      const hr = Number(h.time.slice(11, 13));
      if (hr < range[0] || hr > range[1]) return;
    }
    const v = diveVerdict(series, i, spot);
    if (v.score != null) scored.push({ i, v });
  });
  if (scored.length === 0) return null;
  let best = null;
  for (let k = 0; k < scored.length; k++) {
    const win = scored.slice(k, k + 3);
    if (win.length < Math.min(3, scored.length)) break;
    const avg = win.reduce((a, x) => a + x.v.score, 0) / win.length;
    if (!best || avg > best.avg) best = { avg, win };
  }
  const order = ['ideal', 'ok', 'marginal', 'no'];
  const worst = best.win.reduce((a, x) => (order.indexOf(x.v.level) > order.indexOf(a) ? x.v.level : a), 'ideal');
  return {
    score: Math.round(best.avg),
    from: series.hours[best.win[0].i].time,
    to: series.hours[best.win[best.win.length - 1].i].time,
    level: worst,
    mid: best.win[Math.floor(best.win.length / 2)],
    night: best.win.every((x) => !isDaylight(series, series.hours[x.i].time)),
  };
}

// Haftaya bakış: her gün için kaç saat uygun, en iyi pencere, en yüksek dalga/rüzgâr ve yağış.
// Yalnızca bilgi verir; seçimi değiştirmez.
export function weekOutlook(series, spot, days, nowTime) {
  const out = days.map((day) => {
    const c = { both: 0, tekne: 0, zipkin: 0, total: 0 };
    let maxWave = null;
    let maxWind = null;
    series.hours.forEach((h, i) => {
      if (!h.time.startsWith(day) || h.time < nowTime) return;
      const x = combined(series, i, spot);
      if (x.level === 'unknown') return;
      c.total += 1;
      if (x.level === 'both') c.both += 1;
      else if (x.label === 'Yalnız tekne') c.tekne += 1;
      else if (x.label === 'Yalnız zıpkın') c.zipkin += 1;
      if (h.dv.wave_height != null) maxWave = Math.max(maxWave ?? 0, h.dv.wave_height);
      if (h.dv.wind_speed_10m != null) maxWind = Math.max(maxWind ?? 0, h.dv.wind_speed_10m);
    });
    const rain = dayRain(series, day);
    const best = bestWindow(series, spot, day, day === nowTime.slice(0, 10) ? nowTime : null);
    let level = 'unknown';
    let label = 'Veri yok';
    if (c.total > 0) {
      if (c.both >= 3) { level = 'both'; label = 'Zıpkın ve tekne'; }
      else if (c.tekne + c.both >= 3 || c.zipkin + c.both >= 3) {
        level = 'one';
        label = c.tekne >= c.zipkin ? 'Yalnız tekne' : 'Yalnız zıpkın';
      } else { level = 'none'; label = 'Uygun değil'; }
    }
    return { day, level, label, counts: c, maxWave, maxWind, rain, best };
  });
  const good = out.filter((d) => d.level === 'both');
  const top = good.length
    ? good.reduce((a, d) => (d.counts.both > a.counts.both || (d.counts.both === a.counts.both && (d.best?.score ?? 0) > (a.best?.score ?? 0)) ? d : a))
    : null;
  return { days: out, top, good };
}

// Tüm koyları seçilen gün için sıralar: önce uygunluk düzeyi, sonra puan.
export function rankSpots(allSeries, spots, day, minTime = null, range = null) {
  const order = ['ideal', 'ok', 'marginal', 'no'];
  const key = (r) => (r.best ? order.indexOf(r.best.level) * 1000 - r.best.score : 1e6);
  return spots
    .map((spot) => ({ spot, best: bestWindow(allSeries[spot.id], spot, day, minTime, range) }))
    .sort((a, b) => key(a) - key(b));
}

// Seçilen saatte tekne için en sakin bölge (açık deniz dalgası en düşük olan).
export function calmestSpot(allSeries, spots, time) {
  let best = null;
  for (const spot of spots) {
    const s = allSeries[spot.id];
    const h = s.hours[s.times.indexOf(time)];
    const wave = h?.dv.wave_height;
    if (wave == null) continue;
    if (!best || wave < best.wave) best = { spot, wave, wind: h.dv.wind_speed_10m, windDir: h.dv.wind_direction_10m };
  }
  return best;
}

export function moonPhase(date) {
  const synodic = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14); // bilinen yeni ay
  const age = ((((date.getTime() - ref) / 86400000) % synodic) + synodic) % synodic;
  const names = ['Yeni ay', 'Hilal (büyüyen)', 'İlk dördün', 'Şişkin ay (büyüyen)', 'Dolunay', 'Şişkin ay (küçülen)', 'Son dördün', 'Hilal (küçülen)'];
  return { age, name: names[Math.round((age / synodic) * 8) % 8], nearSyzygy: age < 2.5 || age > synodic - 2.5 || Math.abs(age - synodic / 2) < 2.5 };
}

// ---------- saat aralığı raporu ----------

const hh = (t) => t.slice(11, 16);
const spanText = (a, b) => (a === b ? `Saat ${hh(a)}` : `${hh(a)}–${b.slice(11, 13)}:59`);

// Aynı türden notları ardışık saatlerde birleştirir: "09:00–10:59: Koy içinde dalga var..."
// items: [{ time, notes: [metin] }]
export function groupNotes(items) {
  const keyOf = (t) => t.split(/[(:]/)[0].trim();
  const groups = [];
  const open = new Map();
  items.forEach((it, n) => {
    const seen = new Set();
    for (const text of it.notes) {
      const k = keyOf(text);
      seen.add(k);
      const g = open.get(k);
      if (g && g.last === n - 1) {
        g.last = n;
        g.to = it.time;
      } else {
        const ng = { key: k, from: it.time, to: it.time, last: n, text };
        open.set(k, ng);
        groups.push(ng);
      }
    }
  });
  return groups.map((g) => `${spanText(g.from, g.to)}: ${g.text}`);
}

// Aralık içinde koşul kötüleşiyorsa haber verir: "Saat 09:00'dan itibaren dalga artıyor..."
// get: saatten değeri alır; word: değeri söze çevirir; describe: uyarı cümlesini kurar.
export function trendNote(hours, get, word, describe) {
  const first = hours.find((h) => get(h) != null);
  if (!first) return null;
  const base = word(get(first)).idx;
  const worse = hours.find((h) => get(h) != null && word(get(h)).idx > base);
  if (!worse) return null;
  const peak = hours.reduce((a, h) => (get(h) != null && get(h) > get(a) ? h : a), worse);
  return describe(worse, peak);
}
