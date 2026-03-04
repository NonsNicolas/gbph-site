// auth-ui.js — Username-only UI (uses Supabase email auth underneath)
// Username entered -> email generated: <username>@gbph.app
// (Users never see email; they only use username + password)

export function initAuthUI(supabase) {
  injectAuthStyles();
  injectAuthModal();

  async function refresh() {
    const profileArea = document.getElementById("profileArea");
    if (!profileArea) return;

    const { data: { user } } = await supabase.auth.getUser();

    // Logged out
    if (!user) {
      profileArea.innerHTML = `<button id="btnOpenAuth" class="gb-btn gb-btn-ghost">Login</button>`;
      const b = document.getElementById("btnOpenAuth");
      if (b) b.onclick = () => open("login");
      return;
    }

    // Logged in (dropdown)
    const username = emailToUsername(user.email || "");
    profileArea.innerHTML = `
      <div class="gb-profile">
        <button id="gbProfileBtn" class="gb-btn gb-btn-ghost">${escapeHtml(username || "Profile")}</button>
        <div id="gbProfileMenu" class="gb-menu" style="display:none;">
          <a href="./my.html" id="gbMyResLink" class="gb-menu-item gb-menu-link">My Reservations</a>
          <button id="gbLogoutBtn" class="gb-menu-item" type="button">Log out</button>
        </div>
      </div>
    `;

    const btn = document.getElementById("gbProfileBtn");
    const menu = document.getElementById("gbProfileMenu");

    if (btn && menu) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.style.display = (menu.style.display === "none") ? "block" : "none";
      });

      document.addEventListener("click", () => {
        menu.style.display = "none";
      });
    }

    const logoutBtn = document.getElementById("gbLogoutBtn");
    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        await supabase.auth.signOut();
        await refresh();
      };
    }
  }

  // ===== Modal control =====
  let mode = "login"; // login | signup

  function open(nextMode = "login") {
    mode = nextMode;
    setModeUI();

    const overlay = document.getElementById("gbAuthOverlay");
    const modal = document.getElementById("gbAuthModal");
    overlay.style.display = "block";
    modal.style.display = "flex";

    // lock background scroll (mobile friendly)
    document.body.style.overflow = "hidden";

    setTimeout(() => document.getElementById("gbUsername")?.focus(), 50);
  }

  function close() {
    document.getElementById("gbAuthOverlay").style.display = "none";
    document.getElementById("gbAuthModal").style.display = "none";
    setMessage("");

    // unlock scroll
    document.body.style.overflow = "";
  }

  function setModeUI() {
    const title = document.getElementById("gbAuthTitle");
    const tabLogin = document.getElementById("gbTabLogin");
    const tabSignup = document.getElementById("gbTabSignup");
    const submitBtn = document.getElementById("gbSubmit");

    if (mode === "signup") {
      title.textContent = "Create account";
      tabSignup.classList.add("active");
      tabLogin.classList.remove("active");
      submitBtn.textContent = "Sign up";
    } else {
      title.textContent = "Login";
      tabLogin.classList.add("active");
      tabSignup.classList.remove("active");
      submitBtn.textContent = "Login";
    }
    setMessage("");
  }

  function setMessage(text) {
    const el = document.getElementById("gbAuthMsg");
    el.textContent = text || "";
  }

  function usernameToEmail(username) {
    const clean = (username || "").trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,20}$/.test(clean)) return null;
    return `${clean}@gbph.app`;
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

  async function requireLogin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return user;
    open("login");
    return null;
  }

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

  // openAuth alias for old code compatibility
  return { refresh, open, openAuth: open, close, requireLogin };
}

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
    /* Overlay + centered modal (strong overrides) */
    #gbAuthOverlay.gb-overlay{
      position:fixed !important;
      inset:0 !important;
      background:rgba(0,0,0,.45) !important;
      z-index:9999 !important;
    }

    #gbAuthModal.gb-modal{
      position:fixed !important;
      inset:0 !important;
      display:flex !important;
      align-items:center !important;
      justify-content:center !important;
      padding:16px !important;
      z-index:10000 !important;
    }

    #gbAuthModal .gb-card{
      width:min(520px, 100%) !important;
      max-height:calc(100vh - 32px) !important;
      overflow:auto !important;
      background:#fff !important;
      border-radius:18px !important;
      border:1px solid #eee !important;
      box-shadow:0 20px 60px rgba(0,0,0,.18) !important;
      padding:16px !important;
    }

    #gbAuthModal .gb-card-head{
      display:flex !important;
      justify-content:space-between !important;
      align-items:flex-start !important;
      gap:12px !important;
    }

    #gbAuthModal .gb-title{
      font-size:20px !important;
      font-weight:800 !important;
      margin:0 0 8px 0 !important;
      line-height:1.2 !important;
    }

    #gbAuthModal .gb-tabs{ display:flex !important; gap:8px !important; flex-wrap:wrap !important; }
    #gbAuthModal .gb-tab{
      padding:8px 12px !important;
      border-radius:999px !important;
      border:1px solid #ddd !important;
      background:#fff !important;
      cursor:pointer !important;
      font-size:13px !important;
      line-height:1 !important;
    }
    #gbAuthModal .gb-tab.active{ border-color:#111 !important; }

    #gbAuthModal .gb-x{
      width:42px !important; height:42px !important;
      border-radius:12px !important;
      border:1px solid #ddd !important;
      background:#fff !important;
      cursor:pointer !important;
      font-size:16px !important;
      display:flex !important;
      align-items:center !important;
      justify-content:center !important;
    }

    #gbAuthModal .gb-body{ margin-top:14px !important; display:grid !important; gap:10px !important; }
    #gbAuthModal .gb-label{ font-size:12px !important; color:#555 !important; margin-top:2px !important; }

    #gbAuthModal .gb-input{
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
    #gbAuthModal .gb-input:focus{
      border-color:#111 !important;
      box-shadow:0 0 0 3px rgba(17,17,17,.10) !important;
    }

    #gbAuthModal .gb-btn{
      padding:12px 14px !important;
      border-radius:12px !important;
      cursor:pointer !important;
      font-size:16px !important;
    }
    #gbAuthModal .gb-btn-primary{
      border:none !important;
      background:#111 !important;
      color:#fff !important;
      width:100% !important;
    }

    #gbAuthModal .gb-msg{ font-size:12px !important; color:#b00020 !important; min-height:16px !important; }
    #gbAuthModal .gb-hint{ font-size:12px !important; color:#777 !important; }

    /* Profile dropdown */
    .gb-profile{ position:relative; display:inline-block; }
    .gb-menu{
      position:absolute; right:0; top:calc(100% + 8px);
      width:180px; background:#fff; border:1px solid #eee;
      border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.08);
      overflow:hidden; z-index:50;
    }
    .gb-menu-item{
      width:100%;
      text-align:left;
      padding:10px 12px;
      border:none;
      background:#fff;
      cursor:pointer;
      font-size:14px;
      display:block;
    }
    .gb-menu-item:hover{ background:#f6f6f6; }

    /* Make <a> look like menu item */
    .gb-menu-link{
      text-decoration:none;
      color:inherit;
    }

    @media (max-width:420px){
      #gbAuthModal .gb-card{ padding:14px !important; border-radius:16px !important; }
      #gbAuthModal .gb-title{ font-size:18px !important; }
      #gbAuthModal .gb-x{ width:40px !important; height:40px !important; }
    }
  `;
  document.head.appendChild(s);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
