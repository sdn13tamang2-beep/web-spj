/* ==========================================================================
   MASTER LIBRARY - SISTEM SPJ & KWITANSI OTOMATIS (v3.1 HYBRID)
   Standard: Senior Google Apps Script Developer Protocol
   ========================================================================== */

const DB_CENTRAL_ID = '1bcvOqtJl1O1R5afrQOsyjCGmsn6n9NjDW7qryrQyeIU';
const CACHE_TTL = 21600; // 6 Jam

/* ==========================================================================
   1. CORE SECURITY & SERIALIZATION (The Brain)
   ========================================================================== */

function _cekAkses(token) {
  if (!token) throw new Error("Akses Ditolak: Token tidak valid.");
  const cache = CacheService.getScriptCache();
  
  // [PERBAIKAN] Cek apakah token berasal dari login Gateway Klien (Mode Library)
  const isGatewayValid = cache.get(token);
  if (isGatewayValid === 'VALID') {
    return SpreadsheetApp.getActiveSpreadsheet().getId();
  }

  // Fallback: Mode Standalone (jika aplikasi diakses tanpa gateway)
  const realId = cache.get("SESSION_" + token);
  if (!realId) throw new Error("Sesi Berakhir: Silakan muat ulang halaman.");
  return realId;
}

/**
 * RECURSIVE SERIALIZER (v3.0 Upgrade)
 * Mengubah Date ke ISO String dan memastikan semua properti aman dikirim.
 */
function _serialize(data) {
  if (data === null || data === undefined) return null;
  if (data instanceof Date) return data.toISOString();
  if (Array.isArray(data)) return data.map(_serialize);
  if (typeof data === 'object') {
    const output = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        output[key] = _serialize(data[key]);
      }
    }
    return output;
  }
  return data;
}

/* ==========================================================================
   2. DATA ACCESS LAYER (With Granular Caching)
   ========================================================================== */

