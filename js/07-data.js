// === Favorites & Watched Logic ===

function isFavorite(stream_id) {
    return userSettings.favorites.includes(String(stream_id));
}

function toggleFavorite(stream_id, type, item) {
    if (!stream_id || !type || !item) {
         const focusedItem = document.activeElement;
         stream_id = focusedItem.dataset.streamId;
         type = focusedItem.dataset.type;
         item = JSON.parse(focusedItem.dataset.item);
    }

    const idStr = String(stream_id);
    const heartIcon = $(`#fav-icon-${idStr}`);
    
    if (isFavorite(idStr)) {
        userSettings.favorites = userSettings.favorites.filter(id => id !== idStr);
        if (heartIcon) heartIcon.innerHTML = getHeartIcon(false); // Update UI
        console.log("Removed from favorites");
    } else {
        userSettings.favorites.push(idStr);
        if (heartIcon) heartIcon.innerHTML = getHeartIcon(true); // Update UI
        console.log("Added to favorites");
    }
    
    // Need to save the full item for "Favorites" category
    // We'll store it in the 'watched' object as it can hold item data
    const key = type === 'series' ? item.series_id : item.stream_id;
    // Ensure item type is stored correctly for filtering
    const itemType = type === 'series' ? 'series' : (item.stream_type || type);
    if (!userSettings.watched[key]) {
         userSettings.watched[key] = { progress_sec: 0, duration_sec: 0, type: itemType, item: item };
    } else {
         // Update type if it's missing, e.g. from an old 'watched' entry
         userSettings.watched[key].type = itemType;
         userSettings.watched[key].item = item; // Update item
    }
    
    saveUserSettings();
}

// --- NEW "TO WATCH" ---
function isToWatch(stream_id) {
    return userSettings.toWatch.includes(String(stream_id));
}

function toggleWatchLater(stream_id, type, item) {
     if (!stream_id || !type || !item) {
         const focusedItem = document.activeElement;
         stream_id = focusedItem.dataset.streamId;
         type = focusedItem.dataset.type;
         item = JSON.parse(focusedItem.dataset.item);
    }

    const idStr = String(stream_id);
    const bookmarkIcon = $(`#towatch-icon-${idStr}`); // For grid (not yet implemented)
    
    if (isToWatch(idStr)) {
        userSettings.toWatch = userSettings.toWatch.filter(id => id !== idStr);
        if (bookmarkIcon) bookmarkIcon.innerHTML = getWatchLaterIcon(false); // Update UI
        console.log("Removed from To Watch");
    } else {
        userSettings.toWatch.push(idStr);
        if (bookmarkIcon) bookmarkIcon.innerHTML = getWatchLaterIcon(true); // Update UI
        console.log("Added to To Watch");
    }
    
    // Need to save the full item for "To Watch" category
    // We'll store it in the 'watched' object as it can hold item data
    const key = type === 'series' ? item.series_id : item.stream_id;
    const itemType = type === 'series' ? 'series' : (item.stream_type || type);
    if (!userSettings.watched[key]) {
         userSettings.watched[key] = { progress_sec: 0, duration_sec: 0, type: itemType, item: item };
    } else {
         userSettings.watched[key].type = itemType;
         userSettings.watched[key].item = item; // Update item
    }
    
    saveUserSettings();
}


/**
 * Gets watched progress for a VOD item or a Series.
 * @param {string} id - The stream_id (VOD) or series_id (Series).
 * @param {string|null} [episode_id=null] - (For Series) The specific episode ID to check progress for.
 * @returns {object|null} The progress object or null.
 */
function getWatchedProgress(id, episode_id = null) {
    const progress = userSettings.watched[String(id)];
    if (!progress) return null;

    if (progress.type === 'series' && episode_id) {
        // User wants progress for a *specific* episode
        if (progress.episode && String(progress.episode.id) === String(episode_id)) {
            return progress; // Progress matches this episode
        }
        return null; // Progress exists for the series, but a different episode
    }
    
    // For VOD, or just checking series-level (last watched)
    return progress;
}

/**
 * Saves progress for the currently playing item.
 * @param {object} item - The VOD item or Series item.
 * @param {number} currentTime - Current playback time in seconds.
 * @param {number} duration - Total duration in seconds.
 * @param {string} type - 'vod' or 'series'.
 * @param {object|null} [episodeData=null] - The episode object (if type is 'series').
 */
function saveProgress(item, currentTime, duration, type, episodeData = null) {
    if (!item || !duration || duration === 0) return;

    let idStr;
    let progressData;

    if (type === 'series' && episodeData) {
        idStr = String(item.series_id); // Save against the *Series ID*
        progressData = {
            progress_sec: Math.floor(currentTime),
            duration_sec: Math.floor(duration),
            type: 'series',
            item: item, // The series item
            episode: episodeData // The episode item
        };
    } else if (type === 'vod') {
        idStr = String(item.stream_id); // Save against the *VOD ID*
        progressData = {
            progress_sec: Math.floor(currentTime),
            duration_sec: Math.floor(duration),
            type: 'vod',
            item: item
        };
    } else {
        return; // Don't save progress for Live TV
    }
    
    // Don't overwrite a full 'watched' item with a 'progress' item
    // e.g. if it was just saved for favorites
    const existing = userSettings.watched[idStr];
    if (existing) {
        userSettings.watched[idStr] = { ...existing, ...progressData };
    } else {
        userSettings.watched[idStr] = progressData;
    }

    // Note: We don't call saveUserSettings() here to avoid spamming localStorage
    // It's called by the saveProgressInterval instead.
}