// Akıllı sonuç: tekne, zıpkınla dalış, su altı görüşü, balık aktivitesi, koy ve saat seçimi.
// Buradaki her şey kural tabanlı TAHMİNDİR; ölçüm değildir.

import { BOAT_LIMITS, DIVE_LIMITS } from './config.js';
import { compass, angDiff } from './compare.js';

const n1 = (v) => v.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n0 = (v) => Math.round(v).toLocaleString('tr-TR');

export function boatVerdict(h) {
  const wave = h.dv.wave_height;
  const wind = h.dv.wind_speed_10m;
  const gust = h.dv.wind_gusts_10m;
  const period = h.dv.wave_period;
  if (wave == null && wind == null) {
    return { level: 'unknown', title: 'Karar verilemiyor', reasons: ['Dalga ve rüzgâr verisi alınamadı.'] };
  }
  const reasons = [];
  let level = 'good';
  const bump = (to) => {
    const order = ['good', 'caution', 'bad'];
    if (order.indexOf(to) > order.indexOf(level)) level = to;
  };
  const check = (val, key, text) => {
    if (val == null) {
      reasons.push(`${text} verisi yok.`);
      bump('caution');
      return;
    }
    if (val > BOAT_LIMITS.caution[key]) bump('bad');
    else if (val > BOAT_LIMITS.good[key]) bump('caution');
  };
  check(wave, 'wave', 'Dalga');
  check(wind, 'wind', 'Rüzgâr');
  check(gust, 'gust', 'Hamle');
  if (wave != null) reasons.push(`Açık denizde dalga ${n1(wave)} m${period != null ? `, periyot ${n1(period)} sn` : ''}.`);
  if (wind != null) reasons.push(`Rüzgâr ${n0(wind)} kn ${compass(h.dv.wind_direction_10m)}${gust != null ? `, hamle ${n0(gust)} kn` : ''}.`);
  if (wave != null && period != null && wave >= 1 && period < 4.5) {
    reasons.push('Dalga kısa periyotlu ve dik; seyir sert olur.');
    bump('caution');
  }
  if (h.weatherCode != null && h.weatherCode >= 95) {
    reasons.push('En az bir model gök gürültülü fırtına gösteriyor.');
    bump('bad');
  }
  const poor = ['wave_height', 'wind_speed_10m'].filter((k) => h.cmp[k].agreement === 'poor');
  if (poor.length) {
    reasons.push('Kaynaklar ayrışıyor; karar en yüksek tahmine göre verildi.');
    if (level === 'good') level = 'caution';
  }
  const title = { good: 'Tekneyle çıkmak mantıklı', caution: 'Çıkılır ama dikkatli ol', bad: 'Çıkmak önerilmez' }[level];
  return { level, title, reasons };
}

