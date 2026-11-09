// ==============================================================================
// SUPABASE İSTEMCİSİ VE REALTIME ENTEGRASYONU
// ==============================================================================

let supabaseClient = null;
window.supabaseClient = null;

function initSupabaseClient(explicitToken = null) {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        console.warn('⚠️ Supabase JS kütüphanesi yüklenemedi.');
        supabaseClient = null;
        window.supabaseClient = null;
        return null;
    }

    if (!APP_CONFIG.SUPABASE_URL || !APP_CONFIG.SUPABASE_ANON_KEY) {
        console.warn('⚠️ Supabase URL veya Key henüz ayarlanmamış.');
        supabaseClient = null;
        window.supabaseClient = null;
        return null;
    }

    const token = explicitToken || localStorage.getItem('ogrencisec_auth_token');

    try {
        const clientOptions = {
            auth: {
                persistSession: true,
                autoRefreshToken: true
            },
            realtime: {
                params: {
                    eventsPerSecond: 10
                }
            },
            global: {
                headers: {
                    apikey: APP_CONFIG.SUPABASE_ANON_KEY
                },
                // KRİTİK: Supabase-js v2 oturum olmasa bile PostgREST isteklerindeki Authorization
                // başlığını anon_key ile ezebilir. Bu fetch interceptor, giden tüm HTTP isteklerine
                // öğretmen JWT token'ını en dış katmanda zorunlu olarak ekler.
                fetch: (url, options = {}) => {
                    const urlStr = String(url);
                    // Auth giriş, kayıt veya şifre yenileme isteklerinde eski token gönderilmemelidir!
                    const isAuthLoginRequest = urlStr.includes('/auth/v1/token') || urlStr.includes('/auth/v1/signup') || urlStr.includes('/auth/v1/recover');
                    const currentToken = isAuthLoginRequest ? null : (explicitToken || localStorage.getItem('ogrencisec_auth_token'));

                    options.headers = options.headers || {};
                    if (typeof options.headers.set === 'function') {
                        if (currentToken) {
                            options.headers.set('Authorization', `Bearer ${currentToken}`);
                        } else if (isAuthLoginRequest) {
                            options.headers.delete('Authorization');
                        }
                        options.headers.set('apikey', APP_CONFIG.SUPABASE_ANON_KEY);
                    } else if (Array.isArray(options.headers)) {
                        options.headers = options.headers.filter(([k]) => k.toLowerCase() !== 'authorization');
                        if (currentToken) {
                            options.headers.push(['Authorization', `Bearer ${currentToken}`]);
                        }
                        options.headers = options.headers.filter(([k]) => k.toLowerCase() !== 'apikey');
                        options.headers.push(['apikey', APP_CONFIG.SUPABASE_ANON_KEY]);
                    } else {
                        if (currentToken) {
                            options.headers['Authorization'] = `Bearer ${currentToken}`;
                        } else if (isAuthLoginRequest) {
                            delete options.headers['Authorization'];
                        }
                        options.headers['apikey'] = APP_CONFIG.SUPABASE_ANON_KEY;
                    }
                    return window.fetch(url, options);
                }
            }
        };

        if (token) {
            clientOptions.global.headers['Authorization'] = `Bearer ${token}`;
        }

        supabaseClient = window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY, clientOptions);
        window.supabaseClient = supabaseClient;

        if (token) {
            if (supabaseClient.rest) {
                supabaseClient.rest.headers['Authorization'] = `Bearer ${token}`;
            }
            if (supabaseClient.realtime && typeof supabaseClient.realtime.setAuth === 'function') {
                supabaseClient.realtime.setAuth(token);
            }
        }

        console.log('✅ Supabase bağlantısı hazır. Yetki:', token ? 'Öğretmen Oturumu Aktif' : 'Anonim');
        return supabaseClient;
    } catch (err) {
        console.error('❌ Supabase başlatma hatası:', err);
        supabaseClient = null;
        window.supabaseClient = null;
        return null;
    }
}

