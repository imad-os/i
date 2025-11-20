// === User & Settings Management ===

function saveUserSettings() {
    if (!currentUsername) return;
    localStorage.setItem(`iptv-user-${currentUsername}`, JSON.stringify(userSettings));
}

function loadUserSettings(username) {
    const savedSettings = localStorage.getItem(`iptv-user-${username}`);
    let parsed;
    if (savedSettings) {
        parsed = JSON.parse(savedSettings);
        
        // --- MIGRATION LOGIC ---
        // If xtreamConfig is an object (old format), convert to array
        if (parsed.xtreamConfig && !Array.isArray(parsed.xtreamConfig)) {
            console.log("Migrating old settings format to array...");
            parsed.xtreamConfig = [parsed.xtreamConfig];
            // Ensure title exists
            if (!parsed.xtreamConfig[0].title) parsed.xtreamConfig[0].title = 'Default Playlist';
        }
        // Ensure pl exists
        if (typeof parsed.pl === 'undefined') {
            parsed.pl = 0;
        }
        // --- END MIGRATION ---

        userSettings = {
            ...defaultUserSettings,
            ...parsed,
            // Ensure arrays/objects exist
            favorites: parsed.favorites || [],
            watching: parsed.watching || {},
        };
    } else {
        userSettings = { ...defaultUserSettings }; // Create new profile
    }
    currentUsername = username;
    localStorage.setItem('iptv-last-user', username);
    loadTheme();
}

// --- UPDATED handleUserLogin ---
async function handleUserLogin() {
    const username = $('#username').value.trim();
    if (!username) {
        showError('Please enter a username.');
        return;
    }
    
    showLoader(true);
    loadUserSettings(username);
    try {
        // 1. Try to fetch remote settings
        const response = await fetch(`http://i.geekspro.us/users/${username}.json`);
        if (response.ok) {
            const fetchedSettings = await response.json();
            
            // Normalize remote settings too
            let configArray = fetchedSettings.xtreamConfig;
            if (configArray && !Array.isArray(configArray)) {
                configArray = [configArray];
            }
            userSettings = {
                ...userSettings,
                ...fetchedSettings,
                xtreamConfig: configArray || userSettings.xtreamConfig,
                favorites : [
                    ...userSettings.favorites,
                    ...(fetchedSettings.favorites || [])
                ],
                watching : [
                    ...userSettings.watching,
                    ...(fetchedSettings.watching || [])
                ],
                keyMap : fetchedSettings.keyMap || userSettings.keyMap || {},
                pl: (typeof fetchedSettings.pl !== 'undefined') ? fetchedSettings.pl : 0
            };
            
        } else {
            // 2. No remote settings, fall back to localStorage
            loadUserSettings(username); // This loads from localStorage or creates new
        }
    } catch (e) {
        showLoader(false);
        // 3. Fetch failed (e.g., offline), fall back to localStorage
        loadUserSettings(username); // This loads from localStorage or creates new

    } finally {
        showLoader(false);
        currentUsername = username;
        localStorage.setItem('iptv-last-user', username);
        loadTheme();
        saveUserSettings(); // Save merged settings to localStorage
    }
    
    // 4. Check if API is configured (for the current playlist)
    const currentPL = userSettings.pl || 0;
    const config = userSettings.xtreamConfig[currentPL];
    
    if (config && config.host && config.username && config.password) {
        // Test API config
        handleApiConnect(null, true); // true = isAutoLogin
    } else {
        // 5. Need to configure API
        $('#api-username').textContent = username;
        $('#playlist-title').value = config ? (config.title || '') : '';
        $('#host').value = config ? (config.host || '') : '';
        $('#api-user').value = config ? (config.username || '') : '';
        $('#api-pass').value = config ? (config.password || '') : '';
        showPage('page-api-details');
    }
}

function handleLogout() {
    currentUsername = '';
    userSettings = { ...defaultUserSettings };
    navigationStack = [];
    showPage('page-user-login');
    history.replaceState(null, '', '#login'); // Update hash on logout
}

// === API Handling ===
async function handleApiConnect(e, isAutoLogin = false) {
    
    // Determine which playlist we are working on
    let currentIndex = userSettings.pl;
    // If for some reason it's invalid, reset to 0
    if (typeof currentIndex === 'undefined' || currentIndex < 0 || currentIndex >= userSettings.xtreamConfig.length) {
        currentIndex = 0;
        userSettings.pl = 0;
    }

    xtreamConfig = userSettings.xtreamConfig[currentIndex];
    
    if (!isAutoLogin) {
        // Read inputs
        const newTitle = $('#playlist-title').value.trim();
        const newHost = $('#host').value.trim();
        const newUser = $('#api-user').value.trim();
        const newPass = $('#api-pass').value.trim();
        
        // Update config object
        xtreamConfig.title = newTitle || `Playlist ${currentIndex + 1}`;
        xtreamConfig.host = newHost;
        xtreamConfig.username = newUser;
        xtreamConfig.password = newPass;
        
        console.log('Reading from form fields:', xtreamConfig);
    }

    if (!xtreamConfig.host || !xtreamConfig.username || !xtreamConfig.password) {
        console.log('Validation failed. One or more fields are empty.');
        if (!isAutoLogin) showError('Please fill in all fields.');
        
        // Pre-fill fields
        $('#playlist-title').value = xtreamConfig.title || '';
        $('#host').value = xtreamConfig.host || '';
        $('#api-user').value = xtreamConfig.username || '';
        $('#api-pass').value = xtreamConfig.password || '';
        
        showPage('page-api-details');
        return;
    }
    
    // Normalize Host URL
    if (!xtreamConfig.host.startsWith('http')) xtreamConfig.host = 'http://' + xtreamConfig.host;
    if (xtreamConfig.host.endsWith('/')) xtreamConfig.host = xtreamConfig.host.slice(0, -1);

    apiBaseUrl = `${xtreamConfig.host}/player_api.php`;

    try {
        // Test login
        const data = await fetchXtream({ action: 'get_vod_categories' });
        if (data) {
            console.log('API connection successful');
            
            // Save back to the array
            userSettings.xtreamConfig[currentIndex] = xtreamConfig;
            saveUserSettings();
            
            // --- ROUTING LOGIC ---
            if (initialHash && initialHash !== '#main' && initialHash !== '#login' && initialHash !== '#') {
                const handled = await handleInitialHash(initialHash);
                if (!handled) {
                    showPage('page-main');
                    pushToNavStack('page-main');
                }
            } else {
                showPage('page-main');
                pushToNavStack('page-main');
            }
            initialHash = '';

        } else {
            throw new Error("Authentication failed or empty response.");
        }
    } catch (error) {
        console.error('API connection failed:', error);
        showError(`API Error: ${error.message}`);
        
        // Pre-fill fields
        $('#playlist-title').value = xtreamConfig.title || '';
        $('#host').value = xtreamConfig.host || '';
        $('#api-user').value = xtreamConfig.username || '';
        $('#api-pass').value = xtreamConfig.password || '';
        
        showPage('page-api-details');
    }
}