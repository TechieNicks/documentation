// ============================================================
// TechieNicks — main.js
// Theme toggle (persisted) + mobile nav + terminal typing effect
// + scroll-reveal skill bars. No frameworks, no build step.
// ============================================================

(function () {
  "use strict";

  var root = document.documentElement;
  var STORAGE_KEY = "tn-theme";

  function getPreferredTheme() {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    var toggles = document.querySelectorAll(".theme-toggle");
    toggles.forEach(function (btn) {
      btn.setAttribute("aria-pressed", theme === "dark");
      btn.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
    });
  }

  // Apply as early as possible to avoid a flash of the wrong theme.
  applyTheme(getPreferredTheme());

  document.addEventListener("DOMContentLoaded", function () {
    // ---- Theme toggle ----
    document.querySelectorAll(".theme-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var current = root.getAttribute("data-theme");
        var next = current === "dark" ? "light" : "dark";
        applyTheme(next);
        localStorage.setItem(STORAGE_KEY, next);
      });
    });

    // ---- Mobile nav ----
    var navToggle = document.querySelector(".nav-toggle");
    var navLinks = document.querySelector(".nav-links");
    if (navToggle && navLinks) {
      navToggle.addEventListener("click", function () {
        var open = navLinks.classList.toggle("open");
        navToggle.setAttribute("aria-expanded", open);
      });
      navLinks.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function () { navLinks.classList.remove("open"); });
      });
    }

    // ---- Mark active nav link ----
    var current = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-links a[href]").forEach(function (a) {
      var href = a.getAttribute("href").split("/").pop();
      if (href === current) a.classList.add("active");
    });

    // ---- Terminal typing effect ----
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var typedEls = document.querySelectorAll("[data-typed]");
    typedEls.forEach(function (el, i) {
      var text = el.getAttribute("data-typed");
      if (reduceMotion) { el.textContent = text; return; }
      el.textContent = "";
      var delay = i * 650;
      setTimeout(function () {
        var idx = 0;
        var iv = setInterval(function () {
          el.textContent = text.slice(0, idx + 1);
          idx++;
          if (idx >= text.length) clearInterval(iv);
        }, 28);
      }, delay);
    });

    // ---- Skill bar reveal ----
    var bars = document.querySelectorAll(".skill-fill");
    if (bars.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var target = entry.target;
            target.style.width = target.getAttribute("data-level") + "%";
            io.unobserve(target);
          }
        });
      }, { threshold: 0.4 });
      bars.forEach(function (bar) { io.observe(bar); });
    }
  });
})();
