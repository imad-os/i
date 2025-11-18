// === Navigation & Routing ===

// NEW: Simple cleanup function for the virtual list
function cleanupVirtualisation() {
    console.log("Cleaning up virtual list.");
    if (virtualList) {
        virtualList.destroy();
        virtualList = null;
    }
    virtualListItems = [];
    focusedVirtualIndex = 0;
    
    // Reset grid styles (important!)
    const grid = $('#content-grid');
    if (grid) {
        // Restore to default non-virtual state
        grid.className = GRID_CLASS_DEFAULT; // Use global const
        grid.style.height = 'auto'; // Remove sizer height
    }
}


function reFocus(pageId){
    console.log(" reFocus : ",pageId)
    const targetPage = $(`#${pageId}`);
    if (targetPage) {
        targetPage.style.display = 'block';
        
        // --- VIRTUAL LIST FOCUS ---
        // For virtual list, we don't scroll to top or focus,
        // we let the virtual list handle it.
        if (pageId === 'page-content' && virtualList) {
            virtualList.highlight(focusedVirtualIndex);
            return; 
        }
        // --- END VIRTUAL LIST FOCUS ---

        targetPage.scrollTop = 0; // Scroll to top for normal pages
        
        // Focus the first item
        let firstItem;
        if (pageId === 'page-content') {
             // Focus first item in NON-virtual grid
             firstItem = targetPage.querySelector('#content-grid .nav-item');
        } else if (pageId === 'page-series-details') {
            firstItem = targetPage.querySelector('#series-fav-button, #series-watch-later-button, .nav-item, .nav-item-sm');
        } else {
             firstItem = targetPage.querySelector('.nav-item, .nav-item-sm');
        }
        
        // REMOVED: Broken focus_regesterer logic
        if(firstItem){
            setTimeout(() => firstItem.focus(), 100);
            console.log(" reFocus : ",pageId, " -> firstitem")
        }

    } else {
        console.error(`Page not found: ${pageId}`);
    }
}
function showPage(pageId) {
    // Manage Global Header state
    const globalHeader = $('#global-header');
    const globalBackButton = $('#global-back-button');
    const globalTitle = $('#global-header-title');

    // Default state (for main menu)
    globalBackButton.style.display = 'none';
    globalTitle.style.display = 'none';

    if (pageId === 'page-player' && 1==2) { // This (1==2) is strange, but leaving it as it was
        globalHeader.style.display = 'none';
    } else if (pageId === 'page-user-login' || pageId === 'page-api-details') {
        // Hide header for login pages
        globalHeader.style.display = 'none';
    } else if (pageId === 'page-main') {
        globalHeader.style.display = 'flex'; // Show header
        // Default state is already set for main menu
    } else {
        // For all other pages (categories, content, settings, etc.)
        globalHeader.style.display = 'flex';
        globalBackButton.style.display = 'block';
        globalTitle.style.display = 'block';
    }
    
    // --- VIRTUALIZATION CLEANUP ---
    // If we are navigating *away* from page-content, clear the virtual list
    const currentPageEl = $$('.page[style*="block"]')[0];
    if (virtualList && (!currentPageEl || currentPageEl.id !== 'page-content') && pageId !== 'page-content') {
        cleanupVirtualisation();
    }
    
    // --- END VIRTUALIZATION ---

    $$('.page').forEach(page => page.style.display = 'none');

    reFocus(pageId);

}

function pushToNavStack(pageId, context = {}) {
    // Avoid pushing the same page twice
    if (navigationStack.length > 0 && navigationStack[navigationStack.length-1].pageId === pageId) {
        navigationStack[navigationStack.length-1].context = context; // update context
        return;
    }
    navigationStack.push({ pageId, context });
    
    updateHashFromState({ pageId, context });
}

function showSettingsPage() {
    pushToNavStack($$('.page[style*="block"]')[0].id); // Save current page
    $('#setting-username').textContent = currentUsername;
    $('#global-header-title').textContent = 'Settings';
    showPage('page-settings');
    pushToNavStack('page-settings');
}

