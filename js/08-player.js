// === Player Logic ===

/**
 * NEW: Handles the click on a movie item.
 * Tries to fetch info and show modal. Falls back to direct play.
 */
async function handleMovieClick(item, startTime = 0) {
    currentItem = item; // Store for progress saving
    currentEpisode = null;
    showLoader(true);
    
    try {
        const info = await fetchXtream({ action: 'get_vod_info', vod_id: item.stream_id });
        if (!info || !info.movie_data) throw new Error("Could not load movie info.");
        
        // Info fetched, show modal
        showMovieDetailsModal(info, item, startTime);

    } catch(e) {
        console.warn("Failed to get movie info, playing directly.", e);
        // Info failed, play directly
        playMovie(item, startTime, null);
    } finally {
        showLoader(false);
    }
}

/**
 * NEW: This function *only* starts playback.
 * It can be called from the modal (with info) or from handleMovieClick (without info).
 */
function playMovie(item, startTime, info = null) {
    currentItem = item;
    currentEpisode = null;
    showPage('page-player');
    pushToNavStack('page-player');
    
    let ext, streamUrl, details, subtitles = null;

    if (!info || !info.movie_data) {
        // This branch is for when info *failed* and we're playing directly.
        console.warn("Playing without full info, guessing extension.");
        ext = 'mp4'; // Guess
        streamUrl = `${userSettings.xtreamConfig.host}/movie/${userSettings.xtreamConfig.username}/${userSettings.xtreamConfig.password}/${item.stream_id}.${ext}`;
        details = { name: item.name, rating: item.rating };
    } else {
        // This branch is when info *succeeded* and we're playing from the modal.
        ext = info.movie_data.container_extension || 'mp4';
        streamUrl = `${userSettings.xtreamConfig.host}/movie/${userSettings.xtreamConfig.username}/${userSettings.xtreamConfig.password}/${item.stream_id}.${ext}`;
        details = {
            name: info.info.name || item.name,
            rating: info.info.rating_5based || item.rating
        };
        subtitles = info.movie_data.subtitles || null; // Get subtitles
    }
    
    if (isTizen) startTizenPlayer(streamUrl, details, startTime, 'vod', subtitles);
    else startWebPlayer(streamUrl, details, startTime, 'vod', subtitles);
}

async function playLive(item) {
    currentItem = item;
    currentEpisode = null;
    showPage('page-player');
    pushToNavStack('page-player');
    
    const streamUrl = `${userSettings.xtreamConfig.host}/live/${userSettings.xtreamConfig.username}/${userSettings.xtreamConfig.password}/${item.stream_id}.ts`;
    const details = { name: item.name, rating: null };

    if (isTizen) startTizenPlayer(streamUrl, details, 0, 'live');
    else startWebPlayer(streamUrl, details, 0, 'live');
}

function playEpisode(episode, seriesItem, startTime = 0) {
    currentItem = seriesItem; // Store series item
    currentEpisode = episode; // Store episode item
    console.log(currentEpisode)
    showPage('page-player');
    pushToNavStack('page-player');
    
    const ext = episode.container_extension || 'mp4';
    const streamUrl = `${userSettings.xtreamConfig.host}/series/${userSettings.xtreamConfig.username}/${userSettings.xtreamConfig.password}/${episode.stream_id}.${ext}`;
    const details = {
        name: `${seriesItem.name} - S${String(episode.season).padStart(2, '0')}E${String(episode.episode_num).padStart(2, '0')}`,
        rating: seriesItem.rating_5based || seriesItem.rating
    };
    
    // For series, subtitles are often embedded, not external
    // We will rely on the Tizen player's internal track info
    if (isTizen) startTizenPlayer(streamUrl, details, startTime, 'series', null);
    else startWebPlayer(streamUrl, details, startTime, 'series', null);
}