function ambilDataSekolah(token, force = false) {
  try {
    const ssId = _cekAkses(token);
    const cache = CacheService.getScriptCache();
    const cacheKey = `SCH_PROFILE_${ssId}`;

    if (!force) {
      const cached = cache.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const infoResmi = cekLisensi(ssId, force); 

    const ss = SpreadsheetApp.openById(ssId);
    const sheet = ss.getSheetByName('Ref_Sekolah');
    if (!sheet) return null;

    const data = sheet.getRange(2, 1, 1, 15).getValues()[0];
    
    const result = {
      namaSekolah: infoResmi.namaResmi, 
      npsn: infoResmi.npsn || "",       
      desa_pusat: infoResmi.desa || "",
      kec_pusat: infoResmi.kecamatan || "",
      kabupaten: infoResmi.kabupaten || "",
      provinsi: infoResmi.provinsi || "",
      
      namaKepsek: data[1],
      jabatanKepsek: data[2],
      nipKepsek: data[3],
      pangkatKepsek: data[4],
      namaBendahara: data[5],
      nipBendahara: data[6],
      pangkatBendahara: data[7],
      tempatSekolah: data[8],
      idLogo: data[9],
      kop1: data[10],
      kop2: data[11],
      kop3: infoResmi.namaKop || data[12],
      kop4: data[13],
      kop5: data[14]
    };

    const cleanData = _serialize(result);
    cache.put(cacheKey, JSON.stringify(cleanData), CACHE_TTL);
    return cleanData;
  } catch (e) {
    throw new Error("Gagal mengambil profil sekolah: " + e.message);
  }
}

function getDaftarGuru(token, force = false) {
  const ssId = _cekAkses(token);
  const cache = CacheService.getScriptCache();
  const cacheKey = `GURU_DATA_${ssId}`;

  if (!force) {
    const cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const ss = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheetByName('Ref_Guru');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const result = data.slice(1).map(row => ({
    id: row[0],
    nama: row[1],
    tglLahir: row[2], 
    nip: row[3],
    pangkat: row[4],
    tugas: row[5],
    jenis: row[6]
  }));

  const cleanData = _serialize(result);
  cache.put(cacheKey, JSON.stringify(cleanData), CACHE_TTL);
  return cleanData;
}

function getAllMasterData(token) {
  return {
    guru: getDaftarGuru(token),
    sekolah: ambilDataSekolah(token),
    ttd: getDaftarTTD(token),
    jenis: getJenisSurat(token)
  };
}

/* ==========================================================================
   3. MUTATION LAYER (Write Operations)
   ========================================================================== */

function simpanDataSekolah(form, token) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ssId = _cekAkses(token);
    const info = cekLisensi(ssId); 
    const ss = SpreadsheetApp.openById(ssId);
    let sheet = ss.getSheetByName('Ref_Sekolah') || ss.insertSheet('Ref_Sekolah');

    const dataBaris = [
      info.namaResmi, form.namaKepsek, form.jabatanKepsek, form.nipKepsek,
      form.pangkatKepsek, form.namaBendahara, form.nipBendahara, form.pangkatBendahara,
      form.tempatSekolah, form.idLogo, form.kop1, form.kop2, info.namaKop || form.kop3, form.kop4, form.kop5
    ];

    sheet.getRange(2, 1, 1, 15).setValues([dataBaris]);
    CacheService.getScriptCache().remove(`SCH_PROFILE_${ssId}`);
    return { success: true, message: "Data Sekolah diperbarui!" };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function tambahGuru(form, token) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); 
    const ssId = _cekAkses(token);
    const ss = SpreadsheetApp.openById(ssId);
    const sheet = ss.getSheetByName('Ref_Guru') || ss.insertSheet('Ref_Guru');
    
    const newId = Utilities.getUuid();
    const rowData = [
      newId, 
      form.namaGuru, 
      form.tglLahirGuru, 
      form.nipGuru, 
      form.pangkatGuru, 
      "", 
      form.jenisGuru
    ];
    
    sheet.appendRow(rowData);
    CacheService.getScriptCache().remove(`GURU_DATA_${ssId}`);
    
    return { success: true, message: "Guru berhasil ditambahkan!", id: newId };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/* ==========================================================================
   4. SYSTEM HANDLERS
   ========================================================================== */

function cekLisensi(idSheetKlien, force = false) {
  const cache = CacheService.getScriptCache();
  const cacheKey = "LIC_" + idSheetKlien;
  
  if (!force) {
    const cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const ssPusat = SpreadsheetApp.openById(DB_CENTRAL_ID);
  const sheet = ssPusat.getSheetByName('DaftarKlien'); 
  if (!sheet) throw new Error("Tabel DaftarKlien tidak ditemukan di DB Pusat.");
  
  const data = sheet.getDataRange().getValues();
  let dataSekolah = null;
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() == String(idSheetKlien).trim()) {
      // [PERBAIKAN] Mengakomodasi status 'tidak aktif' dan 'suspend' (Case-Insensitive)
      const statusKlien = String(data[i][2]).trim().toLowerCase();
      if (statusKlien === 'suspend' || statusKlien === 'tidak aktif') {
         throw new Error("Web anda berstatus Tidak Aktif, Sementara tidak bisa digunakan.");
      }
      
      dataSekolah = { 
        namaResmi: data[i][1], status: data[i][2], namaKop: data[i][3],
        desa: data[i][4] || "", kecamatan: data[i][5] || "", kabupaten: data[i][6] || "", 
        provinsi: data[i][7] || "", npsn: data[i][8] || "" 
      };
      break; 
    }
  }
  
  if (!dataSekolah) throw new Error("ID Klien Tidak Terdaftar di Server Pusat.");
  cache.put(cacheKey, JSON.stringify(dataSekolah), CACHE_TTL);
  return dataSekolah;
}

