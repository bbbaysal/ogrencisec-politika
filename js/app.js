// ==============================================================================
// GÜVENLİ VE ÇOCUK DOSTU ÖĞRENCİ AVATAR/KISALTMA YÖNETİCİSİ
// ==============================================================================
function getStudentInitials(student) {
    if (!student) return 'ÖS';
    
    const fName = (student.first_name || '').trim();
    const lName = (student.last_name || '').trim();

    if (!fName && !lName) return 'ÖS';
    if (!lName) return fName.slice(0, 2).toLocaleUpperCase('tr-TR');
    if (!fName) return lName.slice(0, 2).toLocaleUpperCase('tr-TR');

    // Standart iki harfli kısaltma (örn: Ahmet Yılmaz -> AY)
    const rawInitials = (fName[0] + lName[0]).toLocaleUpperCase('tr-TR');

    // Türkçede okulda öğrenciler arasında alay konusu veya argo/küfür olabilecek kısaltmalar listesi
    const sensitiveInitials = [
        'IT', 'İT', // İt / Köpek
        'PC', 'PÇ', // Piç
        'BK',       // Bok
        'GT', 'GÖ', // Göt
        'ML',       // Mal
        'MK', 'MQ', 'AQ', 'AM', // Küfür kısaltmaları
        'OC', 'OÇ', // Ağır küfür
        'SK',       // Sik
        'ÇŞ',       // Çiş
        'ÖK',       // Öküz
        'KL'        // Kaltak vb.
    ];

    if (sensitiveInitials.includes(rawInitials)) {
        // 1. Eğer öğrencinin birden fazla adı varsa (örn: İlber Kaan Tırpan -> İK)
        const nameParts = fName.split(/\s+/).filter(Boolean);
        if (nameParts.length > 1) {
            const multiNameInitials = (nameParts[0][0] + nameParts[1][0]).toLocaleUpperCase('tr-TR');
            if (!sensitiveInitials.includes(multiNameInitials)) {
                return multiNameInitials;
            }
        }

        // 2. Tek adı varsa adının ilk 2 harfini al (örn: İlber Tırpan -> "İL")
        if (fName.length >= 2) {
            const firstTwo = fName.slice(0, 2).toLocaleUpperCase('tr-TR');
            if (!sensitiveInitials.includes(firstTwo)) {
                return firstTwo;
            }
        }

        // 3. Hiçbiri olmazsa sevimli bir rozet ikonu göster
        return '🎓';
    }

    return rawInitials;
}
window.getStudentInitials = getStudentInitials;

// ==============================================================================
// ANA UYGULAMA YÖNETİCİSİ (Veri Yönetimi, e-Okul İçe Aktarma & UI)
// ==============================================================================

class AppManager {
    constructor() {
        this.currentTeacher = null;
        this.classes = [];
        this.currentClass = null;
        this.students = [];
        this.isDemoMode = false;
        this.activeWinner = null;
        this.currentSelectionBoardIncremented = false;

        // 40 Dakikalık Ders Oturumu Zamanlayıcısı (MEB Ders Süresi: 40 dk = 2400 sn)
        this.sessionTimer = null;
        this.sessionRemainingSeconds = 40 * 60;
        this.classStudentCounts = {};
    }

    async init() {
        picker.initCanvas('wheelCanvas');
        this.checkExistingSession();
        this.bindEvents();
    }

    async checkExistingSession() {
        // 1. Tarayıcıda kayıtlı öğretmen oturumu var mı?
        const savedTeacherStr = localStorage.getItem('ogrencisec_saved_teacher');
        const savedToken = localStorage.getItem('ogrencisec_auth_token');
        const refreshToken = localStorage.getItem('ogrencisec_refresh_token');

        if (savedTeacherStr && savedToken) {
            try {
                // Token süresi dolmuş mu kontrol et
                let isExpired = false;
                try {
                    const parts = savedToken.split('.');
                    if (parts.length === 3) {
                        const payload = JSON.parse(atob(parts[1]));
                        if (payload.exp && Date.now() >= (payload.exp * 1000 - 30000)) {
                            isExpired = true;
                        }
                    }
                } catch (e) {
                    isExpired = false;
                }

                if (!isExpired) {
                    const teacher = JSON.parse(savedTeacherStr);
                    initSupabaseClient(savedToken);
                    this.onTeacherLoggedIn(teacher);
                    return;
                } else if (refreshToken && supabaseClient) {
                    console.log('🔄 Kayıtlı token süresi dolmuş, refresh_token ile yenileniyor...');
                    const { data, error } = await supabaseClient.auth.refreshSession({ refresh_token: refreshToken });
                    if (!error && data?.session) {
                        const teacher = JSON.parse(savedTeacherStr);
                        await setSupabaseAuth(data.session.access_token, data.session.refresh_token, teacher);
                        this.onTeacherLoggedIn(teacher);
                        return;
                    } else {
                        console.warn('Oturum yenilenemedi, oturum sıfırlanıyor:', error);
                        clearSupabaseAuth();
                    }
                } else {
                    clearSupabaseAuth();
                }
            } catch (e) {
                console.warn('Kayıtlı öğretmen oturumu okunamadı:', e);
                clearSupabaseAuth();
            }
        }

        // 2. Supabase GoTrue oturumu var mı?
        if (supabaseClient) {
            try {
                const { data: { session } } = await supabaseClient.auth.getSession();
                if (session && session.user) {
                    const { data: profile } = await supabaseClient
                        .from('profiles')
                        .select('*')
                        .eq('id', session.user.id)
                        .maybeSingle();

                    this.onTeacherLoggedIn({
                        id: session.user.id,
                        email: session.user.email,
                        name: profile?.full_name || session.user.email
                    });
                    return;
                }
            } catch (err) {
                console.warn('Oturum kontrol hatası:', err);
            }
        }

        this.showScreen('loginScreen');
        qrManager.startNewSession();
    }

    async onTeacherLoggedIn(teacher) {
        this.currentTeacher = teacher;
        // Demo modu kontrolü: demo-teacher ise veya token yoksa demo modundadır
        const token = localStorage.getItem('ogrencisec_auth_token');
        this.isDemoMode = (!token || teacher.id === 'demo-teacher' || teacher.id === 'mock-teacher-id');

        this.updateTeacherUI();
        this.startSessionTimer(); // 40 dakikalık ders oturum sayacını başlat

        await this.loadClasses();

        // Bekleyen çevrimdışı senkronizasyon kayıtlarını kontrol et ve aktar
        if (window.syncQueue) {
            window.syncQueue.updateSyncUI();
            window.syncQueue.processQueue();
        }

        // KULLANICI TALEBİ: İlk açılışta doğrudan çarka gitmek yerine Sınıf Seçim Ekranı gelsin!
        this.showClassSelectScreen();
    }

    updateTeacherUI() {
        const teacherName = this.currentTeacher?.name || this.currentTeacher?.email || 'Öğretmen';
        
        const nameEl = document.getElementById('teacherDisplayName');
        if (nameEl) nameEl.textContent = teacherName;

        const hubNameEl = document.getElementById('classHubTeacherName');
        if (hubNameEl) hubNameEl.textContent = teacherName;

        const badgeEl = document.getElementById('connectionStatusBadge');
        const hubBadgeEl = document.getElementById('classHubConnBadge');

        const updateBadge = (el) => {
            if (!el) return;
            if (this.isDemoMode) {
                el.className = 'conn-badge demo-mode';
                el.innerHTML = '<span class="dot yellow"></span> Demo / Yerel Hafıza';
                el.title = 'Demo modundasınız. Veriler Supabase bulutuna değil, bu tarayıcıya geçici kaydedilir.';
            } else {
                el.className = 'conn-badge live-mode';
                el.innerHTML = '<span class="dot green"></span> Supabase Bulut Aktif';
                el.title = 'Tüm sınıf ve öğrenci verileri Supabase bulut veritabanına anlık kaydediliyor.';
            }
        };

        updateBadge(badgeEl);
        updateBadge(hubBadgeEl);
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(screenId);
        if (target) target.classList.add('active');

        if (screenId === 'boardScreen') {
            setTimeout(() => {
                picker.resizeCanvas();
            }, 100);
        }
    }

