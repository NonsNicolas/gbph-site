// auth-ui.js — Username-only UI (uses Supabase email auth underneath)
//
// Username entered -> email generated: <username>@gbph.app
// (Users never see email; they only use username + password)

export function initAuthUI(supabase) {
  injectAuthStyles();
  injectAuthModal();

  async function refresh() {
    const profileArea = document.getElementById("profileArea");
    if (!profileArea) return;

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      profileArea.innerHTML = `<button id="btnOpenAuth" class="gb-btn gb-btn-ghost">Login</button>`;
      document.getElementById("btnOpenAuth").onclick = () => open("login");
      return;
    }

    const username = emailToUsername(user.email || "");
    profileArea.innerHTML = `
      <div class="gb-profile">
        <button id="gbProfileBtn" class="gb-btn gb-btn-ghost">${escapeHtml(username || "Profile")}</button>
        <div id="gbProfileMenu" class="gb-menu" style="display:none;">
          <button id="gbLogoutBtn" class="gb-menu-item">Log out</button>
        </div>
      </div>
    `;

    const btn = document.getElementById("gbProfileBtn");
    const menu = document.getElementById("gbProfileMenu");

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.style.display = (menu.style.display === "none") ? "block" : "none";
    });

    document.addEventListener("click", () => {
      if (menu) menu.style.display = "none";
    });

    document.getElementById("gbLogoutBtn").onclick = async () => {
      await supabase.auth.signOut();
      await refresh();
    };
  }

  // ===== Modal control =====
  let mode = "login"; // login | signup

  function open(nextMode = "login") {
    mode = nextMode;
    setModeUI();

    const overlay = document.getElementById("gbAuthOverlay");
    const modal = document.getElementById("gbAuthModal");
    overlay.style.display = "block";
    modal.style.display = "block";

    setTimeout(() => document.getElementById("gbUsername")?.focus(), 50);
  }

  function close() {
    document.getElementById("gbAuthOverlay").style.display = "none";
    document.getElementById("gbAuthModal").style.display = "none";
    setMessage("");
  }

  function setModeUI() {
    const title = document.getElementById("gbAuthTitle");
    const tabLogin = document.getElementById("gbTabLogin");
    const tabSignup = document.getElementById("gbTabSignup");
    const submit = document.getElementById("gbSubmit");

    if (mode === "signup") {
      title.textContent = "Create account";
      tabSignup.classList.add("active");
      tabLogin.classList.remove("active");
      submit.textContent = "Sign up";
    } else {
      title.textContent = "Login";
      tabLogin.classList.add("active");
      tabSignup.classList.remove("active");
      submit.textContent = "Login";
    }
    setMessage("");
  }

  function setMessage(text) {
    const el = document.getElementById("gbAuthMsg");
    el.textContent = text || "";
  }

  function usernameToEmail(username) {
    // Allow letters, numbers, underscore, dot, hyphen
    const clean = (username || "").trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,20}$/.test(clean)) return null;
    return `${clean}@gbph.app`; // safe "email-like" domain
  }

  function emailToUsername(email) {
    if (!email) return "";
    const at = email.indexOf("@");
    return at === -1 ? email : email.slice(0, at);
  }

  async function submit() {
    setMessage("");

    const usernameRaw = document.getElementById("gbUsername").value;
    const password = document.getElementById("gbPassword").value;

    if (!usernameRaw || !password) {
      setMessage("Please enter username and password.");
      return;
    }

    const email = usernameToEmail(usernameRaw);
    if (!email) {
      setMessage("Username must be 3–20 characters: letters, numbers, . _ -");
      return;
    }

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage(error.message);
        return;
      }
      // If email confirmations are OFF, user may already be logged in.
      // Either way, we move to login mode for clarity.
      setMessage("Account created. You can login now.");
      mode = "login";
      setModeUI();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      return;
    }

    await refresh();
    close();
  }

  // expose requireAuth-like helper
  async function requireLogin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return user;
    open("login");
    return null;
  }

  // Wire up modal events
  function bind() {
    document.getElementById("gbAuthOverlay").onclick = close;
    document.getElementById("gbClose").onclick = close;

    document.getElementById("gbTabLogin").onclick = () => { mode = "login"; setModeUI(); };
    document.getElementById("gbTabSignup").onclick = () => { mode = "signup"; setModeUI(); };

    document.getElementById("gbSubmit").onclick = submit;

    document.getElementById("gbPassword").addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
  }

  bind();

  return { refresh, open, close, requireLogin };
}

// Keep backward compatibility with your other scripts
export async function requireAuth(supabase, authUI) {
  if (!authUI || !authUI.requireLogin) {
    const { data: { user } } = await supabase.auth.getUser();
    return user || null;
  }
  return await authUI.requireLogin();
}

