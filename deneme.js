// ===== ToDo — Portföy Sürümü (TR) =====
// State: { id, text, done, priority: 'high'|'medium'|'low', due: 'YYYY-MM-DD'|'', dueTime: 'HH:mm'|'', tags: ['#etiket'], created: number }
let todos = [];
let currentFilter = 'all'; // 'all' | 'active' | 'done'
let searchTerm = '';
let sortMode = 'created_desc';

const form   = document.querySelector('#todo-form');
const input  = document.querySelector('#todo-input');
const list   = document.querySelector('#todo-list');
const counterEl = document.querySelector('#counter');
const clearDoneBtn = document.querySelector('#clear-done');
const filterButtons = document.querySelectorAll('.filter-btn');
const prioritySel = document.querySelector('#priority');
const dueInput = document.querySelector('#due');
const dueTimeInput = document.querySelector('#due-time');
const searchInput = document.querySelector('#search');
const sortSelect = document.querySelector('#sort');
const progressFill = document.querySelector('#progress-fill');
const progressText = document.querySelector('#progress-text');
const tagCloud = document.querySelector('#tag-cloud');
const themeToggle = document.querySelector('#theme-toggle');
const exportBtn = document.querySelector('#export-pdf');
const importFile = document.querySelector('#import-file');
const tagSuggest = document.querySelector('#tag-suggestions');

// Backup UI
const backupConnectBtn = document.querySelector('#backup-connect');
const backupSaveBtn = document.querySelector('#backup-save');
const backupStatus = document.querySelector('#backup-status');

const STORE_KEY = 'todos_v2';
const THEME_KEY = 'theme_pref';

// === Kalıcı Depolama ===
function save(){ 
  localStorage.setItem(STORE_KEY, JSON.stringify(todos)); 
  scheduleAutoBackup();
}
function load(){
  try {
    todos = JSON.parse(localStorage.getItem(STORE_KEY) || '[]')
      .map(d => ({
        id: d.id || uid(),
        text: String(d.text || ''),
        done: !!d.done,
        priority: ['high','medium','low'].includes(d.priority) ? d.priority : 'medium',
        due: d.due || '',
        dueTime: d.dueTime || '',
        tags: Array.isArray(d.tags) ? d.tags.map(String) : parseTags(String(d.text || '')),
        created: typeof d.created === 'number' ? d.created : Date.now()
      }));
  } catch { todos = []; }
}

// === Tema ===
function applyTheme(theme){
  if(!theme){ document.body.removeAttribute('data-theme'); return; }
  document.body.setAttribute('data-theme', theme);
}
function loadTheme(){
  const t = localStorage.getItem(THEME_KEY);
  if (t) applyTheme(t);
}
themeToggle?.addEventListener('click', () => {
  const current = document.body.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : current === 'light' ? null : 'dark';
  if (next) localStorage.setItem(THEME_KEY, next); else localStorage.removeItem(THEME_KEY);
  applyTheme(next);
});

// === Yardımcılar ===
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const parseTags = (text) => (text.match(/#[\p{L}\d_]+/gu) || []).map(t => t.toLowerCase());

// Deterministik renk (etiket -> HSL)
function hashHue(str){ let h=0; for(let i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) >>> 0; } return h%360; }
function tagColor(tag){ const hue = hashHue(tag.toLowerCase()); return `hsl(${hue}, 65%, 55%)`; }
function textOn(){ return '#0d1117'; }

// due -> Date (TZ kayması olmaması için yalnız karşılaştırmada kullan)
function toDueDate(due, dueTime){
  if (!due) return null;
  const time = dueTime && /^\d{2}:\d{2}$/.test(dueTime) ? dueTime : '23:59';
  return new Date(`${due}T${time}`);
}
function isOverdueDT(due, dueTime, done){
  const dt = toDueDate(due, dueTime);
  if (!dt || done) return false;
  return dt.getTime() < Date.now();
}

// Etiket önerilerini güncelle
function buildTagSuggestions(){
  if (!tagSuggest) return;
  // benzersiz etiketleri çıkar
  const set = new Set();
  todos.forEach(t => t.tags.forEach(x => set.add(x)));
  const tags = [...set].sort((a,b)=>a.localeCompare(b,'tr')).slice(0,20);

  tagSuggest.innerHTML = '';
  tags.forEach(tg => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tag-chip';
    const c = tagColor(tg);
    chip.style.background = c;
    chip.style.borderColor = c;
    chip.style.color = textOn(c);
    chip.textContent = tg;
    chip.addEventListener('click', () => insertTagIntoInput(tg));
    tagSuggest.appendChild(chip);
  });
}

