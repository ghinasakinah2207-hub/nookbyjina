# temu by jina — Product Requirements Document

**Versi:** Final 1.0 (konsolidasi keputusan v1.7)  
**Status:** Baseline implementasi MVP  
**Produk:** Web app pemesanan makanan homemade untuk satu toko  
**Brand:** temu by jina  
**Bahasa:** Indonesia  
**Zona waktu operasional:** `Asia/Jakarta` (WIB, UTC+7)

---

## 1. Ringkasan Produk

**temu by jina** adalah web app pemesanan menu makanan homemade yang sederhana, mobile-first, dan mudah dikelola oleh satu pemilik. Pelanggan membuka web melalui URL atau QR code, melihat menu, memilih produk dan kustomisasi, mengisi nama serta nomor WhatsApp, memilih pickup atau delivery, lalu membayar melalui QRIS statis merchant. Pelanggan tidak perlu membuat akun.

Pemilik mengelola produk, ketersediaan, kategori, banner, pesanan, verifikasi QRIS, jam operasional, area/ongkir, nomor WhatsApp, HPP, dan laporan dasar melalui satu dashboard admin.

Produk ini **bukan marketplace atau sistem perusahaan**. Prioritasnya adalah alur pemesanan yang jelas, harga yang benar, pembayaran yang diverifikasi secara manual, dan pengelolaan yang praktis. Jangan menambahkan fitur kompleks di luar ruang lingkup MVP tanpa kebutuhan nyata.

## 2. Prinsip Produk

1. **Sederhana lebih penting daripada banyak fitur.**
2. **Mobile-first.** Alur pelanggan harus nyaman digunakan dengan satu tangan di ponsel.
3. **Tanpa akun pelanggan.** Akses detail pesanan menggunakan sesi/tautan anonim yang aman.
4. **Backend adalah sumber kebenaran.** Harga, ongkir, status, total, dan tenggat tidak ditentukan oleh browser.
5. **Pembayaran QRIS diverifikasi manusia.** Screenshot dan tombol WhatsApp bukan bukti pembayaran.
6. **Operasional manual tetap jelas.** Admin mengatur ketersediaan, memverifikasi transaksi, dan memperbarui status sesuai keadaan nyata.
7. **Jangan membuat janji waktu siap.** Semua produk pre-order, tetapi UI tidak menjanjikan “siap besok”, “1 day”, atau waktu tertentu.

## 3. Sasaran dan Bukan Sasaran

### Sasaran MVP
- Menampilkan katalog produk, kategori, banner, detail, varian, add-on, dan status tersedia/habis.
- Menyediakan keranjang yang bertahan pada browser/perangkat yang sama.
- Checkout tanpa login dengan nama dan nomor WhatsApp.
- Mendukung pickup gratis dan delivery dengan aturan ongkir yang disepakati.
- Menggunakan QRIS statis merchant sebagai satu-satunya metode pembayaran.
- Menampilkan status pesanan dan riwayat lokal serta tautan aman untuk membuka detail pesanan.
- Memberi admin cara praktis mengelola pesanan dan katalog dari ponsel maupun desktop.
- Menampilkan laporan dasar omzet, HPP terjual, perkiraan laba kotor, dan jumlah pesanan.

### Tidak termasuk MVP
- Akun/profil pelanggan atau login pelanggan.
- Marketplace, multi-toko, multi-tenant, atau multi-admin.
- Pembayaran tunai, payment gateway, QRIS dinamis, webhook, atau rekonsiliasi otomatis.
- WhatsApp Business API atau pesan WhatsApp otomatis dari sistem.
- Pemilihan jadwal pesanan oleh pelanggan, tracking kurir, peta, atau ETA otomatis.
- Kuota/stock decrement otomatis, inventaris bahan baku, resep HPP otomatis, supplier, atau akuntansi penuh.
- Loyalty, kupon, rating, ulasan, CRM, atau analitik lanjutan.
- Status refund, tombol refund, atau pelacakan refund di dashboard.
- Log audit khusus yang mencatat setiap perubahan status, identitas admin, atau waktu tindakan.

## 4. Pengguna dan Akses