function injectAuthModal() {
  if (document.getElementById("gbAuthModal")) return;

  const overlay = document.createElement("div");
  overlay.id = "gbAuthOverlay";
  overlay.className = "gb-overlay";
  overlay.style.display = "none";

  const modal = document.createElement("div");
  modal.id = "gbAuthModal";
  modal.className = "gb-modal";
  modal.style.display = "none";

  modal.innerHTML = `
    <div class="gb-card">
      <div class="gb-card-head">
        <div>
          <div id="gbAuthTitle" class="gb-title">Login</div>
          <div class="gb-tabs">
            <button id="gbTabLogin" class="gb-tab active" type="button">Login</button>
            <button id="gbTabSignup" class="gb-tab" type="button">Sign up</button>
          </div>
        </div>
        <button id="gbClose" class="gb-x" type="button" aria-label="Close">✕</button>
      </div>

      <div class="gb-body">
        <label class="gb-label">Username</label>
        <input id="gbUsername" class="gb-input" placeholder="e.g. juan" autocomplete="username" />
        <label class="gb-label">Password</label>
        <input id="gbPassword" class="gb-input" type="password" placeholder="••••••••" autocomplete="current-password" />
        <button id="gbSubmit" class="gb-btn gb-btn-primary" type="button">Login</button>
        <div id="gbAuthMsg" class="gb-msg"></div>
        <div class="gb-hint">Username is only for this site.</div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(modal);
}

function injectAuthStyles() {
  if (document.getElementById("gbAuthStyles")) return;
  const s = document.createElement("style");
  s.id = "gbAuthStyles";
  s.textContent = `
  /* Overlay + center */
  .gb-overlay{
    position:fixed; inset:0;
    background:rgba(0,0,0,.45);
    z-index:9999;
  }
  .gb-modal{
    position:fixed; inset:0;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:16px;
    z-index:10000;
  }

  /* Card */
  .gb-card{
    width:min(520px, 100%);
    max-height:calc(100vh - 32px);
    overflow:auto;
    background:#fff;
    border-radius:18px;
    border:1px solid #eee;
    box-shadow:0 20px 60px rgba(0,0,0,.18);
    padding:16px;
  }

  .gb-card-head{
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:12px;
  }
  .gb-title{
    font-size:20px;
    font-weight:800;
    margin:0 0 8px 0;
    line-height:1.2;
  }

  /* Tabs */
  .gb-tabs{ display:flex; gap:8px; flex-wrap:wrap; }
  .gb-tab{
    padding:8px 12px;
    border-radius:999px;
    border:1px solid #ddd;
    background:#fff;
    cursor:pointer;
    font-size:13px;
    line-height:1;
  }
  .gb-tab.active{ border-color:#111; }

  /* Close button */
  .gb-x{
    width:42px; height:42px;
    border-radius:12px;
    border:1px solid #ddd;
    background:#fff;
    cursor:pointer;
    font-size:16px;
    display:flex;
    align-items:center;
    justify-content:center;
  }

  /* Body spacing */
  .gb-body{
    margin-top:14px;
    display:grid;
    gap:10px;
  }
  .gb-label{
    font-size:12px;
    color:#555;
    margin-top:2px;
  }

  /* Inputs - stop site CSS from breaking them */
  .gb-input{
    width:100% !important;
    box-sizing:border-box !important;
    padding:12px 14px !important;
    border-radius:12px !important;
    border:1px solid #ddd !important;
    font-size:16px !important;
    line-height:1.2 !important;
    background:#fff !important;
    outline:none !important;
  }
  .gb-input:focus{
    border-color:#111 !important;
    box-shadow:0 0 0 3px rgba(17,17,17,.10) !important;
  }

  /* Buttons */
  .gb-btn{
    padding:12px 14px;
    border-radius:12px;
    border:1px solid #ddd;
    background:#fff;
    cursor:pointer;
    font-size:16px;
  }
  .gb-btn-primary{
    border:none;
    background:#111;
    color:#fff;
    width:100%;
  }
  .gb-btn-ghost{ background:#fff; }

  /* Messages */
  .gb-msg{ font-size:12px; color:#b00020; min-height:16px; }
  .gb-hint{ font-size:12px; color:#777; }

  /* Profile dropdown */
  .gb-profile{ position:relative; display:inline-block; }
  .gb-menu{
    position:absolute; right:0; top:calc(100% + 8px);
    width:160px;
    background:#fff;
    border:1px solid #eee;
    border-radius:12px;
    box-shadow:0 10px 30px rgba(0,0,0,.08);
    overflow:hidden;
    z-index:50;
  }
  .gb-menu-item{
    width:100%;
    text-align:left;
    padding:10px 12px;
    border:none;
    background:#fff;
    cursor:pointer;
    font-size:14px;
  }
  .gb-menu-item:hover{ background:#f6f6f6; }

  /* Mobile tweaks */
  @media (max-width:420px){
    .gb-card{ padding:14px; border-radius:16px; }
    .gb-title{ font-size:18px; }
    .gb-x{ width:40px; height:40px; }
  }
`;
  }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
