// ==============================================================================
// AKILLI TAHTA 2-3 SANİYELİK MİNİ OYUN MOTORU & REKORLAR SİSTEMİ
// ==============================================================================

class MiniGameManager {
    constructor() {
        this.currentStudent = null;
        this.currentClass = null;
        this.currentGame = null;
        this.gameTimer = null;
        this.countdownTimer = null;
        this.score = 0;
        this.records = {};

        // 6 Adet Akıllı Tahta Mini Oyunu Tanımı
        this.games = [
            {
                id: 'circle',
                name: '⭕ Kusursuz Daire',
                badge: 'Geometri Yeteneği',
                description: 'Parmağını tahtadan kaldırmadan tek hamlede bir çember çiz!',
                unit: '%',
                higherIsBetter: true,
                defaultRecord: { score: 85, holder: 'Örnek Rekor' }
            },
            {
                id: 'balloon',
                name: '🎈 Balon Patlatma',
                badge: 'Hızlı Parmaklar',
                description: '3 saniyede ekranda beliren olabildiğince çok balona dokun!',
                unit: 'Balon',
                higherIsBetter: true,
                defaultRecord: { score: 6, holder: 'Örnek Rekor' }
            },
            {
                id: 'reflex',
                name: '⚡ Şimşek Refleks',
                badge: 'Refleks Şampiyonu',
                description: 'Ekran kırmızıdan YEŞİLE döndüğü an en hızlı şekilde dokun!',
                unit: 'ms',
                higherIsBetter: false,
                defaultRecord: { score: 260, holder: 'Örnek Rekor' }
            },
            {
                id: 'target',
                name: '🎯 Hedef İbre',
                badge: 'Kusursuz Zamanlama',
                description: 'Hızla kayan ibreyi tam YEŞİL hedefin ortasındayken durdur!',
                unit: 'Puan',
                higherIsBetter: true,
                defaultRecord: { score: 92, holder: 'Örnek Rekor' }
            },
            {
                id: 'math',
                name: '🧮 Şimşek Matematik',
                badge: 'Hızlı Zihin',
                description: '3 saniye dolmadan doğru cevabın olduğu dev butona dokun!',
                unit: 'sn',
                higherIsBetter: false,
                defaultRecord: { score: 1.15, holder: 'Örnek Rekor' }
            }
        ];
    }

    init() {
        this.loadRecords();
    }

    // Rekorları localStorage'dan yükle
    // Rekorları Buluttan (Supabase) veya localStorage'dan yükle
    loadRecords() {
        const classId = window.app?.currentClass?.id || 'default_class';
        
        // 1. Önce Supabase sınıf nesnesindeki bulut rekorlarına bak
        const cloudRecords = window.app?.currentClass?.game_records;
        if (cloudRecords && typeof cloudRecords === 'object' && Object.keys(cloudRecords).length > 0) {
            this.records = cloudRecords;
            return;
        }

        // 2. Bulutta yoksa yerel yedekten yükle
        const saved = localStorage.getItem(`ogrencisec_records_${classId}`);
        if (saved) {
            try {
                this.records = JSON.parse(saved);
            } catch (e) {
                this.records = {};
            }
        } else {
            this.records = {};
        }
    }

    // Rekor Kırıldı mı Senkron Kontrol Et (UI ve Mantık İçin)
    isRecordBroken(gameId, score) {
        if (score === undefined || score === null || isNaN(score)) return false;
        const game = this.games.find(g => g.id === gameId);
        if (!game) return false;

        const currentRec = this.records[gameId] || game.defaultRecord;
        if (!currentRec || currentRec.score === '-' || currentRec.score === undefined) {
            return true;
        }

        const currentScore = parseFloat(currentRec.score);
        const newScore = parseFloat(score);

        if (isNaN(currentScore) || isNaN(newScore)) return false;

        if (game.higherIsBetter) {
            return newScore > currentScore;
        } else {
            return newScore < currentScore;
        }
    }

