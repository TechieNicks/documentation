function openNav() {
    document.getElementById("mySidenav").style.width = "250px";
    document.getElementById("main").style.marginLeft = "250px";
    document.querySelector("header").style.marginLeft = "250px"; // Shift Header
    document.querySelector("footer").style.marginLeft = "250px"; // Shift Footer
    document.querySelector(".newspaper-container").style.marginLeft = "250px"; // Shift Footer
    document.body.style.backgroundColor = "rgba(0,0,0,0.4)";
}

function closeNav() {
    document.getElementById("mySidenav").style.width = "0";
    document.getElementById("main").style.marginLeft = "0";
    document.querySelector("header").style.marginLeft = "0"; // Reset Header
    document.querySelector("footer").style.marginLeft = "0"; // Reset Footer
    document.querySelector(".newspaper-container").style.marginLeft = "5%"; // Reset Footer
    document.body.style.backgroundColor = "white";
}

/*Remove Extra whitesace from pre*/
window.addEventListener("load", function () {
    const codeBlock = document.getElementById("code-block");
    // Split the code into lines.
    const lines = codeBlock.textContent.split('\n');
    // Remove leading spaces (adjust the regex if needed)
    const trimmedLines = lines.map(line => line.replace(/^\s+/, '')).join('\n');
    codeBlock.textContent = trimmedLines;
});

// Get the button "back-to-top"
let mybutton = document.getElementById("myBtn");

// When the user scrolls down 20px from the top of the document, show the button
window.onscroll = function () { scrollFunction() };

function scrollFunction() {
    if (document.body.scrollTop > 25 || document.documentElement.scrollTop > 25) {
        mybutton.style.display = "block";
    } else {
        mybutton.style.display = "none";
    }
}

// When the user clicks on the button, scroll to the top of the document
function topFunction() {
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
}
/*****Code Placeholder starts *****/
document.querySelectorAll('.copybutton').forEach(button => {
    button.addEventListener('click', () => {
        const code = button.parentElement.querySelector('.code-snippet').innerText;
        navigator.clipboard.writeText(code).then(() => {
            button.innerText = "Copied!";
            setTimeout(() => (button.innerText = "Copy"), 1500);
        });
    });
});

/*****Code placeholder ends*****/
/***Prevent clipboard issue if code block is missing****/
const codeBlock = document.getElementById("code-block");
if (codeBlock) {
    const lines = codeBlock.textContent.split('\n');
    const trimmedLines = lines.map(line => line.replace(/^\s+/, '')).join('\n');
    codeBlock.textContent = trimmedLines;
}
/******Like button counter starts******/
//Like Button Counter (with local storage)
let count = localStorage.getItem("like-count") || 0;
let liked = localStorage.getItem("liked") === "true";

// Update UI on load
document.getElementById('like-count').innerText = count;
if (liked) {
    document.getElementById('like-button').disabled = true;
}

function incrementLikes() {
    if (liked) return; // Prevent multiple likes

    count++;
    liked = true;
    localStorage.setItem("like-count", count);
    localStorage.setItem("liked", true);
    document.getElementById('like-count').innerText = count;
    document.getElementById('like-button').disabled = true;
}
/******Like button counter ends******/
