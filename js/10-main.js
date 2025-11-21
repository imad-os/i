// === Initialization ===
// This is the main entry point file. It should be loaded LAST.

document.addEventListener('DOMContentLoaded', () => {
    console.log("App initializing...");
    // --- NEW: HASH HANDLING ON LOAD ---
    initialHash = location.hash;
    if (initialHash) {
        console.log("Initial hash detected:", initialHash);
        // Clean the URL bar so refreshes don't stack hashes or cause issues
        history.replaceState(null, '', '/');
    }
    // --- END HASH HANDLING ---
    detectTizen();
    setupKeyListeners();
    setupEventListeners();
    setupClock();
    
    const lastUser = localStorage.getItem('iptv-last-user');
    if (lastUser) {
        $('#username').value = lastUser;
        handleUserLogin();
    } else {
        showPage('page-user-login');
    }
});

function detectTizen() {
    try {
        if (typeof webapis !== 'undefined' && webapis.avplay) {
            console.log("Tizen platform detected. Using AVPlay.");
            
            document.addEventListener('tizenhwkey', (e) => {
                const activePageId = navigationStack[navigationStack.length - 1]?.pageId;
                
                if (e.keyName === "back") {
                    // --- SEARCH OVERRIDE ---
                    if (searchState.active || (searchState.query && searchState.query.length > 0)) {
                        clearSearch();
                        return;
                    }
                    
                    if (tizenModalActive) {
                        hideTizenTrackModal();
                        return;
                    }
                    if (activePageId === 'page-player' && tizenOverlayActive) {
                        hideTizenOverlay();
                        return;
                    }
                    if (activePageId === 'page-live-tv') {
                        stopPlayer(); // Stop preview player
                        goBack();
                        return;
                    }
                    if ($("#details-view-panel").classList.contains("activeView")) {
                        backToMoviesList();
                    } else {
                        goBack();
                    }
                }
            });

            try {
                tizen.key.registerKey("MediaPlayPause");
                tizen.key.registerKey("MediaPlay");
                tizen.key.registerKey("MediaPause");
                tizen.key.registerKey("MediaStop");
                tizen.key.registerKey("MediaFastForward");
                tizen.key.registerKey("MediaRewind");
                tizen.key.registerKey("ChannelUp");
                tizen.key.registerKey("ChannelDown");
            } catch (e) {
                console.warn("Could not register media keys.", e);
            }
        } else {
            console.log("Standard Web platform detected. Using HTML5 <video> player.");
        }
    } catch (e) {
        console.log("Error detecting Tizen, defaulting to Web.", e);
    }
}

function setupEventListeners() {
    // User Login
    $('#user-login-button').addEventListener('click', handleUserLogin);
    $('#username').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleUserLogin();
        if (e.key === 'ArrowDown') $("#user-login-button").focus();
    });

    // API Connect
    $('#api-connect-button').addEventListener('click', () => handleApiConnect(null, false));
    
    // NEW: Header Playlist Button
    $('#header-playlists-button').addEventListener('click', showPlaylistsPage);
    
    // NEW: Add Playlist Button
    $('#add-playlist-button').addEventListener('click', addNewPlaylist);
    
    // NEW: Search UI Handlers
    $('#search-clear-btn').addEventListener('click', () => toggleSearchBar(false));
    
    // Search Input Debounce
    let searchTimeout;
    $('#search-input').addEventListener('input', (e) => {
        const query = e.target.value;
        searchState.query = query;
        
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
             filterContent(query);
             $('#search-input').focus()
        }, 300);
    });
    
    // Tizen virtual keyboard enter
    $('#search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.target.blur(); // Hide keyboard
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                 filterContent(query);
                 $('#search-input').focus()
            }, 300);
        }
        
    });

    // Settings Page
    $('#logout-button').addEventListener('click', handleLogout);
    $('#change-api-button').addEventListener('click', () => {
        // Save current page to stack before moving
        pushToNavStack($$('.page[style*="block"]')[0].id);
        
        // Fill inputs with current playlist data
        const currentPL = userSettings.pl || 0;
        xtreamConfig = userSettings.xtreamConfig[currentPL] || {};
        
        $('#playlist-title').value = xtreamConfig.title || '';
        $('#host').value = xtreamConfig.host || '';
        $('#api-user').value = xtreamConfig.username || '';
        $('#api-pass').value = xtreamConfig.password || '';
        
        showPage('page-api-details');
    });
    
    $('#clear-favorites-button').addEventListener('click', () => {
            userSettings.favorites = [];
            saveUserSettings();
            showError('Favorites cleared.');
    });
    $('#clear-watching-button').addEventListener('click', () => {
            userSettings.watching = {};
            saveUserSettings();
            showError('watching progress cleared.');
    });
}

