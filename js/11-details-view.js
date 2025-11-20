// Optimized Details View Module for low-RAM / low-CPU Tizen TVs
// - Persistent DOM (no full innerHTML rewrites)
// - Lightweight updates (textContent / src changes only)
// - Stable-focus detection before heavy fetch
// - Trailer iframe loaded only on user action (ENTER)
// - Optional requestIdleCallback usage
// - Minimal allocations, defensive checks for virtualized grids

let fetchTimeout = null;
let renderTimeout = null;


const DetailsView = (function(){
    // Private DOM refs (created once)
    let container = null;
    let panel = null;
    let elPoster = null;
    let elTitle = null;
    let elMeta = null;
    let elRating = null;
    let elFavBtn = null;
    let elPlot = null;
    let elTech = null;
    let elLoader = null;
    let elTrailerBtn = null;
    let trailerLoadedFor = null;

    // State
    let currentStreamId = null;
    let parsedCache = new WeakMap(); // caches parsed dataset objects for DOM nodes

    // Configuration (tweak for UX/perf)
    // Global adjustable config
const DETAILS_CONFIG = {
    BASIC_RENDER_DELAY_MS: 2000,
    HEAVY_FETCH_DELAY_MS: 5000,
    USE_REQUEST_IDLE: true
};

// Remove old constants
const BASIC_RENDER_DELAY_MS = DETAILS_CONFIG.BASIC_RENDER_DELAY_MS;
const HEAVY_FETCH_DELAY_MS = DETAILS_CONFIG.HEAVY_FETCH_DELAY_MS; // heavy fetch after stable focus (2s recommended for low-end TVs)
    // (Replaced by DETAILS_CONFIG.USE_REQUEST_IDLE) // will use requestIdleCallback when available

    // Helpers
    function $id(id){ return document.getElementById(id); }

    function safeParseDataset(node){
        if(!node) return null;
        if(parsedCache.has(node)) return parsedCache.get(node);
        const raw = node.dataset.item;
        if(!raw) return null;
        try{
            const obj = JSON.parse(raw);
            parsedCache.set(node, obj);
            return obj;
        }catch(e){
            return null;
        }
    }
    function setFavBtn(){
        const heart_color = isFavorite(currentStreamId) ? "#ff0000" : "#00000000";
        $("#details-fav-btn  svg path").setAttribute("fill", heart_color);
    }
    function ensurePanel(){
        if(panel) return;
        container = document.getElementById('page-content') || document.body;
        // If a panel exists in DOM, wire elements, otherwise create minimal persistent DOM
        panel = document.getElementById('details-view-panel');
        if(!panel){
            panel = document.createElement('aside');
            panel.id = 'details-view-panel';
            panel.className = 'hidden h-full overflow-y-auto bg-gray-900 border-l border-gray-700 shadow-2xl relative p-2';

            // Build persistent DOM children (only once)
            panel.innerHTML = `
                <div id="details-loader" class="hidden absolute inset-0 z-50 bg-black/50 flex items-center justify-center">
                    <div class="loader"></div>
                </div>
                <button id="details-media" class="w-full bg-black rounded-lg overflow-hidden shadow-lg mb-4 relative">
                    <img id="details-poster" alt="poster" class="w-full h-full object-cover opacity-90" src="https://placehold.co/300x500/374151/FFFFFF?text=Poster">
                </button>

                <div class="mb-3 flex justify-between items-start">
                    <div class="flex-1 pr-4">
                        <h2 id="details-title" class="text-2xl font-bold text-white leading-tight mb-1"></h2>
                        <div id="details-meta" class="text-sm text-gray-300"></div>
                    </div>
                    <div class="flex flex-col items-end gap-2">
                        <div id="details-rating" class="text-yellow-400 font-bold">★ 0.0</div>
                    </div>
                </div>
                <div class="mb-1 flex justify-between items-start">
                    <div id="details-tech" class="text-sm text-gray-300"></div>
                </div>
                
                <div>
                    <button id="details-play" class="nav-item-sm p-2 bg-card rounded-full focus:outline-none" title="Play">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-main" fill="var(--color-primary)" viewBox="0 0 24 24" stroke="var(--color-primary)">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5l12 7-12 7V5z" /></svg>
                    </button>

                    <button id="details-trailer-btn" class="hidden nav-item-sm p-2 bg-card rounded-full focus:outline-none" title="Trailer">
                        <svg xmlns="http://www.w3.org/2000/svg" 
                            class="w-6 h-6 text-main" 
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="var(--color-primary)">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M3 8h18v11H3V8zm0-3l3 3m3-3l3 3m3-3l3 3" />
                        </svg>
                    </button>

                    <button id="details-fav-btn" class="nav-item-sm p-2 bg-card rounded-full focus:outline-none">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 fill-text" fill="#00000000" viewBox="0 0 24 24" stroke="red">
                        <path  fill="#00000000" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg></button>
                </div>

                <div id="details-extended" class="space-y-3 text-sm text-gray-300">
                    <p id="details-plot" class="text-gray-400 italic">Select an item to view details</p>
                </div>

                <button id="details-back" class="nav-item-sm p-2 bg-card rounded-full focus:outline-none" title="Play">
                    <!-- return Button SVG -->
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-main" fill="#fff" viewBox="0 0 24 24" stroke="#fff">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                    </svg>

                </button>
                `;

            container.appendChild(panel);
        }

        // Query sub-elements and cache
        elPoster = $id('details-poster');
        elTitle = $id('details-title');
        elMeta = $id('details-meta');
        elRating = $id('details-rating');
        elFavBtn = $id('details-fav-btn');
        elPlot = $id('details-plot');
        elTech = $id('details-tech');
        elLoader = $id('details-loader');
        elTrailerBtn = $id('details-trailer-btn');
        elPlayrBtn = $id('details-play');

        // Attach persistent handlers
        if(elFavBtn){
            elFavBtn.addEventListener('click', (ev)=>{
                ev.stopPropagation();
                if(typeof toggleFavorite === 'function' && currentStreamId){
                    toggleFavorite(currentStreamId, currnetCategory, currentItem);
                    // safe UI update if isFavorite exists
                    if(typeof isFavorite === 'function'){
                        setFavBtn(currentStreamId);
                    }
                }
            });
        }
        if(elPlayrBtn){
            elPlayrBtn.addEventListener('click', (ev)=>{
                ev.stopPropagation();
                if(typeof playMovie === 'function' && currentItem){
                    const currentProgressInfo = getwatchingProgress(currentStreamId);
                    startTime = currentProgressInfo ? currentProgressInfo.progress_sec : 0;
                    playMovie(currentItem, startTime)
                }
            });
        }


        if(elTrailerBtn){
            elTrailerBtn.addEventListener('click', ()=>{
                loadTrailerIframeIfNeeded(currentStreamId);
            });
        }

        // Keyboard: ENTER should act on trailer when visible
        panel.addEventListener('keydown', (e)=>{
            if(e.key === 'Enter' && !e.defaultPrevented){
                if(elTrailerBtn && !elTrailerBtn.classList.contains('hidden')){
                    loadTrailerIframeIfNeeded(currentStreamId);
                }
            }
        });
    }

    function showPanel(enable){
        ensurePanel();
        const page = document.getElementById('page-content');
        if(enable){
            panel.classList.remove('hidden');
            if(page) page.classList.add('split-layout');
        }else{
            panel.classList.add('hidden');
            if(page) page.classList.remove('split-layout');
        }
    }

    function renderBasic(item, type){
        ensurePanel();
        console.log("renderBasic", item)
        if(renderTimeout) clearTimeout(renderTimeout);
        const poster = item.movie_image || item.cover || item.stream_icon || 'https://placehold.co/600x900/1F2937/FFFFFF?text=No+Image';
        const name = item.name || 'Unknown';
        const rating = calcRating(item);
    
        const year = item.releasedate || item.year;

        // Minimal updates: only set the fields that changed
        if(elPoster && elPoster.src !== poster) elPoster.src = poster;
        if(elTitle && elTitle.textContent !== name) elTitle.textContent = name;

        const metaText = `${year ? year + ' • ' : ''}${type || ''}`.trim();
        if(elMeta && elMeta.textContent !== metaText) elMeta.textContent = metaText;

        if(elRating) elRating.textContent = `★ ${rating}`;

        if(elPlot) elPlot.textContent = 'Loading details...';
        if(elTech) elTech.textContent = '';

        // Trailer button hidden until real data
        if(elTrailerBtn) elTrailerBtn.classList.add('hidden');

        // Fav button state
        if(elFavBtn && typeof isFavorite === 'function'){
            setFavBtn();
            //elFavBtn.textContent = isFavorite(item.stream_id || item.series_id) ? '♥' : '♡';
        }
    }

    async function fetchFullDetails(item, type){
        if(fetchTimeout) clearTimeout(fetchTimeout);
        if(renderTimeout) clearTimeout(renderTimeout);
        const active_page = $$('.page[style*="block"]')[0];
        if (active_page && active_page.id ==='page-series-details') {
            return;
        }
        renderBasic(item, type);
        if(!elLoader) return;
        elLoader.classList.remove('hidden');
        try{
            let action = type === 'series' ? 'get_series_info' : 'get_vod_info';
            let param = type === 'series' ? { series_id: item.series_id } : { vod_id: item.stream_id };

            // Expect a global fetchXtream helper
            const data = await fetchXtream({ action, ...param }, false);
            if(!data) throw new Error('No data');
            stream_info = data;
            renderExtended(data, item, type);
        }catch(err){
            console.warn('Details fetch failed', err);
            if(elPlot) elPlot.textContent = 'Could not load details.';
        }finally{
            if(elLoader) elLoader.classList.add('hidden');
        }
    }

    function renderExtended(data, originalItem, type){
        const info = data.info || {};
        const movieData = data.movie_data || {};

        const genre = info.genre || 'N/A';
        const country = info.country || 'N/A';
        const director = info.director || '';
        const cast = info.cast || info.actors || 'N/A';
        const plot = info.plot || info.description || 'No description available.';
        const releaseDate = info.releasedate || info.releaseDate || originalItem.year || '';

        elMeta.textContent = `${releaseDate ? releaseDate + ' • ' : ''} ${genre}${country ? ' • ' + country : ''}`;

        // Rating
        const rating = calcRating(info) || calcRating(originalItem);
        if(elRating) elRating.textContent = `★ ${rating}`;
        // Tech string
        let techParts = [];
        if(info.video){
            const w = info.video.width || '';
            const h = info.video.height || '';
            if(w && h) techParts.push(`${w}x${h}`);
            if(info.video.codec_name) techParts.push(info.video.codec_name);
        }
        const unit = Math.round(info.bitrate/1000) < 200 ? 'Mbps' : 'kbps';
        if(info.bitrate) techParts.push(`${Math.round(info.bitrate/1000)} ${unit}`);
        if(info.audio && info.audio.codec_name) techParts.push(info.audio.codec_name + (info.audio.channels ? ` ${info.audio.channels}ch` : ''));

        // Update nodes (only textContent / src changes)
        if(elPlot) elPlot.textContent = plot;
        if(elTech) elTech.textContent = techParts.join(' • ');

        // Show trailer button only when we have a youtube link
        const trailer = info.youtube_trailer || info.trailer || null;
        if(trailer && elTrailerBtn){
            // simple extract - do not create iframe yet
            const regExp = /^.*(youtu.be\/|v\/|u\/\\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
            const match = trailer.match(regExp);
            const videoId = (match && match[2] && match[2].length === 11) ? match[2] : null;
            if(videoId){
                // attach data on button for later lazy load
                elTrailerBtn.dataset.youtube = videoId;
                elTrailerBtn.classList.remove('hidden');
                trailerLoadedFor = null; // reset
            }
        }

        // Update fav button after extended data (some systems return favourite status)
        if(elFavBtn && typeof isFavorite === 'function'){
            setFavBtn();
        }
    }

    function loadTrailerIframeIfNeeded(streamId){
        // Only load once per stream id
        if(!elTrailerBtn) return;
        const videoId = elTrailerBtn.dataset.youtube;
        if(!videoId) return;
        if(trailerLoadedFor === streamId) return; // already loaded

        const mediaContainer = $id('details-media');
        if(!mediaContainer) return;

        // Remove any existing heavy iframe before adding new one
        const existing = mediaContainer.querySelector('iframe');
        if(existing) existing.remove();

        // Create iframe but keep attributes minimal
        const iframe = document.createElement('iframe');
        iframe.width = '100%';
        iframe.height = '100%';
        iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0`;
        iframe.setAttribute('frameborder','0');
        iframe.setAttribute('allow','autoplay; encrypted-media');
        iframe.className = 'w-full h-full rounded-lg';

        // Remove poster img to free memory if necessary
        if(elPoster){
            try{ elPoster.parentElement && (elPoster.parentElement.style.background = 'transparent'); }catch(e){}
        }

        mediaContainer.appendChild(iframe);
        trailerLoadedFor = streamId;
    }

function observeFocusedClass() {
    const grid = document.getElementById('content-grid');
    if (!grid) return;

    const observer = new MutationObserver(mutations => {
        let newFocused = null;
        for (const m of mutations) {
            if (m.type === 'attributes' && m.attributeName === 'class') {
                if (m.target.classList && m.target.classList.contains('vitem') && m.target.classList.contains('focused')) {
                    newFocused = m.target;
                }
            }
        }
        if (newFocused) handleVirtualFocus(newFocused);
    });

    observer.observe(grid, { attributes: true, subtree: true, attributeFilter: ['class'] });
}

function handleVirtualFocus(el) {
    let item = null;
    let type = el.dataset.type || '';

    if (el.dataset.item) {
        try { item = JSON.parse(el.dataset.item); } catch {}
    } else if (el.dataset.streamId) {
        if (typeof virtualListMap !== 'undefined') {
            item = virtualListMap.get(el.dataset.streamId);
        }
    }

    if (!item) return;
    if (type === 'live') return DetailsView.enable(false);


    // Reproduce original behavior safely
    DetailsView.enable(true);

    const streamId = item.stream_id || item.series_id;
    currentStreamId = streamId;

    // Cancel previous pending fetch
    if (renderTimeout) clearTimeout(renderTimeout);
    if (fetchTimeout) clearTimeout(fetchTimeout);

    // Debounced heavy fetch — 2 to 5 seconds depending on your config
    renderTimeout = setTimeout(() => {
        // Ensure user is still on same item
        if (currentStreamId === streamId && el.classList.contains('focused')) {
            // Only fetch if still focused
            renderBasic(item, type);
        }
    }, DETAILS_CONFIG.BASIC_RENDER_DELAY_MS);
    
    // Debounced heavy fetch — 2 to 5 seconds depending on your config
    fetchTimeout = setTimeout(() => {
        // Ensure user is still on same item
        if (currentStreamId === streamId && el.classList.contains('focused')) {
            // Only fetch if still focused
            fetchFullDetails(item, type);
        }
    }, DETAILS_CONFIG.HEAVY_FETCH_DELAY_MS);


}

function init(){
        ensurePanel();
        const root = document.getElementById('page-content') || document.body;

        observeFocusedClass();

    }

    // Public enable/disable split layout
    function enable(enableFlag){
        ensurePanel();
        showPanel(enableFlag);
    }

    // Auto-init safely
    if(document.readyState === 'complete' || document.readyState === 'interactive'){
        setTimeout(init, 80);
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

    // Expose public surface
    return {
        init,
        enable,
        fetchFullDetails,
    };
})();

// Export for CommonJS/AMD if needed
if(typeof module !== 'undefined' && module.exports){
    module.exports = DetailsView;
}