// input’a etiket ekleme (imleç konumuna)
function insertTagIntoInput(tag){
  if (!input) return;
  const start = input.selectionStart ?? input.value.length;
  const end   = input.selectionEnd ?? input.value.length;
  const spaceBefore = (start>0 && /\S/.test(input.value[start-1])) ? ' ' : '';
  const spaceAfter = (end < input.value.length && /\S/.test(input.value[end])) ? ' ' : '';
  const ins = `${spaceBefore}${tag}${spaceAfter?' ':''}`;
  input.value = input.value.slice(0,start) + ins + input.value.slice(end);
  input.focus();
  // caret at end of inserted tag
  const pos = start + ins.length;
  input.setSelectionRange(pos, pos);
}

// Filtrelenmiş + Aranmış + Sıralanmış görünüm
function getVisibleTodos(){
  let items = todos.slice();

  if (currentFilter === 'active') items = items.filter(t => !t.done);
  if (currentFilter === 'done')   items = items.filter(t =>  t.done);

  if (searchTerm.trim()){
    const q = searchTerm.toLowerCase();
    items = items.filter(t => t.text.toLowerCase().includes(q) || t.tags.some(tag => tag.includes(q)));
  }

  const prRank = { high: 0, medium: 1, low: 2 };
  items.sort((a,b) => {
    switch (sortMode){
      case 'created_asc':  return a.created - b.created;
      case 'priority':     return prRank[a.priority]-prRank[b.priority] || a.created - b.created;
      case 'due': {
        const da = toDueDate(a.due, a.dueTime) || new Date('9999-12-31T23:59');
        const db = toDueDate(b.due, b.dueTime) || new Date('9999-12-31T23:59');
        return da - db;
      }
      case 'alpha':        return a.text.localeCompare(b.text, 'tr');
      case 'created_desc':
      default:             return b.created - a.created;
    }
  });
  return items;
}

// Sayaç + İlerleme + Etiket Bulutu
function updateStats(){
  const active = todos.filter(t => !t.done).length;
  const total = todos.length;
  counterEl.textContent = `${active} aktif • ${total} toplam`;

  const pct = total ? Math.round(((total - active) / total) * 100) : 0;
  progressFill.style.width = `${pct}%`;
  progressText.textContent = `${pct}%`;

  // Tag bulutu (en çok kullanılan ilk 8)
  const freq = new Map();
  todos.forEach(t => t.tags.forEach(tag => freq.set(tag, (freq.get(tag)||0)+1)));
  const popular = [...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);
  tagCloud.innerHTML = '';
  popular.forEach(([tag,count]) => {
    const b = document.createElement('button');
    const color = tagColor(tag);
    b.className = 'tag-badge tag-chip';
    b.style.background = color;
    b.style.borderColor = color;
    b.style.color = textOn(color);
    b.textContent = `${tag} • ${count}`;
    b.addEventListener('click', () => {
      searchInput.value = tag;
      searchTerm = tag;
      render();
    });
    tagCloud.appendChild(b);
  });

  buildTagSuggestions();
}

// Konfeti
function burstConfettiFrom(el){
  if (!window.confetti || !el) return;
  const rect = el.getBoundingClientRect();
  const x = (rect.left + rect.width/2) / window.innerWidth;
  const y = (rect.top  + rect.height/2) / window.innerHeight;
  window.confetti({ particleCount: 80, spread: 70, origin: { x, y } });
}

