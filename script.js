class App {
    constructor() {
        this.audioCtx = null;
        this.currentStatsTab = 'daily';
        this.bgAudio = null;
        this.notifInterval = null;
        this.reminderInterval = null;
        this.currentUser = "";
        this.currentJournalId = null;
        this._boundBgDragMove = null;
        this._boundBgDragEnd = null;
        // --- TAMBAHKAN 4 VARIABEL INI ---
    this.bgX = 0;
    this.bgY = 0;
    this.lastX = 0;
    this.lastY = 0;
        const d = new Date();
        this.currentJournalDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

        this.defaultState = {
            mode: 'focus', timeLeft: 25*60, isRunning: false, intervalId: null, endTime: null,
            currentTaskId: null, sessionCount: 0, totalFocusMinutes: 0,
            dailyLog: {}, tasks: [], habits: [], journal: {}, statusMsg: "Status...",
            timerStyle: "ring", mediaSrc: "", mediaType: "img",
            bannerShape: "round",
            musicFocusUrl: "", musicBreakUrl: "", customBg: "", bgPos: "center center", bgDragMode: false,
            customPrimaryColor: "#ff8e8e", customBgColor: "#faf9f6", cardOpacity: 0.9
        };
        this.defaultSettings = { focus: 25, short: 5, long: 15, autoBreak: false, darkMode: false };
        
        this.init();
    }

        init() {
        try {
            // 1. LOAD DATA (PENTING! Harus dipanggil di awal biar nggak reset timer)
            this.loadData();
            
            // 2. RENDER UI & VISUALS (Termasukin `renderDataOnLoad` di dalam loadData nanti)
            this.renderSettings();
            this.setupJournal();
            this.setupCanvas();
            this.setupHabits();
            this.renderTasks();
            this.renderHabits();
            this.updateUI();
            this.renderTaskPomodoros();

            // 3. TIMER RESUME LOGIC (ANTI RESET SAAT REFRESH)
            // Cek apakah ada timer yang lagi jalan dari data tersimpan?
            if (this.state.isRunning && this.state.endTime) {
                const now = Date.now();
                const diff = this.state.endTime - now;
                if (diff > 0) { 
                    // Lanjutkan timer dari titik terakhir
                    this.state.timeLeft = Math.ceil(diff / 1000); 
                    this.startTimer(true); 
                } else { 
                    // Waktu habis? Selesaikan sesi
                    this.completeSession(); 
                }
            } else { 
                // Kalau timer mati, tampilkan waktu default
                this.updateTimerDisplay(); 
            }

            // 4. RENDER VISUALS
            this.applyVisuals();
            
            // 5. BACKGROUND & MEDIA (Termasukin logic `applyDataOnLoad` nanti)
            if (this.state.customBg) document.body.style.backgroundImage = `url(${this.state.customBg})`;
            if (this.state.bgPos) document.body.style.backgroundPosition = this.state.bgPos;
            if (this.state.mediaSrc) {
                const box = document.getElementById('mediaBox');
                if(box) {
                    box.style.display = 'flex';
                    box.innerHTML = (this.state.mediaType === 'video') ? `<video src="${this.state.mediaSrc}" loop muted autoplay></video>` : `<img src="${this.state.mediaSrc}">`;
                }
            }
        } catch (e) { console.error("Init failed", e); }
    }

    

        loadData() {
        try {
            const keyPrefix = `fc_${this.currentUser}_`;
            
            // 1. AMBIL DARI STORAGE
            let s = localStorage.getItem(keyPrefix + 'StateV30') || localStorage.getItem('fcStateV30');
            const set = localStorage.getItem(keyPrefix + 'SettingsV30');
            
            if (!s) s = sessionStorage.getItem('fcStateV30_Backup');

            if (s) { 
                const parsed = JSON.parse(s);
                
                // 2. SIMPAN DATA GLOBAL DULU DULU
                this.state = {...this.defaultState, ...parsed, habits: (parsed.habits || [])};
                
                // 3. TAMBAHKAN INI: RESTORE TIMER GLOBAL (PENTING!)
                // JANGAN dibiarkan defaultState menimpa data timer tersimpan.
                if (parsed.isRunning !== undefined) this.state.isRunning = parsed.isRunning;
                if (parsed.timeLeft !== undefined) this.state.timeLeft = parsed.timeLeft;
                if (parsed.mode !== undefined) this.state.mode = parsed.mode;
                if (parsed.endTime !== undefined) this.state.endTime = parsed.endTime;
                // ----------------------------------------

                // 4. HANDLE TIMER DALAM TASK (PRIORITAS TINGGI)
                if (this.state.currentTaskId) {
                    const activeTask = this.state.tasks.find(t => t.id === this.state.currentTaskId);
                    if (activeTask && activeTask.timer) {
                        // Kalau task punya timer yang jalan, prioritaskan timer task di atas global timer
                        this.state.isRunning = activeTask.timer.isRunning;
                        this.state.timeLeft = activeTask.timer.timeLeft;
                        this.state.endTime = activeTask.timer.endTime;
                        this.state.mode = activeTask.timer.mode;
                    }
                }
            } else { 
                this.state = {...this.defaultState}; 
            }

            if(set) { this.settings = {...this.defaultSettings, ...JSON.parse(set)}; }
            else { this.settings = {...this.defaultSettings}; }
        } catch (e) { 
            this.state = {...this.defaultState}; 
            this.settings = {...this.defaultSettings}; 
        }
    }

    saveData() {
    if (!('localStorage' in window)) return;
    try {
        const keyPrefix = `fc_${this.currentUser}_`;
        // Simpen seluruh yang ada (Tasks + Habits + Jurnal + dll), karena kita mau gak ada kehilang!
        localStorage.setItem(keyPrefix + 'StateV30', JSON.stringify(this.state));
        
        // SIMPAN: Simpen Setting Custom (Focus, Short, Long) secara eksplisit (biar nggak terselip pakai object besar)
        localStorage.setItem(keyPrefix + 'SettingsV30', JSON.stringify(this.settings));
        
        // SIMPAN: Simpen status (StatusMsg)
        localStorage.setItem(`fc_statusMsg_${this.currentUser}`, this.state.statusMsg); // Status terpisah dari Task ditaruh di script lama (kalau ada)
        
        sessionStorage.setItem('fcStateV30_Backup', JSON.stringify(this.state)); // Biar aman kalau LocalStorage error.

    } catch (e) { console.error("Save failed", e); }
    }

    clearData() { if(confirm("Reset all data?")) { localStorage.clear(); sessionStorage.clear(); location.reload(); } }

    // --- AUDIO & VIBRATE ---
    playBeep(type = 'click') {
        try {
            if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.connect(gain); gain.connect(this.audioCtx.destination);
            const now = this.audioCtx.currentTime;
            if (type === 'alarm') {
                osc.type = 'sine'; osc.frequency.setValueAtTime(523.25, now); osc.frequency.setValueAtTime(659.25, now + 0.1);
                gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
                osc.start(now); osc.stop(now + 0.6);
            } else {
                osc.type = 'triangle'; osc.frequency.setValueAtTime(800, now);
                gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now); osc.stop(now + 0.1);
            }
        } catch (e) { }
    }
    vibrate(pattern) { if ("vibrate" in navigator) navigator.vibrate(pattern); }

    // --- VISUALS ---
    applyVisuals() {
        const root = document.documentElement;
        root.style.setProperty('--primary', this.state.customPrimaryColor);
        root.style.setProperty('--bg', this.state.customBgColor);
        
        // FIX BACKGROUND: Terapkan warna background langsung ke body
        let finalBg = this.state.customBgColor || '#faf9f6';
        if (this.settings.darkMode) {
            finalBg = '#222'; // Dark mode override
        }
        document.body.style.backgroundColor = finalBg;

        const banner = document.getElementById('taskBanner');
        if(banner) {
            banner.classList.remove('round', 'square', 'none');
            banner.classList.add(this.state.bannerShape);
        }
        const rgb = this.settings.darkMode ? '50, 50, 50' : '255, 255, 255';
        document.documentElement.style.setProperty('--card-bg', `rgba(${rgb}, ${this.state.cardOpacity})`);
        const wrapper = document.getElementById('timerWrapper'); const svg = document.querySelector('.timer-svg');
        if(wrapper && svg) {
            if(this.state.timerStyle === 'simple') { wrapper.classList.add('no-ring'); svg.style.display = 'none'; }
            else { wrapper.classList.remove('no-ring'); svg.style.display = 'block'; }
        }
    }

    // --- BACKGROUND DRAG (FIXED ANTI-BLOCK) ---
    toggleBgDrag(input) {
        this.state.bgDragMode = input.checked; this.saveData();
        const options = { passive: false };
        if (this._boundBgDragMove) { 
            document.body.removeEventListener('mousemove', this._boundBgDragMove); 
            document.body.removeEventListener('touchmove', this._boundBgDragMove, options); 
            this._boundBgDragMove = null; 
        }
        if (this._boundBgDragEnd) { 
            document.body.removeEventListener('mouseup', this._boundBgDragEnd); 
            document.body.removeEventListener('touchend', this._boundBgDragEnd); 
            this._boundBgDragEnd = null; 
        }
        if (this.state.bgDragMode) {
            // FIX: JANGAN pakai class .dragging (biar UI tidak mati).
            // Pakai style langsung userSelect none.
            document.body.style.userSelect = 'none';
            document.body.style.touchAction = 'none';
            document.body.style.cursor = 'move';

            this._boundBgDragMove = (e) => this.bgDragMove(e);
            this._boundBgDragEnd = () => this.bgDragEnd();
            
            document.body.addEventListener('mousemove', this._boundBgDragMove);
            document.body.addEventListener('touchmove', this._boundBgDragMove, options);
            document.body.addEventListener('mouseup', this._boundBgDragEnd);
            document.body.addEventListener('touchend', this._boundBgDragEnd);
            
            this.showToast("Drag Mode ON", "success");
        } else {
            document.body.style.userSelect = '';
            document.body.style.touchAction = 'manipulation';
            document.body.style.cursor = '';
            this.showToast("Drag Mode OFF", "success");
        }
    }
    bgDragMove(e) {
    if(!this.state.bgDragMode) return;
    
    if(e.type === 'touchmove') e.preventDefault();
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // --- UI EXCLUSION LOGIC (ANTI GESER SEMBARANGAN) ---
    // Cek: Apa yang lagi dipegang mouse/touch kamu?
    const target = e.target;
    
    if (
        target.closest('button') ||      // Jangan geser kalau nyentuh tombol
        target.closest('.nav-item') ||  // Jangan geser kalau nyentuh nav bawah
        target.closest('input') ||      // Jangan geser kalau nyentuh input (termasuk checkbox matiin fitur!)
        target.closest('select') ||     // Jangan geser kalau nyentuh dropdown
        target.closest('textarea') ||   // Jangan geser kalau lagi nulis jurnal
        target.closest('.card') ||      // Jangan geser kalau nyentuh kartu (Stats/Journal)
        target.closest('.timer-controls') // Jangan geser kalau nyentuh tombol play/pause
    ) {
        // KALAU NYENTUH HAL-HAL DI ATAS -> STOP. JANGAN DRAG!
        return; 
    }
    // -------------------------------------------------------

    // Cek pertama kali mouse bergerak (Reset posisi awal)
    if (this.lastX === 0) { 
        this.lastX = clientX; 
        this.lastY = clientY; 
        return; 
    }

    const deltaX = clientX - this.lastX;
    const deltaY = clientY - this.lastY;

    // Kecepatan (Bisa kamu ubah kalau mau pelan banget)
    const speed = 0.5; 

    this.bgX += deltaX * speed;
    this.bgY += deltaY * speed;

    document.body.style.backgroundPosition = `${this.bgX}px ${this.bgY}px`;

    this.lastX = clientX;
    this.lastY = clientY;
}
// --- TAMBAHKAN FUNGSI INI ---
bgDragEnd() {
    if(!this.state.bgDragMode) return;
    
    // Simpen posisi terakhir ke localStorage
    this.saveData();
    
    // Reset posisi mouse biar pas mau drag lagi nggak lompat
    this.lastX = 0;
    this.lastY = 0;
}
// --------------------

    // --- TIMER ---
    setMode(mode, save = true) {
    if(this.state.isRunning && !confirm("Stop timer?")) return;
    this.state.mode = mode;
    // Baris bawah ini ngitung waktu berdasarkan setting BARU
    this.state.timeLeft = (mode === 'focus' ? this.settings.focus : (mode==='short'?this.settings.short:this.settings.long)) * 60;
    
    this.state.isRunning = false; clearInterval(this.state.intervalId);
    this.stopMusic(); clearInterval(this.notifInterval);
    this.updateUI(); if(save) this.saveData();

    // --- TAMBAHKAN INI (PENTING!) ---
    // Paksa Task yang sedang aktif juga ngupdate settingan waktunya biar gak 'sok tahu'
    if (this.state.currentTaskId) {
        const activeTask = this.state.tasks.find(t => t.id === this.state.currentTaskId);
        if (activeTask) {
            // Update timer yang ada di dalam object task tsb
            activeTask.timer = {
                mode: this.state.mode,
                timeLeft: this.state.timeLeft,
                isRunning: false,
                endTime: null
            };
            // Simpen ulang biar perubahannya masuk memory
            this.saveData(); 
        }
    }
    // --- SELESAI TAMBAHAN ---
}
    toggleTimer() { this.playBeep('click'); if(this.state.isRunning) this.pauseTimer(); else this.startTimer(); }
    startTimer(resume=false) {
        this.state.isRunning = true;
        if(!resume) this.state.endTime = Date.now() + (this.state.timeLeft*1000);
        this.playBackgroundMusic();
        this.state.intervalId = setInterval(() => {
            const now = Date.now(); const diff = this.state.endTime - now;
            if (diff <= 0) { this.completeSession(); }
            else { this.state.timeLeft = Math.ceil(diff / 1000); this.updateTimerDisplay(); }
        }, 100);
        this.updateUI(); this.saveData();
    }
    pauseTimer() {
        this.state.isRunning = false; clearInterval(this.state.intervalId);
        this.stopMusic(); clearInterval(this.notifInterval);
        this.updateUI(); this.saveData();
    }
    resetTimer() { this.pauseTimer(); this.setMode(this.state.mode); }
    skipTimer() { this.pauseTimer(); this.state.timeLeft=0; this.completeSession(); }
    completeSession() {
    this.pauseTimer(); this.vibrate([200, 100, 200]); this.playBeep('alarm');
    const wasFocus = this.state.mode === 'focus';
    
    if(wasFocus) {
        // PERBAIKAN: Tambah + 1 biar tau Sesi Berikutnya
        if ((this.state.sessionCount + 1) % 2 === 0) {
            // Sesi Genap (2, 4, 6...) -> Long Break
            this.setMode('long'); 
            this.showToast("Yeay! Istirahat Panjang (Sesi Genap) 🛌", "success");
        } else {
            // Sesi Ganjil (1, 3, 5...) -> Short Break
            this.setMode('short');
            this.showToast("Istirahat Pendek (Sesi Ganjil) ☕", "success");
        }
        
        if(this.settings.autoBreak) this.startTimer();
    } else {
        // --- Bagian 'Else' (Balik ke Fokus) ---
        this.showToast("Istirahat Selesai! Kembali Kerja 💪", "success");
        const today = new Date().toISOString().split('T')[0];
        if(!this.state.dailyLog[today]) this.state.dailyLog[today] = {count:0, minutes:0, tasksDone:[], hourly: {}};
        const m = this.settings.focus; this.state.sessionCount++; this.state.totalFocusMinutes += m;
        this.state.dailyLog[today].count++; this.state.dailyLog[today].minutes += m;
        const currentHour = new Date().getHours();
        if(!this.state.dailyLog[today].hourly[currentHour]) this.state.dailyLog[today].hourly[currentHour] = 0;
        this.state.dailyLog[today].hourly[currentHour] += m;
        if(this.state.currentTaskId) {
            const t = this.state.tasks.find(x=>x.id===this.state.currentTaskId);
            if(t) { t.pomodoros++; if(!this.state.dailyLog[today].tasksDone.includes(t.title)) this.state.dailyLog[today].tasksDone.push(t.title); this.renderTasks(); }
            // --- Tambahin ini supaya titik langsung update ---
            this.renderTaskPomodoros();
        }
        this.setMode('focus'); if(this.settings.autoBreak) this.startTimer();
        this.saveData(); this.updateStats();
    }
}

    // --- MEDIA ---
    handleMediaUpload(input) {
        const file = input.files[0];
        if(file) {
            if(file.size > 1024 * 1024 * 2) { alert("File terlalu besar! < 2MB."); return; }
            const r = new FileReader(); r.onload = e => {
                this.state.mediaSrc = e.target.result; this.state.mediaType = file.type.startsWith('video') ? 'video' : 'img';
                const box = document.getElementById('mediaBox'); box.style.display = 'flex';
                box.innerHTML = (this.state.mediaType === 'video') ? `<video src="${this.state.mediaSrc}" loop muted autoplay></video>` : `<img src="${this.state.mediaSrc}">`;
                this.saveData();
            }; r.readAsDataURL(file);
        }
    }
    handleMusicUpload(type, input) {
        const file = input.files[0]; if(file) {
            if(file.size > 1024 * 1024 * 1) { alert("File besar! Pakai URL."); return; }
            const r = new FileReader(); r.onload = e => {
                const src = e.target.result;
                if(type === 'focus') this.state.musicFocusUrl = src; else this.state.musicBreakUrl = src;
                this.saveData();
            }; r.readAsDataURL(file);
        }
    }
    clearMusic(type) {
        if(confirm("Hapus musik ini?")) {
            if(type === 'focus') { this.state.musicFocusUrl = ""; document.getElementById('musicFocusUrl').value = ""; }
            else { this.state.musicBreakUrl = ""; document.getElementById('musicBreakUrl').value = ""; }
            this.saveData();
        }
    }
    handleBgUpload(input) {
        const file = input.files[0]; if(file) {
            if(file.size > 1024 * 1024 * 2) { alert("File besar!"); return; }
            const r = new FileReader(); r.onload = e => {
                this.state.customBg = e.target.result; document.body.style.backgroundImage = `url(${this.state.customBg})`;
                this.state.bgPos = "center center"; document.body.style.backgroundPosition = this.state.bgPos;
                this.saveData();
            }; r.readAsDataURL(file);
        }
    }
    clearTimerMedia() {
        if(confirm("Hapus media?")) {
            this.state.mediaSrc = ""; this.state.mediaType = "img";
            const box = document.getElementById('mediaBox'); box.style.display = 'none'; box.innerHTML = '<div class="media-placeholder">No Media<br>(Upload in Settings)</div>';
            this.saveData();
        }
    }
    clearBg() {
        if(confirm("Hapus BG?")) {
            this.state.customBg = ""; document.body.style.backgroundImage = "none"; document.body.style.backgroundPosition = "center center"; this.state.bgPos = "center center"; this.saveData();
        }
    }
    playBackgroundMusic() {
    this.stopMusic(); let src = '';
    if (this.state.mode === 'focus') src = this.state.musicFocusUrl; else src = this.state.musicBreakUrl;
    if (!src) return; 
    this.bgAudio = new Audio(src); 
    this.bgAudio.loop = true; 
    this.bgAudio.volume = 0.5; 
    this.bgAudio.play().catch(e => console.log("Audio blocked", e));
}
stopMusic() { if (this.bgAudio) { this.bgAudio.pause(); this.bgAudio = null; } }

    // --- TASKS ---
    addTask() {
    const title = document.getElementById('newTaskInput').value.trim();
    if(!title) return;
    
    // --- DAFTAR WARNA PASTEL ---
    const colors = ['#ff8e8e', '#8ecfff', '#8effa3', '#fff58e', '#e28eff', '#ffb347', '#80dfff'];
    
    // --- LOGIKA ANTI SAMA ---
    let randomColor;
    
    // Cek: Apakah sudah ada task sebelumnya?
    if (this.state.tasks.length > 0) {
        const lastTask = this.state.tasks[0]; // Ambil task paling atas
        let attempt = 0;
        do {
            // Pilih warna random
            randomColor = colors[Math.floor(Math.random() * colors.length)];
            attempt++;
            // Kalau warna SAMA dengan task terakhir DAN kita belum coba terlalu banyak, ulangi lagi
        } while (randomColor === lastTask.color && attempt < 10);
    } else {
        // Kalau ini task pertama, bebas pilih
        randomColor = colors[Math.floor(Math.random() * colors.length)];
    }
    // -------------------------

    this.state.tasks.unshift({ 
        id: Date.now(), 
        title, 
        estimate: parseInt(document.getElementById('newTaskEst').value) || 1, 
        pomodoros: 0, 
        completed: false, 
        timer: { mode: 'focus', timeLeft: this.settings.focus * 60, isRunning: false, endTime: null },
        color: randomColor 
    });
    
    document.getElementById('newTaskInput').value = ''; 
    this.saveData(); 
    this.renderTasks();
}
    selectTask(id) {
        if (this.state.currentTaskId) {
            const oldTask = this.state.tasks.find(t => t.id === this.state.currentTaskId);
            if (oldTask) { oldTask.timer = { mode: this.state.mode, timeLeft: this.state.timeLeft, isRunning: this.state.isRunning, endTime: this.state.endTime }; this.pauseTimer(); }
        }
        this.state.currentTaskId = (this.state.currentTaskId === id) ? null : id;
        const newTask = this.state.tasks.find(t => t.id === this.state.currentTaskId);
        if (newTask) {
            if (!newTask.timer) { newTask.timer = { mode: 'focus', timeLeft: this.settings.focus * 60, isRunning: false, endTime: null }; }
            this.state.mode = newTask.timer.mode; this.state.timeLeft = newTask.timer.timeLeft; this.state.isRunning = newTask.timer.isRunning; this.state.endTime = newTask.timer.endTime;
            if (this.state.isRunning) { this.startTimer(true); } else { this.pauseTimer(); }
        } else { this.pauseTimer(); }
        this.saveData(); this.renderTasks(); this.updateUI();
        this.renderTaskPomodoros();
    }
    deleteTask(e, id) {
        e.stopPropagation(); if(confirm("Delete?")) {
            if(this.state.currentTaskId === id) { this.state.currentTaskId = null; this.setMode('focus'); }
            this.state.tasks = this.state.tasks.filter(t=>t.id!==id); this.saveData(); this.renderTasks(); this.updateUI();
        }
    }
    /* =========================================
   UPDATE FUNGSI renderTasks() - WITH ICONS & PROGRESS BAR
   ========================================= */
