/**
 * Attendix - Real-Time Student Attendance Tracker
 * Full UI Logic, Scraper Client, Bunk Calculations, Chart.js, Vector jsPDF, Web Crypto API
 */

(function () {
  'use strict';

  // =====================================================
  // 1. CONSTANTS & MOTIVATIONAL QUOTES
  // =====================================================
  const MOTIVATIONAL_QUOTES = [
    "“Success is the sum of small efforts, repeated day in and day out.”",
    "“Consistency is what transforms average into excellence.”",
    "“Don't watch the clock; do what it does. Keep going.”",
    "“Education is the passport to the future, for tomorrow belongs to those who prepare today.”",
    "“The expert in anything was once a beginner. Show up every day.”",
    "“Discipline is choosing between what you want now and what you want most.”",
    "“Your future is created by what you do today, not tomorrow.”",
    "“Showing up is 80 percent of life. Attend with pride!”",
    "“Excellence is not an act, but a habit.”",
    "“Small daily improvements over time lead to stunning results.”",
    "“Knowledge has no value unless you put it into practice and show up.”",
    "“Energy flows where attention goes. Focus on your goals.”",
    "“Stay dedicated, it's not going to happen overnight, but it will happen.”",
    "“Be stronger than your strongest excuse.”",
    "“Mastery demands continuous presence, both mentally and physically.”"
  ];

  const LOADING_MESSAGES = [
    "Fetching your records ☕",
    "Counting your classes 📊",
    "Analyzing subject metrics 🔍",
    "Calculating predictive bunk advice 🧮",
    "Almost there ✨"
  ];

  // =====================================================
  // 2. WEB CRYPTO API MANAGER (SECURE CREDENTIALS ENCRYPTION)
  // =====================================================
  const CryptoManager = {
    DB_NAME: 'AttendixKeyStore',
    STORE_NAME: 'keys',
    STORAGE_KEY: 'attendix_enc_credentials',

    // Open or create IndexedDB for crypto key storage
    openDB() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(this.DB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(this.STORE_NAME)) {
            db.createObjectStore(this.STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },

    // Get or generate AES-GCM 256-bit key
    async getOrCreateKey() {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE_NAME, 'readonly');
        const store = tx.objectStore(this.STORE_NAME);
        const req = store.get('masterKey');
        req.onsuccess = async () => {
          if (req.result) {
            resolve(req.result);
          } else {
            // Generate a fresh key
            const key = await window.crypto.subtle.generateKey(
              { name: 'AES-GCM', length: 256 },
              false,
              ['encrypt', 'decrypt']
            );
            const writeTx = db.transaction(this.STORE_NAME, 'readwrite');
            writeTx.objectStore(this.STORE_NAME).put(key, 'masterKey');
            writeTx.oncomplete = () => resolve(key);
            writeTx.onerror = () => reject(writeTx.error);
          }
        };
        req.onerror = () => reject(req.error);
      });
    },

    // Encrypt and persist credentials
    async saveCredentials(username, password) {
      try {
        const key = await this.getOrCreateKey();
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(JSON.stringify({ username, password }));
        const ciphertext = await window.crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          encoded
        );

        const payload = {
          iv: Array.from(iv),
          data: Array.from(new Uint8Array(ciphertext))
        };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
      } catch (err) {
        console.warn('Failed to encrypt credentials securely on device:', err);
      }
    },

    // Decrypt credentials
    async loadCredentials() {
      try {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (!raw) return null;
        const payload = JSON.parse(raw);
        const key = await this.getOrCreateKey();
        const iv = new Uint8Array(payload.iv);
        const ciphertext = new Uint8Array(payload.data);

        const decrypted = await window.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          key,
          ciphertext
        );
        const decoded = new TextDecoder().decode(decrypted);
        return JSON.parse(decoded);
      } catch (err) {
        console.warn('Failed to decrypt stored credentials:', err);
        return null;
      }
    },

    // Completely purge stored credentials and cryptographic keys
    async purgeCredentials() {
      localStorage.removeItem(this.STORAGE_KEY);
      try {
        const db = await this.openDB();
        const tx = db.transaction(this.STORE_NAME, 'readwrite');
        tx.objectStore(this.STORE_NAME).delete('masterKey');
      } catch (e) {
        // Ignore DB clear errors
      }
    }
  };

  // =====================================================
  // 3. APPLICATION STATE
  // =====================================================
  const AppState = {
    student: null,
    subjects: [],
    selectedCodes: new Set(),
    currentTarget: 85, // Default 85%
    sortOrder: 'default',
    lastLoginTime: 'Just now',
    chartComparison: null,
    chartDistribution: null,
    deferredPrompt: null,
    cachedCredentials: null
  };

  // Helper: DOM sanitization
  function sanitize(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Toast Notification
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const bgClass = type === 'error' ? 'bg-red-500/90 border-red-400' : 'bg-brandPurple/90 border-purple-400';
    toast.className = `px-4 py-2.5 rounded-xl shadow-xl text-white text-xs font-semibold backdrop-blur-md border ${bgClass} animate-fade-in flex items-center gap-2 pointer-events-auto`;
    toast.innerHTML = `<span>${type === 'error' ? '⚠️' : '✅'}</span><span>${sanitize(message)}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('opacity-0', 'transition-opacity', 'duration-300');
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // =====================================================
  // 4. MATHEMATICAL FORMULAS & PREDICTIVE BUNK ADVICE
  // =====================================================
  const BunkMath = {
    // Computes overall attendance percentage safely
    getPercentage(attended, conducted) {
      if (!conducted || conducted <= 0) return 0;
      return (attended / conducted) * 100;
    },

    // Safe Skips: X = floor(attended / T - conducted)
    getSafeSkips(attended, conducted, targetFraction) {
      if (!targetFraction || targetFraction <= 0) return 0;
      const x = Math.floor(attended / targetFraction - conducted);
      return Math.max(0, x);
    },

    // Required Classes to Recover: Y = ceil((T * conducted - attended) / (1 - T))
    getRequiredClasses(attended, conducted, targetFraction) {
      if (targetFraction >= 1) return 999;
      const numerator = targetFraction * conducted - attended;
      if (numerator <= 0) return 0;
      return Math.ceil(numerator / (1 - targetFraction));
    },

    // Risk classification: >= 85 Safe, 75-84.99 Warning, < 75 Danger
    getRisk(pct) {
      if (pct >= 85) return 'safe';
      if (pct >= 75) return 'warning';
      return 'danger';
    },

    // Per-subject tips
    getSubjectAdvice(attended, conducted) {
      const pct = this.getPercentage(attended, conducted);
      if (pct >= 75) {
        const skips = this.getSafeSkips(attended, conducted, 0.75);
        if (skips > 0) {
          return { text: `Can skip ${skips} class${skips > 1 ? 'es' : ''} ✅`, type: 'safe' };
        } else {
          return { text: `On the edge! Don't miss next class ⚠️`, type: 'warning' };
        }
      } else {
        const req = this.getRequiredClasses(attended, conducted, 0.75);
        return { text: `Attend next ${req} class${req > 1 ? 'es' : ''} to reach 75% 📚`, type: 'danger' };
      }
    }
  };

  // =====================================================
  // 5. CHART.JS VISUALIZATION ENGINE
  // =====================================================
  const ChartEngine = {
    renderSubjectComparison(subjects) {
      const canvas = document.getElementById('chart-subject-comparison');
      if (!canvas) return;

      if (AppState.chartComparison) {
        AppState.chartComparison.destroy();
      }

      const labels = subjects.map(s => {
        // Use code or truncated subject name
        return s.code || (s.name.length > 15 ? s.name.substring(0, 14) + '…' : s.name);
      });

      const dataValues = subjects.map(s => {
        return parseFloat(BunkMath.getPercentage(s.attended, s.conducted).toFixed(1));
      });

      const backgroundColors = dataValues.map(val => {
        if (val >= 85) return 'rgba(34, 197, 94, 0.85)';
        if (val >= 75) return 'rgba(245, 158, 11, 0.85)';
        return 'rgba(239, 68, 68, 0.85)';
      });

      const borderColors = dataValues.map(val => {
        if (val >= 85) return '#22c55e';
        if (val >= 75) return '#f59e0b';
        return '#ef4444';
      });

      AppState.chartComparison = new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Attendance %',
            data: dataValues,
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 1.5,
            borderRadius: 6,
            maxBarThickness: 36
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(15, 10, 30, 0.95)',
              titleColor: '#fff',
              bodyColor: '#cbd5e1',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              padding: 10,
              callbacks: {
                title: (items) => {
                  const idx = items[0].dataIndex;
                  return subjects[idx].name;
                },
                label: (item) => {
                  const idx = item.dataIndex;
                  const s = subjects[idx];
                  return `${item.formattedValue}% (${s.attended}/${s.conducted} classes)`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: {
                color: '#94a3b8',
                font: { family: 'Inter', size: 10 },
                callback: (v) => v + '%'
              }
            },
            x: {
              grid: { display: false },
              ticks: {
                color: '#cbd5e1',
                font: { family: 'Inter', size: 10 }
              }
            }
          }
        }
      });
    },

    renderStatusDistribution(subjects) {
      const canvas = document.getElementById('chart-status-distribution');
      if (!canvas) return;

      if (AppState.chartDistribution) {
        AppState.chartDistribution.destroy();
      }

      let safeCount = 0;
      let warnCount = 0;
      let dangerCount = 0;

      subjects.forEach(s => {
        const pct = BunkMath.getPercentage(s.attended, s.conducted);
        const risk = BunkMath.getRisk(pct);
        if (risk === 'safe') safeCount++;
        else if (risk === 'warning') warnCount++;
        else dangerCount++;
      });

      // Update counters in UI
      const safeEl = document.getElementById('stat-safe-count');
      const warnEl = document.getElementById('stat-warning-count');
      const dangerEl = document.getElementById('stat-danger-count');
      if (safeEl) safeEl.textContent = safeCount;
      if (warnEl) warnEl.textContent = warnCount;
      if (dangerEl) dangerEl.textContent = dangerCount;

      AppState.chartDistribution = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: ['Safe (≥85%)', 'Warning (75-84.9%)', 'Danger (<75%)'],
          datasets: [{
            data: [safeCount, warnCount, dangerCount],
            backgroundColor: [
              'rgba(34, 197, 94, 0.9)',
              'rgba(245, 158, 11, 0.9)',
              'rgba(239, 68, 68, 0.9)'
            ],
            borderColor: '#0f0a1e',
            borderWidth: 2,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(15, 10, 30, 0.95)',
              padding: 10
            }
          }
        }
      });
    }
  };

  // =====================================================
  // 6. VECTOR PDF GENERATOR (jsPDF + autoTable)
  // =====================================================
  const PDFExporter = {
    exportReport() {
      if (!window.jspdf) {
        showToast('jsPDF library loading, please retry in a second', 'error');
        return;
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const student = AppState.student || {
        name: 'CHOWDEGARI BANNI',
        roll: '24691A0551',
        year: 'III YEAR',
        branch: 'CSE A',
        city: 'ANANTAPUR'
      };

      // Filter only selected subjects
      const selectedSubjects = AppState.subjects.filter(s => AppState.selectedCodes.has(s.code));
      if (selectedSubjects.length === 0) {
        showToast('Please select at least one subject to generate the PDF report', 'error');
        return;
      }

      let totalAttended = 0;
      let totalConducted = 0;
      selectedSubjects.forEach(s => {
        totalAttended += s.attended;
        totalConducted += s.conducted;
      });
      const overallPct = BunkMath.getPercentage(totalAttended, totalConducted).toFixed(1);

      // --- PDF Header Branding ---
      // Top Dark Banner
      doc.setFillColor(15, 10, 30);
      doc.rect(0, 0, 210, 48, 'F');

      // Top Accent Line
      doc.setFillColor(109, 40, 217);
      doc.rect(0, 0, 210, 3, 'F');

      // Header Text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      const pdfHeader = [student.name.toUpperCase()];
      const yearBranch = [student.year, student.branch].filter(Boolean).join(' ');
      if (yearBranch) pdfHeader.push(yearBranch);
      if (student.city) pdfHeader.push(student.city);
      doc.text(pdfHeader.join('  |  '), 14, 18);

      // Sub-details
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(203, 213, 225);
      const generatedDate = new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
      doc.text(`Roll Number: ${student.roll}    •    Generated: ${generatedDate}`, 14, 27);
      doc.text(`Official IMS Scraped Attendance Records`, 14, 34);

      // Right-aligned Overall Badge
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(34, 197, 94);
      doc.text(`${overallPct}%`, 196, 20, { align: 'right' });
      doc.setFontSize(9);
      doc.setTextColor(203, 213, 225);
      doc.text(`Total: ${totalAttended}/${totalConducted} classes`, 196, 28, { align: 'right' });

      // Table Data Construction
      const tableRows = selectedSubjects.map((s, idx) => {
        const pct = BunkMath.getPercentage(s.attended, s.conducted);
        const risk = BunkMath.getRisk(pct);
        const statusText = risk === 'safe' ? 'Safe Zone' : (risk === 'warning' ? 'Warning' : 'Danger Zone');
        return [
          idx + 1,
          s.code,
          s.name,
          s.attended,
          s.conducted,
          `${pct.toFixed(1)}%`,
          statusText
        ];
      });

      // Render autoTable
      doc.autoTable({
        startY: 54,
        head: [['#', 'Code', 'Subject Name', 'Attended', 'Conducted', 'Percentage', 'Status']],
        body: tableRows,
        theme: 'grid',
        headStyles: {
          fillColor: [109, 40, 217],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9
        },
        styles: {
          fontSize: 8.5,
          cellPadding: 3.5,
          font: 'helvetica'
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 26, fontStyle: 'bold' },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 20, halign: 'center' },
          4: { cellWidth: 20, halign: 'center' },
          5: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
          6: { cellWidth: 28, halign: 'center' }
        },
        didParseCell: (data) => {
          if (data.section === 'body' && (data.column.index === 5 || data.column.index === 6)) {
            const rawPct = parseFloat(data.row.raw[5]);
            if (rawPct >= 85) {
              data.cell.styles.textColor = [22, 101, 52]; // Dark green
            } else if (rawPct >= 75) {
              data.cell.styles.textColor = [180, 83, 9]; // Dark amber
            } else {
              data.cell.styles.textColor = [185, 28, 28]; // Dark red
            }
          }
        },
        margin: { left: 14, right: 14 }
      });

      // Footer line: "Generated by Attendix"
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8.5);
        doc.setTextColor(148, 163, 184);
        doc.text('Generated by Attendix  •  Real-Time Attendance Intelligence', 14, 288);
        doc.text(`Page ${i} of ${pageCount}`, 196, 288, { align: 'right' });
      }

      const filename = `Attendix_Report_${student.roll}_${Date.now()}.pdf`;
      doc.save(filename);
      showToast('PDF Report downloaded successfully! 📄');
    }
  };

  // =====================================================
  // 7. COPY TEXT SUMMARY (CLIPBOARD)
  // =====================================================
  const TextSummary = {
    copy() {
      const student = AppState.student || {
        name: 'CHOWDEGARI BANNI',
        roll: '24691A0551',
        year: 'III YEAR',
        branch: 'CSE A',
        city: 'ANANTAPUR'
      };

      const selectedSubjects = AppState.subjects.filter(s => AppState.selectedCodes.has(s.code));
      if (selectedSubjects.length === 0) {
        showToast('Please select subjects to copy summary', 'error');
        return;
      }

      let totalAttended = 0;
      let totalConducted = 0;
      selectedSubjects.forEach(s => {
        totalAttended += s.attended;
        totalConducted += s.conducted;
      });
      const overallPct = BunkMath.getPercentage(totalAttended, totalConducted).toFixed(1);

      let text = `==================================================\n`;
      text += `ATTENDIX ATTENDANCE SUMMARY\n`;
      const sumHeader = [student.name.toUpperCase()];
      const yearBranchSum = [student.year, student.branch].filter(Boolean).join(' ');
      if (yearBranchSum) sumHeader.push(yearBranchSum);
      if (student.city) sumHeader.push(student.city);
      text += `${sumHeader.join(' | ')}\n`;
      text += `Roll Number: ${student.roll}\n`;
      text += `Overall Attendance: ${overallPct}% (${totalAttended}/${totalConducted} classes)\n`;
      text += `Status: ${overallPct >= 85 ? 'Safe Zone (≥85%)' : (overallPct >= 75 ? 'Warning (75-84.9%)' : 'Danger Zone (<75%)')}\n`;
      text += `==================================================\n`;
      text += `SELECTED SUBJECT RECORDS:\n`;

      selectedSubjects.forEach((s, idx) => {
        const pct = BunkMath.getPercentage(s.attended, s.conducted).toFixed(1);
        const advice = BunkMath.getSubjectAdvice(s.attended, s.conducted);
        text += `${idx + 1}. [${s.code}] ${s.name}: ${s.attended}/${s.conducted} (${pct}%) - ${advice.text}\n`;
      });

      text += `==================================================\n`;
      text += `Generated via Attendix Web App on ${new Date().toLocaleString()}\n`;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          showToast('Copied! ✅');
        }).catch(() => {
          this.fallbackCopy(text);
        });
      } else {
        this.fallbackCopy(text);
      }
    },

    fallbackCopy(text) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        showToast('Copied! ✅');
      } catch (err) {
        showToast('Could not copy to clipboard', 'error');
      }
      document.body.removeChild(textarea);
    }
  };

  // =====================================================
  // 8. UI MANAGER & DATA RENDERING
  // =====================================================
  const UIManager = {
    // Sets time-of-day greeting (Section 6)
    updateGreeting() {
      const greetingEl = document.getElementById('banner-greeting');
      if (!greetingEl) return;

      const hour = new Date().getHours();
      let displayName = 'Banni';
      if (AppState.student && AppState.student.name) {
        const parts = AppState.student.name.trim().split(/\s+/);
        // If Chowdegari Banni, use Banni; otherwise use first or second name
        if (AppState.student.name.toUpperCase().includes('BANNI')) {
          displayName = 'Banni';
        } else if (parts.length > 0) {
          displayName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
        }
      }

      let text = `Good Morning, ${displayName} 👋`;
      if (hour >= 12 && hour < 17) {
        text = `Good Afternoon, ${displayName} ☀️`;
      } else if (hour >= 17) {
        text = `Good Evening, ${displayName} 🌙`;
      }
      greetingEl.textContent = text;
    },

    // Displays random motivational quote
    updateRandomQuote() {
      const quoteEl = document.getElementById('banner-quote');
      if (!quoteEl) return;
      const randomIndex = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
      quoteEl.textContent = MOTIVATIONAL_QUOTES[randomIndex];
    },

    // Renders overall card with circular progress ring
    renderOverallCard() {
      let totalAttended = 0;
      let totalConducted = 0;

      AppState.subjects.forEach(s => {
        totalAttended += s.attended;
        totalConducted += s.conducted;
      });

      const overallPct = BunkMath.getPercentage(totalAttended, totalConducted);
      const pctFormatted = overallPct.toFixed(1);

      // Percentage and counter values
      const pctText = document.getElementById('overall-percentage-text');
      const ratioText = document.getElementById('overall-classes-ratio');
      const attendedCount = document.getElementById('counter-attended');
      const conductedCount = document.getElementById('counter-conducted');
      const badge = document.getElementById('overall-status-badge');
      const motivationalMsg = document.getElementById('overall-motivational-msg');

      if (pctText) pctText.textContent = `${pctFormatted}%`;
      if (ratioText) ratioText.textContent = `${totalAttended} / ${totalConducted} classes`;
      if (attendedCount) attendedCount.textContent = totalAttended;
      if (conductedCount) conductedCount.textContent = totalConducted;

      // Animate circular progress ring
      // Circumference = 2 * PI * r = 2 * PI * 68 = ~427.26
      const circle = document.getElementById('overall-progress-circle');
      if (circle) {
        const circumference = 427.26;
        const offset = circumference - (overallPct / 100) * circumference;
        circle.style.strokeDashoffset = offset;
      }

      // Status Badge & Motivational Message (Section 6)
      const risk = BunkMath.getRisk(overallPct);
      if (badge) {
        badge.className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ';
        if (risk === 'safe') {
          badge.classList.add('badge-safe');
          badge.textContent = 'Safe Zone';
        } else if (risk === 'warning') {
          badge.classList.add('badge-warning');
          badge.textContent = 'Warning';
        } else {
          badge.classList.add('badge-danger');
          badge.textContent = 'Danger Zone';
        }
      }

      if (motivationalMsg) {
        if (overallPct >= 90) {
          motivationalMsg.textContent = "🔥 Outstanding! You're an attendance champion!";
          motivationalMsg.className = 'text-xs text-green-400 font-medium mt-4';
        } else if (overallPct >= 75) {
          motivationalMsg.textContent = "😎 Doing well! Keep it steady and stay above the line.";
          motivationalMsg.className = 'text-xs text-purple-300 font-medium mt-4';
        } else {
          motivationalMsg.textContent = "🚨 Danger zone! Attend every class to recover.";
          motivationalMsg.className = 'text-xs text-red-400 font-medium mt-4';
        }
      }
    },

    // Renders bunk advice based on selected target percentage
    renderBunkAdvice() {
      let totalAttended = 0;
      let totalConducted = 0;

      AppState.subjects.forEach(s => {
        totalAttended += s.attended;
        totalConducted += s.conducted;
      });

      const currentPct = BunkMath.getPercentage(totalAttended, totalConducted);
      const targetPct = AppState.currentTarget;
      const targetFraction = targetPct / 100;

      const headlineEl = document.getElementById('bunk-headline');
      const explanationEl = document.getElementById('bunk-explanation');
      const iconEl = document.getElementById('bunk-icon');
      const container = document.getElementById('bunk-result-container');

      if (!headlineEl || !explanationEl || !iconEl) return;

      if (currentPct >= targetPct) {
        const safeSkips = BunkMath.getSafeSkips(totalAttended, totalConducted, targetFraction);
        iconEl.textContent = '🎉';
        headlineEl.textContent = `You can safely skip ${safeSkips} class${safeSkips === 1 ? '' : 'es'}`;
        headlineEl.className = 'text-lg font-bold text-safeGreen';
        explanationEl.textContent = `At your current attendance rate (${currentPct.toFixed(1)}%), you can skip up to ${safeSkips} upcoming lecture${safeSkips === 1 ? '' : 's'} and still stay above your ${targetPct}% requirement.`;
        if (container) {
          container.className = 'p-5 rounded-2xl bg-green-500/10 border border-green-500/20 relative overflow-hidden';
        }
      } else {
        const requiredClasses = BunkMath.getRequiredClasses(totalAttended, totalConducted, targetFraction);
        iconEl.textContent = '⚠️';
        headlineEl.textContent = `You must attend the next ${requiredClasses} class${requiredClasses === 1 ? '' : 'es'} continuously`;
        headlineEl.className = 'text-lg font-bold text-warnAmber';
        explanationEl.textContent = `Your current attendance is ${currentPct.toFixed(1)}%. To reach your target threshold of ${targetPct}%, you cannot afford any absences for the next ${requiredClasses} consecutive lectures.`;
        if (container) {
          container.className = 'p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 relative overflow-hidden';
        }
      }
    },

    // Renders subjects table with sorting and selection
    renderSubjectsTable() {
      const tbody = document.getElementById('subjects-table-body');
      if (!tbody) return;

      // Copy and sort
      let sorted = [...AppState.subjects];
      switch (AppState.sortOrder) {
        case 'pct-desc':
          sorted.sort((a, b) => BunkMath.getPercentage(b.attended, b.conducted) - BunkMath.getPercentage(a.attended, a.conducted));
          break;
        case 'pct-asc':
          sorted.sort((a, b) => BunkMath.getPercentage(a.attended, a.conducted) - BunkMath.getPercentage(b.attended, b.conducted));
          break;
        case 'cond-desc':
          sorted.sort((a, b) => b.conducted - a.conducted);
          break;
        case 'name-asc':
          sorted.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case 'default':
        default:
          // Keep original parsed order
          break;
      }

      tbody.innerHTML = '';

      sorted.forEach((subj, idx) => {
        const pct = BunkMath.getPercentage(subj.attended, subj.conducted);
        const risk = BunkMath.getRisk(pct);
        const advice = BunkMath.getSubjectAdvice(subj.attended, subj.conducted);
        const isChecked = AppState.selectedCodes.has(subj.code);

        const badgeClass = risk === 'safe' ? 'badge-safe' : (risk === 'warning' ? 'badge-warning' : 'badge-danger');
        const badgeLabel = risk === 'safe' ? 'Safe' : (risk === 'warning' ? 'Warning' : 'Danger');

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-white/[0.03] transition-colors border-b border-white/5';
        tr.innerHTML = `
          <td class="p-3 text-center">
            <input type="checkbox" class="custom-checkbox subject-checkbox" data-code="${sanitize(subj.code)}" ${isChecked ? 'checked' : ''}>
          </td>
          <td class="p-3 text-slate-400 font-mono text-xs">${idx + 1}</td>
          <td class="p-3">
            <div class="font-semibold text-white">${sanitize(subj.name)}</div>
            <div class="text-[11px] font-mono text-purple-300">${sanitize(subj.code)}</div>
          </td>
          <td class="p-3 text-center font-semibold text-slate-100">${subj.attended}</td>
          <td class="p-3 text-center text-slate-300">${subj.conducted}</td>
          <td class="p-3 text-center">
            <span class="font-bold text-sm ${risk === 'safe' ? 'text-safeGreen' : (risk === 'warning' ? 'text-warnAmber' : 'text-dangerRed')}">
              ${pct.toFixed(1)}%
            </span>
          </td>
          <td class="p-3 text-center">
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${badgeClass}">
              ${badgeLabel}
            </span>
          </td>
          <td class="p-3 text-right">
            <span class="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 inline-block">
              ${sanitize(advice.text)}
            </span>
          </td>
        `;
        tbody.appendChild(tr);
      });

      // Update summary counter
      const summaryText = document.getElementById('table-summary-text');
      if (summaryText) {
        summaryText.textContent = `Showing ${sorted.length} subjects (${AppState.selectedCodes.size} selected)`;
      }

      // Attach row checkbox listeners
      document.querySelectorAll('.subject-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const code = e.target.getAttribute('data-code');
          if (e.target.checked) {
            AppState.selectedCodes.add(code);
          } else {
            AppState.selectedCodes.delete(code);
          }
          UIManager.updateSelectAllState();
        });
      });
    },

    updateSelectAllState() {
      const headerCb = document.getElementById('header-select-all');
      const toggleBtnText = document.getElementById('toggle-select-text');
      const summaryText = document.getElementById('table-summary-text');

      const allSelected = AppState.selectedCodes.size === AppState.subjects.length;
      if (headerCb) headerCb.checked = allSelected;
      if (toggleBtnText) toggleBtnText.textContent = allSelected ? 'Deselect All' : 'Select All';
      if (summaryText) {
        summaryText.textContent = `Showing ${AppState.subjects.length} subjects (${AppState.selectedCodes.size} selected)`;
      }
    },

    // Populate Student Header Banner & Profile Modal
    renderStudentDetails() {
      const s = AppState.student;
      if (!s) return;

      const nameEl = document.getElementById('banner-student-name');
      const yearBranchEl = document.getElementById('banner-year-branch');
      const cityEl = document.getElementById('banner-city');
      const rollEl = document.getElementById('banner-roll');
      const lastLoginEl = document.getElementById('banner-last-login');
      const demoPill = document.getElementById('banner-demo-pill');

      if (nameEl) nameEl.textContent = s.name.toUpperCase();
      if (yearBranchEl) yearBranchEl.remove();
      if (cityEl) cityEl.textContent = s.city;
      if (rollEl) rollEl.textContent = s.roll;
      if (lastLoginEl) lastLoginEl.textContent = AppState.lastLoginTime;

      if (demoPill) {
        if (AppState.student.demo) demoPill.classList.remove('hidden');
        else demoPill.classList.add('hidden');
      }

      // Profile Modal Fields
      const profName = document.getElementById('profile-name');
      const profInstitute = document.getElementById('profile-institute');
      const profRoll = document.getElementById('profile-roll');
      const profYear = document.getElementById('profile-year');
      const profBranch = document.getElementById('profile-branch');
      const profCity = document.getElementById('profile-city');

      if (profName) profName.textContent = s.name.toUpperCase();
      if (profInstitute) profInstitute.textContent = s.institute;
      if (profRoll) profRoll.textContent = s.roll;
      if (profYear) profYear.textContent = s.year;
      if (profBranch) profBranch.textContent = s.branch;
      if (profCity) profCity.textContent = s.city;
    },

    // Full Dashboard Re-render
    refreshDashboard() {
      this.updateGreeting();
      this.updateRandomQuote();
      this.renderStudentDetails();
      this.renderOverallCard();
      this.renderBunkAdvice();
      this.renderSubjectsTable();
      ChartEngine.renderSubjectComparison(AppState.subjects);
      ChartEngine.renderStatusDistribution(AppState.subjects);
    }
  };

  // =====================================================
  // 9. SCRAPER CLIENT & LOGIN CONTROLLER
  // =====================================================
  const ScraperClient = {
    loadingInterval: null,
    msgInterval: null,

    // Step-by-step simulated progress bar matching scraper phases
    startLoadingAnimation() {
      const screen = document.getElementById('loading-screen');
      const bar = document.getElementById('loading-bar-fill');
      const pctText = document.getElementById('loading-pct-text');
      const subtitle = document.getElementById('loading-subtitle');
      const rotatingEl = document.getElementById('loading-rotating-msg');

      const stepConnect = document.getElementById('step-connect');
      const stepAuth = document.getElementById('step-auth');
      const stepScrape = document.getElementById('step-scrape');

      if (screen) screen.classList.remove('hidden');

      let currentPct = 0;
      let msgIndex = 0;

      // Rotate friendly messages
      this.msgInterval = setInterval(() => {
        msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
        if (rotatingEl) rotatingEl.textContent = LOADING_MESSAGES[msgIndex];
      }, 1400);

      this.loadingInterval = setInterval(() => {
        if (currentPct < 92) {
          currentPct += Math.floor(Math.random() * 8) + 4;
          if (currentPct > 92) currentPct = 92;
        }

        if (bar) bar.style.width = `${currentPct}%`;
        if (pctText) pctText.textContent = `${currentPct}%`;

        // Update step status icons
        if (currentPct >= 20 && stepConnect) {
          stepConnect.className = 'flex items-center gap-3 text-safeGreen font-semibold';
          stepConnect.querySelector('.step-icon').textContent = '✓';
          if (subtitle) subtitle.textContent = 'Connecting to IMS Portal...';
        }
        if (currentPct >= 55 && stepAuth) {
          stepAuth.className = 'flex items-center gap-3 text-safeGreen font-semibold';
          stepAuth.querySelector('.step-icon').textContent = '✓';
          if (subtitle) subtitle.textContent = 'Authenticating student credentials...';
        }
        if (currentPct >= 85 && stepScrape) {
          stepScrape.className = 'flex items-center gap-3 text-safeGreen font-semibold';
          stepScrape.querySelector('.step-icon').textContent = '✓';
          if (subtitle) subtitle.textContent = 'Scraping subject records & percentages...';
        }
      }, 180);
    },

    finishLoadingAnimation(callback) {
      clearInterval(this.loadingInterval);
      clearInterval(this.msgInterval);

      const bar = document.getElementById('loading-bar-fill');
      const pctText = document.getElementById('loading-pct-text');
      if (bar) bar.style.width = '100%';
      if (pctText) pctText.textContent = '100%';

      setTimeout(() => {
        const screen = document.getElementById('loading-screen');
        if (screen) screen.classList.add('hidden');
        if (callback) callback();
      }, 400);
    },

    stopLoadingAnimation() {
      clearInterval(this.loadingInterval);
      clearInterval(this.msgInterval);
      const screen = document.getElementById('loading-screen');
      if (screen) screen.classList.add('hidden');
    },

    // Authenticate and scrape
    async login(username, password, isDemo = false) {
      this.startLoadingAnimation();
      const errorBox = document.getElementById('login-error-box');
      const errorText = document.getElementById('login-error-text');
      if (errorBox) errorBox.classList.add('hidden');

      try {
        const resp = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: username.trim(),
            password: password,
            demo: isDemo
          })
        });

        const data = await resp.json();

        if (!resp.ok || data.error) {
          this.stopLoadingAnimation();
          const err = data.error || 'Oops! Wrong credentials, try again 🙈';
          if (errorText) errorText.textContent = err;
          if (errorBox) errorBox.classList.remove('hidden');
          showToast(err, 'error');
          return;
        }

        // Successfully scraped!
        AppState.student = data.student;
        AppState.subjects = data.subjects || [];
        AppState.selectedCodes = new Set(AppState.subjects.map(s => s.code));
        AppState.lastLoginTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Save credentials if "remember" is checked
        const rememberCb = document.getElementById('checkbox-remember');
        if (rememberCb && rememberCb.checked && !isDemo) {
          await CryptoManager.saveCredentials(username, password);
        }

        this.finishLoadingAnimation(() => {
          // Switch view to dashboard
          document.getElementById('login-screen').classList.add('hidden');
          const dashboard = document.getElementById('dashboard-view');
          dashboard.classList.remove('hidden');
          dashboard.classList.add('animate-fade-in');
          window.scrollTo(0, 0);

          UIManager.refreshDashboard();
          showToast(`Welcome, ${data.student.name.split(' ')[0]}! ✨`);
        });

      } catch (err) {
        this.stopLoadingAnimation();
        const msg = 'Portal is taking a nap 😴, please retry in a moment.';
        if (errorText) errorText.textContent = msg;
        if (errorBox) errorBox.classList.remove('hidden');
        showToast(msg, 'error');
      }
    }
  };

  // =====================================================
  // 10. PWA INSTALL HANDLER
  // =====================================================
  const PWAInstaller = {
    init() {
      window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent default browser banner
        e.preventDefault();
        AppState.deferredPrompt = e;

        // Show our styled modal on first visit if not dismissed
        const dismissed = localStorage.getItem('attendix_pwa_dismissed');
        if (!dismissed) {
          const modal = document.getElementById('pwa-install-modal');
          if (modal) modal.classList.remove('hidden');
        }
      });

      const installBtn = document.getElementById('btn-pwa-install');
      if (installBtn) {
        installBtn.addEventListener('click', async () => {
          const modal = document.getElementById('pwa-install-modal');
          if (modal) modal.classList.add('hidden');

          if (AppState.deferredPrompt) {
            AppState.deferredPrompt.prompt();
            const { outcome } = await AppState.deferredPrompt.userChoice;
            if (outcome === 'accepted') {
              showToast('Thank you for installing Attendix! 🎉');
            }
            AppState.deferredPrompt = null;
          }
        });
      }

      const dismissBtn = document.getElementById('btn-pwa-dismiss');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
          const modal = document.getElementById('pwa-install-modal');
          if (modal) modal.classList.add('hidden');
          localStorage.setItem('attendix_pwa_dismissed', 'true');
        });
      }
    }
  };

  // =====================================================
  // 11. EVENT LISTENERS & INITIALIZATION
  // =====================================================
  function setupEventListeners() {
    // Password show/hide toggles
    const pwdInput = document.getElementById('input-password');
    const toggleBtn = document.getElementById('btn-toggle-pwd');
    const eyeIcon = document.getElementById('btn-eye-icon');

    function togglePasswordVisibility() {
      if (!pwdInput) return;
      if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        if (toggleBtn) toggleBtn.textContent = 'Hide';
      } else {
        pwdInput.type = 'password';
        if (toggleBtn) toggleBtn.textContent = 'Show';
      }
    }

    if (toggleBtn) toggleBtn.addEventListener('click', togglePasswordVisibility);
    if (eyeIcon) eyeIcon.addEventListener('click', togglePasswordVisibility);

    // Login Form Submission
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('input-roll').value;
        const password = document.getElementById('input-password').value;
        if (!username || !password) {
          showToast('Please enter both Register No. and Password', 'error');
          return;
        }
        ScraperClient.login(username, password, false);
      });
    }

    // Demo Mode Button
    const demoBtn = document.getElementById('btn-demo-mode');
    if (demoBtn) {
      demoBtn.addEventListener('click', () => {
        document.getElementById('input-roll').value = '24691A0551';
        document.getElementById('input-password').value = 'DEMO_BYPASS';
        ScraperClient.login('24691A0551', 'DEMO_BYPASS', true);
      });
    }

    // Target Selection Buttons (75%, 80%, 85%, 90%)
    document.querySelectorAll('.target-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.target-btn').forEach(b => {
          b.className = 'target-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-300 hover:text-white';
        });
        const targetVal = parseInt(e.currentTarget.getAttribute('data-target'), 10);
        AppState.currentTarget = targetVal;

        e.currentTarget.className = 'target-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all active bg-gradient-to-r from-brandPurple to-brandBlue text-white shadow-md';
        UIManager.renderBunkAdvice();
      });
    });

    // Select All / Deselect All Toggle in Table Header
    const headerCb = document.getElementById('header-select-all');
    if (headerCb) {
      headerCb.addEventListener('change', (e) => {
        const checked = e.target.checked;
        if (checked) {
          AppState.selectedCodes = new Set(AppState.subjects.map(s => s.code));
        } else {
          AppState.selectedCodes.clear();
        }
        UIManager.renderSubjectsTable();
        UIManager.updateSelectAllState();
      });
    }

    const toggleSelectBtn = document.getElementById('btn-toggle-select-all');
    if (toggleSelectBtn) {
      toggleSelectBtn.addEventListener('click', () => {
        if (AppState.selectedCodes.size === AppState.subjects.length) {
          AppState.selectedCodes.clear();
        } else {
          AppState.selectedCodes = new Set(AppState.subjects.map(s => s.code));
        }
        UIManager.renderSubjectsTable();
        UIManager.updateSelectAllState();
      });
    }

    // Sort Dropdown
    const sortSelect = document.getElementById('select-sort-order');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        AppState.sortOrder = e.target.value;
        UIManager.renderSubjectsTable();
      });
    }

    // PDF Export Buttons (Sidebar & Banner)
    const exportPDF = () => PDFExporter.exportReport();
    const pdfBtn1 = document.getElementById('sidebar-btn-pdf');
    const pdfBtn2 = document.getElementById('banner-btn-pdf');
    if (pdfBtn1) pdfBtn1.addEventListener('click', exportPDF);
    if (pdfBtn2) pdfBtn2.addEventListener('click', exportPDF);

    // Copy Text Summary Buttons (Sidebar & Banner)
    const copySummary = () => TextSummary.copy();
    const copyBtn1 = document.getElementById('sidebar-btn-copy');
    const copyBtn2 = document.getElementById('banner-btn-copy');
    if (copyBtn1) copyBtn1.addEventListener('click', copySummary);
    if (copyBtn2) copyBtn2.addEventListener('click', copySummary);

    // Refresh Buttons (Sidebar & Banner)
    const refreshAttendance = () => {
      const rollInput = document.getElementById('input-roll').value;
      const pwdInput = document.getElementById('input-password').value;
      if (AppState.student && AppState.student.demo) {
        ScraperClient.login('21691A0501', 'DEMO_BYPASS', true);
      } else if (rollInput && pwdInput) {
        ScraperClient.login(rollInput, pwdInput, false);
      } else {
        showToast('Refreshing attendance records...');
        UIManager.refreshDashboard();
      }
    };
    const refreshBtn1 = document.getElementById('sidebar-btn-refresh');
    const refreshBtn2 = document.getElementById('banner-btn-refresh');
    if (refreshBtn1) refreshBtn1.addEventListener('click', refreshAttendance);
    if (refreshBtn2) refreshBtn2.addEventListener('click', refreshAttendance);

    // Logout Buttons (Sidebar & Banner)
    const logout = async () => {
      AppState.student = null;
      AppState.subjects = [];
      AppState.selectedCodes.clear();

      // Offer clear "Forget Me" purge
      await CryptoManager.purgeCredentials();
      document.getElementById('input-password').value = '';
      const rememberCb = document.getElementById('checkbox-remember');
      if (rememberCb) rememberCb.checked = false;

      document.getElementById('dashboard-view').classList.add('hidden');
      document.getElementById('login-screen').classList.remove('hidden');
      showToast('Session logged out securely. Credentials forgotten.');
    };
    const logoutBtn1 = document.getElementById('sidebar-btn-logout');
    const logoutBtn2 = document.getElementById('banner-btn-logout');
    if (logoutBtn1) logoutBtn1.addEventListener('click', logout);
    if (logoutBtn2) logoutBtn2.addEventListener('click', logout);

    // Profile Modal Open / Close
    const profileModal = document.getElementById('modal-profile');
    const openProfile = (e) => {
      if (e) e.preventDefault();
      if (profileModal) profileModal.classList.remove('hidden');
    };
    const closeProfile = () => {
      if (profileModal) profileModal.classList.add('hidden');
    };

    const navProfile = document.getElementById('nav-btn-profile');
    const mobileTabProfile = document.getElementById('mobile-tab-profile');
    const closeBtn1 = document.getElementById('btn-close-profile');
    const closeBtn2 = document.getElementById('btn-modal-profile-close');

    if (navProfile) navProfile.addEventListener('click', openProfile);
    if (mobileTabProfile) mobileTabProfile.addEventListener('click', openProfile);
    if (closeBtn1) closeBtn1.addEventListener('click', closeProfile);
    if (closeBtn2) closeBtn2.addEventListener('click', closeProfile);

    // Mobile Bottom Tab navigation scroll
    document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget.getAttribute('data-target');
        if (target === 'profile') return; // Handled separately
        document.querySelectorAll('.mobile-tab-btn').forEach(b => {
          b.className = 'mobile-tab-btn flex flex-col items-center gap-1 text-slate-400 hover:text-white';
        });
        e.currentTarget.className = 'mobile-tab-btn flex flex-col items-center gap-1 text-purple-300 active';
      });
    });
  }

  // Auto-fill remembered credentials on boot
  async function loadRememberedCredentials() {
    const creds = await CryptoManager.loadCredentials();
    if (creds && creds.username && creds.password) {
      const rollInput = document.getElementById('input-roll');
      const pwdInput = document.getElementById('input-password');
      const rememberCb = document.getElementById('checkbox-remember');
      if (rollInput) rollInput.value = creds.username;
      if (pwdInput) pwdInput.value = creds.password;
      if (rememberCb) rememberCb.checked = true;
    }
  }

  // Register PWA Service Worker
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .then((reg) => {
            console.log('Attendix Service Worker registered with scope:', reg.scope);
          })
          .catch((err) => {
            console.warn('Service Worker registration failed:', err);
          });
      });
    }
  }

  // =====================================================
  // BOOTSTRAP APP
  // =====================================================
  document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadRememberedCredentials();
    PWAInstaller.init();
    registerServiceWorker();
  });

})();
