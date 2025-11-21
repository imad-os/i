// === Page Loading Logic ===

async function loadCategories(type) {
    let action = '', title = '';
    
    // Show Search Button on Category Pages
    $('#header-search-button').style.display = 'block';
    $('#header-search-button').onclick = () => toggleSearchBar(true);
    
    // --- LIVE TV BRANCH ---
    if (type === 'live') {
        initLiveTVInterface(); // Use specific Live TV logic
        return;
    }

    // --- VOD & SERIES BRANCH ---
    if (type === 'vod') {
        action = 'get_vod_categories'; title = 'Movie Categories';
        currnetCategory = "movies";
    } else if (type === 'series') {
        action = 'get_series_categories'; title = 'Series Categories';
        currnetCategory = "series";
    }

    const categories = await fetchXtream({ action });
    if (categories && Array.isArray(categories)) {
        $('#global-header-title').textContent = title;
        const grid = $('#category-grid');
        grid.innerHTML = ''; // Clear old
        
        // Hide search button on categories list (only needed on content list)
        $('#header-search-button').style.display = 'none';

        // --- FILTER & SORT CATEGORIES ---
        // 1. Filter hidden
        let visibleCategories = categories.filter(cat =>
            !userSettings.hiddenCategories.includes(String(cat.category_id))
        );

        // 2. Sort pinned to top
        visibleCategories.sort((a, b) => {
            const isPinnedA = userSettings.pinnedCategories.includes(String(a.category_id));
            const isPinnedB = userSettings.pinnedCategories.includes(String(b.category_id));
            if (isPinnedA && !isPinnedB) return -1;
            if (!isPinnedA && isPinnedB) return 1;
            return 0;
        });


        // --- ADD CUSTOM CARDS ---
        
        // 1. Favorites (NOW FOR ALL TYPES)
        if (userSettings.favorites.length > 0) {
             const hasFavorites = userSettings.favorites.some(id => {
                 const w = Object.values(userSettings.watching).find(w => (w.item.stream_id == id || w.item.series_id == id));
                 return w && w.type === type;
             });
             if (hasFavorites) {
                 grid.appendChild(createCategoryCard('Favorites', 'favorites', type, { special: 'favorites' }));
             }
        }
        
        // 2. Continue Watching / To Watch (VOD/Series only)
        if (type === 'vod' || type === 'series') {
            const watchingItems = Object.values(userSettings.watching).filter(w => w.type === type && w.progress_sec > 0);
            if (watchingItems.length > 0) {
                grid.appendChild(createCategoryCard('Continue Watching', 'watching', type, { special: 'watching' }));
            }
        }
        
        // 3. API Categories
        visibleCategories.forEach(cat => {
            grid.appendChild(createCategoryCard(cat.category_name, cat.category_id, type));
        });
        
        showPage('page-categories');
        pushToNavStack('page-categories', { type });
    }
}

function createCategoryCard(name, id, type, context = {},) {
    let icon = "";
    if(id=='favorites') {
        icon = "❤️";
    }else if(id=='watching') {
        icon = "▶️";
    }else if(userSettings.pinnedCategories.includes(id)){
        icon = "📌";
    }
    const card = document.createElement('div');
    card.className = 'nav-item p-6 rounded-lg bg-card text-center cursor-pointer transition-all hover:bg-opacity-80';
    card.innerHTML = `<h3 class="text-lg font-bold text-main" style="display: inline-block;">${name}</h3> <span style="float: inline-end;">${icon}</span>`;
    card.onclick = () => loadContent(type, id, name, context);
    card.setAttribute('tabindex', '0'); 
    return card;
}

// =====================================================
// === FILTER & SEARCH LOGIC (NEW) ===
// =====================================================

function filterContent(query) {
    const q = query.toLowerCase().trim();
    let filtered = [];
    
    // 1. Filter Data
    if (!q) {
        filtered = searchState.originalItems;
    } else {
        filtered = searchState.originalItems.filter(item => 
            (item.name || '').toLowerCase().includes(q)
        );
    }
    console.log("Filtered items count:", filtered.length);
    // 2. Determine Context and Re-render
    const activePage = $$('.page[style*="block"]')[0];
    
    if (activePage && activePage.id === 'page-live-tv') {
        // Live TV: Re-render channel list DOM only
        renderLiveChannelsDOM(filtered);
        
    } else if (activePage && activePage.id === 'page-content') {
        // VOD/Series: Check Virtualization
        const grid = $('#content-grid');
        console.log("filterContent - virtualList:", virtualList);
        virtualListItems = filtered;
        renderItems(virtualListItems, "vod", 1, currnetCategory,{},true);

    }
}


