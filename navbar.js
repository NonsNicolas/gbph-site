// navbar.js
(function () {
  const burger = document.getElementById("gbBurger");
  const nav = document.getElementById("gbNav");

  if (!burger || !nav) return;

  function closeMenu() {
    nav.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
  }

  burger.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = nav.classList.toggle("open");
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  });

  // Close when clicking outside
  document.addEventListener("click", closeMenu);

  // Close when clicking a link
  nav.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", closeMenu);
  });

  // Highlight active link
  const path = location.pathname.split("/").pop() || "index.html";
  nav.querySelectorAll("a").forEach((a) => {
    const href = (a.getAttribute("href") || "").replace("./", "");
    if (href === path) {
      a.style.background = "#111";
      a.style.color = "#fff";
    }
  });
})();