// Oturum açıldığında token'ı kaydet ve istemciyi yetkilendir
async function setSupabaseAuth(token, refreshToken = null, teacherData = null) {
    if (!token) return;
    localStorage.setItem('ogrencisec_auth_token', token);
    if (refreshToken) {
        localStorage.setItem('ogrencisec_refresh_token', refreshToken);
    }
    if (teacherData) {
        localStorage.setItem('ogrencisec_saved_teacher', JSON.stringify(teacherData));
    }

    // İstemciyi yetkili token ile yeniden oluştur (RLS izinleri için kritik)
    initSupabaseClient(token);

    // Eğer refresh token varsa Supabase GoTrue oturumunu da senkronize et
    if (supabaseClient && refreshToken) {
        try {
            await supabaseClient.auth.setSession({
                access_token: token,
                refresh_token: refreshToken
            });
        } catch (e) {
            console.warn('GoTrue setSession uyarısı:', e);
        }
    }
}

// Token süresi dolduğunda arka planda otomatik yenileme
let isRefreshingAuthToken = false;
async function refreshAuthTokenIfNeeded() {
    if (isRefreshingAuthToken) return false;
    const refreshToken = localStorage.getItem('ogrencisec_refresh_token');
    if (!refreshToken || !supabaseClient) return false;

    isRefreshingAuthToken = true;
    try {
        console.log('🔄 Supabase oturum tokenı yenileniyor...');
        const { data, error } = await supabaseClient.auth.refreshSession({ refresh_token: refreshToken });
        if (!error && data?.session) {
            const savedTeacherStr = localStorage.getItem('ogrencisec_saved_teacher');
            const teacher = savedTeacherStr ? JSON.parse(savedTeacherStr) : null;
            await setSupabaseAuth(data.session.access_token, data.session.refresh_token, teacher);
            console.log('✅ Supabase token başarıyla yenilendi.');
            isRefreshingAuthToken = false;
            return true;
        } else {
            console.warn('Supabase token yenilenemedi:', error);
        }
    } catch (e) {
        console.warn('Supabase refreshSession hatası:', e);
    } finally {
        isRefreshingAuthToken = false;
    }
    return false;
}
window.refreshAuthTokenIfNeeded = refreshAuthTokenIfNeeded;

// Oturum kapatıldığında yetkileri temizle
function clearSupabaseAuth() {
    localStorage.removeItem('ogrencisec_auth_token');
    localStorage.removeItem('ogrencisec_refresh_token');
    localStorage.removeItem('ogrencisec_saved_teacher');
    initSupabaseClient();
    window.supabaseClient = supabaseClient;
}

// Doğrudan e-posta ve şifre ile giriş (Masaüstü / Test / Yedek giriş)
async function loginWithEmailPassword(email, password) {
    if (!email || !password) {
        throw new Error('Lütfen e-posta ve şifrenizi giriniz.');
    }

    // Temiz bir bağlantı için eski bayat oturum başlığını temizle
    clearSupabaseAuth();

    if (!supabaseClient) {
        initSupabaseClient();
    }
    if (!supabaseClient) {
        throw new Error('Supabase istemcisi başlatılamadı.');
    }

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email.trim(),
            password: password
        });

        if (error) {
            console.error('Supabase signInWithPassword hatası:', error);
            let friendlyMsg = error.message;
            if (error.message.includes('Invalid login credentials')) {
                friendlyMsg = 'E-posta veya şifre hatalı. Lütfen bilgilerinizi kontrol ediniz.';
            } else if (error.message.includes('Email not confirmed')) {
                friendlyMsg = 'E-posta adresiniz henüz onaylanmamış.';
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                friendlyMsg = 'Supabase sunucusuna bağlanılamadı. İnternet bağlantınızı kontrol ediniz.';
            }
            throw new Error(friendlyMsg);
        }

        if (data && data.session) {
            const user = data.user;
            let fullName = user.user_metadata?.full_name || '';

            // Profil tablosundan isim çekmeyi dene
            try {
                const { data: profData } = await supabaseClient
                    .from('profiles')
                    .select('full_name')
                    .eq('id', user.id)
                    .maybeSingle();
                if (profData?.full_name) {
                    fullName = profData.full_name;
                }
            } catch (pErr) {
                console.warn('Profil ismi alınamadı, metadata kullanılacak:', pErr);
            }

            const profile = {
                id: user.id,
                name: fullName || user.email,
                email: user.email
            };

            await setSupabaseAuth(data.session.access_token, data.session.refresh_token, profile);
            return profile;
        }

        throw new Error('Oturum bilgisi alınamadı.');
    } catch (err) {
        throw err;
    }
}

// Uygulama açılışında başlat
initSupabaseClient();
