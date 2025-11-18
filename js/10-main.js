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
            isTizen = true;
            console.log("Tizen platform detected. Using AVPlay.");
            
            document.addEventListener('tizenhwkey', (e) => {
                const activePageId = navigationStack[navigationStack.length - 1]?.pageId;
                
                if (e.keyName === "back") {
                    // NEW: If modal is open, close it
                    if (tizenModalActive) {
                        hideTizenTrackModal();
                        return;
                    }
                    // NEW: If overlay is active on player page, hide it
                    if (activePageId === 'page-player' && tizenOverlayActive) {
                        hideTizenOverlay();
                        return;
                    }
                    
                    if ($('#movie-details-modal').style.display === 'flex') {
                        hideMovieDetailsModal();
                    } else {
                        goBack();
                    }
                }
            });

            // --- NEW TIZEN PLAYER KEY HANDLER ---
            // Register keys for media playback
            try {
                tizen.key.registerKey("MediaPlayPause");
                tizen.key.registerKey("MediaPlay");
                tizen.key.registerKey("MediaPause");
                tizen.key.registerKey("MediaStop");
                tizen.key.registerKey("MediaFastForward");
                tizen.key.registerKey("MediaRewind");
            } catch (e) {
                console.warn("Could not register media keys.", e);
            }
            // --- END NEW HANDLER ---

        } else {
            console.log("Standard Web platform detected. Using HTML5 <video> player.");
        }
    } catch (e) {
        console.log("Error detecting Tizen, defaulting to Web.", e);
        isTizen = false;
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
    $('#api-connect-button').addEventListener('click', handleApiConnect);
    
    // Settings Page
    $('#logout-button').addEventListener('click', handleLogout);
    $('#change-api-button').addEventListener('click', () => {
        // Save current page to stack before moving
        pushToNavStack($$('.page[style*="block"]')[0].id);
        showPage('page-api-details');
    });
    
    // PERFORMANCE: Replace confirm() with a custom modal (TBD)
    // For now, confirm() is left but this is bad for Tizen
    
    $('#clear-favorites-button').addEventListener('click', () => {
        // TBD: Replace with custom modal
        // if (confirm('Are you sure you want to clear all favorites?')) {
            userSettings.favorites = [];
            saveUserSettings();
            showError('Favorites cleared.');
        // }
    });
    $('#clear-watched-button').addEventListener('click', () => {
         // TBD: Replace with custom modal
        // if (confirm('Are you sure you want to clear all watched progress?')) {
            userSettings.watched = {};
            saveUserSettings();
            showError('Watched progress cleared.');
        // }
    });
}

// --- NEW TIZEN PLAYER KEY HANDLER ---
function handleTizenPlayerKeys(e) {
    // If modal is active, only handle navigation within it
    if (tizenModalActive) {
        handleArrowNavigation(e.key, '#tizen-track-modal');
        if (e.key === 'Enter') {
            document.activeElement?.click();
        }
        return;
    }

    // If overlay is not active, specific keys should show it
    if (!tizenOverlayActive) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
            showTizenOverlay();
            // Don't consume the event, let it be handled again when overlay is visible
            // except for 'Enter' which just shows overlay
            if (e.key === 'Enter') return;
        }
    }

    // Handle Media Keys
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
            goBack(); // Exit player
            return;
    }
    
    // Handle Navigation only if overlay is active
    if (!tizenOverlayActive) return;

    // --- Overlay is Active ---
    if (e.key === 'Enter') {
        document.activeElement?.click();
        return;
    }
    
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        handleArrowNavigation(e.key, '#tizen-player-overlay');
        
        // Custom seek logic for progress bar
        const focused = document.activeElement;
        if (focused && focused.id === 'tizen-progress-bar') {
            if (e.key === 'ArrowLeft') tizenSeek('backward');
            if (e.key === 'ArrowRight') tizenSeek('forward');
        }
        
        // Keep overlay alive
        clearTimeout(tizenOverlayTimer);
        tizenOverlayTimer = setTimeout(hideTizenOverlay, 7000);
    }
}


