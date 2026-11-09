// ==============================================================================
// RAPOR VE PDF YÖNETİCİSİ (jsPDF & A4 Yazdırma Şablonları)
// ==============================================================================

class ReportManager {
    constructor() {}

    // Türkçe karakterleri jsPDF'in standart fontu için güvenli hale getiren yardımcı
    cleanText(str) {
        if (!str) return '';
        return String(str)
            .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
            .replace(/ü/g, 'u').replace(/Ü/g, 'U')
            .replace(/ş/g, 's').replace(/Ş/g, 'S')
            .replace(/ı/g, 'i').replace(/İ/g, 'I')
            .replace(/ö/g, 'o').replace(/Ö/g, 'O')
            .replace(/ç/g, 'c').replace(/Ç/g, 'C');
    }

    getCurrentClassData() {
        if (!app.currentClass) {
            alert('Lütfen önce bir sınıf seçiniz.');
            return null;
        }
        if (!app.students || app.students.length === 0) {
            alert('Bu sınıfta henüz kayıtlı öğrenci bulunmuyor.');
            return null;
        }

        const className = app.currentClass.name || 'Sınıf';
        const teacherName = app.currentTeacher?.name || 'Matematik Öğretmeni';
        const dateStr = new Date().toLocaleDateString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        return {
            className,
            teacherName,
            dateStr,
            students: app.students
        };
    }

    // Türkçe isimlere göre otomatik cinsiyet tespiti (Belirtilmemişse)
    detectGender(firstName) {
        if (!firstName) return 'Erkek';
        const clean = firstName.trim().toLowerCase('tr-TR');
        const femaleNames = new Set([
            'ayşe', 'fatma', 'emine', 'hatice', 'zeynep', 'elif', 'merve', 'büşra',
            'esra', 'zehra', 'safiye', 'makbule', 'melis', 'ece', 'seda', 'gamze',
            'tuğba', 'betül', 'hilal', 'kübra', 'ebru', 'sibel', 'derya', 'duygu',
            'pelin', 'irem', 'gizem', 'yağmur', 'damla', 'selin', 'aslı', 'ceren',
            'simge', 'özge', 'ezgi', 'burcu', 'begüm', 'beyza', 'şeyma', 'melike',
            'cansu', 'şevval', 'sena', 'beyzanur', 'aleyna', 'nisa', 'sude', 'nazlı',
            'hande', 'buse', 'defne', 'azra', 'nehir', 'duru', 'eylül', 'ecrin',
            'hira', 'masal', 'rabia', 'sevde', 'berfin', 'ilayda', 'sevgi', 'nur',
            'rümeysa', 'fatmanur', 'ayşenur', 'gül', 'gülşen', 'songül', 'yasemin',
            'didem', 'belinay', 'tuana', 'aylin', 'melek', 'eda', 'sinem', 'serap',
            'nurcan', 'filiz', 'hülya', 'leyla', 'canan', 'arzu', 'nihal', 'naz'
        ]);

        const words = clean.split(/\s+/);
        for (const w of words) {
            if (femaleNames.has(w)) return 'Kız';
        }
        return 'Erkek';
    }

