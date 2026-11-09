// ==============================================================================
// QR KOD İLE REALTIME AKILLI TAHTA GİRİŞ YÖNETİCİSİ
// ==============================================================================

class QRLoginManager {
    constructor() {
        this.currentSessionCode = null;
        this.realtimeChannel = null;
        this.countdownTimer = null;
        this.pollingTimer = null;
        this.isApprovedHandled = false;
        this.remainingSeconds = 90;
        this.qrCodeInstance = null;
    }

    generateSessionCode() {
        return 'etap_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    }

    async startNewSession() {
        this.cleanup();
        this.isApprovedHandled = false;
        this.currentSessionCode = this.generateSessionCode();
        this.remainingSeconds = APP_CONFIG.QR_TIMEOUT_SECONDS || 90;

        const qrContainer = document.getElementById('qrCodeContainer');
        const statusText = document.getElementById('qrStatusText');

        if (!qrContainer) return;

        qrContainer.innerHTML = '<div class="qr-loading-spinner"></div>';
        if (statusText) statusText.textContent = 'Güvenli QR Oturumu Hazırlanıyor...';

        const qrPayload = JSON.stringify({
            app: 'OgrenciSec',
            action: 'login',
            code: this.currentSessionCode,
            timestamp: Date.now()
        });

        if (supabaseClient) {
            try {
                const expiresAt = new Date(Date.now() + this.remainingSeconds * 1000).toISOString();
                const { error } = await supabaseClient.from('qr_sessions').insert([
                    {
                        session_code: this.currentSessionCode,
                        status: 'pending',
                        expires_at: expiresAt
                    }
                ]);

                if (!error) {
                    this.listenToSessionApproval(this.currentSessionCode);
                } else {
                    console.warn('QR oturum kaydı uyarısı:', error);
                    // Hata olsa dahi dinleyiciyi başlat
                    this.listenToSessionApproval(this.currentSessionCode);
                }
            } catch (err) {
                console.error('Supabase QR oturum hatası:', err);
                this.listenToSessionApproval(this.currentSessionCode);
            }
        } else {
            if (statusText) statusText.textContent = 'Demo Modu: Telefon veya aşağıdaki butondan simüle edebilirsiniz.';
        }

        this.renderQRCode(qrPayload, qrContainer);
        this.startCountdown();
    }

    renderQRCode(text, container) {
        container.innerHTML = '';
        if (window.QRCode) {
            this.qrCodeInstance = new window.QRCode(container, {
                text: text,
                width: 220,
                height: 220,
                colorDark: '#0f172a',
                colorLight: '#ffffff',
                correctLevel: window.QRCode.CorrectLevel.H
            });
        } else {
            const qrImg = document.createElement('img');
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(text)}&margin=10`;
            qrImg.alt = 'Giriş QR Kodu';
            qrImg.className = 'qr-image-display';
            container.appendChild(qrImg);
        }

        const statusText = document.getElementById('qrStatusText');
        if (statusText) {
            statusText.innerHTML = '<span class="status-dot pulsing"></span> Android uygulamadan QR kodu okutunuz';
        }
    }

    listenToSessionApproval(sessionCode) {
        if (!supabaseClient) return;

        // 1. Supabase Realtime WebSocket Kanalı
        try {
            this.realtimeChannel = supabaseClient
                .channel(`qr-session-${sessionCode}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'qr_sessions',
                        filter: `session_code=eq.${sessionCode}`
                    },
                    async (payload) => {
                        const newRecord = payload.new;
                        if (!this.isApprovedHandled) {
                            if (newRecord.status === 'approved') {
                                this.isApprovedHandled = true;
                                this.handleLoginSuccess(newRecord);
                            } else if (newRecord.status === 'rejected') {
                                this.isApprovedHandled = true;
                                this.handleLoginRejected();
                            }
                        }
                    }
                )
                .subscribe();
        } catch (rtErr) {
            console.warn('Realtime abonelik uyarısı:', rtErr);
        }

        // 2. Güçlü Yedek: MEB / ETAP Güvenlik Duvarı veya Realtime Gecikmesine Karşı Fallback Polling
        if (this.pollingTimer) clearInterval(this.pollingTimer);
        this.pollingTimer = setInterval(async () => {
            if (this.isApprovedHandled || !supabaseClient) return;

            try {
                const { data, error } = await supabaseClient
                    .from('qr_sessions')
                    .select('*')
                    .eq('session_code', sessionCode)
                    .maybeSingle();

                if (!error && data && !this.isApprovedHandled) {
                    if (data.status === 'approved') {
                        this.isApprovedHandled = true;
                        this.handleLoginSuccess(data);
                    } else if (data.status === 'rejected') {
                        this.isApprovedHandled = true;
                        this.handleLoginRejected();
                    }
                }
            } catch (pollErr) {
                // Arka plan yedek sorgu hatası, sonraki periyotta dener
            }
        }, 1500);
    }

    async handleLoginSuccess(record) {
        sound.playWin();
        this.cleanup();

        const qrContainer = document.getElementById('qrCodeContainer');
        const statusText = document.getElementById('qrStatusText');

        if (qrContainer) {
            qrContainer.innerHTML = `
                <div class="login-success-checkmark">
                    <svg viewBox="0 0 52 52" class="checkmark" style="width: 60px; height: 60px; stroke: #10b981; stroke-width: 4; fill: none; margin: 0 auto 10px;">
                        <circle cx="26" cy="26" r="25"/>
                        <path d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                    </svg>
                    <h4 style="color: #10b981; font-size: 1.2rem;">Giriş Onaylandı!</h4>
                    <p style="color: #f8fafc; margin-top: 4px;">${record.teacher_name || record.user_email || 'Öğretmen'}</p>
                </div>
            `;
        }

        if (statusText) {
            statusText.innerHTML = '<span class="status-dot green"></span> Akıllı tahtaya yönlendiriliyorsunuz...';
        }

        const teacherProfile = {
            id: record.teacher_id || 'teacher-demo-1',
            name: record.teacher_name || 'Öğretmen',
            email: record.user_email || 'ogretmen@meb.k12.tr'
        };

        if (record.auth_token) {
            await setSupabaseAuth(record.auth_token, record.refresh_token, teacherProfile);
        }

        setTimeout(() => {
            window.app.onTeacherLoggedIn(teacherProfile);
        }, 1200);
    }

    handleLoginRejected() {
        const statusText = document.getElementById('qrStatusText');
        if (statusText) {
            statusText.innerHTML = '<span class="status-dot red"></span> Giriş isteği telefon tarafından reddedildi.';
        }
    }

    startCountdown() {
        const countdownEl = document.getElementById('qrCountdown');
        const updateDisplay = () => {
            if (countdownEl) {
                const mins = Math.floor(this.remainingSeconds / 60);
                const secs = this.remainingSeconds % 60;
                countdownEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
        };

        updateDisplay();

        this.countdownTimer = setInterval(() => {
            this.remainingSeconds--;
            updateDisplay();

            if (this.remainingSeconds <= 0) {
                this.expireSession();
            }
        }, 1000);
    }

    expireSession() {
        this.cleanup();
        const qrContainer = document.getElementById('qrCodeContainer');
        const statusText = document.getElementById('qrStatusText');

        if (qrContainer) {
            qrContainer.innerHTML = `
                <div class="qr-expired-overlay">
                    <div class="expired-icon" style="font-size: 2.5rem; margin-bottom: 8px;">⏳</div>
                    <p style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 12px;">QR Kod Süresi Doldu</p>
                    <button class="btn btn-primary btn-sm" onclick="qrManager.startNewSession()">
                        Yeni QR Kod Üret
                    </button>
                </div>
            `;
        }

        if (statusText) {
            statusText.textContent = 'Oturum zaman aşımına uğradı. Güvenliğiniz için yenileyin.';
        }
    }

    cleanup() {
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
        if (this.realtimeChannel && supabaseClient) {
            try {
                supabaseClient.removeChannel(this.realtimeChannel);
            } catch (e) {}
            this.realtimeChannel = null;
        }
    }

    simulateMobileApproval(teacherName = 'Ahmet Hoca (Matematik)') {
        this.handleLoginSuccess({
            teacher_id: 'mock-teacher-id',
            teacher_name: teacherName,
            user_email: 'matematik@meb.k12.tr',
            status: 'approved'
        });
    }
}

const qrManager = new QRLoginManager();