function initWeb(e, idSheetKlien) {
  const infoSekolah = cekLisensi(idSheetKlien);
  const tokenSesi = Utilities.getUuid();
  CacheService.getScriptCache().put("SESSION_" + tokenSesi, idSheetKlien, CACHE_TTL);

  const template = HtmlService.createTemplateFromFile('index');
  template.namaSekolahPaten = infoSekolah.namaResmi; 
  template.tokenAkses = tokenSesi; 
  
  return template.evaluate()
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setTitle(infoSekolah.namaResmi + " - APP") 
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doSetup(token) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ssId = _cekAkses(token);
    const ss = SpreadsheetApp.openById(ssId);
    
    const schema = [
      { name: 'Ref_Sekolah', head: ["Nama Sekolah", "Kepsek", "Jabatan", "NIP", "Pangkat", "Bendahara", "NIP Ben", "Pangkat Ben", "Tempat", "ID Logo", "Kop1", "Kop2", "Kop3", "Kop4", "Kop5"] },
      { name: 'Ref_Guru', head: ["ID_UUID", "Nama", "Tgl Lahir", "NIP", "Pangkat", "Tugas", "Jenis"] },
      { name: 'DataSurat', head: ["ID_UUID", "Timestamp", "Kode Jenis", "Nomor", "Tgl Surat", "Dasar", "Keperluan", "JSON_Guru", "Tgl_Berangkat", "Periode", "No_SPT", "No_SPPD", "Uang_Harian", "Transport", "Total_Biaya", "Tgl_Visum", "No_Visum", "Tempat_Awal", "Tujuan", "Lama_Hari", "Tgl_Berangkat", "Tgl_Kembali", "Kendaraan", "Ketua", "TTD_Nama", "TTD_NIP", "Tgl_Kuitansi", "No_Kuitansi", "Nominal", "Terbilang", "Untuk_Pembayaran", "Beban_Anggaran", "Akomodasi"] },
      { name: 'DataHonor', head: ["ID_UUID", "Tgl_Input", "No_Kuitansi", "Tgl_Kegiatan", "Judul_Kegiatan", "Untuk_Pembayaran", "Sumber_Dana", "Total_Bayar", "JSON_Penerima"] }
    ];

    schema.forEach(sh => {
      let sheet = ss.getSheetByName(sh.name);
      if (!sheet) {
        sheet = ss.insertSheet(sh.name);
        sheet.getRange(1, 1, 1, sh.head.length)
             .setValues([sh.head])
             .setFontWeight("bold")
             .setBackground("#f8f9fa");
        sheet.setFrozenRows(1);
        if (sh.head[0] === "ID_UUID") {
           const protection = sheet.getRange("A2:A").protect().setDescription('Lock Sistem UUID');
           protection.setWarningOnly(true); 
           sheet.hideColumns(1); 
        }
      }
    });
    
    return { success: true, message: "Database siap digunakan & UUID Terproteksi." };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function pingServer(token) {
  try {
    const ssId = _cekAkses(token);
    const file = DriveApp.getFileById(ssId);
    const lastUpdate = file.getLastUpdated().getTime(); 
    return { success: true, lastUpdate: lastUpdate };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/* ==========================================================================
   5. MODUL GURU (LANJUTAN CRUD)
   ========================================================================== */

function updateGuru(form, token) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ssId = _cekAkses(token);
    const sheet = SpreadsheetApp.openById(ssId).getSheetByName('Ref_Guru');
    const data = sheet.getDataRange().getValues();
    const idTarget = String(form.idGuru);

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === idTarget) {
        sheet.getRange(i + 1, 2, 1, 6).setValues([[form.namaGuru, "'" + form.tglLahirGuru, form.nipGuru, form.pangkatGuru, "", form.jenisGuru]]);
        CacheService.getScriptCache().remove(`GURU_DATA_${ssId}`);
        return { success: true, message: "Data Guru diperbarui!" };
      }
    }
    return { success: false, message: "ID Guru tidak ditemukan." };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function hapusGuru(idTarget, token) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ssId = _cekAkses(token);
    const sheet = SpreadsheetApp.openById(ssId).getSheetByName('Ref_Guru');
    const data = sheet.getDataRange().getValues();

    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]) === String(idTarget)) {
        sheet.deleteRow(i + 1);
        CacheService.getScriptCache().remove(`GURU_DATA_${ssId}`);
        return { success: true, message: "Guru dihapus." };
      }
    }
    return { success: false, message: "ID tidak ditemukan." };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function hapusGuruBanyak(listID, token) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ssId = _cekAkses(token);
    const sheet = SpreadsheetApp.openById(ssId).getSheetByName('Ref_Guru');
    const values = sheet.getDataRange().getValues();
    
    if (values.length <= 1) return { success: true, message: "Data kosong." };
    
    const data = values.slice(1);
    const setHapus = new Set(listID.map(String));
    const dataBaru = data.filter(row => !setHapus.has(String(row[0])));
    
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    if (dataBaru.length > 0) sheet.getRange(2, 1, dataBaru.length, dataBaru[0].length).setValues(dataBaru);

    CacheService.getScriptCache().remove(`GURU_DATA_${ssId}`);
    return { success: true, message: `Berhasil menghapus ${data.length - dataBaru.length} data.` };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function prosesImportGuru(dataArray, token) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ssId = _cekAkses(token);
    const ss = SpreadsheetApp.openById(ssId);
    let sheet = ss.getSheetByName('Ref_Guru') || ss.insertSheet('Ref_Guru');

    let dataSiapSimpan = [];
    for (let i = 0; i < dataArray.length; i++) {
      dataSiapSimpan.push([generateUUID(), dataArray[i][0], "'" + dataArray[i][1], dataArray[i][2], dataArray[i][3], "", dataArray[i][4]]);
    }

    if (dataSiapSimpan.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, dataSiapSimpan.length, 7).setValues(dataSiapSimpan);
      CacheService.getScriptCache().remove(`GURU_DATA_${ssId}`);
      return { success: true, message: `Sukses import ${dataSiapSimpan.length} data!` };
    }
    return { success: false, message: "Data kosong." };
  } catch (e) {
    return { success: false, message: "Error: " + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/* ==========================================================================
   6. MODUL TTD & JENIS SURAT
   ========================================================================== */

function getDaftarTTD(token) {
  const ssId = _cekAkses(token);
  const cache = CacheService.getScriptCache();
  const cacheKey = `TTD_DATA_${ssId}`;
  
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const sheet = SpreadsheetApp.openById(ssId).getSheetByName('Ref_TTD');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const result = data.slice(1).map(row => ({ nama: row[0], nip: row[1], jabatan: row[2] }));
  const cleanData = _serialize(result);
  cache.put(cacheKey, JSON.stringify(cleanData), CACHE_TTL);
  return cleanData;
}

function tambahTTD(form, token) {
  const ssId = _cekAkses(token);
  const sheet = SpreadsheetApp.openById(ssId).getSheetByName('Ref_TTD') || SpreadsheetApp.openById(ssId).insertSheet('Ref_TTD');
  sheet.appendRow([form.namaTTD, form.nipTTD, form.jabatanTTD]);
  CacheService.getScriptCache().remove(`TTD_DATA_${ssId}`);
  return { success: true };
}

function updateTTD(form, token) {
  const ssId = _cekAkses(token);
  const sheet = SpreadsheetApp.openById(ssId).getSheetByName('Ref_TTD');
  const data = sheet.getDataRange().getValues();
  const nipLama = String(form.nipLama).trim();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === nipLama) {
      sheet.getRange(i + 1, 1, 1, 3).setValues([[form.namaTTD, form.nipTTD, form.jabatanTTD]]);
      CacheService.getScriptCache().remove(`TTD_DATA_${ssId}`);
      return { success: true };
    }
  }
  return { success: false };
}

