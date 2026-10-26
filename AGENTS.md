# AGENTS.md — Kick Auto Chat

## Amaç ve sınırlar

Bu depo Kick sohbet otomasyonu için Chrome MV3 eklentisi üreten React dashboard'dır. Backend, veritabanı, Kick API istemcisi ve background service worker yoktur. Dashboard simülasyonu ile gerçek eklenti ayrı çalışma ortamlarıdır. Panel tercihleri ZIP'e aktarılmaz.

Canlı platformda mesaj, kanal puanı, takip/abonelik veya hesap işlemi test amacıyla kendiliğinden yapılmaz. Önce salt okunur DOM kanıtı ve yerel fixture kullanın; canlı veri değiştiren işlemler için açık yetki gerekir. Giriş/cookie/token değerlerini rapora veya kaynaklara yazmayın. Platform kısıtlarını aşan otomasyon eklemeyin.

## Çalıştırma ve kabul komutu

Tüm npm komutlarını `package.json` bulunan depo kökünde çalıştırın. Node.js `>=24.15.0 <25`, npm ve lockfile ile kurulmuş geliştirme bağımlılıkları gerekir. POSIX shell'de `npm run verify`; Windows PowerShell 5.1'de `npm.cmd run verify` kullanın. Doğrulama için bağımlılıkları kendiliğinden kurmayın; `npm ci` ayrı bir kurulum adımıdır.

```sh
npm ci
npm run dev
npm run verify
```

`npm run verify` sırasıyla ESLint, strict TypeScript, Node test runner ve Vite production build çalıştırır; bir adım başarısızsa sonraki adımlar çalışmaz. Lint düzeltme yapmaz; testler yerel fixture ve bellekte ZIP kullanır, canlı Kick/Chrome hesabına erişmez. Build `dist/` çıktısını yeniler; bu dizinde elle hazırlanmış içerik tutmayın. Alt komutlar: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Dev sunucusu loopback `127.0.0.1:3000` üzerinde çalışır; port doluysa Vite başka port seçebilir, gerçek adresi çıktısından alın. Ağdan erişimi yalnız ihtiyaç ve izin varsa açın.

Build/typecheck başarısını eklenti davranışı veya gerçek Kick sunucu kabulü olarak yorumlamayın. Gerçek JS kaynakları lint ve DOM testlerine dahildir; raw string birleştirme, manifest ve ZIP ayrıca doğrulanmalıdır.

## Kaynak haritası

- `index.html` → `index.tsx` → `App.tsx`: tek ekranlı dashboard başlangıcı ve düzeni.
- `components/PreviewPanel.tsx`: yerel state ve timer ile simülasyon. Chrome API veya gerçek Kick gönderimi kullanmaz.
- `components/CodePanel.tsx`: birleştirilmiş eklenti kaynaklarını salt okunur gösterir.
- `data/emotes.ts`: emote adları ve CDN görsellerinin ortak kaynağı. Kopya katalog eklemeyin.
- `data/extensionFiles.ts`: manifest ve `extension/` raw kaynaklarının paketleme listesi; popup katalog yer tutucusunu çözer.
- `extension/content.js`: hedef seçimi, bot durum makinesi, metin yazma ve gönderim timer'ları.
- `extension/popup.js`: kullanıcı ayarları, `chrome.storage.local` ve aktif sekme mesajlaşması.
- `extension/popup.html`, `extension/styles.css`: bağımsız, yerel popup kaynakları.
- `lib/exportExtension.ts`: manifest, zorunlu dosya/ikon doğrulaması ve varlık URL'leri; JSZip paketleme ve indirme `App.tsx` içindedir.
- `tests/`: Node test runner; jsdom üzerinden kontrollü DOM/timer/Chrome fixture'ları.
- `public/icons/`: ZIP manifest ikonları; dashboard build'i de public dosyaları kopyalar.
- `dist/`: dashboard çıktısı, Chrome eklentisi klasörü değildir.

## Bot akışı ve kontratlar

1. Popup tercihleri storage'dan yükler; aktif sekmeye `GET_STATUS` gönderir.
2. `SELECT_TARGET` popup'ı kapatıp content script seçim modunu açar.
3. Yalnız doğrulanmış Kick chat editörü kabul edilir. Escape, Reset, yeni seçim ve başarı dinleyicileri temizlemelidir.
4. Popup tekrar açılıp `START` ile ayarları yollar. Sayfa içi motor ilk turu kısa gecikmeyle çalıştırır, sonra min/max arasında bekler.
5. Motor yazma ve gönderme öncesinde hedef ve kontrol sınırlarını yeniden doğrular. Hedef seçimindeki origin/path değişirse yeniden seçim gerekir; SPA kanal geçişi eski motoru yeni kanala taşımaz. Mevcut kullanıcı taslağı ezilmez; bekleyen gönderimde kullanıcı input'u aynı metni üretse bile tıklama iptal edilir.
6. `STOP` ve `RESET_TARGET` ana timer, bekleyen gönderim ve eski nesil callback'leri etkisiz kılar.
7. Gönderim hatasında sessiz alternatif düğme/Enter denenmez; motor durur ve popup hata durumunu gösterir. Popup'ın yerel storage/validasyon hataları durum polling'iyle silinmez; yalnız yeni kullanıcı eylemiyle temizlenir.

