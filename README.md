# Antalya Deniz Programı

Antalya körfezindeki koylar için çok kaynaklı deniz tahmini, kaynak karşılaştırması ve tekne / zıpkınla dalış yorumu. Kurulum gerektirmeyen statik bir web uygulamasıdır; telefonda da çalışır.

## Ne yapar

- Beş dalga modeli, dört rüzgâr modeli ve bir okyanus modelini aynı koordinat ve aynı saat için ayrı ayrı gösterir.
- Her değer için en düşük, en yüksek, ortalama, ağırlıklı ortalama, fark ve uyum durumunu hesaplar.
- Ağırlık; model çözünürlüğü, son güncelleme zamanı ve model noktasının konuma uzaklığından gelir.
- Kaynaklar ayrışıyorsa karar ortalamaya göre değil, en yüksek tahmine göre verilir.
- Açık deniz dalgasını koyun açık olduğu yöne göre düzeltip koy içi dalgayı tahmin eder.
- Tekne, zıpkın, en iyi saat, en iyi koy, su altı görüşü ve balık aktivitesi için yorum üretir.
- Bir kaynak çalışmazsa diğerleriyle devam eder, eksik olanı ekranda açıkça yazar.
- Dalış günlüğü ile tahminin gerçekte ne kadar tuttuğunu kaydeder.

Su altı görüşü ve balık aktivitesi ölçüm değil, kural tabanlı tahmindir.

## Çalıştırma

Dosyalar ES modülü kullandığı için bir web sunucusundan açılmalıdır:

```
python3 -m http.server 8000
```

Sonra `http://localhost:8000` adresini aç. GitHub Pages üzerinde de doğrudan çalışır.

Testler: `node --test tests/*.mjs`

## Kaynaklar, ücretler ve lisanslar

Kasım 2026'da resmî sayfalardan kontrol edildi; kullanmadan önce güncel hâlini doğrula.

| Kaynak | Durum | Ücret | Ticari kullanım |
|---|---|---|---|
| [Open-Meteo](https://open-meteo.com/en/pricing) | Entegre (ana kaynak) | Ücretsiz, anahtar yok; günde 10.000 istek sınırı | Ücretsiz API yalnızca ticari olmayan kullanım içindir. Ticari kullanım ücretli abonelik gerektirir. Veri CC BY 4.0, atıf zorunlu |
| [Stormglass](https://stormglass.io/) | Entegre (isteğe bağlı, kendi anahtarınla) | Ücretsiz katman günde 10 istek; ücretli planlar 19 €/ay'dan başlar | Ücretsiz katmanda yok; 49 €/ay ve üzeri planlarda var |
| [Copernicus Marine](https://data.marine.copernicus.eu/product/MEDSEA_ANALYSISFORECAST_WAV_006_017/description) | Dolaylı (Open-Meteo'nun MFWAM ve Mercator verisi buradan gelir). Akdeniz'e özel 4 km ürün henüz entegre değil | Ücretsiz, hesap gerekli | Lisans koşulları resmî sayfadan teyit edilmeli; atıf: "E.U. Copernicus Marine Service Information" |
| [Windy Point Forecast](https://api.windy.com/point-forecast) | Entegre edilmedi | Deneme sürümü ücretsiz ama verisi kasıtlı olarak karıştırılmış; gerçek kullanım 990 €/yıl | Yalnızca ücretli planda. Nokta tahmininde ECMWF modeli lisans nedeniyle yok |

Stormglass kendi modeli değil, başka modellerin karmasıdır; bu yüzden uyum hesabına düşük ağırlıkla girer. Stormglass bağlantısı gerçek bir anahtarla henüz denenmedi.

Bir sayfa yüklemesi Open-Meteo'da yaklaşık 100 istek sayılır (10 model × 10 konum). Veri 60 dakika önbellekte tutulur.

## Ayarlar

`js/config.js` içinde:

- `SPOTS`: konumlar, koyun açık olduğu yön aralığı, dere etkisi ve ek korunma katsayısı. Koordinatlar ve yönler yaklaşıktır; kendi bildiğin noktalara göre düzelt.
- `BOAT_LIMITS`: 10 m üzeri motorlu tekne için dalga, rüzgâr ve hamle eşikleri.
- `DIVE_LIMITS`: zıpkınla dalış için koy içi dalga, rüzgâr ve akıntı eşikleri.
- `MODELS`: kullanılan modeller ve çözünürlükleri.

## Uyarı

Bu program tahmin üretir. Denize çıkmadan önce resmî denizcilik bültenini ve kendi gözlemini esas al. Tür, boy ve dönem yasaklarını güncel su ürünleri tebliğinden kontrol et.
