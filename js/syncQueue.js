/**
 * Öğrenci Seç - Çevrimdışı ve Güvenli Senkronizasyon Yöneticisi (SyncQueue)
 * v3.5
 * 
 * İnternet kesintilerinde veya Supabase yanıt vermediğinde verileri
 * tarayıcının yerel hafızasında (localStorage kuyruğunda) kayıpsız saklar.
 * Bağlantı geldiğinde, periyodik olarak, öğretmen çıkış yaptığında veya
 * tarayıcı kapanırken otomatik olarak Supabase bulut veritabanına aktarır.
 */

class SyncQueueManager {
    constructor() {
        this.STORAGE_KEY = 'ogrencisec_offline_sync_queue';
        this.isProcessing = false;
        this.queue = this.loadQueue();

        this.initListeners();
    }

    loadQueue() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    saveQueue() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.queue));
        } catch (e) {
            console.warn('SyncQueue yerel hafızaya yazılamadı:', e);
        }
        this.updateSyncUI();
    }

    hasPending() {
        return this.queue.length > 0;
    }

    // Kuyruğa işlem ekle (Aynı kayıt için önceki bekleyen işlemi birleştirir)
    enqueue(type, payload) {
        let itemId = '';
        if (type === 'student_update') {
            itemId = `student_${payload.studentId}`;
        } else if (type === 'wheel_state') {
            itemId = `wheel_${payload.classId}`;
        } else if (type === 'game_records') {
            itemId = `records_${payload.classId}`;
        } else {
            itemId = `${type}_${Date.now()}`;
        }

        const existingIndex = this.queue.findIndex(item => item.id === itemId);
        if (existingIndex >= 0) {
            // Varsa güncellemeleri birleştir
            if (type === 'student_update') {
                this.queue[existingIndex].payload.updates = {
                    ...this.queue[existingIndex].payload.updates,
                    ...payload.updates
                };
            } else {
                this.queue[existingIndex].payload = payload;
            }
            this.queue[existingIndex].timestamp = Date.now();
        } else {
            this.queue.push({
                id: itemId,
                type: type,
                payload: payload,
                timestamp: Date.now()
            });
        }

        this.saveQueue();
        
        // Hemen göndermeyi dene
        this.processQueue();
    }

    initListeners() {
        // İnternet geri geldiğinde otomatik aktar
        window.addEventListener('online', () => {
            console.log('🌐 İnternet bağlantısı sağlandı. Bekleyen kayıtlar senkronize ediliyor...');
            if (window.app && window.app.showToast) {
                window.app.showToast('🌐 İnternet sağlandı, bekleyen kayıtlar buluta aktarılıyor...', 'info');
            }
            this.processQueue();
        });

        // 20 saniyede bir sessiz arka plan kontrolü
        setInterval(() => {
            if (this.hasPending()) {
                this.processQueue();
            }
        }, 20000);

        // Sayfa / sekme kapatılırken hızlı eşitleme
        window.addEventListener('beforeunload', () => {
            if (this.hasPending()) {
                this.processQueue();
            }
        });
    }

    // Bekleyen tüm kuyruğu Supabase'e aktar
    async processQueue() {
        if (this.isProcessing || !this.hasPending()) return;

        const client = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
        if (!client || (window.app && window.app.isDemoMode)) {
            return;
        }

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            return;
        }

        this.isProcessing = true;
        const itemsToProcess = [...this.queue];
        const successfulIds = [];

        for (const item of itemsToProcess) {
            try {
                let success = false;
                if (item.type === 'student_update') {
                    success = await this.syncStudent(client, item.payload);
                } else if (item.type === 'wheel_state') {
                    success = await this.syncWheelState(client, item.payload);
                } else if (item.type === 'game_records') {
                    success = await this.syncGameRecords(client, item.payload);
                }

                if (success) {
                    successfulIds.push(item.id);
                } else {
                    // Bağlantı kopmuş veya token geçersiz olabilir; döngüyü kes ve bekle
                    break;
                }
            } catch (err) {
                console.warn('SyncQueue işlem hatası:', err);
                break;
            }
        }

        if (successfulIds.length > 0) {
            const hadPending = this.queue.length;
            this.queue = this.queue.filter(item => !successfulIds.includes(item.id));
            this.saveQueue();
            console.log(`✅ ${successfulIds.length} çevrimdışı işlem Supabase'e başarıyla aktarıldı.`);

            // Eğer tüm kuyruk temizlendiyse kullanıcıyı kısaca bilgilendir
            if (hadPending > 1 && this.queue.length === 0 && window.app && window.app.showToast) {
                window.app.showToast('✅ Çevrimdışı bekleyen tüm kayıtlar buluta başarıyla kaydedildi!', 'success');
            }
        }

        this.isProcessing = false;
    }

    async syncStudent(client, payload) {
        let query = client.from('students').update(payload.updates).eq('id', payload.studentId);
        if (payload.classId) {
            query = query.eq('class_id', payload.classId);
        }
        let { error } = await query;

        // JWT token süresi dolmuşsa yenileyip tekrar dene
        if (error && this.isAuthError(error)) {
            const refreshed = await this.refreshToken();
            if (refreshed) {
                const freshClient = window.supabaseClient || client;
                let retryQuery = freshClient.from('students').update(payload.updates).eq('id', payload.studentId);
                if (payload.classId) retryQuery = retryQuery.eq('class_id', payload.classId);
                const retryResult = await retryQuery;
                error = retryResult.error;
            }
        }

        if (error) {
            console.warn('Öğrenci buluta aktarılamadı (kuyrukta bekletilecek):', error.message);
            return false;
        }
        return true;
    }

    async syncWheelState(client, payload) {
        let { error } = await client.from('classes').update({ wheel_state: payload.stateData }).eq('id', payload.classId);

        if (error && this.isAuthError(error)) {
            const refreshed = await this.refreshToken();
            if (refreshed) {
                const freshClient = window.supabaseClient || client;
                const retryResult = await freshClient.from('classes').update({ wheel_state: payload.stateData }).eq('id', payload.classId);
                error = retryResult.error;
            }
        }

        if (error) {
            console.warn('Çark durumu buluta aktarılamadı (kuyrukta bekletilecek):', error.message);
            return false;
        }
        return true;
    }

    async syncGameRecords(client, payload) {
        let { error } = await client.from('classes').update({ game_records: payload.records }).eq('id', payload.classId);

        if (error && this.isAuthError(error)) {
            const refreshed = await this.refreshToken();
            if (refreshed) {
                const freshClient = window.supabaseClient || client;
                const retryResult = await freshClient.from('classes').update({ game_records: payload.records }).eq('id', payload.classId);
                error = retryResult.error;
            }
        }

        if (error) {
            console.warn('Oyun rekorları buluta aktarılamadı (kuyrukta bekletilecek):', error.message);
            return false;
        }
        return true;
    }

    isAuthError(error) {
        if (!error) return false;
        const msg = String(error.message || '').toLowerCase();
        return msg.includes('jwt') || msg.includes('token') || msg.includes('expired') || error.code === 'PGRST301' || error.status === 401;
    }

    async refreshToken() {
        if (window.refreshAuthTokenIfNeeded) {
            return await window.refreshAuthTokenIfNeeded();
        }
        return false;
    }

    // Çıkış öncesi bekleyen tüm işlemleri bekle ve bitir
    async flushAll() {
        if (!this.hasPending()) return;
        console.log('⏳ Çıkış öncesi bekleyen kayıtlar buluta aktarılıyor...');
        await this.processQueue();
    }

    updateSyncUI() {
        const indicator = document.getElementById('syncStatusIndicator');
        if (!indicator) return;

        if (this.queue.length > 0) {
            indicator.style.display = 'inline-flex';
            indicator.textContent = `💾 ${this.queue.length} Bekleyen Kayıt`;
            indicator.title = 'İnternet bağlantısı sağlandığında otomatik buluta aktarılacak';
        } else {
            indicator.style.display = 'none';
        }
    }
}

window.syncQueue = new SyncQueueManager();

