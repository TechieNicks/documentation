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

  var history = [];
  try {
    var saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) history = JSON.parse(saved);
  } catch (e) { history = []; }

  function saveHistory() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED_TURNS)));
    } catch (e) { /* storage unavailable, ignore */ }
  }

  function buildWidget() {
    var launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "tn-chat-launcher";
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-label", "Open site assistant chat");
    launcher.innerHTML =
      '<svg class="tn-chat-open-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>' +
      "</svg>" +
      '<svg class="tn-chat-close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M18 6L6 18M6 6l12 12"/>' +
      "</svg>";

    var panel = document.createElement("div");
    panel.className = "tn-chat-panel";
    panel.setAttribute("data-open", "false");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Site assistant chat");
    panel.innerHTML =
      '<div class="tn-chat-header">' +
      "<div><h4>TechieNicks Assistant</h4><p>Answers from this site's content</p></div>" +
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