// --- NEW TIZEN PLAYER KEY HANDLER ---
function handleTizenPlayerKeys(e) {
    if (tizenModalActive) {
        handleArrowNavigation(e.key, '#tizen-track-modal');
        if (e.key === 'Enter') {
            document.activeElement?.click();
        }
        return;
    }

    if (!tizenOverlayActive) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
            showTizenOverlay();
            if (e.key === 'Enter') return;
        }
    }

    switch (e.key) {
        case 'MediaPlayPause':
        case 'MediaPlay':
        case 'MediaPause':
            tizenTogglePlayPause();
            return;
        case 'MediaFastForward':
            tizenSeek('forward');
            return;
        case 'MediaRewind':
            tizenSeek('backward');
            return;
        case 'MediaStop':
            goBack(); 
            return;
        case 'ChannelUp':
        case 'ChannelDown':
            // Logic to change channel could go here if we have a playlist reference
            return;
    }
    
    if (!tizenOverlayActive) return;

    if (e.key === 'Enter') {
        document.activeElement?.click();
        return;
    }
    
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        handleArrowNavigation(e.key, '#tizen-player-overlay');
        const focused = document.activeElement;
        if (focused && focused.id === 'tizen-progress-bar') {
            if (e.key === 'ArrowLeft') tizenSeek('backward');
            if (e.key === 'ArrowRight') tizenSeek('forward');
        }
        clearTimeout(tizenOverlayTimer);
        tizenOverlayTimer = setTimeout(hideTizenOverlay, 7000);
    }
}


function setupKeyListeners() {
    document.addEventListener('keydown', (e) => {
        const activePageId = navigationStack[navigationStack.length - 1]?.pageId;
        
        // If search input is focused, allow typing but handle Enter/Escape
        if (searchState.active && document.activeElement.id === 'search-input') {
             if (e.key === 'Escape' || e.key === 'Back') {
                 clearSearch();
             }
             if (e.key === 'Enter') {
                e.target.blur();
                setTimeout(() => {
                     filterContent($("#search-input").value);
                     toggleSearchBar(false);
                }, 100);
            }
             // Don't block other keys
             return;
        }

        if (isTizen && activePageId === 'page-player') {
            e.preventDefault();
            handleTizenPlayerKeys(e);
            return;
        }

        const nav_buttons = [
            "ArrowUp",
            "ArrowRight",
            "ArrowDown",
            "ArrowLeft",
            "Enter",
        ];

        if (e.key === 'Escape' || e.key === 'Back') { 
            // --- SEARCH OVERRIDE ---
            if (!$("#details-view-panel.activeView") && (searchState.active || (searchState.query && searchState.query.length > 0))) {
                clearSearch();
            }else if (activePageId === 'page-live-tv') {
                stopPlayer();
                goBack();
            }else if ($("#details-view-panel").classList.contains("activeView")) {
                backToMoviesList();
            }else if ( isVisible( $("#category-manager-title") ) ) {
                hideCategoryManager();
            } else {
                goBack();
            }
            return;
        }
        
        if ( nav_buttons.includes(e.key)) {
            // Prevent default scrolling
            if(document.activeElement.id !== 'search-input') e.preventDefault();
            
            if (e.key === 'Enter') {
                // Special handling for Live TV Channel List "Double Enter"
                if (activePageId === 'page-live-tv' && document.activeElement.closest('#live-channels-list')) {
                    // Standard click is handled by onclick (Preview/Fullscreen)
                    // We just fall through to the click trigger below
                }

                if (virtualList && activePageId === 'page-content' && document.activeElement.tagName=="BODY") {
                    const focusedEl = $('#page-content .vitem.focused');
                    if (focusedEl) {
                        focus_history[activePageId] = focusedEl;
                        focusedEl.click();
                    }
                } else {
                    focus_history[activePageId] = document.activeElement;
                    document.activeElement?.click();
                }
                return;
            }
            
            if ($("#details-view-panel").classList.contains("activeView")) {
                handleArrowNavigation(e.key, '#details-view-panel');
            }else if ( isVisible( $("#category-manager-title") ) ) {
                handleArrowNavigation(e.key, '#category-manager-modal');
            } else {
                handleArrowNavigation(e.key);
            }
            return;
        }
        
        if (activePageId === 'page-content' || (activePageId === 'page-categories' && (navigationStack[navigationStack.length-1].context?.special === 'favorites' || navigationStack[navigationStack.length-1].context?.special === 'watching'))) {
            
            let targetItem;
            if (virtualList) {
                targetItem = virtualListItems[focusedVirtualIndex];
            } else {
                const focusedElement = document.activeElement;
                if (focusedElement && focusedElement.dataset.item) {
                    targetItem = JSON.parse(focusedElement.dataset.item);
                }
            }
            
            if (!targetItem) return;
            
            const type = targetItem.stream_type || virtualListType;
            const stream_id = targetItem.stream_id || targetItem.series_id;

            if (e.key === 'f') {
                toggleFavorite(stream_id, type, targetItem);
                if(virtualList) virtualList.highlight(focusedVirtualIndex);
            }
            if (e.key === 'w') {
                // toggleWatchLater(stream_id, type, targetItem);
            }
        }
        
        // Channel Up/Down for Preview Mode in Live TV
        if (activePageId === 'page-live-tv') {
            if (e.key === 'ChannelUp' || e.key === 'ChannelDown' || e.key === 'PageUp' || e.key === 'PageDown') {
                 // Simple channel surfing logic in preview
                 const channels = Array.from($$('#live-channels-list .nav-item'));
                 const currentIndex = channels.indexOf(document.activeElement);
                 let nextIndex = currentIndex;
                 
                 if (e.key === 'ChannelUp' || e.key === 'PageUp') nextIndex = currentIndex - 1;
                 if (e.key === 'ChannelDown' || e.key === 'PageDown') nextIndex = currentIndex + 1;
                 
                 if (nextIndex >= 0 && nextIndex < channels.length) {
                     const nextBtn = channels[nextIndex];
                     nextBtn.focus();
                     nextBtn.click(); // Trigger preview
                     nextBtn.scrollIntoView({ block: 'nearest' });
                 }
            }
        }
    });
}