function setupKeyListeners() {
    document.addEventListener('keydown', (e) => {
        const activePageId = navigationStack[navigationStack.length - 1]?.pageId;
        
        // --- NEW: Tizen Player Page Handling ---
        if (isTizen && activePageId === 'page-player') {
            e.preventDefault();
            handleTizenPlayerKeys(e);
            return; // Stop further execution
        }
        // --- END NEW ---

        const nav_buttons = [
            "ArrowUp",
            "ArrowRight",
            "ArrowDown",
            "ArrowLeft",
            "Enter",
        ];

        // 1. Global Keys
        if (e.key === 'Escape' || e.key === 'Back') { // Add 'Back' for webOS/etc
            // Check if modal is open
            if ($('#movie-details-modal').style.display === 'flex') {
                hideMovieDetailsModal();
            } else {
                goBack();
            }
            return;
        }
        
        // 2. Navigation Keys (Arrows/Enter)
        if ( nav_buttons.includes(e.key)) {
            e.preventDefault();
            
            // --- VIRTUAL LIST: Handle Enter Key ---
            if (e.key === 'Enter') {
                if (virtualList && activePageId === 'page-content' && document.activeElement.className=="theme-default") {
                    // Find the focused item by class and click it
                    const focusedEl = $('#page-content .vitem.focused');
                    if (focusedEl) {
                        focusedEl.click();
                        // focus_regesterer isn't reliable here
                    }
                } else {
                    // Normal page enter
                    document.activeElement?.click();
                    // focus_regesterer[activePageId] = document.activeElement; // This was removed, but logic is sound
                }
                return;
            }
            // --- END VIRTUAL LIST ---
            
            // Check if modal is open and handle nav inside it
            if ($('#movie-details-modal').style.display === 'flex') {
                handleArrowNavigation(e.key, '#movie-details-modal');
            } else {
                handleArrowNavigation(e.key);
            }
            return;
        }
        
        // 3. Context-specific Keys
        // This is updated to work with the new virtual list focus
        if (activePageId === 'page-content' || (activePageId === 'page-categories' && (navigationStack[navigationStack.length-1].context?.special === 'favorites' || navigationStack[navigationStack.length-1].context?.special === 'watched'))) {
            
            let targetItem;
            if (virtualList) {
                // Get item from virtual list
                targetItem = virtualListItems[focusedVirtualIndex];
            } else {
                // Get item from DOM
                const focusedElement = document.activeElement;
                if (focusedElement && focusedElement.dataset.item) {
                    targetItem = JSON.parse(focusedElement.dataset.item);
                }
            }
            
            if (!targetItem) return; // No item to action
            
            const type = targetItem.stream_type || virtualListType;
            const stream_id = targetItem.stream_id || targetItem.series_id;

            if (e.key === 'f') {
                toggleFavorite(stream_id, type, targetItem);
                // Update UI (virtual list will auto-update on next render, but we can force)
                if(virtualList) virtualList.highlight(focusedVirtualIndex);
                // TODO: Update non-virtual list UI
            }
            if (e.key === 'w') {
                toggleWatchLater(stream_id, type, targetItem);
            }
        }
    });
}