### Pelanggan
Pelanggan dapat melihat menu, mencari produk, memilih kustomisasi, mengelola keranjang, checkout, melihat instruksi QRIS, meminta konfirmasi pembayaran lewat WhatsApp, serta melihat status/detail pesanan. Pelanggan tidak dapat membatalkan atau mengubah pesanan melalui UI; permintaan dilakukan melalui WhatsApp dan diputuskan admin.

### Admin/pemilik
- Hanya **satu akun admin** pada MVP.
- Login menggunakan email dan password melalui Supabase Auth atau mekanisme autentikasi setara yang aman.
- Tidak ada registrasi admin publik, undangan admin, atau manajemen role.
- Admin mengelola pesanan, menu, kategori, foto, banner, pengaturan toko, QRIS, ongkir, HPP, dan laporan dasar.
- Admin memverifikasi pembayaran dengan memeriksa transaksi aktual di DANA Bisnis (atau akun merchant QRIS yang digunakan), lalu mengonfirmasi `Tandai Lunas`.
- Dashboard hanya menampilkan status saat ini; tidak menyediakan riwayat tindakan khusus admin.

## 5. Platform dan Arsitektur yang Disarankan

- **Frontend:** Next.js App Router, TypeScript, Tailwind CSS.
- **Backend/database:** Supabase PostgreSQL.
- **Admin authentication:** Supabase Auth untuk satu akun.
- **Media:** Supabase Storage untuk foto produk, banner, dan gambar QRIS.
- **Deployment:** Vercel atau platform setara yang mendukung Next.js.
- **Zona waktu:** `Asia/Jakarta`; semua deadline dan pembatalan dihitung oleh server.

Jangan memasukkan secret/service-role key ke bundle browser. Semua operasi sensitif, validasi checkout, pembuatan nomor order, verifikasi token pesanan, dan perubahan status dilakukan di server.

## 6. Navigasi dan Halaman

### Pelanggan
- `/` — welcome/home.
- `/menu` — katalog, kategori, pencarian, banner.
- `/produk/[slug-atau-id]` — detail produk dan kustomisasi.
- `/keranjang` — item dan catatan.
- `/checkout` — nama, WhatsApp, pickup/delivery, ringkasan total.
- `/pembayaran/[order]` — QRIS, total, tenggat, konfirmasi WhatsApp.
- `/pesanan` — riwayat lokal di browser/perangkat yang sama.
- `/pesanan/[token]` — detail pesanan melalui token akses khusus.

Bottom navigation pelanggan: **Home, Menu, Keranjang, Pesanan**. Sembunyikan bottom navigation di checkout dan pembayaran agar fokus pada penyelesaian transaksi.

### Admin
- `/admin/login`
- `/admin/dashboard`
- `/admin/pesanan`
- `/admin/pesanan/[id]`
- `/admin/menu`
- `/admin/menu/baru`
- `/admin/menu/[id]`
- `/admin/kategori`
- `/admin/banner`
- `/admin/pengaturan`
- `/admin/laporan`

Halaman dapat disusun sebagai tab/subhalaman selama semua fungsi tetap mudah ditemukan dan layout tidak mengalami horizontal scroll.

## 7. Katalog dan Produk

Setiap produk dapat memiliki:
- Nama, deskripsi, kategori, harga dasar, HPP final per porsi, status aktif/arsip, status tersedia/habis, urutan tampil.
- Maksimal 5 foto (1 utama dan hingga 4 tambahan), dapat diunggah, dihapus, diurutkan, dan dipilih foto utamanya.
- Kelompok varian dan add-on dengan aturan pilihan.
- Data harga dan HPP snapshot pada order untuk menjaga histori.

### Ketersediaan
- Semua produk menggunakan pre-order; tidak ada klasifikasi Ready/PO terpisah.
- Ketersediaan dikelola manual: `Tersedia` atau `Habis`.
- Produk habis tetap dapat dilihat dengan label `Habis`, tetapi tidak dapat ditambahkan ke keranjang.
- Server memvalidasi ketersediaan saat add-to-cart dan checkout.
- Jika item di keranjang berubah menjadi habis, item tetap terlihat dengan peringatan; checkout diblokir sampai item tersebut dihapus.
- Produk yang diarsipkan disembunyikan dari katalog dan tidak dapat dipesan. Riwayat pesanan lama tetap menampilkan snapshot produk.
- Tidak ada pengurangan stok otomatis atau kuota pesanan.

