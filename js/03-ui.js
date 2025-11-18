// === UI Logic ===
// Theming, Modals, Clock, etc.

function setupClock() {
    const updateTime = () => {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        $('#current-time').textContent = `${hours}:${minutes}`;
    };
    updateTime();
    clockInterval = setInterval(updateTime, 30000); // Update every 30s
}

// === Theming ===
function setTheme(themeName) {
    document.body.className = themeName;
    userSettings.theme = themeName;
    saveUserSettings();
}

function loadTheme() {
    document.body.className = userSettings.theme || 'theme-default';
    document.documentElement.style.setProperty('--font-scale', userSettings.fontScale || 1.2);
}

/**
 * NEW: Shows the movie details modal
 */
function showMovieDetailsModal(info, item, startTime) {
    lastFocusedElement = document.activeElement; // Save focus
    
    // Populate modal fields
    $('#modal-movie-poster').src = info.info.movie_image || item.movie_image || 'https://placehold.co/400x600/374151/FFFFFF?text=No+Image';
    $('#modal-movie-title').textContent = info.info.name || item.name;
    $('#modal-movie-year').textContent = info.info.releasedate || 'N/A';
    $('#modal-movie-duration').textContent = info.info.duration || 'N/A';
    $('#modal-movie-rating-text').textContent = Number(info.info.rating_5based || item.rating || 0).toFixed(1);
    $('#modal-movie-plot').textContent = info.info.plot || 'No description available.';
    $('#modal-movie-cast').textContent = info.info.cast || 'N/A';
    $('#modal-movie-genre').textContent = info.info.genre || 'N/A';
    
    // Create a complete item from the available info to save
    const fullVodItem = { ...item, ...info.info, stream_id: item.stream_id, stream_type: 'vod' };
    const streamId = item.stream_id;

    // --- FAV BUTTON LOGIC ---
    const modalFavButton = $('#modal-fav-button');
    const updateModalFavIcon = () => {
        modalFavButton.innerHTML = getHeartIcon(isFavorite(streamId));
    };
    modalFavButton.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(streamId, 'vod', fullVodItem);
        updateModalFavIcon();
    };
    updateModalFavIcon();
    

    // Set up button actions
    $('#modal-play-button').onclick = () => {
        hideMovieDetailsModal();
        playMovie(item, startTime, info); // Pass info to player
    };
    $('#modal-close-button').onclick = hideMovieDetailsModal;
    
    // Show modal and focus
    $('#movie-details-modal').style.display = 'flex';
    $('#modal-play-button').focus();
}

/**
 * NEW: Hides the movie details modal
 */
function hideMovieDetailsModal() {
    $('#movie-details-modal').style.display = 'none';
    if (lastFocusedElement) {
        lastFocusedElement.focus(); // Restore focus
    }
}