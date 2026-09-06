(function () {
    "use strict";

    var entries = [
        {
            title: "Git reference guide",
            description: "Version control basics, the Git lifecycle, configuration, branching, GitHub, and everyday commands.",
            topics: "git version control github branching merging conflicts rebase stash tags ssh remote repository pull push commit",
            url: "pages/Git.html"
        },
        {
            title: "Atlassian Org admin",
            description: "A step-by-step guide for Atlassian organization administrators.",
            topics: "atlassian organization administration cloud users groups permissions",
            url: "pages/AtlassianOrg.html"
        },
        {
            title: "Atlassian Jira",
            description: "Jira configurations, use cases, and automations.",
            topics: "atlassian jira configuration workflow automation projects issues administration",
            url: "pages/AtlassianJira.html"
        },
        {
            title: "Atlassian Confluence",
            description: "Confluence features and macros.",
            topics: "atlassian confluence features macros pages spaces documentation",
            url: "pages/Confluence.html"
        },
        {
            title: "Atlassian REST API",
            description: "REST API concepts, requests, and practical Atlassian integration references.",
            topics: "atlassian rest api http requests authentication postman integration",
            url: "pages/REST.html"
        },
        {
            title: "Tool Integrations",
            description: "Guidance for integrating Atlassian with other tools.",
            topics: "integrations atlassian aws tools connections webhooks automation",
            url: "pages/Integrations.html"
        },
        { title: "What is version control?", description: "Track changes, collaborate, restore earlier versions, and use branching and merging.", topics: "git history collaboration backup recovery branching merging", url: "pages/Git.html#history" },
        { title: "What is Git?", description: "Git is a distributed version control system for tracking changes and managing project versions.", topics: "git distributed version control performance security history", url: "pages/Git.html#what-is-git" },
        { title: "Git vs GitHub", description: "Git runs locally for version control; GitHub hosts repositories and adds collaboration tools.", topics: "git github repository hosting pull requests issue tracking collaboration", url: "pages/Git.html#git-vs-github" },
        { title: "Git lifecycle", description: "Understand the workspace, staging area, local repository, and upstream remote repository.", topics: "git lifecycle working directory workspace index staging local repository remote upstream", url: "pages/Git.html#git-lifecycle" },
        { title: "Git installation", description: "Download Git and prepare it for use on your system.", topics: "git download install windows macos linux", url: "pages/Git.html#download" },
        { title: "Git configuration", description: "Generate SSH keys, configure Git, and connect to GitHub.", topics: "git configuration ssh key ssh-agent github authentication", url: "pages/Git.html#configuration" },
        { title: "Connecting to a remote repository", description: "Add a remote repository and push local code to GitHub.", topics: "git remote origin push github repository", url: "pages/Git.html#use-cases" },
        { title: "Syncing local changes to the remote", description: "Keep local and remote repositories synchronized.", topics: "git pull fetch push sync remote github", url: "pages/Git.html#use-cases" }
    ];

    var input = document.getElementById("docSearchInput");
    var form = document.getElementById("docSearchForm");
    var results = document.getElementById("searchResults");
    var status = document.getElementById("docSearchStatus");
    if (!input || !form || !results || !status) return;

    function normalize(value) {
        return String(value || "").toLowerCase().trim();
    }

    function render(items, query) {
        results.textContent = "";
        if (!query) {
            status.textContent = "";
            return;
        }

        status.textContent = items.length + " result" + (items.length === 1 ? "" : "s") + " for \"" + query + "\".";

        if (!items.length) {
            var empty = document.createElement("p");
            empty.className = "search-empty";
            empty.textContent = "No matching documentation yet. Try a broader term such as Git, Jira, or API.";
            results.appendChild(empty);
            return;
        }

        items.forEach(function (item) {
            var article = document.createElement("article");
            article.className = "search-result card";

            var title = document.createElement("h2");
            var link = document.createElement("a");
            link.href = item.url;
            link.textContent = item.title;
            title.appendChild(link);

            var description = document.createElement("p");
            description.textContent = item.description;

            var open = document.createElement("a");
            open.className = "card-link";
            open.href = item.url;
            open.textContent = "Open guide";
            open.setAttribute("aria-label", "Open " + item.title);

            article.appendChild(title);
            article.appendChild(description);
            article.appendChild(open);
            results.appendChild(article);
        });
    }

    function search(query) {
        var normalizedQuery = normalize(query);
        if (!normalizedQuery) return entries;
        var words = normalizedQuery.split(/\s+/).filter(Boolean);
        return entries.map(function (entry) {
            var searchable = normalize(entry.title + " " + entry.description + " " + entry.topics);
            var score = words.reduce(function (total, word) {
                return total + (searchable.indexOf(word) !== -1 ? 1 : 0);
            }, 0);
            return { entry: entry, score: score };
        }).filter(function (match) {
            return match.score === words.length;
        }).sort(function (a, b) {
            return b.score - a.score;
        }).map(function (match) {
            return match.entry;
        });
    }

    form.addEventListener("submit", function (event) {
        event.preventDefault();
        render(search(input.value), input.value.trim());
    });

    input.addEventListener("input", function () {
        render(search(input.value), input.value.trim());
    });

    var params = new URLSearchParams(window.location.search);
    var initialQuery = params.get("q") || "";
    input.value = initialQuery;
    render(search(initialQuery), initialQuery);
})();