// =====================================================
// === LIVE TV INTERFACE LOGIC (3-Column View) ===
// =====================================================

async function initLiveTVInterface() {
    $('#global-header-title').textContent = 'Live TV';
    
    // Enable search for Live TV
    $('#header-search-button').style.display = 'block';
    $('#header-search-button').onclick = () => toggleSearchBar(true);

    showPage('page-live-tv');
    pushToNavStack('page-live-tv'); // Push Live TV page to stack
    
    const categoryList = $('#live-categories-list');
    categoryList.innerHTML = '<div class="loader mx-auto mt-4"></div>';
    $('#live-channels-list').innerHTML = ''; // Clear channels
    
    try {
        // 1. Fetch Categories
        const categories = await fetchXtream({ action: 'get_live_categories' });
        categoryList.innerHTML = ''; // Clear loader
        
        if (categories && Array.isArray(categories)) {
            // Filter & Sort
            let visibleCategories = categories.filter(cat => !userSettings.hiddenCategories.includes(String(cat.category_id)));
            visibleCategories.sort((a, b) => {
                const isPinnedA = userSettings.pinnedCategories.includes(String(a.category_id));
                const isPinnedB = userSettings.pinnedCategories.includes(String(b.category_id));
                return (isPinnedA === isPinnedB) ? 0 : isPinnedA ? -1 : 1;
            });

            if (userSettings.favorites.length > 0) {
                 const favBtn = createLiveCategoryItem('Favorites', 'favorites');
                 categoryList.appendChild(favBtn);
            }

            visibleCategories.forEach(cat => {
                const btn = createLiveCategoryItem(cat.category_name, cat.category_id);
                categoryList.appendChild(btn);
            });
            
            // Focus first category
            const first = categoryList.querySelector('.nav-item');
            if(first) first.focus();
        }
    } catch (e) {
        console.error("Error loading Live TV categories:", e);
        categoryList.innerHTML = '<p class="text-red-500 p-2">Error loading categories</p>';
    }
}

function createLiveCategoryItem(name, id) {
    const btn = document.createElement('button');
    btn.className = 'nav-item w-full text-left p-3 rounded bg-card text-main hover:bg-opacity-80 mb-1 text-sm font-semibold truncate';
    btn.textContent = name;
    btn.dataset.id = id;
    btn.onclick = () => loadLiveChannels(id, name);
    btn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'Enter') {
            loadLiveChannels(id, name);
        }
    });
    return btn;
}

async function loadLiveChannels(categoryId, categoryName) {

    // Highlight active channel in list
    $$('#live-categories-list .nav-item').forEach(b => b.classList.remove('bg-primary', 'text-white'));
    const currnetCat = $('#live-categories-list .nav-item[data-id="' + categoryId + '"]');
    currnetCat.classList.remove('bg-card');
    currnetCat.classList.add('bg-primary', 'text-white');

    
    const channelList = $('#live-channels-list');
    $('#live-channels-title').textContent = categoryName;
    channelList.innerHTML = '<div class="loader mx-auto mt-4"></div>';
    
    try {
        let streams = [];
        if (categoryId === 'favorites') {
             streams = userSettings.favorites
                .map(id => {
                    const w = Object.values(userSettings.watching).find(w => w.item.stream_id == id);
                    return w ? w.item : null;
                })
                .filter(item => item && item.stream_type === 'live');
        } else {
            streams = await fetchXtream({ action: 'get_live_streams', category_id: categoryId });
        }
        
        // --- SEARCH BACKUP ---
        searchState.originalItems = streams || [];
        
        // Render
        renderLiveChannelsDOM(streams);

    } catch (e) {
        console.error("Error loading channels:", e);
        channelList.innerHTML = '<p class="text-red-500 p-2">Error loading channels</p>';
    }
}

/**
 * Helper to render the channel list buttons. Separated for Search Filtering.
 */
