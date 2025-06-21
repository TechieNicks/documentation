document.addEventListener("DOMContentLoaded", function () {
    const copyButtons = document.querySelectorAll('.copy-button');

    copyButtons.forEach(button => {
        button.addEventListener('click', function () {
            const targetId = button.getAttribute('data-target');
            copyCode(targetId, button);
        });
    });
});

function copyCode(contentId, button) {
    const content = document.getElementById(contentId);
    const range = document.createRange();
    const selection = window.getSelection();

    selection.removeAllRanges();
    range.selectNodeContents(content);
    selection.addRange(range);

    try {
        document.execCommand("copy");
        showToast("Code copied to clipboard!", "success");
        button.classList.add("copied");
    } catch (err) {
        console.error("Failed to copy", err);
        showToast("Failed to copy the code!", "error");
    }

    selection.removeAllRanges();
    setTimeout(() => button.classList.remove("copied"), 2000);
}

function showToast(message, type = "info") {
    const toast = document.getElementById("new-toast");
    toast.textContent = message;
    toast.classList.add("show", type);

    setTimeout(() => toast.classList.remove("show", type), 3000);
}