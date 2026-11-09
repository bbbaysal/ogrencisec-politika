// ==============================================================================
// ÖĞRENCİ SEÇİM MOTORU (Çarkıfelek, Gizemli Kart & Adil Algoritma)
// ==============================================================================

class StudentPicker {
    constructor() {
        this.mode = 'wheel'; // 'wheel' | 'card' | 'quick'
        this.isEliminationMode = true; // Turlu Dağıtım: Seçilen çarktan silinir, herkes bitince sıfırlanır
        this.isSpinning = false;
        
        // Çark Fizik Değişkenleri
        this.wheelCanvas = null;
        this.wheelCtx = null;
        this.currentAngle = 0;
        this.angularVelocity = 0;
        this.friction = 0.985;
        this.lastTickSegment = -1;

        // Renk Paleti (Canlı, modern eğitim tonları)
        this.colors = [
            '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', 
            '#eab308', '#10b981', '#06b6d4', '#6366f1',
            '#14b8a6', '#f43f5e', '#84cc16', '#a855f7'
        ];

        this.currentClassId = null;     // Aktif sınıf ID'si
        this.allEligibleStudents = [];  // Sınıftaki yoklamada VAR olan tüm öğrenciler
        this.calledStudentIds = new Set(); // Bu turda tahtaya kalkan öğrencilerin ID'leri
        this.selectedStudent = null;
        this.lastSelectedStudent = null; // Geri alma için son seçilen öğrenci
        this.roundCount = 1;            // Kaçıncı turda olunduğu
    }

    initCanvas(canvasId) {
        this.wheelCanvas = document.getElementById(canvasId);
        if (!this.wheelCanvas) return;
        this.wheelCtx = this.wheelCanvas.getContext('2d');
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        if (!this.wheelCanvas) return;
        const rect = this.wheelCanvas.parentElement.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height, 560);
        
        const dpr = window.devicePixelRatio || 1;
        this.wheelCanvas.width = size * dpr;
        this.wheelCanvas.height = size * dpr;
        this.wheelCanvas.style.width = `${size}px`;
        this.wheelCanvas.style.height = `${size}px`;