// Su altı görüşü tahmini. Girdi: son 72 saatin koy içi dalgası, yağış, dere etkisi, rüzgâr.
export function visibilityEstimate(series, i, spot) {
  const h = series.hours[i];
  if (h.localWave == null) {
    return { cls: 'unknown', label: 'Tahmin edilemiyor', range: '', score: null, reasons: ['Dalga verisi yok.'], confidence: 'yok' };
  }
  let stirred = h.localWave;
  let rain72 = 0;
  let rainKnown = false;
  for (let j = Math.max(0, i - 72); j < i; j++) {
    const p = series.hours[j];
    const age = i - j;
    if (p.localWave != null) stirred = Math.max(stirred, p.localWave * Math.exp(-age / 36));
    if (p.rain != null) {
      rain72 += p.rain;
      rainKnown = true;
    }
  }
  const reasons = [];
  let score = 0;
  if (stirred >= 1.5) score += 75;
  else if (stirred >= 1.0) score += 55;
  else if (stirred >= 0.6) score += 35;
  else if (stirred >= 0.3) score += 15;
  if (stirred >= 0.6) {
    reasons.push(stirred > h.localWave + 0.05
      ? `Son günlerde koyda ${n1(stirred)} m etkili dalga vardı; dip kalkmış olabilir.`
      : `Koy içinde şu an yaklaşık ${n1(h.localWave)} m dalga var.`);
  } else if (stirred >= 0.3) {
    reasons.push(`Koyda hafif dalga etkisi var (~${n1(stirred)} m); sığlarda az bulanıklık olabilir.`);
  } else {
    reasons.push('Son 3 günde koyu karıştıracak dalga görünmüyor.');
  }
  if (rainKnown) {
    let rainPts = 0;
    if (rain72 >= 30) rainPts = 40;
    else if (rain72 >= 10) rainPts = 25;
    else if (rain72 >= 3) rainPts = 10;
    const add = rainPts * spot.river;
    score += add;
    if (add >= 8) reasons.push(`Son 3 günde ~${n0(rain72)} mm yağış; dere ağzı etkisiyle bulanıklık beklenir.`);
    else if (rain72 >= 10) reasons.push(`Son 3 günde ~${n0(rain72)} mm yağış var ama bu noktada dere etkisi az.`);
  } else {
    reasons.push('Yağış verisi alınamadı; tahmin eksik bilgiyle yapıldı.');
  }
  const wind = h.dv.wind_speed_10m;
  const wdir = h.dv.wind_direction_10m;
  if (wind != null && wdir != null && wind >= 15) {
    const [a, b] = spot.open;
    const mid = (a + ((b - a + 360) % 360) / 2) % 360;
    if (angDiff(wdir, mid) <= 60) {
      score += 10;
      reasons.push('Rüzgâr kıyıya doğru esiyor; yüzey çalkantılı.');
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
  return { cls, label, range, score, reasons, confidence };
}

export function isDaylight(series, time) {
  if (!series.daily) {
    const hr = Number(time.slice(11, 13));
    return hr >= 7 && hr <= 17;
  }
  const d = series.daily.time.indexOf(time.slice(0, 10));
  if (d < 0) return false;
  return time >= series.daily.sunrise[d].slice(0, 13) + ':00' && time <= series.daily.sunset[d];
}

export function diveVerdict(series, i, spot) {
  const h = series.hours[i];
  const boat = boatVerdict(h);
  const vis = visibilityEstimate(series, i, spot);
  const lw = h.localWave;
  const wind = h.dv.wind_speed_10m;
  const cur = h.dv.ocean_current_velocity;
  const reasons = [];
  if (lw == null || wind == null) {
    return { level: 'unknown', title: 'Karar verilemiyor', reasons: ['Dalga ya da rüzgâr verisi eksik.'], score: null, vis, boat };
  }
  const rank = (val, key) => {
    if (val == null) return 1; // bilinmiyorsa ideal sayma
    if (val <= DIVE_LIMITS.ideal[key]) return 0;
    if (val <= DIVE_LIMITS.ok[key]) return 1;
    if (val <= DIVE_LIMITS.marginal[key]) return 2;
    return 3;
  };
  let r = Math.max(rank(lw, 'wave'), rank(wind, 'wind'), rank(cur, 'current'));
  reasons.push(`Koy içi tahmini dalga ${n1(lw)} m (açıkta ${n1(h.dv.wave_height)} m, koy ${h.exposure >= 0.95 ? 'bu yöne açık' : 'kısmen korunaklı'}).`);
  reasons.push(`Rüzgâr ${n0(wind)} kn ${compass(h.dv.wind_direction_10m)}.`);
  if (cur != null) reasons.push(`Akıntı ${n1(cur)} kn${cur > DIVE_LIMITS.ok.current ? ' – kuvvetli' : ''}.`);
  else reasons.push('Akıntı verisi yok.');
  reasons.push(`Görüş tahmini: ${vis.label}${vis.range ? ` (${vis.range})` : ''}.`);
  if (vis.cls === 'murky') r = Math.max(r, 2);
  if (vis.cls === 'bad') r = Math.max(r, 3);
  if (boat.level === 'bad') {
    r = 3;
    reasons.push('Tekneyle çıkış önerilmiyor.');
  }
  if (h.weatherCode != null && h.weatherCode >= 95) reasons.push('Gök gürültülü fırtına riski.');
  if (!isDaylight(series, h.time)) {
    r = 3;
    reasons.push('Gün ışığı yok.');
  }
  const level = ['ideal', 'ok', 'marginal', 'no'][r];
  const title = {
    ideal: 'Zıpkın için çok uygun', ok: 'Zıpkın için uygun', marginal: 'Sınırda, zorlayıcı', no: 'Dalış önerilmez',
  }[level];

  let score = 100;
  score -= Math.min(40, (lw / DIVE_LIMITS.marginal.wave) * 40);
  score -= Math.min(25, (wind / DIVE_LIMITS.marginal.wind) * 25);
  if (cur != null) score -= Math.min(10, (cur / DIVE_LIMITS.marginal.current) * 10);
  if (vis.score != null) score -= vis.score * 0.35;
  if (h.cmp.wave_height.agreement === 'poor' || h.cmp.wind_speed_10m.agreement === 'poor') score -= 8;
  if (r === 3) score = Math.min(score, 15);
  return { level, title, reasons, score: Math.max(0, Math.round(score)), vis, boat };
}

// Seçilen gün için en iyi ardışık 3 saatlik pencere.
// minTime verilirse (bugün için şimdiki saat) geçmiş saatler hesaba katılmaz.
export function bestWindow(series, spot, day, minTime = null) {
  const idx = [];
  series.hours.forEach((h, i) => {
    if (h.time.startsWith(day) && isDaylight(series, h.time) && (!minTime || h.time >= minTime)) idx.push(i);
  });
  const scored = idx.map((i) => ({ i, v: diveVerdict(series, i, spot) })).filter((x) => x.v.score != null);
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
    hourly: scored,
  };
}

export function moonPhase(date) {
  const synodic = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14); // bilinen yeni ay
  const age = ((((date.getTime() - ref) / 86400000) % synodic) + synodic) % synodic;
  const names = ['Yeni ay', 'Hilal (büyüyen)', 'İlk dördün', 'Şişkin ay (büyüyen)', 'Dolunay', 'Şişkin ay (küçülen)', 'Son dördün', 'Hilal (küçülen)'];
  return { age, name: names[Math.round((age / synodic) * 8) % 8], nearSyzygy: age < 2.5 || age > synodic - 2.5 || Math.abs(age - synodic / 2) < 2.5 };
}