function renderLiveChannelsDOM(streams) {
    const channelList = $('#live-channels-list');
    channelList.innerHTML = '';

    if (!streams || !Array.isArray(streams) || streams.length === 0) {
        channelList.innerHTML = '<p class="text-alt p-2">No channels found.</p>';
        return;
    }

    streams.forEach(stream => {
        const btn = document.createElement('button');
        btn.className = 'nav-item w-full flex items-center gap-3 p-2 rounded bg-card text-main hover:bg-opacity-80 mb-1 text-sm text-left';
        
        const iconSrc = stream.stream_icon || 'img/tv-icon.png'; 
        
        btn.innerHTML = `
            <img src="${iconSrc}" class="w-8 h-8 object-contain bg-black rounded" onerror="this.style.display='none'">
            <span class="truncate flex-1">${stream.name}</span>
        `;
        
        // Store item data
        btn.dataset.item = JSON.stringify(stream);
        
        // Click Handling
        btn.onclick = () => handleLiveChannelClick(stream, btn);
        
        // Navigation Handling
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                // Go back to Category List
                const currentCat = $('#live-categories-list .nav-item:focus') || $('#live-categories-list .nav-item');
                if (currentCat) currentCat.focus();
                e.stopPropagation(); 
            }
        });
        
        channelList.appendChild(btn);
    });
    
    // Move focus to first channel if focus isn't already inside (checked during search)
    if (!channelList.contains(document.activeElement)) {
        const first = channelList.querySelector('.nav-item');
        if(first) first.focus();
    }
}

let currentPreviewStreamId = null;

function handleLiveChannelClick(stream, btnElement) {
    if (currentPreviewStreamId === stream.stream_id) {
        console.log("Going Fullscreen for:", stream.name);
        playLive(stream); // Standard play function (will go fullscreen)
        return;
    }

    currentPreviewStreamId = stream.stream_id;
    
    // Highlight active channel in list
    $$('#live-channels-list .nav-item').forEach(b => b.classList.remove('bg-primary', 'text-white'));
    btnElement.classList.remove('bg-card');
    btnElement.classList.add('bg-primary', 'text-white');

    // Update Info Area
    $('#live-channel-name').textContent = stream.name;
    
    if (isTizen && typeof webapis !== 'undefined' && webapis.avplay) {
         try {
             try { webapis.avplay.stop(); } catch(e){}
             const url = `${xtreamConfig.host}/live/${xtreamConfig.username}/${xtreamConfig.password}/${stream.stream_id}.ts`;
             webapis.avplay.open(url);
             const container = $('#live-preview-container');
             const rect = container.getBoundingClientRect();
             webapis.avplay.setDisplayRect(Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height));
             webapis.avplay.prepareAsync(() => webapis.avplay.play());
         } catch(e) {
             console.error("Tizen preview error:", e);
         }
    } else {
        const container = $('#live-preview-container');
        container.innerHTML = ''; 
        const video = document.createElement('video');
        video.className = 'w-full h-full object-cover';
        video.controls = false;
        video.autoplay = true;
        video.src = `${xtreamConfig.host}/live/${xtreamConfig.username}/${xtreamConfig.password}/${stream.stream_id}.ts`;
        container.appendChild(video);
    }
}

// =====================================================
// === END LIVE TV LOGIC ===
// =====================================================


/**
 * Creates a DOM element for a single content card (Movie or Series).
 * This is used by the *NON-VIRTUAL* list.
 */
function createContentCard(item, type, context = {}) {
    console.log("createContentCard")
    const stream_id = item.stream_id || item.series_id;
    
    // --- Create Card Element ---
    const card = document.createElement('div');
    // Use nav-item for focus ring
    card.className = 'nav-item bg-card rounded-lg overflow-hidden shadow cursor-pointer aspect-[2/3] relative transition-all flex flex-col';
    card.setAttribute('tabindex', '0');

    // --- Create Internal Structure ---
    card.innerHTML = getCardInnerHTML(item, type, context);
    
    // --- Set initial data and handlers ---
    card.dataset.streamId = stream_id;
    card.dataset.type = type;
    card.dataset.item = JSON.stringify(item);

    // Attach listeners
    card.onclick = () => {
        // Must read fresh progress info on click
        const currentProgressInfo = getwatchingProgress(stream_id);
        const startTime = (context.special === 'watching' && currentProgressInfo) ? currentProgressInfo.progress_sec : 0;
        
        const currentItem = JSON.parse(card.dataset.item);
        
        if (type === 'vod') {
            handleMovieClick(currentItem, startTime);
        } else if (type === 'live') {
            playLive(currentItem);
        } else if (type === 'series') {
            if (context.special === 'watching' && currentProgressInfo && currentProgressInfo.episode) {
                playEpisode(currentProgressInfo.episode, currentItem, startTime);
            } else {
                loadSeriesInfo(currentItem);
            }
        }
    };
    
    const favButton = card.querySelector('.card-fav-button');
    if (favButton) {
        favButton.onclick = (e) => {
            e.stopPropagation();
            const currentItem = JSON.parse(card.dataset.item);
            toggleFavorite(stream_id, type, currentItem);
            favButton.innerHTML = getHeartIcon(isFavorite(stream_id));
        };
    }

    return card;
}