### Varian dan add-on
- Admin dapat membuat grup pilihan, opsi, urutan, pilihan wajib/opsional, batas minimum/maksimum, dan selisih harga.
- Add-on dapat khusus untuk produk atau digunakan ulang di beberapa produk. Harga add-on yang dioverride pada produk tertentu tidak mengubah produk lain.
- Setiap add-on adalah pilihan ya/tidak; tidak ada kontrol jumlah per add-on.
- Harga final dihitung dan divalidasi server berdasarkan data database.
- HPP dicatat manual sebagai HPP final per porsi. HPP add-on tidak dipisahkan secara detail; laporan laba kotor bersifat estimasi.

### Foto dan upload
- Maksimal 2 MB per gambar.
- Format JPG, PNG, WebP; validasi tipe file di frontend dan server berdasarkan konten, bukan hanya ekstensi.
- Optimalkan/resize otomatis setelah upload dengan kualitas visual yang baik.
- Foto produk dan banner dikelola melalui dashboard; database menyimpan path/referensi media.
- Perubahan foto disimpan setelah admin menekan Simpan. Jika upload/optimasi gagal, tampilkan error dan jangan memublikasikan perubahan parsial.
- Jika foto utama dihapus, admin harus memilih foto pengganti sebelum menyimpan.

### Kategori
- Admin dapat membuat, mengedit, mengurutkan, dan menghapus kategori.
- Jika kategori yang berisi produk dihapus, produk tetap ada dan dipindahkan ke kategori sistem `Tanpa Kategori`.
- `Tanpa Kategori` tidak dapat dihapus dan produknya muncul di `Semua Menu`, bukan sebagai tab kategori terpisah.

### Banner
- Maksimal 3 banner promo aktif di halaman Home.
- Admin dapat upload, urutkan, aktif/nonaktifkan, dan menentukan tujuan klik: tidak ada, halaman Menu, atau detail produk.
- Jika tujuan banner mengarah ke produk yang tidak tersedia/diarsipkan, tangani dengan aman dan jangan arahkan ke halaman rusak.
- Jika banner aktif kurang dari 3, layout tidak boleh meninggalkan slot kosong.

### Duplikasi produk
Admin dapat menduplikasi produk menjadi draft baru dengan deskripsi, foto, kategori, varian, dan add-on yang dapat diedit. Produk duplikat memperoleh ID baru dan tidak mewarisi histori, penjualan, atau order. Status ketersediaan tidak boleh disalin sebagai data historis.

## 8. Pencarian, Keranjang, dan Catatan

### Pencarian
- Pencarian berjalan setelah pelanggan menekan tombol `Cari` atau Enter, bukan setiap ketikan.
- Sediakan empty state yang jelas jika tidak ada hasil.
- Produk dalam `Tanpa Kategori` tetap dapat ditemukan melalui `Semua Menu` dan pencarian.

### Keranjang
- Keranjang bertahan pada browser/perangkat yang sama hingga data situs dibersihkan.
- Baris item digabung hanya jika produk, varian, add-on, dan catatan per item semuanya identik. Jika salah satu berbeda, tampilkan sebagai baris terpisah.
- Pelanggan dapat mengedit catatan item langsung dari keranjang tanpa menghapus dan menambahkan ulang produk.
- Kuantitas dan seluruh harga divalidasi ulang server saat checkout.
- Item yang habis/diarsipkan diberi peringatan dan harus dihapus sebelum checkout.

### Catatan
- Catatan per item: opsional, maksimal 200 karakter.
- Catatan pesanan: opsional, maksimal 200 karakter.
- Catatan adalah permintaan, bukan instruksi yang otomatis mengubah harga. Jika permintaan membutuhkan biaya tambahan, admin mengonfirmasi lewat WhatsApp sebelum melanjutkan.

