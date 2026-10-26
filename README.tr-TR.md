# Kick Auto Chat — Geliştirici Paneli ve Chrome Eklentisi

[English](README.md) | **Türkçe**

İlk sürüm: 2026-10-26 tarihli [v1.0.0](https://github.com/okanalici/kick-auto-chat/tree/v1.0.0). Sürüm ayrıntıları için [CHANGELOG.md](CHANGELOG.md) dosyasına bakın.

Kick sohbeti için Chrome Manifest V3 eklentisini simüle eden, kaynaklarını gösteren ve ZIP olarak paketleyen istemci tarafı bir paneldir. Backend, veritabanı, hesap servisi veya Kick API entegrasyonu yoktur. Önizleme gerçek Kick mesajı göndermez; paneldeki ayarlar indirilen eklentiye aktarılmaz.

## Özellikler

- Liste, tek mesaj ve emote modları; sıralı/rastgele liste gönderimi ve `.txt` içe aktarma.
- Seçilen süre aralığını kullanan yerel simülasyon ve son üç mesajın gösterimi.
- Kaynak gezgini, satır/boyut bilgileri ve hata bildirimli kod kopyalama.
- Tarayıcıda JSZip ile kaynakları ve zorunlu ikonları paketleme.
- Yalnız doğrulanmış sohbet alanı: `#chatroom-footer` içindeki editör ve tam `#send-message-button` kimliği.
- Genel form submit, puan düğmesi araması veya sentetik Enter yedeği kullanılmaz.
- Eksik, belirsiz, devre dışı veya değişmiş hedefte açık hata; Stop/Reset sonrası bekleyen gönderimlerin iptali; mevcut taslağı ezmeme.

## Mimari ve dosya yapısı

```text
index.html -> index.tsx -> App.tsx
  components/PreviewPanel.tsx       yalnız yerel simülasyon
  components/CodePanel.tsx          üretilen kaynak görüntüleyici
  data/emotes.ts                   ortak emote kataloğu
  data/extensionFiles.ts            manifest ve raw kaynak birleştirme
  extension/content.js             sayfa içi bot motoru
  extension/popup.js                kontrol, storage ve mesajlaşma
  extension/popup.html, styles.css  bağımsız popup arayüzü
  lib/exportExtension.ts           doğrulama ve varlık URL'leri; ZIP paketleme App.tsx içinde
  tests/                           Node regresyon testleri
```

Eklenti kaynakları gerçek JS/HTML/CSS dosyalarıdır; panel bunları raw string olarak alır. Popup emote yer tutucusu birleştirmede ortak katalogla değiştirilir. Kaynak gezgini ve ZIP aynı birleştirilmiş kaynakları kullanır. `dist/`, eklenti değil dashboard derlemesidir.

Popup tercihleri `chrome.storage.local` içinde saklar ve aktif Kick sekmesine komut gönderir. Hedef ve timer content script belleğindedir. Popup kapansa da motor çalışabilir; sayfa yenilenmesi motoru/hedefi siler, tercihleri silmez. Background service worker yoktur.

## Gereksinimler ve geliştirme

**Node.js 24.x, en az 24.15** ve npm kullanın. PowerShell yürütme politikası `npm.ps1` çalıştırmayı engellerse `npm.cmd` kullanın.

```sh
npm ci
npm run dev
npm run verify
npm run build
npm run preview
```

Dev sunucusu `127.0.0.1:3000` üzerinde çalışır; port doluysa Vite çıktısındaki alternatif portu kullanın. `verify`: lint, strict TypeScript, regresyon testleri ve Vite production build. Ayrı kontroller: `npm run lint`, `npm run typecheck`, `npm test`.

Teknolojiler: React 19.3, TypeScript 6.0, Vite 8.3, Vite plugin üzerinden Tailwind CSS 4.3, Lucide React 1.61, JSZip 3.10. typescript-eslint, TypeScript 6.1 altını gerektirdiği için TypeScript 6.0 patch hattında tutulur. CSS yerel derlenir; Tailwind runtime CDN ve dış font bağımlılığı yoktur. Emote görselleri Kick CDN'den alınır.

## Chrome'a yükleme ve bot akışı

1. Panelde **Export ZIP** düğmesine basın ve arşivi çıkartın.
2. `chrome://extensions/` sayfasında geliştirici modunu açıp klasörü paketlenmemiş eklenti olarak yükleyin.
3. Yükleme/güncelleme sonrası Kick sayfasını yenileyin.
4. Popup'ta **Select Chat Input** seçin, gerçek sohbet editörüne tıklayın ve popup'ı yeniden açın.
5. Mesajları ve **1–86400 saniye** arasında tam sayı min/max süreyi belirleyin; botu başlatın.
6. Taslak yazmadan veya kanal değiştirmeden önce durdurun. Escape hedef seçiminden çıkar.

Popup tercih kontrolleri ilk storage okuması sonuçlandıktan sonra açılır. Start ayrıca başarılı motor durum yanıtı gerektirir; tercihler okunamasa da çalışan motor için Stop kullanılabilir. Metin içe aktarma en fazla 1 MiB boyutundaki `.txt` dosyalarını kabul eder; yeni içe aktarma, tercih düzenleme ve popup kapanışı bekleyen okumayı iptal eder, eski sonuçlar yeni ayarların üzerine yazmaz.

Yalnız otomasyonun izin verildiği kanallarda kullanın. Motor bir doğrulanmış UI kontrolü tetikler; sunucunun mesajı kabul ettiğini doğrulamaz. Giriş, takipçi/abone kısıtı, moderasyon veya rate limit atlatmaz. Emote modu katalog adını yazar; görsel emote'a dönüşüm Kick editörüne bağlıdır. Yinelenen mesaj engelini aşan görünmez işaret mekanizması kaldırılmıştır.

## Doğrulama sınırları

Yerel testler hedef seçimi, alakasız düğmeler, iptal ve hata yollarını kapsar. Typecheck/build veya dashboard başarısı, oturum açılmış gerçek hesapla her kanalda gönderim garantisi değildir. Seçiciler 2026-10-04 tarihinde gerçek sayfada yalnız okunarak gözlemlendi; Kick UI değişirse yeniden doğrulama gerekir.

Geliştirici ve ajan yönergeleri: [AGENTS.md](AGENTS.md). Güvenlik sınırları ve bildirim: [SECURITY.md](SECURITY.md).

## Lisans

[MIT](LICENSE).