// --- NEW VIRTUAL LIST HELPERS ---

// --- GPU Texture Flush Helper ---
let __virtualFlushInterval = null;
function flushHiddenVirtualNodes() {
    try {
        if (!userSettings || !userSettings.gpu_memory_enhancer) return;
        const grid = $('#content-grid');
        if (!grid) return;
        const nodes = grid.querySelectorAll('.virtual-card');
        nodes.forEach(dom => {
            const style = window.getComputedStyle(dom);
            // If this node is not visible (display:none) or has no virtual index, flush heavy resources
            if (style.display === 'none' || !dom.dataset.virtualIndex) {
                try {
                    if (dom.__v && dom.__v.img) {
                        dom.__v.img.src = '';
                    }
                    if (dom.style.backgroundImage && dom.style.backgroundImage !== 'none') {
                        dom.style.backgroundImage = "url('data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=')";
                        dom.style.backgroundSize = '1px 1px';
                    }
                } catch (e) { /* best-effort */ }
            }
        });
    } catch (e) { console.warn('flushHiddenVirtualNodes error', e); }
}

function startVirtualFlushInterval() {
    stopVirtualFlushInterval();
    __virtualFlushInterval = setInterval(flushHiddenVirtualNodes, 1000);
}
function stopVirtualFlushInterval() {
    if (__virtualFlushInterval) { clearInterval(__virtualFlushInterval); __virtualFlushInterval = null; }
}

/**
 * Generates the innerHTML for a content card. Used by both virtual and non-virtual renderers.
 * NOTE: The virtual renderer will NOT use this HTML string — it's kept for the non-virtual path.
 */
function getCardInnerHTML(item, type, context = {}) {
    const poster = item.movie_image || item.icon || item.stream_icon || item.cover || `https://placehold.co/200x400/1F2937/FFFFFF?text=${encodeURIComponent(item.name)}`;
    const name = item.name;
    const rating = calcRating(item);
    const stream_id = item.stream_id || item.series_id;
    
    const progressInfo = getwatchingProgress(stream_id);
    const progressPercent = (progressInfo && progressInfo.duration_sec > 0) ? (progressInfo.progress_sec / progressInfo.duration_sec) * 100 : 0;
    
    let episodeTagHTML = '';
    if (type === 'series' && progressInfo && progressInfo.episode) {
        const s = String(progressInfo.episode.season).padStart(2, '0');
        const e = String(progressInfo.episode.episode_num).padStart(2, '0');
        episodeTagHTML = `<div class="card-episode-tag absolute top-2 left-2 px-2 py-1 bg-black/70 rounded text-xs font-bold text-main">S${s}E${e}</div>`;
    }
    
    const ratingBoxHTML = `
    <div class="absolute top-2 right-2 px-2 py-1 bg-black/70 rounded-full text-xs font-bold text-yellow-400 flex items-center gap-1">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
        <span class="card-rating-text">${Number(rating).toFixed(1)}</span>
    </div>`;
    
    const favButtonHTML = `<button class="card-fav-button nav-item-sm absolute bottom-12 left-2 p-1.5 bg-black/70 rounded-full">${getHeartIcon(isFavorite(stream_id))}</button>`;
    
    const progressBarHTML = (progressPercent > 0) ? `
    <div class="card-progress-bar progress-bar w-full">
        <div class="card-progress-bar-inner progress-bar-inner" style="width: ${progressPercent}%;"></div>
    </div>` : '';
    
    const nameHTML = `<h4 class="card-name font-semibold text-main truncate m-2">${name}</h4>`;
    
    // Main structure from createContentCard
    return `
    <div class="relative w-full h-full bg-card">
        <img src="${poster}" alt="${name}" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/200x400/1F2937/FFFFFF?text=${encodeURIComponent(name)}'; this.onerror=null;">
        ${episodeTagHTML}
        ${ratingBoxHTML}
        ${favButtonHTML}
        <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent">
            ${progressBarHTML}
            ${nameHTML}
        </div>
    </div>`;
}