function hapusTTD(nipTarget, token) {
  const ssId = _cekAkses(token);
  const sheet = SpreadsheetApp.openById(ssId).getSheetByName('Ref_TTD');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][1]).trim() === String(nipTarget).trim()) {
      sheet.deleteRow(i + 1);
      CacheService.getScriptCache().remove(`TTD_DATA_${ssId}`);
      return { success: true, message: "Terhapus." };
    }
  }
  return { success: false };
}

function getJenisSurat(token) {
  const ssId = _cekAkses(token);
  const cache = CacheService.getScriptCache();
  const cacheKey = `JENIS_DATA_${ssId}`;
  
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const sheet = SpreadsheetApp.openById(ssId).getSheetByName('Ref_JenisSurat');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const result = data.slice(1).map(row => ({ kode: row[0], nama: row[1] }));
  const cleanData = _serialize(result);
  cache.put(cacheKey, JSON.stringify(cleanData), CACHE_TTL);
  return cleanData;
}

function tambahJenisSurat(form, token) {
  const ssId = _cekAkses(token);
  const sheet = SpreadsheetApp.openById(ssId).getSheetByName('Ref_JenisSurat') || SpreadsheetApp.openById(ssId).insertSheet('Ref_JenisSurat');
  sheet.appendRow([form.kodeJenis, form.namaJenis]);
  CacheService.getScriptCache().remove(`JENIS_DATA_${ssId}`);
  return { success: true };
}

