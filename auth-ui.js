// auth-ui.js — Username-only UI (uses Supabase email auth underneath)

export function initAuthUI(supabase) {
  injectAuthStyles();
  injectAuthModal();

  async function refresh() {
    const profileArea = document.getElementById("profileArea");
    if (!profileArea) return;

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      profileArea.innerHTML =
        `<button id="btnOpenAuth" class="gb-btn gb-btn-ghost">Login</button>`;

      const b = document.getElementById("btnOpenAuth");
      if (b) b.onclick = () => open("login");
      return;
    }

    const username = emailToUsername(user.email || "");

    profileArea.innerHTML = `
      <div class="gb-profile">
        <button id="gbProfileBtn" class="gb-btn gb-btn-ghost">
          ${escapeHtml(username || "Profile")}
        </button>

        <div id="gbProfileMenu" class="gb-menu" style="display:none;">
          <a href="./my.html" class="gb-menu-item gb-menu-link">My Reservations</a>
          <button id="gbLogoutBtn" class="gb-menu-item">Log out</button>
        </div>
      </div>
    `;

    const btn = document.getElementById("gbProfileBtn");
    const menu = document.getElementById("gbProfileMenu");

    btn.onclick = (e) => {
      e.stopPropagation();
      menu.style.display = menu.style.display === "none" ? "block" : "none";
    };

    document.addEventListener("click", () => {
      menu.style.display = "none";
    });

    document.getElementById("gbLogoutBtn").onclick = async () => {
      await supabase.auth.signOut();
      await refresh();
    };
  }

  let mode = "login";

  function open(nextMode = "login") {
    mode = nextMode;
    setModeUI();

    const overlay = document.getElementById("gbAuthOverlay");
    const modal = document.getElementById("gbAuthModal");

    overlay.style.display = "block";
    modal.style.display = "flex";

    document.body.style.overflow = "hidden";

    setTimeout(() => {
      document.getElementById("gbUsername")?.focus();
    }, 100);
  }

  function close() {
    document.getElementById("gbAuthOverlay").style.display = "none";
    document.getElementById("gbAuthModal").style.display = "none";
    document.body.style.overflow = "";
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
    const clean = (username || "").trim().toLowerCase();

    if (!/^[a-z0-9._-]{3,20}$/.test(clean)) return null;

    return `${clean}@gbph.app`;
  }

  function emailToUsername(email) {
    if (!email) return "";
    return email.split("@")[0];
  }

  async function submit() {
    setMessage("");

    const username = document.getElementById("gbUsername").value;
    const password = document.getElementById("gbPassword").value;

    if (!username || !password) {
      setMessage("Please enter username and password.");
      return;
    }

    const email = usernameToEmail(username);

    if (!email) {
      setMessage("Username must be 3–20 characters.");
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

      setMessage("Account created. Login now.");
      mode = "login";
      setModeUI();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

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

    document.getElementById("gbTabLogin").onclick = () => {
      mode = "login";
      setModeUI();
    };

    document.getElementById("gbTabSignup").onclick = () => {
      mode = "signup";
      setModeUI();
    };

    document.getElementById("gbSubmit").onclick = submit;

    document
      .getElementById("gbPassword")
      .addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
  }

  bind();

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
            <button id="gbTabLogin" class="gb-tab active">Login</button>
            <button id="gbTabSignup" class="gb-tab">Sign up</button>
          </div>
        </div>

        <button id="gbClose" class="gb-x">✕</button>
      </div>

      <div class="gb-body">
        <label class="gb-label">Username</label>
        <input id="gbUsername" class="gb-input" placeholder="e.g. juan">

        <label class="gb-label">Password</label>
        <input id="gbPassword" type="password" class="gb-input">

        <button id="gbSubmit" class="gb-btn gb-btn-primary">Login</button>

        <div id="gbAuthMsg" class="gb-msg"></div>
        <div class="gb-hint">Username is only for this site.</div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(modal);

  modal.addEventListener("click", (e) => e.stopPropagation());
}

function injectAuthStyles() {
  if (document.getElementById("gbAuthStyles")) return;

  const s = document.createElement("style");
  s.id = "gbAuthStyles";

  s.textContent = `
#gbAuthOverlay{
 position:fixed;
 inset:0;
 background:rgba(0,0,0,.45);
 z-index:9999;
}

#gbAuthModal{
 position:fixed;
 inset:0;
 display:flex;
 align-items:center;
 justify-content:center;
 padding:16px;
 z-index:10000;
 pointer-events:none;
}

#gbAuthModal .gb-card{
 pointer-events:auto;
 width:min(520px,100%);
 background:#fff;
 border-radius:18px;
 border:1px solid #eee;
 box-shadow:0 20px 60px rgba(0,0,0,.18);
 padding:16px;
}

.gb-title{
 font-size:20px;
 font-weight:800;
}

.gb-tabs{
 display:flex;
 gap:8px;
 margin-top:6px;
}

.gb-tab{
 padding:8px 12px;
 border-radius:999px;
 border:1px solid #ddd;
 background:#fff;
 cursor:pointer;
 color:#111;
}

.gb-tab.active{
 border-color:#111;
}

.gb-x{
 width:40px;
 height:40px;
 border-radius:10px;
 border:1px solid #ddd;
 background:#fff;
 cursor:pointer;
 color:#111;
}

.gb-body{
 margin-top:14px;
 display:grid;
 gap:10px;
}

.gb-input{
 width:100%;
 padding:12px;
 border-radius:10px;
 border:1px solid #ddd;
 font-size:16px;
}

.gb-btn-primary{
 background:#111;
 color:#fff;
 border:none;
 padding:12px;
 border-radius:12px;
 cursor:pointer;
}

.gb-profile{position:relative}

.gb-menu{
 position:absolute;
 right:0;
 top:40px;
 width:180px;
 background:#fff;
 border:1px solid #eee;
 border-radius:12px;
 box-shadow:0 10px 30px rgba(0,0,0,.08);
}

.gb-menu-item{
 display:block;
 width:100%;
 padding:10px 12px;
 background:#fff;
 border:none;
 text-align:left;
 cursor:pointer;
}

.gb-menu-item:hover{
 background:#f6f6f6;
}

.gb-menu-link{
 text-decoration:none;
 color:inherit;
}
`;

  document.head.appendChild(s);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[c]));
}