// Bir öğeyi çiz
function renderItem({ id, text, done, priority, due, dueTime, tags }){
  const li = document.createElement('li');
  li.className = 'todo-item';

  const left = document.createElement('div');
  left.className = 'todo-left';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = done;
  checkbox.addEventListener('change', (ev) => {
    const turnedDone = ev.target.checked;
    todos = todos.map(t => t.id === id ? { ...t, done: turnedDone } : t);
    save(); render();
    if (turnedDone) burstConfettiFrom(ev.target);
  });

  // Görev metni (çift tıkla düzenleme)
  const span = document.createElement('span');
  span.className = 'todo-text' + (done ? ' done' : '');
  span.textContent = text;
  span.title = tags.join(' ');

    span.addEventListener('dblclick', () => {
      const editor = document.createElement('input');
      editor.type = 'text';
      editor.className = 'edit-input';
      editor.value = text;
      span.replaceWith(editor);
      editor.focus();
      let finished = false;
      const finish = (ok) => {
        if (finished) return; // ESC + blur çift tetiklenmesini engelle
        finished = true;
        const val = editor.value.trim();
        if (ok && val){
          todos = todos.map(t => t.id === id ? { ...t, text: val, tags: parseTags(val) } : t);
          save();
        }
        render();
      };
      editor.addEventListener('keydown', (e)=>{
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      });
      editor.addEventListener('blur', ()=>finish(true));
    });

  left.append(checkbox, span);

  // Meta alanı: öncelik + due + etiketler
  const meta = document.createElement('div');
  meta.className = 'meta';

  const pr = document.createElement('span');
  pr.className = `pill ${priority}`;
  pr.textContent = priority === 'high' ? '🔴 Yüksek' : priority === 'low' ? '🟢 Düşük' : '🟡 Orta';

  const duePill = document.createElement('span');
  duePill.className = 'pill';
  if (due){
    const show = dueTime ? `${due} ${dueTime}` : due;
    duePill.textContent = `📅 ${show}`;
    if (isOverdueDT(due, dueTime, done)) duePill.classList.add('overdue');
  } else {
    duePill.textContent = '📅 Tarih yok';
  }

  // Etiketler: renkli çipler
  if (tags.length){
    const wrap = document.createElement('span');
    tags.forEach(tg => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      const c = tagColor(tg);
      chip.style.background = c;
      chip.style.borderColor = c;
      chip.style.color = textOn(c);
      chip.textContent = tg;
      chip.title = 'Bu etikete göre filtrele';
      chip.addEventListener('click', () => {
        searchInput.value = tg;
        searchTerm = tg;
        render();
      });
      wrap.appendChild(chip);
    });
    meta.append(wrap);
    // İlk etiketin rengi görev kartında sol şerit olarak
    li.style.setProperty('--tag', tagColor(tags[0]));
  }

  meta.prepend(pr, duePill);

  // Sil butonu
  const del = document.createElement('button');
  del.className = 'delete-btn';
  del.textContent = 'Sil';
  del.setAttribute('aria-label', `"${text}" görevini sil`);
  del.addEventListener('click', () => {
    todos = todos.filter(t => t.id !== id);
    save(); render();
  });

  li.append(left, meta, del);
  return li;
}

// Ana çizim
function render(){
  list.innerHTML = '';
  const visible = getVisibleTodos();
  visible.forEach(item => list.appendChild(renderItem(item)));
  updateStats();

  filterButtons.forEach(btn => {
    const active = btn.dataset.filter === currentFilter;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

// === Olaylar ===
// Ekle
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  const t = {
    id: uid(),
    text,
    done: false,
    priority: prioritySel.value,
    due: dueInput.value || '',
    dueTime: dueTimeInput?.value || '',
    tags: parseTags(text),
    created: Date.now()
  };
  todos.unshift(t);
  input.value = ''; // yalnızca metni sıfırla
  save(); render();
});

// Filtreler
filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    render();
  });
});

// Arama
searchInput.addEventListener('input', (e) => {
  searchTerm = e.target.value;
  render();
});

// Sıralama
sortSelect.addEventListener('change', (e) => {
  sortMode = e.target.value;
  render();
});

// Tamamlananları temizle
clearDoneBtn.addEventListener('click', () => {
  if (!todos.some(t => t.done)) return;
  todos = todos.filter(t => !t.done);
  save(); render();
});

