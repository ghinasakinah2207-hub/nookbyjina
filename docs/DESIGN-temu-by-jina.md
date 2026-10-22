# temu by jina — Design System & UI Design Specification

**Versi:** Final 1.0  
**Produk:** Web app pemesanan makanan homemade satu toko  
**Arah visual:** Warm, minimal, editorial, appetizing, mobile-first  
**Referensi brand:** `temu by jina`

---

## 1. Arah Desain

Temu by jina harus terasa seperti brand makanan homemade yang hangat dan rapi, bukan template dashboard SaaS. Fokus visual ada pada foto makanan, nama menu, harga, pilihan produk, dan tombol pemesanan. Ruang kosong yang cukup, teks yang mudah dibaca, dan alur yang jelas lebih penting daripada dekorasi.

### Karakter visual
- Hangat, bersih, tenang, dan terasa personal.
- Editorial food photography: foto makanan jelas, natural, dan menggugah selera.
- Minimal, tetapi bukan kosong atau dingin.
- Kontras teks kuat dan kontrol mudah disentuh di layar kecil.
- Konsisten antara Home, Menu, detail produk, keranjang, checkout, pembayaran, dan status order.

### Hindari
- Glassmorphism, neon, gradient berlebihan, efek blur dekoratif.
- Shadow pada card, tombol, input, bottom sheet, sticky bar, atau navigasi.
- Ornamen SaaS generik, grafik dekoratif, badge yang tidak bermakna, dan card bertumpuk tanpa alasan.
- Foto makanan terlalu kecil, crop yang memotong produk, teks terlalu padat, atau harga sulit ditemukan.
- Janji waktu siap seperti “siap besok”, “besok siap”, atau “1 day”.

## 2. Design Tokens

### Warna
| Token | Nilai | Pemakaian |
|---|---|---|
| `color-bg` | `#F6F6F7` | Background utama halaman |
| `color-surface` | `#FFFFFF` | Permukaan konten, form, panel |
| `color-text` | `#111111` | Teks utama, harga, judul |
| `color-muted` | `#737373` | Deskripsi, metadata, teks sekunder |
| `color-divider` | `#E5E5E5` | Garis pemisah dan border tipis |
| `color-primary` | `#F25B09` | CTA utama dan penekanan aksi |
| `color-primary-pressed` | `#D94D06` | State pressed/active CTA, bila diperlukan |
| `color-whatsapp` | `#25D366` | CTA yang membuka WhatsApp |
| `color-danger` | `#B42318` | Error, pembatalan, masalah penting |
| `color-warning-bg` | `#FFF4E5` | Peringatan ringan |
| `color-warning-text` | `#8A4B08` | Teks peringatan |
| `color-success` | `#18794E` | Konfirmasi berhasil yang benar-benar terjadi |
| `color-category` | `#111111` | Tombol kategori aktif dan tag kategori |
| `color-category-text` | `#FFFFFF` | Teks kategori gelap |
| `color-star` | `#FFC83D` | Bintang rating jika rating benar-benar digunakan |

Jangan menampilkan rating palsu. Badge rating hitam dengan bintang kuning hanya digunakan jika nilai rating 4.9 benar-benar berasal dari data yang sah; jika belum ada rating nyata, jangan tampilkan elemen rating.

### Tipografi
- Font utama: **Poppins**.
- Fallback: `ui-sans-serif, system-ui, sans-serif`.
- Gunakan bobot 400 untuk body, 500 untuk label, 600 untuk judul/CTA, 700 hanya untuk heading yang perlu penekanan.
- Body utama: 14–16 px.
- Metadata/caption: 12–13 px; jangan gunakan ukuran kecil untuk instruksi pembayaran atau status penting.
- Heading halaman mobile: 24–30 px.
- Judul produk: 18–24 px tergantung konteks.
- Harga: 16–20 px, bobot 600.
- Line-height body: sekitar 1.45–1.6; heading sekitar 1.15–1.3.

