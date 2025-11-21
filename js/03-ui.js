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

// === Search UI (NEW) ===

function toggleSearchBar(show) {
    const container = $('#search-bar-container');
    const input = $('#search-input');
    
    if (show) {
        container.classList.remove('hidden');
        input.value = searchState.query || '';
        input.focus();
        searchState.active = true;
    } else {
        container.classList.add('hidden');
        input.blur();
        searchState.active = false;

    }
}

function clearSearch() {
    $('#search-input').value = '';
    searchState.query = '';
    // Trigger filter with empty string to restore original list
    if (typeof filterContent === 'function') {
        filterContent('');
    }
    toggleSearchBar(false);
}


// === Playlist Management ===

function showPlaylistsPage() {
    renderPlaylists();
    showPage('page-playlists');
    pushToNavStack('page-playlists');
}

function renderPlaylists() {
    const list = $('#playlists-list');
    list.innerHTML = '';
    
    if (!userSettings.xtreamConfig || userSettings.xtreamConfig.length === 0) {
        list.innerHTML = '<p class="text-alt text-center">No playlists found.</p>';
        return;
    }

    userSettings.xtreamConfig.forEach((config, index) => {
        const isActive = (index === userSettings.pl);
        
        const btn = document.createElement('button');
        btn.className = `nav-item w-full p-4 rounded-lg text-left transition-all flex justify-between items-center ${isActive ? 'bg-primary text-white' : 'bg-card text-main hover:bg-opacity-80'}`;
        
        const title = config.title || `Playlist ${index + 1}`;
        const url = config.host || 'No URL';

        btn.innerHTML = `
            <div>
                <h3 class="font-bold text-lg">${title}</h3>
                <p class="text-sm opacity-70">${url}</p>
            </div>
            ${isActive ? '<span class="font-bold bg-white text-primary px-2 py-1 rounded text-xs">ACTIVE</span>' : ''}
        `;
        
        btn.onclick = () => selectPlaylist(index);
        list.appendChild(btn);
    });
}

async function selectPlaylist(index) {
    console.log(`Switching to playlist index: ${index}`);
    userSettings.pl = index;
    saveUserSettings();
    
    // Try to connect with new playlist
    xtreamConfig = userSettings.xtreamConfig[index];
    if (xtreamConfig && xtreamConfig.host && xtreamConfig.username) {
        // Set base URL immediately so fetch works
        let host = xtreamConfig.host;
        if (!host.startsWith('http')) host = 'http://' + host;
        if (host.endsWith('/')) host = host.slice(0, -1);
        apiBaseUrl = `${host}/player_api.php`;

        // Trigger connection check (which loads main page on success)
        handleApiConnect(null, true); 
    } else {
        // Empty config, go to edit
        $('#playlist-title').value = xtreamConfig.title || '';
        $('#host').value = '';
        $('#api-user').value = '';
        $('#api-pass').value = '';
        showPage('page-api-details');
    }
}

function addNewPlaylist() {
    // Create a blank entry
    const newConfig = {
        title: `Playlist ${userSettings.xtreamConfig.length + 1}`,
        host: '',
        username: '',
        password: ''
    };
    
    userSettings.xtreamConfig.push(newConfig);
    const newIndex = userSettings.xtreamConfig.length - 1;
    userSettings.pl = newIndex; // Switch to it
    
    // Clear form and show edit page
    $('#playlist-title').value = newConfig.title;
    $('#host').value = '';
    $('#api-user').value = '';
    $('#api-pass').value = '';
    
    showPage('page-api-details');
}


// === Category Management ===

async function showCategoryManager(type) {
    let action = '';
    let title = '';
    if (type === 'live') { action = 'get_live_categories'; title = 'Manage Live Categories'; }
    else if (type === 'vod') { action = 'get_vod_categories'; title = 'Manage Movie Categories'; }
    else if (type === 'series') { action = 'get_series_categories'; title = 'Manage Series Categories'; }

    showLoader(true);
    try {
        const categories = await fetchXtream({ action });
        if (categories && Array.isArray(categories)) {
            renderCategoryManagerList(categories, type);
            $('#category-manager-title').textContent = title;
            $('#category-manager-modal').style.display = 'flex';
            
            // Focus first item
            const firstItem = $('#category-manager-list .nav-item');
            if (firstItem) firstItem.focus();
        }
    } catch (e) {
        console.error("Error fetching categories for manager:", e);
        showError("Could not load categories.");
    } finally {
        showLoader(false);
    }

}

function renderCategoryManagerList(categories, type) {
    const list = $('#category-manager-list');
    list.innerHTML = '';

    // Helper to check if pinned/hidden
    const isHidden = (id) => userSettings.hiddenCategories.includes(String(id));
    const isPinned = (id) => userSettings.pinnedCategories.includes(String(id));

    categories.forEach(cat => {
        const id = String(cat.category_id);
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-3 bg-card rounded-lg';
        
        item.innerHTML = `
            <span class="font-semibold text-main flex-1 truncate mr-2">${cat.category_name}</span>
            <div class="flex gap-2">
                <button class="btn-pin nav-item p-2 rounded border-2 ${isPinned(id) ? 'bg-primary border-primary text-white' : 'bg-alt border-transparent text-alt'}" title="Pin">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                </button>
                <button class="btn-hide nav-item p-2 rounded border-2 ${isHidden(id) ? 'bg-red-600 border-red-600 text-white' : 'bg-alt border-transparent text-alt'}" title="Hide">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                </button>
            </div>
        `;

        const btnPin = item.querySelector('.btn-pin');
        const btnHide = item.querySelector('.btn-hide');

        btnPin.onclick = () => {
            togglePinned(id);
            // Refresh style
            btnPin.className = `btn-pin nav-item p-2 rounded border-2 ${isPinned(id) ? 'bg-primary border-primary text-white' : 'bg-alt border-transparent text-alt'}`;
        };

        btnHide.onclick = () => {
            toggleHidden(id);
            // Refresh style
            btnHide.className = `btn-hide nav-item p-2 rounded border-2 ${isHidden(id) ? 'bg-red-600 border-red-600 text-white' : 'bg-alt border-transparent text-alt'}`;
        };

        list.appendChild(item);
    });
}

function togglePinned(id) {
    const index = userSettings.pinnedCategories.indexOf(id);
    if (index > -1) userSettings.pinnedCategories.splice(index, 1);
    else userSettings.pinnedCategories.push(id);
}

function toggleHidden(id) {
    const index = userSettings.hiddenCategories.indexOf(id);
    if (index > -1) userSettings.hiddenCategories.splice(index, 1);
    else userSettings.hiddenCategories.push(id);
}


// === Modal Logic ===

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
    
    const fullVodItem = { ...item, ...info.info, stream_id: item.stream_id, stream_type: 'vod' };
    const streamId = item.stream_id;

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
    
    $('#modal-play-button').onclick = () => {
        hideMovieDetailsModal();
        playMovie(item, startTime, info); 
    };
    $('#modal-close-button').onclick = hideMovieDetailsModal;
    
    $('#movie-details-modal').style.display = 'flex';
    $('#modal-play-button').focus();
}

function hideMovieDetailsModal() {
    $('#movie-details-modal').style.display = 'none';
    if (lastFocusedElement) {
        lastFocusedElement.focus(); 
    }
}
function hideMovieDetailsModal() {
    $('#movie-details-modal').style.display = 'none';
    if (lastFocusedElement) {
        lastFocusedElement.focus(); 
    }
}

function backToMoviesList() {
    $("#details-view-panel").classList.remove("activeView");
    $("#content-grid").classList.remove("disabled");
    $(".vitem.focused").focus()
}