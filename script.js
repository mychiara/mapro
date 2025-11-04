const firebaseConfig = {
  apiKey: "AIzaSyDNq7z3junZ_rAOIi8sLWd8ULL7Qi5GMEM",
  authDomain: "si-pandai-62d59.firebaseapp.com",
  projectId: "si-pandai-62d59",
  storageBucket: "si-pandai-62d59.firebasestorage.app",
  messagingSenderId: "196681602695",
  appId: "1:196681602695:web:303111ea01cb0bcb8cca22",
  measurementId: "G-KYTYGV7XS9"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;
const arrayUnion = firebase.firestore.FieldValue.arrayUnion;


document.addEventListener('DOMContentLoaded', function() {
  
  const UPLOAD_TEMPLATE_URL = "https://docs.google.com/spreadsheets/d/14w_apgCjUqDub5ph1K6iIhhbLlxqkTtU/export?format=xlsx";

  const GRUB_BELANJA_UTAMA_OPTIONS = [
    "A. PERSIAPAN", "B. PEMBELAJARAN TEORI", "C. PEMBELAJAN PRAKTIKUM", "D. PRAKTEK KERJA LAPANGAN",
    "E. PELAKSANAAN UJIAN", "F. KEGIATAN KEMAHASISWAAN"
  ];

  let STATE = { 
    role: null, id: null, uid: null, currentUserData: null, 
    allKelompok: [], allProdi: [], allDirektoratUids: [],
    currentAjuanDataAwal: [], currentAjuanDataPerubahan: [],
    stagingList: [], 
    selectedAjuanIdsAwal: new Set(), selectedAjuanIdsPerubahan: new Set(),
    allDashboardData: [], globalSettings: {},
    beritaAcaraSettings: {},
    currentAjuanType: 'Awal',
    notificationListener: null
  };
  
  let CHARTS = {};
  const LOADER = document.getElementById('loading-overlay');
  const TOAST_CONTAINER = document.querySelector('.toast-container');
  const EDIT_MODAL = new bootstrap.Modal(document.getElementById('editAjuanModal'));
  const REVIEW_MODAL = new bootstrap.Modal(document.getElementById('reviewAjuanModal'));
  const KOMENTAR_MODAL = new bootstrap.Modal(document.getElementById('komentarModal'));
  const HISTORY_MODAL = new bootstrap.Modal(document.getElementById('historyModal'));
  const PRODI_COLORS = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];

  function showLoader(show) { LOADER.style.display = show ? 'flex' : 'none'; }
  function showToast(message, type = 'success') {
    const toastId = 'toast-' + Date.now();
    const toastHTML = `<div id="${toastId}" class="toast align-items-center text-bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true"><div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div></div>`;
    TOAST_CONTAINER.insertAdjacentHTML('beforeend', toastHTML);
    const toastEl = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastEl, { delay: 5000 });
    toast.show();
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
  }
  function escapeHtml(s) { return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''; }
  function getColorForProdi(prodiId) {
    if (!prodiId) return '#cccccc';
    let hash = 0;
    for (let i = 0; i < prodiId.length; i++) { hash = prodiId.charCodeAt(i) + ((hash << 5) - hash); }
    return PRODI_COLORS[Math.abs(hash % PRODI_COLORS.length)];
  }

  async function logActivity(action, details = '') {
    if (!STATE.uid || !STATE.id) return;
    try {
        await db.collection('activityLog').add({
            action: action,
            details: details,
            userId: STATE.id,
            userUid: STATE.uid,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("Gagal mencatat aktivitas:", e);
    }
  }
  
  function saveSession(userData) { try { localStorage.setItem('siPandaiSession', JSON.stringify(userData)); } catch (e) { console.error("Gagal menyimpan sesi:", e); } }
  function getSession() { try { return JSON.parse(localStorage.getItem('siPandaiSession')); } catch (e) { return null; } }
  function clearSession() { localStorage.removeItem('siPandaiSession'); }

  function updatePerubahanUI(settings) {
    const isTahapPerubahanOpen = settings.Status_Ajuan_Perubahan === 'Dibuka';
    const tahapAktif = settings.Tahap_Perubahan_Aktif || 1;
    const tahapStr = `Perubahan ${tahapAktif}`;
    document.getElementById('nav-item-ajuan-perubahan').style.display = isTahapPerubahanOpen ? 'block' : 'none';
    document.getElementById('nav-item-daftar-perubahan').style.display = isTahapPerubahanOpen ? 'block' : 'none';
    document.getElementById('nav-item-rpd-perubahan').style.display = isTahapPerubahanOpen ? 'block' : 'none';
    document.getElementById('nav-item-realisasi-perubahan').style.display = isTahapPerubahanOpen ? 'block' : 'none';
    if (isTahapPerubahanOpen) {
      document.querySelector('#link-ajuan-perubahan').innerHTML = `<i class="bi bi-pencil-square"></i> Buat Ajuan ${tahapStr}`;
      document.querySelector('#link-daftar-perubahan').innerHTML = `<i class="bi bi-list-check"></i> Daftar Ajuan ${tahapStr}`;
      document.querySelector('#link-rpd-perubahan').innerHTML = `<i class="bi bi-calendar2-event"></i> RPD ${tahapStr}`;
      document.querySelector('#link-realisasi-perubahan').innerHTML = `<i class="bi bi-graph-up-arrow"></i> Realisasi ${tahapStr}`;
    }
    document.getElementById('daftar-perubahan-title').innerHTML = `<i class="bi bi-list-check"></i> Daftar Ajuan ${tahapStr}`;
    document.getElementById('rpd-perubahan-title').innerHTML = `<i class="bi bi-calendar2-event"></i> RPD ${tahapStr}`;
    document.getElementById('realisasi-perubahan-title').innerHTML = `<i class="bi bi-graph-up-arrow"></i> Realisasi ${tahapStr}`;
    const copyBtn = document.getElementById('btn-copy-accepted');
    copyBtn.style.display = (isTahapPerubahanOpen && STATE.role === 'prodi') ? 'block' : 'none';
    if (tahapAktif == 1) {
      copyBtn.innerHTML = `<i class="bi bi-files"></i> Pindahkan Ajuan Awal Diterima`;
      copyBtn.title = "Salin semua ajuan awal yang diterima ke daftar ini untuk diedit ulang";
    } else {
      copyBtn.innerHTML = `<i class="bi bi-files"></i> Pindahkan dari Perubahan ${tahapAktif - 1}`;
      copyBtn.title = `Salin semua ajuan dari Tahap Perubahan ${tahapAktif - 1} yang diterima ke daftar ini`;
    }
  }

  async function updateProdiPaguInfo(userData) {
    if (!userData || STATE.role !== 'prodi') return;
    const paguInfoArea = document.getElementById('pagu-info-area');
    try {
        const paguAnggaran = Number(userData.Pagu_Anggaran) || 0;
        
        // 1. Calculate Total Ajuan Awal (Active Statuses)
        const activeAjuanAwalQuery = await db.collection('ajuan')
            .where('ID_Prodi', '==', STATE.id)
            .where('Tipe_Ajuan', '==', 'Awal') // Only Awal ajuan counts against Pagu_Anggaran
            .where('Status', 'in', ['Menunggu Review', 'Diterima', 'Revisi'])
            .get();

        let totalDiajukanAwal = 0;
        activeAjuanAwalQuery.forEach(doc => {
            totalDiajukanAwal += Number(doc.data().Total) || 0;
        });
        
        // 2. Calculate Total Ajuan Overall (Active Statuses) for context
        const activeAjuanOverallQuery = await db.collection('ajuan')
            .where('ID_Prodi', '==', STATE.id)
            .where('Status', 'in', ['Menunggu Review', 'Diterima', 'Revisi'])
            .get();
            
        let totalDiajukanOverall = 0;
        activeAjuanOverallQuery.forEach(doc => {
            totalDiajukanOverall += Number(doc.data().Total) || 0;
        });


        const sisaPaguAwal = paguAnggaran - totalDiajukanAwal;
        const sisaPaguClass = sisaPaguAwal < 0 ? 'text-danger fw-bold' : 'text-success';

        let extraInfo = '';
        if (totalDiajukanOverall > totalDiajukanAwal) {
            extraInfo = `
                <div class="mt-2 pt-2 border-top w-100">
                    <span class="text-muted">Total Ajuan Aktif Keseluruhan (Awal + Perubahan):</span>
                    <strong class="d-block fs-6">Rp ${totalDiajukanOverall.toLocaleString('id-ID')}</strong>
                    <span class="text-muted small">Anggaran Perubahan tidak dibatasi oleh Pagu Awal.</span>
                </div>`;
        }


        paguInfoArea.innerHTML = `
            <div class="d-flex flex-wrap justify-content-around text-center small">
                <div>
                    <span class="text-muted">Pagu Anggaran Awal Anda (Ceiling Awal):</span>
                    <strong class="d-block fs-6">Rp ${paguAnggaran.toLocaleString('id-ID')}</strong>
                </div>
                <div>
                    <span class="text-muted">Total Ajuan Awal Aktif (Menunggu/Diterima/Revisi):</span>
                    <strong class="d-block fs-6">Rp ${totalDiajukanAwal.toLocaleString('id-ID')}</strong>
                </div>
                <div>
                    <span class="text-muted">Sisa Pagu Awal yang Belum Diajukan:</span>
                    <strong class="d-block fs-6 ${sisaPaguClass}">Rp ${sisaPaguAwal.toLocaleString('id-ID')}</strong>
                </div>
                ${extraInfo}
            </div>
        `;
        paguInfoArea.style.display = 'block';

    } catch (error) {
        console.error("Gagal update Pagu Info:", error);
        paguInfoArea.innerHTML = `<div class="text-danger small text-center">Gagal memuat informasi pagu anggaran.</div>`;
        paguInfoArea.style.display = 'block';
    }
  }

  async function initializeApp(userData) {
    STATE.role = userData.Role;
    STATE.id = userData.ID_Prodi;
    STATE.uid = userData.uid;
    STATE.currentUserData = userData;

    document.body.classList.remove('login-view');
    document.getElementById('login-page-wrapper').style.display = 'none';
    document.getElementById('app-area').style.display = 'block';
    document.getElementById('welcome').innerHTML = `<span class="badge bg-secondary me-2">${STATE.role.toUpperCase()}</span> <strong>${STATE.id} - ${userData.Nama_Prodi}</strong>`;
    
    await loadGlobalSettings(); 
    await loadBeritaAcaraSettings();
    updatePerubahanUI(STATE.globalSettings);
    document.getElementById('nav-item-ajuan-awal').style.display = (STATE.globalSettings.Status_Ajuan_Perubahan === 'Dibuka') ? 'none' : 'block';
    document.getElementById('tab-manage-link').style.display = STATE.role === 'direktorat' ? 'block' : 'none';
    document.getElementById('tab-log-link').style.display = STATE.role === 'direktorat' ? 'block' : 'none';
    document.getElementById('tab-pengaturan-akun-link').style.display = STATE.role === 'prodi' ? 'block' : 'none';

    if (STATE.role === 'prodi') {
      await updateProdiPaguInfo(userData);
      ['filterProdiAwal', 'filterProdiPerubahan', 'filterProdiRPDAwal', 'filterProdiRPDPerubahan', 'filterProdiRealisasiAwal', 'filterProdiRealisasiPerubahan', 'filterProdiBA'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'none';
      });
      document.getElementById('direktorat-charts').style.display = 'none';
    } else { // direktorat
      ['filterProdiAwal', 'filterProdiPerubahan', 'filterProdiRPDAwal', 'filterProdiRPDPerubahan', 'filterProdiRealisasiAwal', 'filterProdiRealisasiPerubahan', 'filterProdiBA'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'block';
      });
      document.getElementById('direktorat-charts').style.display = 'flex';
    }
    
    new bootstrap.Tab(document.querySelector('[data-bs-target="#tab-dashboard"]')).show();
    loadDashboardData();
    loadInitialData();
    setupNotificationListener();
  }

  document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('input-user-id').value;
    const password = document.getElementById('input-password').value;
    if (!email || !password) { showToast('Email dan Password harus diisi!', 'warning'); return; }
    
    showLoader(true);
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            await auth.signOut();
            throw new Error("Profil pengguna tidak ditemukan. Hubungi administrator.");
        }
        
        const userData = userDoc.data();
        const sessionData = { ...userData, uid: user.uid };
        saveSession(sessionData);
        await initializeApp(sessionData);
        await logActivity('User Login', `Login berhasil.`);

    } catch (error) {
        const message = error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' ? 'Email atau Password salah.' : error.message;
        showToast(`Login Gagal: ${message}`, 'danger');
    } finally {
        showLoader(false);
    }
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    try {
        await logActivity('User Logout');
        if(STATE.notificationListener) STATE.notificationListener();
        await auth.signOut();
        clearSession();
        window.location.reload();
    } catch (error) {
        showToast(`Gagal logout: ${error.message}`, 'danger');
    }
  });
  
  function showLoginPage() {
    clearSession();
    document.body.classList.add('login-view');
    document.getElementById('login-page-wrapper').style.display = 'flex';
    document.getElementById('app-area').style.display = 'none';
    document.getElementById('input-password').value = '';
  }

  auth.onAuthStateChanged(async (user) => {
    showLoader(true);
    if (user) {
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                const sessionData = { ...userData, uid: user.uid };
                saveSession(sessionData);
                await initializeApp(sessionData);
            } else { await auth.signOut(); }
        } catch (error) { await auth.signOut(); }
    } else { showLoginPage(); }
    showLoader(false);
  });
  
  async function createNotification(targetUid, message) {
      if (!targetUid) return;
      try {
        await db.collection('notifications').add({
            targetUid: targetUid,
            message: message,
            isRead: false,
            timestamp: serverTimestamp()
        });
      } catch (e) { console.error("Gagal membuat notifikasi:", e); }
  }

  async function logHistory(ajuanId, action, details) {
      try {
        await db.collection('ajuan').doc(ajuanId).collection('history').add({
            action: action,
            details: details,
            userId: STATE.id,
            userUid: STATE.uid,
            timestamp: serverTimestamp()
        });
      } catch(e) { console.error("Gagal mencatat riwayat:", e); }
  }

  function setupNotificationListener() {
      if (STATE.notificationListener) STATE.notificationListener();
      if (!STATE.uid) return;
      STATE.notificationListener = db.collection('notifications').where('targetUid', '==', STATE.uid)
          .orderBy('timestamp', 'desc')
          .limit(20)
          .onSnapshot(snapshot => {
              let notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              const unreadCount = notifications.filter(n => !n.isRead).length;
              const countEl = document.getElementById('notification-count');
              
              if (unreadCount > 0) {
                  countEl.textContent = unreadCount;
                  countEl.style.display = 'flex';
              } else {
                  countEl.style.display = 'none';
              }
              renderNotifications(notifications);
          }, error => {
              console.error("Error listener notifikasi:", error);
          });
  }

  function renderNotifications(notifications) {
      const container = document.getElementById('notification-items-container');
      if (notifications.length === 0) {
          container.innerHTML = '<p class="text-muted text-center small p-3">Tidak ada notifikasi baru.</p>';
          return;
      }
      container.innerHTML = notifications.map(n => {
          const time = n.timestamp && n.timestamp.toDate ? n.timestamp.toDate().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '';
          return `<div class="list-group-item list-group-item-action ${!n.isRead ? 'unread' : ''}">
                      <div class="d-flex w-100 justify-content-between">
                          <p class="mb-1 small">${escapeHtml(n.message)}</p>
                      </div>
                      <small class="text-muted">${time}</small>
                  </div>`;
      }).join('');
  }

  document.getElementById('notification-bell').addEventListener('show.bs.dropdown', async () => {
      const unreadSnapshot = await db.collection('notifications')
          .where('targetUid', '==', STATE.uid)
          .where('isRead', '==', false)
          .get();
      
      if (unreadSnapshot.empty) return;
      const batch = db.batch();
      unreadSnapshot.docs.forEach(doc => {
          batch.update(doc.ref, { isRead: true });
      });
      await batch.commit().catch(e => console.error("Gagal menandai notifikasi terbaca:", e));
  });

  window.openHistoryModal = async (id, nama) => {
    document.getElementById('historyModalAjuanId').innerText = id.substring(0, 6) + '...';
    document.getElementById('historyModalAjuanNama').innerText = nama;
    const logListEl = document.getElementById('history-log-list');
    logListEl.innerHTML = `<div class="text-center text-muted p-3">Memuat riwayat...</div>`;
    HISTORY_MODAL.show();

    try {
        const historySnapshot = await db.collection('ajuan').doc(id).collection('history').orderBy('timestamp', 'desc').get();
        if (historySnapshot.empty) {
            logListEl.innerHTML = `<div class="text-center text-muted p-3">Belum ada riwayat perubahan.</div>`;
            return;
        }
        const historyLogs = historySnapshot.docs.map(doc => doc.data());
        logListEl.innerHTML = historyLogs.map(log => {
            const time = log.timestamp && log.timestamp.toDate ? log.timestamp.toDate().toLocaleString('id-ID') : '';
            return `<div class="history-log-item">
                        <div class="d-flex justify-content-between align-items-center">
                            <strong class="text-primary">${escapeHtml(log.action)}</strong>
                            <small class="text-muted">${time}</small>
                        </div>
                        <p class="mb-1 small">${escapeHtml(log.details)}</p>
                        <small class="text-muted fst-italic">Oleh: ${escapeHtml(log.userId)}</small>
                    </div>`;
        }).join('');
    } catch (error) {
        logListEl.innerHTML = `<div class="text-center text-danger p-3">Gagal memuat riwayat.</div>`;
        console.error("History fetch error:", error);
    }
  };

  function calculateTotal(prefix = '') {
    const j = Number(document.getElementById(`${prefix}jumlah`).value || 0);
    const h = Number(document.getElementById(`${prefix}hargaSatuan`).value || 0);
    document.getElementById(`${prefix}total`).value = (j * h).toLocaleString('id-ID');
  }
  ['jumlah', 'hargaSatuan'].forEach(id => document.getElementById(id).addEventListener('input', () => calculateTotal()));
  ['edit-jumlah', 'edit-hargaSatuan'].forEach(id => document.getElementById(id).addEventListener('input', () => calculateTotal('edit-')));

  function clearRincianForm() {
      ['namaAjuan', 'jumlah', 'satuan', 'hargaSatuan', 'total', 'keterangan', 'dataDukung'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('selectGrub').value = ''; document.getElementById('selectKelompok').value = ''; document.getElementById('selectRevisi').value = 'Ajuan Baru';
      document.getElementById('namaAjuan').focus();
  }
  function clearAjuanForm() { document.getElementById('judulKegiatan').value = ''; clearRincianForm(); }
  function renderStagingTable() {
    const stagingArea = document.getElementById('staging-area'); const container = document.getElementById('staging-table-container'); const summaryEl = document.getElementById('staging-summary');
    if (STATE.stagingList.length === 0) { stagingArea.style.display = 'none'; container.innerHTML = ''; return; }
    stagingArea.style.display = 'block';
    let totalStaging = 0;
    const tableRows = STATE.stagingList.map((item, index) => {
      const itemTotal = (item.Jumlah || 0) * (item.Harga_Satuan || 0); totalStaging += itemTotal;
      return `<tr><td>${index + 1}</td><td>${escapeHtml(item.Grub_Belanja_Utama)}</td><td>${escapeHtml(item.Judul_Kegiatan)}</td><td>${escapeHtml(item.Nama_Ajuan)}</td><td>${escapeHtml(item.ID_Kelompok)}</td><td class="text-end">${Number(item.Jumlah).toLocaleString('id-ID')}</td><td>${escapeHtml(item.Satuan)}</td><td class="text-end">${Number(item.Harga_Satuan).toLocaleString('id-ID')}</td><td class="text-end fw-bold">${itemTotal.toLocaleString('id-ID')}</td><td><button class="btn btn-sm btn-outline-danger" onclick="window.removeFromStaging(${index})" title="Hapus"><i class="bi bi-trash"></i></button></td></tr>`;
    }).join('');
    container.innerHTML = `<table class="table table-sm table-striped"><thead class="table-light"><tr><th>No.</th><th>Grub Belanja</th><th>Judul Kegiatan</th><th>Rincian Ajuan</th><th>Kelompok</th><th class="text-end">Jumlah</th><th>Satuan</th><th class="text-end">Harga Satuan</th><th class="text-end">Total</th><th>Aksi</th></tr></thead><tbody>${tableRows}</tbody></table>`;
    summaryEl.innerHTML = `Total Ajuan: ${STATE.stagingList.length} Rincian | Grand Total: Rp ${totalStaging.toLocaleString('id-ID')}`;
  }
  window.removeFromStaging = (index) => { STATE.stagingList.splice(index, 1); renderStagingTable(); }
  document.getElementById('btn-add-to-staging').addEventListener('click', () => {
    if (STATE.role !== 'prodi') { showToast('Hanya role prodi yang dapat mengajukan.', 'danger'); return; }
    const judulKegiatan = document.getElementById('judulKegiatan').value.trim();
    if (!judulKegiatan) { showToast('Judul Kegiatan wajib diisi.', 'warning'); document.getElementById('judulKegiatan').focus(); return; }
    const jumlah = Number(document.getElementById('jumlah').value || 0);
    const hargaSatuan = Number(document.getElementById('hargaSatuan').value || 0);
    const payload = {
      Grub_Belanja_Utama: document.getElementById('selectGrub').value, Judul_Kegiatan: judulKegiatan, ID_Prodi: STATE.id, ID_Kelompok: document.getElementById('selectKelompok').value, Nama_Ajuan: document.getElementById('namaAjuan').value, Jumlah: jumlah, Satuan: document.getElementById('satuan').value, Harga_Satuan: hargaSatuan, Total: jumlah * hargaSatuan, Keterangan: document.getElementById('keterangan').value, Status_Revisi: document.getElementById('selectRevisi').value, Data_Dukung: document.getElementById('dataDukung').value,
    };
    if(!payload.Nama_Ajuan || payload.Jumlah <= 0 || !payload.Satuan || payload.Harga_Satuan < 0 || !payload.ID_Kelompok || !payload.Grub_Belanja_Utama){ showToast('Harap lengkapi semua field rincian.', 'warning'); return; }
    STATE.stagingList.push(payload); showToast(`Rincian "${payload.Nama_Ajuan}" telah ditambahkan.`, 'info'); renderStagingTable(); clearRincianForm();
  });
  document.getElementById('btn-clear-staging').addEventListener('click', () => {
    if (confirm('Yakin ingin menghapus semua rincian?')) { STATE.stagingList = []; renderStagingTable(); clearAjuanForm(); showToast('Daftar ajuan dibersihkan.', 'info'); }
  });

  document.getElementById('btn-submit-all-staged').addEventListener('click', async () => {
    if (STATE.stagingList.length === 0) { showToast('Tidak ada ajuan untuk dikirim.', 'warning'); return; }
    showLoader(true);
    try {
        const deadline = STATE.globalSettings.Batas_Tanggal_Pengajuan;
        if (deadline && deadline.toDate) {
            const deadlineDate = deadline.toDate();
            const today = new Date();
            today.setHours(0, 0, 0, 0); 
            if (today > deadlineDate && STATE.currentAjuanType === 'Awal') {
                throw new Error(`Pengajuan ditutup. Batas waktu pengajuan adalah ${deadlineDate.toLocaleDateString('id-ID')}.`);
            }
        }
        
        const prodiDoc = await db.collection('users').doc(STATE.uid).get();
        const paguAnggaran = Number(prodiDoc.data().Pagu_Anggaran) || 0;
        
        // --- START Pagu Check Modification ---
        if (STATE.currentAjuanType === 'Awal' && paguAnggaran > 0) {
            
            // Only consider existing active Awal ajuan for the initial Pagu check
            const activeAjuanQuery = await db.collection('ajuan')
                .where('ID_Prodi', '==', STATE.id)
                .where('Tipe_Ajuan', '==', 'Awal')
                .where('Status', 'in', ['Menunggu Review', 'Diterima', 'Revisi'])
                .get();

            let currentTotalAjuanAwal = 0;
            activeAjuanQuery.forEach(doc => {
                currentTotalAjuanAwal += Number(doc.data().Total) || 0;
            });

            const totalStaging = STATE.stagingList.reduce((sum, item) => sum + item.Total, 0);
            
            const projectedTotalAwal = currentTotalAjuanAwal + totalStaging;

            if (projectedTotalAwal > paguAnggaran) {
                throw new Error(`Gagal. Total ajuan Awal yang diajukan (Rp ${projectedTotalAwal.toLocaleString('id-ID')}) akan melebihi pagu anggaran Awal Anda (Rp ${paguAnggaran.toLocaleString('id-ID')}).`);
            }
        }
        // --- END Pagu Check Modification ---

        const batch = db.batch();
        STATE.stagingList.forEach(ajuan => {
            const ajuanRef = db.collection('ajuan').doc();
            batch.set(ajuanRef, { 
                ...ajuan, 
                Tipe_Ajuan: STATE.currentAjuanType, 
                Status: "Menunggu Review", 
                Komentar: [], 
                Timestamp: serverTimestamp() 
            });
            const historyRef = ajuanRef.collection('history').doc();
            batch.set(historyRef, {
                action: "Ajuan Dibuat",
                details: `Ajuan baru ditambahkan dengan total Rp ${ajuan.Total.toLocaleString('id-ID')}.`,
                userId: STATE.id,
                userUid: STATE.uid,
                timestamp: serverTimestamp()
            });
        });
        
        await batch.commit();

        await logActivity('Create Ajuan', `Mengirim ${STATE.stagingList.length} ajuan baru (${STATE.currentAjuanType}).`);

        STATE.allDirektoratUids.forEach(uid => {
            createNotification(uid, `${STATE.id} telah mengirim ${STATE.stagingList.length} ajuan baru untuk direview.`);
        });

        showToast(`${STATE.stagingList.length} ajuan berhasil dikirim.`);
        STATE.stagingList = []; renderStagingTable(); clearAjuanForm();
        
        if (STATE.currentAjuanType === 'Awal') {
            refreshAjuanTableAwal();
            new bootstrap.Tab(document.querySelector('[data-bs-target="#tab-daftar-awal"]')).show();
        } else {
            refreshAjuanTablePerubahan();
            new bootstrap.Tab(document.querySelector('[data-bs-target="#tab-daftar-perubahan"]')).show();
        }
        updateProdiPaguInfo(STATE.currentUserData);

    } catch (error) {
        showToast(error.message, 'danger');
        console.error("Error submitting ajuan: ", error);
    } finally {
        showLoader(false);
    }
  });
  
  document.getElementById('link-ajuan-awal').addEventListener('click', () => {
    STATE.currentAjuanType = 'Awal';
    document.getElementById('ajuan-form-title').innerHTML = `<i class="bi bi-file-earmark-plus"></i> Formulir Ajuan Awal`;
  });
  document.getElementById('link-ajuan-perubahan').addEventListener('click', () => {
    const tahapAktif = STATE.globalSettings.Tahap_Perubahan_Aktif || 1;
    STATE.currentAjuanType = `Perubahan ${tahapAktif}`;
    document.getElementById('ajuan-form-title').innerHTML = `<i class="bi bi-pencil-square"></i> Formulir Ajuan Perubahan ${tahapAktif}`;
  });
  
  function populateGrubBelanja(selectId, isFilter = false) {
    const sel = document.getElementById(selectId); sel.innerHTML = isFilter ? '<option value="">Semua Grub Belanja</option>' : '<option value="">-- Pilih Grub Belanja --</option>';
    GRUB_BELANJA_UTAMA_OPTIONS.forEach(optVal => sel.add(new Option(optVal, optVal)));
  }
  
  async function loadInitialData() {
    showLoader(true);
    try {
        ['selectGrub', 'edit-selectGrub'].forEach(id => populateGrubBelanja(id));
        ['filterGrubAwal', 'filterGrubPerubahan'].forEach(id => populateGrubBelanja(id, true));
        
        await refreshKelompokData(); 
        
        if (STATE.role === 'direktorat') {
            await refreshProdiData(); 
            const prodiList = STATE.allProdi.filter(p => p.Role === 'prodi');
            ['filterProdiAwal', 'filterProdiPerubahan', 'filterProdiRPDAwal', 'filterProdiRPDPerubahan', 'filterProdiRealisasiAwal', 'filterProdiRealisasiPerubahan', 'filterProdiBA'].forEach(id => populateProdiFilter(prodiList, id));
        }
        
        const direktoratSnapshot = await db.collection('users').where('Role', '==', 'direktorat').get();
        STATE.allDirektoratUids = direktoratSnapshot.docs.map(doc => doc.id);

        refreshAjuanTableAwal();
    } catch (error) {
        console.error("Error loading initial data:", error);
        showToast('Gagal memuat data awal aplikasi. Coba refresh halaman.', 'danger');
    } finally {
        showLoader(false);
    }
  }

  async function refreshKelompokData() {
    try {
        const kelompokSnapshot = await db.collection('kelompok').get();
        STATE.allKelompok = kelompokSnapshot.docs.map(doc => doc.data());
        ['selectKelompok', 'edit-selectKelompok'].forEach(id => populateKelompok(STATE.allKelompok, id));
        ['filterKelompokAwal', 'filterKelompokPerubahan'].forEach(id => populateKelompokFilter(STATE.allKelompok, id));
        if (STATE.role === 'direktorat') { populateKelompokList(STATE.allKelompok); }
    } catch (e) {
        console.error("Failed to refresh Kelompok data", e);
        showToast("Gagal memuat data kelompok.", "danger");
    }
  }

  async function refreshProdiData() {
      if (STATE.role !== 'direktorat') return;
      try {
          const prodiSnapshot = await db.collection('users').get();
          STATE.allProdi = prodiSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
          populateProdiList(STATE.allProdi);
      } catch (e) { console.error("Failed to refresh Prodi data", e); showToast("Gagal memuat data pengguna.", "danger"); }
  }

  function populateKelompok(list, selectId) { const sel = document.getElementById(selectId); sel.innerHTML = '<option value="">-- Pilih Kelompok --</option>'; (list || []).forEach(it => sel.add(new Option(`${it.ID_Kelompok} - ${it.Nama_Kelompok}`, it.ID_Kelompok))); }
  function populateProdiFilter(list, selectId) { const sel = document.getElementById(selectId); sel.innerHTML = '<option value="">Semua Prodi</option>';(list || []).forEach(it => sel.add(new Option(`${it.ID_Prodi} - ${it.Nama_Prodi}`, it.ID_Prodi))); }
  function populateKelompokFilter(list, selectId) { const sel = document.getElementById(selectId); sel.innerHTML = '<option value="">Semua Kelompok</option>'; (list || []).forEach(it => sel.add(new Option(`${it.ID_Kelompok} - ${it.Nama_Kelompok}`, it.ID_Kelompok))); }
  
  function populateProdiList(list) { 
    const container = document.getElementById('listProdi'); 
    container.innerHTML = (list || []).map(p => { 
      const paguValue = p.Pagu_Anggaran || 0; 
      const baSettings = p.beritaAcaraSettings || {}; 
      
      const isProdiRole = p.Role === 'prodi';
      const paguInputHTML = isProdiRole 
        ? `<div class="input-group input-group-sm mt-2">
             <span class="input-group-text">Pagu Rp</span>
             <input type="number" class="form-control" id="pagu-input-${p.uid}" value="${paguValue}" min="0" placeholder="0">
             <button class="btn btn-outline-success" onclick="window.savePagu('${p.uid}')" title="Simpan Pagu"><i class="bi bi-save"></i></button>
           </div>`
        : `<div class="small text-muted mt-2 fst-italic">Role: Direktorat (Tanpa Pagu)</div>`;

      return `<div class="border p-2 mb-2 rounded-2">
                <div class="d-flex justify-content-between align-items-center">
                  <div>
                    <strong>${p.ID_Prodi}</strong> - ${escapeHtml(p.Nama_Prodi)}
                    <div class="small text-muted">${p.Email || ''}</div>
                  </div>
                  <div class="btn-group">
                    <button class="btn btn-sm btn-outline-secondary" onclick="window.fillEditProdi('${p.uid}','${p.ID_Prodi}','${escapeHtml(p.Nama_Prodi)}','${p.Email}','${p.Role}', '${escapeHtml(baSettings.TTD_Jabatan || '')}', '${escapeHtml(baSettings.TTD_Nama || '')}')" title="Edit Profil"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.deleteUser('${p.uid}','${escapeHtml(p.ID_Prodi)}')" title="Hapus Profil"><i class="bi bi-trash"></i></button>
                  </div>
                </div>
                ${paguInputHTML} 
              </div>`; 
    }).join(''); 
  }

  function populateKelompokList(list) { const container = document.getElementById('listKelompok'); container.innerHTML = (list || []).map(k => `<div class="border p-2 mb-2 rounded-2 d-flex justify-content-between align-items-center"><div><strong>${k.ID_Kelompok}</strong> - ${escapeHtml(k.Nama_Kelompok)}</div><div class="btn-group"><button class="btn btn-sm btn-outline-secondary" onclick="window.fillEditKelompok('${k.ID_Kelompok}','${escapeHtml(k.Nama_Kelompok)}')"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger" onclick="window.deleteKelompok('${k.ID_Kelompok}')" title="Hapus"><i class="bi bi-trash"></i></button></div></div>`).join(''); }
  
  async function refreshAjuanTable(tipe) {
    const isPerubahan = tipe.startsWith('Perubahan');
    const tableId = isPerubahan ? `tableAjuanPerubahan` : `tableAjuanAwal`;
    const summaryId = isPerubahan ? `summary-display-perubahan` : `summary-display-awal`;
    
    showLoader(true);
    document.getElementById(tableId).innerHTML = `<div class="text-center text-muted p-5">Memuat data...</div>`;
    document.getElementById(summaryId).style.display = 'none';

    if (isPerubahan) {
        STATE.selectedAjuanIdsPerubahan.clear();
        updateBulkActionBar('Perubahan');
    } else {
        STATE.selectedAjuanIdsAwal.clear();
        updateBulkActionBar('Awal');
    }
    
    try {
        let query = db.collection('ajuan').where('Tipe_Ajuan', '==', tipe);
        
        const prodiFilterEl = document.getElementById(isPerubahan ? 'filterProdiPerubahan' : 'filterProdiAwal');
        if (STATE.role === 'prodi') {
            query = query.where('ID_Prodi', '==', STATE.id);
        } else if (prodiFilterEl.value) {
            query = query.where('ID_Prodi', '==', prodiFilterEl.value);
        }
        
        const grubFilter = document.getElementById(isPerubahan ? `filterGrubPerubahan` : `filterGrubAwal`).value; if (grubFilter) query = query.where('Grub_Belanja_Utama', '==', grubFilter);
        const kelompokFilter = document.getElementById(isPerubahan ? `filterKelompokPerubahan` : `filterKelompokAwal`).value; if (kelompokFilter) query = query.where('ID_Kelompok', '==', kelompokFilter);
        const statusFilter = document.getElementById(isPerubahan ? `filterStatusPerubahan` : `filterStatusAwal`).value; if (statusFilter) query = query.where('Status', '==', statusFilter);
        
        const snapshot = await query.get();
        let ajuanData = snapshot.docs.map(doc => {
            const data = doc.data();
            if (data.Timestamp && data.Timestamp.toDate) data.Timestamp = data.Timestamp.toDate();
            return { ID_Ajuan: doc.id, ...data };
        });
        
        ajuanData.sort((a, b) => (b.Timestamp || 0) - (a.Timestamp || 0));

        if (isPerubahan) {
            STATE.currentAjuanDataPerubahan = ajuanData;
            const asalIds = [...new Set(ajuanData.map(d => d.ID_Ajuan_Asal).filter(Boolean))];
            const awalDataMap = new Map();
            if (asalIds.length > 0) {
                const chunks = []; for (let i = 0; i < asalIds.length; i += 30) { chunks.push(asalIds.slice(i, i + 30)); }
                for (const chunk of chunks) {
                    const originalSnapshot = await db.collection('ajuan').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
                    originalSnapshot.forEach(doc => awalDataMap.set(doc.id, doc.data()));
                }
            }
            renderAjuanTable(ajuanData, 'Perubahan', awalDataMap);
        } else { // 'Awal'
            STATE.currentAjuanDataAwal = ajuanData;
            renderAjuanTable(ajuanData, 'Awal');
        }
        
    } catch (error) {
        console.error(`Error getting ajuan ${tipe}:`, error);
        showToast(`Gagal memuat data ajuan ${tipe.toLowerCase()}.`, "danger");
        document.getElementById(tableId).innerHTML = '<div class="text-center text-danger p-5">Gagal memuat data. Periksa konsol untuk detail error.</div>';
    } finally {
        showLoader(false);
    }
  }
  
  const refreshAjuanTableAwal = () => refreshAjuanTable('Awal');
  const refreshAjuanTablePerubahan = () => {
    const tahapAktif = STATE.globalSettings.Tahap_Perubahan_Aktif || 1;
    refreshAjuanTable(`Perubahan ${tahapAktif}`);
  };

  document.getElementById('btn-refresh-awal').addEventListener('click', refreshAjuanTableAwal);
  ['filterStatusAwal', 'filterProdiAwal', 'filterKelompokAwal', 'filterGrubAwal'].forEach(id => document.getElementById(id).addEventListener('change', refreshAjuanTableAwal));
  document.getElementById('btn-refresh-perubahan').addEventListener('click', refreshAjuanTablePerubahan);
  ['filterStatusPerubahan', 'filterProdiPerubahan', 'filterKelompokPerubahan', 'filterGrubPerubahan'].forEach(id => document.getElementById(id).addEventListener('change', refreshAjuanTablePerubahan));
  
  document.querySelector('[data-bs-target="#tab-daftar-awal"]').addEventListener('shown.bs.tab', refreshAjuanTableAwal);
  document.querySelector('[data-bs-target="#tab-daftar-perubahan"]').addEventListener('shown.bs.tab', refreshAjuanTablePerubahan);

  function renderAjuanTable(rows, tipe, originalDataMap = null) {
    const isPerubahan = tipe.startsWith('Perubahan');
    const container = document.getElementById(isPerubahan ? `tableAjuanPerubahan` : `tableAjuanAwal`);
    const summaryContainerId = isPerubahan ? `summary-display-perubahan` : `summary-display-awal`;
    if (rows.length === 0) { container.innerHTML = '<div class="text-center text-muted p-5">Belum ada ajuan.</div>'; document.getElementById(summaryContainerId).style.display = 'none'; return; }
    
    let grandTotal = 0, acceptedTotal = 0, rejectedTotal = 0;
    rows.forEach(r => { const totalValue = Number(r.Total) || 0; grandTotal += totalValue; if (r.Status === 'Diterima') acceptedTotal += totalValue; else if (r.Status === 'Ditolak') rejectedTotal += totalValue; });
    const summaryContainer = document.getElementById(summaryContainerId);
    summaryContainer.innerHTML = `<div><strong>Total Diajukan:</strong> Rp ${grandTotal.toLocaleString('id-ID')}</div><div><strong class="text-success">Total Diterima:</strong> Rp ${acceptedTotal.toLocaleString('id-ID')}</div><div><strong class="text-danger">Total Ditolak:</strong> Rp ${rejectedTotal.toLocaleString('id-ID')}</div>`;
    summaryContainer.style.display = 'flex';
    
    if (isPerubahan) {
        let html = `<table class="table table-hover align-middle" style="min-width: 2200px;"><thead class="table-light"><tr>
                        <th style="width: 30px;" rowspan="2" class="align-middle"><input type="checkbox" id="select-all-ajuan-${tipe}" title="Pilih Semua"></th>
                        <th colspan="3" class="text-center bg-secondary-subtle">DATA AJUAN LAMA</th>
                        <th colspan="3" class="text-center bg-light">DATA AJUAN BARU</th>
                        <th rowspan="2" class="align-middle text-end" style="min-width: 120px;">Selisih</th>
                        <th rowspan="2" class="align-middle text-center">Dakung</th>
                        <th rowspan="2" class="align-middle" style="min-width: 140px;">Status</th>
                        <th rowspan="2" class="align-middle" style="min-width: 200px;">Catatan Reviewer</th>
                        <th rowspan="2" class="align-middle text-end action-buttons" style="min-width: 200px;">Aksi</th>
                      </tr>
                      <tr class="table-light">
                        <th style="min-width: 250px;">Rincian Ajuan (Lama)</th>
                        <th style="min-width: 200px;">Detail Kuantitas (Lama)</th>
                        <th class="text-end" style="min-width: 130px;">Total Biaya (Lama)</th>
                        <th style="min-width: 250px;">Rincian Ajuan (Baru)</th>
                        <th style="min-width: 200px;">Detail Kuantitas (Baru)</th>
                        <th class="text-end" style="min-width: 130px;">Total Biaya (Baru)</th>
                      </tr>
                    </thead><tbody>`;
        
        const groupedData = rows.reduce((acc, row) => {
            const grubKey = row.Grub_Belanja_Utama || 'Lain-lain'; const kelompokId = row.ID_Kelompok || 'Lain-lain';
            const namaKelompok = (STATE.allKelompok.find(k => k.ID_Kelompok === kelompokId) || {}).Nama_Kelompok || 'Lain-lain';
            const kelompokKey = `${kelompokId} - ${namaKelompok}`; const kegiatanKey = row.Judul_Kegiatan || 'Tanpa Judul';
            if (!acc[grubKey]) acc[grubKey] = {}; if (!acc[grubKey][kelompokKey]) acc[grubKey][kelompokKey] = {}; if (!acc[grubKey][kelompokKey][kegiatanKey]) acc[grubKey][kelompokKey][kegiatanKey] = [];
            acc[grubKey][kelompokKey][kegiatanKey].push(row); return acc;
        }, {});

        const sortedGrubKeys = Object.keys(groupedData).sort();
        const prodiNameMap = STATE.allProdi.reduce((acc, prodi) => { acc[prodi.ID_Prodi] = prodi.Nama_Prodi; return acc; }, {});
        const statusClass = { "Menunggu Review": "status-menunggu-review", "Diterima": "status-diterima", "Ditolak": "status-ditolak", "Revisi": "status-revisi" };
        
        sortedGrubKeys.forEach(grubKey => {
          html += `<tr class="group-header-grub"><td colspan="12" class="fw-bold"><i class="bi bi-folder-fill"></i> ${escapeHtml(grubKey)}</td></tr>`;
          const sortedKelompokKeys = Object.keys(groupedData[grubKey]).sort();
          sortedKelompokKeys.forEach(kelompokKey => {
              html += `<tr class="group-header-kelompok"><td colspan="12" class="fw-bold ps-4"><i class="bi bi-tags-fill"></i> Kelompok: ${escapeHtml(kelompokKey)}</td></tr>`;
              const sortedKegiatanKeys = Object.keys(groupedData[grubKey][kelompokKey]).sort();
              sortedKegiatanKeys.forEach(kegiatanKey => {
                  html += `<tr class="group-header-kegiatan"><td colspan="12" class="fw-bold ps-5"><i class="bi bi-collection-fill text-secondary"></i> Kegiatan: ${escapeHtml(kegiatanKey)}</td></tr>`;
                  groupedData[grubKey][kelompokKey][kegiatanKey].forEach(r => {
                      const original = originalDataMap && originalDataMap.has(r.ID_Ajuan_Asal) ? originalDataMap.get(r.ID_Ajuan_Asal) : {};
                      const totalLama = Number(original.Total) || 0;
                      const totalBaru = Number(r.Total) || 0;
                      const selisih = totalBaru - totalLama;
                      const selisihClass = selisih > 0 ? 'text-success' : (selisih < 0 ? 'text-danger' : '');
                      const selisihText = selisih > 0 ? `+${selisih.toLocaleString('id-ID')}` : selisih.toLocaleString('id-ID');
                      const dataDukungLink = r.Data_Dukung ? `<a href="${escapeHtml(r.Data_Dukung)}" target="_blank" class="btn btn-sm btn-outline-secondary" title="Lihat"><i class="bi bi-box-arrow-up-right"></i></a>` : `<span class="text-muted small fst-italic">N/A</span>`;
                      const prodiColor = getColorForProdi(r.ID_Prodi);
                      const prodiNama = prodiNameMap[r.ID_Prodi] || r.ID_Prodi;
                      const prodiInfoHtml = STATE.role === 'direktorat' ? `<div class="small text-muted">Oleh: <strong>${escapeHtml(prodiNama)}</strong></div>` : '';
                      const idAjuanAsal = r.ID_Ajuan_Asal ? `<span class="badge bg-light text-dark fw-normal fst-italic">Asal: ${r.ID_Ajuan_Asal.substring(0,6)}..</span>` : '';

                      html += `<tr class="prodi-indicator" style="border-left-color: ${prodiColor};">
                                  <td><input type="checkbox" class="ajuan-checkbox-${tipe}" data-id="${r.ID_Ajuan}"></td>
                                  <td class="bg-secondary-subtle"><small>${escapeHtml(original.Nama_Ajuan || 'N/A')}</small></td>
                                  <td class="bg-secondary-subtle"><small class="text-nowrap">${Number(original.Jumlah || 0).toLocaleString('id-ID')} ${escapeHtml(original.Satuan || '')} X Rp ${Number(original.Harga_Satuan || 0).toLocaleString('id-ID')}</small></td>
                                  <td class="text-end bg-secondary-subtle"><small>Rp ${totalLama.toLocaleString('id-ID')}</small></td>
                                  <td><div class="d-flex justify-content-between align-items-start"><strong class="me-2">${escapeHtml(r.Nama_Ajuan)}</strong><span class="badge bg-secondary-subtle text-secondary-emphasis fw-normal text-nowrap">${r.ID_Ajuan.substring(0, 6)}..</span></div>${prodiInfoHtml}<div class="mt-1"><span class="badge bg-info-subtle text-info-emphasis fw-normal">${escapeHtml(r.Status_Revisi || 'Ajuan Baru')}</span> ${idAjuanAsal}</div></td>
                                  <td><div class="small text-nowrap">${Number(r.Jumlah).toLocaleString('id-ID')} ${escapeHtml(r.Satuan)} X Rp ${Number(r.Harga_Satuan).toLocaleString('id-ID')}</div></td>
                                  <td class="text-end text-nowrap"><strong>Rp ${totalBaru.toLocaleString('id-ID')}</strong></td>
                                  <td class="text-end text-nowrap fw-bold ${selisihClass}">${selisihText}</td>
                                  <td class="text-center">${dataDukungLink}</td>
                                  <td><span class="badge rounded-pill status-badge ${statusClass[r.Status] || 'bg-secondary'}">${r.Status}</span></td>
                                  <td><small class="text-muted fst-italic">${escapeHtml(r.Catatan_Reviewer || '')}</small></td>
                                  <td class="text-end action-buttons">${renderActionsForRow(r, tipe)}</td>
                              </tr>`;
                  });
              });
          });
        });
        container.innerHTML = html + '</tbody></table>';
    } else { // This is for tipe === 'Awal'
        const groupedData = rows.reduce((acc, row) => {
            const grubKey = row.Grub_Belanja_Utama || 'Lain-lain'; const kelompokId = row.ID_Kelompok || 'Lain-lain';
            const namaKelompok = (STATE.allKelompok.find(k => k.ID_Kelompok === kelompokId) || {}).Nama_Kelompok || 'Lain-lain';
            const kelompokKey = `${kelompokId} - ${namaKelompok}`; const kegiatanKey = row.Judul_Kegiatan || 'Tanpa Judul';
            if (!acc[grubKey]) acc[grubKey] = {}; if (!acc[grubKey][kelompokKey]) acc[grubKey][kelompokKey] = {}; if (!acc[grubKey][kelompokKey][kegiatanKey]) acc[grubKey][kelompokKey][kegiatanKey] = [];
            acc[grubKey][kelompokKey][kegiatanKey].push(row); return acc;
        }, {});
        const sortedGrubKeys = Object.keys(groupedData).sort(); const statusClass = { "Menunggu Review": "status-menunggu-review", "Diterima": "status-diterima", "Ditolak": "status-ditolak", "Revisi": "status-revisi" };
        const prodiNameMap = STATE.allProdi.reduce((acc, prodi) => { acc[prodi.ID_Prodi] = prodi.Nama_Prodi; return acc; }, {});
        let html = `<table class="table table-hover align-middle" style="min-width: 1350px;"><thead class="table-light"><tr><th style="width: 30px;"><input type="checkbox" id="select-all-ajuan-${tipe}" title="Pilih Semua"></th><th style="min-width: 250px;">Rincian Ajuan</th><th style="min-width: 200px;">Detail Kuantitas</th><th class="text-end" style="min-width: 130px;">Total Biaya</th><th class="text-center">Dakung</th><th style="min-width: 140px;">Status</th><th style="min-width: 200px;">Catatan Reviewer</th><th class="text-end action-buttons" style="min-width: 200px;">Aksi</th></tr></thead><tbody>`;
        sortedGrubKeys.forEach(grubKey => {
          html += `<tr class="group-header-grub"><td colspan="8" class="fw-bold"><i class="bi bi-folder-fill"></i> ${escapeHtml(grubKey)}</td></tr>`;
          const sortedKelompokKeys = Object.keys(groupedData[grubKey]).sort();
          sortedKelompokKeys.forEach(kelompokKey => {
              const sortedKegiatanKeys = Object.keys(groupedData[grubKey][kelompokKey]).sort();
              html += `<tr class="group-header-kelompok"><td colspan="8" class="fw-bold ps-4"><i class="bi bi-tags-fill"></i> Kelompok: ${escapeHtml(kelompokKey)}</td></tr>`;
              sortedKegiatanKeys.forEach(kegiatanKey => {
                  html += `<tr class="group-header-kegiatan"><td colspan="8" class="fw-bold ps-5"><i class="bi bi-collection-fill text-secondary"></i> Kegiatan: ${escapeHtml(kegiatanKey)}</td></tr>`;
                  groupedData[grubKey][kelompokKey][kegiatanKey].forEach(r => {
                      const dataDukungLink = r.Data_Dukung ? `<a href="${escapeHtml(r.Data_Dukung)}" target="_blank" class="btn btn-sm btn-outline-secondary" title="Lihat"><i class="bi bi-box-arrow-up-right"></i></a>` : `<span class="text-muted small fst-italic">N/A</span>`;
                      const prodiColor = getColorForProdi(r.ID_Prodi);
                      const prodiNama = prodiNameMap[r.ID_Prodi] || r.ID_Prodi;
                      const prodiInfoHtml = STATE.role === 'direktorat' ? `<div class="small text-muted">Oleh: <strong>${escapeHtml(prodiNama)}</strong></div>` : '';
                      const idAjuanAsal = r.ID_Ajuan_Asal ? `<span class="badge bg-light text-dark fw-normal fst-italic">Asal: ${r.ID_Ajuan_Asal.substring(0,6)}..</span>` : '';
                      html += `<tr class="prodi-indicator" style="border-left-color: ${prodiColor};"><td><input type="checkbox" class="ajuan-checkbox-${tipe}" data-id="${r.ID_Ajuan}"></td><td><div class="d-flex justify-content-between align-items-start"><strong class="me-2">${escapeHtml(r.Nama_Ajuan)}</strong><span class="badge bg-secondary-subtle text-secondary-emphasis fw-normal text-nowrap">${r.ID_Ajuan.substring(0, 6)}..</span></div>${prodiInfoHtml}<div class="mt-1"><span class="badge bg-info-subtle text-info-emphasis fw-normal">${escapeHtml(r.Status_Revisi || 'Ajuan Baru')}</span> ${idAjuanAsal}</div></td><td><div class="small text-nowrap">${Number(r.Jumlah).toLocaleString('id-ID')} ${escapeHtml(r.Satuan)} X Rp ${Number(r.Harga_Satuan).toLocaleString('id-ID')}</div></td><td class="text-end text-nowrap"><strong>Rp ${Number(r.Total).toLocaleString('id-ID')}</strong></td><td class="text-center">${dataDukungLink}</td><td><span class="badge rounded-pill status-badge ${statusClass[r.Status] || 'bg-secondary'}">${r.Status}</span></td><td><small class="text-muted fst-italic">${escapeHtml(r.Catatan_Reviewer || '')}</small></td><td class="text-end action-buttons">${renderActionsForRow(r, tipe)}</td></tr>`;
                  });
              });
          });
        });
        container.innerHTML = html + '</tbody></table>'; 
    }
    addCheckboxListeners(tipe);
  }
  function renderActionsForRow(r, tipe) {
    let actions = '';
    const comments = r.Komentar || [];
    let commentCount = comments.length;
    let hasNewComment = commentCount > 0 && comments[comments.length - 1].author !== STATE.id;
    
    actions += `<button class="btn btn-sm btn-outline-secondary" onclick="window.openHistoryModal('${r.ID_Ajuan}', '${escapeHtml(r.Nama_Ajuan)}')" title="Lihat Riwayat"><i class="bi bi-clock-history"></i></button>`;
    actions += `<span class="comment-btn-wrapper"><button class="btn btn-sm btn-outline-info" onclick="window.openKomentarModal('${r.ID_Ajuan}', '${escapeHtml(r.Nama_Ajuan)}')" title="Diskusi (${commentCount})"><i class="bi bi-chat-dots-fill"></i></button>${hasNewComment ? '<span class="comment-notification-dot"></span>' : ''}</span>`;
    
    let isEditableForProdi = false;
    const isTahapPerubahanOpen = STATE.globalSettings.Status_Ajuan_Perubahan === 'Dibuka';
    
    if (tipe === 'Awal' && !isTahapPerubahanOpen) {
        isEditableForProdi = true;
    } else if (tipe.startsWith('Perubahan')) {
        isEditableForProdi = true;
    }

    if (STATE.role === 'prodi' && String(r.ID_Prodi) === String(STATE.id) && ['Revisi', 'Menunggu Review', 'Ditolak'].includes(r.Status) && isEditableForProdi) { 
        actions += `<button class="btn btn-sm btn-outline-primary" onclick="window.openEditModal('${r.ID_Ajuan}')" title="Edit"><i class="bi bi-pencil-fill"></i></button>`; 
    }
    
    if (STATE.role === 'direktorat') {
      if (["Menunggu Review", "Revisi"].includes(r.Status)) { actions += `<button class="btn btn-sm btn-success" onclick="window.openReviewModal('${r.ID_Ajuan}','Diterima', '${tipe}', '${r.Status}')" title="Terima"><i class="bi bi-check-lg"></i></button><button class="btn btn-sm btn-danger" onclick="window.openReviewModal('${r.ID_Ajuan}','Ditolak', '${tipe}', '${r.Status}')" title="Tolak"><i class="bi bi-x-lg"></i></button><button class="btn btn-sm btn-warning text-dark" onclick="window.openReviewModal('${r.ID_Ajuan}','Revisi', '${tipe}', '${r.Status}')" title="Revisi"><i class="bi bi-arrow-return-left"></i></button>`; }
      actions += `<button class="btn btn-sm btn-outline-danger" onclick="window.deleteAjuan('${r.ID_Ajuan}', '${tipe}')" title="Hapus"><i class="bi bi-trash-fill"></i></button>`;
    }

    if (STATE.role === 'prodi' && String(r.ID_Prodi) === String(STATE.id) && ['Revisi', 'Menunggu Review'].includes(r.Status) && isEditableForProdi) { 
        actions += ` <button class="btn btn-sm btn-outline-danger" onclick="window.deleteAjuan('${r.ID_Ajuan}', '${tipe}')" title="Hapus"><i class="bi bi-trash-fill"></i></button>`; 
    }
    return actions || '-';
  }

  window.openEditModal = async (id) => {
    showLoader(true);
    try {
        const doc = await db.collection('ajuan').doc(id).get();
        if (!doc.exists) throw new Error("Ajuan tidak ditemukan.");
        const r = doc.data();
        document.getElementById('edit-id-ajuan').value = id;
        document.getElementById('editModalAjuanId').innerText = id.substring(0, 6) + '...';
        document.getElementById('edit-tipeAjuan').value = r.Tipe_Ajuan || 'Awal';
        document.getElementById('edit-judulKegiatan').value = r.Judul_Kegiatan; document.getElementById('edit-namaAjuan').value = r.Nama_Ajuan;
        document.getElementById('edit-selectGrub').value = r.Grub_Belanja_Utama; 
        document.getElementById('edit-selectKelompok').value = r.ID_Kelompok;
        document.getElementById('edit-selectRevisi').value = r.Status_Revisi || 'Ajuan Baru'; document.getElementById('edit-dataDukung').value = r.Data_Dukung || ''; document.getElementById('edit-jumlah').value = r.Jumlah; document.getElementById('edit-satuan').value = r.Satuan; document.getElementById('edit-hargaSatuan').value = r.Harga_Satuan; document.getElementById('edit-keterangan').value = r.Keterangan; calculateTotal('edit-'); EDIT_MODAL.show();
    } catch (error) { showToast(`Gagal memuat data edit: ${error.message}`, 'danger'); } finally { showLoader(false); }
  };
  
  document.getElementById('btn-update-ajuan').addEventListener('click', async () => {
    const idAjuan = document.getElementById('edit-id-ajuan').value;
    const tipeAjuan = document.getElementById('edit-tipeAjuan').value;
    showLoader(true);

    try {
        const ajuanRef = db.collection('ajuan').doc(idAjuan);
        const docBefore = await ajuanRef.get();
        if (!docBefore.exists) throw new Error("Item ajuan tidak ditemukan.");
        const dataBefore = docBefore.data();

        const jumlah = Number(document.getElementById('edit-jumlah').value);
        const hargaSatuan = Number(document.getElementById('edit-hargaSatuan').value);
        const newTotal = jumlah * hargaSatuan;
        const dataAfter = { 
            Grub_Belanja_Utama: document.getElementById('edit-selectGrub').value,
            Judul_Kegiatan: document.getElementById('edit-judulKegiatan').value,
            Nama_Ajuan: document.getElementById('edit-namaAjuan').value,
            ID_Kelompok: document.getElementById('edit-selectKelompok').value,
            Jumlah: jumlah, Satuan: document.getElementById('edit-satuan').value,
            Harga_Satuan: hargaSatuan, Total: newTotal,
            Keterangan: document.getElementById('edit-keterangan').value,
            Status_Revisi: document.getElementById('edit-selectRevisi').value,
            Data_Dukung: document.getElementById('edit-dataDukung').value
        };

        if (STATE.role === 'prodi') {
            const paguAnggaran = STATE.currentUserData.Pagu_Anggaran || 0;
            if (tipeAjuan === 'Awal' && paguAnggaran > 0) {
                
                const activeAjuanQuery = await db.collection('ajuan')
                    .where('ID_Prodi', '==', STATE.id)
                    .where('Tipe_Ajuan', '==', 'Awal') // Filter Awal
                    .where('Status', 'in', ['Menunggu Review', 'Diterima', 'Revisi'])
                    .get();
                
                let currentTotalAjuanAwal = 0;
                activeAjuanQuery.forEach(doc => { 
                    // Exclude the total of the document being edited
                    if (doc.id !== idAjuan) {
                       currentTotalAjuanAwal += Number(doc.data().Total) || 0; 
                    }
                });
                
                const projectedTotal = currentTotalAjuanAwal + newTotal;
                
                if (projectedTotal > paguAnggaran) {
                     throw new Error(`Gagal. Total ajuan Awal (Rp ${projectedTotal.toLocaleString('id-ID')}) akan melebihi pagu Awal Anda (Rp ${paguAnggaran.toLocaleString('id-ID')}).`);
                }
            }
            // Note: If tipeAjuan is 'Perubahan X', the Pagu check is intentionally skipped based on request.
        }
        
        let changes = [];
        for (const key in dataAfter) {
            if (String(dataAfter[key]) !== String(dataBefore[key])) {
                changes.push(`'${key}' dari '${dataBefore[key]}' menjadi '${dataAfter[key]}'`);
            }
        }
        if (changes.length > 0) {
            const historyDetails = `Detail perubahan: ${changes.join(', ')}.`;
            await logHistory(idAjuan, "Ajuan Diedit", historyDetails);
            await logActivity('Update Ajuan', `Mengedit ajuan ID: ${idAjuan}. Perubahan: ${historyDetails}`);
        }
        
        await ajuanRef.update(dataAfter);
        showToast('Ajuan berhasil diperbarui.');
        EDIT_MODAL.hide();
        if (tipeAjuan.startsWith('Perubahan')) refreshAjuanTablePerubahan(); else refreshAjuanTableAwal();
        if (STATE.role === 'prodi') updateProdiPaguInfo(STATE.currentUserData);

    } catch (error) {
        showToast(`Gagal update: ${error.message}`, 'danger');
    } finally {
        showLoader(false);
    }
  });

  window.deleteAjuan = async (id, tipe) => {
      if (confirm(`Yakin ingin menghapus ajuan ID: ${id}?`)) {
          showLoader(true);
          try {
              await db.collection('ajuan').doc(id).delete();
              await logActivity('Delete Ajuan', `Menghapus ajuan ID: ${id} (${tipe}).`);
              showToast('Ajuan berhasil dihapus.');
              if(tipe === 'Awal') refreshAjuanTableAwal(); else refreshAjuanTablePerubahan();
              if(STATE.role === 'prodi') updateProdiPaguInfo(STATE.currentUserData);
          } catch(error) { showToast(`Gagal menghapus: ${error.message}`, 'danger'); } finally { showLoader(false); }
      }
  };

  window.openReviewModal = (id, action, tipe, oldStatus) => {
    document.getElementById('review-id-ajuan').value = `${id}|${tipe}`;
    document.getElementById('review-action').value = action; document.getElementById('reviewModalAjuanId').innerText = id.includes(',') ? 'Beberapa Ajuan' : id.substring(0, 6) + '...'; document.getElementById('review-action-text').innerText = action;
    document.getElementById('review-old-status').value = oldStatus || '';
    const targetInfo = document.getElementById('review-target-info');
    if(id.includes(',')) { targetInfo.style.display = 'block'; targetInfo.innerText = `Aksi ini akan diterapkan pada ${id.split(',').length} ajuan terpilih.`; } else { targetInfo.style.display = 'none'; }
    document.getElementById('review-catatan').value = ''; REVIEW_MODAL.show();
  };

  document.getElementById('btn-submit-review').addEventListener('click', async () => {
    const [idString, tipe] = document.getElementById('review-id-ajuan').value.split('|');
    const oldStatus = document.getElementById('review-old-status').value;
    const ids = idString.split(',');
    const newStatus = document.getElementById('review-action').value;
    const catatan = document.getElementById('review-catatan').value;
    const data = { Status: newStatus, Catatan_Reviewer: catatan };
    
    showLoader(true);
    
    try {
        const batch = db.batch();
        const ajuanProdiMap = new Map();

        for (const id of ids) {
            const ajuanRef = db.collection('ajuan').doc(id);
            batch.update(ajuanRef, data);
            
            const detailLog = `Status diubah dari '${oldStatus || "N/A"}' menjadi '${newStatus}'. Catatan: ${catatan || 'Tidak ada.'}`;
            logHistory(id, "Status Direview", detailLog);
            
            if (STATE.role === 'direktorat') {
                const ajuanDoc = await ajuanRef.get();
                if (ajuanDoc.exists) {
                    const ajuanData = ajuanDoc.data();
                    if (!ajuanProdiMap.has(ajuanData.ID_Prodi)) {
                        ajuanProdiMap.set(ajuanData.ID_Prodi, []);
                    }
                    ajuanProdiMap.get(ajuanData.ID_Prodi).push(ajuanData.Nama_Ajuan);
                }
            }
        }
        
        await batch.commit();

        await logActivity('Review Ajuan', `Status ${ids.length} ajuan diubah menjadi ${newStatus}. Catatan: ${catatan || 'Tidak ada'}.`);

        if (STATE.role === 'direktorat') {
            for (const [prodiId, ajuanNames] of ajuanProdiMap.entries()) {
                const prodiUser = STATE.allProdi.find(p => p.ID_Prodi === prodiId);
                if (prodiUser && prodiUser.uid) {
                    const message = `Ajuan '${ajuanNames[0]}' ${ajuanNames.length > 1 ? `dan ${ajuanNames.length-1} lainnya` : ''} telah direview menjadi: ${newStatus}.`;
                    createNotification(prodiUser.uid, message);
                }
            }
        }

        showToast(`${ids.length} review berhasil dikirim.`);
        REVIEW_MODAL.hide();
        if(tipe === 'Awal') refreshAjuanTableAwal(); else refreshAjuanTablePerubahan();
        loadDashboardData();

    } catch (error) { showToast(`Gagal mengirim review: ${error.message}`, 'danger'); } finally { showLoader(false); }
  });
  
  function updateBulkActionBar(tipe) { const bar = document.getElementById(`bulk-action-bar-${tipe.toLowerCase()}`); const countEl = document.getElementById(`bulk-selected-count-${tipe.toLowerCase()}`); const selectedIds = tipe === 'Awal' ? STATE.selectedAjuanIdsAwal : STATE.selectedAjuanIdsPerubahan; const selectedCount = selectedIds.size; if (selectedCount > 0 && STATE.role === 'direktorat') { bar.style.display = 'flex'; countEl.textContent = selectedCount; } else { bar.style.display = 'none'; } }
  function addCheckboxListeners(tipe) { const selectAll = document.getElementById(`select-all-ajuan-${tipe}`); const checkboxes = document.querySelectorAll(`.ajuan-checkbox-${tipe}`); const selectedIds = tipe === 'Awal' ? STATE.selectedAjuanIdsAwal : STATE.selectedAjuanIdsPerubahan; if (selectAll) { selectAll.addEventListener('change', (e) => { checkboxes.forEach(cb => { cb.checked = e.target.checked; const id = cb.dataset.id; if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id); }); updateBulkActionBar(tipe); }); } checkboxes.forEach(cb => { cb.addEventListener('change', (e) => { const id = e.target.dataset.id; if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id); if(selectAll) selectAll.checked = checkboxes.length === selectedIds.size; updateBulkActionBar(tipe); }); }); }
  
  ['Awal', 'Perubahan'].forEach(tipe => {
    const lowerTipe = tipe.toLowerCase();
    document.getElementById(`bulk-accept-${lowerTipe}`).addEventListener('click', () => { const ids = Array.from(tipe === 'Awal' ? STATE.selectedAjuanIdsAwal : STATE.selectedAjuanIdsPerubahan); if (ids.length > 0) openReviewModal(ids.join(','), 'Diterima', tipe, 'Menunggu Review'); });
    document.getElementById(`bulk-reject-${lowerTipe}`).addEventListener('click', () => { const ids = Array.from(tipe === 'Awal' ? STATE.selectedAjuanIdsAwal : STATE.selectedAjuanIdsPerubahan); if (ids.length > 0) openReviewModal(ids.join(','), 'Ditolak', tipe, 'Menunggu Review'); });
    document.getElementById(`bulk-revision-${lowerTipe}`).addEventListener('click', () => { const ids = Array.from(tipe === 'Awal' ? STATE.selectedAjuanIdsAwal : STATE.selectedAjuanIdsPerubahan); if (ids.length > 0) openReviewModal(ids.join(','), 'Revisi', tipe, 'Menunggu Review'); });
    document.getElementById(`bulk-delete-${lowerTipe}`).addEventListener('click', async () => {
        const ids = Array.from(tipe === 'Awal' ? STATE.selectedAjuanIdsAwal : STATE.selectedAjuanIdsPerubahan); if (ids.length === 0) return;
        if (confirm(`Yakin ingin menghapus ${ids.length} ajuan terpilih?`)) {
            showLoader(true);
            const batch = db.batch();
            ids.forEach(id => batch.delete(db.collection('ajuan').doc(id)));
            try {
                await batch.commit();
                await logActivity('Bulk Delete Ajuan', `Menghapus ${ids.length} ajuan (${tipe}).`);
                showToast(`${ids.length} ajuan berhasil dihapus.`);
                if (tipe === 'Awal') refreshAjuanTableAwal(); else refreshAjuanTablePerubahan();
                loadDashboardData();
            } catch (error) { showToast(`Gagal menghapus: ${error.message}`, 'danger'); } finally { showLoader(false); }
        }
    });
  });

  document.getElementById('btn-copy-accepted').addEventListener('click', async () => {
    if (STATE.role !== 'prodi') return;

    const tahapAktif = STATE.globalSettings.Tahap_Perubahan_Aktif || 1;
    const sourceType = tahapAktif === 1 ? 'Awal' : `Perubahan ${tahapAktif - 1}`;
    const destinationType = `Perubahan ${tahapAktif}`;

    if (!confirm(`Anda akan menyalin ajuan dari tahap "${sourceType}" yang berstatus "Diterima" ke daftar "${destinationType}". Ajuan yang sudah pernah disalin tidak akan diduplikasi. Lanjutkan?`)) return;
    
    showLoader(true);
    try {
        const allProdiAjuanSnapshot = await db.collection('ajuan')
            .where('ID_Prodi', '==', STATE.id)
            .get();
        
        const existingAsalIds = new Set();
        allProdiAjuanSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.Tipe_Ajuan === destinationType && data.ID_Ajuan_Asal) {
                existingAsalIds.add(data.ID_Ajuan_Asal);
            }
        });

        const sourceDocs = allProdiAjuanSnapshot.docs.filter(doc => {
            const data = doc.data();
            return data.Tipe_Ajuan === sourceType && data.Status === 'Diterima';
        });

        const batch = db.batch();
        let copyCount = 0;
        
        sourceDocs.forEach(doc => {
            if (!existingAsalIds.has(doc.id)) {
                const data = doc.data();
                const newDocRef = db.collection('ajuan').doc();
                
                const newData = {
                    Grub_Belanja_Utama: data.Grub_Belanja_Utama || '', Judul_Kegiatan: data.Judul_Kegiatan || '', ID_Prodi: data.ID_Prodi, ID_Kelompok: data.ID_Kelompok || '', Nama_Ajuan: data.Nama_Ajuan || 'Salinan', Jumlah: data.Jumlah || 0, Satuan: data.Satuan || '', Harga_Satuan: data.Harga_Satuan || 0, Total: data.Total || 0, Keterangan: data.Keterangan || '', Status_Revisi: data.Status_Revisi || 'Ajuan Baru', Data_Dukung: data.Data_Dukung || '',
                    Tipe_Ajuan: destinationType, Status: 'Menunggu Review', Komentar: [], ID_Ajuan_Asal: doc.id, Timestamp: serverTimestamp()
                };
                
                batch.set(newDocRef, newData);
                
                const historyRef = newDocRef.collection('history').doc();
                batch.set(historyRef, {
                    action: "Ajuan Dibuat (Salinan)",
                    details: `Disalin dari ${sourceType} ID ${doc.id.substring(0,6)}..`,
                    userId: STATE.id, userUid: STATE.uid, timestamp: serverTimestamp()
                });

                copyCount++;
            }
        });
        
        if (copyCount > 0) {
            await batch.commit();
            await logActivity('Pindahkan Ajuan', `Menyalin ${copyCount} ajuan dari ${sourceType} ke ${destinationType}.`);
            showToast(`${copyCount} ajuan baru berhasil disalin ke daftar ${destinationType}.`, 'success');
            refreshAjuanTablePerubahan();
        } else {
            showToast('Tidak ada ajuan baru untuk disalin.', 'info');
        }
        
    } catch (error) {
        showToast(`Gagal memindahkan ajuan: ${error.message}`, 'danger');
        console.error('Copy error:', error);
    } finally {
        showLoader(false);
    }
});

  async function refreshTable(baseName, tipe) {
    const isPerubahan = tipe.startsWith("Perubahan");
    const tableContainerId = isPerubahan ? `table${baseName}Perubahan` : `table${baseName}Awal`;
    const filterProdiId = isPerubahan ? `filterProdi${baseName}Perubahan` : `filterProdi${baseName}Awal`;
    const tableContainer = document.getElementById(tableContainerId);
    
    tableContainer.innerHTML = `<div class="text-center text-muted p-5">Memuat data...</div>`;
    showLoader(true);
    
    try {
        let query = db.collection('ajuan').where('Status', '==', 'Diterima').where('Tipe_Ajuan', '==', tipe);
        
        if (STATE.role === 'direktorat') {
            const prodi = document.getElementById(filterProdiId).value;
            if (prodi) query = query.where('ID_Prodi', '==', prodi);
        } else {
            query = query.where('ID_Prodi', '==', STATE.id);
        }
        
        const snapshot = await query.get();
        const data = snapshot.docs.map(doc => ({ ID_Ajuan: doc.id, ...doc.data() }));
        
        const tipeSuffix = isPerubahan ? 'Perubahan' : 'Awal';
        if (baseName === 'RPD') {
            renderRPDTable(data, tipeSuffix);
        } else if (baseName === 'Realisasi') {
            renderRealisasiTable(data, tipeSuffix);
            renderRealisasiSummary(data, tipeSuffix);
        }
    } catch(error) {
        tableContainer.innerHTML = `<div class="text-center text-danger p-5">Gagal memuat data.</div>`;
        console.error(`${baseName} ${tipe} Error:`, error);
    } finally {
        showLoader(false);
    }
  }

  const RPD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  
  function renderRPDTable(data, tipe) { const container = document.getElementById(`tableRPD${tipe}`); if (data.length === 0) { container.innerHTML = '<div class="text-center text-muted p-5">Tidak ada ajuan diterima.</div>'; return; } const isDirektorat = STATE.role === 'direktorat'; const readOnlyAttr = isDirektorat ? 'readonly' : ''; const disabledBtnClass = isDirektorat ? 'disabled' : ''; let tableHeader = `<tr class="table-light"><th rowspan="2" class="align-middle">ID</th><th rowspan="2" class="align-middle">Prodi</th><th rowspan="2" class="align-middle">Rincian</th><th rowspan="2" class="align-middle text-end">Total Diterima</th><th colspan="12" class="text-center">Rencana Penarikan Dana per Bulan (Rp)</th><th rowspan="2" class="align-middle text-end">Total RPD</th><th rowspan="2" class="align-middle text-end">Sisa</th><th rowspan="2" class="align-middle text-center">Aksi</th></tr><tr class="table-light">${RPD_MONTHS.map(m => `<th class="text-center" style="min-width: 110px;">${m}</th>`).join('')}</tr>`; const tableRows = data.map(r => { const ajuanId = r.ID_Ajuan; let totalAllocated = 0; const rpdInputs = RPD_MONTHS.map(month => { const value = Number(r[`RPD_${month}`] || 0); totalAllocated += value; return `<td><input type="number" class="form-control form-control-sm rpd-input" data-ajuan-id="${ajuanId}" value="${value}" oninput="window.updateRpdRowSummary('${ajuanId}', '${tipe}')" min="0" ${readOnlyAttr}></td>`; }).join(''); const totalAjuan = Number(r.Total) || 0; const sisa = totalAjuan - totalAllocated; const sisaClass = sisa < 0 ? 'text-danger fw-bold' : ''; return `<tr id="rpd-row-${tipe}-${ajuanId}"><td><span class="badge bg-secondary-subtle text-secondary-emphasis fw-normal">${ajuanId.substring(0,6)}..</span></td><td>${escapeHtml(r.ID_Prodi)}</td><td><strong>${escapeHtml(r.Nama_Ajuan)}</strong><div class="small text-muted">${escapeHtml(r.Judul_Kegiatan)}</div></td><td class="text-end fw-bold" data-total="${totalAjuan}">${totalAjuan.toLocaleString('id-ID')}</td>${rpdInputs}<td class="text-end fw-bold rpd-total-allocated">${totalAllocated.toLocaleString('id-ID')}</td><td class="text-end fw-bold rpd-sisa ${sisaClass}">${sisa.toLocaleString('id-ID')}</td><td class="text-center"><button class="btn btn-sm btn-primary ${disabledBtnClass}" onclick="window.saveRPD('${ajuanId}', '${tipe}')" title="Simpan RPD"><i class="bi bi-save"></i></button></td></tr>`; }).join(''); container.innerHTML = `<table class="table table-bordered table-sm small"><thead>${tableHeader}</thead><tbody>${tableRows}</tbody></table>`; }
  window.updateRpdRowSummary = (ajuanId, tipe) => { const row = document.getElementById(`rpd-row-${tipe}-${ajuanId}`); if (!row) return false; const totalValue = parseFloat(row.querySelector('[data-total]').dataset.total); let currentSum = 0; row.querySelectorAll('.rpd-input').forEach(input => { currentSum += Number(input.value) || 0; }); const sisa = totalValue - currentSum; row.querySelector('.rpd-total-allocated').textContent = currentSum.toLocaleString('id-ID'); row.querySelector('.rpd-sisa').textContent = sisa.toLocaleString('id-ID'); if (sisa < 0) { row.querySelector('.rpd-sisa').classList.add('text-danger'); return false; } else { row.querySelector('.rpd-sisa').classList.remove('text-danger'); return true; } }
  window.saveRPD = async (ajuanId, tipe) => { if (!window.updateRpdRowSummary(ajuanId, tipe)) { showToast('Gagal. Total alokasi RPD melebihi total diterima.', 'danger'); return; } showLoader(true); const row = document.getElementById(`rpd-row-${tipe}-${ajuanId}`); const rpdData = {}; let totalRpd = 0; row.querySelectorAll('.rpd-input').forEach((input, index) => { const value = Number(input.value) || 0; rpdData[`RPD_${RPD_MONTHS[index]}`] = value; totalRpd += value; }); try { await db.collection('ajuan').doc(ajuanId).update(rpdData); await logHistory(ajuanId, "RPD Disimpan", `Total RPD yang disimpan: Rp ${totalRpd.toLocaleString('id-ID')}.`); await logActivity('Save RPD', `Menyimpan RPD untuk ajuan ID ${ajuanId} (${tipe}). Total: Rp ${totalRpd.toLocaleString('id-ID')}.`); showToast(`RPD untuk ${ajuanId.substring(0,6)}.. disimpan.`); if (tipe === 'Awal') refreshTable('RPD', 'Awal'); else refreshTable('RPD', `Perubahan ${STATE.globalSettings.Tahap_Perubahan_Aktif || 1}`); } catch (error) { showToast(`Gagal menyimpan RPD: ${error.message}`, 'danger'); } finally { showLoader(false); } };

  function renderRealisasiTable(data, tipe) { const container = document.getElementById(`tableRealisasi${tipe}`); if (data.length === 0) { container.innerHTML = '<div class="text-center text-muted p-5">Tidak ada ajuan diterima.</div>'; return; } const isDirektorat = STATE.role === 'direktorat'; const readOnlyAttr = isDirektorat ? 'readonly' : ''; const disabledBtnClass = isDirektorat ? 'disabled' : ''; let tableHeader = `<tr class="table-light"><th rowspan="2" class="align-middle">ID</th><th rowspan="2" class="align-middle">Rincian</th><th rowspan="2" class="align-middle text-end">Total RPD</th><th colspan="12" class="text-center">Realisasi Penarikan Dana per Bulan (Rp)</th><th rowspan="2" class="align-middle text-end">Total Realisasi</th><th rowspan="2" class="align-middle text-center">Aksi</th></tr><tr class="table-light">${RPD_MONTHS.map(m => `<th class="text-center" style="min-width: 110px;">${m}</th>`).join('')}</tr>`; const tableRows = data.map(r => { const ajuanId = r.ID_Ajuan; let totalRealisasi = 0; let totalRPD = 0; const realisasiInputs = RPD_MONTHS.map(month => { const value = Number(r[`Realisasi_${month}`] || 0); totalRealisasi += value; totalRPD += Number(r[`RPD_${month}`] || 0); return `<td><input type="number" class="form-control form-control-sm realisasi-input" value="${value}" oninput="window.updateRealisasiRowSummary('${ajuanId}', '${tipe}')" min="0" ${readOnlyAttr}></td>`; }).join(''); return `<tr id="realisasi-row-${tipe}-${ajuanId}"><td><span class="badge bg-secondary-subtle text-secondary-emphasis fw-normal">${ajuanId.substring(0,6)}..</span></td><td><strong>${escapeHtml(r.Nama_Ajuan)}</strong></td><td class="text-end fw-bold">${totalRPD.toLocaleString('id-ID')}</td>${realisasiInputs}<td class="text-end fw-bold realisasi-total">${totalRealisasi.toLocaleString('id-ID')}</td><td class="text-center"><button class="btn btn-sm btn-primary ${disabledBtnClass}" onclick="window.saveRealisasi('${ajuanId}', '${tipe}')" title="Simpan Realisasi"><i class="bi bi-save"></i></button></td></tr>`; }).join(''); container.innerHTML = `<table class="table table-bordered table-sm small"><thead>${tableHeader}</thead><tbody>${tableRows}</tbody></table>`; }
  function renderRealisasiSummary(data, tipe) { const container = document.getElementById(`realisasi-summary-area-${tipe.toLowerCase()}`); const rpdPerBulan = Array(12).fill(0); const realisasiPerBulan = Array(12).fill(0); data.forEach(ajuan => { RPD_MONTHS.forEach((month, index) => { rpdPerBulan[index] += Number(ajuan[`RPD_${month}`]) || 0; realisasiPerBulan[index] += Number(ajuan[`Realisasi_${month}`]) || 0; }); }); const totalRPD = rpdPerBulan.reduce((a, b) => a + b, 0); const totalRealisasi = realisasiPerBulan.reduce((a, b) => a + b, 0); const rpdTriwulan = calculateQuarterlySummary(rpdPerBulan, totalRPD); const realisasiTriwulan = calculateQuarterlySummary(realisasiPerBulan, totalRealisasi); let summaryHtml = `<div class="card d-print-none"><div class="card-header fw-bold">Ringkasan Realisasi Anggaran ${tipe}</div><div class="card-body"><div class="row g-4"><div class="col-lg-6"><h6 class="text-center small text-muted">Realisasi per Bulan</h6><table class="table table-sm table-striped small"><thead class="table-light"><tr><th>Bulan</th><th class="text-end">RPD</th><th class="text-end">Realisasi</th><th class="text-center">%</th></tr></thead><tbody>${rpdPerBulan.map((rpd, i) => { const real = realisasiPerBulan[i]; const percent = rpd > 0 ? ((real / rpd) * 100).toFixed(1) : '0.0'; return `<tr><td>${RPD_MONTHS[i]}</td><td class="text-end">${rpd.toLocaleString('id-ID')}</td><td class="text-end">${real.toLocaleString('id-ID')}</td><td class="text-center"><span class="badge ${percent >= 100 ? 'bg-success-subtle text-success-emphasis' : 'bg-warning-subtle text-warning-emphasis'}">${percent}%</span></td></tr>`; }).join('')}<tr class="table-dark"><td><strong>Total</strong></td><td class="text-end"><strong>${totalRPD.toLocaleString('id-ID')}</strong></td><td class="text-end"><strong>${totalRealisasi.toLocaleString('id-ID')}</strong></td><td class="text-center"><strong>${totalRPD > 0 ? ((totalRealisasi/totalRPD)*100).toFixed(1) : '0.0'}%</strong></td></tr></tbody></table></div><div class="col-lg-6"><h6 class="text-center small text-muted">Realisasi per Triwulan</h6><table class="table table-sm table-striped small"><thead class="table-light"><tr><th>Triwulan</th><th class="text-end">RPD</th><th class="text-end">Realisasi</th><th class="text-center">%</th></tr></thead><tbody>${rpdTriwulan.values.map((rpd, i) => { const real = realisasiTriwulan.values[i]; const percent = rpd > 0 ? ((real / rpd) * 100).toFixed(1) : '0.0'; return `<tr><td><strong>Q${i+1}</strong></td><td class="text-end">${rpd.toLocaleString('id-ID')}</td><td class="text-end">${real.toLocaleString('id-ID')}</td><td class="text-center"><span class="badge ${percent >= 100 ? 'bg-success-subtle text-success-emphasis' : 'bg-warning-subtle text-warning-emphasis'}">${percent}%</span></td></tr>`; }).join('')}</tbody></table></div></div></div></div>`; container.innerHTML = summaryHtml; }
  window.updateRealisasiRowSummary = (ajuanId, tipe) => { const row = document.getElementById(`realisasi-row-${tipe}-${ajuanId}`); if (!row) return; let currentSum = 0; row.querySelectorAll('.realisasi-input').forEach(input => currentSum += Number(input.value) || 0); row.querySelector('.realisasi-total').textContent = currentSum.toLocaleString('id-ID'); }
  window.saveRealisasi = async (ajuanId, tipe) => { showLoader(true); const row = document.getElementById(`realisasi-row-${tipe}-${ajuanId}`); const realisasiData = {}; let totalRealisasi = 0; row.querySelectorAll('.realisasi-input').forEach((input, index) => { const value = Number(input.value) || 0; realisasiData[`Realisasi_${RPD_MONTHS[index]}`] = value; totalRealisasi += value; }); try { await db.collection('ajuan').doc(ajuanId).update(realisasiData); await logHistory(ajuanId, "Realisasi Disimpan", `Total Realisasi yang disimpan: Rp ${totalRealisasi.toLocaleString('id-ID')}.`); await logActivity('Save Realisasi', `Menyimpan realisasi untuk ajuan ID ${ajuanId} (${tipe}). Total: Rp ${totalRealisasi.toLocaleString('id-ID')}.`); showToast(`Realisasi untuk ${ajuanId.substring(0,6)}.. disimpan.`); if (tipe === 'Awal') refreshTable('Realisasi', 'Awal'); else refreshTable('Realisasi', `Perubahan ${STATE.globalSettings.Tahap_Perubahan_Aktif || 1}`); } catch (error) { showToast(`Gagal menyimpan Realisasi: ${error.message}`, 'danger'); } finally { showLoader(false); } };

  ['Awal', 'Perubahan'].forEach(tipe => {
      const isPerubahan = tipe === 'Perubahan';
      const tipeLower = tipe.toLowerCase();
      
      document.querySelector(`[data-bs-target="#tab-rpd-${tipeLower}"]`).addEventListener('shown.bs.tab', () => {
          const tipeQuery = isPerubahan ? `Perubahan ${STATE.globalSettings.Tahap_Perubahan_Aktif || 1}` : 'Awal';
          refreshTable('RPD', tipeQuery);
      });
      document.getElementById(`btn-refresh-rpd-${tipeLower}`).addEventListener('click', () => {
          const tipeQuery = isPerubahan ? `Perubahan ${STATE.globalSettings.Tahap_Perubahan_Aktif || 1}` : 'Awal';
          refreshTable('RPD', tipeQuery);
      });
      document.getElementById(`filterProdiRPD${tipe}`).addEventListener('change', () => {
          const tipeQuery = isPerubahan ? `Perubahan ${STATE.globalSettings.Tahap_Perubahan_Aktif || 1}` : 'Awal';
          refreshTable('RPD', tipeQuery);
      });

      document.querySelector(`[data-bs-target="#tab-realisasi-${tipeLower}"]`).addEventListener('shown.bs.tab', () => {
          const tipeQuery = isPerubahan ? `Perubahan ${STATE.globalSettings.Tahap_Perubahan_Aktif || 1}` : 'Awal';
          refreshTable('Realisasi', tipeQuery);
      });
      document.getElementById(`btn-refresh-realisasi-${tipeLower}`).addEventListener('click', () => {
          const tipeQuery = isPerubahan ? `Perubahan ${STATE.globalSettings.Tahap_Perubahan_Aktif || 1}` : 'Awal';
          refreshTable('Realisasi', tipeQuery);
      });
      document.getElementById(`filterProdiRealisasi${tipe}`).addEventListener('change', () => {
          const tipeQuery = isPerubahan ? `Perubahan ${STATE.globalSettings.Tahap_Perubahan_Aktif || 1}` : 'Awal';
          refreshTable('Realisasi', tipeQuery);
      });
  });

  function setupBeritaAcaraTab() {
    const select = document.getElementById('filterTipeBA');
    select.innerHTML = '<option value="Awal">Ajuan Awal</option>';
    if (STATE.globalSettings.Status_Ajuan_Perubahan === 'Dibuka') {
        const totalTahap = STATE.globalSettings.Jumlah_Tahap_Perubahan || 1;
        for (let i = 1; i <= totalTahap; i++) {
            const tahapStr = `Perubahan ${i}`;
            select.add(new Option(`Ajuan ${tahapStr}`, tahapStr));
        }
    }
  }

  async function renderBeritaAcara() {
    const container = document.getElementById('berita-acara-content');
    container.innerHTML = `<div class="text-center text-muted p-5">Memuat data Berita Acara...</div>`;
    showLoader(true);
    
    try {
        const tipeAjuan = document.getElementById('filterTipeBA').value;
        const prodiFilter = document.getElementById('filterProdiBA').value;

        // --- START OF MODIFICATION ---
        // Menambahkan logika untuk menangani filter "Semua Prodi" bagi Direktorat
        if (STATE.role === 'direktorat' && !prodiFilter) {
            let allProdisHtml = '';
            let baGeneratedCount = 0;
            const prodiList = STATE.allProdi.filter(p => p.Role === 'prodi').sort((a,b) => a.ID_Prodi.localeCompare(b.ID_Prodi));

            for (const prodiData of prodiList) {
                const query = db.collection('ajuan')
                  .where('Tipe_Ajuan', '==', tipeAjuan)
                  .where('ID_Prodi', '==', prodiData.ID_Prodi)
                  .where('Status', '==', 'Diterima');

                const snapshot = await query.get();
                const data = snapshot.docs.map(doc => doc.data());

                if (data.length > 0) {
                    baGeneratedCount++;
                    if (allProdisHtml !== '') {
                        // Menambahkan pemisah halaman untuk PDF dan cetak
                        allProdisHtml += '<div style="page-break-after: always;"></div>';
                    }

                    const prodiBaSettings = prodiData.beritaAcaraSettings || {};
                    const ttdKiriJabatan = prodiBaSettings.TTD_Jabatan || STATE.beritaAcaraSettings.TTD_Kiri_Jabatan || 'Ketua Jurusan/Program Studi';
                    const ttdKiriNama = prodiBaSettings.TTD_Nama || STATE.beritaAcaraSettings.TTD_Kiri_Nama || '(..................................................)';
                    const ttdKananJabatan = STATE.beritaAcaraSettings.TTD_Kanan_Jabatan || 'Wakil Direktur II';
                    const ttdKananNama = STATE.beritaAcaraSettings.TTD_Kanan_Nama || '(..................................................)';
                    const today = new Date();
                    const tglCetak = today.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                    const tahunAnggaran = today.getFullYear();
                    
                    let grandTotal = 0;
                    const tableRowsHtml = data
                      .sort((a,b) => (a.Grub_Belanja_Utama || '').localeCompare(b.Grub_Belanja_Utama || ''))
                      .map((r, index) => {
                          grandTotal += Number(r.Total) || 0;
                          return `<tr><td style="text-align: center;">${index + 1}</td><td>${escapeHtml(r.Nama_Ajuan)}</td><td style="text-align: center;">${Number(r.Jumlah).toLocaleString('id-ID')} ${escapeHtml(r.Satuan)}</td><td style="text-align: right;">${Number(r.Harga_Satuan).toLocaleString('id-ID')}</td><td style="text-align: right;">${Number(r.Total).toLocaleString('id-ID')}</td></tr>`;
                      }).join('');

                    allProdisHtml += `
                        <div class="ba-kop">
                            <table><tr><td style="width: 100px; text-align: right; border:none; padding-right: 15px;"><img src="https://si-pandai.netlify.app/LOGO%20POLTEKKES%20KEMENKES%20KUPANG.png" alt="Logo"></td><td style="text-align: left; border:none;"><div class="ba-kop-text"><h5>KEMENTERIAN KESEHATAN REPUBLIK INDONESIA</h5><h5>BADAN PENGEMBANGAN DAN PEMBERDAYAAN SUMBER DAYA MANUSIA KESEHATAN</h5><h5 style="font-size: 1.3em;">POLITEKNIK KESEHATAN KEMENKES KUPANG</h5><p style="font-weight: normal; font-size: 0.9em;">Jalan Piet A. Tallo, Liliba - Kupang, Nusa Tenggara Timur</p></div></td></tr></table>
                        </div>
                        <div class="ba-judul">
                            <h5>BERITA ACARA</h5><h5>PENETAPAN USULAN KEGIATAN DAN ANGGARAN</h5><p>Nomor: .......................................</p>
                        </div>
                        <div class="ba-paragraf">
                            Pada hari ini, tanggal ${tglCetak}, telah dilaksanakan pembahasan dan penetapan usulan kegiatan dan anggaran untuk <strong>${escapeHtml(prodiData.Nama_Prodi)}</strong> Tahun Anggaran ${tahunAnggaran} (${tipeAjuan}). Berdasarkan hasil pembahasan, dengan ini ditetapkan rincian kegiatan dan anggaran yang diterima adalah sebagai berikut:
                        </div>
                        <table class="ba-table">
                            <thead><tr><th style="width: 5%;">No</th><th style="width: 45%;">Uraian/Rincian Kegiatan</th><th style="width: 15%;">Volume</th><th style="width: 15%;">Harga Satuan (Rp)</th><th style="width: 20%;">Jumlah Biaya (Rp)</th></tr></thead>
                            <tbody>${tableRowsHtml}<tr><td colspan="4" style="text-align: right; font-weight: bold;">TOTAL ANGGARAN DITERIMA</td><td style="text-align: right; font-weight: bold;">${grandTotal.toLocaleString('id-ID')}</td></tr></tbody>
                        </table>
                        <div class="ba-paragraf">Demikian Berita Acara ini dibuat untuk dapat dipergunakan sebagaimana mestinya.</div>
                        <div class="ba-signatures">
                            <table><tr><td><p>Kupang, ${tglCetak}</p><p><strong>${escapeHtml(ttdKiriJabatan)}</strong></p><br><br><br><br><p><strong><u>${escapeHtml(ttdKiriNama)}</u></strong></p></td><td><p><br></p><p><strong>${escapeHtml(ttdKananJabatan)}</strong></p><br><br><br><br><p><strong><u>${escapeHtml(ttdKananNama)}</u></strong></p></td></tr></table>
                        </div>
                    `;
                }
            }
            if (baGeneratedCount === 0) {
                 throw new Error(`Tidak ada data ajuan "Diterima" yang ditemukan untuk prodi manapun pada tahap ${tipeAjuan}.`);
            }
            container.innerHTML = allProdisHtml;

        } else {
        // --- END OF MODIFICATION ---

            // LOGIKA LAMA (UNTUK SATU PRODI) TETAP DI SINI
            let prodiId = STATE.role === 'prodi' ? STATE.id : prodiFilter;
            if (STATE.role === 'direktorat' && !prodiId) {
                throw new Error('Silakan pilih Prodi untuk mencetak Berita Acara.');
            }

            const prodiData = (STATE.role === 'direktorat') 
                ? STATE.allProdi.find(p => p.ID_Prodi === prodiId) || { Nama_Prodi: prodiId }
                : STATE.currentUserData;
            
            let query = db.collection('ajuan')
              .where('Tipe_Ajuan', '==', tipeAjuan)
              .where('ID_Prodi', '==', prodiId)
              .where('Status', '==', 'Diterima');

            const snapshot = await query.get();
            const data = snapshot.docs.map(doc => doc.data());
            if (data.length === 0) {
                throw new Error(`Tidak ada ajuan berstatus "Diterima" untuk ${prodiId} pada tahap ${tipeAjuan}.`);
            }

            const prodiBaSettings = prodiData.beritaAcaraSettings || {};
            const ttdKiriJabatan = prodiBaSettings.TTD_Jabatan || STATE.beritaAcaraSettings.TTD_Kiri_Jabatan || 'Ketua Jurusan/Program Studi';
            const ttdKiriNama = prodiBaSettings.TTD_Nama || STATE.beritaAcaraSettings.TTD_Kiri_Nama || '(..................................................)';
            const ttdKananJabatan = STATE.beritaAcaraSettings.TTD_Kanan_Jabatan || 'Wakil Direktur II';
            const ttdKananNama = STATE.beritaAcaraSettings.TTD_Kanan_Nama || '(..................................................)';
            
            const today = new Date();
            const tglCetak = today.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            const tahunAnggaran = today.getFullYear();

            const groupedData = data.reduce((acc, row) => {
                const grubKey = row.Grub_Belanja_Utama || 'Lain-lain';
                if (!acc[grubKey]) acc[grubKey] = [];
                acc[grubKey].push(row);
                return acc;
            }, {});
            const sortedGrubKeys = Object.keys(groupedData).sort();
            let grandTotal = 0;
            
            let tableRowsHtml = '';
            let no = 1;
            sortedGrubKeys.forEach(grubKey => {
                tableRowsHtml += `<tr><td colspan="5" style="background-color: #f2f2f2;"><strong>${escapeHtml(grubKey)}</strong></td></tr>`;
                groupedData[grubKey].forEach(r => {
                    grandTotal += Number(r.Total) || 0;
                    tableRowsHtml += `<tr><td style="text-align: center;">${no++}</td><td>${escapeHtml(r.Nama_Ajuan)}</td><td style="text-align: center;">${Number(r.Jumlah).toLocaleString('id-ID')} ${escapeHtml(r.Satuan)}</td><td style="text-align: right;">${Number(r.Harga_Satuan).toLocaleString('id-ID')}</td><td style="text-align: right;">${Number(r.Total).toLocaleString('id-ID')}</td></tr>`;
                });
            });

            const contentHtml = `
                <div class="ba-kop">
                    <table><tr><td style="width: 100px; text-align: right; border:none; padding-right: 15px;"><img src="https://si-pandai.netlify.app/LOGO%20POLTEKKES%20KEMENKES%20KUPANG.png" alt="Logo"></td><td style="text-align: left; border:none;"><div class="ba-kop-text"><h5>KEMENTERIAN KESEHATAN REPUBLIK INDONESIA</h5><h5>BADAN PENGEMBANGAN DAN PEMBERDAYAAN SUMBER DAYA MANUSIA KESEHATAN</h5><h5 style="font-size: 1.3em;">POLITEKNIK KESEHATAN KEMENKES KUPANG</h5><p style="font-weight: normal; font-size: 0.9em;">Jalan Piet A. Tallo, Liliba - Kupang, Nusa Tenggara Timur</p></div></td></tr></table>
                </div>
                <div class="ba-judul">
                    <h5>BERITA ACARA</h5><h5>PENETAPAN USULAN KEGIATAN DAN ANGGARAN</h5><p>Nomor: .......................................</p>
                </div>
                <div class="ba-paragraf">
                    Pada hari ini, tanggal ${tglCetak}, telah dilaksanakan pembahasan dan penetapan usulan kegiatan dan anggaran untuk <strong>${escapeHtml(prodiData.Nama_Prodi)}</strong> Tahun Anggaran ${tahunAnggaran} (${tipeAjuan}). Berdasarkan hasil pembahasan, dengan ini ditetapkan rincian kegiatan dan anggaran yang diterima adalah sebagai berikut:
                </div>
                <table class="ba-table">
                    <thead><tr><th style="width: 5%;">No</th><th style="width: 45%;">Uraian/Rincian Kegiatan</th><th style="width: 15%;">Volume</th><th style="width: 15%;">Harga Satuan (Rp)</th><th style="width: 20%;">Jumlah Biaya (Rp)</th></tr></thead>
                    <tbody>${tableRowsHtml}<tr><td colspan="4" style="text-align: right; font-weight: bold;">TOTAL ANGGARAN DITERIMA</td><td style="text-align: right; font-weight: bold;">${grandTotal.toLocaleString('id-ID')}</td></tr></tbody>
                </table>
                <div class="ba-paragraf">Demikian Berita Acara ini dibuat untuk dapat dipergunakan sebagaimana mestinya.</div>
                <div class="ba-signatures">
                    <table><tr><td><p>Kupang, ${tglCetak}</p><p><strong>${escapeHtml(ttdKiriJabatan)}</strong></p><br><br><br><br><p><strong><u>${escapeHtml(ttdKiriNama)}</u></strong></p></td><td><p><br></p><p><strong>${escapeHtml(ttdKananJabatan)}</strong></p><br><br><br><br><p><strong><u>${escapeHtml(ttdKananNama)}</u></strong></p></td></tr></table>
                </div>
            `;
            container.innerHTML = contentHtml;
        } // Penutup dari `else`
    } catch (error) {
        container.innerHTML = `<div class="text-center text-danger p-5"><strong>Gagal membuat pratinjau:</strong> ${error.message}</div>`;
        showToast(error.message, 'danger');
    } finally {
        showLoader(false);
    }
  }

  document.querySelector('[data-bs-target="#tab-berita-acara"]').addEventListener('shown.bs.tab', setupBeritaAcaraTab);
  document.getElementById('btn-preview-ba').addEventListener('click', renderBeritaAcara);
  document.getElementById('btn-download-pdf-ba').addEventListener('click', () => {
    const contentElement = document.getElementById('berita-acara-content');
    if (contentElement.querySelector('.ba-kop')) {
        showLoader(true);
        showToast('Mempersiapkan file PDF... Ini mungkin memerlukan beberapa saat.', 'info');
        
        const prodiSelect = document.getElementById('filterProdiBA');
        const prodiText = prodiSelect.style.display !== 'none' && prodiSelect.value ? prodiSelect.options[prodiSelect.selectedIndex].text : STATE.id;
        const tipeAjuan = document.getElementById('filterTipeBA').value;
        const cleanProdiName = prodiText.split(' - ')[0].replace(/[^a-z0-9]/gi, '_');
        const fileName = `Berita_Acara_${tipeAjuan}_${cleanProdiName}.pdf`;

        const paperSize = document.getElementById('ba-paper-size').value;
        const orientation = document.getElementById('ba-orientation').value;

        const opt = {
          margin:       [15, 10, 15, 10],
          filename:     fileName,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
          jsPDF:        { unit: 'mm', format: paperSize, orientation: orientation }
        };
        
        html2pdf().from(contentElement).set(opt).save().then(() => {
            showLoader(false);
        }).catch(err => {
            showLoader(false);
            showToast('Gagal membuat PDF. Silakan coba lagi.', 'danger');
            console.error('PDF generation error:', err);
        });

    } else {
        showToast('Tampilkan pratinjau terlebih dahulu sebelum mengunduh PDF.', 'warning');
    }
  });


  document.querySelector('[data-bs-target="#tab-pengaturan-akun"]').addEventListener('shown.bs.tab', async () => {
    if (STATE.role === 'prodi') {
      const userDoc = await db.collection('users').doc(STATE.uid).get();
      if(userDoc.exists) {
        const userData = userDoc.data();
        const baSettings = userData.beritaAcaraSettings || {};
        document.getElementById('prodi_ba_jabatan').value = baSettings.TTD_Jabatan || '';
        document.getElementById('prodi_ba_nama').value = baSettings.TTD_Nama || '';
      }
    }
  });

  document.getElementById('btn-save-prodi-ba-settings').addEventListener('click', async () => {
    if (STATE.role !== 'prodi') return;
    const settings = {
        TTD_Jabatan: document.getElementById('prodi_ba_jabatan').value.trim(),
        TTD_Nama: document.getElementById('prodi_ba_nama').value.trim(),
    };
    showLoader(true);
    try {
        await db.collection('users').doc(STATE.uid).update({ beritaAcaraSettings: settings });
        STATE.currentUserData.beritaAcaraSettings = settings;
        showToast("Pengaturan tanda tangan berhasil disimpan.", "success");
    } catch (error) {
        showToast(`Gagal menyimpan: ${error.message}`, "danger");
    } finally {
        showLoader(false);
    }
  });
  
  window.fillEditProdi = (uid, id, nama, email, role, baJabatan, baNama) => { 
    document.getElementById('mp_UID').value = uid; 
    document.getElementById('mp_ID').value = id; 
    document.getElementById('mp_Nama').value = nama; 
    document.getElementById('mp_Email').value = email; 
    document.getElementById('mp_Role').value = role; 
    
    const baFieldsWrapper = document.getElementById('mp_ba_fields_wrapper');
    if (role === 'prodi') {
      baFieldsWrapper.style.display = 'block';
      document.getElementById('mp_BA_Jabatan').value = baJabatan || '';
      document.getElementById('mp_BA_Nama').value = baNama || '';
    } else {
      baFieldsWrapper.style.display = 'none';
      document.getElementById('mp_BA_Jabatan').value = '';
      document.getElementById('mp_BA_Nama').value = '';
    }
  };

  document.getElementById('btn-save-prodi').addEventListener('click', async () => { 
    const uid = document.getElementById('mp_UID').value; 
    if (!uid) { showToast('Silakan pilih pengguna dari daftar untuk diedit.', 'warning'); return; } 
    const role = document.getElementById('mp_Role').value;
    const dataToUpdate = { 
      Nama_Prodi: document.getElementById('mp_Nama').value.trim(), 
      Role: role 
    }; 
    if (!dataToUpdate.Nama_Prodi) { showToast('Nama Prodi / Direktorat tidak boleh kosong.', 'warning'); return; } 
    
    if (role === 'prodi') {
      dataToUpdate.beritaAcaraSettings = {
        TTD_Jabatan: document.getElementById('mp_BA_Jabatan').value.trim(),
        TTD_Nama: document.getElementById('mp_BA_Nama').value.trim()
      };
    }

    showLoader(true); 
    try { 
      await db.collection('users').doc(uid).update(dataToUpdate); 
      showToast('Data pengguna berhasil diperbarui.'); 
      clearUserForm(); 
      refreshProdiData(); 
    } catch (error) { showToast(`Gagal memperbarui pengguna: ${error.message}`, 'danger'); } finally { showLoader(false); } 
  });
  
  async function loadBeritaAcaraSettings() {
    try {
        const doc = await db.collection('appConfig').doc('beritaAcaraSettings').get();
        if (doc.exists) {
            STATE.beritaAcaraSettings = doc.data();
            if (STATE.role === 'direktorat') {
                document.getElementById('ba_ttd_kiri_jabatan').value = STATE.beritaAcaraSettings.TTD_Kiri_Jabatan || '';
                document.getElementById('ba_ttd_kiri_nama').value = STATE.beritaAcaraSettings.TTD_Kiri_Nama || '';
                document.getElementById('ba_ttd_kanan_jabatan').value = STATE.beritaAcaraSettings.TTD_Kanan_Jabatan || '';
                document.getElementById('ba_ttd_kanan_nama').value = STATE.beritaAcaraSettings.TTD_Kanan_Nama || '';
            }
        }
    } catch (error) {
        console.error("Gagal memuat pengaturan Berita Acara:", error);
    }
  }

  async function saveBeritaAcaraSettings() {
    if (STATE.role !== 'direktorat') return;
    const settings = {
        TTD_Kiri_Jabatan: document.getElementById('ba_ttd_kiri_jabatan').value.trim(),
        TTD_Kiri_Nama: document.getElementById('ba_ttd_kiri_nama').value.trim(),
        TTD_Kanan_Jabatan: document.getElementById('ba_ttd_kanan_jabatan').value.trim(),
        TTD_Kanan_Nama: document.getElementById('ba_ttd_kanan_nama').value.trim()
    };
    showLoader(true);
    try {
        await db.collection('appConfig').doc('beritaAcaraSettings').set(settings, { merge: true });
        STATE.beritaAcaraSettings = settings;
        showToast("Pengaturan default Berita Acara berhasil disimpan.", "success");
    } catch (error) {
        showToast(`Gagal menyimpan pengaturan: ${error.message}`, "danger");
    } finally {
        showLoader(false);
    }
  }
  document.getElementById('btn-save-ba-settings').addEventListener('click', saveBeritaAcaraSettings);
  
  document.getElementById('btn-refresh-dashboard').addEventListener('click', loadDashboardData); document.querySelector('[data-bs-target="#tab-dashboard"]').addEventListener('shown.bs.tab', loadDashboardData); ['filterTahunDashboard', 'filterTipeDashboard'].forEach(id => document.getElementById(id).addEventListener('change', () => processDataForDashboard()));
  async function loadDashboardData() { showLoader(true); try { let query = db.collection('ajuan'); if (STATE.role === 'prodi') { query = query.where('ID_Prodi', '==', STATE.id); } const snapshot = await query.get(); STATE.allDashboardData = snapshot.docs.map(doc => { const data = doc.data(); if (data.Timestamp && data.Timestamp.toDate) data.Timestamp = data.Timestamp.toDate(); return { ID_Ajuan: doc.id, ...data }; }); populateDashboardFilters(STATE.allDashboardData); processDataForDashboard(); await displayGlobalAnnouncement(); } catch(error) { showToast('Gagal memuat data dashboard.', 'danger'); console.error("Dashboard error:", error); } finally { showLoader(false); } }
  function populateDashboardFilters(data) { const yearSelect = document.getElementById('filterTahunDashboard'); const years = [...new Set(data.map(d => { if(d.Timestamp) return new Date(d.Timestamp).getFullYear(); return null; }))].filter(Boolean).sort((a, b) => b - a); yearSelect.innerHTML = '<option value="">Semua Tahun</option>'; years.forEach(year => { if (!isNaN(year)) yearSelect.innerHTML += `<option value="${year}">${year}</option>`; }); }
  function setupChart(canvasId, type, data, options) { const canvas = document.getElementById(canvasId); if (!canvas) return; if (CHARTS[canvasId]) CHARTS[canvasId].destroy(); CHARTS[canvasId] = new Chart(canvas.getContext('2d'), { type, data, options }); }
  function calculateQuarterlySummary(monthlyData, total) { const quarters = [0, 0, 0, 0]; for (let i = 0; i < 12; i++) { if (i < 3) quarters[0] += monthlyData[i]; else if (i < 6) quarters[1] += monthlyData[i]; else if (i < 9) quarters[2] += monthlyData[i]; else quarters[3] += monthlyData[i]; } return { values: quarters, percentages: quarters.map(q => total > 0 ? ((q / total) * 100).toFixed(1) + '%' : '0.0%') }; }
  
  // START: Fungsi baru untuk rekap semester
  function calculateSemesterSummary(monthlyData, total) {
    const semesters = [0, 0];
    for (let i = 0; i < 12; i++) {
        if (i < 6) semesters[0] += monthlyData[i]; // Semester 1: Jan - Jun
        else semesters[1] += monthlyData[i];      // Semester 2: Jul - Dec
    }
    return {
        values: semesters,
        percentages: semesters.map(s => total > 0 ? ((s / total) * 100).toFixed(1) + '%' : '0.0%')
    };
  }
  // END: Fungsi baru untuk rekap semester
  
  function updateDashboardDeadlineInfo() { const deadlineInfoEl = document.getElementById('dashboard-deadline-info'); const deadline = STATE.globalSettings.Batas_Tanggal_Pengajuan; if (deadline && deadline.toDate) { const deadlineDate = deadline.toDate(); const today = new Date(); today.setHours(23, 59, 59, 999); let alertClass = 'alert-info'; let message = `Batas waktu pengajuan adalah <strong>${deadlineDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>.`; if (today > deadlineDate) { alertClass = 'alert-danger'; message = `Periode pengajuan telah berakhir pada <strong>${deadlineDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}</strong>.`; } deadlineInfoEl.innerHTML = `<i class="bi bi-info-circle-fill me-2"></i> ${message}`; deadlineInfoEl.className = `alert ${alertClass} text-center small p-2`; deadlineInfoEl.style.display = 'block'; } else { deadlineInfoEl.innerHTML = `<i class="bi bi-info-circle-fill me-2"></i> Batas waktu pengajuan belum ditentukan oleh direktorat.`; deadlineInfoEl.className = 'alert alert-warning text-center small p-2'; deadlineInfoEl.style.display = 'block'; } }
  function processDataForDashboard() { 
      updateDashboardDeadlineInfo(); 
      const yearSelect = document.getElementById('filterTahunDashboard');
      const tipeSelect = document.getElementById('filterTipeDashboard');
      const selectedYear = yearSelect.value; 
      const selectedTipe = tipeSelect.value; 

      const filterInfoEl = document.getElementById('dashboard-filter-info');
      const yearText = selectedYear ? yearSelect.options[yearSelect.selectedIndex].text : "Semua Tahun";
      const tipeText = selectedTipe ? tipeSelect.options[tipeSelect.selectedIndex].text : "Semua Tipe Ajuan";
      filterInfoEl.innerHTML = `Menampilkan data untuk: <strong>${yearText}</strong> & <strong>${tipeText}</strong>`;
      filterInfoEl.style.display = 'block';

      let filteredData = STATE.allDashboardData.filter(d => { 
          const date = d.Timestamp ? new Date(d.Timestamp) : null; 
          if (!date) return false; 
          const yearMatch = !selectedYear || date.getFullYear() == selectedYear; 
          const tipeMatch = !selectedTipe || (selectedTipe === 'Awal' && (d.Tipe_Ajuan || 'Awal') === 'Awal') || (selectedTipe === 'Perubahan' && (d.Tipe_Ajuan || '').startsWith('Perubahan'));
          return yearMatch && tipeMatch; 
      }); 
      renderDashboardSummary(filteredData); 
      renderPaguComparison(filteredData); // CALL NEW COMPARISON FUNCTION
      if (STATE.role === 'direktorat') { 
          renderDirektoratDashboard(filteredData); 
      } 
  }

  function renderPaguComparison(data) {
    const comparisonContainer = document.getElementById('dashboard-pagu-comparison');
    
    // 1. Calculate Total Accepted Budget by Stage (Tipe_Ajuan)
    const acceptedTotalsByStage = {};
    const allStages = new Set(['Awal']);
    
    data.forEach(ajuan => {
        if (ajuan.Status === 'Diterima') {
            const stage = ajuan.Tipe_Ajuan || 'Awal';
            allStages.add(stage);
            acceptedTotalsByStage[stage] = (acceptedTotalsByStage[stage] || 0) + (Number(ajuan.Total) || 0);
        }
    });

    const sortedStages = Array.from(allStages).sort((a, b) => {
        if (a === 'Awal') return -1;
        if (b === 'Awal') return 1;
        // Sort Perubahan stages numerically
        const numA = parseInt(a.replace('Perubahan ', ''));
        const numB = parseInt(b.replace('Perubahan ', ''));
        return numA - numB;
    });

    if (sortedStages.length <= 1) {
        comparisonContainer.innerHTML = '<p class="text-center text-muted small">Hanya ada satu tahap ajuan yang diterima, tidak ada perbandingan anggaran antar tahap.</p>';
        return;
    }

    let comparisonHtml = `<table class="table table-sm table-striped small">
        <thead class="table-light">
            <tr>
                <th>Tahap Anggaran</th>
                <th class="text-end">Total Diterima (Rp)</th>
                <th class="text-end">Selisih dari Tahap Sebelumnya (Rp)</th>
            </tr>
        </thead>
        <tbody>`;

    let previousTotal = 0;
    let initialTotal = acceptedTotalsByStage['Awal'] || 0;
    
    sortedStages.forEach((stage, index) => {
        const currentTotal = acceptedTotalsByStage[stage] || 0;
        let selisih = 0;
        let selisihText = 'N/A';
        let selisihClass = '';
        
        if (index > 0) {
            selisih = currentTotal - previousTotal;
            selisihText = selisih > 0 ? `+${selisih.toLocaleString('id-ID')}` : selisih.toLocaleString('id-ID');
            selisihClass = selisih > 0 ? 'text-success fw-bold' : (selisih < 0 ? 'text-danger fw-bold' : 'text-muted');
        } else {
            // This is 'Awal' stage
            selisihText = 'Anggaran Awal';
        }
        
        comparisonHtml += `<tr>
            <td><strong>${escapeHtml(stage)}</strong></td>
            <td class="text-end fw-bold">${currentTotal.toLocaleString('id-ID')}</td>
            <td class="text-end ${selisihClass}">${selisihText}</td>
        </tr>`;

        previousTotal = currentTotal;
    });

    // Calculate overall difference (Awal vs Final Stage)
    const finalStage = sortedStages[sortedStages.length - 1];
    const finalTotal = acceptedTotalsByStage[finalStage] || 0;
    const overallSelisih = finalTotal - initialTotal;
    const overallSelisihClass = overallSelisih > 0 ? 'text-success' : (overallSelisih < 0 ? 'text-danger' : 'text-muted');
    
    comparisonHtml += `</tbody></table>`;
    
    comparisonHtml += `<div class="alert alert-light border text-center mt-3 p-3">
        <strong>Selisih Anggaran Keseluruhan (Final vs Awal):</strong> 
        <span class="fs-5 ${overallSelisihClass}">Rp ${overallSelisih.toLocaleString('id-ID')}</span>
        <span class="small text-muted d-block">(${finalStage} diterima - Awal diterima)</span>
    </div>`;
    
    comparisonContainer.innerHTML = comparisonHtml;
  }
  
  function renderDashboardSummary(data, containerPrefix = 'dashboard-', chartPrefix = 'chart') { 
    let totalDiajukanOverall = 0;
    let totalDiterimaOverall = 0;
    let totalDiajukanAwal = 0;
    let totalDiterimaAwal = 0;
    let totalDiajukanPerubahan = 0;
    let totalDiterimaPerubahan = 0;
    
    let statusCounts = { 'Menunggu Review': 0, 'Diterima': 0, 'Ditolak': 0, 'Revisi': 0 }; 
    const rpdPerBulan = Array(12).fill(0); 
    const realisasiPerBulan = Array(12).fill(0); 
    
    data.forEach(ajuan => { 
        const total = Number(ajuan.Total) || 0;
        const isAwal = ajuan.Tipe_Ajuan === 'Awal' || !ajuan.Tipe_Ajuan;
        
        totalDiajukanOverall += total;
        
        if (isAwal) {
            totalDiajukanAwal += total;
        } else {
            totalDiajukanPerubahan += total;
        }

        if (ajuan.Status) { 
            statusCounts[ajuan.Status] = (statusCounts[ajuan.Status] || 0) + 1; 
        } 
        
        if (ajuan.Status === 'Diterima') { 
            totalDiterimaOverall += total;
            if (isAwal) {
                totalDiterimaAwal += total;
            } else {
                totalDiterimaPerubahan += total;
            }
            
            // RPD and Realisasi calculations only apply to Diterima items
            RPD_MONTHS.forEach((month, index) => { 
                rpdPerBulan[index] += Number(ajuan[`RPD_${month}`]) || 0; 
                realisasiPerBulan[index] += Number(ajuan[`Realisasi_${month}`]) || 0; 
            }); 
        } 
    }); 
    
    const totalRPD = rpdPerBulan.reduce((a, b) => a + b, 0); 
    const totalRealisasi = realisasiPerBulan.reduce((a, b) => a + b, 0); 
    
    // Update Diajukan Breakdown Cards
    document.getElementById(`${containerPrefix}total-diajukan-total`).textContent = 'Rp ' + totalDiajukanOverall.toLocaleString('id-ID');
    document.getElementById(`${containerPrefix}total-diajukan-awal`).textContent = 'Rp ' + totalDiajukanAwal.toLocaleString('id-ID');
    document.getElementById(`${containerPrefix}total-diajukan-perubahan`).textContent = 'Rp ' + totalDiajukanPerubahan.toLocaleString('id-ID');
    
    // Update Diterima Breakdown Cards
    document.getElementById(`${containerPrefix}total-diterima-total`).textContent = 'Rp ' + totalDiterimaOverall.toLocaleString('id-ID');
    document.getElementById(`${containerPrefix}total-diterima-awal`).textContent = 'Rp ' + totalDiterimaAwal.toLocaleString('id-ID');
    document.getElementById(`${containerPrefix}total-diterima-perubahan`).textContent = 'Rp ' + totalDiterimaPerubahan.toLocaleString('id-ID');

    document.getElementById(`${containerPrefix}total-rpd`).textContent = 'Rp ' + totalRPD.toLocaleString('id-ID'); 
    document.getElementById(`${containerPrefix}total-realisasi`).textContent = 'Rp ' + totalRealisasi.toLocaleString('id-ID'); 
    
    // Update Status Counts
    document.getElementById(`${containerPrefix}count-menunggu`).textContent = statusCounts['Menunggu Review']; 
    document.getElementById(`${containerPrefix}count-diterima`).textContent = statusCounts['Diterima']; 
    document.getElementById(`${containerPrefix}count-ditolak`).textContent = statusCounts['Ditolak']; 
    document.getElementById(`${containerPrefix}count-revisi`).textContent = statusCounts['Revisi']; 
    
    // Pagu Logic Update
    const paguCard = document.getElementById('dashboard-total-pagu-card'); 
    const paguLabelEl = document.getElementById('dashboard-pagu-label'); 
    paguCard.style.display = 'none'; 
    
    let totalPaguAwal = 0; // Pagu_Anggaran set by Direktorat (Ceiling Awal)
    let totalDiterimaFinal = totalDiterimaOverall; // Total budget approved across all stages (Awal + Perubahan)

    if (STATE.role === 'direktorat') { 
        totalPaguAwal = (STATE.allProdi || []).filter(p => p.Role === 'prodi').reduce((sum, p) => sum + (Number(p.Pagu_Anggaran) || 0), 0); 
        paguLabelEl.textContent = 'TOTAL PAGU PRODI/UNIT (AWAL)'; 
        paguCard.style.display = 'block'; 
    } else if (STATE.role === 'prodi' && STATE.currentUserData) { 
        totalPaguAwal = STATE.currentUserData.Pagu_Anggaran || 0; 
        paguLabelEl.textContent = 'PAGU ANGGARAN SAYA (AWAL)'; 
        paguCard.style.display = 'block'; 
    }
    
    const selectedTipe = document.getElementById('filterTipeDashboard').value;
    let paguHeaderValue;

    if (selectedTipe === 'Awal') {
         // If filtering Awal, the header shows the Awal ceiling
         paguHeaderValue = totalPaguAwal;
         paguLabelEl.textContent = STATE.role === 'direktorat' ? 'TOTAL PAGU PRODI/UNIT (AWAL)' : 'PAGU ANGGARAN SAYA (AWAL)';
    } else if (selectedTipe === 'Perubahan') {
        // If filtering Perubahan, the header shows the accepted Perubahan total
        paguHeaderValue = totalDiterimaPerubahan;
        paguLabelEl.textContent = 'TOTAL DITERIMA TAHAP PERUBAHAN';
    } else { // Semua Tipe
        // If showing all, the most critical number is the initial Pagu constraint
        paguHeaderValue = totalPaguAwal;
        paguLabelEl.textContent = STATE.role === 'direktorat' ? 'TOTAL PAGU PRODI/UNIT (AWAL)' : 'PAGU ANGGARAN SAYA (AWAL)';
    }
    
    // The main header shows the relevant Pagu figure
    document.getElementById('dashboard-total-pagu-total').textContent = 'Rp ' + paguHeaderValue.toLocaleString('id-ID');

    // The breakdown still shows Pagu Awal (the ceiling) and Total Diterima Final (the current budget)
    document.getElementById('dashboard-total-pagu-awal').textContent = 'Rp ' + totalPaguAwal.toLocaleString('id-ID');
    document.getElementById('dashboard-total-pagu-perubahan').textContent = 'Rp ' + totalDiterimaFinal.toLocaleString('id-ID');
    
    setupChart(`${chartPrefix}RPDvsRealisasi`, 'bar', { labels: RPD_MONTHS, datasets: [{ label: 'Realisasi (Rp)', data: realisasiPerBulan, backgroundColor: 'rgba(255, 193, 7, 0.7)' }, { label: 'RPD (Rp)', data: rpdPerBulan, backgroundColor: 'rgba(13, 110, 253, 0.6)' }] }, { responsive: true, scales: { x: { stacked: false }, y: { stacked: false, beginAtZero: true } } }); 
    // START: Perbaikan rekap triwulan dan semester
    if (containerPrefix === 'dashboard-') { 
      const persentaseRealisasi = totalRPD > 0 ? (totalRealisasi / totalRPD) * 100 : 0; 
      document.getElementById('dashboard-persen-realisasi').textContent = persentaseRealisasi.toFixed(1) + '%'; 
      const progressBar = document.getElementById('dashboard-persen-realisasi-bar'); 
      if (progressBar) progressBar.style.width = `${Math.min(persentaseRealisasi, 100)}%`; 
      
      const rpdTriwulan = calculateQuarterlySummary(rpdPerBulan, totalRPD); 
      const realisasiTriwulan = calculateQuarterlySummary(realisasiPerBulan, totalRealisasi); 
      const triwulanContainer = document.getElementById('dashboard-triwulan-summaries'); 
      if (triwulanContainer) { 
        triwulanContainer.innerHTML = `<h6 class="small text-muted">Rencana Penarikan (RPD)</h6><table class="table table-sm table-borderless text-center small"><thead class="table-light"><tr><th>Q</th><th>Total</th><th>%</th></tr></thead><tbody>${rpdTriwulan.values.map((val, i) => `<tr><td><strong>Q${i+1}</strong></td><td>${val.toLocaleString('id-ID')}</td><td><span class="badge bg-primary-subtle text-primary-emphasis">${rpdTriwulan.percentages[i]}</span></td></tr>`).join('')}</tbody></table><h6 class="small text-muted mt-2">Realisasi</h6><table class="table table-sm table-borderless text-center small"><thead class="table-light"><tr><th>Q</th><th>Total</th><th>%</th></tr></thead><tbody>${realisasiTriwulan.values.map((val, i) => `<tr><td><strong>Q${i+1}</strong></td><td>${val.toLocaleString('id-ID')}</td><td><span class="badge bg-success-subtle text-success-emphasis">${realisasiTriwulan.percentages[i]}</span></td></tr>`).join('')}</tbody></table>`; 
      }
      
      const rpdSemester = calculateSemesterSummary(rpdPerBulan, totalRPD);
      const realisasiSemester = calculateSemesterSummary(realisasiPerBulan, totalRealisasi);
      const semesterContainer = document.getElementById('dashboard-semester-summaries');
      if (semesterContainer) {
          semesterContainer.innerHTML = `<h6 class="small text-muted">Rencana Penarikan (RPD)</h6><table class="table table-sm table-borderless text-center small"><thead class="table-light"><tr><th>S</th><th>Total</th><th>%</th></tr></thead><tbody>${rpdSemester.values.map((val, i) => `<tr><td><strong>S${i+1}</strong></td><td>${val.toLocaleString('id-ID')}</td><td><span class="badge bg-primary-subtle text-primary-emphasis">${rpdSemester.percentages[i]}</span></td></tr>`).join('')}</tbody></table><h6 class="small text-muted mt-2">Realisasi</h6><table class="table table-sm table-borderless text-center small"><thead class="table-light"><tr><th>S</th><th>Total</th><th>%</th></tr></thead><tbody>${realisasiSemester.values.map((val, i) => `<tr><td><strong>S${i+1}</strong></td><td>${val.toLocaleString('id-ID')}</td><td><span class="badge bg-success-subtle text-success-emphasis">${realisasiSemester.percentages[i]}</span></td></tr>`).join('')}</tbody></table>`;
      }
    } 
    // END: Perbaikan rekap triwulan dan semester
  }
  function renderDirektoratDashboard(data) { const ajuanPerBulan = Array(12).fill(0); data.forEach(ajuan => { if(ajuan.Timestamp) { const month = new Date(ajuan.Timestamp).getMonth(); if (month >= 0 && month < 12) ajuanPerBulan[month]++; } }); setupChart('chartAjuanPerBulan', 'bar', { labels: RPD_MONTHS, datasets: [{ label: 'Jumlah Ajuan', data: ajuanPerBulan, backgroundColor: 'rgba(54, 162, 235, 0.6)' }] }, { responsive: true, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }); const ajuanPerStatus = data.reduce((acc, ajuan) => { acc[ajuan.Status] = (acc[ajuan.Status] || 0) + 1; return acc; }, {}); setupChart('chartAjuanPerStatus', 'doughnut', { labels: Object.keys(ajuanPerStatus), datasets: [{ data: Object.values(ajuanPerStatus), backgroundColor: ['#ffc107', '#198754', '#dc3545', '#fd7e14', '#6c757d'] }] }, { responsive: true, plugins: { legend: { position: 'top' } } }); const perProdiStats = data.reduce((acc, ajuan) => { const prodiId = ajuan.ID_Prodi || 'N/A'; if (!acc[prodiId]) acc[prodiId] = { count: 0, total: 0 }; acc[prodiId].count++; acc[prodiId].total += Number(ajuan.Total) || 0; return acc; }, {}); const prodiLabels = Object.keys(perProdiStats).sort(); const anggaranPerProdiData = prodiLabels.map(id => perProdiStats[id].total); const ajuanPerProdiData = prodiLabels.map(id => perProdiStats[id].count); setupChart('chartAnggaranPerProdi', 'bar', { labels: prodiLabels, datasets: [{ label: 'Total Anggaran (Rp)', data: anggaranPerProdiData, backgroundColor: 'rgba(25, 135, 84, 0.6)' }] }, { responsive: true, indexAxis: 'y', scales: { x: { beginAtZero: true } } }); setupChart('chartAjuanPerProdi', 'pie', { labels: prodiLabels, datasets: [{ data: ajuanPerProdiData, backgroundColor: ['#0dcaf0', '#6f42c1', '#d63384', '#fd7e14', '#198754', '#212529', '#ffc107'] }] }, { responsive: true, plugins: { legend: { position: 'top' } } }); const reportsContainer = document.getElementById('direktorat-prodi-reports'); reportsContainer.innerHTML = ''; const dataByProdi = data.reduce((acc, curr) => { (acc[curr.ID_Prodi] = acc[curr.ID_Prodi] || []).push(curr); return acc; }, {}); Object.keys(dataByProdi).sort().forEach(prodiId => renderProdiDetailReport(prodiId, dataByProdi[prodiId], reportsContainer)); }
  function renderProdiDetailReport(prodiId, prodiData, container) { const prodiSafeId = prodiId.replace(/[^a-zA-Z0-9]/g, ''); const prodiHtml = `<div class="col-12 col-lg-6"><div class="card p-3 h-100"><h6 class="card-title mb-3 border-bottom pb-2"><strong><i class="bi bi-building"></i> Laporan: ${escapeHtml(prodiId)}</strong></h6><div class="row g-3"><div class="col-6"><div class="card p-2 h-100"><div class="small text-muted">PAGU ANGGARAN (AWAL)</div><strong id="prodi-${prodiSafeId}-pagu" class="fs-6 text-primary"></strong></div></div><div class="col-6"><div class="card p-2 h-100"><div class="small text-muted">TOTAL DITERIMA (FINAL)</div><strong id="prodi-${prodiSafeId}-diterima-final" class="fs-6"></strong></div></div><div class="col-6"><div class="card p-2 h-100"><div class="small text-muted">DIAJUKAN (TOTAL)</div><strong id="prodi-${prodiSafeId}-diajukan" class="fs-6"></strong></div></div><div class="col-6"><div class="card p-2 h-100"><div class="small text-muted">DITERIMA (AWAL)</div><strong id="prodi-${prodiSafeId}-diterima-awal" class="fs-6"></strong></div></div><div class="col-6"><div class="card p-2 h-100"><div class="small text-muted">RPD</div><strong id="prodi-${prodiSafeId}-rpd" class="fs-6"></strong></div></div><div class="col-6"><div class="card p-2 h-100"><div class="small text-muted">REALISASI</div><strong id="prodi-${prodiSafeId}-realisasi" class="fs-6"></strong></div></div><div class="col-12"><div class="card p-2 text-center bg-light"><div class="small text-muted">% REALISASI (DARI RPD)</div><strong id="prodi-${prodiSafeId}-persen" class="fs-4 text-primary">0.0%</strong><div class="progress mt-1" role="progressbar" style="height: 5px;"><div id="prodi-${prodiSafeId}-persen-bar" class="progress-bar" style="width: 0%;"></div></div></div></div></div><div class="mt-3"><h6 class="text-center small text-muted">Progress Bulanan</h6><canvas id="chart-prodi-${prodiSafeId}-progress"></canvas></div></div></div>`; container.insertAdjacentHTML('beforeend', prodiHtml); const prodiInfo = (STATE.allProdi || []).find(p => p.ID_Prodi === prodiId); const pagu = prodiInfo ? (Number(prodiInfo.Pagu_Anggaran) || 0) : 0; let totalDiajukan = 0, totalDiterimaAwal = 0, totalDiterimaFinal = 0, totalRPD = 0, totalRealisasi = 0; const rpdPerBulan = Array(12).fill(0); const realisasiPerBulan = Array(12).fill(0); prodiData.forEach(ajuan => { totalDiajukan += Number(ajuan.Total) || 0; if (ajuan.Status === 'Diterima') { totalDiterimaFinal += Number(ajuan.Total) || 0; if (ajuan.Tipe_Ajuan === 'Awal' || !ajuan.Tipe_Ajuan) { totalDiterimaAwal += Number(ajuan.Total) || 0; } RPD_MONTHS.forEach((month, index) => { const rpdVal = Number(ajuan[`RPD_${month}`]) || 0; const realVal = Number(ajuan[`Realisasi_${month}`]) || 0; totalRPD += rpdVal; totalRealisasi += realVal; rpdPerBulan[index] += rpdVal; realisasiPerBulan[index] += realVal; }); } }); const persentaseRealisasi = totalRPD > 0 ? (totalRealisasi / totalRPD) * 100 : 0; document.getElementById(`prodi-${prodiSafeId}-pagu`).textContent = 'Rp ' + pagu.toLocaleString('id-ID'); document.getElementById(`prodi-${prodiSafeId}-diterima-final`).textContent = 'Rp ' + totalDiterimaFinal.toLocaleString('id-ID'); document.getElementById(`prodi-${prodiSafeId}-diajukan`).textContent = 'Rp ' + totalDiajukan.toLocaleString('id-ID'); document.getElementById(`prodi-${prodiSafeId}-diterima-awal`).textContent = 'Rp ' + totalDiterimaAwal.toLocaleString('id-ID'); document.getElementById(`prodi-${prodiSafeId}-rpd`).textContent = 'Rp ' + totalRPD.toLocaleString('id-ID'); document.getElementById(`prodi-${prodiSafeId}-realisasi`).textContent = 'Rp ' + totalRealisasi.toLocaleString('id-ID'); const persenEl = document.getElementById(`prodi-${prodiSafeId}-persen`); if (persenEl) persenEl.textContent = persentaseRealisasi.toFixed(1) + '%'; const persenBarEl = document.getElementById(`prodi-${prodiSafeId}-persen-bar`); if (persenBarEl) persenBarEl.style.width = `${Math.min(persentaseRealisasi, 100)}%`; setupChart(`chart-prodi-${prodiSafeId}-progress`, 'bar', { labels: RPD_MONTHS, datasets: [{ label: 'Realisasi (Rp)', data: realisasiPerBulan, backgroundColor: 'rgba(255, 193, 7, 0.7)' }, { label: 'RPD (Rp)', data: rpdPerBulan, backgroundColor: 'rgba(13, 110, 253, 0.6)' }] }, { responsive: true, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } }); }
  
  document.querySelector('[data-bs-target="#tab-manage"]').addEventListener('shown.bs.tab', async () => {
    if (STATE.role === 'direktorat') {
      showLoader(true);
      await refreshProdiData();
      await refreshKelompokData();
      await loadGlobalSettings();
      await loadAnnouncement();
      await loadBeritaAcaraSettings();
      showLoader(false);
    }
  });

  window.savePagu = async (uid) => { const paguInput = document.getElementById(`pagu-input-${uid}`); const newPagu = Number(paguInput.value) || 0; if (newPagu < 0) { showToast("Pagu tidak boleh negatif.", "warning"); return; } showLoader(true); try { await db.collection('users').doc(uid).update({ Pagu_Anggaran: newPagu }); showToast(`Pagu anggaran berhasil disimpan.`, "success"); } catch (error) { showToast(`Gagal menyimpan pagu: ${error.message}`, "danger"); } finally { showLoader(false); } };
  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const deadlineInput = document.getElementById('ms_deadline').value;
    const tahapPerubahan = document.getElementById('ms_tahap_perubahan').value;
    const jumlahTahap = parseInt(document.getElementById('ms_jumlah_tahap_perubahan').value, 10) || 1;
    const tahapAktif = parseInt(document.getElementById('ms_tahap_perubahan_aktif').value, 10) || 1;

    const settingsToUpdate = { 
        Status_Ajuan_Perubahan: tahapPerubahan,
        Jumlah_Tahap_Perubahan: jumlahTahap,
        Tahap_Perubahan_Aktif: tahapAktif
    };
    if (deadlineInput) {
        const deadlineDate = new Date(deadlineInput);
        deadlineDate.setHours(23, 59, 59, 999);
        settingsToUpdate.Batas_Tanggal_Pengajuan = firebase.firestore.Timestamp.fromDate(deadlineDate);
    } else {
        settingsToUpdate.Batas_Tanggal_Pengajuan = null;
    }
    showLoader(true);
    try {
        await db.collection('appConfig').doc('settings').set(settingsToUpdate, { merge: true });
        showToast("Pengaturan berhasil disimpan. Refresh halaman untuk melihat perubahan menu.", "success");
        await loadGlobalSettings();
    } catch (error) {
        showToast(`Gagal menyimpan pengaturan: ${error.message}`, "danger");
    } finally {
        showLoader(false);
    }
  });
  async function loadGlobalSettings() { try { const doc = await db.collection('appConfig').doc('settings').get(); if (doc.exists) { STATE.globalSettings = doc.data(); const deadline = STATE.globalSettings.Batas_Tanggal_Pengajuan; if (deadline && deadline.toDate) { const deadlineDate = deadline.toDate(); document.getElementById('current-deadline-display').textContent = deadlineDate.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); const yyyy = deadlineDate.getFullYear(); const mm = String(deadlineDate.getMonth() + 1).padStart(2, '0'); const dd = String(deadlineDate.getDate()).padStart(2, '0'); document.getElementById('ms_deadline').value = `${yyyy}-${mm}-${dd}`; } else { document.getElementById('current-deadline-display').textContent = "Belum ditentukan"; } const tahapStatus = STATE.globalSettings.Status_Ajuan_Perubahan || 'Ditutup'; const tahapDisplay = document.getElementById('current-tahap-display'); tahapDisplay.textContent = tahapStatus; document.getElementById('ms_tahap_perubahan').value = tahapStatus; tahapDisplay.classList.toggle('text-success', tahapStatus === 'Dibuka'); tahapDisplay.classList.toggle('text-danger', tahapStatus !== 'Dibuka'); 
        
        const jumlahTahap = STATE.globalSettings.Jumlah_Tahap_Perubahan || 1;
        const tahapAktif = STATE.globalSettings.Tahap_Perubahan_Aktif || 1;
        document.getElementById('ms_jumlah_tahap_perubahan').value = jumlahTahap;
        const selectAktif = document.getElementById('ms_tahap_perubahan_aktif');
        selectAktif.innerHTML = '';
        for (let i = 1; i <= jumlahTahap; i++) {
            selectAktif.add(new Option(`Tahap ${i}`, i));
        }
        selectAktif.value = tahapAktif;
        document.getElementById('current-tahap-aktif-display').textContent = `Tahap ${tahapAktif}`;
        
      } else { 
        document.getElementById('current-deadline-display').textContent = "Belum ditentukan"; 
        document.getElementById('current-tahap-display').textContent = "Ditutup"; 
        document.getElementById('current-tahap-aktif-display').textContent = "Tahap 1";
        STATE.globalSettings = { Status_Ajuan_Perubahan: 'Ditutup', Jumlah_Tahap_Perubahan: 1, Tahap_Perubahan_Aktif: 1 };
      } } catch (error) { console.error("Gagal memuat pengaturan global:", error); } 
  }
  
  async function loadAnnouncement() { try { const doc = await db.collection('appConfig').doc('announcement').get(); if (doc.exists) { const data = doc.data(); document.getElementById('ma_announcement_text').value = data.text || ''; const statusEl = document.getElementById('current-announcement-status'); statusEl.textContent = data.isActive ? 'Aktif' : 'Tidak Aktif'; statusEl.className = `text-center fw-bold ${data.isActive ? 'text-success' : 'text-danger'}`; } } catch (e) { console.error("Gagal memuat pengumuman:", e); } }
  async function displayGlobalAnnouncement() { const area = document.getElementById('global-announcement-area'); try { const doc = await db.collection('appConfig').doc('announcement').get(); if (doc.exists && doc.data().isActive) { document.getElementById('global-announcement-text').innerText = doc.data().text; area.style.display = 'block'; } else { area.style.display = 'none'; } } catch (e) { area.style.display = 'none'; console.error("Gagal menampilkan pengumuman:", e); } }
  document.getElementById('btn-save-announcement').addEventListener('click', async () => { const text = document.getElementById('ma_announcement_text').value.trim(); if (!text) { showToast("Teks pengumuman tidak boleh kosong.", "warning"); return; } showLoader(true); try { await db.collection('appConfig').doc('announcement').set({ text: text, isActive: true, updatedBy: STATE.id, updatedAt: serverTimestamp() }, { merge: true }); showToast("Pengumuman berhasil dipublikasikan.", "success"); loadAnnouncement(); } catch (e) { showToast("Gagal menyimpan pengumuman.", "danger"); } finally { showLoader(false); } });
  document.getElementById('btn-deactivate-announcement').addEventListener('click', async () => { showLoader(true); try { await db.collection('appConfig').doc('announcement').update({ isActive: false }); showToast("Pengumuman berhasil dinonaktifkan.", "info"); loadAnnouncement(); } catch (e) { showToast("Gagal menonaktifkan pengumuman.", "danger"); } finally { showLoader(false); } });
  function clearUserForm() { ['mp_UID', 'mp_ID', 'mp_Nama', 'mp_Email', 'mp_Role', 'mp_BA_Jabatan', 'mp_BA_Nama'].forEach(id => document.getElementById(id).value = ''); document.getElementById('mp_ba_fields_wrapper').style.display = 'none'; }
  function clearKelompokForm() { ['mk_ID', 'mk_Nama'].forEach(id => document.getElementById(id).value = ''); document.getElementById('mk_ID').readOnly = false; }
  window.deleteUser = async (uid, prodiId) => { if (confirm(`Yakin ingin menghapus profil pengguna "${prodiId}"? \n\nPENTING: Aksi ini hanya menghapus profil dari database Si-Pandai. Anda HARUS menghapus pengguna dengan UID ${uid} secara manual dari Firebase Authentication Console untuk menghapus akun login sepenuhnya.`)) { showLoader(true); try { await db.collection('users').doc(uid).delete(); showToast(`Profil pengguna "${prodiId}" berhasil dihapus.`); clearUserForm(); await refreshProdiData(); } catch (error) { showToast(`Gagal menghapus profil: ${error.message}`, 'danger'); console.error(error); } finally { showLoader(false); } } };
  window.deleteKelompok = async (id) => { if (confirm(`Yakin ingin menghapus kelompok "${id}"?`)) { showLoader(true); try { await db.collection('kelompok').doc(id).delete(); showToast(`Kelompok "${id}" berhasil dihapus.`); clearKelompokForm(); await refreshKelompokData(); } catch (error) { showToast(`Gagal menghapus kelompok: ${error.message}`, 'danger'); console.error(error); } finally { showLoader(false); } } };
  document.getElementById('btn-add-user').addEventListener('click', async () => { const email = document.getElementById('mp_new_email').value.trim(); const password = document.getElementById('mp_new_password').value; const idProdi = document.getElementById('mp_new_id').value.trim(); const namaProdi = document.getElementById('mp_new_nama').value.trim(); const role = document.getElementById('mp_new_role').value; if (!email || !password || !idProdi || !namaProdi) { showToast('Semua field untuk pengguna baru wajib diisi.', 'warning'); return; } if (password.length < 6) { showToast('Password harus minimal 6 karakter.', 'warning'); return; } showLoader(true); let secondaryApp; try { secondaryApp = firebase.initializeApp(firebaseConfig, "secondaryAuthApp" + Date.now()); const secondaryAuth = secondaryApp.auth(); const userCredential = await secondaryAuth.createUserWithEmailAndPassword(email, password); const newUser = userCredential.user; await db.collection('users').doc(newUser.uid).set({ Email: email, ID_Prodi: idProdi, Nama_Prodi: namaProdi, Role: role, Pagu_Anggaran: 0 }); showToast(`Pengguna baru "${namaProdi}" berhasil dibuat.`, 'success'); ['mp_new_email', 'mp_new_password', 'mp_new_id', 'mp_new_nama'].forEach(id => document.getElementById(id).value = ''); await refreshProdiData(); } catch (error) { showToast(`Gagal membuat pengguna: ${error.message}`, 'danger'); console.error(error); } finally { if (secondaryApp) { await secondaryApp.delete(); } showLoader(false); } });
  document.getElementById('btn-save-kelompok').addEventListener('click', async () => { const id = document.getElementById('mk_ID').value.trim(); const nama = document.getElementById('mk_Nama').value.trim(); if (!id || !nama) { showToast('ID dan Nama Kelompok wajib diisi.', 'warning'); return; } showLoader(true); try { await db.collection('kelompok').doc(id).set({ ID_Kelompok: id, Nama_Kelompok: nama }, { merge: true }); showToast('Kelompok berhasil disimpan.'); clearKelompokForm(); await refreshKelompokData(); } catch (error) { showToast(`Gagal menyimpan kelompok: ${error.message}`, 'danger'); } finally { showLoader(false); } });
  document.getElementById('btn-download-template-user').addEventListener('click', () => { const data = [['ID_Prodi', 'Nama_Prodi', 'Email', 'Role'], ['D3-KEP', 'D3 Keperawatan', 'd3kep@poltekkeskupang.ac.id', 'prodi']]; const worksheet = XLSX.utils.aoa_to_sheet(data); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Template Pengguna"); XLSX.writeFile(workbook, "template_pengguna.xlsx"); showToast('Template pengguna berhasil diunduh.', 'info'); });
  document.getElementById('input-upload-excel-user').addEventListener('change', (e) => { const file = e.target.files[0]; if (!file) return; showLoader(true); const reader = new FileReader(); reader.onload = async (event) => { try { const data = new Uint8Array(event.target.result); const workbook = XLSX.read(data, { type: 'array' }); const firstSheet = workbook.Sheets[workbook.SheetNames[0]]; const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }); if (jsonData.length < 2 || jsonData[0][0] !== 'ID_Prodi' || jsonData[0][1] !== 'Nama_Prodi' || jsonData[0][2] !== 'Email' || jsonData[0][3] !== 'Role') { throw new Error('Format file tidak sesuai. Pastikan header adalah ID_Prodi, Nama_Prodi, Email, Role.'); } const batch = db.batch(); let count = 0; for (let i = 1; i < jsonData.length; i++) { const row = jsonData[i]; const idProdi = String(row[0] || '').trim(); const namaProdi = String(row[1] || '').trim(); const email = String(row[2] || '').trim(); const role = String(row[3] || 'prodi').trim(); if (idProdi && namaProdi && email && role) { const userRef = db.collection("users").doc(); batch.set(userRef, { ID_Prodi: idProdi, Nama_Prodi: namaProdi, Email: email, Role: role, Pagu_Anggaran: 0 }); count++; } } if (count === 0) { throw new Error("Tidak ada data pengguna yang valid untuk diunggah."); } await batch.commit(); showToast(`${count} profil pengguna berhasil diunggah dari Excel.`, 'success'); await refreshProdiData(); } catch (error) { showToast(`Gagal memproses file: ${error.message}`, 'danger'); } finally { showLoader(false); e.target.value = ''; } }; reader.readAsArrayBuffer(file); });
  document.getElementById('btn-download-template-kelompok').addEventListener('click', () => { const data = [['ID_Kelompok', 'Nama_Kelompok'], ['51.01.01', 'Belanja Bahan Makanan'], ['52.02.03', 'Belanja Jasa Konsultan']]; const worksheet = XLSX.utils.aoa_to_sheet(data); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Template"); XLSX.writeFile(workbook, "template_kelompok.xlsx"); showToast('Template berhasil diunduh.', 'info'); });
  document.getElementById('input-upload-excel-kelompok').addEventListener('change', (e) => { const file = e.target.files[0]; if (!file) return; showLoader(true); const reader = new FileReader(); reader.onload = async (event) => { try { const data = new Uint8Array(event.target.result); const workbook = XLSX.read(data, { type: 'array' }); const firstSheet = workbook.Sheets[workbook.SheetNames[0]]; const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }); if (jsonData.length < 2 || jsonData[0][0] !== 'ID_Kelompok' || jsonData[0][1] !== 'Nama_Kelompok') { throw new Error('Format file tidak sesuai. Pastikan header adalah ID_Kelompok dan Nama_Kelompok.'); } const batch = db.batch(); let count = 0; for (let i = 1; i < jsonData.length; i++) { const row = jsonData[i]; const id = String(row[0] || '').trim(); const nama = String(row[1] || '').trim(); if (id && nama) { const docRef = db.collection('kelompok').doc(id); batch.set(docRef, { ID_Kelompok: id, Nama_Kelompok: nama }, { merge: true }); count++; } } if (count === 0) { throw new Error("Tidak ada data valid untuk diimport."); } await batch.commit(); showToast(`${count} data kelompok berhasil diimport/diperbarui.`, 'success'); await refreshKelompokData(); } catch (error) { showToast(`Gagal mengimpor file: ${error.message}`, 'danger'); } finally { showLoader(false); e.target.value = ''; } }; reader.readAsArrayBuffer(file); });
  
  const COLLECTIONS_TO_BACKUP = ['ajuan', 'users', 'kelompok', 'appConfig', 'notifications'];
  async function backupAllData() {
      if (STATE.role !== 'direktorat') { showToast("Hanya direktorat yang dapat melakukan backup.", "warning"); return; }
      showLoader(true);
      showToast("Memulai proses backup, ini mungkin memakan waktu beberapa saat...", "info");
      const backupData = {};
      try {
          for (const collectionName of COLLECTIONS_TO_BACKUP) {
              const snapshot = await db.collection(collectionName).get();
              const docs = [];
              for (const doc of snapshot.docs) {
                  let data = doc.data();
                  if (collectionName === 'ajuan') {
                      const historySnapshot = await doc.ref.collection('history').get();
                      data.history = historySnapshot.docs.map(historyDoc => ({ id: historyDoc.id, ...historyDoc.data() }));
                  }
                  docs.push({ id: doc.id, ...data });
              }
              backupData[collectionName] = docs;
          }
          const jsonString = JSON.stringify(backupData, null, 2);
          const blob = new Blob([jsonString], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
          a.href = url;
          a.download = `sipandai_backup_${timestamp}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast("Backup data berhasil diunduh.", "success");
      } catch (error) {
          console.error("Backup failed:", error);
          showToast(`Backup gagal: ${error.message}`, "danger");
      } finally {
          showLoader(false);
      }
  }
  async function handleRestoreFile(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const data = JSON.parse(e.target.result);
              const promptMessage = `PERINGATAN: Aksi ini akan MENGHAPUS SEMUA DATA saat ini di koleksi: ${COLLECTIONS_TO_BACKUP.join(', ')} dan menggantinya dengan data dari file backup. \n\nAksi ini tidak dapat dibatalkan. Ketik 'RESTORE' untuk melanjutkan.`;
              const confirmation = prompt(promptMessage);
              if (confirmation === 'RESTORE') {
                  await executeRestore(data);
              } else {
                  showToast("Restore dibatalkan.", "info");
              }
          } catch (error) {
              showToast(`Gagal membaca file restore: ${error.message}`, "danger");
              console.error("Restore file read error:", error);
          } finally {
              event.target.value = '';
          }
      };
      reader.readAsText(file);
  }
  async function executeRestore(data) {
      showLoader(true);
      showToast("Memulai proses restore. JANGAN tutup atau refresh halaman ini.", "info");
      try {
          for (const collectionName of COLLECTIONS_TO_BACKUP) {
              showToast(`Menghapus data lama di '${collectionName}'...`, 'warning');
              const collectionRef = db.collection(collectionName);
              const snapshot = await collectionRef.get();
              if (snapshot.size > 0) {
                const batchPromises = [];
                let batch = db.batch();
                snapshot.docs.forEach((doc, index) => {
                    batch.delete(doc.ref);
                    if ((index + 1) % 500 === 0) {
                        batchPromises.push(batch.commit());
                        batch = db.batch();
                    }
                });
                batchPromises.push(batch.commit());
                await Promise.all(batchPromises);
              }
          }
          for (const collectionName of COLLECTIONS_TO_BACKUP) {
              if (data[collectionName]) {
                  showToast(`Menulis data baru ke '${collectionName}'...`, 'info');
                  const docs = data[collectionName];
                  const batchPromises = [];
                  let batch = db.batch();
                  for (let i = 0; i < docs.length; i++) {
                      const docData = docs[i];
                      const { id, history, ...restData } = docData;
                      for (const key in restData) {
                          if (restData[key] && restData[key].seconds !== undefined && restData[key].nanoseconds !== undefined) {
                              restData[key] = new firebase.firestore.Timestamp(restData[key].seconds, restData[key].nanoseconds);
                          } else if (Array.isArray(restData[key])) { 
                              restData[key] = restData[key].map(item => {
                                  if (item && item.timestamp && item.timestamp.seconds !== undefined) {
                                      item.timestamp = new firebase.firestore.Timestamp(item.timestamp.seconds, item.timestamp.nanoseconds);
                                  }
                                  return item;
                              });
                          }
                      }
                      const docRef = db.collection(collectionName).doc(id);
                      batch.set(docRef, restData);
                      if (collectionName === 'ajuan' && history && Array.isArray(history)) {
                          for (const historyDoc of history) {
                              const { id: historyId, ...historyData } = historyDoc;
                              if (historyData.timestamp && historyData.timestamp.seconds !== undefined) {historyData.timestamp = new firebase.firestore.Timestamp(historyData.timestamp.seconds, historyData.timestamp.nanoseconds);
                              }
                              const historyRef = docRef.collection('history').doc(historyId);
                              batch.set(historyRef, historyData);
                          }
                      }
                      
                      if ((i + 1) % 250 === 0) { 
                          batchPromises.push(batch.commit());
                          batch = db.batch();
                      }
                  }
                  batchPromises.push(batch.commit());
                  await Promise.all(batchPromises);
              }
          }
          showToast("Restore data berhasil diselesaikan! Silakan refresh halaman.", "success");
      } catch (error) {
          showToast(`Restore gagal: ${error.message}`, "danger");
          console.error("Restore execution failed:", error);
      } finally {
          showLoader(false);
      }
  }

  document.getElementById('btn-backup-data').addEventListener('click', backupAllData);
  document.getElementById('input-restore-data').addEventListener('change', handleRestoreFile);
  
  function printContent(elementId, title) {
    const contentElement = document.getElementById(elementId);
    if (!contentElement || !contentElement.innerHTML.includes('<table')) {
      showToast('Tidak ada data untuk dicetak.', 'warning');
      return;
    }
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 10pt; }
            th, td { border: 1px solid #dee2e6; padding: 6px; text-align: left; vertical-align: top; }
            th { background-color: #f8f9fa; }
            h3 { text-align: center; margin-bottom: 20px; }
            .action-buttons { display: none; }
            input[type=number] { border: none; background: transparent; width: 100%; text-align: right; -moz-appearance: textfield; }
            input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
            tr[class^="group-header-"] td { font-weight: bold; background-color: #e9ecef; }
            .prodi-indicator { border-left: none !important; }
          </style>
        </head>
        <body>
          <h3>${title}</h3>
          ${contentElement.innerHTML}
        </body>
      </html>
    `);
    const actionHeaders = printWindow.document.querySelectorAll('th.action-buttons');
    actionHeaders.forEach(th => th.remove());
    const actionCells = printWindow.document.querySelectorAll('td.action-buttons');
    actionCells.forEach(td => td.remove());
    const checkboxes = printWindow.document.querySelectorAll('input[type=checkbox]');
    checkboxes.forEach(cb => {
        if (cb.parentElement.tagName === 'TH' || cb.parentElement.tagName === 'TD') {
            cb.parentElement.remove();
        }
    });
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }, 500);
  }

  function exportToExcel(tableContainerId, fileName, title) {
    const tableContainer = document.getElementById(tableContainerId);
    const table = tableContainer ? tableContainer.querySelector('table') : null;
    if (!table) {
      showToast('Tidak ada data untuk diekspor.', 'warning');
      return;
    }
    showToast('Mempersiapkan file Excel...', 'info');

    const data = [];
    const merges = [];
    let rowIndex = 0;

    let maxCols = 0;
    Array.from(table.rows).forEach(row => {
        let currentCols = 0;
        Array.from(row.cells).forEach(cell => {
            if (!cell.classList.contains('action-buttons') && !(cell.querySelector('input[type=checkbox]'))) {
                currentCols += cell.colSpan || 1;
            }
        });
        if (currentCols > maxCols) maxCols = currentCols;
    });

    if (maxCols > 0) {
        const titleRow = [title];
        for (let i = 1; i < maxCols; i++) titleRow.push('');
        data.push(titleRow);
        merges.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: maxCols - 1 } });
        rowIndex++;
        data.push([]);
        rowIndex++;
    }

    for (const row of table.rows) {
      const rowData = [];
      let colIndex = 0;
      for (let i = 0; i < row.cells.length; i++) {
        const cell = row.cells[i];
        if (i === 0 && cell.querySelector('input[type=checkbox]')) continue;
        if (cell.classList.contains('action-buttons')) continue;
        
        let cellValue = cell.innerText.trim();
        const input = cell.querySelector('input[type=number]');
        if (input) {
          cellValue = Number(input.value) || 0;
        } else if (cell.classList.contains('text-end')) {
            const numericValue = parseFloat(cellValue.replace(/[^0-9,-]/g, '').replace(',', '.'));
            if(!isNaN(numericValue)) cellValue = numericValue;
        }

        rowData.push(cellValue);
        const colSpan = cell.colSpan || 1;
        if (colSpan > 1) {
          merges.push({ s: { r: rowIndex, c: colIndex }, e: { r: rowIndex, c: colIndex + colSpan - 1 } });
          for (let k = 1; k < colSpan; k++) rowData.push('');
          colIndex += colSpan;
        } else {
          colIndex++;
        }
      }
      if (rowData.length > 0) {
        data.push(rowData);
        rowIndex++;
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!merges'] = merges;
    
    const colWidths = [];
    if(data.length > 2) {
      for(let i = 0; i < data[2].length; i++){
        let maxLen = 0;
        for(let j=2; j<data.length; j++) {
            const cellContent = data[j] ? data[j][i] : '';
            if(cellContent && cellContent.toString().length > maxLen) {
                maxLen = cellContent.toString().length;
            }
        }
        colWidths.push({ wch: Math.min(Math.max(maxLen, 12), 45) });
      }
      ws['!cols'] = colWidths;
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 30));
    XLSX.writeFile(wb, fileName);
  }

  document.getElementById('btn-print-daftar-awal').addEventListener('click', () => printContent('tableAjuanAwal', 'Daftar Ajuan Awal'));
  document.getElementById('btn-export-excel-awal').addEventListener('click', () => exportToExcel('tableAjuanAwal', 'Daftar_Ajuan_Awal.xlsx', 'Daftar Ajuan Awal'));
  document.getElementById('btn-print-daftar-perubahan').addEventListener('click', () => printContent('tableAjuanPerubahan', 'Daftar Ajuan Perubahan'));
  document.getElementById('btn-export-excel-perubahan').addEventListener('click', () => exportToExcel('tableAjuanPerubahan', 'Daftar_Ajuan_Perubahan.xlsx', 'Daftar Ajuan Perubahan'));
  document.getElementById('btn-print-rpd-awal').addEventListener('click', () => printContent('tableRPDAwal', 'RPD Awal'));
  document.getElementById('btn-export-excel-rpd-awal').addEventListener('click', () => exportToExcel('tableRPDAwal', 'RPD_Awal.xlsx', 'RPD Awal'));
  document.getElementById('btn-print-rpd-perubahan').addEventListener('click', () => printContent('tableRPDPerubahan', 'RPD Perubahan'));
  document.getElementById('btn-export-excel-rpd-perubahan').addEventListener('click', () => exportToExcel('tableRPDPerubahan', 'RPD_Perubahan.xlsx', 'RPD Perubahan'));
  document.getElementById('btn-print-realisasi-awal').addEventListener('click', () => printContent('tableRealisasiAwal', 'Realisasi Awal'));
  document.getElementById('btn-export-excel-realisasi-awal').addEventListener('click', () => exportToExcel('tableRealisasiAwal', 'Realisasi_Awal.xlsx', 'Realisasi Awal'));
  document.getElementById('btn-print-realisasi-perubahan').addEventListener('click', () => printContent('tableRealisasiPerubahan', 'Realisasi Perubahan'));
  document.getElementById('btn-export-excel-realisasi-perubahan').addEventListener('click', () => exportToExcel('tableRealisasiPerubahan', 'Realisasi_Perubahan.xlsx', 'Realisasi Perubahan'));

  // --- START: Log Aktivitas ---
  document.querySelector('[data-bs-target="#tab-log"]').addEventListener('shown.bs.tab', async () => {
    if (STATE.role === 'direktorat') {
        const userSelect = document.getElementById('filterLogUser');
        userSelect.innerHTML = '<option value="">Semua Pengguna</option>';
        STATE.allProdi.forEach(user => {
            userSelect.add(new Option(`${user.ID_Prodi} (${user.Role})`, user.ID_Prodi));
        });
        await refreshLogTable();
    }
  });

  async function refreshLogTable() {
    if (STATE.role !== 'direktorat') return;
    const tableContainer = document.getElementById('tableLogAktivitas');
    tableContainer.innerHTML = `<div class="text-center text-muted p-5">Memuat log...</div>`;
    showLoader(true);
    try {
        let query = db.collection('activityLog').orderBy('timestamp', 'desc');

        const userFilter = document.getElementById('filterLogUser').value;
        if (userFilter) {
            query = query.where('userId', '==', userFilter);
        }
        
        const dateStartFilter = document.getElementById('filterLogDateStart').value;
        if (dateStartFilter) {
            query = query.where('timestamp', '>=', new Date(dateStartFilter));
        }

        const dateEndFilter = document.getElementById('filterLogDateEnd').value;
        if (dateEndFilter) {
            const endDate = new Date(dateEndFilter);
            endDate.setHours(23, 59, 59, 999);
            query = query.where('timestamp', '<=', endDate);
        }

        const snapshot = await query.limit(500).get();
        const logs = snapshot.docs.map(doc => doc.data());
        renderLogTable(logs);

    } catch (error) {
        tableContainer.innerHTML = `<div class="text-center text-danger p-5">Gagal memuat log aktivitas.</div>`;
        console.error("Error fetching activity log:", error);
    } finally {
        showLoader(false);
    }
  }

  function renderLogTable(logs) {
    const container = document.getElementById('tableLogAktivitas');
    if (logs.length === 0) {
        container.innerHTML = '<div class="text-center text-muted p-5">Tidak ada aktivitas yang tercatat untuk filter ini.</div>';
        return;
    }
    const tableHeader = `
        <thead class="table-light">
            <tr>
                <th>Waktu</th>
                <th>Pengguna</th>
                <th>Aksi</th>
                <th>Detail</th>
            </tr>
        </thead>`;
    const tableRows = logs.map(log => {
        const time = log.timestamp && log.timestamp.toDate ? log.timestamp.toDate().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'long' }) : 'N/A';
        return `
            <tr>
                <td class="text-nowrap">${time}</td>
                <td class="text-nowrap">${escapeHtml(log.userId)}</td>
                <td><span class="badge bg-info-subtle text-info-emphasis">${escapeHtml(log.action)}</span></td>
                <td><small>${escapeHtml(log.details)}</small></td>
            </tr>`;
    }).join('');
    container.innerHTML = `<table class="table table-sm table-striped table-hover">${tableHeader}<tbody>${tableRows}</tbody></table>`;
  }

  document.getElementById('btn-filter-log').addEventListener('click', refreshLogTable);
  document.getElementById('btn-refresh-log').addEventListener('click', refreshLogTable);
  document.getElementById('btn-print-log').addEventListener('click', () => printContent('tableLogAktivitas', 'Log Aktivitas Pengguna'));
  document.getElementById('btn-export-excel-log').addEventListener('click', () => exportToExcel('tableLogAktivitas', 'Log_Aktivitas.xlsx', 'Log Aktivitas Pengguna'));
  // --- END: Log Aktivitas ---


  // --- START: Fitur Komentar ---
  window.openKomentarModal = async (id, nama) => {
    document.getElementById('komentarModalAjuanId').innerText = id.substring(0, 6) + '...';
    document.getElementById('komentarModalAjuanNama').innerText = nama;
    document.getElementById('komentar-id-ajuan').value = id;
    document.getElementById('komentar-input').value = '';
    
    const komentarListEl = document.getElementById('komentar-list');
    komentarListEl.innerHTML = `<div class="text-center text-muted">Memuat komentar...</div>`;
    KOMENTAR_MODAL.show();

    try {
        const doc = await db.collection('ajuan').doc(id).get();
        if (doc.exists) {
            const comments = doc.data().Komentar || [];
            renderKomentarList(comments);
        } else {
            komentarListEl.innerHTML = `<div class="text-center text-danger">Ajuan tidak ditemukan.</div>`;
        }
    } catch (error) {
        console.error("Gagal memuat komentar:", error);
        komentarListEl.innerHTML = `<div class="text-center text-danger">Gagal memuat komentar.</div>`;
    }
  };

  function renderKomentarList(comments) {
    const listEl = document.getElementById('komentar-list');
    if (!comments || comments.length === 0) {
      listEl.innerHTML = '<p class="text-center text-muted small m-0">Belum ada diskusi untuk ajuan ini.</p>';
      return;
    }
    
    listEl.innerHTML = comments.map(c => {
      const isCurrentUser = c.author === STATE.id;
      const bubbleClass = isCurrentUser ? 'comment-bubble-user' : 'comment-bubble-other';
      const time = c.timestamp && c.timestamp.toDate ? c.timestamp.toDate().toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

      return `<div class="comment-bubble ${bubbleClass}">
                <div class="author">${escapeHtml(c.author)}</div>
                <div class="text">${escapeHtml(c.text)}</div>
                <div class="timestamp">${time}</div>
              </div>`;
    }).join('');
    listEl.scrollTop = listEl.scrollHeight; // Auto-scroll to the bottom
  }

  document.getElementById('btn-submit-komentar').addEventListener('click', async () => {
    const ajuanId = document.getElementById('komentar-id-ajuan').value;
    const inputEl = document.getElementById('komentar-input');
    const text = inputEl.value.trim();

    if (!text) {
      showToast("Komentar tidak boleh kosong.", "warning");
      return;
    }

    const newComment = {
      author: STATE.id,
      text: text,
      timestamp: new Date() // Client-side timestamp for immediate display
    };
    
    showLoader(true);
    try {
      const ajuanRef = db.collection('ajuan').doc(ajuanId);
      
      // Update Firestore
      await ajuanRef.update({
        Komentar: arrayUnion({
            author: STATE.id,
            text: text,
            timestamp: serverTimestamp()
        })
      });
      
      // Immediately update local UI
      const doc = await ajuanRef.get();
      const comments = doc.data().Komentar || [];
      renderKomentarList(comments);
      inputEl.value = '';

      // Send notifications to other parties
      const ajuanData = doc.data();
      if (STATE.role === 'prodi') { // Prodi sends notification to all directorate
          STATE.allDirektoratUids.forEach(uid => {
              createNotification(uid, `${STATE.id} mengirim komentar baru pada ajuan "${ajuanData.Nama_Ajuan}".`);
          });
      } else { // Directorate sends notification to the prodi owner
          const prodiUser = STATE.allProdi.find(p => p.ID_Prodi === ajuanData.ID_Prodi);
          if (prodiUser && prodiUser.uid) {
              createNotification(prodiUser.uid, `Direktorat mengirim komentar baru pada ajuan Anda "${ajuanData.Nama_Ajuan}".`);
          }
      }
      
      await logActivity('Komentar Dikirim', `Mengirim komentar pada ajuan ID ${ajuanId}: "${text}"`);
      showToast("Komentar berhasil dikirim.", "success");

    } catch (error) {
      console.error("Gagal mengirim komentar:", error);
      showToast(`Gagal mengirim komentar: ${error.message}`, "danger");
    } finally {
      showLoader(false);
    }
  });
  // --- END: Fitur Komentar ---

});