    // =========================================================================
    // AÇILIŞ SINIF SEÇİM HUB'I (DERS ÖNCESİ EKRAN)
    // =========================================================================
    async showClassSelectScreen() {
        this.showScreen('classSelectScreen');
        await this.renderClassHub();
    }

    async renderClassHub() {
        const grid = document.getElementById('classCardsGrid');
        if (!grid) return;

        grid.innerHTML = '<div style="color: var(--text-muted); padding: 20px;">Sınıflar yükleniyor...</div>';

        // Sınıfların öğrenci sayılarını alalım
        await this.fetchStudentCounts();

        grid.innerHTML = '';

        if (this.classes.length === 0) {
            grid.innerHTML = `
                <div class="class-card-create" onclick="app.openNewClassModal()" style="grid-column: 1 / -1;">
                    <div class="create-icon-circle">➕</div>
                    <h3>Henüz Sınıfınız Bulunmuyor</h3>
                    <p>Ders işlemeye başlamak için hemen ilk sınıfınızı (Örn: 9-A Matematik) ekleyin.</p>
                    <button class="btn btn-primary" style="margin-top: 8px;">➕ Yeni Sınıf Oluştur</button>
                </div>
            `;
            return;
        }

        // Mevcut sınıfların kartlarını bas
        this.classes.forEach(c => {
            const count = this.classStudentCounts[c.id] || 0;
            const card = document.createElement('div');
            card.className = 'class-card';
            card.innerHTML = `
                <div>
                    <div class="class-card-top">
                        <div class="class-card-icon">📐</div>
                        <button class="class-card-delete-btn" title="${c.name} sınıfını sil" onclick="event.stopPropagation(); app.confirmDeleteClassById('${c.id}', '${c.name}')">
                            🗑️
                        </button>
                    </div>
                    <h3 class="class-card-title">${c.name}</h3>
                    <div class="class-card-meta">
                        <span class="class-card-badge students-count">👥 ${count} Öğrenci</span>
                        <span class="class-card-badge">🎯 Çarkıfelek & Kart</span>
                    </div>
                </div>
                <div class="class-card-action">
                    <button class="btn btn-primary">
                        🚀 Derse Başla
                    </button>
                </div>
            `;

            card.addEventListener('click', () => {
                this.selectClassAndEnter(c.id);
            });

            grid.appendChild(card);
        });

        // En sona Yeni Sınıf Ekleme Kartı
        const createCard = document.createElement('div');
        createCard.className = 'class-card-create';
        createCard.innerHTML = `
            <div class="create-icon-circle">➕</div>
            <h3>Yeni Sınıf Ekle</h3>
            <p>Listenize yeni bir şube veya grup ekleyin</p>
        `;
        createCard.addEventListener('click', () => {
            this.openNewClassModal();
        });
        grid.appendChild(createCard);
    }

    async fetchStudentCounts() {
        this.classStudentCounts = {};
        if (supabaseClient && !this.isDemoMode) {
            try {
                const { data, error } = await supabaseClient
                    .from('students')
                    .select('id, class_id');

                if (!error && data) {
                    data.forEach(s => {
                        this.classStudentCounts[s.class_id] = (this.classStudentCounts[s.class_id] || 0) + 1;
                    });
                }
            } catch (e) {
                console.warn('Öğrenci sayıları alınamadı:', e);
            }
        } else {
            this.classes.forEach(c => {
                const stored = localStorage.getItem(`ogrencisec_local_students_${c.id}`);
                if (stored) {
                    try {
                        const parsed = JSON.parse(stored);
                        this.classStudentCounts[c.id] = parsed.length;
                    } catch (e) {
                        this.classStudentCounts[c.id] = 0;
                    }
                } else if (c.id === 'c1') {
                    this.classStudentCounts[c.id] = 10;
                } else {
                    this.classStudentCounts[c.id] = 0;
                }
            });
        }
    }

    async selectClassAndEnter(classId) {
        sound.playClick();
        await this.selectClass(classId);
        this.showScreen('boardScreen');
        sound.playWin();
    }

    async loadClasses() {
        if (supabaseClient && this.currentTeacher?.id && !this.isDemoMode) {
            try {
                const { data, error } = await supabaseClient
                    .from('classes')
                    .select('*')
                    .eq('teacher_id', this.currentTeacher.id)
                    .order('created_at', { ascending: true });

                if (error) {
                    console.error('Supabase sınıflar getirilemedi:', error);
                } else if (data) {
                    this.classes = data;
                }
            } catch (err) {
                console.error('Sınıflar yüklenemedi:', err);
            }
        } else {
            this.isDemoMode = true;
            const savedClasses = localStorage.getItem('ogrencisec_local_classes');
            if (savedClasses) {
                try {
                    this.classes = JSON.parse(savedClasses);
                } catch (e) {
                    this.loadDemoData();
                }
            } else {
                this.loadDemoData();
            }
        }

        this.renderClassSelector();
    }

    loadDemoData() {
        this.classes = [
            { id: 'c1', name: '10-A Matematik' },
            { id: 'c2', name: '11-B İleri Matematik' }
        ];

        const demoStudents = [
            { id: 's1', class_id: 'c1', student_number: '102', first_name: 'Ahmet', last_name: 'Yılmaz', board_count: 0, plus_count: 1, minus_count: 0, is_absent: false },
            { id: 's2', class_id: 'c1', student_number: '145', first_name: 'Zeynep', last_name: 'Kaya', board_count: 2, plus_count: 3, minus_count: 0, is_absent: false },
            { id: 's3', class_id: 'c1', student_number: '189', first_name: 'Mehmet Ali', last_name: 'Demir', board_count: 0, plus_count: 0, minus_count: 1, is_absent: false },
            { id: 's4', class_id: 'c1', student_number: '204', first_name: 'Elif Sena', last_name: 'Çelik', board_count: 1, plus_count: 2, minus_count: 0, is_absent: false },
            { id: 's5', class_id: 'c1', student_number: '230', first_name: 'Burak', last_name: 'Öztürk', board_count: 0, plus_count: 1, minus_count: 0, is_absent: false },
            { id: 's6', class_id: 'c1', student_number: '277', first_name: 'Fatma', last_name: 'Yıldız', board_count: 3, plus_count: 4, minus_count: 1, is_absent: false },
            { id: 's7', class_id: 'c1', student_number: '312', first_name: 'Can', last_name: 'Aydın', board_count: 1, plus_count: 0, minus_count: 0, is_absent: false },
            { id: 's8', class_id: 'c1', student_number: '350', first_name: 'Ece', last_name: 'Koç', board_count: 0, plus_count: 2, minus_count: 0, is_absent: false },
            { id: 's9', class_id: 'c1', student_number: '388', first_name: 'Emre', last_name: 'Arslan', board_count: 1, plus_count: 1, minus_count: 1, is_absent: false },
            { id: 's10', class_id: 'c1', student_number: '420', first_name: 'Ayşe', last_name: 'Şahin', board_count: 0, plus_count: 0, minus_count: 0, is_absent: false }
        ];

        localStorage.setItem('ogrencisec_local_classes', JSON.stringify(this.classes));
        localStorage.setItem('ogrencisec_local_students_c1', JSON.stringify(demoStudents));
    }

