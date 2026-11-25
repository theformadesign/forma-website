/* =================================================================
   FORMA ADMIN — Supabase Auth + Database + Storage
   ================================================================= */

// ---------- CONFIG: paste your Supabase values here ----------
const SUPABASE_URL = 'https://lsjfjpjemgrbiazhqors.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HXxuV10pLfF8ovB0PYGH1g_jgs6til6';
const BUCKET = 'project-images';
const MAX_GALLERY_IMAGES = 12;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
// -------------------------------------------------------------

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM helpers
const $ = (id) => document.getElementById(id);
const loginView = $('login-view');
const appView = $('app-view');

// In-memory form state for images
let heroUrl = '';            // existing or freshly uploaded hero URL
let galleryUrls = [];        // image URLs; video remains a URL in the existing gallery column
let videoUrl = '';
let mediaBusy = false;
function isVideoUrl(url) { return /\.(mp4|webm)(?:[?#]|$)/i.test(url); }
function setMediaBusy(busy) {
  mediaBusy = busy;
  ['save-btn', 'cancel-btn', 'f-hero-file', 'f-gallery-files', 'f-video-file', 'remove-video-btn'].forEach(id => { $(id).disabled = busy; });
  document.querySelectorAll('.project-actions button, #gallery-preview button').forEach(el => { el.disabled = busy; });
}

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
async function uploadMedia(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || (/\.webm$/i.test(file.name) ? 'video/webm' : /\.mp4$/i.test(file.name) ? 'video/mp4' : 'application/octet-stream') });
  if (error) throw error;
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

$('f-hero-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || mediaBusy) return;
  if (!file.type.startsWith('image/')) { setStatus('Please choose an image for the hero.'); e.target.value = ''; return; }
  setMediaBusy(true);
  setStatus('Uploading hero…');
  try {
    heroUrl = await uploadMedia(file);
    renderHeroPreview();
    setStatus('Hero uploaded. Save the project to publish it.');
  } catch (err) { setStatus('Upload failed: ' + err.message); }
  finally { e.target.value = ''; setMediaBusy(false); }
});

$('f-gallery-files').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length || mediaBusy) return;
  if (galleryUrls.length + files.length > MAX_GALLERY_IMAGES) {
    setStatus(`You can add up to ${MAX_GALLERY_IMAGES} gallery images. ${MAX_GALLERY_IMAGES - galleryUrls.length} space(s) remaining.`);
    e.target.value = ''; return;
  }
  if (files.some(file => !file.type.startsWith('image/'))) {
    setStatus('Choose images here. Use Project video for MP4 or WebM.'); e.target.value = ''; return;
  }
  setMediaBusy(true);
  try {
    for (const [i, file] of files.entries()) {
      setStatus(`Uploading image ${i + 1} of ${files.length}…`);
      galleryUrls.push(await uploadMedia(file));
      renderGalleryPreview();
    }
    setStatus('Gallery images uploaded. Save the project to publish them.');
  } catch (err) { setStatus('Upload failed: ' + err.message + '. Successfully uploaded images are kept in the preview.'); }
  finally { e.target.value = ''; setMediaBusy(false); }
});

$('f-video-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || mediaBusy) return;
  if (!/\.(mp4|webm)$/i.test(file.name) || (file.type && !['video/mp4', 'video/webm'].includes(file.type))) {
    setStatus('Please choose an MP4 or WebM video.'); e.target.value = ''; return;
  }
  if (file.size > MAX_VIDEO_BYTES) { setStatus('Please choose a video smaller than 50 MB.'); e.target.value = ''; return; }
  setMediaBusy(true);
  setStatus('Uploading video… Keep this page open.');
  try {
    videoUrl = await uploadMedia(file);
    renderVideoPreview();
    setStatus('Video uploaded. Save the project to publish it.');
  } catch (err) { setStatus('Video upload failed: ' + err.message + '. Check that the project-images bucket allows video/mp4 and video/webm and your file size.'); }
  finally { e.target.value = ''; setMediaBusy(false); }
});

function renderVideoPreview() {
  const el = $('video-preview');
  el.replaceChildren();
  if (videoUrl) {
    const video = document.createElement('video');
    video.src = videoUrl; video.controls = true; video.playsInline = true; video.preload = 'metadata';
    el.appendChild(video);
  }
  $('remove-video-btn').classList.toggle('hidden', !videoUrl);
}
$('remove-video-btn').addEventListener('click', () => {
  if (mediaBusy) return;
  videoUrl = ''; $('f-video-file').value = ''; renderVideoPreview();
});

function renderHeroPreview() {
  const el = $('hero-preview');
  if (heroUrl) { el.style.backgroundImage = `url('${heroUrl}')`; el.classList.remove('empty'); el.textContent = ''; }
  else { el.style.backgroundImage = ''; el.classList.add('empty'); el.textContent = 'No hero image'; }
}