function startWebPlayer(url, details, startTime, type, subtitles = null) {
    console.log(`Starting Web Player: ${url} at ${startTime}s`);
    const player = $('#web-video-player');
    
    // Clear old subtitle tracks
    const oldTracks = player.querySelectorAll('track');
    oldTracks.forEach(t => t.remove());

    // Add new subtitle tracks if available
    if (type === 'vod' && subtitles && Array.isArray(subtitles)) {
        console.log(`Found ${subtitles.length} subtitle tracks.`);
        subtitles.forEach((sub, index) => {
            if (!sub.url) return; // Skip if no URL
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = sub.language || `Track ${index + 1}`;
            // Try to get a 2-char lang code
            let srclang = 'en'; 
            if (sub.language) {
                srclang = sub.language.slice(0, 2).toLowerCase();
            }
            if (sub.language_code) {
                srclang = sub.language_code;
            }
            
            track.srclang = srclang;
            track.src = sub.url;
            
            if (index === 0) {
                track.default = true; // Make first one default
            }
            player.appendChild(track);
        });
    }

    player.src = url;
    player.style.display = 'block';
    
    player.ontimeupdate = () => {
        // Pass currentItem (series) and currentEpisode (episode) if it's a series
        saveProgress(currentItem, player.currentTime, player.duration, type, currentEpisode);
    };
    
    player.onloadedmetadata = () => {
        if (startTime > 0) player.currentTime = startTime;
        player.play();
    };
    
    player.play();
    
    // Start periodic saving
    clearInterval(saveProgressInterval); // Clear any old ones
    saveProgressInterval = setInterval(saveUserSettings, 15000); // Save every 15s
}

// --- TIZEN PLAYER OVERLAY ---

function formatPlayerTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const date = new Date(null);
    date.setSeconds(seconds);
    const timeStr = date.toISOString().substr(11, 8);
    // Show 00:00:00 for hours, 00:00 for minutes
    return (seconds >= 3600) ? timeStr : timeStr.substr(3);
}