function updateJenisSurat(form, token) {
  const ssId = _cekAkses(token);
  const sheet = SpreadsheetApp.openById(ssId).getSheetByName('Ref_JenisSurat');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(form.kodeLama)) {
      sheet.getRange(i + 1, 1, 1, 2).setValues([[form.kodeJenis, form.namaJenis]]);
      CacheService.getScriptCache().remove(`JENIS_DATA_${ssId}`);
      return { success: true };
    }
  }
  return { success: false };
}

function hapusJenisSurat(kode, token) {
  const ssId = _cekAkses(token);
  const sheet = SpreadsheetApp.openById(ssId).getSheetByName('Ref_JenisSurat');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(kode)) {
      sheet.deleteRow(i + 1);
      CacheService.getScriptCache().remove(`JENIS_DATA_${ssId}`);
      return { success: true };
    }
  }
  return { success: false };
}

/* ==========================================================================
   7. MODUL TRANSAKSI SURAT & HONOR
   ========================================================================== */

function getArsipSurat(token) {
  const ssId = _cekAkses(token);
  const sheet = SpreadsheetApp.openById(ssId).getSheetByName('DataSurat');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  // [FIX 2] PERBAIKAN INDEX MAP (row[29] itu Terbilang, row[30] Pembayaran)
  const result = data.slice(1).map((row) => ({
      id: row[0], jenis: row[2], nomor: row[3], tglSurat: row[4] ? formatDateIndo(row[4]) : '-',
      dasar: row[5], keperluan: row[6], dataLengkap: row[7],
      noSPT: row[10], noSPPD: row[11], uangHarian: row[12], transport: row[13], totalBiaya: row[14],
      tempatBerangkat: row[17], tempatTujuan: row[18], lama: row[19],
      tglBerangkat: row[20] ? formatDateIndo(row[20]) : '-', tglKembali: row[21] ? formatDateIndo(row[21]) : '-',
      alatAngkut: row[22], ketua: row[23], ttdNama: row[24], ttdNip: row[25],
      tglKuitansi: row[26] ? formatDateIndo(row[26]) : '-', noKuitansi: row[27],
      pembayaran: row[30], anggaran: row[31], akomodasi: row[32] || 0
  })).reverse();
  
  return _serialize(result);
}