### Radius dan border
- Foto produk: radius 14–18 px.
- Tombol utama: radius 12–14 px.
- Input: radius 12 px.
- Panel/sheet: radius 16–20 px.
- Border tipis `1px solid #E5E5E5` bila perlu.
- Tidak ada drop shadow. Gunakan border, warna permukaan, whitespace, dan pemisah untuk membuat hierarki.

### Spacing
Gunakan skala 4 px: `4, 8, 12, 16, 20, 24, 32, 40, 48`.
- Padding layar mobile: 16–20 px.
- Jarak antarbagian: 24–32 px.
- Jarak label ke input: 8 px.
- Jarak antarkontrol form: 16 px.
- Jangan terlalu rapat di checkout atau pembayaran.

### Kontrol dan sentuhan
- Tinggi tombol utama minimum 48 px.
- Input minimum 48 px.
- Area sentuh ikon minimum 44 × 44 px.
- Focus state terlihat jelas untuk keyboard.
- Disabled state harus berbeda secara visual dan tidak hanya dibedakan oleh warna yang samar.

## 3. Layout dan Responsivitas

### Mobile-first
- Target utama lebar 360–430 px.
- Gunakan satu kolom untuk form dan detail transaksi.
- Katalog dapat memakai grid dua kolom jika nama, foto, dan harga tetap mudah dibaca; pada layar sangat sempit gunakan satu kolom bila grid membuat konten sesak.
- Bottom navigation pelanggan tetap terlihat pada halaman utama, menu, keranjang, dan pesanan; disembunyikan saat checkout dan pembayaran.
- Sticky CTA hanya digunakan jika benar-benar membantu dan tidak menutupi konten.
- Sisakan padding bawah yang cukup untuk navigasi tetap.
- Hindari horizontal scroll pada seluruh halaman.

### Tablet dan desktop
- Batasi lebar konten utama agar tidak melebar tanpa kendali.
- Menu bisa memakai grid yang lebih lebar.
- Detail produk dapat menggunakan kolom gambar dan informasi jika ruang cukup.
- Dashboard admin dapat memakai sidebar di desktop dan navigasi ringkas di mobile.
- Tabel admin pada layar sempit berubah menjadi list/card rows atau layout bertumpuk; jangan memaksa tabel lebar dengan horizontal scroll.

## 4. Foto dan Media

### Produk
- Rasio gambar produk konsisten dalam kartu menu.
- Detail produk menampilkan galeri swipe horizontal, indikator `1/5` bila lebih dari satu foto; sembunyikan indikator jika hanya satu foto.
- Gunakan `object-fit: cover` untuk kartu dengan crop yang konsisten; gunakan `contain` pada gambar produk yang bentuk/kemasannya harus terlihat utuh.
- Gambar utama harus menampilkan produk dengan jelas dan tidak terhalang teks/ornamen.
- Favorit berupa ikon transparan di atas foto, dengan area sentuh yang cukup.

### Banner
- Format landscape.
- Admin dapat menentukan posisi crop.
- Maksimal tiga banner aktif di Home.
- Jika tidak ada banner aktif, jangan sisakan ruang kosong atau placeholder besar.

### Upload admin
- Maksimal 2 MB per gambar; JPG, PNG, WebP.
- Tampilkan progress, preview, error, dan status tersimpan.
- Perubahan media bersifat draft sampai tombol Simpan ditekan.
- Jika proses gagal, jangan menampilkan pesan sukses palsu atau memublikasikan perubahan sebagian.

## 5. Komponen Bersama

### Tombol
**Primary:** oranye `#F25B09`, teks putih, bobot 600, tanpa shadow. Dipakai untuk aksi utama seperti `Tambah ke Keranjang`, `Lanjut ke Checkout`, dan `Simpan`.

**Secondary:** putih dengan border divider dan teks gelap. Dipakai untuk `Kembali`, `Batal`, atau aksi alternatif.

**Dark category/tag:** latar hitam dan teks putih untuk kategori aktif atau tag yang sesuai.

**WhatsApp:** hijau `#25D366`, teks putih, ikon WhatsApp bila tersedia. Gunakan hanya untuk tindakan yang benar-benar membuka WhatsApp. Label pembayaran wajib `Konfirmasi pembayaran ke admin`.