    // =========================================================================
    // 1. SINIF LİSTESİ (e-OKUL STANDART RESMİ MEB LİSTESİ FORMATI)
    // =========================================================================
    downloadClassRosterPDF() {
        const data = this.getCurrentClassData();
        if (!data) return;

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

            // Üst Başlık Bilgisi
            doc.setFontSize(14);
            doc.setTextColor(0, 0, 0);
            doc.text(`${this.cleanText(data.className)} SINIF LISTESI`, 105, 15, { align: 'center' });

            doc.setFontSize(9);
            doc.setTextColor(100, 100, 100);
            doc.text(`Ogretmen: ${this.cleanText(data.teacherName)}   |   Tarih: ${data.dateStr}   |   Toplam: ${data.students.length} Ogrenci`, 105, 21, { align: 'center' });

            // Tablo Satırları: S.No | Öğrenci No | Adı | Soyadı
            const tableRows = data.students.map((s, index) => {
                const firstName = this.cleanText((s.first_name || '').toLocaleUpperCase('tr-TR'));
                const lastName = this.cleanText((s.last_name || '').toLocaleUpperCase('tr-TR'));

                return [
                    index + 1,
                    s.student_number || '',
                    firstName,
                    lastName
                ];
            });

            // Resimdeki format: Çift üst çizgi, temiz beyaz zemin, dikey çizgisiz satırlar, alt çizgi
            doc.autoTable({
                startY: 25,
                head: [['S.No', 'Öğrenci No', 'Adı', 'Soyadı']],
                body: tableRows,
                theme: 'plain',
                headStyles: {
                    fillColor: [255, 255, 255],
                    textColor: [0, 0, 0],
                    fontStyle: 'bold',
                    fontSize: 10,
                    lineWidth: { top: 0.8, bottom: 0.6, left: 0, right: 0 },
                    lineColor: [0, 0, 0]
                },
                styles: {
                    fontSize: 9.5,
                    cellPadding: { top: 2.8, bottom: 2.8, left: 3, right: 3 },
                    textColor: [0, 0, 0],
                    lineWidth: { bottom: 0.25, top: 0, left: 0, right: 0 },
                    lineColor: [120, 120, 120],
                    valign: 'middle'
                },
                columnStyles: {
                    0: { cellWidth: 20, halign: 'center' },
                    1: { cellWidth: 35, halign: 'center' },
                    2: { cellWidth: 65, halign: 'left' },
                    3: { cellWidth: 65, halign: 'left' }
                },
                didDrawPage: (hookData) => {
                    // Tablo üstüne çift çizgi efekti
                    const startY = hookData.settings.startY;
                    doc.setDrawColor(0, 0, 0);
                    doc.setLineWidth(0.4);
                    doc.line(14, startY - 1, 196, startY - 1);
                }
            });

            const fileName = `${this.cleanText(data.className).replace(/\s+/g, '_')}_Sinif_Listesi.pdf`;
            doc.save(fileName);
        } catch (err) {
            console.error('PDF oluşturma hatası:', err);
            this.printClassRoster();
        }
    }

    printClassRoster() {
        const data = this.getCurrentClassData();
        if (!data) return;

        const html = `
            <!DOCTYPE html>
            <html lang="tr">
            <head>
                <meta charset="UTF-8">
                <title>${data.className} - Sınıf Listesi</title>
                <style>
                    body {
                        font-family: 'Times New Roman', Times, serif;
                        padding: 30px;
                        color: #000;
                        background: #fff;
                    }
                    .page-header {
                        text-align: center;
                        margin-bottom: 20px;
                    }
                    .page-header h2 {
                        margin: 0 0 6px 0;
                        font-size: 18px;
                        font-weight: bold;
                        letter-spacing: 0.5px;
                    }
                    .meta-info {
                        font-size: 12px;
                        color: #333;
                        display: flex;
                        justify-content: space-between;
                        padding-bottom: 6px;
                    }
                    /* e-Okul Birebir Tablo Tasarımı (Cinsiyetsiz Sade MEB Formatı) */
                    .eokul-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-family: 'Times New Roman', Times, serif;
                        font-size: 13.5px;
                        color: #000;
                        border-top: 3px double #000;
                        border-bottom: 2px solid #000;
                    }
                    .eokul-table th {
                        padding: 6px 6px;
                        font-weight: bold;
                        border-bottom: 2px solid #000;
                        text-align: left;
                        background: transparent;
                    }
                    .eokul-table th.center {
                        text-align: center;
                    }
                    .eokul-table td {
                        padding: 5px 6px;
                        border-bottom: 1px solid #777;
                        background: #fff;
                    }
                    .eokul-table tr:last-child td {
                        border-bottom: none;
                    }
                    .center {
                        text-align: center;
                    }
                    @media print {
                        body { padding: 0; }
                        @page { size: portrait; margin: 1.5cm; }
                    }
                </style>
            </head>
            <body>
                <div class="page-header">
                    <h2>${data.className} SINIF LİSTESİ</h2>
                    <div class="meta-info">
                        <span>Öğretmen: <strong>${data.teacherName}</strong></span>
                        <span>Tarih: <strong>${data.dateStr}</strong></span>
                        <span>Toplam: <strong>${data.students.length} Öğrenci</strong></span>
                    </div>
                </div>

                <table class="eokul-table">
                    <thead>
                        <tr>
                            <th class="center" style="width: 60px;">S.No</th>
                            <th class="center" style="width: 120px;">Öğrenci No</th>
                            <th style="padding-left: 10px;">Adı</th>
                            <th style="padding-left: 10px;">Soyadı</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.students.map((s, idx) => `
                            <tr>
                                <td class="center">${idx + 1}</td>
                                <td class="center">${s.student_number}</td>
                                <td style="padding-left: 10px;">${(s.first_name || '').toLocaleUpperCase('tr-TR')}</td>
                                <td style="padding-left: 10px;">${(s.last_name || '').toLocaleUpperCase('tr-TR')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <script>
                    window.onload = function() { window.print(); }
                </script>
            </body>
            </html>
        `;

        const printWin = window.open('', '_blank');
        if (printWin) {
            printWin.document.open();
            printWin.document.write(html);
            printWin.document.close();
        }
    }

    // =========================================================================
    // 2. ÖDEV KONTROL ÇİZELGESİ (1-27 NUMARALI KARE IZGARA FORMATI)
    // =========================================================================
    downloadHomeworkTrackerPDF() {
        const data = this.getCurrentClassData();
        if (!data) return;

        try {
            const { jsPDF } = window.jspdf;
            // A4 Yatay (Landscape) Format: 297mm x 210mm
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

            // Üst Başlık Bilgisi
            doc.setFontSize(13);
            doc.setTextColor(0, 0, 0);
            doc.text(`${this.cleanText(data.className)} - ODEV KONTROL CIZELGESI`, 14, 11);

            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text(`Ogretmen: ${this.cleanText(data.teacherName)}   |   Tarih: ${data.dateStr}   |   Toplam: ${data.students.length} Ogrenci`, 14, 15);

            // Başlık Dizisi: SN, No, Ad Soyad ve 1'den 27'ye kadar kolonlar
            const headCols = ['SN', 'No', 'Ad Soyad'];
            for (let i = 1; i <= 27; i++) {
                headCols.push(String(i));
            }

            // Tablo Satırları
            const tableRows = data.students.map((s, index) => {
                const fullName = this.cleanText(`${s.first_name || ''} ${s.last_name || ''}`.trim().toLocaleUpperCase('tr-TR'));
                const row = [
                    index + 1,
                    s.student_number || '',
                    fullName
                ];
                // 27 adet boş ödev kontrol hücresi
                for (let i = 1; i <= 27; i++) {
                    row.push('');
                }
                return row;
            });

            // Kolon Genişlikleri (Toplam ~274mm, A4 297mm içine mükemmel sığar)
            const colStyles = {
                0: { cellWidth: 10, halign: 'center' }, // SN
                1: { cellWidth: 15, halign: 'center' }, // No
                2: { cellWidth: 50, halign: 'left' }    // Ad Soyad
            };
            for (let i = 3; i < 30; i++) {
                colStyles[i] = { cellWidth: 7.37, halign: 'center' }; // 1..27
            }

            doc.autoTable({
                startY: 18,
                head: [headCols],
                body: tableRows,
                theme: 'grid',
                headStyles: {
                    fillColor: [255, 255, 255],
                    textColor: [0, 0, 0],
                    fontStyle: 'bold',
                    fontSize: 7.5,
                    lineWidth: 0.35,
                    lineColor: [0, 0, 0],
                    cellPadding: 1.5,
                    halign: 'center'
                },
                styles: {
                    fontSize: 7.5,
                    cellPadding: { top: 1.5, bottom: 1.5, left: 1, right: 1 },
                    textColor: [0, 0, 0],
                    lineWidth: 0.25,
                    lineColor: [0, 0, 0],
                    valign: 'middle'
                },
                columnStyles: colStyles
            });

            const fileName = `${this.cleanText(data.className).replace(/\s+/g, '_')}_Odev_Kontrol_Cizelgesi.pdf`;
            doc.save(fileName);
        } catch (err) {
            console.error('PDF oluşturma hatası:', err);
            this.printHomeworkTracker();
        }
    }

    printHomeworkTracker() {
        const data = this.getCurrentClassData();
        if (!data) return;

        // 1'den 27'ye kadar başlıklar
        let thNumbers = '';
        for (let i = 1; i <= 27; i++) {
            thNumbers += `<th class="num-col">${i}</th>`;
        }

        const html = `
            <!DOCTYPE html>
            <html lang="tr">
            <head>
                <meta charset="UTF-8">
                <title>${data.className} - Ödev Kontrol Çizelgesi</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 15px;
                        color: #000;
                        background: #fff;
                    }
                    .header-info {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                        margin-bottom: 8px;
                        font-size: 11px;
                        color: #333;
                    }
                    .header-info h2 {
                        margin: 0;
                        font-size: 15px;
                        font-weight: bold;
                        color: #000;
                    }
                    /* Tam Izgara Çizelge Formatı (Kullanıcı Görseliyle Birebir) */
                    table.hw-grid-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 10.5px;
                        color: #000;
                    }
                    table.hw-grid-table th,
                    table.hw-grid-table td {
                        border: 1px solid #000;
                        padding: 3.5px 2px;
                        text-align: center;
                    }
                    table.hw-grid-table th {
                        font-weight: bold;
                        background-color: #fff;
                        font-size: 10px;
                    }
                    table.hw-grid-table th.name-th,
                    table.hw-grid-table td.name-td {
                        text-align: left;
                        padding-left: 6px;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    .sn-col { width: 32px; }
                    .no-col { width: 44px; }
                    .num-col { width: 25px; }
                    @media print {
                        body { padding: 0; }
                        @page {
                            size: landscape;
                            margin: 0.8cm;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="header-info">
                    <h2>${data.className} — ÖDEV KONTROL ÇİZELGESİ</h2>
                    <div>
                        Öğretmen: <strong>${data.teacherName}</strong> &nbsp;|&nbsp;
                        Tarih: <strong>${data.dateStr}</strong> &nbsp;|&nbsp;
                        Toplam: <strong>${data.students.length} Öğrenci</strong>
                    </div>
                </div>

                <table class="hw-grid-table">
                    <thead>
                        <tr>
                            <th class="sn-col">SN</th>
                            <th class="no-col">No</th>
                            <th class="name-th" style="min-width: 150px;">Ad Soyad</th>
                            ${thNumbers}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.students.map((s, idx) => `
                            <tr>
                                <td class="sn-col">${idx + 1}</td>
                                <td class="no-col"><strong>${s.student_number}</strong></td>
                                <td class="name-td">${(s.first_name + ' ' + s.last_name).toLocaleUpperCase('tr-TR')}</td>
                                ${'<td></td>'.repeat(27)}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <script>
                    window.onload = function() { window.print(); }
                </script>
            </body>
            </html>
        `;

        const printWin = window.open('', '_blank');
        if (printWin) {
            printWin.document.open();
            printWin.document.write(html);
            printWin.document.close();
        }
    }

    // Geriye dönük uyumluluk takma adları (Aliases)
    downloadPlusMinusPDF() {
        this.downloadHomeworkTrackerPDF();
    }

    printPlusMinus() {
        this.printHomeworkTracker();
    }

    // =========================================================================
    // 3. TOPLAM ARTI/EKSİ VE TAHTAYA KALKMA VERİLERİ (GENEL RAPOR / KARNE)
    // =========================================================================
    downloadComprehensiveReportPDF() {
        const data = this.getCurrentClassData();
        if (!data) return;

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            const totalBoard = data.students.reduce((a, b) => a + (b.board_count || 0), 0);
            const totalPlus = data.students.reduce((a, b) => a + (b.plus_count || 0), 0);
            const totalMinus = data.students.reduce((a, b) => a + (b.minus_count || 0), 0);

            // Başlık Alanı
            doc.setFontSize(16);
            doc.setTextColor(30, 41, 59);
            doc.text(`${this.cleanText(data.className)} - Tahta Katilimi ve Performans Raporu`, 14, 18);

            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139);
            doc.text(`Ogretmen: ${this.cleanText(data.teacherName)}   |   Tarih: ${data.dateStr}`, 14, 25);
            doc.text(`Toplam Kalkma: ${totalBoard}   |   Toplam (+): ${totalPlus}   |   Toplam (-): ${totalMinus}`, 14, 31);

            // Tablo Satırları
            const tableRows = data.students.map((s, index) => {
                const board = s.board_count || 0;
                const plus = s.plus_count || 0;
                const minus = s.minus_count || 0;
                const lastCalled = s.last_called_at 
                    ? new Date(s.last_called_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })
                    : '-';

                return [
                    index + 1,
                    s.student_number || '',
                    this.cleanText(`${s.first_name} ${s.last_name}`),
                    board,
                    `+${plus}`,
                    `-${minus}`,
                    lastCalled
                ];
            });

            doc.autoTable({
                startY: 36,
                head: [['Sıra', 'Okul No', 'Adı Soyadı', 'Tahta (🎯)', 'Artı (+)', 'Eksi (-)', 'Son Tahta']],
                body: tableRows,
                theme: 'striped',
                headStyles: {
                    fillColor: [99, 102, 241], // #6366f1
                    textColor: [255, 255, 255],
                    fontStyle: 'bold'
                },
                styles: {
                    fontSize: 10,
                    cellPadding: 4
                },
                columnStyles: {
                    0: { cellWidth: 15, halign: 'center' },
                    1: { cellWidth: 25, halign: 'center' },
                    2: { cellWidth: 65 },
                    3: { cellWidth: 25, halign: 'center' },
                    4: { cellWidth: 20, halign: 'center' },
                    5: { cellWidth: 20, halign: 'center' },
                    6: { cellWidth: 25, halign: 'center' }
                }
            });

            const fileName = `${this.cleanText(data.className).replace(/\s+/g, '_')}_Genel_Performans_Raporu.pdf`;
            doc.save(fileName);
        } catch (err) {
            console.error('PDF oluşturma hatası:', err);
            this.printComprehensiveReport();
        }
    }

    printComprehensiveReport() {
        const data = this.getCurrentClassData();
        if (!data) return;

        const totalBoard = data.students.reduce((a, b) => a + (b.board_count || 0), 0);
        const totalPlus = data.students.reduce((a, b) => a + (b.plus_count || 0), 0);
        const totalMinus = data.students.reduce((a, b) => a + (b.minus_count || 0), 0);
        const avgBoard = data.students.length ? (totalBoard / data.students.length).toFixed(1) : 0;

        const html = `
            <!DOCTYPE html>
            <html lang="tr">
            <head>
                <meta charset="UTF-8">
                <title>${data.className} - Genel Katılım & Performans Raporu</title>
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; color: #1e293b; }
                    .header { border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 16px; }
                    .header h1 { margin: 0 0 6px 0; font-size: 20px; color: #4f46e5; }
                    .meta { font-size: 13px; color: #64748b; line-height: 1.6; }
                    .summary-cards { display: flex; gap: 12px; margin-bottom: 18px; }
                    .card { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; text-align: center; }
                    .card .num { font-size: 20px; font-weight: 800; color: #1e293b; margin-top: 2px; }
                    .card .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; }
                    table { width: 100%; border-collapse: collapse; font-size: 13px; }
                    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
                    th { background-color: #f1f5f9; font-weight: 600; color: #0f172a; }
                    .center { text-align: center; }
                    .board-val { font-weight: 800; color: #2563eb; }
                    .plus { color: #059669; font-weight: 700; }
                    .minus { color: #e11d48; font-weight: 700; }
                    tr:nth-child(even) { background-color: #f8fafc; }
                    @media print {
                        body { padding: 0; }
                        @page { margin: 1.5cm; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${data.className} — Genel Tahta Katılımı ve Performans Karnesi</h1>
                    <div class="meta">
                        Öğretmen: <strong>${data.teacherName}</strong> &nbsp;|&nbsp; Tarih: <strong>${data.dateStr}</strong>
                    </div>
                </div>

                <div class="summary-cards">
                    <div class="card">
                        <div class="label">Toplam Öğrenci</div>
                        <div class="num">${data.students.length}</div>
                    </div>
                    <div class="card">
                        <div class="label">Tahtaya Kaldırılma</div>
                        <div class="num" style="color: #2563eb;">${totalBoard}</div>
                    </div>
                    <div class="card">
                        <div class="label">Öğrenci Başına Ort.</div>
                        <div class="num">${avgBoard}</div>
                    </div>
                    <div class="card">
                        <div class="label">Toplam Artı (+)</div>
                        <div class="num" style="color: #059669;">${totalPlus}</div>
                    </div>
                    <div class="card">
                        <div class="label">Toplam Eksi (-)</div>
                        <div class="num" style="color: #e11d48;">${totalMinus}</div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th class="center" style="width: 40px;">Sıra</th>
                            <th class="center" style="width: 80px;">Okul No</th>
                            <th>Adı Soyadı</th>
                            <th class="center" style="width: 90px;">Tahtaya (🎯)</th>
                            <th class="center" style="width: 70px;">Artı (+)</th>
                            <th class="center" style="width: 70px;">Eksi (-)</th>
                            <th class="center" style="width: 95px;">Son Kalkma</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.students.map((s, idx) => {
                            const lastCalled = s.last_called_at 
                                ? new Date(s.last_called_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })
                                : '-';
                            return `
                                <tr>
                                    <td class="center">${idx + 1}</td>
                                    <td class="center"><strong>${s.student_number}</strong></td>
                                    <td>${s.first_name} ${s.last_name}</td>
                                    <td class="center board-val">${s.board_count || 0} kez</td>
                                    <td class="center plus">+${s.plus_count || 0}</td>
                                    <td class="center minus">-${s.minus_count || 0}</td>
                                    <td class="center" style="font-size: 12px; color: #64748b;">${lastCalled}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                <script>
                    window.onload = function() { window.print(); }
                </script>
            </body>
            </html>
        `;

        const printWin = window.open('', '_blank');
        if (printWin) {
            printWin.document.open();
            printWin.document.write(html);
            printWin.document.close();
        }
    }
}

const reportManager = new ReportManager();
window.reportManager = reportManager;