// Dışa aktar (PDF)
exportBtn?.addEventListener('click', () => {
  const mod = window.jspdf;
  if (!mod || !mod.jsPDF) {
    alert('PDF modülü yüklenemedi. index.html’e jsPDF ve autoTable script etiketlerini eklediğinden emin ol.');
    return;
  }
  const { jsPDF } = mod;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('Görev Listem', 40, 40);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(new Date().toLocaleString('tr-TR'), 40, 58);

  const rows = (todos || []).map((t, i) => [
    i + 1,
    t.done ? 'Tamamlandı' : 'Aktif',
    t.priority === 'high' ? 'Yüksek' : t.priority === 'low' ? 'Düşük' : 'Orta',
    t.due ? (t.dueTime ? `${t.due} ${t.dueTime}` : t.due) : '—',
    (t.tags || []).join(' '),
    t.text || ''
  ]);

  doc.autoTable({
    head: [['#', 'Durum', 'Öncelik', 'Tarih', 'Etiketler', 'Görev']],
    body: rows,
    startY: 80,
    styles: { fontSize: 10, cellPadding: 6, overflow: 'linebreak' },
    columnStyles: { 0:{cellWidth:24}, 1:{cellWidth:90}, 2:{cellWidth:70}, 3:{cellWidth:110}, 4:{cellWidth:120}, 5:{cellWidth:'auto'} },
    headStyles: { fillColor: [67,83,255], textColor: 255 }
  });

  doc.save('gorev-listesi.pdf');
});

// İçe aktar
importFile.addEventListener('change', async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('Beklenmeyen format');

    todos = data.map(d => ({
      id: d.id || uid(),
      text: String(d.text || ''),
      done: !!d.done,
      priority: ['high','medium','low'].includes(d.priority) ? d.priority : 'medium',
      due: d.due || '',
      dueTime: d.dueTime || '',
      tags: Array.isArray(d.tags) ? d.tags.map(String) : parseTags(String(d.text || '')),
      created: typeof d.created === 'number' ? d.created : Date.now()
    }));
    save(); render();
  } catch {
    alert('JSON dosyası okunamadı. Lütfen geçerli bir dışa aktarım yükleyin.');
  } finally {
    importFile.value = '';
  }
});


// ===== 10) Yedekleme — File System Access API (otomatik + manuel) =====
let backupHandle = null;
let autoBackupTimer = null;

async function connectBackupFile(){
  if (!('showSaveFilePicker' in window)) {
    alert('Tarayıcınızda dosya erişimi desteklenmiyor. Elle yedek indirme kullanılacak.');
    return;
  }
  try {
    backupHandle = await window.showSaveFilePicker({
      suggestedName: 'gorevlar_yedek.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    });
    backupStatus.textContent = 'Yedek dosyası bağlı ✅';
    await writeBackup(); // hemen ilk yazım
  } catch {
    backupStatus.textContent = 'Yedek dosyası bağlanmadı';
  }
}

async function writeBackup(){
  try {
    if (!backupHandle) return;
    const writable = await backupHandle.createWritable();
    await writable.write(new Blob([JSON.stringify(todos, null, 2)], { type: 'application/json' }));
    await writable.close();
    backupStatus.textContent = 'Yedeklendi ✔';
  } catch {
    backupStatus.textContent = 'Yedek yazılamadı ❗';
  }
}

function scheduleAutoBackup(){
  // her kayıttan sonra 1 sn sonra tek atımlık yaz (çok sık yazmayı engelle)
  if (autoBackupTimer) clearTimeout(autoBackupTimer);
  autoBackupTimer = setTimeout(() => {
    if (backupHandle) writeBackup();
    else fallbackDownloadSilent(); // destek yoksa gizli indirme (tek sefer)
  }, 1000);
}

// Fallback: destek yoksa tek seferlik görünmez indirme
function fallbackDownloadSilent(){
  // Her değişiklikte indirmek istemezsen yorum satırı yapabilirsin.
  // Küçük: sadece localStorage var, o zaten kalıcı — bu nedenle burada NOP da yeterli.
}

// UI
backupConnectBtn?.addEventListener('click', connectBackupFile);
backupSaveBtn?.addEventListener('click', () => backupHandle ? writeBackup() : fallbackManualDownload());

// Manuel indirme (her yerde çalışır)
function fallbackManualDownload(){
  const blob = new Blob([JSON.stringify(todos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'gorevler_yedek.json'; a.click();
  URL.revokeObjectURL(url);
  backupStatus.textContent = 'Yedek indirildi ⬇️';
}


// Başlat
loadTheme();
load();
render();
buildTagSuggestions();