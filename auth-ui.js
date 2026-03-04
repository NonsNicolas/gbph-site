// auth-ui.js (safe version: no backticks/template literals)
import { initHeaderAuth } from "./app-init.js";
await initHeaderAuth();

export function initAuthUI(supabase) {
  ensureProfileArea();

  async function refresh() {
    var profileArea = document.getElementById("profileArea");
    if (!profileArea) return;

    var res = await supabase.auth.getUser();
    var user = res && res.data ? res.data.user : null;

    if (!user) {
      profileArea.innerHTML = '<button id="btnProfileLogin" class="profileBtn">Login</button>';
      var b = document.getElementById("btnProfileLogin");
      if (b) b.onclick = function () { openLoginPrompt(supabase, refresh); };
      return;
    }

    var email = user.email || "Profile";
    profileArea.innerHTML =
      '<div class="profileWrap">' +
        '<button id="profileBtn" class="profileBtn"></button>' +
        '<div id="profileMenu" class="profileMenu" style="display:none;">' +
          '<button id="logoutBtn" class="menuItem">Log out</button>' +
        '</div>' +
      '</div>';

    var btn = document.getElementById("profileBtn");
    if (btn) btn.textContent = email;

    var menu = document.getElementById("profileMenu");
    if (btn && menu) {
      btn.onclick = function (e) {
        e.stopPropagation();
        menu.style.display = (menu.style.display === "none") ? "block" : "none";
      };
      document.addEventListener("click", function () {
        menu.style.display = "none";
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

  return { refresh: refresh };
}

export async function requireAuth(supabase, authUI) {
  var res = await supabase.auth.getUser();
  var user = res && res.data ? res.data.user : null;
  if (user) return user;

  // Simple popup login prompt (works on GitHub Pages)
  await openLoginPrompt(supabase, authUI.refresh);
  res = await supabase.auth.getUser();
  return res && res.data ? res.data.user : null;
}

function ensureProfileArea() {
  // If the page doesn't have profileArea, do nothing (safe)
}

async function openLoginPrompt(supabase, onSuccessRefresh) {
  var email = window.prompt("Email:");
  if (!email) return;
  var password = window.prompt("Password:");
  if (!password) return;

  var out = await supabase.auth.signInWithPassword({ email: email, password: password });
  if (out.error) {
    window.alert(out.error.message);
    return;
  }
  if (typeof onSuccessRefresh === "function") await onSuccessRefresh();
}