    renderClassSelector() {
        const select = document.getElementById('classSelect');
        const activeLabel = document.getElementById('activeClassLabel');
        if (!select) return;
        select.innerHTML = '';

        if (this.classes.length === 0) {
            select.innerHTML = '<option value="">Henüz sınıf yok</option>';
            if (activeLabel) activeLabel.textContent = 'Sınıf Yok';
            return;
        }

        this.classes.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            if (this.currentClass && this.currentClass.id === c.id) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });

        if (this.currentClass) {
            select.value = this.currentClass.id;
            if (activeLabel) activeLabel.textContent = this.currentClass.name;
        } else if (activeLabel) {
            activeLabel.textContent = 'Sınıf Seçiniz';
        }
    }

    async selectClass(classId) {
        this.currentClass = this.classes.find(c => c.id === classId) || null;
        if (!this.currentClass) return;

        localStorage.setItem('ogrencisec_last_class_id', classId);

        // UI Senkronizasyonu (Dropdown ve Üst Bar Buton Başlığı)
        const select = document.getElementById('classSelect');
        if (select) select.value = classId;

        const activeLabel = document.getElementById('activeClassLabel');
        if (activeLabel) activeLabel.textContent = this.currentClass.name;

        // Eski kazanan öğrenci pop-up'ını temizle
        this.activeWinner = null;
        this.closeWinnerModal();

        if (supabaseClient && !this.isDemoMode) {
            try {
                // Sınıfın en taze bilgilerini çek (wheel_state ve game_records dahil)
                const { data: freshClass } = await supabaseClient
                    .from('classes')
                    .select('*')
                    .eq('id', classId)
                    .maybeSingle();

                if (freshClass) {
                    this.currentClass = freshClass;
                    const cIdx = this.classes.findIndex(c => c.id === classId);
                    if (cIdx !== -1) this.classes[cIdx] = freshClass;
                }

                const { data, error } = await supabaseClient
                    .from('students')
                    .select('*')
                    .eq('class_id', classId)
                    .order('student_number', { ascending: true });

                if (error) {
                    console.error('Öğrenciler getirilemedi (Supabase):', error);
                } else if (data) {
                    this.students = data;
                }
            } catch (err) {
                console.error('Öğrenciler getirilemedi:', err);
            }
        } else {
            const stored = localStorage.getItem(`ogrencisec_local_students_${classId}`);
            if (stored) {
                this.students = JSON.parse(stored);
            } else if (classId === 'c1') {
                this.loadDemoData();
                const reloaded = localStorage.getItem('ogrencisec_local_students_c1');
                this.students = reloaded ? JSON.parse(reloaded) : [];
            } else {
                this.students = [];
            }
        }

        this.sortStudents();
        picker.setStudents(this.students, classId, this.currentClass?.wheel_state);
        if (window.miniGames) {
            window.miniGames.loadRecords();
        }
        this.renderRoster();
        this.updateStatsBar();

        if (this.currentClass) {
            if (picker.calledStudentIds.size > 0) {
                this.showToast(`🎯 "${this.currentClass.name}" yüklendi: Daha önce ${picker.calledStudentIds.size} öğrenci kalkmıştı. Çarktaki Kalan: ${picker.remainingStudents.length} öğrenci`, 'info');
            } else {
                this.showToast(`🚀 "${this.currentClass.name}" hazır. Çarktaki Kalan: ${picker.remainingStudents.length} / ${picker.allEligibleStudents.length}`, 'info');
            }
        }
    }

    sortStudents() {
        this.students.sort((a, b) => {
            const numA = parseInt(a.student_number, 10);
            const numB = parseInt(b.student_number, 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return (a.student_number || '').localeCompare(b.student_number || '');
        });
    }

    renderRoster() {
        const container = document.getElementById('rosterList');
        const countBadge = document.getElementById('rosterTotalCount');
        if (!container) return;

        if (countBadge) countBadge.textContent = `${this.students.length} Öğrenci`;

        if (this.students.length === 0) {
            container.innerHTML = `
                <div class="empty-roster" style="padding: 24px; text-align: center; color: var(--text-muted);">
                    <p style="margin-bottom: 12px;">Bu sınıfta henüz öğrenci yok.</p>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <button class="btn btn-primary btn-sm" onclick="app.openNewStudentModal()">
                            ➕ Yeni Öğrenci Ekle
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="app.openImportModal()">
                            📁 e-Okul Listesi Yükle
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        this.students.forEach(student => {
            const item = document.createElement('div');
            item.className = `roster-item ${student.is_absent ? 'absent' : ''}`;
            item.id = `roster-item-${student.id}`;

            const initials = getStudentInitials(student);

            // Turlu seçim durumu (Bu tur kalkanlar kümesinde mi?)
            const isEliminatedThisRound = !student.is_absent && picker.isEliminationMode && picker.calledStudentIds.has(String(student.id));

            const roundBadgeHtml = student.is_absent 
                ? '' 
                : (isEliminatedThisRound 
                    ? `<button class="stat-badge called-badge" onclick="event.stopPropagation(); app.returnStudentToWheel('${student.id}')" title="Bu turda kalktı. Tıklayarak çarka geri iade edebilirsiniz">✓ Kalktı ↩️</button>` 
                    : `<span class="stat-badge in-wheel-badge" title="Çarkta bekliyor">🎡 Çarkta</span>`);

            item.innerHTML = `
                <div class="roster-avatar">${initials}</div>
                <div class="roster-info">
                    <span class="roster-num">${student.student_number}</span>
                    <span class="roster-name">${student.first_name} ${student.last_name}</span>
                </div>
                <div class="roster-stats">
                    ${roundBadgeHtml}
                    <span class="stat-badge board-badge" title="Toplam Tahtaya Kalkma Sayısı">🎯 ${student.board_count || 0}</span>
                    <span class="stat-badge plus-badge" title="Artı Puan">➕ ${student.plus_count || 0}</span>
                    <span class="stat-badge minus-badge" title="Eksi Puan">➖ ${student.minus_count || 0}</span>
                </div>
                <div class="roster-item-actions">
                    <button class="btn-absent-toggle ${student.is_absent ? 'is-absent' : ''}" 
                            title="${student.is_absent ? 'Derste Yok (Tıkla ve Geldi Yap)' : 'Derste Var (Tıkla ve Yok Yap)'}"
                            onclick="event.stopPropagation(); app.toggleAbsent('${student.id}')">
                        ${student.is_absent ? 'Yok' : 'Var'}
                    </button>
                    <button class="btn-roster-delete" 
                            title="${student.first_name} ${student.last_name} isimli öğrenciyi sınıftan sil" 
                            onclick="event.stopPropagation(); app.confirmDeleteStudent('${student.id}')">
                        🗑️
                    </button>
                </div>
            `;
            container.appendChild(item);
        });
    }

    showRoundCompletedNotification(round) {
        sound.playWin();
        triggerConfetti();

        let toast = document.getElementById('roundNotificationToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'roundNotificationToast';
            toast.className = 'round-notification-toast';
            document.body.appendChild(toast);
        }

        toast.innerHTML = `🎉 <strong>Tüm Sınıf Tahtaya Kalktı!</strong> Çark tekrar dolduruldu (${round}. Tur)`;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }

    updateStatsBar() {
        const totalEl = document.getElementById('statTotalStudents');
        const presentEl = document.getElementById('statPresentStudents');
        const boardEl = document.getElementById('statTotalBoardCalled');

        const presentCount = this.students.filter(s => !s.is_absent).length;
        const totalCalled = this.students.reduce((acc, s) => acc + (s.board_count || 0), 0);

        if (totalEl) totalEl.textContent = this.students.length;
        if (presentEl) presentEl.textContent = presentCount;
        if (boardEl) boardEl.textContent = totalCalled;
    }

    async toggleAbsent(studentId) {
        sound.playClick();
        const student = this.students.find(s => s.id === studentId);
        if (!student) return;

        student.is_absent = !student.is_absent;
        picker.setStudents(this.students, this.currentClass?.id);
        this.renderRoster();
        this.updateStatsBar();

        if (supabaseClient && !this.isDemoMode) {
            try {
                await supabaseClient
                    .from('students')
                    .update({ is_absent: student.is_absent })
                    .eq('id', studentId);
            } catch (err) {
                console.error('Yoklama güncellenemedi:', err);
            }
        } else {
            this.saveLocalStudents();
        }
    }

    showWinnerModal(student) {
        this.activeWinner = student;
        this.currentSelectionBoardIncremented = false; // Yeni seçimde henüz tahtaya kalktı sayılmadı
        const modal = document.getElementById('winnerModal');
        const nameEl = document.getElementById('winnerName');
        const numEl = document.getElementById('winnerNumber');
        const countEl = document.getElementById('winnerBoardCount');
        const plusEl = document.getElementById('winnerPlusCount');
        const minusEl = document.getElementById('winnerMinusCount');
        const avatarEl = document.getElementById('winnerAvatar');

        if (nameEl) nameEl.textContent = `${student.first_name} ${student.last_name}`;
        if (numEl) numEl.textContent = `Öğrenci No: ${student.student_number}`;
        if (countEl) countEl.textContent = student.board_count || 0;
        if (plusEl) plusEl.textContent = student.plus_count || 0;
        if (minusEl) minusEl.textContent = student.minus_count || 0;

        if (avatarEl) {
            const initials = getStudentInitials(student);
            avatarEl.innerHTML = initials;
        }

        if (modal) modal.classList.add('active');
    }

    closeWinnerModal() {
        const modal = document.getElementById('winnerModal');
        if (modal) modal.classList.remove('active');
        this.activeWinner = null;
        this.currentSelectionBoardIncremented = false;
    }

    // Kazanan öğrenci için mini oyunu başlat
    openMiniGameForWinner() {
        if (!this.activeWinner) return;
        sound.playWin();
        const student = this.activeWinner;
        // Kazanan modalını kapatıp mini oyun sahnesini aç
        this.closeWinnerModal();
        if (window.miniGames) {
            window.miniGames.startRandomGame(student);
        }
    }

    // Kazanan Modalından Seçimi İptal Etme & Çarka İade Etme
    async undoCurrentSelection() {
        if (!this.activeWinner) return;
        sound.playTick();

        const student = this.activeWinner;

        // Eğer modal açıkken "Tahtaya Kalktı (+1)" butonuna basılmışsa, geri düşür
        if (this.currentSelectionBoardIncremented) {
            student.board_count = Math.max(0, (student.board_count || 1) - 1);
            await this.syncStudentUpdate(student, { board_count: student.board_count });
            this.currentSelectionBoardIncremented = false;
        }

        this.closeWinnerModal();

        // Öğrenciyi çarka iade et
        picker.returnStudentToPool(student.id, true);
    }

    // Sağ listeden veya herhangi bir yerden öğrenciyi çarka geri gönderme
    returnStudentToWheel(studentId) {
        picker.returnStudentToPool(studentId);
    }

    // Geri alma bildirim toast'u
    showUndoNotification(student) {
        let toast = document.getElementById('roundNotificationToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'roundNotificationToast';
            toast.className = 'round-notification-toast';
            document.body.appendChild(toast);
        }

        toast.style.background = 'linear-gradient(135deg, rgba(244, 63, 94, 0.95), rgba(159, 18, 57, 0.95))';
        toast.style.borderColor = 'rgba(251, 113, 133, 0.5)';
        toast.innerHTML = `↩️ <strong>${student.first_name} ${student.last_name}</strong> çarka geri eklendi!`;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
            toast.style.background = '';
            toast.style.borderColor = '';
        }, 2500);
    }

    // Genel Bildirim Toast'u (Hata / Uyarı / Başarı)
    showToast(message, type = 'info') {
        let toast = document.getElementById('appGeneralToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'appGeneralToast';
            toast.className = 'round-notification-toast';
            document.body.appendChild(toast);
        }

        if (type === 'error') {
            toast.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95))';
            toast.style.borderColor = 'rgba(248, 113, 113, 0.6)';
        } else if (type === 'warning') {
            toast.style.background = 'linear-gradient(135deg, rgba(245, 158, 11, 0.95), rgba(180, 83, 9, 0.95))';
            toast.style.borderColor = 'rgba(251, 191, 36, 0.6)';
        } else {
            toast.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95))';
            toast.style.borderColor = 'rgba(52, 211, 153, 0.6)';
        }

        toast.innerHTML = message;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }

    // Sağ Yan Panel (Sınıf Listesi) Aç/Kapa
    toggleRosterSidebar() {
        sound.playClick();
        const sidebar = document.getElementById('rosterSidebar');
        const btn = document.getElementById('btnToggleRoster');
        if (!sidebar) return;

        const isOpen = sidebar.classList.toggle('open');
        if (btn) btn.classList.toggle('active', isOpen);

        setTimeout(() => {
            picker.resizeCanvas();
        }, 320);
    }

    closeRosterSidebar() {
        const sidebar = document.getElementById('rosterSidebar');
        const btn = document.getElementById('btnToggleRoster');
        if (sidebar) sidebar.classList.remove('open');
        if (btn) btn.classList.remove('active');

        setTimeout(() => {
            picker.resizeCanvas();
        }, 320);
    }

    async incrementBoardCount() {
        if (!this.activeWinner) return;
        sound.playTick();

        this.activeWinner.board_count = (this.activeWinner.board_count || 0) + 1;
        this.activeWinner.last_called_at = new Date().toISOString();
        this.currentSelectionBoardIncremented = true;

        await this.syncStudentUpdate(this.activeWinner, {
            board_count: this.activeWinner.board_count,
            last_called_at: this.activeWinner.last_called_at
        });

        const countEl = document.getElementById('winnerBoardCount');
        if (countEl) countEl.textContent = this.activeWinner.board_count;

        this.renderRoster();
        this.updateStatsBar();
    }

    async addPlus() {
        if (!this.activeWinner) return;
        sound.playPlus();

        this.activeWinner.plus_count = (this.activeWinner.plus_count || 0) + 1;
        await this.syncStudentUpdate(this.activeWinner, { plus_count: this.activeWinner.plus_count });

        const plusEl = document.getElementById('winnerPlusCount');
        if (plusEl) plusEl.textContent = this.activeWinner.plus_count;

        this.renderRoster();
    }

    async addMinus() {
        if (!this.activeWinner) return;
        sound.playMinus();

        this.activeWinner.minus_count = (this.activeWinner.minus_count || 0) + 1;
        await this.syncStudentUpdate(this.activeWinner, { minus_count: this.activeWinner.minus_count });

        const minusEl = document.getElementById('winnerMinusCount');
        if (minusEl) minusEl.textContent = this.activeWinner.minus_count;

        this.renderRoster();
    }

    async syncStudentUpdate(student, updates) {
        if (!student || !student.id) return;

        // 1. Yerel hafızaya daima anında kaydet
        this.saveLocalStudents();

        // 2. Senkronizasyon kuyruğuna aktar (Çevrimdışı / Çevrimiçi güvenli aktarım)
        if (window.syncQueue) {
            window.syncQueue.enqueue('student_update', {
                studentId: student.id,
                classId: student.class_id || this.currentClass?.id,
                updates: updates
            });
        } else if (supabaseClient && !this.isDemoMode) {
            try {
                let query = supabaseClient.from('students').update(updates).eq('id', student.id);
                if (student.class_id) {
                    query = query.eq('class_id', student.class_id);
                }
                await query;
            } catch (err) {
                console.warn('Öğrenci güncellenemedi:', err);
            }
        }
    }

    saveLocalStudents() {
        if (this.currentClass) {
            localStorage.setItem(`ogrencisec_local_students_${this.currentClass.id}`, JSON.stringify(this.students));
        }
    }

    // =========================================================================
    // TEK ÖĞRENCİ EKLEME YÖNTEMLERİ
    // =========================================================================
    openNewStudentModal() {
        if (!this.currentClass) {
            alert('Lütfen önce bir sınıf seçin veya ➕ Sınıf butonundan yeni bir sınıf oluşturun.');
            return;
        }
        const modal = document.getElementById('newStudentModal');
        if (modal) {
            modal.classList.add('active');
            const noInput = document.getElementById('newStudentNo');
            if (noInput) {
                noInput.value = '';
                noInput.focus();
            }
            const firstInput = document.getElementById('newStudentFirstName');
            if (firstInput) firstInput.value = '';
            const lastInput = document.getElementById('newStudentLastName');
            if (lastInput) lastInput.value = '';
        }
    }

    closeStudentModal() {
        const modal = document.getElementById('newStudentModal');
        if (modal) modal.classList.remove('active');
    }

    submitSingleStudent() {
        const no = document.getElementById('newStudentNo')?.value?.trim();
        const first = document.getElementById('newStudentFirstName')?.value?.trim();
        const last = document.getElementById('newStudentLastName')?.value?.trim();

        if (!no || !first || !last) {
            alert('Lütfen öğrenci no, ad ve soyad alanlarının hepsini doldurunuz.');
            return;
        }

        this.addSingleStudent(no, first, last);
    }

    async addSingleStudent(studentNumber, firstName, lastName) {
        if (!this.currentClass) {
            alert('Lütfen önce bir sınıf seçiniz.');
            return;
        }

        const studentData = {
            class_id: this.currentClass.id,
            student_number: studentNumber,
            first_name: firstName,
            last_name: lastName,
            board_count: 0,
            plus_count: 0,
            minus_count: 0,
            is_absent: false
        };

        if (supabaseClient && !this.isDemoMode) {
            try {
                const { data, error } = await supabaseClient
                    .from('students')
                    .insert([studentData])
                    .select()
                    .single();

                if (error) {
                    console.error('Öğrenci ekleme hatası:', error);
                    alert('Öğrenci veritabanına eklenemedi: ' + error.message);
                    return;
                }

                if (data) {
                    this.students.push(data);
                    this.sortStudents();
                    picker.setStudents(this.students, this.currentClass?.id);
                    this.renderRoster();
                    this.updateStatsBar();
                    sound.playWin();
                    this.closeStudentModal();
                    alert(`✅ ${data.first_name} ${data.last_name} (#${data.student_number}) başarıyla Supabase veritabanına kaydedildi!`);
                    return;
                }
            } catch (err) {
                console.error('Öğrenci ekleme hatası:', err);
                alert('Öğrenci ekleme hatası: ' + err.message);
                return;
            }
        }

        // Demo modu
        studentData.id = 's_' + Date.now().toString(36);
        this.students.push(studentData);
        this.sortStudents();
        this.saveLocalStudents();
        picker.setStudents(this.students, this.currentClass?.id);
        this.renderRoster();
        this.updateStatsBar();
        sound.playWin();
        this.closeStudentModal();
        alert(`ℹ️ ${studentData.first_name} ${studentData.last_name} eklendi (Demo / Çevrimdışı modda yerel hafızaya kaydedildi).`);
    }

    // =========================================================================
    // e-OKUL / EXCEL İÇE AKTARMA
    // =========================================================================
    openImportModal() {
        const modal = document.getElementById('importModal');
        if (modal) {
            const badge = document.getElementById('pdfStatusBadge');
            const hint = document.getElementById('importSummaryHint');
            const fileInput = document.getElementById('pdfFileInput');
            const textarea = document.getElementById('importTextarea');
            if (badge) badge.style.display = 'none';
            if (hint) hint.textContent = '';
            if (fileInput) fileInput.value = '';
            if (textarea) textarea.value = '';
            modal.classList.add('active');
        }
    }

    closeImportModal() {
        const modal = document.getElementById('importModal');
        if (modal) modal.classList.remove('active');
    }

    handlePdfFileInput(input) {
        if (input.files && input.files.length > 0) {
            this.handlePdfFile(input.files[0]);
        }
    }

    async handlePdfFile(file) {
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
            alert('Lütfen geçerli bir e-Okul PDF dosyası seçiniz.');
            return;
        }

        const badge = document.getElementById('pdfStatusBadge');
        const textarea = document.getElementById('importTextarea');
        const hint = document.getElementById('importSummaryHint');

        if (badge) {
            badge.className = 'pdf-status-badge loading';
            badge.style.display = 'flex';
            badge.innerHTML = `<span>⏳</span> <strong>${file.name}</strong> okunuyor ve öğrenciler ayrıştırılıyor...`;
        }

        try {
            const result = await this.parseEOkulPdf(file);
            
            if (!result.students || result.students.length === 0) {
                if (badge) {
                    badge.className = 'pdf-status-badge error';
                    badge.innerHTML = `<span>⚠️</span> PDF içinde öğrenci tablosu bulunamadı. Lütfen e-Okul sınıf listesi PDF'i olduğundan emin olun.`;
                }
                return;
            }

            this.pendingImportClassName = result.className || '';

            // Metin kutusuna KULLANICI İSTEĞİ: Sadece "Numara [TAB] Ad Soyad" yaz (Kız/Erkek ve dipnotlar yok)
            const textLines = result.students.map(s => `${s.student_number}\t${s.fullName}`);
            if (textarea) {
                textarea.value = textLines.join('\n');
            }

            const classText = result.className ? `<strong>${result.className} Sınıfı</strong> • ` : '';

            if (badge) {
                badge.className = 'pdf-status-badge success';
                badge.innerHTML = `<span>🎉</span> <div>${classText}<strong>${result.students.length} Öğrenci</strong> başarıyla aktarıldı</div>`;
            }

            if (hint) {
                hint.textContent = `✅ ${result.students.length} öğrenci hazır`;
            }

            sound.playWin();

            // Eğer şu an seçili sınıf yoksa ve PDF'ten sınıf adı çıktıysa otomatik sınıf oluşturmayı teklif et
            if (!this.currentClass && result.className) {
                const autoCreate = confirm(`PDF belgesinden "${result.className}" sınıfı tespit edildi.\n\nBu sınıf otomatik olarak oluşturulup öğrenciler eklensin mi?`);
                if (autoCreate) {
                    await this.createNewClass(result.className);
                }
            }

        } catch (err) {
            console.error('PDF işleme hatası:', err);
            if (badge) {
                badge.className = 'pdf-status-badge error';
                badge.innerHTML = `<span>❌</span> PDF okunurken bir hata oluştu: ${err.message || err}`;
            }
        }
    }

    async parseEOkulPdf(file) {
        if (!window.pdfjsLib) {
            throw new Error('PDF okuyucu kütüphanesi henüz yüklenmedi. Lütfen internet bağlantınızı kontrol edip sayfayı yenileyiniz.');
        }

        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        let allStudents = [];
        let detectedClassName = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.0 });

            // Kelimeleri ve dikey/yatay koordinatlarını ayıkla
            const words = [];
            for (const item of textContent.items) {
                const str = (item.str || '').trim();
                if (!str) continue;
                
                const x = item.transform[4];
                const y = viewport.height - item.transform[5]; // Üstten alta dikey koordinat
                const width = item.width || 0;
                words.push({ text: str, x: x, y: y, width: width });
            }

            // 1. Sınıf Adını Başlıktan Çıkar (Örn: 7. Sınıf / B Şubesi -> 7/B)
            if (!detectedClassName) {
                const fullText = words.map(w => w.text).join(' ');
                const match = fullText.match(/(\d{1,2})\s*\.?\s*Sınıf\s*[\/\-]\s*([A-Za-zÇĞİÖŞÜçğıöşü]+)\s*Şubesi/i);
                if (match) {
                    detectedClassName = `${match[1]}/${match[2].toLocaleUpperCase('tr-TR')}`;
                }
            }

            // 2. Kelimeleri Dikey (y) Satırlarına Göre Grupla (tolerans: 4.5px)
            words.sort((a, b) => (a.y - b.y) || (a.x - b.x));
            const rows = [];
            let currentRow = [];
            let lastY = null;

            for (const w of words) {
                if (lastY === null || Math.abs(w.y - lastY) <= 4.5) {
                    currentRow.push(w);
                    if (lastY === null) lastY = w.y;
                } else {
                    rows.push(currentRow.sort((a, b) => a.x - b.x));
                    currentRow = [w];
                    lastY = w.y;
                }
            }
            if (currentRow.length > 0) {
                rows.push(currentRow.sort((a, b) => a.x - b.x));
            }

            // 3. Satırlardan SADECE Öğrenci Satırlarını Ayrıştır (Dipnotları ve Başlıkları ele)
            for (const row of rows) {
                const rowText = row.map(w => w.text).join(' ');

                // Başlık veya alt özet/tarih satırlarını kesin olarak atla
                if (/s\.?\s*no|say[ıi]s[ıi]|toplam|valili|müdürlü|öğretmen|başkan|\d{2}[\/\.]\d{2}[\/\.]\d{4}|\d{2}:\d{2}:\d{2}/i.test(rowText)) {
                    continue;
                }

                // Sütun koordinat filtreleri
                // Okul No: 55 <= x < 160
                const noItems = row.filter(w => w.x >= 55 && w.x < 160).sort((a, b) => a.x - b.x);
                let no = noItems.map(w => w.text).join('').replace(/\D/g, '');

                // Ad ve Soyad: 160 <= x < 460
                const nameItems = row.filter(w => w.x >= 155 && w.x < 460).sort((a, b) => a.x - b.x);
                let rawName = '';
                let lastX1 = null;

                for (const item of nameItems) {
                    if (lastX1 !== null && (item.x - lastX1) > 2.0) {
                        rawName += ' ';
                    }
                    rawName += item.text;
                    lastX1 = item.x + (item.width || 0);
                }

                // Türkçe ayrık kalmış harfleri düzelt (Örn: "DURMU Ş AL İ" -> "DURMUŞ ALİ", "ÇARBO Ğ A" -> "ÇARBOĞA")
                let cleanName = rawName.trim();
                let prev = '';
                while (prev !== cleanName) {
                    prev = cleanName;
                    cleanName = cleanName
                        .replace(/([A-ZÇĞİÖŞÜa-zçğıöşü]+)\s+([İIĞŞÇÖÜıüğşçö])(?=\s|$)/g, '$1$2')
                        .replace(/(^|\s)([İIĞŞÇÖÜıüğşçö])\s+([A-ZÇĞİÖŞÜa-zçğıöşü]+)/g, '$1$2$3');
                }

                // Cinsiyet (Erkek / Kız): Arka plan veri tabanı için
                const genderItems = row.filter(w => w.x >= 460);
                const genderText = genderItems.map(w => w.text).join(' ');
                let cleanGender = /kız/i.test(genderText) ? 'Kız' : 'Erkek';

                // Eğer geçerli öğrenci numarası ve ad varsa listeye al
                if (no && no.length >= 1 && no.length <= 5 && cleanName && !/sayısı|toplam/i.test(cleanName)) {
                    allStudents.push({
                        student_number: no,
                        fullName: cleanName,
                        gender: cleanGender
                    });
                }
            }
        }

        return {
            className: detectedClassName,
            students: allStudents
        };
    }

    processImportText() {
        const textarea = document.getElementById('importTextarea');
        if (!textarea || !textarea.value.trim()) {
            alert('Lütfen e-Okul, Excel veya metin dosyasından kopyalanan öğrenci listesini yapıştırınız.');
            return;
        }

        const lines = textarea.value.trim().split('\n');
        const parsed = [];

        for (const line of lines) {
            let trimmed = line.trim();
            if (!trimmed) continue;

            // Başlık satırı kontrolü (S.No, Öğrenci No, Adı, Soyadı...)
            if (/^(s\.?\s*no|öğrenci\s*no|sira|okul\s*no|numara|ad[ıi]?\s*soyad)/i.test(trimmed)) {
                continue;
            }

            // Alt bilgi (footer), tarih ve dipnot filtreleri (Örn: 21 Erkek Öğrenci Sayısı, Tarih, Saat)
            if (/say[ıi]s[ıi]|toplam\s*ö|valili|müdürlü|öğretmen|başkan|\d{2}[\/\.]\d{2}[\/\.]\d{4}|\d{2}:\d{2}:\d{2}/i.test(trimmed)) {
                continue;
            }

            // 1. Önce Tab (\t), virgül (,) veya noktalı virgül (;) ile ayır (Excel, CSV)
            let parts = trimmed.split(/[\t,;]/).map(p => p.trim()).filter(Boolean);

            // 2. Tab veya virgül yoksa, tire (-) ile ayrılmış olabilir mi?
            if (parts.length < 2 && /[-–—]/.test(trimmed)) {
                parts = trimmed.split(/\s*[-–—]\s*/).map(p => p.trim()).filter(Boolean);
            }

            // 3. Hala tek parça ise, boşluklara göre ayrıştır (Düz Metin / .txt / Word dosyaları)
            if (parts.length < 2) {
                const tokens = trimmed.split(/\s+/).filter(Boolean);

                if (tokens.length >= 2) {
                    const cleanFirst = tokens[0].replace(/[\.:]$/, '');
                    
                    if (/^\d+$/.test(cleanFirst)) {
                        // İlk eleman sayı (Örn: "102 Ahmet Yılmaz" veya "1 102 Ahmet Yılmaz")
                        const cleanSecond = tokens[1].replace(/[\.:]$/, '');
                        if (tokens.length >= 3 && /^\d+$/.test(cleanSecond)) {
                            // "1 102 Ahmet Yılmaz" -> Sıra No, Öğrenci No, İsim
                            parts = [cleanFirst, cleanSecond, tokens.slice(2).join(' ')];
                        } else {
                            // "102 Ahmet Yılmaz" -> Öğrenci No, İsim
                            parts = [cleanFirst, tokens.slice(1).join(' ')];
                        }
                    } else {
                        // Başta numara yok (Örn: "Ahmet Yılmaz")
                        parts = [String(parsed.length + 1), tokens.join(' ')];
                    }
                } else if (tokens.length === 1 && !/^\d+$/.test(tokens[0])) {
                    // Tek kelime isim (Örn: "Ahmet")
                    parts = [String(parsed.length + 1), tokens[0]];
                }
            }

            if (parts.length >= 2) {
                let number = '';
                let firstName = '';
                let lastName = '';
                let gender = '';

                // Durum 1: 5 veya daha fazla sütun (e-Okul tam liste: S.No | Öğrenci No | Adı | Soyadı | Cinsiyeti)
                if (parts.length >= 5 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
                    number = parts[1];
                    firstName = parts[2];
                    lastName = parts[3];
                    gender = /kız|bayan|f/i.test(parts[4]) ? 'Kız' : 'Erkek';
                }
                // Durum 2: 4 sütun ve Sıra No + Öğrenci No (S.No | Öğrenci No | Ad Soyad | Cinsiyeti)
                else if (parts.length === 4 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
                    number = parts[1];
                    gender = /kız|bayan|f/i.test(parts[3]) ? 'Kız' : 'Erkek';
                    const nameWords = parts[2].split(' ').filter(Boolean);
                    lastName = nameWords.length > 1 ? nameWords.pop() : '';
                    firstName = nameWords.join(' ');
                }
                // Durum 3: 4 sütun standart (Öğrenci No | Adı | Soyadı | Cinsiyeti)
                else if (parts.length === 4 && /^\d+$/.test(parts[0])) {
                    number = parts[0];
                    firstName = parts[1];
                    lastName = parts[2];
                    gender = /kız|bayan|f/i.test(parts[3]) ? 'Kız' : 'Erkek';
                }
                // Durum 4: 3 sütun ve Sıra No + Öğrenci No + Ad Soyad (Örn: 1 | 102 | Ahmet Yılmaz)
                else if (parts.length === 3 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
                    number = parts[1];
                    let fullName = parts[2];
                    let nameWords = fullName.split(' ').filter(Boolean);
                    if (nameWords.length > 1 && /^(kız|erkek|k|e|bayan|bay)$/i.test(nameWords[nameWords.length - 1])) {
                        const gWord = nameWords.pop().toLowerCase();
                        gender = (gWord === 'kız' || gWord === 'k' || gWord === 'bayan') ? 'Kız' : 'Erkek';
                    }
                    lastName = nameWords.length > 1 ? nameWords.pop() : '';
                    firstName = nameWords.join(' ');
                }
                // Durum 5: 3 sütun (Öğrenci No | Ad Soyad | Cinsiyeti)
                else if (parts.length === 3 && (/kız|erkek/i.test(parts[2]))) {
                    number = parts[0];
                    gender = /kız/i.test(parts[2]) ? 'Kız' : 'Erkek';
                    const nameWords = parts[1].split(' ').filter(Boolean);
                    lastName = nameWords.length > 1 ? nameWords.pop() : '';
                    firstName = nameWords.join(' ');
                }
                // Durum 6: Standart 2 veya 3 sütun (No ve Ad Soyad)
                else {
                    let fullName = '';
                    if (/^\d+$/.test(parts[0])) {
                        number = parts[0];
                        fullName = parts.slice(1).join(' ');
                    } else if (/^\d+$/.test(parts[1])) {
                        number = parts[1];
                        fullName = [parts[0], ...parts.slice(2)].join(' ');
                    } else {
                        number = String(parsed.length + 1);
                        fullName = parts.join(' ');
                    }

                    // İsmin sonunda cinsiyet belirtilmiş mi? (Örn: "102 Ayşe Demir Kız")
                    let nameWords = fullName.split(' ').filter(Boolean);
                    if (nameWords.length > 1 && /^(kız|erkek|k|e|bayan|bay)$/i.test(nameWords[nameWords.length - 1])) {
                        const gWord = nameWords.pop().toLowerCase();
                        gender = (gWord === 'kız' || gWord === 'k' || gWord === 'bayan') ? 'Kız' : 'Erkek';
                    }

                    lastName = nameWords.length > 1 ? nameWords.pop() : '';
                    firstName = nameWords.join(' ');
                }

                // Cinsiyet tespit edilmediyse isimden otomatik tespit et
                if (!gender && typeof reportManager !== 'undefined' && reportManager.detectGender) {
                    gender = reportManager.detectGender(firstName);
                } else if (!gender) {
                    gender = 'Erkek';
                }

                // Sadece geçerli öğrenci numarası ve adı olan gerçek öğrencileri ekle (Dipnotları süz)
                if (number && /^\d+$/.test(number) && firstName && !/sayısı|toplam/i.test(firstName + ' ' + lastName)) {
                    parsed.push({
                        student_number: number,
                        first_name: firstName.trim(),
                        last_name: lastName.trim(),
                        gender: gender
                    });
                }
            }
        }

        if (parsed.length === 0) {
            alert('Geçerli öğrenci formatı bulunamadı. Lütfen e-Okul, Excel veya metin dosyasındaki listeyi yapıştırınız.');
            return;
        }

        this.saveImportedStudents(parsed);
    }

    async saveImportedStudents(parsedList) {
        if (!this.currentClass) {
            const defaultName = this.pendingImportClassName || 'Yeni Sınıf';
            const className = prompt('Öğrencilerin ekleneceği sınıfın adını onaylayınız:', defaultName);
            if (!className || !className.trim()) {
                alert('Lütfen önce bir sınıf seçin veya oluşturun.');
                return;
            }
            await this.createNewClass(className.trim());
            if (!this.currentClass) {
                alert('Sınıf oluşturulamadı. Lütfen tekrar deneyiniz.');
                return;
            }
        }

        const classId = this.currentClass.id;

        const dbPayload = parsedList.map(item => ({
            class_id: classId,
            student_number: item.student_number,
            first_name: item.first_name,
            last_name: item.last_name,
            board_count: 0,
            plus_count: 0,
            minus_count: 0,
            is_absent: false
        }));

        if (supabaseClient && !this.isDemoMode) {
            try {
                const { data, error } = await supabaseClient.from('students').insert(dbPayload).select();
                if (error) {
                    console.error('Supabase e-Okul yükleme hatası:', error);
                    alert('Öğrenciler veritabanına kaydedilemedi: ' + error.message);
                    return;
                }
                if (data) {
                    this.students = [...this.students, ...data];
                }
            } catch (err) {
                console.error('Supabase yükleme hatası:', err);
                alert('Öğrenci yükleme hatası: ' + err.message);
                return;
            }
        } else {
            const localStudents = dbPayload.map(s => ({
                ...s,
                id: 's_' + Math.random().toString(36).substr(2, 9)
            }));
            this.students = [...this.students, ...localStudents];
            this.saveLocalStudents();
        }

        this.sortStudents();
        picker.setStudents(this.students, classId, this.currentClass?.wheel_state);
        if (window.miniGames) {
            window.miniGames.loadRecords();
        }
        this.renderRoster();
        this.updateStatsBar();
        this.closeImportModal();
        sound.playWin();
        alert(`🎉 ${parsedList.length} öğrenci başarıyla "${this.currentClass.name}" sınıfına eklendi!`);
    }

    openNewClassModal() {
        const name = prompt('Yeni sınıf adını giriniz (Örn: 9-A, 10-B Matematik):');
        if (name && name.trim()) {
            this.createNewClass(name.trim());
        }
    }

    async createNewClass(className) {
        if (supabaseClient && this.currentTeacher?.id && !this.isDemoMode) {
            try {
                const { data, error } = await supabaseClient.from('classes').insert([
                    { teacher_id: this.currentTeacher.id, name: className }
                ]).select().single();

                if (error) {
                    console.error('Sınıf oluşturma hatası:', error);
                    alert('Sınıf Supabase veritabanına eklenemedi: ' + error.message);
                    return;
                }

                if (data) {
                    this.classes.push(data);
                    this.renderClassSelector();
                    await this.selectClass(data.id);
                    sound.playWin();
                    if (document.getElementById('classSelectScreen')?.classList.contains('active')) {
                        await this.renderClassHub();
                    }
                    alert(`✅ "${data.name}" sınıfı başarıyla Supabase bulut veritabanına kaydedildi!`);
                    return;
                }
            } catch (err) {
                console.error('Sınıf oluşturma hatası:', err);
                alert('Sınıf oluşturma sırasında bir hata oluştu: ' + err.message);
                return;
            }
        }

        // Demo modu
        const newClass = {
            id: 'c_' + Date.now().toString(36),
            teacher_id: this.currentTeacher?.id || 'demo-teacher',
            name: className
        };
        this.classes.push(newClass);
        localStorage.setItem('ogrencisec_local_classes', JSON.stringify(this.classes));
        this.renderClassSelector();
        await this.selectClass(newClass.id);
        sound.playWin();
        if (document.getElementById('classSelectScreen')?.classList.contains('active')) {
            await this.renderClassHub();
        }
        alert(`ℹ️ "${newClass.name}" sınıfı oluşturuldu (Şu an Demo / Çevrimdışı moddasınız, bu tarayıcıya geçici kaydedildi).`);
    }

    async confirmDeleteClassById(classId, className) {
        const msg = `⚠️ "${className}" sınıfını ve bu sınıfa ait tüm öğrencileri tamamen silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz!`;
        if (!confirm(msg)) return;

        sound.playClick();

        if (supabaseClient && !this.isDemoMode) {
            try {
                const { error } = await supabaseClient
                    .from('classes')
                    .delete()
                    .eq('id', classId);

                if (error) {
                    console.error('Sınıf silinemedi:', error);
                    alert('Sınıf veritabanından silinemedi: ' + error.message);
                    return;
                }
            } catch (err) {
                console.error('Sınıf silme hatası:', err);
                alert('Sınıf silinirken hata oluştu: ' + err.message);
                return;
            }
        } else {
            localStorage.removeItem(`ogrencisec_local_students_${classId}`);
        }

        this.classes = this.classes.filter(c => c.id !== classId);
        if (this.isDemoMode) {
            localStorage.setItem('ogrencisec_local_classes', JSON.stringify(this.classes));
        }

        if (this.currentClass && this.currentClass.id === classId) {
            this.currentClass = null;
            this.students = [];
            picker.setStudents([]);
            localStorage.removeItem('ogrencisec_last_class_id');
        }

        this.renderClassSelector();
        await this.renderClassHub();
        alert(`✅ "${className}" sınıfı başarıyla silindi.`);
    }

    async confirmDeleteCurrentClass() {
        if (!this.currentClass) {
            alert('Lütfen önce silmek istediğiniz sınıfı seçiniz.');
            return;
        }

        const className = this.currentClass.name;
        const studentCount = this.students ? this.students.length : 0;
        const msg = `⚠️ DİKKAT: "${className}" sınıfını ve bu sınıfa ait tüm öğrencileri (${studentCount} öğrenci) tamamen silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz!`;

        if (!confirm(msg)) return;

        sound.playClick();
        const classId = this.currentClass.id;

        if (supabaseClient && !this.isDemoMode) {
            try {
                const { error } = await supabaseClient
                    .from('classes')
                    .delete()
                    .eq('id', classId);

                if (error) {
                    console.error('Sınıf silinemedi:', error);
                    alert('Sınıf veritabanından silinemedi: ' + error.message);
                    return;
                }

                alert(`✅ "${className}" sınıfı ve tüm öğrencileri başarıyla silindi.`);
            } catch (err) {
                console.error('Sınıf silme hatası:', err);
                alert('Sınıf silinirken hata oluştu: ' + err.message);
                return;
            }
        } else {
            // Demo modu
            this.classes = this.classes.filter(c => c.id !== classId);
            localStorage.setItem('ogrencisec_local_classes', JSON.stringify(this.classes));
            localStorage.removeItem(`ogrencisec_local_students_${classId}`);
            alert(`ℹ️ "${className}" sınıfı silindi.`);
        }

        localStorage.removeItem('ogrencisec_last_class_id');
        this.currentClass = null;
        this.students = [];
        picker.setStudents([]);
        await this.loadClasses();
        // Sınıf silindikten sonra sınıflar ekranına dön
        this.showClassSelectScreen();
    }

    async confirmDeleteStudent(studentId) {
        const student = this.students.find(s => s.id === studentId);
        if (!student) return;

        const fullName = `${student.first_name} ${student.last_name}`;
        const msg = `"${fullName}" (#${student.student_number}) isimli öğrenciyi bu sınıftan silmek istediğinize emin misiniz?`;

        if (!confirm(msg)) return;

        sound.playClick();

        if (supabaseClient && !this.isDemoMode) {
            try {
                const { error } = await supabaseClient
                    .from('students')
                    .delete()
                    .eq('id', studentId);

                if (error) {
                    console.error('Öğrenci silinemedi:', error);
                    alert('Öğrenci silinemedi: ' + error.message);
                    return;
                }
            } catch (err) {
                console.error('Öğrenci silme hatası:', err);
                alert('Öğrenci silinirken bir hata oluştu: ' + err.message);
                return;
            }
        }

        // Yerel diziden çıkar
        this.students = this.students.filter(s => s.id !== studentId);
        if (this.isDemoMode) {
            this.saveLocalStudents();
        }

        this.sortStudents();
        picker.setStudents(this.students, classId, this.currentClass?.wheel_state);
        if (window.miniGames) {
            window.miniGames.loadRecords();
        }
        this.renderRoster();
        this.updateStatsBar();
        alert(`✅ ${fullName} sınıftan silindi.`);
    }

    openReportsModal() {
        if (!this.currentClass) {
            alert('Lütfen önce bir sınıf seçin veya ➕ Sınıf butonundan yeni bir sınıf oluşturun.');
            return;
        }
        const modal = document.getElementById('reportsModal');
        const titleEl = document.getElementById('reportsModalClassName');
        if (titleEl) {
            titleEl.textContent = `"${this.currentClass.name}" Sınıfı (${this.students.length} Öğrenci)`;
        }
        if (modal) modal.classList.add('active');
    }

    closeReportsModal() {
        const modal = document.getElementById('reportsModal');
        if (modal) modal.classList.remove('active');
    }

    toggleFullscreen() {
        sound.playClick();
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.warn('Tam ekran hatası:', err);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    // =========================================================================
    // 40 DAKİKALIK OTOMATİK DERS OTURUMU YÖNETİMİ
    // =========================================================================
    startSessionTimer() {
        this.stopSessionTimer();
        this.sessionRemainingSeconds = 40 * 60; // 40 dakika (2400 sn)
        this.updateSessionTimerUI();

        this.sessionTimer = setInterval(() => {
            this.tickSessionTimer();
        }, 1000);
    }

    stopSessionTimer() {
        if (this.sessionTimer) {
            clearInterval(this.sessionTimer);
            this.sessionTimer = null;
        }
    }

    tickSessionTimer() {
        this.sessionRemainingSeconds--;
        this.updateSessionTimerUI();

        // Son 2 dakika kala (120 sn) nazik uyarı modalı göster
        if (this.sessionRemainingSeconds === 120) {
            this.openSessionExpiryModal();
            sound.playTick();
        }

        // Süre dolduğunda (0 sn) otomatik oturum kapat
        if (this.sessionRemainingSeconds <= 0) {
            this.stopSessionTimer();
            this.closeSessionExpiryModal();
            alert('⏳ 40 dakikalık ders süresi doldu!\n\nÖğrencilerin tahtayı izinsiz kullanmasını önlemek amacıyla oturumunuz otomatik olarak kapatıldı.');
            this.logout(true);
        }
    }

    updateSessionTimerUI() {
        const textEl = document.getElementById('sessionTimerText');
        const badgeEl = document.getElementById('sessionTimerBadge');
        if (!textEl) return;

        const totalSec = Math.max(0, this.sessionRemainingSeconds);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        textEl.textContent = formatted;

        if (badgeEl) {
            if (totalSec <= 120) {
                badgeEl.className = 'session-timer-badge danger';
            } else if (totalSec <= 300) {
                badgeEl.className = 'session-timer-badge warning';
            } else {
                badgeEl.className = 'session-timer-badge';
            }
        }

        const modalCountdown = document.getElementById('sessionModalCountdown');
        if (modalCountdown) {
            modalCountdown.textContent = `${formatted} dakika`;
        }
    }

    openSessionExpiryModal() {
        const modal = document.getElementById('sessionExpiryModal');
        if (modal) modal.classList.add('active');
    }

    closeSessionExpiryModal() {
        const modal = document.getElementById('sessionExpiryModal');
        if (modal) modal.classList.remove('active');
    }

    extendSession() {
        sound.playWin();
        this.sessionRemainingSeconds = 40 * 60;
        this.closeSessionExpiryModal();
        this.updateSessionTimerUI();
        alert('⏱️ Ders süresi 40 dakika uzatıldı. İyi dersler!');
    }

    showExtendSessionPrompt() {
        const totalSec = Math.max(0, this.sessionRemainingSeconds);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        const msg = `⏱️ Kalan Ders Süresi: ${mins} dk ${secs} sn\n\nDers süresini 40 dakikaya uzatmak istiyor musunuz?`;
        if (confirm(msg)) {
            this.extendSession();
        }
    }

    async logout(skipConfirm = false) {
        sound.playClick();
        if (skipConfirm || confirm('Akıllı tahtadaki oturumu kapatmak istiyor musunuz?')) {
            // Çıkış yapmadan önce bekleyen tüm çevrimdışı kayıtları buluta aktar
            if (window.syncQueue && window.syncQueue.hasPending()) {
                await window.syncQueue.flushAll();
            }
            this.stopSessionTimer();
            this.closeSessionExpiryModal();
            clearSupabaseAuth();
            if (supabaseClient) {
                try {
                    await supabaseClient.auth.signOut();
                } catch (e) {}
            }
            this.currentTeacher = null;
            this.currentClass = null;
            this.students = [];
            this.classes = [];
            this.showScreen('loginScreen');
            qrManager.startNewSession();
        }
    }

    // E-Posta ile Giriş Modalı
    openEmailLoginModal() {
        const modal = document.getElementById('emailLoginModal');
        const errEl = document.getElementById('emailLoginError');
        const passInput = document.getElementById('loginPasswordInput');
        if (errEl) {
            errEl.style.display = 'none';
            errEl.textContent = '';
        }
        if (passInput) {
            passInput.value = '';
        }
        if (modal) {
            modal.classList.add('active');
            setTimeout(() => {
                if (passInput) passInput.focus();
            }, 100);
        }
    }

    closeEmailLoginModal() {
        const modal = document.getElementById('emailLoginModal');
        if (modal) modal.classList.remove('active');
    }

    async submitEmailLogin() {
        const email = document.getElementById('loginEmailInput')?.value?.trim();
        const pass = document.getElementById('loginPasswordInput')?.value;
        const errEl = document.getElementById('emailLoginError');
        const submitBtn = document.getElementById('btnEmailLoginSubmit');

        if (!email || !pass) {
            if (errEl) {
                errEl.textContent = 'Lütfen e-posta ve şifrenizi giriniz.';
                errEl.style.display = 'block';
            }
            return;
        }

        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Giriş Yapılıyor...';
            }
            if (errEl) errEl.style.display = 'none';

            const profile = await loginWithEmailPassword(email, pass);
            sound.playWin();
            this.closeEmailLoginModal();
            this.onTeacherLoggedIn(profile);
        } catch (err) {
            console.error('E-posta giriş hatası:', err);
            if (errEl) {
                errEl.textContent = err.message || 'Giriş başarısız. Lütfen bilgilerinizi kontrol ediniz.';
                errEl.style.display = 'block';
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Giriş Yap';
            }
        }
    }

    bindEvents() {
        const classSelect = document.getElementById('classSelect');
        if (classSelect) {
            classSelect.addEventListener('change', (e) => {
                this.selectClass(e.target.value);
            });
        }

        // PDF Sürükle-Bırak Alanı Dinleyicileri
        const dropZone = document.getElementById('pdfDropZone');
        if (dropZone) {
            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropZone.classList.add('dragover');
                }, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropZone.classList.remove('dragover');
                }, false);
            });

            dropZone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                if (dt && dt.files && dt.files.length > 0) {
                    this.handlePdfFile(dt.files[0]);
                }
            }, false);
        }

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
                e.preventDefault();
                picker.spin();
            }
        });
    }
}

const app = new AppManager();
window.app = app;
window.addEventListener('DOMContentLoaded', () => app.init());