**Danger:** gaya jelas namun tidak mendominasi, dipakai untuk pembatalan dan aksi destruktif. Konfirmasi diperlukan untuk aksi penting seperti menandai lunas dan membatalkan pesanan.

### Input dan form
- Label selalu terlihat; jangan hanya mengandalkan placeholder.
- Tampilkan error dekat input terkait dengan bahasa sederhana.
- Jangan menghapus isi form saat terjadi error jaringan.
- Harga/total yang berasal dari server diberi tampilan ringkasan yang jelas.
- Form admin di ponsel memakai satu kolom; kelompokkan field sesuai tugas.

### Status
Gunakan label teks bersama warna; jangan mengandalkan warna saja.
- `Pesanan baru`: netral/gelap.
- `Menunggu Verifikasi`: amber/peringatan.
- `Lunas`: hijau.
- `Diproses`: oranye/aktif.
- `Siap`: hijau/tegas.
- `Selesai`: netral.
- `Dibatalkan`: merah.
Status pembayaran dan status pesanan harus terlihat sebagai dua informasi berbeda.

### Empty state
- Sampaikan kondisi dengan singkat.
- Beri satu CTA relevan jika ada langkah berikutnya.
- Gunakan ilustrasi kecil hanya jika mendukung konteks; jangan mengganti penjelasan dengan ilustrasi saja.
- Contoh: keranjang kosong → “Keranjangmu masih kosong” + `Lihat Menu`.

### Loading, error, dan sukses
- Gunakan skeleton sederhana untuk konten yang sedang dimuat.
- Saat checkout gagal, pertahankan keranjang dan beri pesan yang dapat ditindaklanjuti.
- Jangan menampilkan sukses sebelum backend mengonfirmasi tindakan.
- Saat copy link gagal, tampilkan opsi salin manual.
- Saat audio dashboard diblokir browser, badge visual tetap bekerja.

## 6. Customer Journey dan Spesifikasi Halaman

### A. Welcome / Home (`/`)
**Tujuan:** mengenalkan brand dan membawa pelanggan ke menu dengan cepat.

Elemen:
- Wordmark `temu by jina`.
- Hero foto makanan yang kuat, natural, dan hangat.
- Headline singkat yang terasa personal; hindari paragraf panjang.
- CTA utama `Lihat Menu`.
- Jika toko tutup, tampilkan status toko secara ringkas tanpa menjanjikan waktu siap.
- Bagian banner promo maksimal tiga, hanya jika aktif.
- Beberapa pilihan menu dapat ditampilkan, tetapi jangan membuat Home terlalu panjang.
- Bottom navigation.

Welcome interstitial hanya tampil pada kunjungan pertama bila memang digunakan; kunjungan berikutnya langsung ke Home. Jangan memaksa intro panjang setiap kunjungan.

### B. Menu (`/menu`)
**Tujuan:** membantu pelanggan menemukan makanan dengan cepat.

Elemen:
- Judul `Menu` dan search input.
- Search dijalankan setelah tombol `Cari` atau Enter.
- Chip kategori hitam/putih, dengan state aktif yang jelas.
- Grid/list produk dengan foto, nama, harga, dan label `Habis` jika tidak tersedia.
- Produk habis tetap terlihat tetapi tombol tambah tidak tersedia.
- Favorit berupa ikon overlay; simpan lokal pada browser/perangkat.
- Empty state jika hasil pencarian kosong.
- Tidak ada rating palsu atau data sosial yang tidak nyata.

### C. Kartu produk
- Foto konsisten, rounded.
- Nama produk maksimal beberapa baris sebelum dipotong dengan cara yang rapi.
- Harga mudah ditemukan.
- Label `Habis` bila tidak tersedia.
- Area klik mengarah ke detail; jangan membuat ikon favorit ikut memicu navigasi detail.
- Hindari shadow.

### D. Detail produk (`/produk/[id]`)
**Tujuan:** memperlihatkan produk dan membantu kustomisasi.