function simpanSuratBaru(form, token) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ssId = _cekAkses(token);
    const ss = SpreadsheetApp.openById(ssId);
    let sheet = ss.getSheetByName('DataSurat') || ss.insertSheet('DataSurat');

    const p = _prosesDataFormSurat(form, ssId); 
    const uuid = generateUUID();

    const barisData = [
      uuid, new Date(), form.kodeJenis, form.nomorSurat, form.tglSurat, form.dasarSurat, form.keperluan,
      p.jsonGuru, form.tglSurat, `${formatDateIndo(form.tglBerangkat)} s.d ${formatDateIndo(form.tglKembali)}`,
      form.noSPT, form.nomorSPPD, p.harian, p.transport, p.totalBiaya,
      form.tglSurat, form.nomorSPPD, form.tempatBerangkat, form.tempatTujuan,
      p.hari, form.tglBerangkat, form.tglKembali, form.alatAngkut,
      p.namaKetua, p.namaTTD, p.nipTTD, form.tglKuitansi, form.noKuitansi,
      p.totalBiaya, "", form.untukPembayaran, form.bebanAnggaran,
      form.biayaAkomodasi || 0
    ];

    sheet.appendRow(barisData);
    return { success: true, message: "Data Surat disimpan!" };
  } catch (err) {
    return { success: false, message: "Gagal: " + err.toString() };
  } finally {
    lock.releaseLock();
  }
}

function updateDataSurat(form, token) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ssId = _cekAkses(token);
    const sheet = SpreadsheetApp.openById(ssId).getSheetByName('DataSurat');
    const uuid = form.idEdit;
    
    const dataUUID = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
    let rowIndex = -1;
    for (let i = 0; i < dataUUID.length; i++) {
      if (dataUUID[i][0] == uuid) { rowIndex = i + 1; break; }
    }
    if (rowIndex == -1) throw new Error("Data tidak ditemukan.");

    const p = _prosesDataFormSurat(form, ssId);
    const barisData = [
      form.kodeJenis, form.nomorSurat, form.tglSurat, form.dasarSurat, form.keperluan,
      p.jsonGuru, form.tglSurat, `${formatDateIndo(form.tglBerangkat)} s.d ${formatDateIndo(form.tglKembali)}`,
      form.noSPT, form.nomorSPPD, p.harian, p.transport, p.totalBiaya,
      form.tglSurat, form.nomorSPPD, form.tempatBerangkat, form.tempatTujuan,
      p.hari, form.tglBerangkat, form.tglKembali, form.alatAngkut,
      p.namaKetua, p.namaTTD, p.nipTTD, form.tglKuitansi, form.noKuitansi,
      p.totalBiaya, "", form.untukPembayaran, form.bebanAnggaran,
      form.biayaAkomodasi || 0
    ];

    sheet.getRange(rowIndex, 3, 1, 31).setValues([barisData]); 
    return { success: true, message: "Data berhasil diperbarui!" };
  } catch (err) {
    return { success: false, message: "Gagal: " + err.toString() };
  } finally {
    lock.releaseLock();
  }
}

function hapusDataSurat(uuid, token) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ssId = _cekAkses(token);
    const sheet = SpreadsheetApp.openById(ssId).getSheetByName('DataSurat');
    const dataUUID = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
    for (let i = 0; i < dataUUID.length; i++) {
      if (dataUUID[i][0] === uuid) {
        sheet.deleteRow(i + 1);
        return { success: true, message: "Dihapus." };
      }
    }
    return { success: false, message: "ID tidak ditemukan." };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function resetDatabaseTotal(token) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ssId = _cekAkses(token);
    const sheet = SpreadsheetApp.openById(ssId).getSheetByName('DataSurat');
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
    return { success: true, message: "Database Surat Reset." };
  } catch (e) {
    return { success: false };
  } finally {
    lock.releaseLock();
  }
}

