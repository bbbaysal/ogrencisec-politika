* Gizlilik Politikası: [privacy-policy.html](privacy-policy.html)
* Hesap Silme: [delete-account.html](delete-account.html)

# Gizlilik Politikası (Privacy Policy) - Öğrenci Seç

**Son Güncelleme Tarihi:** 9 Kasım 2026  
**Uygulama Adı:** Öğrenci Seç  
**Paket Adı:** `com.bbbaysal.ogrencisec`  
**Geliştirici:** Bekir Bergin BAYSAL (`bbbaysal`)  

Bu Gizlilik Politikası, **Öğrenci Seç** ("Uygulama") mobil uygulamasını kullandığınızda kişisel verilerinizin nasıl toplandığını, kullanıldığını, saklandığını ve korunduğunu açıklar. Uygulamamızı kullanarak bu politikada belirtilen şartları kabul etmiş olursunuz.

---

## 1. Toplanan Bilgiler ve Kullanım Amaçları

### A. Kullanıcı (Öğretmen) Hesap Bilgileri
* **Toplanan Veriler:** Ad-Soyad, E-posta adresi, Branş bilgisi ve Şifre.
* **Amaç:** Uygulamada oturum açmanız, sınıflarınızı ve öğrencilerinizi cihazlarınız arasında (telefon ve akıllı tahta) güvenle eşitleyebilmeniz.
* **Şifreleme:** Kullanıcı şifreleri sunucularımızda asla düz metin olarak tutulmaz. Endüstri standardı tek yönlü **`bcrypt` hashleme** algoritması ile geri döndürülemez şekilde şifrelenir.

### B. Sınıf ve Öğrenci Listesi Bilgileri
* **Toplanan Veriler:** Sınıf adları, öğrenci okul numaraları, öğrenci ad ve soyadları, tahtaya kalkma sayıları ve artı/eksi puan kayıtları.
* **Amaç:** Öğretmenin sınıfta rastgele ve adil öğrenci seçimi yapabilmesi, yoklama takibi ve ders içi puanlama yapabilmesi.
* **Gizlilik Güvencesi:** Öğrenci bilgileri hiçbir şekilde ticari amaçla kullanılmaz, profil çıkarma işlemlerine tabi tutulmaz, üçüncü taraflara satılmaz veya pazarlama amacıyla paylaşılmaz.

### C. Cihaz İzinleri ve Donanım Erişimi
* **Kamera İzni (`android.permission.CAMERA`):** Yalnızca akıllı tahtadaki karekodu (QR kod) tarayarak hızlı ve güvenli oturum açmak için kullanılır. Fotoğraf veya video çekilmez, kaydedilmez veya harici sunuculara yüklenmez.
* **İnternet İzni (`android.permission.INTERNET`):** Supabase bulut veritabanı ile sınıf verilerini eşitlemek ve reklam gösterimi için gereklidir.
* **Titreşim İzni (`android.permission.VIBRATE`):** Öğrenci seçimi tamamlandığında veya butonlara basıldığında dokunsal geri bildirim (haptic feedback) vermek için kullanılır.

---

## 2. Üçüncü Taraf Hizmetleri (Third-Party Services)

Uygulamanın çalışması ve sürdürülebilirliği için aşağıdaki güvenilir üçüncü taraf altyapıları kullanılmaktadır:

1. **Google AdMob (Google LLC):**
   * Uygulama içerisinde banner ve geçiş reklamları göstermek amacıyla Google AdMob SDK kullanılmaktadır.
   * Google AdMob, reklamların sunumu, kişiselleştirilmesi ve sıklığının denetlenmesi amacıyla cihazın Reklam Kimliğini (Advertising ID / GAID), yaklaşık konum ve genel cihaz verilerini toplayabilir.
   * Google Gizlilik Politikası: [https://policies.google.com/privacy](https://policies.google.com/privacy)
   * Google Reklam Ayarları: [https://adssettings.google.com/](https://adssettings.google.com/)

2. **Supabase (Supabase Inc.):**
   * Kullanıcı kimlik doğrulama, veri depolama ve gerçek zamanlı senkronizasyon için Supabase bulut altyapısı kullanılmaktadır.
   * Supabase Gizlilik Politikası: [https://supabase.com/privacy](https://supabase.com/privacy)

---

## 3. Veri Güvenliği ve Şifreleme (Data Security)

* **Aktarım Sırasında Şifreleme (In-Transit Encryption):** Uygulama ile sunucular arasındaki tüm veri iletişimi endüstri standardı **HTTPS / TLS 1.3** protokolüyle uçtan uca şifrelenerek taşınır.
* **Veri İzolasyonu (Row Level Security - RLS):** Veritabanımızda uygulanan RLS kuralları sayesinde, bir öğretmenin oluşturduğu sınıf ve öğrenci verilerine yalnızca ilgili öğretmenin kendi oturumu erişebilir. Başka bir kullanıcının sizin sınıf verilerinize erişmesi teknik olarak engellenmiştir.

---

## 4. Kullanıcı Verilerinin Silinmesi ve Hesap Kapatma (Data Deletion)

Google Play Store politikaları ve KVKK/GDPR gereğince, kullanıcılarımızın tüm verilerini silme hakkına tam saygı duyuyoruz:

* **Nasıl Silinir?** Uygulama içerisinden **Profilim** sekmesine giderek **"Tüm Verilerimi ve Hesabımı Sil"** butonuna dokunmanız yeterlidir.
* **Ne Olur?** Bu işlem onaylandığında, hesabınıza ait:
  - Kullanıcı profil bilgileriniz,
  - Oluşturduğunuz tüm sınıflar,
  - Eklediğiniz tüm öğrenciler ve puanlama kayıtları,
  - Tahta işlem geçmişiniz,
  veritabanımızdan **kalıcı ve geri döndürülemez şekilde anında silinir**.

---

## 5. Çocukların Gizliliği (Children's Privacy)

Uygulama öğretmenlerin sınıf yönetimini kolaylaştırmak amacıyla tasarlanmıştır. Öğrenci bilgileri (ad, soyad, numara) yalnızca öğretmenin kendi kullanımı için sınıf içi kura çekme aracı olarak saklanır. 13 yaşından küçük öğrencilerden doğrudan herhangi bir kişisel veri toplanmaz ve bu veriler reklam hedeflemesinde kullanılmaz.

---

## 6. Değişiklikler

Bu Gizlilik Politikası zaman zaman güncellenebilir. Herhangi bir değişiklik yapıldığında bu sayfadaki "Son Güncelleme Tarihi" revize edilecektir.

---

## 7. İletişim

Bu Gizlilik Politikası veya kişisel verilerinizle ilgili her türlü soru, görüş ve talepleriniz için bizimle iletişime geçebilirsiniz:

* **Geliştirici:** Bekir Bergin BAYSAL  
* **E-posta:** `bekirberginbaysal@gmail.com`  