function showTizenOverlay() {
    if (tizenModalActive) return; // Don't show if modal is open

    const overlay = $('#tizen-player-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => overlay.style.opacity = '1', 10); // Fade in
    tizenOverlayActive = true;

    // Update time
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    $('#tizen-current-time').textContent = `${hours}:${minutes}`;

    // Auto-hide
    clearTimeout(tizenOverlayTimer);
    tizenOverlayTimer = setTimeout(hideTizenOverlay, 7000); // Hide after 7s
}

function hideTizenOverlay() {
    clearTimeout(tizenOverlayTimer);
    const overlay = $('#tizen-player-overlay');
    overlay.style.opacity = '0';
    tizenOverlayActive = false;
    // Remove focus from overlay items
    if (document.activeElement && document.activeElement.closest('#tizen-player-overlay')) {
        document.activeElement.blur();
    }
    setTimeout(() => {
        // Only hide if opacity is still 0 (user didn't re-show it)
        if (overlay.style.opacity === '0') {
            overlay.style.display = 'none';
        }
    }, 300); // Match transition duration
}

function tizenTogglePlayPause() {
    if (!tizenAvPlayer) return;
    
    try {
        const state = webapis.avplay.getState();
        if (state === 'PLAYING') {
            webapis.avplay.pause();
            isTizenPlaying = false;
            $('#tizen-play-icon').style.display = 'block';
            $('#tizen-pause-icon').style.display = 'none';
            $('#tizen-stream-status').textContent = 'Paused';
        } else if (state === 'PAUSED') {
            webapis.avplay.play();
            isTizenPlaying = true;
            $('#tizen-play-icon').style.display = 'none';
            $('#tizen-pause-icon').style.display = 'block';
            $('#tizen-stream-status').textContent = 'Playing';
        }
        // Reset overlay timer on interaction
        if (tizenOverlayActive) showTizenOverlay();
    } catch (e) {
        console.error("Error toggling Tizen play/pause", e);
    }
}

function tizenSeek(direction) {
    if (!tizenAvPlayer) return;
    
    // Show overlay to give feedback
    if (!tizenOverlayActive) showTizenOverlay();
    else clearTimeout(tizenOverlayTimer); // Keep overlay open while seeking

    const state = webapis.avplay.getState();
    if (state !== 'PLAYING' && state !== 'PAUSED') return;

    // 10 second seek
    const seekAmount = 10000; // 10s in ms
    const currentMs = webapis.avplay.getCurrentTime();
    
    if (direction === 'forward') {
        webapis.avplay.seekForward(seekAmount,
            () => console.log("Seek forward success"),
            (e) => console.error("Seek forward error", e)
        );
    } else {
        webapis.avplay.seekBackward(seekAmount,
            () => console.log("Seek backward success"),
            (e) => console.error("Seek backward error", e)
        );
    }
    
    // Update time immediately for responsiveness
    const newTime = (direction === 'forward') ? currentMs + seekAmount : currentMs - seekAmount;
    const duration = tizenPlayerInfo.duration;
    let percent = (newTime / duration) * 100;
    if (percent > 100) percent = 100;
    if (percent < 0) percent = 0;
    
    $('#tizen-progress-fill').style.width = `${percent}%`;
    $('#tizen-progress-thumb').style.left = `${percent}%`;
    $('#tizen-progress-time').textContent = formatPlayerTime(newTime / 1000);

    // Set new hide timer
    tizenOverlayTimer = setTimeout(hideTizenOverlay, 3000); // Shorter hide after seek
}


function showTizenTrackModal(type) {
    tizenModalActive = true;
    lastFocusedElement = document.activeElement; // Save focus
    clearTimeout(tizenOverlayTimer); // Stop overlay from hiding
    
    const modal = $('#tizen-track-modal');
    const title = $('#tizen-track-modal-title');
    const list = $('#tizen-track-modal-list');
    
    let tracks, currentTrackIndex, setTrackFn;
    
    if (type === 'audio') {
        title.textContent = "Select Audio Track";
        tracks = tizenPlayerInfo.audioTracks;
        currentTrackIndex = tizenPlayerInfo.currentAudioIndex;
        setTrackFn = (index) => setTizenTrack('audio', index);
        
    } else {
        title.textContent = "Select Subtitle Track";
        tracks = tizenPlayerInfo.subtitleTracks;
        currentTrackIndex = tizenPlayerInfo.currentSubtitleIndex;
        setTrackFn = (index) => setTizenTrack('subtitle', index);
        
        // Add "Off" button for subtitles
        tracks.unshift({ language: 'Off', type: 'SUBTITLE' });
        // Adjust current index to account for "Off"
        currentTrackIndex += 1;
    }
    
    list.innerHTML = ''; // Clear old list
    
    if (!tracks || tracks.length === 0) {
        list.innerHTML = `<p class="text-alt p-4">No tracks available.</p>`;
    } else {
        tracks.forEach((track, index) => {
            const trackName = track.language || track.extra_info?.track_lang || `Track ${index}`;
            const isActive = (index === currentTrackIndex);
            
            const button = document.createElement('button');
            button.className = `nav-item w-full p-3 rounded text-left text-main hover:bg-alt ${isActive ? 'text-primary' : ''}`;
            button.textContent = `${trackName} ${isActive ? '(Active)' : ''}`;
            
            button.onclick = () => {
                setTrackFn(index);
                hideTizenTrackModal();
            };
            list.appendChild(button);
        });
    }
    
    modal.style.display = 'flex';
    // Focus first item in list, or close button
    const firstItem = list.querySelector('.nav-item') || $('#tizen-track-modal-close');
    if (firstItem) firstItem.focus();
    
    $('#tizen-track-modal-close').onclick = hideTizenTrackModal;
}

function hideTizenTrackModal() {
    tizenModalActive = false;
    $('#tizen-track-modal').style.display = 'none';
    
    // Restore focus to overlay button
    if (lastFocusedElement) {
        lastFocusedElement.focus();
        lastFocusedElement = null;
    }
    // Restart overlay hide timer
    showTizenOverlay();
}

function setTizenTrack(type, index) {
    try {
        if (type === 'audio') {
            webapis.avplay.setSelectTrack('AUDIO', index);
            tizenPlayerInfo.currentAudioIndex = index;
            console.log(`Set audio track to ${index}`);
        } else {
            // Adjust for "Off" button
            const trackIndex = index - 1; 
            webapis.avplay.setSelectTrack('SUBTITLE', trackIndex);
            tizenPlayerInfo.currentSubtitleIndex = trackIndex;
            console.log(`Set subtitle track to ${trackIndex}`);
        }
    } catch (e) {
        console.error(`Error setting ${type} track:`, e);
    }
}

// --- MAIN TIZEN PLAYER FUNCTION ---

function startTizenPlayer(url, details, startTime, type, subtitles = null) {
    console.log(`Starting Tizen Player: ${url} at ${startTime}s`);
    
    const container = $('#tizen-player-container');
    container.style.display = 'block';
    container.innerHTML = '<object type="application/avplayer" id="av-player" style="width:100%; height:100%;"></object>';
    tizenAvPlayer = $('#av-player');

    // Reset player info state
    tizenPlayerInfo = {
        audioTracks: [],
        subtitleTracks: [],
        width: 0,
        height: 0,
        duration: 0,
        currentAudioIndex: -1,
        currentSubtitleIndex: -1
    };
    isTizenPlaying = true;
    tizenModalActive = false;

    // --- Setup Overlay UI ---
    $('#tizen-movie-name').textContent = details.name;
    $('#tizen-movie-rating').style.display = details.rating ? 'block' : 'none';
    if(details.rating) $('#tizen-movie-rating').textContent = `Rating: ${Number(details.rating).toFixed(1)}`;
    $('#tizen-stream-status').textContent = 'Buffering';
    
    $('#tizen-play-icon').style.display = 'none';
    $('#tizen-pause-icon').style.display = 'block';
    
    $('#tizen-progress-fill').style.width = '0%';
    $('#tizen-progress-thumb').style.left = '0%';
    $('#tizen-progress-time').textContent = formatPlayerTime(startTime);
    $('#tizen-progress-duration').textContent = '00:00';
    
    // Setup overlay button clicks
    $('#tizen-play-pause-button').onclick = tizenTogglePlayPause;
    $('#tizen-subtitle-button').onclick = () => showTizenTrackModal('subtitle');
    $('#tizen-audio-button').onclick = () => showTizenTrackModal('audio');

    // Show overlay
    showTizenOverlay();

    try {
        const playerListener = {
            onbufferingstart: () => {
                console.log("AVPlay: Buffering start...");
                $('#tizen-stream-status').textContent = 'Buffering';
            },
            onbufferingcomplete: () => {
                console.log("AVPlay: Buffering complete.");
                $('#tizen-stream-status').textContent = isTizenPlaying ? 'Playing' : 'Paused';
            },
            onstreamcompleted: () => {
                console.log("AVPlay: Stream completed.");
                // Mark as fully watched by setting progress to duration
                const duration = tizenPlayerInfo.duration;
                saveProgress(currentItem, duration / 1000, duration / 1000, type, currentEpisode);
                goBack();
            },
            onerror: (err) => {
                console.error("AVPlay Error:", err);
                $('#tizen-stream-status').textContent = 'Failed';
                showError("Tizen Player Error. Unsupported format?");
                //goBack();
            },
            oncurrentplaytime: (time) => {
                // time is in ms
                if (tizenModalActive) return; // Don't update UI if modal is open

                const duration = tizenPlayerInfo.duration;
                if (!duration || duration <= 0) return;
                
                let percent = (time / duration) * 100;
                if (percent > 100) percent = 100;
                
                $('#tizen-progress-fill').style.width = `${percent}%`;
                $('#tizen-progress-thumb').style.left = `${percent}%`;
                $('#tizen-progress-time').textContent = formatPlayerTime(time / 1000);
                
                // Only save progress if playing
                if (isTizenPlaying) {
                    saveProgress(currentItem, time / 1000, duration / 1000, type, currentEpisode);
                }
            },
            // This is new, to get track info
            ontotaltrackinfo: (trackInfo) => {
                console.log("AVPlay: Received Track Info:", trackInfo);
                tizenPlayerInfo.audioTracks = trackInfo.filter(t => t.type === 'AUDIO');
                tizenPlayerInfo.subtitleTracks = trackInfo.filter(t => t.type === 'SUBTITLE');
                
                // Get initial active tracks
                try {
                    tizenPlayerInfo.currentAudioIndex = webapis.avplay.getSelectTrack('AUDIO');
                } catch(e) { console.warn("Could not get initial audio track", e); }
                try {
                    tizenPlayerInfo.currentSubtitleIndex = webapis.avplay.getSelectTrack('SUBTITLE');
                } catch(e) { console.warn("Could not get initial subtitle track", e); }
            }
        };
        
        webapis.avplay.setListener(playerListener);
        webapis.avplay.open(url);
        
        // Set external subtitle for Tizen (if provided, for VOD)
        if (type === 'vod' && subtitles && subtitles.length > 0) {
            const subUrl = subtitles[0].url;
            if (subUrl) {
                console.log("Setting Tizen external subtitle:", subUrl);
                webapis.avplay.setExternalSubtitlePath(subUrl);
            }
        }

        webapis.avplay.setDisplayRect(0, 0, 1920, 1080); // Full HD
        
        webapis.avplay.prepareAsync(() => {
            console.log("AVPlay: Prepared. Playing...");
            
            // Get duration
            tizenPlayerInfo.duration = webapis.avplay.getDuration();
            $('#tizen-progress-duration').textContent = formatPlayerTime(tizenPlayerInfo.duration / 1000);
            
            // Get resolution
            try {
                const videoInfo = webapis.avplay.getVideoInfo();
                tizenPlayerInfo.width = videoInfo.width;
                tizenPlayerInfo.height = videoInfo.height;
                
                $('#tizen-stream-resolution').textContent = `${videoInfo.width}x${videoInfo.height}`;
                
                const tag = $('#tizen-stream-quality-tag');
                if (videoInfo.width >= 3800) tag.textContent = '4K';
                else if (videoInfo.width >= 1900) tag.textContent = 'FHD';
                else if (videoInfo.width >= 1200) tag.textContent = 'HD';
                else tag.textContent = 'SD';
                
            } catch(e) {
                console.warn("Could not get video info", e);
                $('#tizen-stream-resolution').textContent = 'N/A';
                $('#tizen-stream-quality-tag').textContent = 'N/A';
            }
            
            // Get internal track info (this will trigger 'ontotaltrackinfo')
            webapis.avplay.getTotalTrackInfo();

            // Try to enable the *external* subtitle track (if added)
            if (type === 'vod' && subtitles && subtitles.length > 0) {
                try { 
                    // Tizen uses 1-based index for this specific API
                    webapis.avplay.setVideoProperty('SUBTITLE', 1); 
                    console.log("Enabled external subtitle track 1");
                    // We don't know the internal index, so set to -1
                    tizenPlayerInfo.currentSubtitleIndex = -1; // -1 means external or off
                } catch (e) { 
                    console.warn("Could not set external subtitle track", e); 
                }
            }

            if (startTime > 0) {
                webapis.avplay.seekTo(startTime * 1000, 
                    () => webapis.avplay.play(),
                    (e) => { console.error("Seek failed", e); webapis.avplay.play(); } // Play anyway
                );
            } else {
                webapis.avplay.play();
            }
            
            // Start periodic saving
            clearInterval(saveProgressInterval); // Clear any old ones
            saveProgressInterval = setInterval(saveUserSettings, 15000); // Save every 15s
            
        }, (e) => {
            console.error("AVPlay: Prepare Error", e);
            showError("Tizen: Could not prepare video.");
            goBack();
        });

    } catch (e) {
        console.error("Tizen AVPlay critical error:", e);
        showError("Tizen AVPlay API failed.");
        goBack();
    }
}

function stopPlayer() {
    clearInterval(saveProgressInterval); // Stop periodic saving
    saveUserSettings(); // Do one final save
    currentItem = null;
    currentEpisode = null;
    
    if (isTizen && tizenAvPlayer) {
        try {
            console.log("Stopping Tizen Player");
            // Hide overlay first
            hideTizenOverlay();
            tizenOverlayActive = false;
            tizenModalActive = false;

            webapis.avplay.stop();
            webapis.avplay.close();
            tizenAvPlayer = null;
            $('#tizen-player-container').innerHTML = '';
        } catch (e) {
            console.error("Error stopping Tizen player:", e);
        }
    } else {
        console.log("Stopping Web Player");
        const player = $('#web-video-player');
        player.pause();
        player.src = '';
        player.style.display = 'none';
        player.ontimeupdate = null; // Clear listener
        player.onloadedmetadata = null;
        // Clear subtitle tracks
        const oldTracks = player.querySelectorAll('track');
        oldTracks.forEach(t => t.remove());
    }
}