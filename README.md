# Antalya Deniz Programı

Antalya körfezindeki koylar için çok kaynaklı deniz tahmini, kaynak karşılaştırması ve tekne / zıpkınla dalış yorumu. Kurulum gerektirmeyen statik bir web uygulamasıdır; telefonda da çalışır.

## Ne yapar

Ekran yukarıdan aşağıya şöyle dizilir:

0. **Yer arama.** Listede olmayan bir yer adıyla aranır (Open-Meteo Geocoding, ücretsiz). Seçilen yer bu cihazda saklanır (en fazla 5). Bu yerlerde koyun açıklığı ve zemin tipi bilinmediği için açık deniz dalgası gösterilir ve balık tahmini zemine göre süzülmez.
1. **Konum, tarih ve saat seçimi.** Bugünden 7 gün sonrasına kadar bir gün ve saat seçilir; bütün ana bölümler bu saate göre çalışır.
2. **Saatler.** Günün 24 saati: zıpkın ve tekne ikisi de uygunsa yeşil, yalnız biri uygunsa sarı (hangisi olduğu yazar), ikisi de uygun değilse kırmızı. Üstünde gün doğumu ve batımı yazar. Saate dokununca o saate geçilir; uygun değilse nedeni yazılır.
2a. **Dalga görüntüsü.** Dokunulan saat için tahmini dalga şekli; düz deniz hizasından kaç cm yükseldiği ve kaç saniyede bir geldiği.
2a2. **Saat aralığı raporu.** Kendi başlangıç–bitiş seçimi olan ayrı bölüm; o aralık için zıpkın ve tekne ayrı ayrı açıklanır, kötüleşen koşullar saatiyle uyarı olarak yazılır. Üstte seçilen saati değiştirmez.
2b. **Haftaya bakış (açılır kapanır).** Her gün için durum, uygun saat sayısı, en iyi aralık, dalga, rüzgâr ve yağış. Yalnızca bilgi verir; seçimi değiştirmez.
3. **Zıpkın.** Su altı görüşü, koy içi dalga, rüzgâr, akıntı, su sıcaklığı, yağış; en iyi saat, en iyi koylar ve türlere göre balık aktivitesi tahmini.
4. **Tekne.** Dalga, rüzgâr, hamle, yağış, hava görüşü, en sakin bölge; yönteme göre av önerileri (derinlik, gelebilecek balık, yem ya da jig).
5. **Yağış.** Günün yağış özeti, şiddeti ve kaç modelin yağış gösterdiği; altında saatlik yağış grafiği.
6. **Ayrıntılar (kapalı gelir).** Kaynak karşılaştırma tablosu, koy sıralaması, kaynak durumu, dalış günlüğü.

Arka planda beş dalga, dört rüzgâr ve bir okyanus modeli aynı koordinat ve saat için karşılaştırılır. Kaynaklar ayrışıyorsa karar ortalamaya göre değil, en yüksek tahmine göre verilir. Bir kaynak çalışmazsa diğerleriyle devam edilir ve eksik olan ekranda yazılır.

Su altı görüşü, balık aktivitesi yüzdeleri ve av önerileri ölçüm ya da istatistik değil, kural tabanlı tahmindir. Balık mevsimleri ve yemler `js/fish.js` içinde düzenlenebilir.

## Çalıştırma

Dosyalar ES modülü kullandığı için bir web sunucusundan açılmalıdır:

```
python3 -m http.server 8000
```

Sonra `http://localhost:8000` adresini aç. GitHub Pages üzerinde de doğrudan çalışır.

Testler: `node --test tests/*.mjs`

## iPhone'a kurma

1. Programın yayınlandığı adresi iPhone'da **Safari** ile aç.
2. Paylaş düğmesine, sonra **Ana Ekrana Ekle**'ye dokun.
3. Ana ekrandaki "Deniz" simgesi programı tam ekran açar. Tahmin verisi için internet gerekir; bağlantı yoksa son çekilen veri gösterilir.

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