/* ==========================================================================
   8. MODUL PENGANTAR & HONOR
   ========================================================================== */

function simpanPengantarData(form, token) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ssId = _cekAkses(token);
    const sheet = SpreadsheetApp.openById(ssId).getSheetByName('Ref_Pengantar') || SpreadsheetApp.openById(ssId).insertSheet('Ref_Pengantar');
    sheet.getRange(2, 1, 1, 6).setValues([[form.nomor, form.tujuan, form.isi, form.banyaknya, form.keterangan, form.tanggal]]);
    return { success: true, message: "Draft Tersimpan" };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function getPengantarData(token, force = false) {
  try {
    const ssId = _cekAkses(token);
    const sheet = SpreadsheetApp.openById(ssId).getSheetByName('Ref_Pengantar');
    if (!sheet) return null;
    const data = sheet.getRange(2, 1, 1, 6).getValues()[0];
    return _serialize({ nomor: data[0], tujuan: data[1], isi: data[2], banyaknya: data[3], keterangan: data[4], tanggal: data[5] });
  } catch(e) { return null; }
}

function getDaftarHonor(token) {
  const ssId = _cekAkses(token);
  const sheet = SpreadsheetApp.openById(ssId).getSheetByName('DataHonor');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const result = data.slice(1).map(row => ({
    id: row[0], tglInput: String(row[1]), noKuitansi: row[2],
    tglKegiatan: row[3] ? formatDateIndo(row[3]) : '', judul: row[4],
    pembayaran: row[5], sumberDana: row[6], totalBayar: row[7], jsonPenerima: row[8]
  })).reverse();
  
  return _serialize(result);
}