## 9. Checkout, Pickup, dan Delivery

### Data checkout
Wajib: nama pelanggan dan nomor WhatsApp. Alamat lengkap/patokan rumah tidak perlu diisi di form awal; dikonfirmasi melalui WhatsApp jika diperlukan.

### Pickup
- Pickup gratis.
- Tetap menggunakan QRIS sebagai metode pembayaran pada MVP.

### Delivery
- Ongkir delivery di Lhoksukon adalah Rp3.000 jika subtotal produk **Rp50.000 atau kurang**.
- Gratis ongkir jika subtotal produk **lebih dari Rp50.000**. Subtotal tepat Rp50.000 belum memenuhi syarat gratis ongkir.
- Aturan otomatis ini hanya berlaku untuk area yang sudah dikonfigurasi.
- Untuk area di luar cakupan/tarif yang diketahui, pelanggan harus menghubungi admin melalui WhatsApp **sebelum order dibuat**. Tidak boleh membuat order atau payment attempt sampai area, ongkir, dan total disepakati.
- Setelah ongkir disepakati, pelanggan melanjutkan checkout dengan tarif yang sesuai; server menyimpan snapshot tarif tersebut.
- Jangan menambahkan form alamat lengkap atau pilihan jadwal delivery pada MVP.

### Saat toko tutup
Pelanggan tetap boleh membuat pesanan saat toko tutup. Tampilkan informasi bahwa toko sedang tutup dan pesanan akan ditangani saat operasional tersedia, tanpa janji tanggal/jam siap tertentu. Admin mengatur jadwal mingguan dan tombol tutup sementara.

## 10. Nomor Order dan Data Order

- Format nomor: `TJ-YYMMDD-NNN`, tanggal berdasarkan WIB, contoh `TJ-261010-001`.
- Nomor urut harian dimulai dari `001`; jika melampaui 999, jumlah digit bertambah tanpa mendaur ulang nomor.
- Alokasi nomor dilakukan atomik di database/backend dengan constraint unik, aman terhadap checkout bersamaan.
- Nomor order bukan token keamanan dan tidak boleh menjadi satu-satunya cara mengakses detail pesanan.
- Order menyimpan snapshot nama produk, pilihan, catatan, harga satuan, add-on, HPP, subtotal, ongkir, total, metode pembayaran, dan status saat checkout. Perubahan produk setelahnya tidak mengubah order lama.

## 11. Pembayaran QRIS Statis

### Konfigurasi
- Satu-satunya metode pembayaran MVP adalah QRIS statis merchant.
- Admin mengunggah gambar QRIS merchant yang sah, nama merchant, dan status aktif/nonaktif.
- Gunakan QRIS merchant yang sesuai untuk transaksi usaha, misalnya dari DANA Bisnis setelah pendaftaran/verifikasi; jangan menggantinya dengan QR transfer personal tanpa memastikan validitasnya.
- QRIS statis tidak menyematkan nominal order secara dinamis. Pelanggan mengikuti instruksi di halaman dan memasukkan nominal yang tepat jika aplikasi pembayaran memintanya.
- Saat QRIS dinonaktifkan, checkout baru tidak dapat dibuat. Order yang sudah dibuat tetap tercatat dan ditangani berdasarkan statusnya.

### Alur pelanggan
1. Server menghitung total final dan membuat order.
2. Halaman pembayaran menampilkan QRIS, nama merchant, total tepat, instruksi pembayaran, tenggat 2 jam, dan tombol WhatsApp hijau `Konfirmasi pembayaran ke admin`.
3. Tombol membuka chat dengan pesan terisi otomatis yang berisi nomor order, nama pelanggan, total, dan metode QRIS. Pelanggan harus menekan Kirim sendiri.
4. Membuka WhatsApp atau mengirim screenshot tidak mengubah status pembayaran.
5. Order tetap tersimpan meskipun pelanggan tidak membuka atau mengirim pesan WhatsApp.