Kalıcı ayar anahtarları: `presetMessages`, `singleMessage`, `minTime`, `maxTime`, `mode`, `selectedEmoji`, `isSequential`, `isRunning`. Liste modunun saklanan adı `preset`; arayüzde List olarak gösterilebilir. Mevcut tercihlerle uyumu koruyun. Storage çalışma bayrağı motorun gerçek durumu değildir; gerçek durum content script'ten gelir. Sayfa yenilendiğinde hedef/timer silinir, tercihler kalır.

`START` mesajındaki süre alanları `minInterval`/`maxInterval`'dır; storage'daki `minTime`/`maxTime` ile karıştırmayın. Emoji modu katalogdaki adın `emoji`, eşleşen `https://files.kick.com/emotes/<id>/fullsize` adresinin `emojiUrl` olarak birlikte gönderilmesini gerektirir. Popup ve önizleme import'u yalnız `.txt` ve en fazla 1 MiB dosya kabul eder; iptal edilen/eski okuma yeni tercihi ezmemelidir.

## Gönderim güvenlik sınırı

2026-10-04 salt okunur Kick DOM gözlemi: `[data-testid="chat-input"]` editörü `#chatroom-footer` içinde; gönder düğmesi `#send-message-button`, editör wrapper'ının dışında aynı footer'dadır. Metin Türkçe `Gönder` olabilir; İngilizce düğme metnine güvenmeyin.

- Genel `button[type="submit"]`, tahmini üst kapsayıcı, sayfa geneli buton taraması veya kanal puanı/kimlik/emote kontrolleri kullanılmaz.
- Enter simülasyonu veya generic form submit fallback eklemeyin.
- Eksik, gizli, disabled, belirsiz veya değişmiş hedefte fail-closed davranın.
- UI tetiklemesi sunucu kabul teyidi değildir. Kör retry ve görünmez karakterle duplicate engeli atlatma eklemeyin.
- Süreler iki uçta da sonlu tam sayı ve `1 <= min <= max <= 86400` olmalı.
- Asenkron akışlarda iptal ve nesil korumasını muhafaza edin; eski callback yeni çalışmaya dokunmamalı.

Kick seçicilerinde değişiklik yaparken tarihli güncel DOM kanıtı alın, fixture'ı güncelleyin ve puan/gönder kontrolü ayrımını negatif testlerle kanıtlayın. Bu belge her Kick UI varyantını doğruladığını iddia etmez.

## Mimari ve geliştirme kuralları

- Dashboard React/TypeScript, eklenti standalone JavaScript'tir; popup'a React/Vite runtime eklemeyin.
- Tailwind 4 CSS yerel Vite plugin ile derlenir; runtime CDN ve uzaktan çalıştırılan kod eklemeyin.
- ZIP ve kaynak gezgini aynı birleştirilmiş dosyaları kullanmalıdır. Çözülmemiş katalog token'ı, eksik çekirdek dosya veya ikon export hatasıdır.
- Raw kaynakları `extension/` içinde düzenleyin; üretilmiş `dist/` veya indirilen ZIP'i elle yamalamayın.
- Kullanıcı storage kontratlarını, emote isimlerini ve mesaj sıralamasını değiştiren refactor'ları açıkça ayırın.
- Effect/timer/listener/object URL cleanup zorunludur. Clipboard/storage/fetch hatasını başarı olarak göstermeyin.
- Kodda gereksiz yorum eklemeyin. Depo UI dili İngilizce; README iki dilde güncel tutulmalıdır.
- `.kilo/` yerel araç/recovery durumudur; ürün kodu değildir. Agent Manager durumunu elle düzenlemeyin.

## Değişiklik ve doğrulama iş akışı

Başlangıçta HEAD ve `git status --short --untracked-files=all` kaydedin. Mevcut dirty kullanıcı dosyalarını değiştirmeden önce proje dışında gerçek kopya yedeği alın. Commit, reset, stash, clean veya restore ile kullanıcı işini silmeyin.

Hata düzeltmelerinde önce başarısız baseline/regresyon kanıtı; sonra odaklı testler; sonra `npm run verify`. Bağımlılık güncellemelerinde registry sürüm/engine/peer bilgisini, resmi migration notlarını, lockfile diff'ini ve `npm audit` kapsamını kontrol edin. Kurulum scriptlerini inceleyin; gerekli olmayan lifecycle scriptlerini otomatik çalıştırmayın.

`tests/fixtures/legacy-content.js.txt`, eski hatalı gönderimi kanıtlayan regresyon fixture'ıdır; kullanılmayan ürün kodu olarak silmeyin.

Kritik DOM/iptal veya build tedarik zinciri değişikliklerinde bağımsız inceleme yapın. UI için yerel browser smoke, kaynak sekmeleri, simülasyon ve ZIP envanterini kontrol edin. Gerçek hesap testi yapılmadıysa sonuçta açıkça belirtin. Doğrulanmamış davranışı güvenli/uyumlu ilan etmeyin.

## Dokümantasyon

`README.md` ve `README.tr-TR.md` kullanım/mimariyi; `CHANGELOG.md` davranış değişimini; `SECURITY.md` trust boundary ve bildirim politikasını taşır. Eski denetim raporları güncel kanıt değildir. Lisans bildirimi korunmalıdır. Artık gereksiz belgeleri yalnız gerekçeli, kullanıcı içeriğini koruyarak kaldırın.
