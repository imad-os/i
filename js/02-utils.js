// === DOM Elements & Utilities ===
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// === Loading & Error Handling ===
function showLoader(show) {
    $('#loading-overlay').style.display = show ? 'flex' : 'none';
}

function showError(message) {
    const toast = $('#error-toast');
    toast.textContent = message || 'An error occurred.';
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 5000);
}

function showAlert(message) {
    const toast = $('#alert-toast');
    toast.textContent = message || '-';
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 5000);
}

// === Icon Utilities ===
function getHeartIcon(isFav) {
     return isFav ? 
     '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 fill-primary" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" /></svg>' : 
     '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 fill-text" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>';
}

/**
 * NEW: Added missing Watch Later icon function
 */
function getWatchLaterIcon(isToWatch) {
    return isToWatch ?
    '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 fill-primary" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-3.13L5 18V4z" /></svg>' :
    '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 fill-text" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>';
}

// REMOVED: Extra '}' syntax error was here