// Kaynaklar arası karşılaştırma: en düşük, en yüksek, ortalama, ağırlıklı ortalama, fark, uyum.

const RAD = Math.PI / 180;

export function angDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Yönler dairesel ortalanır: 350° ile 10° → 0° (180° değil).
export function circularMean(degs, weights) {
  let x = 0;
  let y = 0;
  degs.forEach((d, i) => {
    const w = weights ? weights[i] : 1;
    x += w * Math.cos(d * RAD);
    y += w * Math.sin(d * RAD);
  });
  if (Math.hypot(x, y) < 1e-9) return null;
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

export function compass(deg) {
  if (deg == null) return '';
  const names = ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'];
  return names[Math.round(deg / 22.5) % 16];
}

// Bir kaynağın ağırlığı: çözünürlük, güncellik ve model noktasının konuma uzaklığı.
export function sourceWeight(src) {
  const res = Math.min(2, Math.max(0.4, 10 / src.resKm));
  let fresh = 0.8; // güncelleme zamanı bilinmiyorsa
  if (src.runAgeH != null) fresh = src.runAgeH <= 12 ? 1 : src.runAgeH <= 24 ? 0.85 : 0.6;
  let dist = 0.85;
  if (src.distKm != null) dist = src.distKm <= 5 ? 1 : src.distKm <= 15 ? 0.85 : 0.7;
  const blend = src.blend ? 0.5 : 1; // karma kaynak bağımsız model sayılmaz
  return res * fresh * dist * blend;
}

// entries: [{ id, name, value, weight, strength }]
// Dönen "agreement": 'good' | 'partial' | 'poor' | 'single' | 'none'
export function compareValues(variable, entries) {
  const valid = entries.filter((e) => e.value != null && Number.isFinite(e.value));
  const missing = entries.filter((e) => !valid.includes(e)).map((e) => e.name);
  if (valid.length === 0) return { agreement: 'none', count: 0, missing };

  const values = valid.map((e) => e.value);
  const weights = valid.map((e) => e.weight ?? 1);
  const wSum = weights.reduce((a, b) => a + b, 0);

  if (variable.circular) {
    const mean = circularMean(values);
    const wmean = circularMean(values, weights) ?? mean;
    const ref = wmean ?? values[0];
    const spread = Math.max(...values.map((v) => angDiff(v, ref))) * (valid.length > 1 ? 1 : 0);
    let pairMax = 0;
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) pairMax = Math.max(pairMax, angDiff(values[i], values[j]));
    }
    const strengths = valid.map((e) => e.strength).filter((s) => s != null);
    const calm = strengths.length > 0 && Math.max(...strengths) < (variable.calmBelow ?? 0);
    let agreement = 'single';
    if (valid.length > 1) agreement = pairMax <= 30 ? 'good' : pairMax <= 60 ? 'partial' : 'poor';
    return { agreement, count: valid.length, mean, wmean, spread: pairMax, calm, missing, circular: true, deviation: spread };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const wmean = values.reduce((a, v, i) => a + v * weights[i], 0) / wSum;
  const spread = max - min;
  let agreement = 'single';
  if (valid.length > 1) {
    const tol = Math.max(variable.tolAbs ?? 0, (variable.tolRel ?? 0) * Math.abs(mean));
    agreement = spread <= tol ? 'good' : spread <= 2 * tol ? 'partial' : 'poor';
  }
  const minSrc = valid[values.indexOf(min)].name;
  const maxSrc = valid[values.indexOf(max)].name;
  return { agreement, count: valid.length, min, max, mean, wmean, spread, minSrc, maxSrc, missing };
}

// Karar için kullanılacak değer: kaynaklar uyuşuyorsa ağırlıklı ortalama,
// uyuşmuyorsa temkinli taraf (en yüksek).
export function decisionValue(cmp) {
  if (!cmp || cmp.count === 0) return null;
  if (cmp.circular) return cmp.wmean;
  if (cmp.agreement === 'poor') return cmp.max;
  if (cmp.agreement === 'partial') return (cmp.wmean + cmp.max) / 2;
  return cmp.wmean;
}

export const AGREEMENT_LABEL = {
  good: 'Uyumlu',
  partial: 'Kısmen uyumlu',
  poor: 'Önemli fark',
  single: 'Tek kaynak',
  none: 'Veri yok',
};

const fmt = (v, d) => v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });

// "Üç model 0,5–0,7 m arasında dalga tahmini yapıyor..." tarzı cümle.
export function describe(variable, cmp) {
  const what = variable.label.toLocaleLowerCase('tr-TR');
  if (cmp.agreement === 'none') return `${variable.label}: hiçbir kaynaktan veri alınamadı.`;
  if (cmp.circular) {
    const dir = `${compass(cmp.wmean)} (${Math.round(cmp.wmean)}°)`;
    if (cmp.agreement === 'single') return `${variable.label}: ${dir}. Tek kaynak var, karşılaştırma yapılamıyor.`;
    if (cmp.calm) return `${variable.label}: ${dir} civarı. Değer çok zayıf olduğu için yön farkı önemsiz.`;
    if (cmp.agreement === 'good') return `${cmp.count} kaynak ${what} için ${dir} civarında uyuşuyor.`;
    if (cmp.agreement === 'partial') return `${cmp.count} kaynak arasında ${what} için ${Math.round(cmp.spread)}° fark var; kısmen uyuşuyorlar.`;
    return `Kaynaklar ${what} konusunda ayrışıyor (${Math.round(cmp.spread)}° fark). Yönü belirsiz kabul et.`;
  }
  const d = variable.digits ?? 1;
  const u = variable.unit;
  if (cmp.agreement === 'single') return `${variable.label}: ${fmt(cmp.wmean, d)} ${u}. Tek kaynak var, karşılaştırma yapılamıyor.`;
  const range = `${fmt(cmp.min, d)}–${fmt(cmp.max, d)} ${u}`;
  if (cmp.agreement === 'good') return `${cmp.count} kaynak ${range} arasında ${what} tahmini yapıyor. Kaynaklar büyük ölçüde uyuşuyor.`;
  if (cmp.agreement === 'partial') return `${cmp.count} kaynak ${range} arasında ${what} veriyor. Kısmen uyuşuyorlar; üst değeri dikkate al.`;
  return `Kaynaklar arasında önemli fark var: ${cmp.minSrc} ${fmt(cmp.min, d)} ${u}, ${cmp.maxSrc} ${fmt(cmp.max, d)} ${u} ${what} veriyor. Koşulları belirsiz kabul et.`;
}