### Verifikasi admin
1. Admin memeriksa transaksi **aktual** di riwayat DANA Bisnis/akun merchant.
2. Admin mencocokkan transaksi dan nominal dengan order.
3. Admin menekan `Tandai Lunas` lalu mengonfirmasi.
4. Sistem mengubah pembayaran menjadi `Lunas` hanya setelah konfirmasi admin tersimpan.
5. Screenshot pelanggan saja tidak cukup. Jika transaksi tidak ditemukan atau nominal tidak sesuai, jangan tandai lunas dan jangan proses pesanan.
6. Order hanya dapat masuk `Diproses` setelah pembayaran benar-benar terverifikasi lunas.

### Batas waktu dan pembatalan
- Batas waktu pembayaran: **2 jam sejak order dibuat**, tidak dapat diperpanjang.
- Deadline dan pembatalan dihitung di backend berdasarkan waktu server dan ditampilkan dalam WIB. Countdown browser hanya tampilan; bukan sumber kebenaran.
- Jika pembayaran belum terverifikasi lunas ketika 2 jam habis, backend otomatis mengubah order menjadi `Dibatalkan` dan pembayaran menjadi `Dibatalkan`/status terminal yang konsisten.
- Pembatalan otomatis dikeluarkan dari badge order baru. Riwayat order tetap tersimpan.
- Jika pembayaran aktual sudah masuk tetapi terlambat diverifikasi setelah order dibatalkan, admin memeriksa transaksi dan menangani pengembalian dana secara manual. Order yang dibatalkan tidak otomatis diaktifkan kembali.

### Nominal tidak sesuai
- Jika pembayaran kurang, status tetap `Menunggu Verifikasi`; admin menghubungi pelanggan lewat WhatsApp.
- Jika pelanggan mengirim pembayaran tambahan, admin memeriksa transaksi tambahan aktual di DANA Bisnis dan memastikan akumulasi pembayaran terverifikasi mencukupi total sebelum menekan `Tandai Lunas` dan mengonfirmasi.
- Tenggat 2 jam tetap berlaku; tidak ada perpanjangan. Pembayaran yang belum lunas terverifikasi saat tenggat habis mengikuti aturan pembatalan.
- Jika pelanggan membayar lebih, admin memverifikasi transaksi aktual, menandai pesanan lunas setelah konfirmasi, lalu menghubungi pelanggan untuk mengatur pengembalian kelebihan pembayaran secara manual.
- Pengembalian dana dilakukan di luar sistem melalui komunikasi WhatsApp dan prosedur transfer/penyedia. **Tidak ada status refund, tombol refund, pelacakan refund, atau log refund di dashboard.**

## 12. Status Pesanan dan Pembayaran

### Status pesanan
- `Pesanan baru`
- `Diproses`
- `Siap`
- `Selesai`
- `Dibatalkan`

### Status pembayaran
- `Menunggu Verifikasi` — status awal pembayaran QRIS; admin perlu memeriksa transaksi aktual, terlepas dari apakah pelanggan sudah mengirim pesan WhatsApp.
- `Lunas` — transaksi aktual telah diverifikasi oleh admin dan total pembayaran yang diterima mencukupi total order.
- `Dibatalkan` — order dibatalkan, termasuk ketika tenggat 2 jam habis sebelum pembayaran terverifikasi lunas.

Nama status di UI harus konsisten. Status teknis internal boleh lebih terstruktur, tetapi pelanggan tidak boleh melihat istilah yang saling bertentangan.

### Aturan status
- Pembayaran QRIS harus `Lunas` sebelum status pesanan berubah menjadi `Diproses`.
- `Siap` hanya ditetapkan admin ketika makanan benar-benar selesai disiapkan.
- `Selesai` ditetapkan admin setelah pesanan benar-benar diserahkan/selesai dikirim.
- Pelanggan tidak dapat mengubah status atau membatalkan pesanan dari aplikasi.
- Admin dapat memperbaiki status secara manual hanya melalui transisi yang valid; pesanan yang sudah `Dibatalkan` tidak otomatis aktif kembali.
- Tidak ada log audit khusus. Data operasional yang memang dibutuhkan seperti waktu order dibuat, deadline QRIS, dan status terkini tetap disimpan.

## 13. WhatsApp