function handleArrowNavigation(key, parentSelector = null) {
    const activePage = parentSelector ? $(parentSelector) : $('.page[style*="block"]');
    if (!activePage) return;
    
    // --- NEW VIRTUAL LIST NAVIGATION ---
    // If we are on page-content and the virtual list is active, use index-based nav
    if (activePage.id === 'page-content' && virtualList) {
        const cols = virtualList.getCols();
        const itemCount = virtualListItems.length;
        let newIndex = focusedVirtualIndex;

        if (key === 'ArrowRight') {
            if (newIndex + 1 < itemCount) newIndex++;
        } else if (key === 'ArrowLeft') {
            if (newIndex - 1 >= 0) newIndex--;
        } else if (key === 'ArrowDown') {
            // Move down by a row (cols)
            if (newIndex + cols < itemCount) {
                 newIndex += cols;
            } else {
                // If at bottom, go to last item
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
        return; // We are done
    }
    // --- END VIRTUAL LIST NAVIGATION ---
    
    // --- START: Original DOM-based navigation for all other pages ---
    let focusableItems = [];
    
    if (parentSelector) {
        // We are inside a modal or overlay
        focusableItems = Array.from(activePage.querySelectorAll('.nav-item, .nav-item-sm'));
    } else if (activePage.id === 'page-categories') {
         focusableItems = Array.from(activePage.querySelectorAll('#category-grid .nav-item'));
    } else if (activePage.id === 'page-content') {
         // This now only runs for NON-VIRTUAL lists
         focusableItems = Array.from(activePage.querySelectorAll('#content-grid .nav-item'));
    } else if (activePage.id === 'page-series-details') {
        focusableItems = Array.from(activePage.querySelectorAll('#series-fav-button, #series-watch-later-button, #series-seasons-tabs .nav-item, #series-episodes-list .nav-item'));
    } else if (activePage.id === 'page-main') {
         focusableItems = Array.from(activePage.querySelectorAll('[onclick*="loadCategories"]'));
    } else {
        focusableItems = Array.from(activePage.querySelectorAll('.nav-item, .nav-item-sm'));
    }

    // TIZEN OVERLAY: Don't include header buttons if it's the player overlay
    if (parentSelector !== '#tizen-player-overlay') {
        const headerButtons = Array.from($$("#global-header button"));
        focusableItems = [...headerButtons, ...focusableItems];
    }
    
    if (focusableItems.length === 0) return;

    let currentIndex = focusableItems.indexOf(document.activeElement);
    
    if (currentIndex === -1) {
        let firstItem;
        if (parentSelector === '#tizen-player-overlay') {
            firstItem = $('#tizen-play-pause-button'); // Default to play/pause
        } else {
            firstItem = focusableItems[0];
        }
        if (firstItem) firstItem.focus();
        return;
    }

    // Get geometry
    const currentRect = focusableItems[currentIndex].getBoundingClientRect();
    
    let nextItem = null;
    let minDistance = Infinity;
    
    // Simple grid logic for grids
    const grid = activePage.querySelector('#content-grid, #category-grid');
    if (grid && !parentSelector) { // Only apply grid logic if not in modal
        
        let columns = 1;
        // Get computed columns for category grid or non-virtual content grid
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
            // --- FIX: Use 'nearest' here too ---
            focusableItems[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }
    }
    
    // Fallback: Find closest item in the desired direction (for mixed layouts)
    focusableItems.forEach((item, index) => {
        if (index === currentIndex) return;
        const itemRect = item.getBoundingClientRect();
        let isCandidate = false;
        let distance = Infinity;

        switch (key) {
            case 'ArrowRight':
                if (itemRect.left > currentRect.left || (itemRect.left === currentRect.left && itemRect.top > currentRect.top)) {
                    isCandidate = true;
                    distance = Math.hypot(itemRect.left - currentRect.left, (itemRect.top - currentRect.top) * 2); // Prioritize horizontal
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
                    distance = Math.hypot((itemRect.left - currentRect.left) * 2, itemRect.top - currentRect.top); // Prioritize vertical
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
        nextItem.focus();
        // --- FIX: Use 'nearest' to scroll the minimum amount ---
        nextItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // --- FIX: REMOVED two lines here that were causing errors ---
    // The lines 'virtualList.ensureVisible(focusedIndex);'
    // and 'virtualList.highlight(focusedIndex);' were here
    // and breaking navigation on all non-virtual pages.

    // --- END: Original DOM-based navigation ---
}