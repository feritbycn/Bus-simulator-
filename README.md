# Nova Transit

Gece şehrinde gök mekikleriyle yolcu taşıma bulmacası (otobüs-yolcu türünün özgün, modern versiyonu) + canlı sunucu.

## Çalıştırma
```bash
npm install
npm start                  # http://localhost:3000   (Node 22.5+)
```
Admin paneli: `http://localhost:3000/admin` — anahtar ilk açılışta konsola yazılır ve `data/admin.key` içindedir
(`ADMIN_KEY=...` ile kendin de verebilirsin).

Demo veri / yük testi:
```bash
node tools/seed-demo.js 400 14                      # 14 günlük sahte geçmiş (grafikler dolsun)
node tools/bots.js --n 100 --speed 4 --minutes 10   # canlı bağlanan, oynayan, reklam izleyen botlar
```

## Oyun mantığı
- Tahtadaki mekiklere dokun: okun yönünde yol boşsa çıkar ve park yerine (5) geçer. Yolu kapalıysa gitmez.
- Üstteki iki sıradaki yolcular, park yerindeki aynı renk mekiğe otomatik biner; dolan mekik kalkar.
- Park yerleri dolup kimse binemezse kaybedersin; sıradaki tüm yolcular taşınırsa kazanırsın.
- Özel mekikler: `?` gizli renk (yolu açılınca belli olur), kilitli (N mekik kalkınca açılır), VIP (her renkten 4 yolcu).
- Güçlendiriciler: Sırala, Ekstra park, VIP mekik, İpucu.
- Zorluk: bölge başına yeni mekanik, renk/mekik sayısı ve yolcu karışıklığı artar; her 10. seviye "zor", 4-5. seviyeler "rahat" (testere dişi eğri).
  Her seviye üretimde çözülebilirliği kanıtlanır (`npm test`).
- Senaryo: Nova City'nin şebekesi çöktü; 6 bölgeyi (Liman → Eski Şehir → Neon Çarşı → Kristal Bahçeler → Yörünge → Aurora Çekirdeği) yeniden aydınlatırsın. Karakterler: Mira ve Pip.

## Ekonomi (hepsi `server/economy.js`)
Jeton, 4 güçlendirici, ödüllü video (x2 ödül, devam et, bedava güçlendirici, hediye x3, çark hakkı, günlük x2),
zorunlu reklam (8. seviyeden sonra, reklamsız/Nova+ ise yok), günlük 7 gün takvimi, şans çarkı, günlük görevler + sandık,
mağaza (jeton paketleri, başlangıç/pro paketi, Reklamsız, Nova+ 7/30 gün).

## Sunucu ve canlı istatistik
- Kayıt: anonim cihaz kimliği → token. İlerleme, jeton, envanter **sunucuda** tutulur.
- **Hile korumalı**: istemci seviye bitince hamle listesini yollar, sunucu oyunu baştan oynatıp doğrular (`shared/engine.js`);
  ödül sunucuda hesaplanır. Ödüllü reklamda sunucu jetonu verir, çok hızlı bitirilen reklam reddedilir, günlük limitler vardır.
- WebSocket (`/ws`): bağlı = **online**, seviye içinde = **oynuyor**. Oyun ana ekranında "1.243 çevrimiçi · 312 oynuyor" görünür.
- **Aktif oyuncu**: DAU/WAU/MAU oturum tablosundan (UTC günü). Panelde ayrıca yeni oyuncu, oturum süresi, kazanma oranı,
  en zor seviyeler, D1/D3/D7 retention, gelir (IAP), tahmini reklam geliri (eCPM ile), reklam tamamlama oranı, ARPDAU, canlı oyuncu listesi.
- Public: `GET /api/live` → `{online, playing}`; `GET /healthz`.

## Gerçek yayına geçerken yapılacaklar
1. **Reklam**: `public/js/ui.js` içindeki `AdProvider` demo. AdMob/AppLovin (Capacitor/Cordova ile) bağla; `showRewarded()` true/false dönsün.
   Sunucu tarafı akış (`/api/ad/start` → `/api/ad/complete`) aynı kalır; mümkünse ağın SSV (server-side verification) geri çağrısını ekle.
2. **Ödeme**: `server/game.js > purchase()` içinde `provider: 'google' | 'apple'` için makbuz doğrulama TODO. Şu an `mock` açık;
   yayında `ALLOW_MOCK_PURCHASE=0` ver.
3. `ADMIN_KEY` belirle, HTTPS arkasında çalıştır (nginx/Caddy/Cloudflare). WebSocket için `Upgrade` başlıklarını ilet.
4. Mobil: Capacitor ile Android/iOS paketlenebilir (oyun tek sayfa web uygulaması, `manifest.webmanifest` hazır).
5. Çoklu sunucu gerekirse SQLite yerine PostgreSQL + Redis (presence için) önerilir; mevcut kod tek sunucuda on binlerce oyuncuya yeter.

## Dağıtım
`docker build -t nova . && docker run -p 3000:3000 -v nova-data:/data -e ADMIN_KEY=... nova`

## Klasörler
`shared/engine.js` kurallar + seviye üretici (istemci ve sunucu aynı kodu kullanır) · `server/` API, WS, istatistik ·
`public/` oyun · `public/admin/` panel · `tools/` varlık üretici, botlar, demo veri · `tests/`


## Nova Transit – güncelleme notları
- Tahtadaki araç çizimleri yenilendi: panoramik cam bandı, cam yansımaları, LED far/stoplar, neon yan şerit, modern jantlar ve NOVA rota ekranı eklendi.
- Renkler ve özel araç türleri (VIP, kilitli, gizli) aynı oyun kurallarıyla korunur.
- Zorluk üreticisi ve seviye doğrulaması değiştirilmeden korundu; `node tests/run.js` ile 1–300 seviyenin çözülebilirliği doğrulandı.
- Not: `1.zip` bir derlenmiş Android APK içeriği olduğundan kaynak kodu ve oyun mantığı okunabilir biçimde mevcut değil. Bu sürüm Nova Transit'in mevcut oyun döngüsünü koruyup görsel araç tasarımını iyileştirir.