- Nomor admin dapat diatur dari dashboard.
- Semua CTA WhatsApp membuka tautan `wa.me` dengan pesan terisi otomatis; pelanggan tetap menekan Kirim.
- UI tidak boleh menyatakan pesan terkirim/dibaca karena sistem tidak terhubung ke WhatsApp Business API.
- Jika pelanggan tidak mengirim pesan, order tetap ada dan status pembayaran/order tidak berubah hanya karena tombol ditekan.
- WhatsApp digunakan untuk konfirmasi pembayaran, alamat delivery, area/ongkir yang belum terkonfigurasi, permintaan pembatalan, dan koordinasi tambahan.
- Struk digital berupa ringkasan order dari sistem dapat dibagikan manual melalui WhatsApp; jangan menyebutnya struk resmi DANA.

## 14. Riwayat dan Detail Pesanan Anonim

- Riwayat lokal tersedia pada browser/perangkat yang sama dan dapat hilang jika data situs dihapus atau perangkat diganti.
- Setiap order juga memiliki tautan akses khusus dengan token acak berentropi tinggi, tidak diturunkan dari nomor order atau data pelanggan.
- Simpan hash token di database bila memungkinkan; validasi token di server. Gunakan HTTPS dan jangan menaruh token di log analitik.
- Nomor order saja tidak memberikan akses ke detail.
- Detail melalui token menampilkan nomor order, waktu order, status order/pembayaran, item, varian, add-on, catatan item, subtotal, ongkir, total, dan metode pembayaran. Jangan menampilkan ulang nama atau nomor WhatsApp pelanggan di halaman detail token.
- Sediakan tombol salin tautan di halaman sukses dan detail. Tampilkan notifikasi sukses/gagal; jika gagal, berikan opsi salin manual.
- Tampilkan pengingat agar pelanggan tidak membagikan tautan akses. Siapa pun yang memiliki tautan dapat membuka detail order terkait.
- Jika tautan hilang dan riwayat lokal tidak tersedia, pelanggan menghubungi admin; tidak ada pemulihan melalui akun pelanggan.
- Detail order melakukan polling status backend setiap 15 detik saat halaman aktif dan status masih berjalan. Hentikan polling saat tab tidak aktif, lakukan refresh segera saat kembali aktif, dan hentikan permanen untuk `Selesai` atau `Dibatalkan`.

## 15. Dashboard Admin

### Beranda
- Ringkasan pesanan hari ini, pesanan baru, pesanan berjalan, omzet, dan pesanan terbaru.
- Badge pesanan baru yang belum dibuka.
- Saat dashboard terbuka dan aktif, sistem boleh mencoba memainkan suara ketika pesanan baru terdeteksi; badge visual tetap wajib berfungsi jika browser memblokir suara.
- Pesanan baru dianggap dibaca saat admin membuka detailnya, bukan saat hanya membuka daftar.
- Order yang dibatalkan, otomatis atau manual, langsung dikeluarkan dari badge order baru tetapi tetap tersimpan.

### Daftar pesanan
- Satu halaman daftar dengan bagian/badge `Menunggu Verifikasi QRIS`; bukan halaman/tab terpisah.
- Urutan: (1) pesanan baru dan menunggu verifikasi QRIS, (2) `Diproses`/`Siap`, (3) `Selesai`/`Dibatalkan`. Di dalam kelompok, yang terbaru tampil lebih dahulu.
- Pencarian hanya berdasarkan nomor order atau nama pelanggan. Tidak ada pencarian nomor WhatsApp atau filter rentang tanggal pada MVP.
- Detail menunjukkan item, pilihan, catatan, data pemenuhan, total, status order, status pembayaran, deadline QRIS, dan aksi yang valid.
- Admin tidak perlu memasukkan status refund atau membuka log audit.

### Produk dan konten
- CRUD produk, foto, kategori, varian, add-on, ketersediaan, arsip, urutan menu, dan duplikasi produk.
- CRUD kategori dan banner sesuai batasan di bagian katalog.
- Form admin nyaman di ponsel: satu kolom pada layar sempit, tombol simpan jelas, upload memiliki progress dan error state.

