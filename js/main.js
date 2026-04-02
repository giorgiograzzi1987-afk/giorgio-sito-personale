/* ── State ───────────────────────────────────────────────────────────────── */
let authToken = sessionStorage.getItem("gg_token") || null;

/* ── Init ────────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  initTyping();
  initScrollFade();
  initNavHighlight();
  loadPosts();

  if (authToken) activateAdmin();

  document.getElementById("admin-toggle").addEventListener("click", toggleAdmin);
  document.getElementById("login-form")?.addEventListener("submit", handleLogin);
  document.getElementById("post-form")?.addEventListener("submit", submitPost);
  document.getElementById("media-input")?.addEventListener("change", previewMedia);
});

/* ── Typing animation ────────────────────────────────────────────────────── */
function initTyping() {
  const el = document.getElementById("typing-text");
  if (!el) return;

  const phrases = [
    "designer & developer.",
    "content creator.",
    "founder of GGG.",
    "digital builder.",
  ];
  let pi = 0, ci = 0, deleting = false;

  function tick() {
    const phrase = phrases[pi];
    if (deleting) {
      ci--;
      el.textContent = phrase.slice(0, ci);
      if (ci === 0) {
        deleting = false;
        pi = (pi + 1) % phrases.length;
        setTimeout(tick, 400);
      } else {
        setTimeout(tick, 45);
      }
    } else {
      ci++;
      el.textContent = phrase.slice(0, ci);
      if (ci === phrase.length) {
        deleting = true;
        setTimeout(tick, 2000);
      } else {
        setTimeout(tick, 80);
      }
    }
  }
  tick();
}

/* ── Scroll fade-in ──────────────────────────────────────────────────────── */
function initScrollFade() {
  const obs = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
    { threshold: 0.1 }
  );
  document.querySelectorAll(".fade-up").forEach((el) => obs.observe(el));
}

/* ── Nav highlight ───────────────────────────────────────────────────────── */
function initNavHighlight() {
  const sections = document.querySelectorAll("section[id]");
  const links = document.querySelectorAll(".nav-links a[data-section]");

  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          links.forEach((l) => l.classList.toggle("active", l.dataset.section === e.target.id));
        }
      });
    },
    { rootMargin: "-40% 0px -50% 0px" }
  );
  sections.forEach((s) => obs.observe(s));
}

/* ── Posts ───────────────────────────────────────────────────────────────── */
async function loadPosts() {
  const list = document.getElementById("posts-list");
  if (!list) return;

  try {
    const res = await fetch("/api/posts");
    const posts = await res.json();

    if (!posts.length) {
      list.innerHTML = `<div class="posts-empty">Ancora nessun post — presto arriverà qualcosa ✦</div>`;
      return;
    }

    list.innerHTML = posts.map((p) => renderPost(p)).join("");

    // Animate each card in with a staggered delay
    list.querySelectorAll(".post-card").forEach((card, i) => {
      setTimeout(() => card.classList.add("visible"), i * 80);
    });

    // Attach delete handlers
    list.querySelectorAll(".post-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => deletePost(btn.dataset.id));
    });
  } catch {
    list.innerHTML = `<div class="posts-empty">Errore nel caricamento dei post.</div>`;
  }
}

function renderPost(p) {
  const date = new Date(p.created_at + "Z").toLocaleDateString("it-IT", {
    day: "numeric", month: "long", year: "numeric",
  });

  let media = "";
  if (p.media_url) {
    media = p.media_type === "video"
      ? `<div class="post-media"><video src="${p.media_url}" controls preload="metadata"></video></div>`
      : `<div class="post-media"><img src="${p.media_url}" alt="${escHtml(p.title)}" loading="lazy"></div>`;
  }

  return `
  <article class="post-card" data-id="${p.id}">
    ${media}
    <div class="post-body">
      <h3>${escHtml(p.title)}</h3>
      ${p.body ? `<p>${escHtml(p.body)}</p>` : ""}
      <div class="post-date">${date}</div>
      <button class="post-delete-btn" data-id="${p.id}" aria-label="Elimina post">Elimina</button>
    </div>
  </article>`;
}

async function deletePost(id) {
  if (!confirm("Vuoi eliminare questo post?")) return;
  try {
    await fetch(`/api/posts/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    await loadPosts();
  } catch {
    alert("Errore durante l'eliminazione.");
  }
}

/* ── Admin toggle ────────────────────────────────────────────────────────── */
function toggleAdmin() {
  const panel = document.getElementById("admin");
  const isVisible = panel.classList.contains("visible");
  panel.classList.toggle("visible", !isVisible);
  if (!isVisible && authToken) showPostForm();
}

function activateAdmin() {
  document.body.classList.add("admin-active");
  document.getElementById("admin-toggle").textContent = "⬡ Admin";
}

function showPostForm() {
  document.getElementById("login-section").style.display = "none";
  document.getElementById("post-section").style.display = "block";
}

/* ── Login ───────────────────────────────────────────────────────────────── */
async function handleLogin(e) {
  e.preventDefault();
  const user = document.getElementById("login-user").value.trim();
  const pass = document.getElementById("login-pass").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, pass }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || "Errore"; return; }

    authToken = data.token;
    sessionStorage.setItem("gg_token", authToken);
    activateAdmin();
    showPostForm();
  } catch {
    errEl.textContent = "Errore di rete.";
  }
}

/* ── Submit post ─────────────────────────────────────────────────────────── */
async function submitPost(e) {
  e.preventDefault();
  const btn = document.getElementById("post-submit-btn");
  const errEl = document.getElementById("post-error");
  const okEl  = document.getElementById("post-success");
  errEl.textContent = "";
  okEl.textContent = "";
  btn.disabled = true;
  btn.textContent = "Pubblicando…";

  const fd = new FormData();
  fd.append("title", document.getElementById("post-title").value);
  fd.append("body",  document.getElementById("post-body").value);
  const mediaFile = document.getElementById("media-input").files[0];
  if (mediaFile) fd.append("media", mediaFile);

  try {
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || "Errore"; return; }

    okEl.textContent = "Post pubblicato ✓";
    document.getElementById("post-form").reset();
    document.getElementById("media-preview").innerHTML = "";
    await loadPosts();
  } catch {
    errEl.textContent = "Errore di rete.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Pubblica";
  }
}

/* ── Media preview ───────────────────────────────────────────────────────── */
function previewMedia(e) {
  const file = e.target.files[0];
  const wrap = document.getElementById("media-preview");
  wrap.innerHTML = "";
  if (!file) return;

  const url = URL.createObjectURL(file);
  if (file.type.startsWith("video/")) {
    const v = document.createElement("video");
    v.src = url; v.controls = true; v.preload = "metadata";
    wrap.appendChild(v);
  } else {
    const img = document.createElement("img");
    img.src = url; img.alt = "Preview";
    wrap.appendChild(img);
  }
}

/* ── Utils ───────────────────────────────────────────────────────────────── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