        if (this.wheelCtx) {
            this.wheelCtx.scale(dpr, dpr);
        }
        this.drawWheel();
    }

    // Çarkta şu an dönmesi gereken (henüz bu tur kalkmamış) öğrenciler
    get remainingStudents() {
        if (!this.isEliminationMode) {
            return this.allEligibleStudents;
        }
        return this.allEligibleStudents.filter(s => !this.calledStudentIds.has(String(s.id)));
    }

    get activeStudents() {
        return this.remainingStudents;
    }

    // Durumu hem localStorage'a hem de Supabase bulutuna güvenle kaydet
    async savePoolToStorage() {
        if (!this.currentClassId) return;
        const calledArray = Array.from(this.calledStudentIds);
        const stateData = {
            calledIds: calledArray,
            round: this.roundCount,
            updatedAt: new Date().toISOString()
        };

        // 1. Bellek nesnelerini hemen güncelle
        if (window.app?.currentClass && String(window.app.currentClass.id) === String(this.currentClassId)) {
            window.app.currentClass.wheel_state = stateData;
        }
        if (window.app?.classes) {
            const cls = window.app.classes.find(c => String(c.id) === String(this.currentClassId));
            if (cls) cls.wheel_state = stateData;
        }

        // 2. Yerel Hafızaya (localStorage) anında yaz
        try {
            localStorage.setItem(`ogrencisec_called_ids_${this.currentClassId}`, JSON.stringify(calledArray));
            localStorage.setItem(`ogrencisec_round_${this.currentClassId}`, String(this.roundCount));
            localStorage.setItem(`ogrencisec_wheel_state_${this.currentClassId}`, JSON.stringify(stateData));
        } catch (e) {
            console.warn('Yerel hafızaya yazılamadı:', e);
        }

        // 3. Çevrimdışı ve Güvenli Senkronizasyon Kuyruğuna Gönder
        if (window.syncQueue) {
            window.syncQueue.enqueue('wheel_state', {
                classId: this.currentClassId,
                stateData: stateData
            });
        }
    }

    setStudents(students, classId = null, cloudWheelState = null) {
        if (classId) {
            this.currentClassId = String(classId);
        } else if (!this.currentClassId && window.app?.currentClass?.id) {
            this.currentClassId = String(window.app.currentClass.id);
        }

        // Devamsız (derste olmayan) öğrencileri filtrele
        this.allEligibleStudents = students.filter(s => !s.is_absent);

        if (this.allEligibleStudents.length === 0) {
            this.calledStudentIds.clear();
            this.updateRemainingUI();
            this.drawWheel();
            return;
        }

        // Bu turda tahtaya kalkanların listesini Buluttan veya Yerel Hafızadan yükle
        if (this.isEliminationMode && this.currentClassId) {
            let loadedCalledIds = null;
            let loadedRound = null;

            // 1. Önce Supabase bulut verisine bak (JSON string gelebilme ihtimaline karşı parse et)
            let wheelState = cloudWheelState || window.app?.currentClass?.wheel_state;
            if (typeof wheelState === 'string') {
                try {
                    wheelState = JSON.parse(wheelState);
                } catch (e) {
                    console.warn('wheelState JSON parse hatası:', e);
                }
            }

            if (wheelState && Array.isArray(wheelState.calledIds) && wheelState.calledIds.length > 0) {
                loadedCalledIds = wheelState.calledIds.map(String);
                loadedRound = wheelState.round;
            } else if (wheelState && Array.isArray(wheelState.calledIds) && wheelState.calledIds.length === 0) {
                // Bulutta liste boş görünüyor; yerel hafızada güncel kalkanlar var mı kontrol et
                const localCalledStr = localStorage.getItem(`ogrencisec_called_ids_${this.currentClassId}`);
                if (localCalledStr) {
                    try {
                        const parsed = JSON.parse(localCalledStr);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            loadedCalledIds = parsed.map(String);
                        }
                    } catch (e) {}
                }
                if (!loadedCalledIds) {
                    loadedCalledIds = [];
                }
                loadedRound = wheelState.round;
            }

            // 2. Bulutta calledIds yoksa yerel hafızaya (localStorage) bak
            if (!loadedCalledIds || loadedCalledIds.length === 0) {
                const localCalledStr = localStorage.getItem(`ogrencisec_called_ids_${this.currentClassId}`);
                const localRound = localStorage.getItem(`ogrencisec_round_${this.currentClassId}`);
                if (localCalledStr) {
                    try {
                        const parsed = JSON.parse(localCalledStr);
                        if (Array.isArray(parsed)) {
                            loadedCalledIds = parsed.map(String);
                        }
                    } catch (e) {}
                }
                if (localRound && !loadedRound) loadedRound = localRound;
            }

            if (loadedRound) {
                this.roundCount = parseInt(loadedRound, 10) || 1;
            }

            this.calledStudentIds.clear();
            if (loadedCalledIds && loadedCalledIds.length > 0) {
                const currentEligibleIds = new Set(this.allEligibleStudents.map(s => String(s.id)));
                // Sadece hâlâ sınıfta ve derste olan kalkanları ekle
                loadedCalledIds.forEach(id => {
                    if (currentEligibleIds.has(String(id))) {
                        this.calledStudentIds.add(String(id));
                    }
                });

                // Eğer tüm sınıf zaten kalkmışsa turu tamamla ve sıfırla
                if (this.calledStudentIds.size >= this.allEligibleStudents.length && this.allEligibleStudents.length > 0) {
                    this.calledStudentIds.clear();
                    this.savePoolToStorage();
                }
            }
        } else {
            this.calledStudentIds.clear();
        }

        this.updateRemainingUI();
        this.drawWheel();
    }

    // Havuzu sıfırlayıp tüm sınıfı çarka tekrar doldurma
    resetPool(isAuto = false) {
        this.calledStudentIds.clear();
        if (isAuto) {
            this.roundCount++;
        }
        this.savePoolToStorage();
        this.updateRemainingUI();
        this.drawWheel();
    }

    setMode(newMode) {
        this.mode = newMode;
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === newMode);
        });

        const wheelContainer = document.getElementById('wheelStage');
        const cardContainer = document.getElementById('cardStage');

        if (newMode === 'wheel') {
            if (wheelContainer) wheelContainer.style.display = 'flex';
            if (cardContainer) cardContainer.style.display = 'none';
            this.resizeCanvas();
        } else {
            if (wheelContainer) wheelContainer.style.display = 'none';
            if (cardContainer) cardContainer.style.display = 'flex';
            this.resetCardStage();
        }
    }

    toggleFairMode() {
        this.isEliminationMode = !this.isEliminationMode;
        const fairBtn = document.getElementById('fairModeToggle');
        if (fairBtn) {
            fairBtn.classList.toggle('active', this.isEliminationMode);
            const labelEl = fairBtn.querySelector('.mode-label');
            if (labelEl) {
                labelEl.textContent = this.isEliminationMode ? 'Turlu Seçim (Aktif)' : 'Klasik Rastgele';
            }
            fairBtn.title = this.isEliminationMode 
                ? 'Seçilen öğrenci çarktan silinir, herkes kalkınca çark yenilenir.' 
                : 'Her seçimde tüm sınıf arasından rastgele seçilir.';
        }

        if (!this.isEliminationMode) {
            this.calledStudentIds.clear();
        }

        this.updateRemainingUI();
        this.drawWheel();
        return this.isEliminationMode;
    }

    updateRemainingUI() {
        const poolBadge = document.getElementById('poolStatusBadge');
        const remainingCount = this.remainingStudents.length;
        const totalCount = this.allEligibleStudents.length;
        const calledCount = this.calledStudentIds.size;

        if (poolBadge) {
            if (this.isEliminationMode) {
                poolBadge.style.display = 'inline-flex';
                poolBadge.innerHTML = `🎯 Çarktaki Kalan: <strong>${remainingCount} / ${totalCount}</strong> <span style="font-size: 0.82rem; opacity: 0.85; margin-left: 6px;">(Kalkan: ${calledCount} | Tur: ${this.roundCount})</span>`;
                if (remainingCount === 1) {
                    poolBadge.innerHTML += ` <span style="color: #fbbf24; font-size: 0.8rem; margin-left: 4px;">(Son Öğrenci!)</span>`;
                }
            } else {
                poolBadge.style.display = 'inline-flex';
                poolBadge.innerHTML = `🎲 Klasik Mod: <strong>${totalCount} Öğrenci</strong>`;
            }
        }
    }

    // Son seçilen öğrenciyi çarka geri iade etme (Undo)
    undoLastSelection() {
        if (!this.lastSelectedStudent) return false;
        const student = this.lastSelectedStudent;
        this.returnStudentToPool(student.id, true);
        this.lastSelectedStudent = null;
        this.updateRemainingUI();
        return true;
    }

    // Belirli bir öğrenciyi çark havuzuna geri iade etme
    returnStudentToPool(studentId, isUndo = false) {
        const student = this.allEligibleStudents.find(s => String(s.id) === String(studentId));
        if (!student) return;

        // Kalkanlar listesinden çıkar (böylece çarka otomatik geri dahil olur)
        this.calledStudentIds.delete(String(studentId));
        this.savePoolToStorage();

        sound.playTick();
        this.updateRemainingUI();
        this.drawWheel();

        if (window.app && window.app.renderRoster) {
            window.app.renderRoster();
        }

        // Bilgi toast bildirimi
        if (window.app && window.app.showUndoNotification) {
            window.app.showUndoNotification(student);
        }
    }

    // ==========================================
    // ÖĞRENCİ SEÇİM MANTIĞI
    // ==========================================
    selectWinningStudent() {
        const pool = this.activeStudents;
        if (!pool || pool.length === 0) {
            return null;
        }

        // Çarktaki mevcut öğrenciler arasından eşit rastgele şansla bir kişi seçilir
        const randomIndex = Math.floor(Math.random() * pool.length);
        return pool[randomIndex];
    }

    // ==========================================
    // ÇARKIFELEK ÇİZİMİ VE ANİMASYONU
    // ==========================================
    drawWheel() {
        if (!this.wheelCtx || !this.wheelCanvas) return;
        const ctx = this.wheelCtx;
        const width = parseFloat(this.wheelCanvas.style.width) || 500;
        const height = parseFloat(this.wheelCanvas.style.height) || 500;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = (Math.min(width, height) / 2) - 18;

        ctx.clearRect(0, 0, width, height);

        const pool = this.activeStudents;

        if (!pool || pool.length === 0) {
            // Boş çark uyarısı
            ctx.save();
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.fillStyle = '#1e293b';
            ctx.fill();
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 4;
            ctx.stroke();

            ctx.fillStyle = '#94a3b8';
            ctx.font = '600 18px "Outfit", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
                this.allEligibleStudents.length === 0 
                    ? 'Seçilecek öğrenci bulunamadı' 
                    : 'Tüm öğrenciler seçildi! Yenileniyor...', 
                centerX, 
                centerY
            );
            ctx.restore();
            return;
        }

        const totalSlices = pool.length;
        const sliceAngle = (2 * Math.PI) / totalSlices;

        // Dış Işıltı Çerçevesi
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + 8, 0, 2 * Math.PI);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#0284c7';
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.restore();

        // Dilimleri Çiz
        for (let i = 0; i < totalSlices; i++) {
            const student = pool[i];
            const startAngle = this.currentAngle + (i * sliceAngle);
            const endAngle = startAngle + sliceAngle;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            ctx.closePath();

            // Renk gradyanı
            const color = this.colors[i % this.colors.length];
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Öğrenci Metnini Çiz (No + İsim)
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(startAngle + sliceAngle / 2);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
            ctx.shadowBlur = 4;

            const fontSize = Math.max(10, Math.min(18, (radius * 1.5) / totalSlices));
            ctx.font = `bold ${fontSize}px "Outfit", sans-serif`;

            // Metni kısalt
            const displayName = `${student.student_number} ${student.first_name} ${student.last_name.charAt(0)}.`;
            ctx.fillText(displayName, radius - 20, fontSize / 3);
            ctx.restore();

            ctx.restore();
        }

        // Merkez Göbek (Hub)
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, 38, 0, 2 * Math.PI);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 5;
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 20px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('∑', centerX, centerY);
        ctx.restore();

        // Üst İbre (Pointer)
        this.drawPointer(centerX, centerY - radius);
    }

    drawPointer(x, y) {
        const ctx = this.wheelCtx;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x - 16, y - 10);
        ctx.lineTo(x + 16, y - 10);
        ctx.lineTo(x, y + 24);
        ctx.closePath();

        ctx.fillStyle = '#f43f5e';
        ctx.shadowColor = 'rgba(244, 63, 94, 0.8)';
        ctx.shadowBlur = 10;
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
    }

    // Çarkı Döndürme
    spinWheel() {
        if (this.isSpinning) return;

        // Havuz boşsa (tüm sınıf seçilmişse) otomatik yenile
        if (this.isEliminationMode && this.remainingStudents.length === 0) {
            this.resetPool(true);
        }

        const pool = this.activeStudents;
        if (!pool || pool.length === 0) {
            alert('Lütfen önce bir sınıf seçin veya öğrenci ekleyin.');
            return;
        }

        const winner = this.selectWinningStudent();
        if (!winner) return;

        this.selectedStudent = winner;
        this.isSpinning = true;
        sound.playClick();

        const winnerIndex = pool.findIndex(s => s.id === winner.id);
        const totalSlices = pool.length;
        const sliceAngle = (2 * Math.PI) / totalSlices;

        // İbrenin gösterdiği açı üstte (y - radius), yani açısal olarak 3*PI/2 (270 derece)
        // Hedef açıyı hesapla
        const targetSliceCenter = (winnerIndex * sliceAngle) + (sliceAngle / 2);
        const pointerAngle = (3 * Math.PI) / 2;

        // 5 ila 8 tam tur ekstra dönüş
        const extraRounds = 5 + Math.floor(Math.random() * 3);
        const targetFinalAngle = (pointerAngle - targetSliceCenter) + (extraRounds * 2 * Math.PI);

        // Başlangıç hızı
        const duration = 4800; // 4.8 saniye
        const startTime = performance.now();
        const startAngle = this.currentAngle % (2 * Math.PI);
        const totalAngleDelta = (targetFinalAngle - startAngle);

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(1, elapsed / duration);

            // Yumuşak frenleme (Ease Out Cubic)
            const easeOut = 1 - Math.pow(1 - progress, 3.5);
            this.currentAngle = startAngle + (totalAngleDelta * easeOut);

            // Ses tık kontrolü
            const currentSegment = Math.floor((this.currentAngle / sliceAngle));
            if (currentSegment !== this.lastTickSegment) {
                sound.playTick();
                this.lastTickSegment = currentSegment;
            }

            this.drawWheel();

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.isSpinning = false;
                this.onWinnerChosen(winner);
            }
        };

        requestAnimationFrame(animate);
    }

    // ==========================================
    // GİZEMLİ KART MODU
    // ==========================================
    spinCard() {
        if (this.isSpinning) return;

        // Havuz boşsa (tüm sınıf seçilmişse) otomatik yenile
        if (this.isEliminationMode && this.remainingStudents.length === 0) {
            this.resetPool(true);
        }

        const pool = this.activeStudents;
        if (!pool || pool.length === 0) return;

        const winner = this.selectWinningStudent();
        if (!winner) return;

        this.selectedStudent = winner;
        this.isSpinning = true;
        sound.playClick();

        const cardElement = document.getElementById('mysteryCard');
        if (!cardElement) return;

        // Kartı salla ve karıştır
        cardElement.classList.add('shuffling');

        let ticks = 0;
        const tickInterval = setInterval(() => {
            sound.playTick();
            ticks++;
            if (ticks > 15) {
                clearInterval(tickInterval);
                cardElement.classList.remove('shuffling');
                
                // Kart içeriğini hazırla ve döndür
                this.populateCardFace(winner);
                cardElement.classList.add('flipped');

                setTimeout(() => {
                    this.isSpinning = false;
                    this.onWinnerChosen(winner);
                }, 800);
            }
        }, 120);
    }

    resetCardStage() {
        const cardElement = document.getElementById('mysteryCard');
        if (cardElement) {
            cardElement.classList.remove('flipped', 'shuffling');
        }
    }

    populateCardFace(student) {
        const nameEl = document.getElementById('mysteryCardName');
        const numEl = document.getElementById('mysteryCardNumber');
        const avatarEl = document.getElementById('mysteryCardAvatar');

        if (nameEl) nameEl.textContent = `${student.first_name} ${student.last_name}`;
        if (numEl) numEl.textContent = `No: ${student.student_number}`;
        if (avatarEl) {
            if (student.photo_url) {
                avatarEl.innerHTML = `<img src="${student.photo_url}" alt="Foto" class="avatar-img"/>`;
            } else {
                const initials = window.getStudentInitials ? window.getStudentInitials(student) : `${student.first_name[0]}${student.last_name[0]}`.toUpperCase();
                avatarEl.innerHTML = `<div class="avatar-initials">${initials}</div>`;
            }
        }
    }

    // Genel Başlatıcı
    spin() {
        if (this.mode === 'wheel') {
            this.spinWheel();
        } else {
            this.spinCard();
        }
    }

    // Kazanan Belirlendiğinde
    onWinnerChosen(student) {
        sound.playWin();
        triggerConfetti();

        // Kazanan Modalı Aç
        window.app.showWinnerModal(student);

        // Turlu Seçim mantığı: Seçilen öğrenciyi bu tur kalkanlar kümesine ekle
        if (this.isEliminationMode) {
            this.lastSelectedStudent = student; // Geri alma için kaydet
            this.calledStudentIds.add(String(student.id));
            this.savePoolToStorage(); // Kalıcı kaydet (Bulut + Yerel)
            
            // Eğer çarkta hiç öğrenci kalmadıysa:
            if (this.remainingStudents.length === 0) {
                // Tüm sınıf tahtaya kalktı! Otomatik olarak havuzu tekrar doldur
                setTimeout(() => {
                    this.resetPool(true);
                    if (window.app && window.app.showRoundCompletedNotification) {
                        window.app.showRoundCompletedNotification(this.roundCount);
                    }
                }, 1000);
            } else {
                this.updateRemainingUI();
                this.drawWheel();
            }

            // Sağ paneldeki listeyi güncelle (bu turda kalkanları belirtmek için)
            if (window.app && window.app.renderRoster) {
                window.app.renderRoster();
            }
        }
    }
}

// Konfeti Efekti (Canvas tabanlı ultra-hafif patlama)
function triggerConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#38bdf8', '#818cf8', '#ec4899', '#f59e0b', '#10b981', '#f43f5e'];

    for (let i = 0; i < 90; i++) {
        particles.push({
            x: canvas.width / 2,
            y: canvas.height / 2,
            vx: (Math.random() - 0.5) * 18,
            vy: (Math.random() - 0.7) * 22,
            size: Math.random() * 9 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 12,
            gravity: 0.45,
            opacity: 1
        });
    }

    const startTime = performance.now();
    function render(time) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;

        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.rotation += p.rotationSpeed;
            p.opacity -= 0.012;

            if (p.opacity > 0) {
                alive = true;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rotation * Math.PI) / 180);
                ctx.globalAlpha = p.opacity;
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            }
        });

        if (alive) {
            requestAnimationFrame(render);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    requestAnimationFrame(render);
}

const picker = new StudentPicker();