    // Rekor Kaydet (Buluta ve Yerel Hafızaya)
    async saveRecord(gameId, score, student) {
        const classId = window.app?.currentClass?.id || 'default_class';
        const game = this.games.find(g => g.id === gameId);
        if (!game) return false;

        if (!this.isRecordBroken(gameId, score)) {
            return false;
        }

        this.records[gameId] = {
            score: score,
            holder: `${student.first_name} ${student.last_name}`,
            date: new Date().toLocaleDateString('tr-TR')
        };

        // 1. Yerel Hafızaya Yaz
        try {
            localStorage.setItem(`ogrencisec_records_${classId}`, JSON.stringify(this.records));
        } catch (e) {}

        if (window.app && window.app.currentClass) {
            window.app.currentClass.game_records = this.records;
        }

        // 2. Senkronizasyon Kuyruğuna Ekle (Çevrimdışı / Çevrimiçi güvenli aktarım)
        if (window.syncQueue && classId !== 'default_class') {
            window.syncQueue.enqueue('game_records', {
                classId: classId,
                records: this.records
            });
        } else {
            const client = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
            if (client && window.app && !window.app.isDemoMode && classId !== 'default_class') {
                try {
                    await client
                        .from('classes')
                        .update({ game_records: this.records })
                        .eq('id', classId);
                } catch (err) {
                    console.warn('Supabase rekor güncellenemedi:', err);
                }
            }
        }

        return true;
    }

    getRecord(gameId) {
        const game = this.games.find(g => g.id === gameId);
        return this.records[gameId] || game?.defaultRecord || { score: '-', holder: 'Henüz yok' };
    }

    // Rastgele Oyun Başlat
    startRandomGame(student) {
        this.currentStudent = student;
        this.loadRecords();

        // Rastgele bir oyun seç
        const randomIndex = Math.floor(Math.random() * this.games.length);
        const game = this.games[randomIndex];
        this.currentGame = game;

        this.openModal();
        this.showIntroAndCountdown(game);
    }

    openModal() {
        const modal = document.getElementById('miniGameModal');
        if (modal) modal.classList.add('active');
    }

    closeModal() {
        this.cleanupGame();
        const modal = document.getElementById('miniGameModal');
        if (modal) modal.classList.remove('active');
    }

    cleanupGame() {
        if (this.gameTimer) {
            clearTimeout(this.gameTimer);
            clearInterval(this.gameTimer);
            this.gameTimer = null;
        }
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
        const arena = document.getElementById('miniGameArena');
        if (arena) arena.innerHTML = '';
    }

    // =========================================================================
    // 2 SANİYELİK KURAL & HAZIRLIK SAYACI
    // =========================================================================
    showIntroAndCountdown(game) {
        const arena = document.getElementById('miniGameArena');
        if (!arena) return;

        const record = this.getRecord(game.id);

        arena.innerHTML = `
            <div class="game-intro-card">
                <div class="game-student-tag">
                    👤 Oyuncu: <strong>${this.currentStudent.first_name} ${this.currentStudent.last_name}</strong> (#${this.currentStudent.student_number})
                </div>
                <h1 class="game-intro-title">${game.name}</h1>
                <p class="game-intro-desc">${game.description}</p>

                <div class="game-intro-record-box">
                    🏆 <span>Sınıf Rekoru:</span> 
                    <strong>${record.score} ${game.unit}</strong> 
                    <small>(${record.holder})</small>
                </div>

                <div class="game-intro-countdown" id="gameCountdown">2</div>
                <div class="game-intro-ready-text">Hazırlan, oyun başlıyor!</div>
            </div>
        `;

        sound.playTick();

        let remainingSec = 2;
        const countdownEl = document.getElementById('gameCountdown');

        this.countdownTimer = setInterval(() => {
            remainingSec--;
            if (remainingSec > 0) {
                if (countdownEl) {
                    countdownEl.textContent = remainingSec;
                    countdownEl.classList.remove('pulse-anim');
                    void countdownEl.offsetWidth; // reflow
                    countdownEl.classList.add('pulse-anim');
                }
                sound.playTick();
            } else if (remainingSec === 0) {
                if (countdownEl) countdownEl.textContent = 'BAŞLA!';
                sound.playClick();
                clearInterval(this.countdownTimer);
                setTimeout(() => {
                    this.launchGame(game);
                }, 400);
            }
        }, 1000);
    }

