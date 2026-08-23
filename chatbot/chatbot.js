// ============================================================
// TechieNicks — chatbot.js
// Floating chat widget that asks questions against site content
// via the /.netlify/functions/chat serverless endpoint.
// Include AFTER css/chatbot.css. No frameworks.
// ============================================================

(function () {
  "use strict";

  var ENDPOINT = "/.netlify/functions/chat";
  var STORAGE_KEY = "tn-chat-history";
  var MAX_STORED_TURNS = 12;
  var activeUserId = null;

  var history = [];
  function storageKey() {
    return STORAGE_KEY + ":" + (activeUserId || "anonymous");
  }

  function loadHistory() {
    history = [];
    try {
      var saved = sessionStorage.getItem(storageKey());
      if (saved) history = JSON.parse(saved);
    } catch (e) { history = []; }
  }

  function normalizeUserId(userId) {
    if (userId && typeof userId === "object") userId = userId.id;
    return userId == null ? null : String(userId);
  }

  activeUserId = normalizeUserId(window.TN_CURRENT_USER_ID);
  loadHistory();

  function saveHistory() {
    try {
      sessionStorage.setItem(storageKey(), JSON.stringify(history.slice(-MAX_STORED_TURNS)));
    } catch (e) { /* storage unavailable, ignore */ }
  }

  function buildWidget() {
    var launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "tn-chat-launcher";
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-label", "Open Chatbot");
    launcher.innerHTML =
      '<img class="tn-chat-open-icon" src="/images/icons/robot.png" alt="">' +
      '<svg class="tn-chat-close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M18 6L6 18M6 6l12 12"/>' +
      "</svg>";

    var panel = document.createElement("div");
    panel.className = "tn-chat-panel";
    panel.setAttribute("data-open", "false");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Chatbot");
    panel.innerHTML =
      '<div class="tn-chat-header">' +
      '<img class="tn-chat-avatar" src="/images/icons/robot.png" alt="">' +
      "<div><h4>Chatbot</h4><p>Answers from this site's content</p>" +
      '<a href="https://www.flaticon.com/free-icons/robot" title="robot icons" target="_blank" rel="noopener noreferrer">Robot icons created by juicy_fish - Flaticon</a></div>' +
      "</div>" +
      '<div class="tn-chat-messages" id="tnChatMessages"></div>' +
      '<form class="tn-chat-form" id="tnChatForm">' +
      '<textarea class="tn-chat-input" id="tnChatInput" rows="1" placeholder="Ask about Git, Jira, REST APIs..." maxlength="800"></textarea>' +
      '<button type="submit" class="tn-chat-send" id="tnChatSend" aria-label="Send message">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>' +
      "</button>" +
      "</form>";

    document.body.appendChild(panel);
    document.body.appendChild(launcher);

    return { launcher: launcher, panel: panel };
  }

  function renderMessage(container, role, text) {
    var el = document.createElement("div");
    el.className = "tn-chat-msg " + (role === "user" ? "tn-user" : role === "error" ? "tn-error" : "tn-bot");
    el.textContent = text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    return el;
  }

  function renderTyping(container) {
    var el = document.createElement("div");
    el.className = "tn-chat-typing";
    el.innerHTML = "<span></span><span></span><span></span>";
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    return el;
  }

  function setUser(userId) {
    var nextUserId = normalizeUserId(userId);
    if (nextUserId === activeUserId) return;

    activeUserId = nextUserId;
    loadHistory();

    var messagesEl = document.querySelector("#tnChatMessages");
    if (messagesEl) {
      messagesEl.textContent = "";
      renderMessage(messagesEl, "assistant", "Hi! Ask me anything about Git, Jira, REST APIs, or Atlassian tools covered on this site.");
    }
  }

  window.TechieNicksChatbot = { setUser: setUser };
  window.addEventListener("tn:user-changed", function (event) {
    setUser(event.detail && event.detail.userId);
  });

  document.addEventListener("DOMContentLoaded", function () {
    var refs = buildWidget();
    var launcher = refs.launcher;
    var panel = refs.panel;
    var messagesEl = panel.querySelector("#tnChatMessages");
    var form = panel.querySelector("#tnChatForm");
    var input = panel.querySelector("#tnChatInput");
    var sendBtn = panel.querySelector("#tnChatSend");
    var opened = false;

    // Restore any prior conversation from this browser tab session
    history.forEach(function (m) {
      renderMessage(messagesEl, m.role, m.content);
    });
    if (history.length === 0) {
      renderMessage(messagesEl, "assistant", "Hi! Ask me anything about Git, Jira, REST APIs, or Atlassian tools covered on this site.");
    }

    launcher.addEventListener("click", function () {
      opened = !opened;
      launcher.setAttribute("aria-expanded", String(opened));
      panel.setAttribute("data-open", String(opened));
      if (opened) input.focus();
    });

    input.addEventListener("input", function () {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 80) + "px";
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text) return;

      renderMessage(messagesEl, "user", text);
      history.push({ role: "user", content: text });
      saveHistory();

      input.value = "";
      input.style.height = "auto";
      input.disabled = true;
      sendBtn.disabled = true;

      var typingEl = renderTyping(messagesEl);

      try {
        var res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
        });
        var data = await res.json();
        typingEl.remove();

        if (!res.ok) {
          renderMessage(messagesEl, "error", data.error || "Something went wrong. Please try again.");
        } else {
          renderMessage(messagesEl, "assistant", data.answer);
          history.push({ role: "assistant", content: data.answer });
          saveHistory();
        }
      } catch (err) {
        typingEl.remove();
        renderMessage(messagesEl, "error", "Couldn't reach the assistant. Check your connection and try again.");
      } finally {
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
      }
    });
  });
})();
