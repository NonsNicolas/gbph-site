// auth-ui.js (shared popup login + profile dropdown)
// Usage in a page script:
//   import { createClient } from "...supabase...";
//   import { initAuthUI, requireAuth } from "./auth-ui.js";
//   const supabase = createClient(...);
//   const auth = initAuthUI(supabase);
//   await auth.refresh();  // updates header UI
//   await requireAuth(supabase, auth); // opens modal if not logged in

export function initAuthUI(supabase) {
  injectAuthModalIfMissing();
  const modal = document.getElementById("authModal");
  const overlay = document.getElementById("authOverlay");
  const closeBtn = document.getElementById("authClose");
  const tabLogin = document.getElementById("tabLogin");
  const tabSignup = document.getElementById("tabSignup");
  const emailEl = document.getElementById("authEmail");
  const passEl = document.getElementById("authPassword");
  const msgEl = document.getElementById("authMsg");
  const submitBtn = document.getElementById("authSubmit");

  let mode = "login"; // or "signup"

  function open(modeWanted = "login") {
    mode = modeWanted;
    msgEl.textContent = "";
    setModeUI();
    overlay.style.display = "block";
    modal.style.display = "block";
    setTimeout(() => emailEl?.focus(), 50);
  }

  function close() {
    overlay.style.display = "none";
    modal.style.display = "none";
  }

  function setModeUI() {
    const loginActive = mode === "login";
    tabLogin.classList.toggle("active", loginActive);
    tabSignup.classList.toggle("active", !loginActive);
    submitBtn.textContent = loginActive ? "Login" : "Sign up";
  }

  async function submit() {
    msgEl.textContent = "";
    const email = (emailEl.value || "").trim();
    const password = passEl.value || "";
    if (!email || !password) {
      msgEl.textContent = "Please enter email and password.";
      return;
    }

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      msgEl.textContent = error ? error.message : "Signed up! You can login now.";
      if (!error) {
        mode = "login";
        setModeUI();
      }
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    msgEl.textContent = error ? error.message : "Logged in ✅";
    if (!error) {
      await refreshHeader();
      close();
    }
  }

  // header profile dropdown
  async function refreshHeader() {
    const area = document.getElementById("profileArea");
    if (!area) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      area.innerHTML = `
        <button id="btnOpenAuth" class="profileBtn">Login</button>
      `;
      document.getElementById("btnOpenAuth")?.addEventListener("click", () => open("login"));
      return;
    }

    const email = user.email || "Account";
    area.innerHTML = `
      <div class="profileWrap">
        <button id="profileBtn" class="profileBtn">${escapeHtml(email)}</button>
        <div id="profileMenu" class="profileMenu" style="display:none;">
          <button id="logoutBtn" class="menuItem">Log out</button>
        </div>
      </div>
    `;

    const btn = document.getElementById("profileBtn");
    const menu = document.getElementById("profileMenu");
    btn?.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.style.display = (menu.style.display === "none") ? "block" : "none";
    });
    document.addEventListener("click", () => { if (menu) menu.style.display = "none"; });

    document.getElementById("logoutBtn")?.addEventListener("click", async () => {
      await supabase.auth.signOut();
      await refreshHeader();
    });
  }

  // events
  overlay.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  tabLogin.addEventListener("click", () => { mode = "login"; msgEl.textContent = ""; setModeUI(); });
  tabSignup.addEventListener("click", () => { mode = "signup"; msgEl.textContent = ""; setModeUI(); });
  submitBtn.addEventListener("click", submit);

  // allow Enter key
  passEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[c]));
  }

  function injectAuthModalIfMissing() {
    if (document.getElementById("authModal")) return;

    const overlay = document.createElement("div");
    overlay.id = "authOverlay";
    overlay.className = "authOverlay";
    overlay.style.display = "none";

    const modal = document.createElement("div");
    modal.id = "authModal";
    modal.className = "authModal";
    modal.style.display = "none";
    modal.innerHTML = `
      <div class="authHeader">
        <div class="authTabs">
          <button id="tabLogin" class="authTab active">Login</button>
          <button id="tabSignup" class="authTab">Sign up</button>
        </div>
        <button id="authClose" class="authClose" aria-label="Close">✕</button>
      </div>

      <div class="authBody">
        <input id="authEmail" class="authInput" placeholder="Email" />
        <input id="authPassword" class="authInput" type="password" placeholder="Password" />
        <button id="authSubmit" class="authSubmit">Login</button>
        <div id="authMsg" class="authMsg"></div>
        <div class="authHint">Tip: If Supabase requires email confirmation, disable it for testing.</div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);
  }

  return {
    open,
    close,
    refresh: refreshHeader,
  };
}

// Call this before booking actions
export async function requireAuth(supabase, authUI) {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return user;
  authUI.open("login");
  return null;
}
