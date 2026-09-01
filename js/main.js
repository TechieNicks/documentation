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

    // ---- Copy-code buttons for code blocks ----
    document.querySelectorAll(".doc-content pre").forEach(function (pre) {
      if (pre.querySelector(".copy-code-btn")) return;
      var codeEl = pre.querySelector("code") || pre;

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-code-btn";
      btn.textContent = "Copy Code";
      btn.setAttribute("aria-label", "Copy code block to clipboard");

      btn.addEventListener("click", function () {
        var text = codeEl.textContent;
        var showCopied = function () {
          btn.textContent = "Copied!";
          btn.classList.add("copied");
          setTimeout(function () {
            btn.textContent = "Copy Code";
            btn.classList.remove("copied");
          }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(showCopied).catch(function () {
            fallbackCopy(text, showCopied);
          });
        } else {
          fallbackCopy(text, showCopied);
        }
      });

      pre.appendChild(btn);
    });

    // ---- Manual Git vs GitHub diagram slideshow ----
    document.querySelectorAll("[data-slideshow]").forEach(function (slideshow) {
      var slides = Array.from(slideshow.querySelectorAll(".git-vs-github-slide"));
      var dots = Array.from(slideshow.querySelectorAll(".git-vs-github-dots button"));
      var currentSlide = 0;

      function showSlide(index) {
        currentSlide = (index + slides.length) % slides.length;
        slides.forEach(function (slide, slideIndex) {
          var active = slideIndex === currentSlide;
          slide.hidden = !active;
          slide.classList.toggle("is-active", active);
        });
        dots.forEach(function (dot, dotIndex) {
          var active = dotIndex === currentSlide;
          dot.classList.toggle("is-active", active);
          if (active) dot.setAttribute("aria-current", "true");
          else dot.removeAttribute("aria-current");
        });
      }

      slideshow.querySelector(".git-vs-github-prev").addEventListener("click", function () {
        showSlide(currentSlide - 1);
      });
      slideshow.querySelector(".git-vs-github-next").addEventListener("click", function () {
        showSlide(currentSlide + 1);
      });
      dots.forEach(function (dot, dotIndex) {
        dot.addEventListener("click", function () { showSlide(dotIndex); });
      });
    });

    var diagramModal = document.getElementById("git-diagram-lightbox");
    if (!diagramModal) {
      diagramModal = document.createElement("div");
      diagramModal.id = "git-diagram-lightbox";
      diagramModal.className = "git-diagram-lightbox";
      diagramModal.setAttribute("role", "dialog");
      diagramModal.setAttribute("aria-modal", "true");
      diagramModal.setAttribute("aria-label", "Git diagram preview");
      diagramModal.innerHTML = '<div class="git-diagram-lightbox__content"><button type="button" class="git-diagram-lightbox__close" aria-label="Close diagram preview">×</button><img class="git-diagram-lightbox__image" src="" alt=""><p class="git-diagram-lightbox__caption"></p></div>';
      document.body.appendChild(diagramModal);

      diagramModal.querySelector(".git-diagram-lightbox__close").addEventListener("click", function () {
        diagramModal.classList.remove("is-open");
        document.body.classList.remove("modal-open");
      });

      diagramModal.addEventListener("click", function (event) {
        if (event.target === diagramModal) {
          diagramModal.classList.remove("is-open");
          document.body.classList.remove("modal-open");
        }
      });

      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && diagramModal.classList.contains("is-open")) {
          diagramModal.classList.remove("is-open");
          document.body.classList.remove("modal-open");
        }
      });
    }

    document.querySelectorAll(".git-vs-github-slide img").forEach(function (img) {
      img.setAttribute("tabindex", "0");
      img.style.cursor = "pointer";

      function openDiagramModal() {
        var lightboxImage = diagramModal.querySelector(".git-diagram-lightbox__image");
        var lightboxCaption = diagramModal.querySelector(".git-diagram-lightbox__caption");

        lightboxImage.src = img.src;
        lightboxImage.alt = img.alt || "Git diagram preview";
        lightboxCaption.textContent = "";
        diagramModal.classList.add("is-open");
        document.body.classList.add("modal-open");
      }

      img.addEventListener("click", openDiagramModal);
      img.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDiagramModal();
        }
      });
    });

    // ---- YouTube video preview (click-to-load facade, no iframe until played) ----
    var DEFAULT_YT_ID = "1k-ZgZlx-sA"; // https://www.youtube.com/watch?v=1k-ZgZlx-sA
    document.querySelectorAll(".youtube-embed").forEach(function (el) {
      var id = el.getAttribute("data-video-id") || extractYouTubeId(el.getAttribute("data-video-url")) || DEFAULT_YT_ID;
      var title = el.getAttribute("data-title") || "YouTube video preview";

      var playBtn = document.createElement("button");
      playBtn.type = "button";
      playBtn.className = "youtube-embed__play";
      playBtn.setAttribute("aria-label", "Play " + title);

      var thumb = document.createElement("img");
      thumb.className = "youtube-embed__thumb";
      thumb.src = "https://img.youtube.com/vi/" + id + "/hqdefault.jpg";
      thumb.alt = title;
      thumb.loading = "lazy";

      var icon = document.createElement("span");
      icon.className = "youtube-embed__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML =
        '<svg viewBox="0 0 68 48">' +
        '<path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.63-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#f00"></path>' +
        '<path d="M45 24 27 14v20" fill="#fff"></path>' +
        "</svg>";

      playBtn.appendChild(thumb);
      playBtn.appendChild(icon);

      playBtn.addEventListener("click", function () {
        var iframe = document.createElement("iframe");
        var embedOrigin = window.location.origin;
        iframe.src = "https://www.youtube-nocookie.com/embed/" + id +
          "?autoplay=1&rel=0&origin=" + encodeURIComponent(embedOrigin) +
          "&widget_referrer=" + encodeURIComponent(window.location.href);
        iframe.title = title;
        iframe.setAttribute("frameborder", "0");
        iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
        iframe.setAttribute("referrerpolicy", "origin");
        iframe.setAttribute("allowfullscreen", "");
        el.innerHTML = "";
        el.appendChild(iframe);
      });

      el.innerHTML = "";
      el.appendChild(playBtn);
    });

    // ---- Site-wide feedback modal ----
    var feedbackButton = document.createElement("button");
    feedbackButton.type = "button";
    feedbackButton.className = "feedback-trigger";
    feedbackButton.textContent = "Feedback";
    feedbackButton.setAttribute("aria-haspopup", "dialog");
    feedbackButton.setAttribute("aria-controls", "feedback-dialog");

    var feedbackDialog = document.createElement("div");
    feedbackDialog.className = "feedback-dialog";
    feedbackDialog.id = "feedback-dialog";
    feedbackDialog.setAttribute("role", "dialog");
    feedbackDialog.setAttribute("aria-modal", "true");
    feedbackDialog.setAttribute("aria-labelledby", "feedback-title");
    feedbackDialog.hidden = true;
    feedbackDialog.innerHTML = '<div class="feedback-panel">' +
      '<button type="button" class="feedback-close" aria-label="Close feedback form">&times;</button>' +
      '<span class="eyebrow">// feedback</span>' +
      '<h2 id="feedback-title">Help shape what comes next.</h2>' +
      '<p>Was something useful, unclear, or missing? A quick note helps improve the guides and tutorials.</p>' +
      '<form class="form-grid" name="feedback-modal" method="POST" action="/thank-you.html" data-netlify="true" netlify-honeypot="feedback-bot-field">' +
      '<input type="hidden" name="form-name" value="feedback">' +
      '<input type="hidden" name="submission-form" value="feedback">' +
      '<input type="hidden" name="submission-date-time" value="">' +
      '<p class="hidden" style="display:none;"><label>Don\'t fill this out if you\'re human: <input name="feedback-bot-field"></label></p>' +
      '<div><label for="feedback-rating">How was your experience?</label><div class="feedback-rating" id="feedback-rating">' +
      '<label><input type="radio" name="rating" value="excellent"> Excellent</label>' +
      '<label><input type="radio" name="rating" value="good"> Good</label>' +
      '<label><input type="radio" name="rating" value="needs-improvement"> Needs improvement</label>' +
      '</div></div>' +
      '<div><label for="feedback-message">Your feedback</label><textarea id="feedback-message" name="feedback" rows="5" required></textarea></div>' +
      '<div><label for="feedback-email">Email <span class="form-note">(optional, for a reply)</span></label><input type="email" id="feedback-email" name="email"></div>' +
      '<button type="submit" class="btn btn-primary">Send feedback</button>' +
      '</form></div>';

    document.body.appendChild(feedbackButton);
    document.body.appendChild(feedbackDialog);
    var closeFeedback = function () {
      feedbackDialog.hidden = true;
      feedbackButton.focus();
    };
    feedbackButton.addEventListener("click", function () {
      feedbackDialog.hidden = false;
      feedbackDialog.querySelector("textarea").focus();
    });
    feedbackDialog.querySelector(".feedback-close").addEventListener("click", closeFeedback);
    feedbackDialog.addEventListener("click", function (event) {
      if (event.target === feedbackDialog) closeFeedback();
    });
    feedbackDialog.querySelector("form").addEventListener("submit", function (event) {
      event.target.querySelector("[name=\"submission-date-time\"]").value = new Date().toISOString();
      if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
      event.preventDefault();
      var form = event.target;
      var notice = form.querySelector(".feedback-notice");
      if (!notice) {
        notice = document.createElement("p");
        notice.className = "feedback-notice";
        form.appendChild(notice);
      }
      notice.textContent = "Thanks for the feedback. It was captured for this local preview.";
      form.reset();
    });
    document.querySelectorAll("form[name=\"contact\"]").forEach(function (form) {
      form.addEventListener("submit", function () {
        form.querySelector("[name=\"submission-date-time\"]").value = new Date().toISOString();
      });
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !feedbackDialog.hidden) closeFeedback();
    });
  });

  function extractYouTubeId(url) {
    if (!url) return null;
    var match = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/)([\w-]{11})/);
    return match ? match[1] : null;
  }

  function fallbackCopy(text, cb) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* no-op */ }
    document.body.removeChild(ta);
    if (cb) cb();
  }
})();