// Balık aktivitesi: genel kurallara dayalı, düşük güvenli yorum.
export function fishActivity(series, i, spot) {
  const h = series.hours[i];
  const sst = h.dv.sea_surface_temperature;
  const cur = h.dv.ocean_current_velocity;
  const lw = h.localWave;
  const vis = visibilityEstimate(series, i, spot);
  const hr = Number(h.time.slice(11, 13));
  let twilight = hr <= 8 || hr >= 16;
  if (series.daily) {
    const d = series.daily.time.indexOf(h.time.slice(0, 10));
    if (d >= 0) {
      const rise = Number(series.daily.sunrise[d].slice(11, 13));
      const set = Number(series.daily.sunset[d].slice(11, 13));
      twilight = hr - rise <= 2 || set - hr <= 2;
    }
  }
  const moon = moonPhase(new Date(h.time + ':00+03:00'));
  const past = series.hours[Math.max(0, i - 6)];
  const dp = h.pressure != null && past.pressure != null ? h.pressure - past.pressure : null;

  const general = [];
  let base = 0;
  if (twilight) { base += 1; general.push('Gün doğumu/batımına yakın saat: av hareketi genelde artar.'); }
  if (moon.nearSyzygy) { base += 0.5; general.push(`${moon.name}: akıntı ve beslenme hareketi biraz artabilir.`); }
  else general.push(`Ay evresi: ${moon.name}.`);
  if (dp != null) {
    if (dp <= -2) { base += 0.5; general.push('Basınç düşüyor: cephe öncesi beslenme artabilir.'); }
    else if (dp >= 3) { base -= 0.5; general.push('Basınç hızla yükseliyor: balık durgun olabilir.'); }
  }
  if (cur != null && cur >= 0.2 && cur <= 0.8) { base += 0.5; general.push('Hafif akıntı var: burun ve taşlık uçlarda hareket beklenir.'); }
  if (sst != null) general.push(`Su sıcaklığı ${n1(sst)} °C.`);
  else general.push('Su sıcaklığı verisi yok; tür yorumu daha da belirsiz.');

  const species = [];
  const add = (name, pts, why) => {
    const total = base + pts;
    species.push({ name, level: total >= 2 ? 'yüksek' : total >= 1 ? 'orta' : 'düşük', why, total });
  };
  const inRange = (lo, hi) => sst != null && sst >= lo && sst <= hi;
  add('Sinarit', (inRange(17, 25) ? 1 : 0) + (vis.cls === 'clear' || vis.cls === 'medium' ? 0.5 : -0.5),
    'Serin-ılık temiz suyu ve akıntılı burunları sever.');
  add('Akya / sarıkuyruk', (sst != null && sst >= 21 ? 1 : -0.5) + (cur != null && cur >= 0.2 ? 0.5 : 0),
    'Ilık su ve akıntıyla birlikte yem balığı peşinde dolaşır.');
  add('Sargos / karagöz', (lw != null && lw >= 0.3 && lw <= 0.8 ? 1.5 : 0.5),
    'Köpüklü, hafif çalkantılı kayalık sığlıklarda aktifleşir.');
  add('Levrek', (sst != null && sst <= 20 ? 1 : -0.5) + (vis.cls === 'murky' || spot.river >= 0.8 ? 0.5 : 0),
    'Serin, hafif bulanık su ve dere ağızlarını sever.');
  add('Çipura', (inRange(16, 24) ? 1 : 0) + (lw != null && lw < 0.4 ? 0.5 : 0),
    'Sakin, kumluk-eriştelik sığ alanlarda beslenir.');
  species.sort((a, b) => b.total - a.total);
  return { general, species, moon };
}

// Tüm koyları seçilen gün için sıralar.
export function rankSpots(allSeries, spots, day, minTime = null) {
  const order = ['ideal', 'ok', 'marginal', 'no'];
  const key = (r) => (r.best ? order.indexOf(r.best.level) * 1000 - r.best.score : 1e6);
  return spots
    .map((spot) => ({ spot, best: bestWindow(allSeries[spot.id], spot, day, minTime) }))
    .sort((a, b) => key(a) - key(b));
}