/**
 * Lightweight, memory-safe renderer for virtual list nodes.
 * Reuses DOM elements instead of setting innerHTML every time.
 */
function renderVirtualItem(index, dom) {
    console.log("renderVirtualItem")
    const item = virtualListItems[index];
    if(!dom) return;
    // If there is no item for this index, release resources on the node so memory can be reclaimed
    if (!item) {
        // If we previously created DOM structure, clear the image src to free memory
        if (dom.__v && dom.__v.img) {
            dom.__v.img.src = '';
        }
        dom.style.display = 'none';
        dom.dataset.virtualIndex = '';
        dom.dataset.streamId = '';
        dom.dataset.type = '';
        return;
    }

    // Lazily create structured DOM for a virtual node and cache references on dom.__v
    if (!dom.__v) {
        dom.__v = {};
        dom.classList.add('nav-item');
        dom.classList.add('virtual-card');
        dom.tabIndex = 0;
        dom.style.overflow = 'hidden';
        dom.style.display = 'block';

        // image
        const img = document.createElement('img');
        img.className = 'w-full h-full object-cover';
        img.alt = '';
        img.loading = 'lazy';
        dom.appendChild(img);
        dom.__v.img = img;

        // episode tag
        const episodeTag = document.createElement('div');
        episodeTag.className = 'card-episode-tag absolute top-2 left-2 px-2 py-1 bg-black/70 rounded text-xs font-bold text-main';
        episodeTag.style.display = 'none';
        dom.appendChild(episodeTag);
        dom.__v.episodeTag = episodeTag;

        // rating box
        const ratingBox = document.createElement('div');
        ratingBox.className = 'absolute top-2 right-2 px-2 py-1 bg-black/70 rounded-full text-xs font-bold text-yellow-400 flex items-center gap-1';
        ratingBox.style.display = 'none';
        const ratingIcon = document.createElement('span');
        ratingIcon.className = 'sr-rating-icon';
        ratingBox.appendChild(ratingIcon);
        const ratingText = document.createElement('span');
        ratingText.className = 'card-rating-text';
        ratingBox.appendChild(ratingText);
        dom.appendChild(ratingBox);
        dom.__v.ratingBox = ratingBox;
        dom.__v.ratingText = ratingText;

        // fav button
        const favButton = document.createElement('button');
        favButton.className = 'card-fav-button nav-item-sm absolute bottom-12 left-2 p-1.5 bg-black/70 rounded-full';
        favButton.setAttribute('aria-label', 'Favorite');
        favButton.onclick = (e) => onVirtualFavClick(e, dom);
        dom.appendChild(favButton);
        dom.__v.favButton = favButton;

        // bottom overlay (name + progress)
        const bottom = document.createElement('div');
        bottom.className = 'absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 to-transparent';

        const progressBar = document.createElement('div');
        progressBar.className = 'card-progress-bar progress-bar w-full';
        const progressInner = document.createElement('div');
        progressInner.className = 'card-progress-bar-inner progress-bar-inner';
        progressInner.style.width = '0%';
        progressBar.appendChild(progressInner);
        bottom.appendChild(progressBar);
        dom.__v.progressInner = progressInner;

        const nameEl = document.createElement('h4');
        nameEl.className = 'card-name font-semibold text-main truncate';
        bottom.appendChild(nameEl);
        dom.__v.nameEl = nameEl;

        dom.appendChild(bottom);

        // attach click handler to whole dom
        dom.onclick = () => onVirtualCardClick(dom);
    }

    // Now update values
    const type = virtualListType;
    const stream_id = item.stream_id || item.series_id;

    dom.dataset.streamId = stream_id;
    dom.dataset.virtualIndex = index;
    dom.dataset.type = type;

    // Image: update src only if different to avoid re-request
    const poster = item.movie_image || item.icon || item.stream_icon|| item.cover || `https://placehold.co/200x400/1F2937/FFFFFF?text=${encodeURIComponent(item.name)}`;
    if (dom.__v.img.src !== poster) dom.__v.img.src = poster;
    dom.__v.img.alt = item.name || '';

    // Episode tag (series)
    if (type === 'series') {
        const progressInfo = getwatchingProgress(stream_id);
        if (progressInfo && progressInfo.episode) {
            const s = String(progressInfo.episode.season).padStart(2, '0');
            const e = String(progressInfo.episode.episode_num).padStart(2, '0');
            dom.__v.episodeTag.textContent = `S${s}E${e}`;
            dom.__v.episodeTag.style.display = '';
        } else {
            dom.__v.episodeTag.style.display = 'none';
        }
    } else {
        dom.__v.episodeTag.style.display = 'none';
    }

    // Rating
    const rating = calcRating(item);
    if (rating && Number(rating) > 0) {
        dom.__v.ratingText.textContent = Number(rating).toFixed(1);
        dom.__v.ratingBox.style.display = '';
    } else {
        dom.__v.ratingBox.style.display = 'none';
    }

    // Fav button icon
    dom.__v.favButton.innerHTML = getHeartIcon(isFavorite(stream_id));

    // Progress bar
    const progressInfo = getwatchingProgress(stream_id);
    const progressPercent = (progressInfo && progressInfo.duration_sec > 0) ? (progressInfo.progress_sec / progressInfo.duration_sec) * 100 : 0;
    dom.__v.progressInner.style.width = `${progressPercent}%`;

    // Name
    dom.__v.nameEl.textContent = item.name || '';

    // Focus
    if (index === focusedVirtualIndex) dom.classList.add('focused');
    else dom.classList.remove('focused');

    dom.style.display = '';
}

