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
      '<div class="tn-chat-header-copy">' +
      '<h4>Chatbot</h4>' +
      '<div class="tn-chat-meta"><p>Answers from this site</p><span class="tn-chat-status is-live" id="tnChatStatus">Live</span></div>' +
      '</div>' +
      '</div>' +
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

    if (role === "assistant" || role === "bot") {
      var escaped = String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      var withLinks = escaped.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>');
      el.innerHTML = withLinks;
    } else {
      el.textContent = text;
    }

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

  function localFallbackAnswer(message) {
    var text = String(message || "").toLowerCase();

    if (/git.*github|github.*git|git\s+vs\s+github|github\s+vs\s+git|git\s+and\s+github/.test(text)) {
      return "Here is the Git vs GitHub section: https://techienicks.com/pages/Git.html#git-vs-github";
    }

    if (/git|branch|commit|merge|clone|push|pull/.test(text)) {
      return "Git is the version control tool; this site covers branching, commits, and workflow basics in the Git guide.";
    }

    if (/jira|atlassian|confluence|workflow|admin/.test(text)) {
      return "This site includes Jira, Confluence, and Atlassian admin guidance for working with workflows and collaboration tools.";
    }

    if (/rest|api|integration|webhook|http/.test(text)) {
      return "The REST API and integrations pages cover API usage patterns, connections, and practical examples for this site.";
    }

    if (/about|contact|who|you|techienicks/.test(text)) {
      return "This site is about Atlassian tools, Git, REST APIs, and practical documentation from TechieNicks.";
    }

    return "I can help with Git, Jira, Atlassian tools, REST APIs, and integrations covered on this site. Ask a more specific question.";
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
    var statusEl = panel.querySelector("#tnChatStatus");
    var opened = false;

    function setChatStatus(mode) {
      if (!statusEl) return;
      var isOffline = mode === "offline";
      statusEl.textContent = isOffline ? "Offline mode" : "Live";
      statusEl.classList.toggle("is-live", !isOffline);
      statusEl.classList.toggle("is-offline", isOffline);
    }

    setChatStatus("live");

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
          body: JSON.stringify({
            message: text,
            history: history.slice(0, -1),
            userId: activeUserId || "anonymous",
          }),
        });
        var data = await res.json();
        typingEl.remove();

        if (!res.ok) {
          setChatStatus("offline");
          var fallbackReply = localFallbackAnswer(text);
          renderMessage(messagesEl, "assistant", data.error ? fallbackReply : (data.answer || fallbackReply));
          history.push({ role: "assistant", content: data.error ? fallbackReply : (data.answer || fallbackReply) });
          saveHistory();
        } else {
          setChatStatus("live");
          renderMessage(messagesEl, "assistant", data.answer);
          history.push({ role: "assistant", content: data.answer });
          saveHistory();
        }
      } catch (err) {
        typingEl.remove();
        setChatStatus("offline");
        var offlineReply = localFallbackAnswer(text);
        renderMessage(messagesEl, "assistant", offlineReply);
        history.push({ role: "assistant", content: offlineReply });
        saveHistory();
      } finally {
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
      }
    });
  });
})();
