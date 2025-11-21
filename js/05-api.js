// Optimized 05-api.js with universal loadAll(type)

// --- CACHE INTEGRATION ---
const cacheOptions = {
    debug: false,
    maxCacheBytes: 100 * 1024 * 1024,
    appCacheVersion: 1,
    cacheTimeToLive: 24 * 60 * 60 * 1000
};
const cacheManager = new CacheManager(cacheOptions);

function nonBlockingParse(text) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try { resolve(JSON.parse(text)); } catch (e) { reject(e); }
        }, 0);
    });
}

const ACTION_TYPE_MAP = {
    "get_live_categories": "live",
    "get_vod_categories": "vod",
    "get_series_categories": "series",
    "get_live_streams": "live",
    "get_vod_streams": "vod",
    "get_series": "series"
};

function isCategoryListAction(action) {
    return action === "get_live_categories" || action === "get_vod_categories" || action === "get_series_categories";
}
function isCategoryItemsAction(action) {
    return action === "get_live_streams" || action === "get_vod_streams" || action === "get_series";
}

// --------------------------------------------------------
// fetchFreshXtream - hybrid download progress (streaming if available)
// --------------------------------------------------------
async function fetchFreshXtream(params) {
    console.log("Xtream params:", params);

    if (!xtreamConfig || !xtreamConfig.host) {
        showLoader(false);
        showError("Invalid playlist configuration.");
        throw new Error("Invalid playlist configuration");
    }

    const urlParams = new URLSearchParams({
        username: xtreamConfig.username,
        password: xtreamConfig.password,
        ...params
    });

    const url = `${apiBaseUrl}?${urlParams.toString()}`;
    console.log(`Fetching from Xtream API: ${url}`);

    // Hybrid download progress: use streaming reader if available, otherwise fallback to time-based progress
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Network error: ${response.statusText}`);

        // Helper: emit to global callback if present
        function emitDownloadProgress(receivedBytes, totalBytes) {
            if (window.onDownloadProgress) {
                const pct = totalBytes ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : null;
                window.onDownloadProgress(pct, receivedBytes, totalBytes);
            }
        }

        // Try to stream body for real progress
        const contentLengthHeader = response.headers && response.headers.get ? response.headers.get('Content-Length') : null;
        const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : null;

        if (response.body && response.body.getReader) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let received = 0;
            const chunks = [];

            // If no content-length, we will emit incremental progress using time estimates
            let lastEmit = Date.now();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                received += (value && (value.length || value.byteLength)) || 0;

                // Emit progress at most every 80ms to avoid UI thrash
                const now = Date.now();
                if (now - lastEmit > 80) {
                    emitDownloadProgress(received, totalBytes);
                    lastEmit = now;
                    // yield to event loop so UI can update on low-end devices
                    await new Promise(r => setTimeout(r, 0));
                }
            }

            // Final emit
            emitDownloadProgress(received, totalBytes);

            // Concatenate chunks into string
            let full = '';
            for (const c of chunks) full += decoder.decode(c, { stream: true });
            full += decoder.decode();

            // parse json non-blocking
            const data = await nonBlockingParse(full);

            if (data.user_info && data.user_info.auth === 0) throw new Error("Xtream API: Authentication failed.");

            return data;
        }

        // Fallback: no streaming support — do fetch as before but provide simulated progress
        // Emit a few staged progress updates so UI doesn't appear stuck
        if (window.onDownloadProgress) window.onDownloadProgress(5, 0, null);
        const text = await response.text();
        if (window.onDownloadProgress) window.onDownloadProgress(60, text.length, null);

        const data = await nonBlockingParse(text);
        if (data.user_info && data.user_info.auth === 0) throw new Error("Xtream API: Authentication failed.");

        if (window.onDownloadProgress) window.onDownloadProgress(100, text.length, text.length);
        return data;

    } catch (error) {
        console.error('Fetch error:', error);

        if (error instanceof TypeError && error.message === "Failed to fetch") {
            const specificError = "Network Error (Server offline or CORS issue).";
            showError(specificError);
            throw new Error(specificError);
        } else {
            showError(error.message);
            throw error;
        }
    }
}

// --------------------------------------------------------
// fetchXtream - wrapper with cache usage
// --------------------------------------------------------
async function fetchXtream(params, loading=true) {
    if (loading) showLoader(true);

    if (!xtreamConfig || !xtreamConfig.host) {
        if (loading) showLoader(false);
        showError("Invalid playlist configuration.");
        throw new Error("Invalid playlist configuration");
    }

    cacheManager.initIfNeeded().catch(()=>{});

    const action = params.action;
    const type = ACTION_TYPE_MAP[action];
    const useCache = (userSettings && userSettings.useCache == 1);
    console.log("useCache =", useCache);
    if (useCache && isCategoryListAction(action) && type) {
        try {
            const cached = await cacheManager.loadCategories(type);
            console.log("Loaded categories from cache:", cached);
            if (cached) {
                if (loading) showLoader(false);
                return cached;
            }
        } catch (_) {}
    }

    if (useCache && isCategoryItemsAction(action) && type && params.category_id) {
        try {
            const cached = await cacheManager.loadCategoryItems(type, params.category_id);
            if (cached) {
                if (loading) showLoader(false);
                return cached;
            }
        } catch (_) {}
    }
    if (useCache && isCategoryListAction(action) && type) {
        console.log("No cached categories found for type:", type);
        await loadAll(type);
    }
    try {
        const data = await fetchFreshXtream(params);

        if (useCache && type) {
            if (isCategoryListAction(action)) cacheManager.saveCategories(type, data).catch(()=>{});
            if (isCategoryItemsAction(action) && params.category_id)
                cacheManager.saveCategoryItems(type, params.category_id, data).catch(()=>{});
        }

        return data;

    } catch (err) {
        if (useCache && type) {
            try {
                if (isCategoryListAction(action)) {
                    const cached = await cacheManager.loadCategories(type);
                    if (cached) {
                        if (loading) showLoader(false);
                        return cached;
                    }
                }
                if (isCategoryItemsAction(action) && params.category_id) {
                    const cached = await cacheManager.loadCategoryItems(type, params.category_id);
                    if (cached) {
                        if (loading) showLoader(false);
                        return cached;
                    }
                }
            } catch (_) {}
        }
        throw err;
    } finally {
        if (loading) showLoader(false);
    }
}

// --------------------------------------------------------
// UNIVERSAL loadAll(type) WITH PROGRESS
// --------------------------------------------------------

var onLoadAllProgress = (percent, message)=>{
    $("#loading_status").innerHTML=message;
    $("#loading_progressbar")
    if(percent<100){
        $("#loading_progressbar").style.display="block";
        $("#loading_progressbar div").style.width=`${percent}%`
    }else{
        $("#loading_progressbar").style.display="none";
    }
};
function reportProgress(percent, message) {
    if (onLoadAllProgress) onLoadAllProgress(percent, message);
}

const TYPE_TO_ACTION = {
    vod: "get_vod_streams",
    live: "get_live_streams",
    series: "get_series"
};

async function loadAll(type) {
    const action = TYPE_TO_ACTION[type];
    if (!action) throw new Error("Invalid type: " + type);

    const cacheKey = `${type}_all`;

    reportProgress(0, `Loading ${type.toUpperCase()} playlist`);

    // Try cache
    try {
        const cached = await cacheManager.loadCategoryItems(type, cacheKey);
        if (cached) {
            reportProgress(100, "Loaded from cache");
            return cached;
        }
    } catch (_) {}

    reportProgress(10, "Fetching from server...");

    // Attach download progress view to the same UI if desired
    // (window.onDownloadProgress should be set by UI code to show download progress)
    const data = await fetchFreshXtream({ action });

    reportProgress(50, "Parsing data...");

    const categorized = {};
    if (Array.isArray(data)) {
        const total = data.length;
        let processed = 0;

        for (const item of data) {
            const cid = item.category_id || "0";
            if(userSettings.hiddenCategories && userSettings.hiddenCategories.includes(cid)){
                processed++;
                continue;
            }
            if (!categorized[cid]) categorized[cid] = [];
            categorized[cid].push(item);

            processed++;
            // update categorization progress every N items to avoid thrash
            if (processed % 200 === 0 || processed === total) {
                const pct = 50 + Math.floor((processed / total) * 40);
                reportProgress(pct, "Categorizing...");
                // yield so UI updates on low-end devices
                // small pause
                // eslint-disable-next-line no-await-in-loop
                await new Promise(r => setTimeout(r, 0));
            }
        }
    }

    reportProgress(90, "Saving to cache...");
    for (const cid in categorized) {
        await cacheManager.saveCategoryItems(type, cid, categorized[cid]).catch(()=>{});
    }

    reportProgress(100, "Done");

    return categorized;
}

// Prewarm cache
async function prewarmCache() {
    try {
        await cacheManager.init();
        await cacheManager._ensureFolder(`${cacheManager.cacheRootPath}/live`);
        await cacheManager._ensureFolder(`${cacheManager.cacheRootPath}/vod`);
        await cacheManager._ensureFolder(`${cacheManager.cacheRootPath}/series`);
    } catch (_) {}
}

prewarmCache();