Urutan konten:
1. Galeri foto.
2. Nama dan harga dasar.
3. Deskripsi singkat.
4. Pilihan varian wajib/opsional.
5. Add-on dengan harga tambahan.
6. Catatan produk maksimal 200 karakter.
7. Kontrol jumlah.
8. CTA `Tambah ke Keranjang`.

Aturan:
- Tampilkan label `Wajib dipilih` untuk grup wajib.
- Tampilkan batas pilihan jika relevan, misalnya “Pilih 1” atau “Pilih maksimal 3”.
- Tampilkan perubahan harga dengan jelas.
- Jika produk habis, tampilkan status dan nonaktifkan CTA.
- Gunakan bottom sheet untuk kustomisasi hanya jika semua pilihan masih nyaman dipakai; pada layar kecil, sheet hampir penuh tinggi dan dapat discroll.

### E. Keranjang (`/keranjang`)
**Tujuan:** meninjau pesanan sebelum checkout.

Elemen:
- Item, foto kecil, nama, varian, add-on, harga, jumlah, dan catatan per item.
- Catatan item bisa diedit inline atau melalui modal/sheet ringan.
- Baris hanya digabung jika produk, varian, add-on, dan catatan identik.
- Item yang habis/diarsipkan diberi peringatan dan harus dihapus sebelum checkout.
- Catatan pesanan maksimal 200 karakter.
- Ringkasan subtotal dan CTA `Lanjut ke Checkout`.
- Empty state: keranjang kosong + CTA `Lihat Menu`.

### F. Checkout (`/checkout`)
**Tujuan:** menyelesaikan data pesanan tanpa friksi.

Elemen:
- Nama pelanggan.
- Nomor WhatsApp.
- Pilihan `Pickup` atau `Delivery`.
- Ringkasan produk dan subtotal.
- Ongkir dan total final.
- Catatan pesanan opsional.
- Ringkasan QRIS sebagai metode pembayaran.
- CTA `Buat Pesanan`.

Aturan:
- Jangan meminta alamat lengkap pada form awal.
- Jika delivery ke area yang belum dikonfigurasi, arahkan ke WhatsApp untuk konfirmasi cakupan dan ongkir sebelum order dibuat.
- Jangan membuat order sebelum total final diketahui.
- Saat toko tutup, tampilkan pesan bahwa order tetap diterima dan ditangani saat operasional tersedia.
- Validasi error harus jelas dan tidak menghapus input.

### G. Pembayaran QRIS (`/pembayaran/[order]`)
**Tujuan:** membuat langkah pembayaran dan konfirmasi jelas.

Urutan:
1. Nomor order dan total pembayaran.
2. Nama merchant.
3. Gambar QRIS yang jelas dan cukup besar.
4. Instruksi singkat: cek nama merchant, masukkan nominal tepat jika diminta aplikasi, lalu selesaikan pembayaran.
5. Countdown 2 jam dan jam deadline dalam WIB.
6. Status `Menunggu Verifikasi` setelah pelanggan masuk ke tahap pembayaran.
7. Tombol hijau `Konfirmasi pembayaran ke admin`.
8. Pesan: “Admin akan memeriksa transaksi pada riwayat merchant. Screenshot tidak otomatis mengonfirmasi pembayaran.”

Aturan:
- Tidak ada tombol `Saya sudah bayar` yang berfungsi sebagai verifikasi.
- Tombol WhatsApp membuka chat berisi nomor order, nama pelanggan, total, dan metode pembayaran; pelanggan menekan Kirim sendiri.
- Status berubah hanya dari backend setelah admin memverifikasi transaksi aktual.
- Jika waktu habis dan belum lunas terverifikasi, tampilkan `Pesanan Dibatalkan` dan alasan tenggat pembayaran berakhir. Jangan tampilkan tombol reorder atau CTA pembayaran aktif.
- Jika pembayaran sudah lunas, tampilkan status terbaru dan CTA melihat detail order.