function goBack() {
    const currentPage = navigationStack.pop();
    if (!currentPage) return; // Should not happen

    if (currentPage.pageId === 'page-player') {
        stopPlayer();
    }

    if (navigationStack.length === 0) {
        showPage('page-main');
        pushToNavStack('page-main');
        return;
    }

    const lastState = navigationStack[navigationStack.length - 1];
    if (lastState) {
        showPage(lastState.pageId);
        // Update title based on the page we're going *back* to
        // This will be re-set by load functions, but good for immediate feedback
        if(lastState.pageId === 'page-categories') {
            $('#global-header-title').textContent = 'Categories';
        } else if (lastState.pageId === 'page-content') {
             $('#global-header-title').textContent = 'Content';
        }
        
        updateHashFromState(lastState); // <-- SYNC URL HASH
    }
}

// NEW: Function to update the URL hash based on app state
function updateHashFromState(state) {

    return; // Hashing disabled as requested
    
    if (!state) state = navigationStack[navigationStack.length - 1]; // Get current state
    if (!state) return; // No state

    const { pageId, context } = state;
    let hash = '';

    try {
        if (pageId === 'page-user-login') {
            hash = '#login';
        } else if (pageId === 'page-main') {
            hash = '#main';
        } else if (pageId === 'page-settings') {
            hash = '#settings';
        } else if (pageId === 'page-categories') {
            hash = `#categories/${context.type}`; // e.g., #categories/vod
        } else if (pageId === 'page-content') {
            const type = context.type === 'vod' ? 'movies' : context.type;
            hash = `#${type}/${context.categoryId}`; // e.g., #movies/all
        } else if (pageId === 'page-series-details') {
            hash = `#series/${context.seriesItem.series_id}`; // e.g., #series/1234
        } else if (pageId === 'page-player') {
            let playerHash = '#player';
            if (currentItem) {
                // Find category from *previous* stack item
                const lastState = navigationStack[navigationStack.length - 2];
                let catId = (lastState && lastState.context && lastState.context.categoryId) ? lastState.context.categoryId : 'all';
                    
                if (currentEpisode) { // Series Episode
                    // #series/catId/seriesId/episodeStreamId
                    playerHash = `#series/${catId}/${currentItem.series_id}/${currentEpisode.stream_id}`;
                } else if (currentItem.stream_type === 'vod') { // Movie
                    // #movies/catId/streamId
                    playerHash = `#movies/${catId}/${currentItem.stream_id}`;
                } else if (currentItem.stream_type === 'live') { // Live
                    // #live/catId/streamId
                    playerHash = `#live/${catId}/${currentItem.stream_id}`;
                }
            }
            hash = playerHash;
        } else {
            hash = `#${pageId}`; // Fallback
        }
    } catch (e) {
        console.warn("Could not generate hash:", e);
        hash = "#error";
    }

    if (hash && location.hash !== hash) {
        history.replaceState(null, '', hash);
    }
}