/**
 * Click handler for the virtual card itself. Uses stream id to find the original item rather than storing full JSON on the DOM.
 */
function onVirtualCardClick(dom) {
    const streamId = dom.dataset.streamId;
    const type = dom.dataset.type;
    if (!streamId || !type) return;

    const currentItem = virtualListMap && virtualListMap.get(streamId);
    if (!currentItem) return;

    const context = virtualListContext;
    const currentProgressInfo = getwatchingProgress(streamId);
    const startTime = (context.special === 'watching' && currentProgressInfo) ? currentProgressInfo.progress_sec : 0;

    if (type === 'vod') {
        console.log("onVirtualCardClick", currentItem)
        handleMovieClick(currentItem, startTime);
    } else if (type === 'live') {
        playLive(currentItem);
    } else if (type === 'series') {
        if (context.special === 'watching' && currentProgressInfo && currentProgressInfo.episode) {
            playEpisode(currentProgressInfo.episode, currentItem, startTime);
        } else {
            loadSeriesInfo(currentItem);
        }
    }
}

/**
 * Click handler for the virtual card's favorite button.
 */
function onVirtualFavClick(e, dom) {
    e.stopPropagation();
    const streamId = dom.dataset.streamId;
    const type = dom.dataset.type;
    if (!streamId || !type) return;

    const currentItem = virtualListMap && virtualListMap.get(streamId);
    if (!currentItem) return;

    toggleFavorite(streamId, type, currentItem);

    // Directly update icon on click for immediate feedback
    if (dom.__v && dom.__v.favButton) {
        dom.__v.favButton.innerHTML = getHeartIcon(isFavorite(streamId));
    }
}

// --- END VIRTUAL LIST HELPERS ---

/**
 * Loads content (Live, VOD, Series) and decides whether to virtualize.
 */
async function loadContent(type, categoryId, categoryName = 'Content', context = {}) {
    let items = [];
    let title = categoryName;
    
    // Enable Search Button
    $('#header-search-button').style.display = 'block';
    $('#header-search-button').onclick = () => toggleSearchBar(true);

    if (typeof DetailsView !== 'undefined') {
        DetailsView.enable(false);
    }
    if (context.special === 'watching') {
        items = Object.values(userSettings.watching)
            .filter(w => w.type === type && w.progress_sec > 0)
            .map(w => w.item);
    } else if (context.special === 'favorites') {
         items = userSettings.favorites
            .map(id => {
                 const watchingItem = Object.values(userSettings.watching).find(w => 
                    (w.item.stream_id == id || w.item.series_id == id)
                );
                return watchingItem ? watchingItem : null;
            })
            .filter(entry => { // Filter by type
                if (!entry || !entry.item) return false;
                if (type === 'live') return entry.type === 'live';
                if (type === 'vod') return entry.type === 'vod';
                if (type === 'series') return entry.type === 'series';
                return false;
            })
            .map(entry => entry.item); // Get the item
    } else {
        let action = '';
        if (type === 'live') action = 'get_live_streams';
        else if (type === 'vod') action = 'get_vod_streams';
        else if (type === 'series') action = 'get_series';

        const params = { action };
        if (categoryId !== 'all') params.category_id = categoryId;
        items = await fetchXtream(params);
    }

    renderItems(items, type, categoryId, categoryName, context);
}