renderTasks() {
    const l = document.getElementById('taskList');
    if(!l) return;
    l.innerHTML = '';
    
    this.state.tasks.forEach(t => {
        const isDone = t.pomodoros >= t.estimate && t.estimate > 0;
        const isActive = this.state.currentTaskId === t.id;
        
        const li = document.createElement('li');
        
        li.className = `task-item ${isActive ? 'active-task' : ''} ${isDone ? 'completed-task' : ''}`;
        
        // --- WARNA BORDER (SIDE KIRI) ---
        const taskColor = t.color || '#ff8e8e';
        li.style.borderLeft = `6px solid ${taskColor}`;

        // --- PENANDA ACTIVE (DIPENCET) ---
        if (isActive) {
            li.style.borderLeftWidth = '12px'; 
            li.style.boxShadow = `0 4px 10px ${taskColor}40`; 
        } else {
            li.style.borderLeftWidth = '6px'; 
            li.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)';
        }
        // -------------------------------

        li.onclick = () => this.selectTask(t.id);
        
        li.innerHTML = `
            <div class="task-left-content">
                <div class="task-info">
                    <span class="task-title">${t.title}</span>
                    <span class="task-meta">
                        <!-- IKON JAM DIHAPUS CUMA TINGGAL ANGKA -->
                        ${isDone ? '✅ DONE' : ''} ${t.pomodoros}/${t.estimate}
                    </span>
                    
                    <!-- GARIS PROGRESS BAR DIHAPUS DISINI -->
                </div>
            </div>

            <div class="task-actions">
                <button onclick="window.app.deleteTask(event,${t.id})" class="btn-delete">×</button>
            </div>
        `;
        
        l.appendChild(li);
    });
}
    renderTaskPomodoros() {
    const container = document.getElementById('taskPomodoros');
    if(!container) return;
    // Cari task yang sedang aktif
    const task = this.state.tasks.find(t => t.id === this.state.currentTaskId);

    // Kalau gak ada task, kosongkan titiknya
    if (!task) {
        container.innerHTML = ''; 
        return;
    }

    const total = task.estimate;
    const done = task.pomodoros;
    let html = '';

    // Looping bikin titik
    for (let i = 0; i < total; i++) {
        // Cek: Kalau angka loop (i+1) kurang dari/sebanding yang sudah lewat -> Isi
        const isFilled = (i + 1) <= done;
        
        html += `<div class="dot-item ${isFilled ? 'filled' : ''}"></div>`;
    }
    
    container.innerHTML = html;
}

    // --- JOURNAL ---
    setupJournal() {
        const dateInput = document.getElementById('journalDateInput');
        if(!dateInput) return;
        dateInput.value = this.currentJournalDate;
        dateInput.addEventListener('change', () => this.loadJournalDate(dateInput.value));
        this.loadJournalDate(dateInput.value);
    }
        loadJournalDate(dateStr) {
        if(!dateStr) return;
        this.currentJournalDate = dateStr;
        this.renderJournalEntries();
        this.startNewJournalEntry(); 
    }
    startNewJournalEntry() {
        this.currentJournalId = null;
        if(document.getElementById('journalTitleInput')) { document.getElementById('journalTitleInput').value = ''; document.getElementById('journalTitleInput').placeholder = "Entry Title (e.g. Pagi)"; }
        if(document.getElementById('journalText')) document.getElementById('journalText').innerHTML = '';
        document.querySelectorAll('.journal-entry-card').forEach(e => e.classList.remove('active'));
        document.getElementById('btnSaveJournal').innerText = "Create Entry";
        document.getElementById('btnSaveJournal').style.background = "var(--primary)";
        document.getElementById('btnDeleteJournal').style.display = "none";
    }
    saveJournal() {
        const dateInput = document.getElementById('journalDateInput'); const journalText = document.getElementById('journalText'); const journalTitle = document.getElementById('journalTitleInput');
        if(!dateInput || !journalText || !journalTitle) return alert("Lengkapi data!");
        const dateStr = dateInput.value; const title = journalTitle.value.trim(); const content = journalText.innerHTML;
        if (!title) return alert("Judul wajib!");
        if (!this.state.journal[dateStr]) this.state.journal[dateStr] = [];
        if (this.currentJournalId) {
            const entry = this.state.journal[dateStr].find(e => e.id === this.currentJournalId);
            if(entry) { entry.title = title; entry.content = content; entry.timestamp = Date.now(); this.showToast("Updated!", "success"); }
        } else {
            const newId = Date.now(); this.state.journal[dateStr].unshift({ id: newId, title, content, timestamp: Date.now() }); this.showToast("New Entry!", "success");
        }
        this.saveData(); this.renderJournalEntries();
    }
    deleteCurrentJournal() {
        if(!this.currentJournalId) return;
        if(confirm("Hapus jurnal ini?")) {
            this.state.journal[this.currentJournalDate] = this.state.journal[this.currentJournalDate].filter(e => e.id !== this.currentJournalId);
            this.saveData(); this.showToast("Deleted", "error"); this.startNewJournalEntry();
        }
    }
    renderJournalEntries() {
        const list = document.getElementById('journalListHorizontal'); if(!list) return;
        list.innerHTML = '';
        const entries = (this.state.journal[this.currentJournalDate] && Array.isArray(this.state.journal[this.currentJournalDate])) ? this.state.journal[this.currentJournalDate] : [];
        if(entries.length === 0) { list.innerHTML = '<span style="color:var(--text-light); font-size:0.8rem; padding:10px;">No entries yet.</span>'; return; }
        entries.forEach(e => {
            const div = document.createElement('div');
            div.className = `journal-entry-card ${this.currentJournalId === e.id ? 'active' : ''}`;
            div.innerText = e.title || "Untitled";
            div.onclick = () => {
                this.currentJournalId = e.id;
                if(document.getElementById('journalText')) document.getElementById('journalText').innerHTML = e.content;
                if(document.getElementById('journalTitleInput')) { document.getElementById('journalTitleInput').value = e.title; document.getElementById('journalTitleInput').placeholder = `Editing: ${e.title}`; }
                document.getElementById('btnSaveJournal').innerText = "Save Changes";
                document.getElementById('btnSaveJournal').style.background = "#2ecc71";
                document.getElementById('btnDeleteJournal').style.display = "block";
                document.querySelectorAll('.journal-entry-card').forEach(el => el.classList.remove('active'));
                div.classList.add('active');
            };
            list.appendChild(div);
        });
    }
    toggleJournalManage() { document.getElementById('journalManageMenu').classList.toggle('show'); }
    sortJournal(order) {
        const dateStr = this.currentJournalDate;
        if (!this.state.journal[dateStr]) return;
        if (order === 'newest') { this.state.journal[dateStr].sort((a,b) => b.timestamp - a.timestamp); }
        else { this.state.journal[dateStr].sort((a,b) => a.timestamp - b.timestamp); }
        this.saveData(); this.renderJournalEntries(); this.toggleJournalManage();
    }
    clearAllJournal() {
        const dateStr = this.currentJournalDate;
        if(!this.state.journal[dateStr] || this.state.journal[dateStr].length === 0) { alert("Kosong."); return; }
        if(confirm("YAKIN HAPUS SEMUA???")) {
            this.state.journal[dateStr] = []; this.saveData(); this.renderJournalEntries(); this.startNewJournalEntry(); this.toggleJournalManage(); this.showToast("Cleared", "error");
        }
    }
    insertImage(input) {
        if(input.files && input.files[0]) {
            const r = new FileReader(); r.onload = e => { document.execCommand('insertImage', false, e.target.result); }; r.readAsDataURL(input.files[0]);
        }
    }

    // --- HABITS (FIXED) ---
    addHabit() {
        const name = document.getElementById('newHabitInput').value.trim();
        // PASTIKAN ID DI HTML ADALAH 'newHabitTime'
        const time = document.getElementById('newHabitTime').value; 
        if(!name) return;
        
        // Pastikan state habits ada array
        this.state.habits = this.state.habits || []; 
        
        this.state.habits.push({
            id: Date.now(), name, count: 0, done: false, doneCount: 0, reminderTime: time, alertedToday: false
        });
        document.getElementById('newHabitInput').value = ''; document.getElementById('newHabitTime').value = '';
        this.saveData(); this.renderHabits();
    }
    toggleHabit(id) {
        const h = this.state.habits.find(x => x.id === id);
        if(h) {
            h.done = !h.done; if(h.done) { h.doneCount++; h.count++; h.alertedToday = true; } else { h.doneCount--; h.count--; h.alertedToday = false; }
            this.saveData(); this.renderHabits();
        }
    }
    deleteHabit(id) {
        if(confirm("Hapus habit ini?")) {
            // Menghapus berdasarkan ID, bukan index (lebih aman)
            this.state.habits = (this.state.habits || []).filter(h => h.id !== id);
            this.saveData(); this.renderHabits();
        }
    }
    resetHabits() {
        if(confirm("Reset hari ini?")) {
            if(this.state.habits) {
                this.state.habits.forEach(h => { h.done = false; h.doneCount = 0; h.alertedToday = false; });
                this.saveData(); this.renderHabits(); this.showToast("Habits Reset", "success");
            }
        }
    }
    
    // --- REMINDER LOGIC ---
    requestNotificationPermission() {
        if (!("Notification" in window)) { alert("Browser tidak mendukung notifikasi."); return; }
        if (Notification.permission === "granted") { this.showToast("Notifikasi Aktif!", "success"); }
        else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(function (permission) {
                if (permission === "granted") new Notification("FocusCat", { body: "Notifikasi siap digunakan!" });
            });
        } else { this.showToast("Notifikasi ditolak.", "error"); }
    }
    startReminderChecker() {
        // Hapus interval lama untuk mencegah duplikasi
        if(this.reminderInterval) clearInterval(this.reminderInterval);
        
        // Cek setiap 60 detik
        this.reminderInterval = setInterval(() => {
            const now = new Date();
            const currentStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
            
            if(this.state.habits) {
                this.state.habits.forEach(h => {
                    // Cek: Ada jam pengingat? Jamnya sama sekarang? Belum selesai? Belum diberitahu hari ini?
                    if (h.reminderTime && h.reminderTime === currentStr && !h.done && !h.alertedToday) {
                        this.playBeep('alarm'); this.vibrate([500, 200, 500]);
                        if (Notification.permission === "granted") {
                            new Notification(`Waktunya: ${h.name}!`, { body: "Ayo kerjakan habitmu sekarang meow~" });
                        } else { this.showToast(`Reminder: ${h.name}!`, "success"); }
                        h.alertedToday = true; this.saveData();
                    }
                });
            }
        }, 60000);
    }
    setupHabits() {
        const input = document.getElementById('newHabitInput');
        if(input) { input.addEventListener('keypress', (e) => { if(e.key === 'Enter') this.addHabit(); }); }
        this.startReminderChecker();
    }
    renderHabits() {
        const l = document.getElementById('habitList'); if(!l) return;
        l.innerHTML = '';
        if(!this.state.habits || this.state.habits.length === 0) { l.innerHTML = '<div style="text-align:center; color:var(--text-light); padding:20px;">Belum ada habit.</div>'; return; }
        this.state.habits.forEach(h => {
            const hasReminder = h.reminderTime && h.reminderTime !== "";
            const progress = (h.doneCount / 1) * 100;
            let streakClass = ''; if (h.count >= 7) streakClass = 'data-streak="high"';
            const li = document.createElement('li');
            li.className = `habit-item ${h.done?'done':''} ${hasReminder?'has-reminder':''} ${streakClass}`;
            li.innerHTML = `
                <div class="habit-left">
                    <div class="habit-check ${h.done?'done':''}" onclick="window.app.toggleHabit(${h.id})"></div>
                    <div class="habit-info">
                        <span class="habit-title">${h.name}</span>
                        <div class="habit-meta">
                            <span class="streak-emoji">🔥 ${h.count}</span>
                            ${hasReminder ? `<span class="habit-reminder-tag">🕒 ${h.reminderTime}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="habit-progress-container"><div class="habit-progress-fill" style="width: ${progress}%"></div></div>
                <button onclick="window.app.deleteHabit(${h.id})" class="habit-delete-btn">🗑️</button>
            `;
            l.appendChild(li);
        });
    }

    // --- CANVAS ---
    setupCanvas() {
        const c = document.getElementById('drawingCanvas'); if(!c) return;
        this.canvas = c; this.ctx = c.getContext('2d'); this.painting = false;
        const start = (e) => { this.painting = true; this.draw(e); };
        const end = () => { this.painting = false; this.ctx.beginPath(); };
        const draw = (e) => {
            if(!this.painting) return;
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX || e.touches[0].clientX) - rect.left;
            const y = (e.clientY || e.touches[0].clientY) - rect.top;
            this.ctx.lineWidth = 3; this.ctx.lineCap = 'round'; this.ctx.strokeStyle = '#ff8e8e';
            this.ctx.lineTo(x, y); this.ctx.stroke(); this.ctx.beginPath(); this.ctx.moveTo(x, y);
        };
        this.canvas.addEventListener('mousedown', start); this.canvas.addEventListener('mouseup', end); this.canvas.addEventListener('mousemove', draw);
        this.canvas.addEventListener('touchstart', start); this.canvas.addEventListener('touchend', end);
        this.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e); });
    }
    openCanvas() { document.getElementById('canvas-modal').style.display = 'flex'; }
    closeCanvas() { document.getElementById('canvas-modal').style.display = 'none'; this.ctx.clearRect(0,0,300,200); }
    saveDoodle() { const imgData = this.canvas.toDataURL(); document.execCommand('insertImage', false, imgData); this.closeCanvas(); }

    // --- STATS (FIXED FUTURE DATES) ---
    switchStatsTab(tab, btnElement) {
        this.currentStatsTab = tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        if(btnElement) btnElement.classList.add('active');
        this.updateStats();
    }
    getMoodEmoji(minutes) { if (minutes === 0) return '😿'; if (minutes < 25) return '😾'; if (minutes < 60) return '😐'; if (minutes < 120) return '😸'; return '🤩'; }
    updateStats() {
        const today = new Date().toISOString().split('T')[0]; const mode = this.currentStatsTab;
        let totalSessions = 0, totalMinutes = 0, chartHTML = '', taskListData = [];
        if (mode === 'daily') {
            const log = this.state.dailyLog[today] || {count:0, minutes:0, tasksDone:[], hourly: {}};
            totalSessions = log.count; totalMinutes = log.minutes;
            chartHTML = '<div class="hourly-bars">';
            let maxH = 0; for(let i=0; i<24; i++) if((log.hourly[i]||0) > maxH) maxH = log.hourly[i];
            if(maxH===0) maxH=10;
            for(let i=0; i<24; i++) { const val = log.hourly[i]||0; const h = (val/maxH)*100; chartHTML += `<div class="h-bar ${val>0?'active':''}" style="height:${h}%;" title="${i}:00 - ${val}m"></div>`; }
            chartHTML += '</div><div style="text-align:center; font-size:0.7rem; color:var(--text-light); margin-top:5px;">Hourly Activity (00-23)</div>';
            if(log.tasksDone) { log.tasksDone.forEach(tTitle => { const exist = taskListData.find(x => x.title === tTitle); if(exist) exist.count++; else taskListData.push({title: tTitle, count: 1}); }); }
            const mood = this.getMoodEmoji(totalMinutes);
            document.getElementById('statsCatAvatar').innerText = mood;
            document.getElementById('statsQuote').innerText = (totalMinutes===0) ? "Start your day now!" : (totalMinutes<25)?"Don't give up!":"You're doing great!";
            document.getElementById('labelPeriodCount').innerText = "Today's Sessions";
            document.getElementById('labelPeriodTime').innerText = "Today's Total";
        }
         else if (mode === 'weekly') {
            const days = []; for (let i = 6; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];
                const dData = this.state.dailyLog[dateStr] || {count:0, minutes:0, tasksDone:[]};
                days.push({dateStr, ...dData});
                totalSessions += dData.count; totalMinutes += dData.minutes;
                if(dData.tasksDone) dData.tasksDone.forEach(tTitle => { const exist = taskListData.find(x => x.title === tTitle); if(exist) exist.count++; else taskListData.push({title: tTitle, count: 1}); });
            }
            chartHTML = '<div class="weekly-bars">'; let maxW = Math.max(...days.map(d => d.count));
            if(maxW===0) maxW=1;
            days.forEach((d, idx) => {
                const h = (d.count/maxW)*100;
                chartHTML += `<div class="w-bar"><div class="w-fill" style="height:${h}%"></div><span class="w-label">${d.dateStr.slice(8)}</span></div>`;
            });
            chartHTML += '</div>';
            const avgMins = totalMinutes / 7;
            document.getElementById('statsCatAvatar').innerText = this.getMoodEmoji(avgMins);
            document.getElementById('statsQuote').innerText = "Weekly progress summary.";
            document.getElementById('labelPeriodCount').innerText = "Week Sessions";
            document.getElementById('labelPeriodTime').innerText = "Week Total";
        } 
        else if (mode === 'monthly') {
            const now = new Date(); const year = now.getFullYear(); const month = now.getMonth(); const daysInMonth = new Date(year, month + 1, 0).getDate();
            chartHTML = '<div class="mood-calendar">';
            for(let i=1; i<=daysInMonth; i++) {
                const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
                
                // === FIX: CEK TANGGAL DEPAN (MASA DEPAN) ===
                const cellDate = new Date(year, month, i); 

                if (cellDate > now) {
                    // JIKA TANGGAL LEBIH DARI HARI INI (BESOK, LUSA, DST), BIARKAN KOSONG (Mood = '')
                    // Jangan ambil data log, jangan hitung menit.
                    const mood = ''; 
                    const isToday = (i === now.getDate()) ? 'today' : '';
                    chartHTML += `<div class="cal-cell ${isToday}" title="${dateStr}: Future"><span class="cal-date">${i}</span><span class="cal-mood">${mood}</span></div>`;
                } else {
                    // JIKA TANGGAL SAMA DENGAN HARI INI ATAU LAMPAU, AMBIL DATA.
                    const mData = this.state.dailyLog[dateStr] || {count:0, minutes:0, tasksDone:[]};
                    totalSessions += mData.count; totalMinutes += mData.minutes;
                    if(mData.tasksDone) mData.tasksDone.forEach(tTitle => { const exist = taskListData.find(x => x.title === tTitle); if(exist) exist.count++; else taskListData.push({title: tTitle, count: 1}); });
                    const mood = this.getMoodEmoji(mData.minutes);
                    const isToday = (i === now.getDate()) ? 'today' : '';
                    chartHTML += `<div class="cal-cell ${isToday}" title="${dateStr}: ${mData.minutes} mins"><span class="cal-date">${i}</span><span class="cal-mood">${mood}</span></div>`;
                }
                // === SELESAI FIX ===
            }
            chartHTML += '</div>';
            const avgMins = totalMinutes / daysInMonth;
            document.getElementById('statsCatAvatar').innerText = this.getMoodEmoji(avgMins);
            document.getElementById('statsQuote').innerText = "Monthly productivity overview.";
            document.getElementById('labelPeriodCount').innerText = "Month Sessions";
            document.getElementById('labelPeriodTime').innerText = "Month Total";

            
        }
        // TAMBAHKAN INI DI BLOK switchStatsTab (di updateStats)
else if (mode === 'yearly') {
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Siapkan data 12 bulan (Jan - Des)
    let yearlyData = new Array(12).fill(0);
    let totalSessions = 0;
    let totalMinutes = 0;
    let taskListData = [];

    // Loop semua log yang tersimpan
    Object.values(this.state.dailyLog).forEach(log => {
        // Cek tahunnya, kalau tahun ini masukin datanya
        const logDate = new Date(log.dateStr || log.date || log); // Pastikan baca date
        if (logDate.getFullYear() === currentYear) {
            const monthIndex = logDate.getMonth(); // 0 (Jan) s/d 11 (Des)
            
            yearlyData[monthIndex] += log.minutes;
            totalSessions += log.count;
            
            if(log.tasksDone) {
                log.tasksDone.forEach(tTitle => {
                    const exist = taskListData.find(x => x.title === tTitle);
                    if(exist) exist.count++; 
                    else taskListData.push({title: tTitle, count: 1}); 
                });
            }
        }
    });

    // Render Grafik (12 Batang)
    chartHTML = '<div class="yearly-bars">';
    let maxW = Math.max(...yearlyData);
    if(maxW===0) maxW=1;
    
    // Nama Bulan
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    
    yearlyData.forEach((mins, idx) => {
        const h = (mins / maxW) * 100;
        chartHTML += `
            <div class="y-bar" title="${monthNames[idx]}: ${Math.floor(mins/60)}h ${mins%60}m">
                <div class="y-fill" style="height: ${h}%"></div>
                <span class="y-label">${monthNames[idx]}</span>
            </div>`;
    });
    chartHTML += '</div>';

    // Info Teks
    const avgMins = totalMinutes / 12;
    document.getElementById('statsCatAvatar').innerText = this.getMoodEmoji(avgMins);
    document.getElementById('statsQuote').innerText = `Productivity ${currentYear}`;
    document.getElementById('labelPeriodCount').innerText = "Yearly Sessions";
    document.getElementById('labelPeriodTime').innerText = "Yearly Total";

    // Update Angka Besar
    document.getElementById('statPeriodCount').innerText = totalSessions;
    document.getElementById('statPeriodTime').innerText = (totalMinutes > 59) ? Math.floor(totalMinutes/60) + 'h ' + (totalMinutes%60) + 'm' : totalMinutes + 'm';

    // Render Task List (Top Tahun Ini)
    const taskListContainer = document.getElementById('taskStatsList');
    taskListContainer.innerHTML = '';
    if(taskListData.length === 0) { 
        taskListContainer.innerHTML = `<span style="color:var(--text-light); font-size:0.9rem; display:block; text-align:center;">No data this year.</span>`; 
    } else {
        taskListData.sort((a,b) => b.count - a.count); // Urutkan terbanyak
        // Ambil Top 10 aja biar nggak penuh
        taskListData.slice(0, 10).forEach(t => {
            const div = document.createElement('div'); div.className = 'task-stat-item';
            // Hitung jam biar keren
            const totalHrs = (t.count * 25) / 60; // Estimasi jam fokus (anggap set default 25 menit)
            const barWidth = Math.min((t.count / 20) * 100, 100); // Relatif terhadap target 20x selesai
            
            div.innerHTML = `
                <div style="font-size:1.2rem;"></div>
                <div class="task-stat-info">
                    <span class="task-stat-title">${t.title}</span>
                    <span class="task-stat-meta">${t.count} times done (${Math.floor(totalHrs)}h)</span>
                </div>
                <div class="task-mini-bar"><div class="task-mini-fill" style="width: ${barWidth}%"></div></div>
            `;
            taskListContainer.appendChild(div);
        });
    }
}
        
        
        document.getElementById('statPeriodCount').innerText = totalSessions;
        document.getElementById('statPeriodTime').innerText = (totalMinutes > 59) ? Math.floor(totalMinutes/60) + 'h ' + (totalMinutes%60) + 'm' : totalMinutes + 'm';
        document.getElementById('chartContainer').innerHTML = chartHTML;
        
        // --- RENDER TASK LIST STATS (BERWARNA) ---
const taskListContainer = document.getElementById('taskStatsList');
taskListContainer.innerHTML = '';

if(taskListData.length === 0) { 
    taskListContainer.innerHTML = `<span style="color:var(--text-light); font-size:0.9rem; display:block; text-align:center;">Belum ada data...</span>`; 
}
else {
    taskListData.sort((a,b) => b.count - a.count);
    
    // Ambil nilai tertinggi untuk skala bar
    const maxCount = Math.max(...taskListData.map(t => t.count));

    taskListData.forEach(t => {
        // 1. Cari Warna Task yang sesuai di database utama
        const fullTask = this.state.tasks.find(tk => tk.title === t.title);
        const color = fullTask ? fullTask.color : '#ff8e8e'; // Fallback pink jika task dihapus
        
        // 2. Hitung lebar bar persentasenya
        const widthPct = (t.count / maxCount) * 100;

        const div = document.createElement('div');
        div.style.marginBottom = '15px'; // Jarak antar bar
        
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.9rem; color:var(--text);">
                <span style="font-weight:600;">${t.title}</span>
                <span style="color:${color}; font-weight:bold;">${t.count}x</span>
            </div>
            
            <!-- Background Bar (Abu-abu) -->
            <div style="width:100%; height:12px; background:rgba(0,0,0,0.05); border-radius:10px; overflow:hidden;">
                <!-- Foreground Bar (Warna Task) -->
                <div style="
                    width: ${widthPct}%; 
                    height: 100%; 
                    background: ${color}; 
                    border-radius:10px; 
                    transition: width 1s ease;
                    box-shadow: 0 2px 6px ${color}66; /* Efek Glow Halus */
                "></div>
            </div>
        `;
        taskListContainer.appendChild(div);
    });
}
    }

    // --- NAV & SETTINGS ---
    navigate(viewId, btn) {
        document.querySelectorAll('.view-section').forEach(e=>e.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
        document.querySelectorAll('.nav-item').forEach(e=>e.classList.remove('active'));
        if(btn) btn.classList.add('active');
        if(viewId === 'view-stats') this.updateStats();
        if(viewId === 'view-habits') this.renderHabits();
    }
    editStatus() { const msg = prompt("Status:", this.state.statusMsg); if(msg!=null) { this.state.statusMsg = msg; const msgEl = document.getElementById('statusMessage'); if(msgEl) msgEl.innerText=msg; this.saveData(); } }
    toggleTheme() { this.settings.darkMode = document.getElementById('settingDarkMode').checked; document.body.setAttribute('data-theme', this.settings.darkMode?'dark':'light'); this.saveData(); }
   
    saveSettings() {
    const getEl = (id) => document.getElementById(id);
    this.settings.focus = parseInt(getEl('settingFocus')?.value) || 25;
    this.settings.short = parseInt(getEl('settingShort')?.value) || 5;
    this.settings.long = parseInt(getEl('settingLong')?.value) || 15;
    this.settings.autoBreak = getEl('settingAutoBreak')?.checked || false;
    this.state.timerStyle = getEl('settingTimerStyle')?.value || "ring";
    let shapeVal = getEl('settingBannerShape')?.value || "round"; if(shapeVal === 'capsule') shapeVal = 'round'; this.state.bannerShape = shapeVal;
    this.state.customPrimaryColor = getEl('customPrimaryColor')?.value || "#b3b3b3";
    this.state.customBgColor = getEl('customBgColor')?.value || "#faf9f6";
    let opacityVal = parseFloat(getEl('uiOpacity')?.value); if(isNaN(opacityVal)) opacityVal = 0.9;
    this.state.cardOpacity = opacityVal;
    this.state.musicFocusUrl = getEl('musicFocusUrl')?.value || "";
    this.state.musicBreakUrl = getEl('musicBreakUrl')?.value || "";
    this.applyVisuals();
    
    document.body.style.backgroundColor = this.state.customBgColor;
    this.saveData();

    // --- TAMBAHKAN INI ---
    // Setelah simpan setting, kita panggil setMode biar waktu di layar langsung update (tanpa harus reset manual)
    this.setMode(this.state.mode, false); // 'false' biar gak dobel save
    // --- SELESAI ---
}
    
        renderSettings() {
        const getEl = (id) => document.getElementById(id);

        // --- TAMBAHAN: JANGAN AMBIL ANGKA 25 (Default) JIKA DATA SUDAH ADA! ---
        
        // Ambil nilai yang ada di this.settings (yang baru di-load), jika ada. Kalau nggak ada, baru pakai Default.
        this.settings.focus = (this.settings.focus && !isNaN(this.settings.focus)) ? this.settings.focus : 25;
        
        // Logic: Jangan pakai `|| 25` atau `??.value || 25`.
        // Tapi cek dulu apakah `this.settings` sudah ada nilainya? Kalau ya, pakai itu!
        
        if(getEl('settingFocus')) getEl('settingFocus').value = this.settings.focus;
        
        // --- RESET LOGIC TAMBAHAN UNTUK SETTING LAINNYA (PRINSIP) ---
        // Lakukan hal yang sama untuk setting lain biar aman:
        
        // Short Break
        this.settings.short = (this.settings.short && !isNaN(this.settings.short)) ? this.settings.short : 5;
        if(getEl('settingShort')) getEl('settingShort').value = this.settings.short;

        // Long Break
        this.settings.long = (this.settings.long && !isNaN(this.settings.long)) ? this.settings.long : 15;
        if(getEl('settingLong')) getEl('settingLong').value = this.settings.long;

        // AutoBreak
        if(getEl('settingAutoBreak')) getEl('settingAutoBreak').checked = !!this.settings.autoBreak;
        
        // DarkMode
        if(getEl('settingDarkMode')) getEl('settingDarkMode').checked = !!this.settings.darkMode;

        // TimerStyle
        if(getEl('settingTimerStyle')) getEl('settingTimerStyle').value = this.settings.timerStyle || "ring";
        
        // Banner Settings
        let shapeVal = (this.state.bannerShape === 'capsule') ? 'round' : this.state.bannerShape;
        if(getEl('settingBannerShape')) getEl('settingBannerShape').value = shapeVal;
        
        // Warna Utama
        if(getEl('customPrimaryColor')) getEl('customPrimaryColor').value = this.state.customPrimaryColor || "#ff8e8e";
        
        // Warna Background
        if(getEl('customBgColor')) getEl('customBgColor').value = this.state.customBgColor || "#faf9f6";

        // UI Opacity
        let opacityVal = parseFloat(getEl('uiOpacity')?.value);
        if(isNaN(opacityVal)) opacityVal = 0.9;
        if(getEl('uiOpacity')) getEl('uiOpacity').value = opacityVal;
        
        // Musik URL
        if(getEl('musicFocusUrl')) getEl('musicFocusUrl').value = this.state.musicFocusUrl || "";
        if(getEl('musicBreakUrl')) getEl('musicBreakUrl').value = this.state.musicBreakUrl || "";
    }
    exportData() {
        const data = { state: this.state, settings: this.settings };
        const blob = new Blob([JSON.stringify(data)], {type: "application/json"});
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
        a.download = `focuscat-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        this.showToast("Backup Saved!", "success");
    }
    importData(input) {
        const file = input.files[0]; if(file) {
            const reader = new FileReader(); reader.onload = (e) => {
                try { const data = JSON.parse(e.target.result); this.state = {...this.defaultState, ...data.state, habits: data.state.habits || []}; this.settings = {...this.defaultSettings, ...data.settings}; this.saveData(); this.showToast("Data Restored!", "success"); location.reload(); }
                catch(e) { alert("File Error!"); }
            }; reader.readAsText(file);
        }
    }
    

    updateUI() {
        this.updateTimerDisplay();
        document.querySelectorAll('.tag').forEach(e=>e.classList.remove('active'));
        const idx = this.state.mode==='focus'?0 : this.state.mode==='short'?1:2;
        if(document.querySelectorAll('.tag')[idx]) document.querySelectorAll('.tag')[idx].classList.add('active');
        if(document.getElementById('btnStartPause')) document.getElementById('btnStartPause').innerHTML = this.state.isRunning?"⏸":"▶";
        const t = this.state.tasks.find(x=>x.id===this.state.currentTaskId);
        if(t) document.getElementById('activeTaskDisplay').innerText = t.title; else if(document.getElementById('activeTaskDisplay')) document.getElementById('activeTaskDisplay').innerText = "No Task Selected";
    }
    updateTimerDisplay() {
        const display = document.getElementById('timeDisplay');
        if(!display) return;
        const m = Math.floor(this.state.timeLeft/60); const s = this.state.timeLeft%60;
        const str = `${m}:${s<10?'0':''}${s}`;
        display.innerText = str;
        document.title = `(${str}) FocusCat`;
        if(this.state.timerStyle === 'ring') {
            const total = (this.state.mode==='focus'?this.settings.focus:(this.state.mode==='short'?this.settings.short:this.settings.long))*60;
            const offset = 754 - (754*this.state.timeLeft)/total;
            const ring = document.getElementById('progressRing'); if(ring) ring.style.strokeDashoffset = offset;
        }
    }
    showToast(m, type = 'normal') {
        const t = document.getElementById('toast');
        if(!t) return;
        t.innerText = m; t.classList.remove('error'); t.classList.remove('success');
        if(type === 'error') t.classList.add('error'); if(type === 'success') t.classList.add('success');
        t.classList.add('show');
        setTimeout(()=>t.classList.remove('show'), 4000);
    }
           toggleJournalSidebar() {
        const s = document.getElementById('journalSidebar');
        const b = document.getElementById('sidebar-backdrop');
        
        // Toggle Class 'show' untuk sidebar dan 'active' untuk backdrop
        if(s) s.classList.toggle('show');
        if(b) b.classList.toggle('active');
    }

    toggleTools() {
        const strip = document.querySelector('.journal-toolbar-strip');
        const btn = document.querySelector('.btn-float-tools');
        
        if (!strip) return;

        // Kita pakai CSS Class .show untuk mengatur tampilan (bukan style.display langsung)
        // Jadi CSS yang mengatur opacity 0 -> 1
        if (strip.classList.contains('show')) {
            // Sembunyi
            strip.classList.remove('show');
            if(btn) btn.style.transform = 'rotate(0deg)';
        } else {
            // Muncul
            strip.classList.add('show');
            if(btn) btn.style.transform = 'rotate(90deg)';
        }
    }
}

window.app = new App();