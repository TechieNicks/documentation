(function () {
    "use strict";

    var page = window.location.pathname.replace(/^\//, "") || "index.html";
    var likeKey = "tn-liked:" + page;
    var sessionKey = "tn-viewed:" + page;
    var widget;

    function request(action) {
        return fetch("/.netlify/functions/engagement", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ page: page, action: action }),
        }).then(function (response) {
            if (!response.ok) throw new Error("Engagement request failed");
            return response.json();
        });
    }

    function setValues(data) {
        if (!widget) return;
        widget.querySelector("[data-view-count]").textContent = Number(data.views || 0).toLocaleString();
        widget.querySelector("[data-like-count]").textContent = Number(data.likes || 0).toLocaleString();
    }

    function setLiked(liked) {
        if (!widget) return;
        var button = widget.querySelector("[data-like]");
        button.setAttribute("aria-pressed", liked);
        button.classList.toggle("is-liked", liked);
        button.querySelector(".engagement-like-label").textContent = liked ? "Liked" : "Like";
    }

    function localFallback() {
        setValues({ views: Number(localStorage.getItem("tn-views:" + page) || 0), likes: Number(localStorage.getItem("tn-likes:" + page) || 0) });
    }

    function init() {
        var footer = document.querySelector(".site-footer");
        if (!footer) return;
        widget = document.querySelector("[data-engagement]");
        if (!widget) {
            widget = document.createElement("section");
            widget.className = "engagement";
            widget.setAttribute("data-engagement", "true");
            footer.parentNode.insertBefore(widget, footer);
        }
        widget.innerHTML = '<div class="engagement-inner">' +
            '<div class="engagement-stats" aria-label="Page engagement statistics">' +
            '<span class="engagement-stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><span data-view-count>0</span> views</span>' +
            '<span class="engagement-stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.8 8.8c0 5.4-8.8 10.2-8.8 10.2S3.2 14.2 3.2 8.8A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.7Z"/></svg><span data-like-count>0</span> likes</span>' +
            '</div><div class="engagement-actions">' +
            '<button class="engagement-button" type="button" data-like aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.8 8.8c0 5.4-8.8 10.2-8.8 10.2S3.2 14.2 3.2 8.8A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.7Z"/></svg><span class="engagement-like-label">Like</span></button>' +
            '<button class="engagement-button" type="button" data-share><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 13.5 6.6 4M15.3 6.5l-6.6 4"/></svg><span data-share-label>Share</span></button>' +
            '</div></div>';

        var liked = localStorage.getItem(likeKey) === "true";
        setLiked(liked);
        widget.querySelector("[data-share]").addEventListener("click", function () {
            var shareData = { title: document.title, text: "Have a look at " + document.title, url: window.location.href };
            if (navigator.share) {
                navigator.share(shareData).catch(function () { });
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(window.location.href).then(function () {
                    widget.querySelector("[data-share-label]").textContent = "Link copied";
                    setTimeout(function () { widget.querySelector("[data-share-label]").textContent = "Share"; }, 1800);
                });
            }
        });
        widget.querySelector("[data-like]").addEventListener("click", function () {
            var nextLiked = !localStorage.getItem(likeKey) || localStorage.getItem(likeKey) !== "true";
            localStorage.setItem(likeKey, nextLiked);
            setLiked(nextLiked);
            request(nextLiked ? "like" : "unlike").then(setValues).catch(localFallback);
        });

        var shouldCountView = !sessionStorage.getItem(sessionKey);
        if (shouldCountView) sessionStorage.setItem(sessionKey, "true");
        request(shouldCountView ? "view" : "get").then(setValues).catch(function () {
            if (shouldCountView) localStorage.setItem("tn-views:" + page, Number(localStorage.getItem("tn-views:" + page) || 0) + 1);
            localFallback();
        });
    }

    document.addEventListener("DOMContentLoaded", init);
})();