function renderGalleryPreview() {
  const el = $('gallery-preview');
  $('gallery-count').textContent = `${galleryUrls.length} / ${MAX_GALLERY_IMAGES} images`;
  el.innerHTML = galleryUrls.map((u, i) =>
    `<div class="thumb" style="background-image:url('${u}')"><button onclick="removeGalleryImg(${i})" aria-label="Remove">✕</button></div>`
  ).join('');
}
window.removeGalleryImg = (i) => { if (mediaBusy) return; galleryUrls.splice(i, 1); renderGalleryPreview(); };

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
    const media = Array.isArray(p.gallery) ? p.gallery : [];
    const galCount = media.filter(u => !isVideoUrl(u)).length;
    const hasVideo = media.some(isVideoUrl);
    return `<div class="project-item">
        <div class="project-thumb" ${thumb}></div>
        <div class="project-meta">
          <div class="t">${escapeHtml(p.title)}${featured}</div>
          <div class="s">${escapeHtml(p.category || '—')} · ${galCount} gallery img${hasVideo ? ' + video' : ''} · order ${p.sort_order}</div>
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
  if (mediaBusy) { setStatus('Please wait for the upload to finish.'); return; }
  if (galleryUrls.length > MAX_GALLERY_IMAGES) { setStatus('Please keep up to 12 gallery images.'); return; }
  const title = $('f-title').value.trim();
  if (!title) { setStatus('Title is required.'); return; }
  const payload = {
    title,
    category: $('f-category').value.trim(),
    featured: $('f-featured').checked,
    sort_order: parseInt($('f-sort').value, 10) || 0,
    hero_url: heroUrl || null,
    gallery: videoUrl ? [...galleryUrls, videoUrl] : galleryUrls.slice(),
    client: $('f-client').value.trim(),
    timeline: $('f-timeline').value.trim(),
    challenge: $('f-challenge').value.trim(),
    strategy: $('f-strategy').value.trim(),
    solution: $('f-solution').value.trim(),
    impact: $('f-impact').value.trim(),
    reflection: $('f-reflection').value.trim(),
  };
  const editId = $('edit-id').value;
  setMediaBusy(true);
  let error;
  try {
    if (editId) {
      ({ error } = await sb.from('projects').update(payload).eq('id', editId));
    } else {
      ({ error } = await sb.from('projects').insert(payload));
    }
  } catch (err) { error = err; }
  finally { setMediaBusy(false); }
  if (error) { setStatus('Save failed: ' + error.message); return; }
  setStatus(editId ? 'Project updated.' : 'Project added.');
  resetForm();
  loadProjects();
});

window.editProject = (id) => {
  if (mediaBusy) return;
  const p = (window._projects || []).find((x) => String(x.id) === String(id));
  if (!p) return;
  $('edit-id').value = p.id;
  $('f-title').value = p.title || '';
  $('f-category').value = p.category || '';
  $('f-featured').checked = !!p.featured;
  $('f-sort').value = p.sort_order || 0;
  heroUrl = p.hero_url || '';
  const media = Array.isArray(p.gallery) ? p.gallery : [];
  galleryUrls = media.filter(u => !isVideoUrl(u));
  videoUrl = media.find(isVideoUrl) || '';
  $('f-hero-file').value = ''; $('f-gallery-files').value = ''; $('f-video-file').value = '';
  $('f-client').value = p.client || '';
  $('f-timeline').value = p.timeline || '';
  $('f-challenge').value = p.challenge || '';
  $('f-strategy').value = p.strategy || '';
  $('f-solution').value = p.solution || '';
  $('f-impact').value = p.impact || '';
  $('f-reflection').value = p.reflection || '';
  renderHeroPreview(); renderGalleryPreview(); renderVideoPreview();
  $('form-title').textContent = 'Edit project';
  $('save-btn').textContent = 'Save changes';
  $('cancel-btn').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteProject = async (id, title) => {
  if (mediaBusy) return;
  if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
  const { error } = await sb.from('projects').delete().eq('id', id);
  if (error) { setStatus('Delete failed: ' + error.message); return; }
  setStatus('Project deleted.');
  loadProjects();
};

$('cancel-btn').addEventListener('click', resetForm);

function resetForm() {
  if (mediaBusy) return;
  $('edit-id').value = '';
  $('f-title').value = '';
  $('f-category').value = '';
  $('f-featured').checked = false;
  $('f-sort').value = '0';
  heroUrl = '';
  galleryUrls = [];
  videoUrl = '';
  $('f-video-file').value = '';
  $('f-hero-file').value = '';
  $('f-gallery-files').value = '';
  $('f-client').value = '';
  $('f-timeline').value = '';
  $('f-challenge').value = '';
  $('f-strategy').value = '';
  $('f-solution').value = '';
  $('f-impact').value = '';
  $('f-reflection').value = '';
  renderHeroPreview(); renderGalleryPreview(); renderVideoPreview();
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