function handleArrowNavigation(key, parentSelector = null) {
    const activePage = parentSelector ? $(parentSelector) : $('.page[style*="block"]');
    if (!activePage) return;
    
    // --- SPECIAL LIVE TV 3-PANE NAVIGATION ---
    if (activePage.id === 'page-live-tv') {
        const focused = document.activeElement;
        const inCategoryList = focused.closest('#live-categories-list');
        const inChannelList = focused.closest('#live-channels-list');
        
        if (key === 'ArrowRight') {
            if (inCategoryList) {
                // Move from Category to Channel List (First item)
                const firstChannel = $('#live-channels-list .nav-item');
                if (firstChannel) firstChannel.focus();
                else {
                    // If no channels loaded, trigger load?
                }
                return;
            }
            // If in Channel List -> Do nothing
            return;
        }
        
        if (key === 'ArrowLeft') {
            if (inChannelList) {
                const currnetCat = $('#live-categories-list .nav-item.bg-primary');
                console.log("Current Cat:", currnetCat);
                if (currnetCat) {
                    currnetCat.focus();
                } else {
                    // Move to first category if none active
                    const firstCat = $('#live-categories-list .nav-item');
                    if (firstCat) firstCat.focus();
                }
                return;
            }
            return;
        }
    }
    // -----------------------------------------

    
    if (activePage.id === 'page-content' && virtualList) {
        const cols = virtualList.getCols();
        const itemCount = virtualListItems.length;
        let newIndex = focusedVirtualIndex;

        if (key === 'ArrowRight') {
            if (newIndex + 1 < itemCount) newIndex++;
        } else if (key === 'ArrowLeft') {
            if (newIndex - 1 >= 0) newIndex--;
        } else if (key === 'ArrowDown') {
            if (newIndex + cols < itemCount) {
                 newIndex += cols;
            } else {
                newIndex = itemCount - 1;
            }
        } else if (key === 'ArrowUp') {
            if (newIndex - cols >= 0) newIndex -= cols;
        }

        if (newIndex !== focusedVirtualIndex) {
            focusedVirtualIndex = newIndex;
            virtualList.ensureVisible(focusedVirtualIndex, () => {
                virtualList.highlight(focusedVirtualIndex);
            });
        }
        return; 
    }
    
    let focusableItems = [];

    if (parentSelector) {
        focusableItems = Array.from(activePage.querySelectorAll('.nav-item, .nav-item-sm'));
        if (parentSelector === '#details-view-panel') {
            focusableItems = Array.from(activePage.querySelectorAll('button'));
        }
        if (parentSelector === '#category-manager-modal') {
            focusableItems = Array.from(activePage.querySelectorAll('button'));
        }
    } else if (activePage.id === 'page-categories') {
         focusableItems = Array.from(activePage.querySelectorAll('#category-grid .nav-item'));
    } else if (activePage.id === 'page-content') {
         focusableItems = Array.from(activePage.querySelectorAll('#content-grid .nav-item'));
    } else if (activePage.id === 'page-playlists') {
         focusableItems = Array.from(activePage.querySelectorAll('#playlists-list .nav-item, #add-playlist-button'));
    } else if (activePage.id === 'page-series-details') {
        focusableItems = Array.from(activePage.querySelectorAll('#series-fav-button, #series-watch-later-button, #series-seasons-tabs .nav-item, #series-episodes-list .nav-item'));
    } else if (activePage.id === 'page-main') {
         focusableItems = Array.from(activePage.querySelectorAll('[onclick*="loadCategories"]'));0
    } else if (activePage.id === 'page-live-tv') {
        // Constrain focus list based on which column we are in to prevent jumping between columns via Up/Down
        const focused = document.activeElement;
        if (focused.closest('#live-categories-list')) {
            focusableItems = Array.from(activePage.querySelectorAll('#live-categories-list .nav-item'));
        } else if (focused.closest('#live-channels-list')) {
            focusableItems = Array.from(activePage.querySelectorAll('#live-channels-list .nav-item'));
        } else {
            focusableItems = Array.from(activePage.querySelectorAll('.nav-item, .nav-item-sm'));
        }
    } else {
        focusableItems = Array.from(activePage.querySelectorAll('.nav-item, .nav-item-sm'));
    }
    
    // Include Header Buttons (except overlay/modal)
    if (parentSelector !== '#tizen-player-overlay' && parentSelector !== '#details-view-panel' && activePage.id !== 'page-live-tv') {
        const headerButtons = Array.from($$("#global-header button"));
        const visibleHeaderButtons = headerButtons.filter(b => b.offsetParent !== null);
        
        // Include search UI buttons if visible
        const searchButtons = Array.from($$("#search-bar-container button, #search-bar-container input"));
        const visibleSearchButtons = searchButtons.filter(b => b.offsetParent !== null);

        focusableItems = [...visibleHeaderButtons, ...visibleSearchButtons, ...focusableItems];
    }
    
    if (focusableItems.length === 0) return;

    let currentIndex = focusableItems.indexOf(document.activeElement);
    
    if (currentIndex === -1) {
        let firstItem;
        if (parentSelector === '#tizen-player-overlay') {
            firstItem = $('#tizen-play-pause-button');
        } else {
            firstItem = focusableItems[0];
        }
        if (firstItem) firstItem.focus();
        return;
    }

    const currentRect = focusableItems[currentIndex].getBoundingClientRect();
    let nextItem = null;
    let minDistance = Infinity;
    
    const grid = activePage.querySelector('#content-grid, #category-grid');
    if (grid && !parentSelector && activePage.id !== 'page-live-tv') { 
        let columns = 1;
        const gridStyle = window.getComputedStyle(grid);
        if (gridStyle) {
            columns = gridStyle.getPropertyValue('grid-template-columns').split(' ').length;
        }
        let nextIndex = -1;
        if (key === 'ArrowRight') nextIndex = currentIndex + 1;
        else if (key === 'ArrowLeft') nextIndex = currentIndex - 1;
        else if (key === 'ArrowDown') nextIndex = currentIndex + columns;
        else if (key === 'ArrowUp') nextIndex = currentIndex - columns;

        if (nextIndex >= 0 && nextIndex < focusableItems.length) {
            focusableItems[nextIndex].focus();
            focusableItems[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }
    }
    
    // Standard Spatial Navigation
    focusableItems.forEach((item, index) => {
        if (index === currentIndex) return;
        const itemRect = item.getBoundingClientRect();
        let isCandidate = false;
        let distance = Infinity;

        switch (key) {
            case 'ArrowRight':
                if (itemRect.left > currentRect.left || (itemRect.left === currentRect.left && itemRect.top > currentRect.top)) {
                    isCandidate = true;
                    distance = Math.hypot(itemRect.left - currentRect.left, (itemRect.top - currentRect.top) * 2);
                }
                break;
            case 'ArrowLeft':
                if (itemRect.left < currentRect.left || (itemRect.left === currentRect.left && itemRect.top < currentRect.top)) {
                    isCandidate = true;
                    distance = Math.hypot(itemRect.left - currentRect.left, (itemRect.top - currentRect.top) * 2);
                }
                break;
            case 'ArrowDown':
                if (itemRect.top > currentRect.top) {
                    isCandidate = true;
                    distance = Math.hypot((itemRect.left - currentRect.left) * 2, itemRect.top - currentRect.top);
                }
                break;
            case 'ArrowUp':
                if (itemRect.top < currentRect.top) {
                    isCandidate = true;
                    distance = Math.hypot((itemRect.left - currentRect.left) * 2, itemRect.top - currentRect.top);
                }
                break;
        }
        
        if (isCandidate && distance < minDistance) {
            minDistance = distance;
            nextItem = item;
        }
    });
    
    if (nextItem) {
        nextItem.focus({ preventScroll: true });
        nextItem.scrollIntoView({block: "nearest",inline: "nearest"});
    }
}