export function initAuthUI(supabase) {

  const profileArea = document.getElementById("profileArea");

  async function refresh() {

    const { data: { user } } = await supabase.auth.getUser();

    if (!profileArea) return;

    if (!user) {
      profileArea.innerHTML = `
        <button id="loginBtn">Login</button>
      `;

      document.getElementById("loginBtn").onclick = showLogin;

    } else {
      profileArea.innerHTML = `
        <div style="position:relative;">
          <button id="profileBtn">${user.email}</button>
          <div id="dropdown" style="display:none;position:absolute;background:white;border:1px solid #ddd;padding:10px;">
            <button id="logoutBtn">Logout</button>
          </div>
        </div>
      `;

      const btn = document.getElementById("profileBtn");
      const menu = document.getElementById("dropdown");

      btn.onclick = () => {
        menu.style.display = menu.style.display === "none" ? "block" : "none";
      };

      document.getElementById("logoutBtn").onclick = async () => {
        await supabase.auth.signOut();
        refresh();
      };
    }
  }

  function showLogin() {

    const email = prompt("Email");
    const password = prompt("Password");

    if (!email || !password) return;

    supabase.auth.signInWithPassword({ email, password })
      .then(({ error }) => {
        if (error) alert(error.message);
        else refresh();
      });
  }

  return { refresh };
}

export async function requireAuth(supabase, authUI) {

  const { data: { user } } = await supabase.auth.getUser();

  if (user) return user;

  const email = prompt("Email");
  const password = prompt("Password");

  if (!email || !password) return null;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    alert(error.message);
    return null;
  }

  await authUI.refresh();

  return data.user;
}