function renderItems(items, type, categoryId, categoryName, context = {},is_earch=false) {
    const title = categoryName;
    if (items && Array.isArray(items)) {
        $('#global-header-title').textContent = `${title} (${items.length})`;
        
        // --- SEARCH BACKUP ---
        if (!is_earch){
            searchState.originalItems = items;
        }
        

        // Clean up previous list *before* clearing grid
        if (virtualList) {
            cleanupVirtualisation();
        }
        // Ensure any background flush interval is stopped before creating/clearing grid
        stopVirtualFlushInterval();
        
        const grid = $('#content-grid');
        grid.innerHTML = ''; // Clear old

        if (items.length === 0) {
            grid.className = grid_class;
            grid.innerHTML = `<p class="text-alt col-span-full">No items found.</p>`;
            
            showPage('page-content'); // Show page even if empty
            pushToNavStack('page-content', { type, categoryId, categoryName, context });
            return;
        }

        // --- VIRTUALIZATION DECISION ---
        // Use a threshold to decide
        const threshold = 50; 
        // FORCE NON-VIRTUAL FOR LIVE TV (As per request, although standard loadContent is usually for grid)
        // The new Live TV UI uses initLiveTVInterface, so this path is mostly for VOD/Series.
        console.log("renderItems", items.length, type)
        if ((type === 'vod' || type === 'series')) {
            // *** VIRTUALIZED PATH ***
            console.log(`Initializing virtual list for ${items.length} items.`);
            
            // 1. Store global data
            virtualListItems = items;
            virtualListType = type;
            virtualListContext = context;
            focusedVirtualIndex = 0;

            // Build a small map for id->item lookups (avoids storing big JSON strings in DOM)
            virtualListMap = new Map();
            virtualListItems.forEach(it => {
                const key = it.stream_id || it.series_id;
                if (key) virtualListMap.set(String(key), it);
            });

            // 2. Clear grid styles for virtual list container
            grid.className = '';
            grid.style.height = '100%'; // Container must have height

            // 3. Define card geometry
            const itemWidth = 150; // w-64
            const itemHeight = 200; // h-96 (aspect-ratio 2/3)
            
            // 4. Create list
            virtualList = createVirtualList({
                container: grid,
                itemCount: virtualListItems.length,
                renderItem: renderVirtualItem,
            });
            
            // 5. Set initial focus highlight
            virtualList.highlight(focusedVirtualIndex);

            // 6. Start GPU texture flush interval (if enhancer mode enabled)
            if (userSettings && userSettings.gpu_memory_enhancer) {
                startVirtualFlushInterval();
            }

            //const content_gride_width = parseInt((state.cols*state.colWidth) + (16 * state.cols));
            //$('#content-grid div').style.width  =  `${content_gride_width}px`;

        } else {
            // *** NON-VIRTUALIZED PATH (Small list or legacy fallback) ***
            // Ensure any virtual flush interval is stopped
            stopVirtualFlushInterval();
            console.log(`Rendering non-virtualized list for ${items.length} items.`);
            // Ensure grid is reset to normal
            grid.className = grid_class;
            
            const fragment = document.createDocumentFragment();
            items.forEach(item => {
                const card = createContentCard(item, type, context);
                fragment.appendChild(card);
            });
            grid.appendChild(fragment); // Append all at once
        }
        // --- END DECISION ---
        
        showPage('page-content');
        pushToNavStack('page-content', { type, categoryId, categoryName, context });
    }
}
// === SERIES IMPLEMENTATION ===