function simpanDataHonor(form, token) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ssId = _cekAkses(token);
    let sheet = SpreadsheetApp.openById(ssId).getSheetByName('DataHonor') || SpreadsheetApp.openById(ssId).insertSheet('DataHonor');

    const penerimaList = [];
    const rawPersonil = form['honorPersonil[]'];
    const rawBruto = form['honorBruto[]'];
    const rawPajak = form['honorPajak[]'];
    let totalBayarNetto = 0;

    if (rawPersonil) {
      const listP = Array.isArray(rawPersonil) ? rawPersonil : [rawPersonil];
      const listB = Array.isArray(rawBruto) ? rawBruto : [rawBruto];
      const listT = Array.isArray(rawPajak) ? rawPajak : [rawPajak];

      for (let i = 0; i < listP.length; i++) {
        let guruObj = {};
        try { guruObj = JSON.parse(listP[i]); } catch(e) {}
        const bruto = parseFloat(listB[i]) || 0;
        const pajakPersen = parseFloat(listT[i]) || 0;
        const nilaiPajak = bruto * (pajakPersen / 100);
        const netto = bruto - nilaiPajak;
        totalBayarNetto += netto; 
        penerimaList.push({ id: guruObj.id, nama: guruObj.nama, nip: guruObj.nip, golongan: guruObj.pangkat, bruto: bruto, pajakPersen: pajakPersen, nilaiPajak: nilaiPajak, netto: netto });
      }
    }

    if (totalBayarNetto <= 0) throw new Error("Total pembayaran tidak boleh Rp 0");
    const jsonPenerima = JSON.stringify(penerimaList);
    const mode = form.idHonor ? 'UPDATE' : 'BARU';
    const idFinal = mode === 'BARU' ? generateUUID() : form.idHonor;
    const dataRow = [idFinal, new Date(), form.noKuitansi, form.tglKegiatan, form.judulKegiatan, form.untukPembayaran, form.sumberDana, totalBayarNetto, jsonPenerima];

    if (mode === 'BARU') {
      sheet.appendRow(dataRow);
    } else {
      const dataIds = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
      const rowIndex = dataIds.indexOf(idFinal);
      if (rowIndex === -1) throw new Error("ID Data hilang.");
      sheet.getRange(rowIndex + 2, 1, 1, 9).setValues([dataRow]);
    }

    return { 
      success: true, message: "Berhasil!",
      data: _serialize({ id: idFinal, tglInput: String(new Date()), noKuitansi: form.noKuitansi, tglKegiatan: formatDateIndo(form.tglKegiatan), judul: form.judulKegiatan, pembayaran: form.untukPembayaran, sumberDana: form.sumberDana, totalBayar: totalBayarNetto, jsonPenerima: jsonPenerima })
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function hapusDataHonor(id, token) {
   const lock = LockService.getScriptLock();
   try {
     lock.waitLock(10000);
     const ssId = _cekAkses(token);
     const sheet = SpreadsheetApp.openById(ssId).getSheetByName('DataHonor');
     const dataIds = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
     const rowIndex = dataIds.indexOf(id);
     if (rowIndex !== -1) {
       sheet.deleteRow(rowIndex + 2);
       return { success: true };
     }
     return { success: false, message: "Data tidak ditemukan." };
   } catch (e) {
     return { success: false, message: e.toString() };
   } finally {
     lock.releaseLock();
   }
}

/* ==========================================================================
   9. PRIVATE HELPERS (Internal Only)
   ========================================================================== */

function _prosesDataFormSurat(form, ssId) {
  let arrayGuru = [];
  let rawPersonil = form['dataPersonil[]'];
  let rawPeran = form['peranPersonil[]'];

  if (rawPersonil) {
    if (!Array.isArray(rawPersonil)) rawPersonil = [rawPersonil];
    if (rawPeran && !Array.isArray(rawPeran)) rawPeran = [rawPeran];
    for (let i = 0; i < rawPersonil.length; i++) {
      try {
        let objGuru = JSON.parse(rawPersonil[i]);
        objGuru.peran = (rawPeran && rawPeran[i]) ? rawPeran[i] : "";
        arrayGuru.push(objGuru);
      } catch (e) {}
    }
  }

  const harian = parseFloat(form.uangHarian) || 0;
  const transport = parseFloat(form.biayaTransport) || 0;
  const hari = parseInt(form.lamaHari) || 0;
  const akomodasi = parseFloat(form.biayaAkomodasi) || 0;
  
  // [FIX 1] RUMUS SINKRON DENGAN FRONTEND (js.html)
  // Karena user ingin Transport & Akomodasi dikali Lama Hari.
  const totalBiaya = (harian + transport + akomodasi) * hari * (arrayGuru.length || 1);

  return {
    jsonGuru: JSON.stringify(arrayGuru),
    namaKetua: arrayGuru.length > 0 ? arrayGuru[0].nama : "-",
    totalBiaya: totalBiaya,
    namaTTD: getNamaTTD_Helper(form.ttdVisum, ssId),
    nipTTD: getNipTTD_Helper(form.ttdVisum, ssId),
    harian: harian, transport: transport, hari: hari
  };
}

function getNamaTTD_Helper(namaCari, ssId) {
  const list = getDaftarTTD_Internal(ssId);
  const found = list.find(t => t.nama === namaCari);
  return found ? found.nama : namaCari;
}

function getNipTTD_Helper(namaCari, ssId) {
  const list = getDaftarTTD_Internal(ssId);
  const found = list.find(t => t.nama === namaCari);
  return found ? found.nip : "";
}

function getDaftarTTD_Internal(ssId) {
  const sheet = SpreadsheetApp.openById(ssId).getSheetByName('Ref_TTD');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  return data.slice(1).map(row => ({ nama: row[0], nip: row[1], jabatan: row[2] }));
}

function formatDateIndo(dateStr) {
  if (!dateStr) return "";
  try {
    let d = new Date(dateStr);
    return Utilities.formatDate(d, "GMT+7", "dd/MM/yyyy");
  } catch (e) { return dateStr; }
}

function generateUUID() { 
  return Utilities.getUuid(); 
}