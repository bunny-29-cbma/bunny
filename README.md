# Attendix - Real-Time Student Attendance Tracker

A production-ready, dark glassmorphism attendance intelligence web application engineered for college IMS portals (specifically designed for MITS IMS - `http://mitsims.in`). Deployable as a serverless application on Vercel.

---

## 🌟 Key Highlights & Features

- **⚡ Real-Time Portal Scraping:** Directly authenticates against Advaya GEMS / MITS IMS portal (`http://mitsims.in`), extracting student records, subject codes, names, classes attended, and classes conducted.
- **🛡️ Zero-Knowledge Security:** Passwords are never stored on server or database. Opt-in "Remember credentials" uses device-side **Web Crypto API (AES-GCM 256-bit)** encryption.
- **🧮 Academic Predictive Bunk Calculator:** Dynamic target selector (75%, 80%, 85%, 90%) using precision formulas:
  - When attendance $\ge$ Target: $X = \lfloor \frac{\text{attended}}{T} - \text{conducted} \rfloor$ (Safe skips)
  - When attendance $<$ Target: $Y = \lceil \frac{T \cdot \text{conducted} - \text{attended}}{1 - T} \rceil$ (Consecutive classes required to recover)
- **📊 Interactive Analytics:** Color-coded Chart.js bar chart for subject comparison and doughnut chart for risk distribution.
- **📄 Vector PDF Export:** Generates official vector-quality PDF reports using `jsPDF` and `jspdf-autotable` with student header, roll number, timestamps, and risk-badged subject tables.
- **📋 One-Click Text Summary:** Copies clean, formatted text summaries of selected subjects to clipboard.
- **📱 PWA & Offline Support:** Installable as a native PWA on Android, iOS, Windows, and macOS with service worker caching.
- **🎨 Glassmorphism Dark UI:** Ultra-modern dark theme (`#0f0a1e`) with ambient animated glow, custom gradients (purple, electric blue, pink), and responsive layout down to 360px.
- **✨ Demo Mode:** One-tap demo account preview with realistic data for Chowdegari Banni (III Year CSE A, Anantapur).

---

## 📂 Project Structure

```
attendix/
├── api/
│   └── index.py            # Flask app & live scraper engine (Vercel serverless entrypoint)
├── static/
│   ├── css/
│   │   └── style.css       # Dark glassmorphism, animations, circular progress ring
│   ├── js/
│   │   ├── app.js          # Client UI logic, bunk math, Chart.js, jsPDF, Web Crypto
│   │   └── sw.js           # PWA service worker with static asset caching
│   ├── logo.png            # Attendix brand logo
│   └── icons/
│       ├── icon-192.png    # 192x192 PWA maskable icon
│       └── icon-512.png    # 512x512 PWA maskable icon
├── templates/
│   └── index.html          # SPA markup with Tailwind CSS CDN, Chart.js, jsPDF
├── manifest.json           # Web app manifest for standalone PWA
├── requirements.txt        # Python dependencies (flask, requests, beautifulsoup4, lxml)
├── vercel.json             # Vercel serverless function & routing configuration
├── .gitignore              # Ignores .env, venv/, __pycache__/, .vercel/
├── .env.example            # Environment variables template
└── README.md               # Documentation & deployment guide
```

---

## 🚀 Local Development Setup

### 1. Prerequisites
- Python 3.9+ installed on your system
- Git

### 2. Clone and Setup Environment
```bash
# Clone the repository
git clone https://github.com/your-username/attendix.git
cd attendix

# Create a Python virtual environment
python -m venv venv

# Activate virtual environment
# On Windows PowerShell:
.\venv\Scripts\Activate.ps1
# On Linux / macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure Environment Variables
Copy the template configuration:
```bash
# Windows
copy .env.example .env

# Linux / macOS
cp .env.example .env
```

Default values in `.env`:
```env
IMS_BASE_URL=http://mitsims.in
DEMO_MODE=false
SECRET_KEY=your-custom-secret-key
```

### 4. Run Locally
```bash
# Option A: Run directly with Python
python api/index.py

# Option B: Run via Flask CLI
flask --app api/index.py run --port 5000 --debug
```

Open your browser at `http://127.0.0.1:5000` to access the application.

---

## ☁️ Deployment on Vercel

Attendix is pre-configured for seamless deployment on Vercel as a Python serverless application.

### Method 1: Deploy via Vercel GitHub Integration (Recommended)
1. Push your repository to GitHub.
2. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
3. Import your GitHub repository.
4. In the **Environment Variables** section, configure:
   - `IMS_BASE_URL`: `http://mitsims.in`
   - `DEMO_MODE`: `false` (or `true` if you want public demo access without student credentials)
5. Click **Deploy**. Vercel will automatically build the serverless functions in `api/index.py` and serve static assets according to `vercel.json`.

### Method 2: Deploy via Vercel CLI
```bash
# Install Vercel CLI globally
npm i -g vercel

# Login to your Vercel account
vercel login

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

---

## 🔒 Security Best Practices

1. **Zero Database Credential Storage:** The server acts purely as a real-time proxy to the official portal. Credentials are never written to disk, database, or server logs.
2. **Device-Level Cryptography:** "Remember credentials" encrypts the password using a locally-generated AES-GCM 256-bit key inside IndexedDB. Plaintext passwords never enter `localStorage`.
3. **Sliding-Window Rate Limiting:** Enforces strict per-IP rate limits on `/api/attendance` to prevent brute-forcing.
4. **XSS Sanitization:** All scraped subject names, codes, and student profile details are HTML-escaped before insertion into the DOM.
5. **Hardened Headers:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection: 1; mode=block`, and explicit `no-cache` on API responses.

---

## 📜 License
MIT License. Crafted with precision for college students.