async function loadSeriesInfo(seriesItem) {
    showLoader(true);
    try {
        const info = await fetchXtream({ action: 'get_series_info', series_id: seriesItem.series_id });
        if (!info) throw new Error("Could not load series info.");

        // 1. Populate Details
        $('#global-header-title').textContent = info.info.name || seriesItem.name;
        $('#series-cover-image').src = info.info.cover || seriesItem.cover || 'https://placehold.co/400x600/374151/FFFFFF?text=No+Image';
        $('#series-title').textContent = info.info.name || seriesItem.name;
        $('#series-plot').textContent = info.info.plot || 'No description available.';
        $('#series-year').textContent = info.info.releaseDate || seriesItem.releaseDate || 'Unknown Year';

        const fullSeriesItem = { ...seriesItem, ...info.info, series_id: seriesItem.series_id, stream_type: 'series' };
        const seriesId = seriesItem.series_id;

        // --- FAV BUTTON LOGIC ---
        const seriesFavButton = $('#series-fav-button');
        const updateSeriesFavIcon = () => {
            seriesFavButton.innerHTML = getHeartIcon(isFavorite(seriesId));
        };
        seriesFavButton.onclick = (e) => {
            e.stopPropagation();
            toggleFavorite(seriesId, 'series', fullSeriesItem); 
            updateSeriesFavIcon();
        };
        updateSeriesFavIcon();


        // 2. Populate Seasons
        const seasonTabs = $('#series-seasons-tabs');
        seasonTabs.innerHTML = '';
        const episodesBySeason = info.episodes;
        
        if (!episodesBySeason || Object.keys(episodesBySeason).length === 0) {
             $('#series-episodes-list').innerHTML = '<p class="text-alt">No episodes found for this series.</p>';
             showLoader(false);
             showPage('page-series-details');
             pushToNavStack('page-series-details', { seriesItem: fullSeriesItem }); // Pass full item
             return;
        }

        const seasonNumbers = Object.keys(episodesBySeason).sort((a, b) => Number(a) - Number(b));
        
        seasonNumbers.forEach((seasonNum, index) => {
            const tab = document.createElement('button');
            tab.className = 'nav-item season-tab px-4 py-2 rounded-lg bg-alt text-alt font-semibold';
            tab.textContent = `Season ${seasonNum}`;
            tab.dataset.seasonNum = seasonNum;
            tab.onclick = () => {
                // Update active tab style
                $$('.season-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                // Load episodes
                loadSeasonEpisodes(episodesBySeason[seasonNum], fullSeriesItem); // Pass full item
            };
            seasonTabs.appendChild(tab);
        });

        // 3. Load First Season's Episodes
        if (seasonNumbers.length > 0) {
            const firstSeasonKey = seasonNumbers[0];
            loadSeasonEpisodes(episodesBySeason[firstSeasonKey], fullSeriesItem); // Pass full item
            // Set first tab as active
            setTimeout(() => {
                 const firstTab = $('.season-tab');
                 if(firstTab) firstTab.classList.add('active');
            }, 0);
        }

        showPage('page-series-details');
        pushToNavStack('page-series-details', { seriesItem: fullSeriesItem }); // Pass full item

    } catch (e) {
        console.error("Error loading series info:", e);
        showError("Could not load series details.");
    } finally {
        showLoader(false);
    }
}

function loadSeasonEpisodes(episodes, seriesItem) {
    const episodesList = $('#series-episodes-list');
    episodesList.innerHTML = '';
    
    if (!episodes || episodes.length === 0) {
        episodesList.innerHTML = '<p class="text-alt">No episodes found for this season.</p>';
        return;
    }

    episodes.forEach(episode => {
        const epCard = document.createElement('button');
        epCard.className = 'nav-item w-full p-4 rounded-lg bg-card text-left text-main hover:bg-opacity-80 flex justify-between items-center';
        
        const progress = getwatchingProgress(seriesItem.series_id, episode.id);
        const progressPercent = (progress && progress.duration_sec > 0) ? (progress.progress_sec / progress.duration_sec) * 100 : 0;
        
        epCard.innerHTML = `
            <div class="flex-1">
                <span class="text-primary font-bold">E${episode.episode_num}</span>: ${episode.title}
                ${progressPercent > 0 ? `
                <div class="progress-bar w-full mt-2">
                    <div class="progress-bar-inner" style="width: ${progressPercent}%;"></div>
                </div>
                ` : ''}
            </div>
            <span class="text-alt text-sm">${episode.duration || ''}</span>
        `;
        
        epCard.onclick = () => {
            const startTime = progress ? progress.progress_sec : 0;
            playEpisode(episode, seriesItem, startTime);
        };
        
        episodesList.appendChild(epCard);
    });
    
     // Focus first episode
     const firstEpisode = episodesList.querySelector('.nav-item');
     if (firstEpisode) {
         firstEpisode.focus();
     }
}