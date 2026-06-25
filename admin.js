/* =================================================================
   FORMA ADMIN — Supabase Auth + Database + Storage
   ================================================================= */

// ---------- CONFIG: paste your Supabase values here ----------
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
const BUCKET = 'project-images';
// -------------------------------------------------------------

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM helpers
const $ = (id) => document.getElementById(id);
const loginView = $('login-view');
const appView = $('app-view');

// In-memory form state for images
let heroUrl = '';            // existing or freshly uploaded hero URL
let galleryUrls = [];        // array of gallery URLs

// ---------------- AUTH ----------------
async function refreshSession() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    loginView.classList.add('hidden');
    appView.classList.remove('hidden');
    $('user-email').textContent = data.session.user.email;
    loadProjects();
  } else {
    appView.classList.add('hidden');
    loginView.classList.remove('hidden');
  }
}

$('login-btn').addEventListener('click', async () => {
  $('login-error').textContent = '';
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email || !password) { $('login-error').textContent = 'Enter email and password.'; return; }
  $('login-btn').disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  $('login-btn').disabled = false;
  if (error) { $('login-error').textContent = error.message; return; }
  refreshSession();
});

$('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('login-btn').click(); });

$('logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
  refreshSession();
});

// ---------------- IMAGE UPLOAD ----------------
async function uploadImage(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

$('f-hero-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  setStatus('Uploading hero…');
  try {
    heroUrl = await uploadImage(file);
    renderHeroPreview();
    setStatus('Hero uploaded.');
  } catch (err) { setStatus('Upload failed: ' + err.message); }
});

$('f-gallery-files').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  setStatus(`Uploading ${files.length} image(s)…`);
  try {
    for (const f of files) {
      const url = await uploadImage(f);
      galleryUrls.push(url);
    }
    renderGalleryPreview();
    setStatus('Gallery images uploaded.');
    e.target.value = '';
  } catch (err) { setStatus('Upload failed: ' + err.message); }
});

function renderHeroPreview() {
  const el = $('hero-preview');
  if (heroUrl) { el.style.backgroundImage = `url('${heroUrl}')`; el.classList.remove('empty'); el.textContent = ''; }
  else { el.style.backgroundImage = ''; el.classList.add('empty'); el.textContent = 'No hero image'; }
}

function renderGalleryPreview() {
  const el = $('gallery-preview');
  el.innerHTML = galleryUrls.map((u, i) =>
    `<div class="thumb" style="background-image:url('${u}')"><button onclick="removeGalleryImg(${i})" aria-label="Remove">✕</button></div>`
  ).join('');
}
window.removeGalleryImg = (i) => { galleryUrls.splice(i, 1); renderGalleryPreview(); };

// ---------------- CRUD ----------------
async function loadProjects() {
  const { data, error } = await sb.from('projects')
    .select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true });
  if (error) { setStatus('Load error: ' + error.message); return; }
  renderList(data || []);
}

function renderList(items) {
  $('count').textContent = items.length;
  const list = $('project-list');
  if (!items.length) { list.innerHTML = '<div class="empty-state">No projects yet. Add one on the left.</div>'; return; }
  list.innerHTML = items.map((p) => {
    const thumb = p.hero_url
      ? `style="background-image:url('${p.hero_url}')"`
      : `style="background:linear-gradient(135deg,#FF6B35,#C2185B)"`;
    const featured = p.featured ? '<span class="badge">Homepage</span>' : '';
    const galCount = Array.isArray(p.gallery) ? p.gallery.length : 0;
    return `<div class="project-item">
        <div class="project-thumb" ${thumb}></div>
        <div class="project-meta">
          <div class="t">${escapeHtml(p.title)}${featured}</div>
          <div class="s">${escapeHtml(p.category || '—')} · ${galCount} gallery img · order ${p.sort_order}</div>
        </div>
        <div class="project-actions">
          <button class="btn-mini" onclick="editProject('${p.id}')">Edit</button>
          <button class="btn-mini btn-del" onclick="deleteProject('${p.id}','${escapeHtml(p.title)}')">Delete</button>
        </div>
      </div>`;
  }).join('');
  window._projects = items;
}

$('save-btn').addEventListener('click', async () => {
  const title = $('f-title').value.trim();
  if (!title) { setStatus('Title is required.'); return; }
  const payload = {
    title,
    category: $('f-category').value.trim(),
    featured: $('f-featured').checked,
    sort_order: parseInt($('f-sort').value, 10) || 0,
    hero_url: heroUrl || null,
    gallery: galleryUrls,
  };
  const editId = $('edit-id').value;
  $('save-btn').disabled = true;
  let error;
  if (editId) {
    ({ error } = await sb.from('projects').update(payload).eq('id', editId));
  } else {
    ({ error } = await sb.from('projects').insert(payload));
  }
  $('save-btn').disabled = false;
  if (error) { setStatus('Save failed: ' + error.message); return; }
  setStatus(editId ? 'Project updated.' : 'Project added.');
  resetForm();
  loadProjects();
});

window.editProject = (id) => {
  const p = (window._projects || []).find((x) => String(x.id) === String(id));
  if (!p) return;
  $('edit-id').value = p.id;
  $('f-title').value = p.title || '';
  $('f-category').value = p.category || '';
  $('f-featured').checked = !!p.featured;
  $('f-sort').value = p.sort_order || 0;
  heroUrl = p.hero_url || '';
  galleryUrls = Array.isArray(p.gallery) ? p.gallery.slice() : [];
  renderHeroPreview(); renderGalleryPreview();
  $('form-title').textContent = 'Edit project';
  $('save-btn').textContent = 'Save changes';
  $('cancel-btn').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteProject = async (id, title) => {
  if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
  const { error } = await sb.from('projects').delete().eq('id', id);
  if (error) { setStatus('Delete failed: ' + error.message); return; }
  setStatus('Project deleted.');
  loadProjects();
};

$('cancel-btn').addEventListener('click', resetForm);

function resetForm() {
  $('edit-id').value = '';
  $('f-title').value = '';
  $('f-category').value = '';
  $('f-featured').checked = false;
  $('f-sort').value = '0';
  heroUrl = '';
  galleryUrls = [];
  $('f-hero-file').value = '';
  $('f-gallery-files').value = '';
  renderHeroPreview(); renderGalleryPreview();
  $('form-title').textContent = 'Add project';
  $('save-btn').textContent = 'Add project';
  $('cancel-btn').classList.add('hidden');
}

// ---------------- utils ----------------
function setStatus(msg) { $('form-status').textContent = msg; }
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// init
if (SUPABASE_URL.indexOf('YOUR-PROJECT') !== -1) {
  $('login-error') && ($('login-error').textContent = 'Add your Supabase URL and anon key in admin.js first.');
}
refreshSession();
