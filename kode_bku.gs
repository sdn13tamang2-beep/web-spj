function getInitialDataBKU(token) {
  try {
    const d = ambilDataSekolah(token); 
    
    let lokasiKhususBKU = d.tempatSekolah; 
    if (d.desa_pusat && d.kec_pusat) {
       lokasiKhususBKU = `${d.desa_pusat}, ${d.kec_pusat}`;
    }

    return {
      success: true,
      data: {
        // [FIX 4] AMBIL DARI DATA SEKOLAH, JANGAN KOSONG
        npsn: d.npsn || "", 
        
        namaSekolah: d.namaSekolah || "",
        lokasi: lokasiKhususBKU, 
        kabupaten: d.kabupaten,
        provinsi: d.provinsi,
        kepsek: d.namaKepsek || "",
        nipKepsek: d.nipKepsek || "",
        bendahara: d.namaBendahara || "",
        nipBendahara: d.nipBendahara || ""
      }
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}