// NEW: Handles routing from a hash on page load
async function handleInitialHash(hash) {
    console.log("Handling initial hash:", hash);
    try {
        const parts = hash.substring(1).split('/'); // Remove # and split
        const page = parts[0];
        const id1 = parts[1]; // categoryId or series_id
        const id2 = parts[2]; // stream_id or series_id
        const id3 = parts[3]; // episode_stream_id

        if (!page) return false;

        switch (page) {
            case 'main':
                showPage('page-main');
                pushToNavStack('page-main');
                return true;
            
            case 'settings':
                showSettingsPage(); // This already handles nav stack
                return true;
            
            case 'categories':
                // #categories/vod
                if (id1) {
                    await loadCategories(id1); // This is async
                    return true;
                }
                break;
            
            case 'movies':
            case 'series':
            case 'live':
                const type = (page === 'movies') ? 'vod' : page; // 'vod', 'series', 'live'

                if (id1 && !id2) {
                    // Case 1: Content List (#movies/187) or Series Details (#series/1234)
                    if (type === 'series') {
                        // This is #series/1234 (Series Details)
                        showLoader(true);
                        // We don't have the full 'item', so we create a minimal one.
                        // loadSeriesInfo will fetch the rest.
                        const minimalSeriesItem = { series_id: id1, name: 'Loading...' };
                        await loadSeriesInfo(minimalSeriesItem); // This is async
                        showLoader(false);
                        return true;
                    } else {
                        // This is #movies/187 or #live/187 (Content List)
                        // We need the category name, but don't have it.
                        const categoryName = `Category ${id1}`;
                        await loadContent(type, id1, categoryName, {}); // This is async
                        return true;
                    }
                } else if (id1 && id2 && !id3) {
                    // Case 2: Movie Player (#movies/187/45) or Live Player (#live/187/45)
                    const stream_id = id2;
                    showLoader(true);
                    
                    if(type === 'vod') {
                        const info = await fetchXtream({ action: 'get_vod_info', vod_id: stream_id });
                        if (info && info.movie_data) {
                            // Reconstruct a minimal 'item' for handleMovieClick
                            const item = {
                                stream_id: info.movie_data.stream_id,
                                name: info.info.name,
                                rating: info.info.rating_5based,
                                movie_image: info.info.movie_image,
                                stream_type: 'vod'
                            };
                            // Build fake nav stack
                            pushToNavStack('page-main'); // So back button works
                            pushToNavStack('page-content', { type: 'vod', categoryId: id1, categoryName: `Category ${id1}` });
                            playMovie(item, 0, info); // This will show player and push nav stack
                            showLoader(false);
                            return true;
                        }
                    } else if (type === 'live') {
                        // Can't get single live stream info. Play directly.
                        const item = { stream_id: stream_id, name: "Live Stream", stream_type: 'live' };
                        pushToNavStack('page-main'); // So back button works
                        pushToNavStack('page-content', { type: 'live', categoryId: id1, categoryName: `Category ${id1}` });
                        playLive(item); // This pushes 'page-player'
                        showLoader(false);
                        return true;
                    }

                } else if (id1 && id2 && id3) {
                    // Case 3: Series Player (#series/187/1234/5678)
                    // catId: id1, series_id: id2, episode_stream_id: id3
                    if (type === 'series') {
                        showLoader(true);
                        // We need:
                        // 1. The series item (for series_id: id2)
                        // 2. The episode item (for stream_id: id3)
                        
                        const seriesInfo = await fetchXtream({ action: 'get_series_info', series_id: id2 });
                        if (seriesInfo) {
                            const minimalSeriesItem = { 
                                series_id: id2, 
                                name: seriesInfo.info.name, 
                                cover: seriesInfo.info.cover,
                                rating: seriesInfo.info.rating
                            };
                            
                            // Now find the episode
                            let targetEpisode = null;
                            for (const seasonNum in seriesInfo.episodes) {
                                const found = seriesInfo.episodes[seasonNum].find(ep => ep.stream_id == id3);
                                if (found) {
                                    targetEpisode = found;
                                    break;
                                }
                            }

                            if (targetEpisode) {
                                // We're about to play, so build the nav stack
                                pushToNavStack('page-main'); // So back button works
                                pushToNavStack('page-content', { type: 'series', categoryId: id1, categoryName: `Category ${id1}` });
                                pushToNavStack('page-series-details', { seriesItem: minimalSeriesItem });
                                playEpisode(targetEpisode, minimalSeriesItem, 0); // This pushes 'page-player'
                                showLoader(false);
                                return true;
                            }
                        }
                    }
                }
                break;
        }

        // Fallback if no route matched
        showLoader(false);
        return false;

    } catch (e) {
        console.error("Error during hash routing:", e);
        showLoader(false);
        return false;
    }
}