### H. Halaman sukses
- Tampilkan nomor order dengan penekanan visual.
- Ringkasan status saat ini.
- CTA `Salin Tautan Pesanan` dan `Lihat Detail Pesanan`.
- CTA WhatsApp boleh tersedia untuk koordinasi yang sesuai, tetapi tidak boleh membuat pelanggan mengira order baru tercatat hanya jika chat terkirim.
- Notifikasi salin berhasil/gagal harus jujur.

### I. Riwayat pesanan (`/pesanan`)
- Menampilkan order yang terkait dengan browser/perangkat yang sama.
- Setiap item menampilkan nomor order, tanggal, total, dan status order/pembayaran.
- Jika tidak ada riwayat, tampilkan empty state dengan CTA `Lihat Menu`.
- Riwayat lokal bukan sumber kebenaran; status/detail diambil dan divalidasi server.

### J. Detail pesanan (`/pesanan/[token]`)
- Tampilkan nomor order, waktu, status order, status pembayaran, item, varian, add-on, catatan item, subtotal, ongkir, total, metode pembayaran.
- Jangan menampilkan nama atau nomor WhatsApp pelanggan pada tautan token.
- Beri pengingat agar tautan tidak dibagikan.
- Polling backend setiap 15 detik ketika halaman aktif dan order masih berjalan; hentikan ketika halaman tidak aktif, cek langsung saat kembali, dan hentikan permanen untuk `Selesai`/`Dibatalkan`.
- Jangan menampilkan tombol pembatalan atau reorder.

## 7. Admin UI

### A. Prinsip dashboard
Dashboard adalah alat operasional sederhana, bukan back office perusahaan. Fokus utama: pesanan yang perlu tindakan, menu, dan pengaturan harian.

### B. Navigasi admin
Di desktop, sidebar ringkas: `Dashboard`, `Pesanan`, `Menu`, `Kategori & Banner`, `Laporan`, `Pengaturan`. Di mobile, gunakan header ringkas dan navigasi yang mudah diakses; jangan menaruh terlalu banyak menu sekaligus.

### C. Dashboard
- Ringkasan pesanan baru, pesanan berjalan, pesanan menunggu verifikasi QRIS, dan omzet hari ini.
- Daftar singkat pesanan terbaru.
- Badge pesanan baru yang belum dibuka.
- Jika browser mengizinkan, suara dapat diputar saat order baru datang; badge visual wajib tetap ada.
- Pesanan dianggap dibuka ketika admin membuka detail order.
- Pesanan yang dibatalkan langsung keluar dari hitungan badge baru.
- Hindari grafik dekoratif atau statistik yang tidak membantu tindakan.

### D. Daftar pesanan
- Satu daftar utama dengan bagian `Menunggu Verifikasi QRIS` dan badge terpisah.
- Urutan prioritas: pesanan baru/menunggu verifikasi, lalu `Diproses`/`Siap`, lalu `Selesai`/`Dibatalkan`; yang terbaru lebih dahulu dalam kelompok.
- Search berdasarkan nomor order atau nama pelanggan saja.
- Tidak ada filter tanggal atau pencarian nomor WhatsApp.
- Di mobile, gunakan list/card row, bukan tabel lebar.

### E. Detail pesanan admin
- Nomor order dan waktu dibuat.
- Nama dan nomor WhatsApp pelanggan hanya pada dashboard admin.
- Status order dan pembayaran tampil terpisah.
- Item, varian, add-on, catatan item/order, subtotal, ongkir, total.
- Jenis fulfillment pickup/delivery dan informasi koordinasi yang tersedia.
- Deadline QRIS dan indikator waktu tersisa jika belum lunas.
- Aksi yang tersedia sesuai status, termasuk `Tandai Lunas`, `Diproses`, `Siap`, `Selesai`, atau `Batalkan` bila valid.
- `Tandai Lunas` selalu memerlukan konfirmasi akhir dan instruksi bahwa admin harus memeriksa transaksi aktual di DANA Bisnis.
- Tidak ada log audit, status refund, atau tombol refund.