### Pengaturan
- Jam operasional mingguan dan tutup sementara.
- Nomor WhatsApp admin.
- QRIS: upload gambar, nama merchant, aktif/nonaktif.
- Ongkir dan area yang sudah diketahui.
- HPP final per porsi dan pengaturan toko yang diperlukan.

### Laporan
- Omzet penjualan, HPP produk terjual, estimasi laba kotor, dan jumlah order.
- Pesanan `Dibatalkan` tidak dihitung sebagai penjualan.
- Refund manual tidak dicatat sebagai status/fitur refund dan tidak otomatis mengubah laporan. Jangan menyebut angka laba sebagai laba bersih karena biaya operasional lengkap tidak dilacak.
- Ekspor laporan sederhana boleh disediakan jika mudah, tetapi tidak boleh menghambat alur inti.

## 16. Struk Digital

Struk digital adalah ringkasan order, bukan bukti resmi penyedia pembayaran. Isi minimal: nomor order, waktu, item, varian/add-on, jumlah, subtotal, ongkir, total, metode pembayaran, dan status pembayaran. Struk dibagikan manual melalui WhatsApp.

## 17. Keamanan dan Data

- Gunakan RLS dan akses server-side untuk membatasi data order.
- Pelanggan hanya dapat membaca order melalui sesi anonim yang valid atau token khusus yang valid.
- Jangan membuka tabel order/pembayaran untuk query publik tanpa pemeriksaan akses per order.
- Validasi harga, pilihan varian/add-on, ketersediaan, ongkir, total, dan deadline di server.
- Simpan service-role key hanya di server.
- Batasi upload media pada admin terautentikasi; validasi tipe konten, ukuran, dan akses file.
- Gunakan rate limit pada endpoint checkout, token access, dan login bila tersedia.
- Password reset admin memakai tautan pemulihan email yang kedaluwarsa dan sekali pakai. Pesan respons tidak membocorkan apakah email admin terdaftar.
- Jangan menyimpan data pribadi lebih banyak dari yang dibutuhkan. Jangan menghapus data order yang dibutuhkan untuk operasional dan histori.
- Backup database terkelola dan lakukan ekspor berkala; pastikan proses restore dapat diuji.
- Tidak ada log audit tindakan admin khusus pada MVP, tetapi keamanan backend dan validasi status tetap wajib.

## 18. Entitas Data Minimum

- `categories`
- `products`
- `product_images`
- `product_option_groups`
- `product_option_values`
- `addons`
- `product_addons`
- `home_banners`
- `orders`
- `order_items`
- `order_item_options`
- `payments`
- `store_settings`
- `delivery_areas` atau konfigurasi ongkir setara
- `anonymous_order_tokens` / mekanisme token aman
- `admin_read_state` atau penanda order dibuka yang diperlukan untuk badge

Skema final boleh menyesuaikan implementasi, tetapi snapshot order, validasi akses, status pembayaran, dan konsistensi total tidak boleh hilang. Tidak perlu tabel status refund atau log audit admin.

## 19. Kriteria Penerimaan MVP

### Pelanggan
- [ ] Dapat melihat menu, kategori, banner, detail produk, dan foto tambahan.
- [ ] Dapat mencari setelah menekan Cari/Enter.
- [ ] Dapat memilih varian/add-on sesuai batas aturan dan melihat harga yang benar.
- [ ] Produk habis/arsip tidak bisa dipesan.
- [ ] Keranjang bertahan di browser yang sama; baris digabung hanya jika konfigurasi dan catatan identik.
- [ ] Catatan item dan order maksimal 200 karakter.
- [ ] Pickup gratis; aturan ongkir Lhoksukon dan batas gratis ongkir dihitung benar.
- [ ] Area delivery yang belum diketahui tidak dapat checkout sebelum ongkir disepakati.
- [ ] Checkout tidak membutuhkan akun pelanggan.
- [ ] QRIS menampilkan total, nama merchant, tenggat 2 jam, dan tombol `Konfirmasi pembayaran ke admin`.
- [ ] Menekan CTA WhatsApp tidak mengubah status pembayaran.
- [ ] Order tetap tersimpan jika WhatsApp tidak dikirim.
- [ ] Detail order tidak dapat diakses hanya dengan menebak nomor order.
- [ ] Tautan akses tidak menampilkan nama atau nomor WhatsApp pelanggan.
- [ ] Status detail diperbarui saat halaman aktif dan berhenti polling saat status terminal.

