// auth-ui.js (Username + Password modal, with Login/Signup, and profile dropdown)
// Uses Supabase email auth under the hood: username -> username@gbph.local

export function initAuthUI(supabase) {
  injectStyles();
  injectModal();

  async function refresh() {
    var profileArea = document.getElementById("profileArea");
    if (!profileArea) return;

    var res = await supabase.auth.getUser();
    var user = res && res.data ? res.data.user : null;

    if (!user) {
      profileArea.innerHTML = '<button id="btnProfileLogin" class="profileBtn">Login</button>';
      var b = document.getElementById("btnProfileLogin");
      if (b) b.onclick = function () { openAuth("login"); };
      return;
    }

    var username = emailToUsername(user.email || "");
    profileArea.innerHTML =
      '<div class="profileWrap">' +
        '<button id="profileBtn" class="profileBtn"></button>' +
        '<div id="profileMenu" class="profileMenu" style="display:none;">' +
          '<button id="logoutBtn" class="menuItem">Log out</button>' +
        '</div>' +
      '</div>';

    var btn = document.getElementById("profileBtn");
    if (btn) btn.textContent = username || "Profile";

    var menu = document.getElementById("profileMenu");
    if (btn && menu) {
      btn.onclick = function (e) {
        e.stopPropagation();
        menu.style.display = (menu.style.display === "none") ? "block" : "none";
      };
      document.addEventListener("click", function () {
        if (menu) menu.style.display = "none";
      });
    }

    var logout = document.getElementById("logoutBtn");
    if (logout) {
      logout.onclick = async function () {
        await supabase.auth.signOut();
        await refresh();
      };
    }
  }

  function openAuth(mode) {
    setMode(mode || "login");
    showModal(true);
  }

  async function ensureAuthed(options) {
    var force = options && options.force;
    var res = await supabase.auth.getUser();
    var user = res && res.data ? res.data.user : null;

    if (!user && force) {
      openAuth("login");
      return null;
    }
    return user || null;
  }

  // ---- Modal wiring ----
  var currentMode = "login";

  function setMode(mode) {
    currentMode = (mode === "signup") ? "signup" : "login";

    var tabLogin = document.getElementById("authTabLogin");
    var tabSignup = document.getElementById("authTabSignup");
    var submit = document.getElementById("authSubmit");
    var title = document.getElementById("authTitle");
    var msg = document.getElementById("authMsg");

    if (msg) msg.textContent = "";

    if (tabLogin) tabLogin.className = currentMode === "login" ? "authTab active" : "authTab";
    if (tabSignup) tabSignup.className = currentMode === "signup" ? "authTab active" : "authTab";

    if (submit) submit.textContent = currentMode === "login" ? "Login" : "Sign up";
    if (title) title.textContent = currentMode === "login" ? "Login" : "Create account";
  }

  function showModal(show) {
    var overlay = document.getElementById("authOverlay");
    var modal = document.getElementById("authModal");
    if (overlay) overlay.style.display = show ? "block" : "none";
    if (modal) modal.style.display = show ? "block" : "none";

    if (show) {
      var u = document.getElementById("authUsername");
      if (u) setTimeout(function(){ u.focus(); }, 50);
    }
  }

  async function submitAuth() {
    var u = document.getElementById("authUsername");
    var p = document.getElementById("authPassword");
    var msg = document.getElementById("authMsg");

    var username = (u && u.value ? u.value : "").trim();
    var password = (p && p.value ? p.value : "");

    if (!username || !password) {
      if (msg) msg.textContent = "Please enter username and password.";
      return;
    }

    var email = usernameToEmail(username);

    if (currentMode === "signup") {
      var out1 = await supabase.auth.signUp({ email: email, password: password });
      if (out1.error) {
        if (msg) msg.textContent = out1.error.message;
        return;
      }
      // Optional: store username in profiles (trigger already creates row)
      await upsertUsername(username);
      if (msg) msg.textContent = "Account created! You can login now.";
      setMode("login");
      return;
    }

    var out2 = await supabase.auth.signInWithPassword({ email: email, password: password });
    if (out2.error) {
      if (msg) msg.textContent = out2.error.message;
      return;
    }

    await upsertUsername(username);
    await refresh();
    showModal(false);
  }

  async function upsertUsername(username) {
    try {
      // This will work if your policies allow update own profile (you already have update policy)
      var userRes = await supabase.auth.getUser();
      var user = userRes && userRes.data ? userRes.data.user : null;
      if (!user) return;
      await supabase.from("profiles").update({ full_name: username }).eq("id", user.id);
    } catch (e) {}
  }

  function usernameToEmail(username) {
    // treat username as email local-part
    // remove spaces
    var clean = username.replace(/\s+/g, "");
    // if they typed an email anyway, keep it
    if (clean.indexOf("@") !== -1) return clean;
    return clean.toLowerCase() + "@gbph.local";
  }

  function emailToUsername(email) {
    if (!email) return "";
    var at = email.indexOf("@");
    if (at === -1) return email;
    return email.slice(0, at);
  }

  function injectModal() {
    if (document.getElementById("authModal")) return;

    var overlay = document.createElement("div");
    overlay.id = "authOverlay";
    overlay.className = "authOverlay";
    overlay.style.display = "none";

    var modal = document.createElement("div");
    modal.id = "authModal";
    modal.className = "authModal";
    modal.style.display = "none";

    var html =
      '<div class="authHeader">' +
        '<div>' +
          '<div id="authTitle" class="authTitle">Login</div>' +
          '<div class="authTabs">' +
            '<button id="authTabLogin" class="authTab active" type="button">Login</button>' +
            '<button id="authTabSignup" class="authTab" type="button">Sign up</button>' +
          '</div>' +
        '</div>' +
        '<button id="authClose" class="authClose" type="button">✕</button>' +
      '</div>' +
      '<div class="authBody">' +
        '<label class="authLabel">Username</label>' +
        '<input id="authUsername" class="authInput" placeholder="e.g. juan" />' +
        '<label class="authLabel">Password</label>' +
        '<input id="authPassword" class="authInput" type="password" placeholder="••••••••" />' +
        '<button id="authSubmit" class="authSubmit" type="button">Login</button>' +
        '<div id="authMsg" class="authMsg"></div>' +
      '</div>';

    modal.innerHTML = html;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    overlay.onclick = function(){ showModal(false); };

    var closeBtn = document.getElementById("authClose");
    if (closeBtn) closeBtn.onclick = function(){ showModal(false); };

    var tabLogin = document.getElementById("authTabLogin");
    var tabSignup = document.getElementById("authTabSignup");
    if (tabLogin) tabLogin.onclick = function(){ setMode("login"); };
    if (tabSignup) tabSignup.onclick = function(){ setMode("signup"); };

    var submitBtn = document.getElementById("authSubmit");
    if (submitBtn) submitBtn.onclick = submitAuth;

    var pass = document.getElementById("authPassword");
    if (pass) {
      pass.addEventListener("keydown", function(e){
        if (e.key === "Enter") submitAuth();
      });
    }
  }

  function injectStyles() {
    if (document.getElementById("authUiStyles")) return;
    var s = document.createElement("style");
    s.id = "authUiStyles";
    s.textContent =
      ".profileBtn{padding:10px 12px;border-radius:12px;border:1px solid #ddd;background:#fff;font-size:14px;cursor:pointer}" +
      ".profileWrap{position:relative;display:inline-block}" +
      ".profileMenu{position:absolute;right:0;margin-top:8px;width:160px;border:1px solid #eee;background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.08);overflow:hidden;z-index:50}" +
      ".menuItem{width:100%;text-align:left;padding:10px 12px;background:#fff;border:none;cursor:pointer;font-size:14px}" +
      ".menuItem:hover{background:#f6f6f6}" +
      ".authOverlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:100}" +
      ".authModal{position:fixed;left:50%;top:12vh;transform:translateX(-50%);width:min(520px,calc(100% - 24px));background:#fff;border-radius:16px;border:1px solid #eee;z-index:101;padding:14px}" +
      ".authHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}" +
      ".authTitle{font-weight:700;font-size:18px;margin-bottom:6px}" +
      ".authTabs{display:flex;gap:8px;flex-wrap:wrap}" +
      ".authTab{padding:8px 10px;border-radius:999px;border:1px solid #ddd;background:#fff;font-size:13px;cursor:pointer}" +
      ".authTab.active{border-color:#111}" +
      ".authClose{border:1px solid #ddd;background:#fff;border-radius:12px;width:40px;height:40px;cursor:pointer;font-size:16px}" +
      ".authBody{margin-top:12px;display:grid;gap:10px}" +
      ".authLabel{font-size:12px;color:#555}" +
      ".authInput{width:100%;padding:12px;border-radius:12px;border:1px solid #ddd;font-size:16px}" +
      ".authSubmit{width:100%;padding:12px;border-radius:12px;border:none;background:#111;color:#fff;cursor:pointer;font-size:16px}" +
      ".authMsg{font-size:12px;color:#444;min-height:16px}";
    document.head.appendChild(s);
  }

  return {
    refresh: refresh,
    openAuth: openAuth,
    ensureAuthed: ensureAuthed
  };
}

export async function requireAuth(supabase, authUI) {
  var res = await supabase.auth.getUser();
  var user = res && res.data ? res.data.user : null;
  if (user) return user;
  if (authUI && authUI.openAuth) authUI.openAuth("login");
  return null;
}