    // Oyunu Sahneye Yükleme
    launchGame(game) {
        switch (game.id) {
            case 'circle':
                this.initCircleDrawGame();
                break;
            case 'balloon':
                this.initBalloonPopGame();
                break;
            case 'reflex':
                this.initReflexGame();
                break;
            case 'target':
                this.initTargetGame();
                break;
            case 'math':
                this.initSpeedMathGame();
                break;
        }
    }

    // =========================================================================
    // 1. OYUN: ⭕ KUSURSUZ DAİRE ÇİZME
    // =========================================================================
    initCircleDrawGame() {
        const arena = document.getElementById('miniGameArena');
        arena.innerHTML = `
            <div class="circle-game-container">
                <div class="game-hud">
                    <span class="game-hud-title">⭕ Parmağınla Tek Seferde Çember Çiz!</span>
                    <span class="game-hud-status" id="circleStatus">Tahtaya dokun ve başla...</span>
                </div>
                <canvas id="circleDrawCanvas"></canvas>
            </div>
        `;

        const canvas = document.getElementById('circleDrawCanvas');
        const ctx = canvas.getContext('2d');
        const rect = arena.getBoundingClientRect();
        canvas.width = rect.width - 60;
        canvas.height = rect.height - 130;

        let isDrawing = false;
        let points = [];

        const startDrawing = (e) => {
            isDrawing = true;
            points = [];
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const pos = this.getPos(e, canvas);
            points.push(pos);
            document.getElementById('circleStatus').textContent = 'Çiziyorsun... Parmağını kaldırınca puanlanacak!';
        };

        const drawMove = (e) => {
            if (!isDrawing) return;
            const pos = this.getPos(e, canvas);
            points.push(pos);

            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#38bdf8';
            ctx.shadowColor = '#0284c7';
            ctx.shadowBlur = 10;

            if (points.length > 1) {
                const prev = points[points.length - 2];
                ctx.beginPath();
                ctx.moveTo(prev.x, prev.y);
                ctx.lineTo(pos.x, pos.y);
                ctx.stroke();
            }
        };

        const stopDrawing = () => {
            if (!isDrawing) return;
            isDrawing = false;
            if (points.length < 25) {
                document.getElementById('circleStatus').textContent = '⚠️ Çok küçük veya kısa çizdin! Tekrar dene.';
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                return;
            }

            // Daire kusursuzluk algoritması
            const score = this.calculateCircleScore(points);
            this.finishGame('circle', score, `Kusursuzluk Oranı: %${score}`);
        };

        // Dokunmatik & Fare Olayları
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', drawMove);
        window.addEventListener('mouseup', stopDrawing);

        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDrawing(e.touches[0]); }, { passive: false });
        canvas.addEventListener('touchmove', (e) => { e.preventDefault(); drawMove(e.touches[0]); }, { passive: false });
        window.addEventListener('touchend', stopDrawing);
    }

    getPos(e, canvas) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX || e.pageX) - rect.left,
            y: (e.clientY || e.pageY) - rect.top
        };
    }

    calculateCircleScore(points) {
        // Ağırlık merkezi (centroid) hesapla
        let sumX = 0, sumY = 0;
        points.forEach(p => { sumX += p.x; sumY += p.y; });
        const centerX = sumX / points.length;
        const centerY = sumY / points.length;

        // Noktaların merkeze uzaklıkları
        const radii = points.map(p => Math.hypot(p.x - centerX, p.y - centerY));
        const avgRadius = radii.reduce((a, b) => a + b, 0) / radii.length;

        if (avgRadius < 35) return 20; // çok küçükse

        // Yarıçap standart sapması
        const variance = radii.reduce((acc, r) => acc + Math.pow(r - avgRadius, 2), 0) / radii.length;
        const stdDev = Math.sqrt(variance);

        // Uçların kapanma oranı (başlangıç ve bitiş noktası birbirine ne kadar yakın)
        const startPoint = points[0];
        const endPoint = points[points.length - 1];
        const closureGap = Math.hypot(startPoint.x - endPoint.x, startPoint.y - endPoint.y);
        const closurePenalty = Math.min(25, (closureGap / avgRadius) * 20);

        // Sapma yüzdesi
        const deviationRatio = (stdDev / avgRadius);
        let score = Math.max(10, Math.min(99.5, Math.round((1 - deviationRatio) * 100 - closurePenalty)));
        return Math.min(99.5, Math.max(30, score));
    }

    // =========================================================================
    // 2. OYUN: 🎈 HIZLI BALON PATLATMA (3 SANİYE)
    // =========================================================================
    initBalloonPopGame() {
        const arena = document.getElementById('miniGameArena');
        arena.innerHTML = `
            <div class="balloon-game-container">
                <div class="game-hud">
                    <span class="game-hud-title">🎈 Balonlara Hızlıca Dokun!</span>
                    <span class="game-hud-timer">⏱️ Kalan: <strong id="balloonTimer">3.0</strong>s</span>
                    <span class="game-hud-score">Skor: <strong id="balloonScore">0</strong></span>
                </div>
                <div class="balloon-field" id="balloonField"></div>
            </div>
        `;

        const field = document.getElementById('balloonField');
        let poppedCount = 0;
        let timeLeft = 30; // 3.0 saniye (100ms interval)

        const colors = ['#f43f5e', '#38bdf8', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

        const spawnBalloon = () => {
            if (timeLeft <= 0) return;
            const b = document.createElement('div');
            b.className = 'mini-balloon';
            b.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            
            const fieldRect = field.getBoundingClientRect();
            const size = Math.floor(Math.random() * 25 + 75); // 75-100px
            const left = Math.floor(Math.random() * (fieldRect.width - size - 20) + 10);
            const top = Math.floor(Math.random() * (fieldRect.height - size - 20) + 10);

            b.style.width = `${size}px`;
            b.style.height = `${size * 1.25}px`;
            b.style.left = `${left}px`;
            b.style.top = `${top}px`;

            const onPop = (e) => {
                e.stopPropagation();
                sound.playTick();
                poppedCount++;
                document.getElementById('balloonScore').textContent = poppedCount;
                b.classList.add('popped');
                setTimeout(() => b.remove(), 120);
                spawnBalloon();
            };

            b.addEventListener('mousedown', onPop);
            b.addEventListener('touchstart', onPop, { passive: true });

            field.appendChild(b);
        };

        // Başlangıçta 4 balon bas
        for (let i = 0; i < 4; i++) spawnBalloon();

        this.gameTimer = setInterval(() => {
            timeLeft--;
            const timerEl = document.getElementById('balloonTimer');
            if (timerEl) timerEl.textContent = (timeLeft / 10).toFixed(1);

            if (timeLeft <= 0) {
                clearInterval(this.gameTimer);
                this.gameTimer = null;
                const fieldEl = document.getElementById('balloonField');
                if (fieldEl) {
                    fieldEl.style.pointerEvents = 'none';
                    fieldEl.innerHTML = '';
                }
                this.finishGame('balloon', poppedCount, `${poppedCount} Balon Patlatıldı!`);
            }
        }, 100);
    }

    // =========================================================================
    // 3. OYUN: ⚡ ŞİMŞEK REFLEKS (YEŞİLE DOKUN)
    // =========================================================================
    initReflexGame() {
        const arena = document.getElementById('miniGameArena');
        arena.innerHTML = `
            <div class="reflex-game-screen red" id="reflexScreen">
                <div class="reflex-icon" id="reflexIcon">🛑</div>
                <h1 class="reflex-title" id="reflexTitle">BEKLE...</h1>
                <p class="reflex-desc" id="reflexDesc">Ekran yeşil olunca ekrana DOKUN!</p>
            </div>
        `;

        const screen = document.getElementById('reflexScreen');
        let readyToClick = false;
        let startTime = 0;
        let falseStart = false;

        // 1.2 ila 2.8 saniye arasında rastgele yeşile döner
        const delay = 1200 + Math.random() * 1600;

        const turnGreenTimer = setTimeout(() => {
            if (falseStart) return;
            readyToClick = true;
            startTime = performance.now();
            screen.className = 'reflex-game-screen green';
            document.getElementById('reflexIcon').textContent = '⚡';
            document.getElementById('reflexTitle').textContent = 'ŞİMDİ DOKUN!';
            sound.playTick();
        }, delay);

        const onScreenTap = () => {
            if (!readyToClick) {
                // Erken dokundu!
                falseStart = true;
                clearTimeout(turnGreenTimer);
                screen.className = 'reflex-game-screen early';
                document.getElementById('reflexIcon').textContent = '⚠️';
                document.getElementById('reflexTitle').textContent = 'ÇOK ERKEN!';
                document.getElementById('reflexDesc').textContent = 'Ekran yeşil olmadan dokundun.';
                sound.playMinus();
                setTimeout(() => {
                    this.finishGame('reflex', 999, 'Hatalı Çıkış (Erken Dokunma)');
                }, 1200);
            } else {
                // Başarılı dokunma
                const elapsedMs = Math.round(performance.now() - startTime);
                screen.className = 'reflex-game-screen success';
                document.getElementById('reflexIcon').textContent = '🏆';
                document.getElementById('reflexTitle').textContent = `${elapsedMs} ms!`;
                document.getElementById('reflexDesc').textContent = 'Şimşek gibi bir refleks!';
                sound.playWin();
                setTimeout(() => {
                    this.finishGame('reflex', elapsedMs, `Tepki Süresi: ${elapsedMs} ms`);
                }, 1000);
            }
        };

        screen.addEventListener('mousedown', onScreenTap, { once: true });
        screen.addEventListener('touchstart', onScreenTap, { once: true, passive: true });
    }

    // =========================================================================
    // 4. OYUN: 🎯 HEDEF İBRE (ZAMANLAMA)
    // =========================================================================
    initTargetGame() {
        const arena = document.getElementById('miniGameArena');
        arena.innerHTML = `
            <div class="target-game-container">
                <div class="game-hud">
                    <span class="game-hud-title">🎯 İbreyi Yeşil Bölgede Durdur!</span>
                </div>
                <div class="target-track">
                    <div class="target-green-zone"></div>
                    <div class="target-needle" id="targetNeedle"></div>
                </div>
                <button class="btn btn-primary btn-target-stop" id="btnStopTarget">
                    🛑 DURDUR!
                </button>
            </div>
        `;

        const needle = document.getElementById('targetNeedle');
        let pos = 0;
        let direction = 1;
        let isStopped = false;
        const speed = 2.4;

        const anim = () => {
            if (isStopped) return;
            pos += direction * speed;
            if (pos >= 100) { pos = 100; direction = -1; }
            if (pos <= 0) { pos = 0; direction = 1; }
            if (needle) needle.style.left = `${pos}%`;
            requestAnimationFrame(anim);
        };
        requestAnimationFrame(anim);

        const stop = () => {
            if (isStopped) return;
            isStopped = true;
            sound.playTick();

            // Yeşil bölge: %42 ile %58 arası (Merkez %50)
            const distFromCenter = Math.abs(pos - 50);
            let score = 0;

            if (distFromCenter <= 2) score = 100; // Tam 12'den
            else if (distFromCenter <= 8) score = Math.round(95 - distFromCenter * 2);
            else if (distFromCenter <= 18) score = Math.round(80 - distFromCenter * 2);
            else score = Math.max(10, Math.round(50 - distFromCenter));

            this.finishGame('target', score, `İsabet Doğruluğu: ${score} Puan`);
        };

        const stopBtn = document.getElementById('btnStopTarget');
        stopBtn.addEventListener('click', stop, { once: true });
        stopBtn.addEventListener('touchstart', (e) => { e.preventDefault(); stop(); }, { once: true });
    }

    // =========================================================================
    // 5. OYUN: 🧮 ŞİMŞEK MATEMATİK
    // =========================================================================
    initSpeedMathGame() {
        const arena = document.getElementById('miniGameArena');
        
        // Çok kolay zihinden toplama
        const a = Math.floor(Math.random() * 8 + 3);
        const b = Math.floor(Math.random() * 8 + 2);
        const correct = a + b;
        const wrong = correct + (Math.random() > 0.5 ? 2 : -2);
        const isLeftCorrect = Math.random() > 0.5;

        arena.innerHTML = `
            <div class="math-game-container">
                <div class="game-hud">
                    <span class="game-hud-title">🧮 Doğru Cevaba Hemen Dokun!</span>
                    <span class="game-hud-timer">⏱️ <strong id="mathTimer">3.0</strong>s</span>
                </div>
                <div class="math-question">${a} + ${b} = ?</div>
                <div class="math-options-grid">
                    <button class="math-opt-btn" id="mathOpt1">${isLeftCorrect ? correct : wrong}</button>
                    <button class="math-opt-btn" id="mathOpt2">${isLeftCorrect ? wrong : correct}</button>
                </div>
            </div>
        `;

        const startTime = performance.now();
        let answered = false;

        const onAnswer = (chosenVal) => {
            if (answered) return;
            answered = true;
            const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

            if (parseInt(chosenVal, 10) === correct) {
                sound.playWin();
                this.finishGame('math', parseFloat(elapsed), `Doğru Cevap! (${elapsed} saniye)`);
            } else {
                sound.playMinus();
                this.finishGame('math', 9.9, `Yanlış Cevap! Doğrusu: ${correct}`);
            }
        };

        document.getElementById('mathOpt1').onclick = function() { onAnswer(this.textContent); };
        document.getElementById('mathOpt2').onclick = function() { onAnswer(this.textContent); };
    }

    // =========================================================================
    // OYUN BİTİŞ & REKOR KONTROLÜ
    // =========================================================================
    finishGame(gameId, score, message) {
        const isNewRecord = this.isRecordBroken(gameId, score);

        if (isNewRecord) {
            sound.playWin();
            triggerConfetti();
            this.saveRecord(gameId, score, this.currentStudent);
        } else {
            sound.playTick();
        }

        const game = this.games.find(g => g.id === gameId);
        const arena = document.getElementById('miniGameArena');

        arena.innerHTML = `
            <div class="game-finish-card">
                ${isNewRecord ? '<div class="new-record-badge">🏆 YENİ SINIF REKORU! 🏆</div>' : ''}
                <div class="finish-avatar">${window.getStudentInitials ? window.getStudentInitials(this.currentStudent) : (this.currentStudent.first_name[0] + this.currentStudent.last_name[0])}</div>
                <h2 class="finish-student-name">${this.currentStudent.first_name} ${this.currentStudent.last_name}</h2>
                <div class="finish-game-title">${game.name}</div>

                <div class="finish-score-box">
                    <div class="finish-score-val">${score} ${game.unit}</div>
                    <div class="finish-score-desc">${message}</div>
                </div>

                <div class="finish-actions buttons-locked" id="finishActions">
                    <button class="btn btn-outline" id="btnFinishRetry" disabled onclick="miniGames.startRandomGame(miniGames.currentStudent)">
                        🔄 Başka Oyun Oyna
                    </button>
                    <button class="btn btn-primary" id="btnFinishClose" disabled onclick="miniGames.closeModal()">
                        ✅ Derse Devam Et
                    </button>
                </div>
                <div class="finish-lock-notice" id="finishLockNotice">
                    <span>🛡️ Yanlış dokunma koruması (1.5s)...</span>
                </div>
            </div>
        `;

        // Akıllı tahta tıklama kalkanı: Oyun bitişinde refleks hızlı tıklamaları engellemek için butonlar 1.5 saniye kilitli tutulur
        setTimeout(() => {
            const actions = document.getElementById('finishActions');
            const retryBtn = document.getElementById('btnFinishRetry');
            const closeBtn = document.getElementById('btnFinishClose');
            const notice = document.getElementById('finishLockNotice');

            if (actions) actions.classList.remove('buttons-locked');
            if (retryBtn) retryBtn.disabled = false;
            if (closeBtn) closeBtn.disabled = false;
            if (notice) {
                notice.style.transition = 'opacity 0.3s ease';
                notice.style.opacity = '0';
                setTimeout(() => notice.remove(), 300);
            }
        }, 1500);
    }
}

const miniGames = new MiniGameManager();
window.miniGames = miniGames;