### Admin
- [ ] Satu akun admin dapat login dan memulihkan password dengan aman.
- [ ] Admin dapat mengelola menu, foto, kategori, varian, add-on, banner, jam operasional, QRIS, ongkir, HPP, dan laporan.
- [ ] Admin dapat melihat badge order baru dan antrean verifikasi QRIS.
- [ ] Admin dapat mencari hanya dengan nomor order atau nama pelanggan.
- [ ] Screenshot pelanggan saja tidak dapat digunakan sebagai dasar menandai lunas.
- [ ] Nominal tidak cocok tetap menunggu verifikasi dan tidak dapat diproses.
- [ ] Pembayaran tambahan harus diverifikasi aktual sampai total mencukupi.
- [ ] Kelebihan pembayaran ditangani manual di luar sistem tanpa status refund.
- [ ] QRIS yang belum lunas terverifikasi dibatalkan otomatis tepat saat deadline 2 jam berdasarkan server.
- [ ] Pesanan hanya menjadi `Siap` setelah benar-benar siap, dan `Selesai` setelah diserahkan.
- [ ] Tidak ada log audit admin atau fitur refund yang tidak disepakati.

### Kualitas teknis
- [ ] Tidak ada horizontal overflow pada mobile.
- [ ] Total dan ongkir divalidasi di server.
- [ ] Token order aman dan tidak bisa ditebak.
- [ ] RLS dan akses admin diuji.
- [ ] Lint, type-check, build, dan pengujian alur checkout/pembayaran berhasil.
- [ ] Backup dan prosedur restore tersedia sebelum rilis produksi.

## 20. Rencana Implementasi

1. Finalisasi desain visual sesuai dokumen Design MD.
2. Siapkan Next.js, TypeScript, Tailwind, Supabase, storage, dan satu akun admin.
3. Buat schema database, RLS, data awal, dan aturan nomor order atomik.
4. Implementasikan katalog, detail, varian/add-on, keranjang, pencarian, dan empty/error states.
5. Implementasikan checkout server-side, pickup/delivery, konfigurasi ongkir, snapshot order, dan akses anonim.
6. Implementasikan QRIS statis, timer 2 jam di backend, pembatalan otomatis, dan tombol WhatsApp.
7. Implementasikan dashboard pesanan, verifikasi manual, status, CRUD menu, pengaturan, dan laporan dasar.
8. Implementasikan tautan order aman, polling status, salin tautan, dan struk digital.
9. Uji seluruh skenario normal, nominal kurang/lebih, pembayaran terlambat, produk habis, area delivery belum diketahui, dan kegagalan jaringan.
10. Rilis hanya setelah QRIS merchant, akun admin, nomor WhatsApp, jam buka, ongkir, dan kebijakan operasional dikonfigurasi.

## 21. Aturan untuk AI Coding Tools

- Bangun produk sederhana sesuai PRD; jangan menambah fitur yang tidak diminta.
- Jangan membuat akun pelanggan, multi-admin, payment gateway, WhatsApp API, status refund, log audit, atau fitur marketplace.
- Jangan percaya harga/total dari browser; hitung dan validasi ulang di server.
- Jangan menandai pembayaran lunas berdasarkan screenshot, tombol WhatsApp, atau klaim pelanggan.
- Jangan mengubah order lama ketika data produk diubah.
- Jangan menampilkan janji waktu siap tertentu.
- Jangan mengaktifkan kembali order yang sudah dibatalkan secara otomatis.
- Prioritaskan accessibility, responsivitas, error states, dan bahasa Indonesia yang jelas.
- Jika ada detail kecil yang belum ditentukan, pilih solusi paling sederhana yang konsisten dengan dokumen dan tidak menambah kompleksitas operasional.