### F. Form produk
- Kelompokkan informasi dasar, harga/HPP, foto, kategori, varian, add-on, dan ketersediaan.
- Upload foto menampilkan progress dan preview.
- Galeri dapat diurutkan; foto utama jelas ditandai.
- Perubahan belum terlihat oleh pelanggan sampai Simpan berhasil.
- Aksi arsip diberi penjelasan singkat karena produk tidak lagi muncul di menu, tetapi histori lama tetap ada.

### G. Pengaturan dan laporan
- Pengaturan dibagi menjadi kelompok: Toko & Jam, WhatsApp, QRIS, Delivery, dan preferensi yang benar-benar dibutuhkan.
- Laporan menampilkan omzet, HPP terjual, estimasi laba kotor, dan jumlah order.
- Jangan menampilkan refund sebagai status sistem; pengembalian kelebihan pembayaran ditangani manual di luar dashboard.
- Gunakan label `Estimasi Laba Kotor`, bukan `Laba Bersih`.

## 8. Microcopy

Gunakan bahasa Indonesia yang singkat, ramah, dan tidak kaku.

| Konteks | Copy yang disarankan |
|---|---|
| CTA Home | `Lihat Menu` |
| CTA tambah | `Tambah ke Keranjang` |
| CTA checkout | `Lanjut ke Checkout` |
| Buat order | `Buat Pesanan` |
| QRIS WhatsApp | `Konfirmasi pembayaran ke admin` |
| Produk habis | `Habis` |
| Keranjang kosong | `Keranjangmu masih kosong` |
| Toko tutup | `Toko sedang tutup. Pesanan tetap bisa dibuat dan akan ditangani saat operasional tersedia.` |
| Area belum diketahui | `Hubungi admin dulu untuk memastikan area layanan dan ongkir.` |
| Menunggu verifikasi | `Menunggu Verifikasi` |
| QRIS expired | `Pesanan Dibatalkan` + `Batas waktu pembayaran telah berakhir.` |
| Link tersalin | `Tautan pesanan berhasil disalin.` |
| Copy gagal | `Tautan belum tersalin. Silakan salin alamat ini secara manual.` |
| Error jaringan | `Koneksi bermasalah. Coba lagi; pesananmu tidak akan dianggap berubah sampai sistem mengonfirmasi.` |

Jangan gunakan copy yang menyatakan WhatsApp sudah terkirim/dibaca, pembayaran sudah lunas sebelum diverifikasi, atau makanan siap pada waktu tertentu.

## 9. Accessibility dan Quality Bar

- Kontras teks dan latar memadai; status tidak hanya dibedakan dengan warna.
- Semua kontrol dapat dipakai keyboard dan memiliki focus state.
- Ikon dekoratif diberi `aria-hidden`; ikon aksi memiliki accessible label.
- Form memiliki label eksplisit, pesan error terhubung ke input, dan urutan tab logis.
- Jangan menggunakan animasi yang mengganggu; hormati `prefers-reduced-motion`.
- Gambar memiliki alt text yang sesuai; gambar dekoratif boleh alt kosong.
- Layout harus diuji setidaknya pada lebar 360, 390, 768, 1024, dan 1440 px.
- Uji loading, empty, error, disabled, success, expired, dan status jaringan.

## 10. Checklist Konsistensi Desain

- [ ] Font Poppins dan token warna konsisten.
- [ ] Tidak ada shadow pada card, tombol, input, sheet, sticky bar, atau navigasi.
- [ ] Foto produk dominan dan crop konsisten.
- [ ] CTA utama oranye; CTA WhatsApp hijau.
- [ ] Kategori menggunakan gaya hitam/putih yang konsisten.
- [ ] Bottom nav tersembunyi di checkout dan pembayaran.
- [ ] Tidak ada status/rating palsu atau janji waktu siap.
- [ ] QRIS menampilkan total, merchant, tenggat, dan instruksi jelas.
- [ ] Status order dan pembayaran dipisah secara visual.
- [ ] Dashboard admin nyaman di mobile tanpa horizontal scroll.
- [ ] Tidak ada UI untuk status refund, log audit, akun customer, atau fitur di luar MVP.
