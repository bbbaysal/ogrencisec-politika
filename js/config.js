// ==============================================================================
// ÖĞRENCİ SEÇ - SUPABASE & UYGULAMA YAPILANDIRMASI
// ==============================================================================

const DEFAULT_SUPABASE_URL = 'https://nmobyolcujamebbnxiqy.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_ysp0dlt1UbB1w8p7mgcuLw_Y5b6hz3k';

const APP_CONFIG = {
    SUPABASE_URL: window.localStorage.getItem('ogrencisec_supabase_url') || DEFAULT_SUPABASE_URL,
    SUPABASE_ANON_KEY: window.localStorage.getItem('ogrencisec_supabase_key') || DEFAULT_SUPABASE_KEY,
    
    // QR Oturum süresi (saniye cinsinden)
    QR_TIMEOUT_SECONDS: 90,
    
    // Demo modu (Supabase hesabı olmadan test etmek için)
    IS_DEMO_DEFAULT: false
};

// Yapılandırmayı tarayıcı hafızasına kaydetme yardımcısı
function saveCustomSupabaseConfig(url, key) {
    if (url && key) {
        window.localStorage.setItem('ogrencisec_supabase_url', url.trim());
        window.localStorage.setItem('ogrencisec_supabase_key', key.trim());
        APP_CONFIG.SUPABASE_URL = url.trim();
        APP_CONFIG.SUPABASE_ANON_KEY = key.trim();
        return true;
    }
    return false;
}

// Yanlışlıkla bozulursa tek tıkla varsayılanlara sıfırlama
function resetSupabaseConfigToDefault() {
    window.localStorage.removeItem('ogrencisec_supabase_url');
    window.localStorage.removeItem('ogrencisec_supabase_key');
    APP_CONFIG.SUPABASE_URL = DEFAULT_SUPABASE_URL;
    APP_CONFIG.SUPABASE_ANON_KEY = DEFAULT_SUPABASE_KEY;
    return true;
}
