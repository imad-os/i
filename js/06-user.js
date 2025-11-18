// === User & Settings Management ===

function saveUserSettings() {
    if (!currentUsername) return;
    localStorage.setItem(`iptv-user-${currentUsername}`, JSON.stringify(userSettings));
}

function loadUserSettings(username) {
    const savedSettings = localStorage.getItem(`iptv-user-${username}`);
    if (savedSettings) {
        userSettings = JSON.parse(savedSettings);
        // Ensure all keys from default are present
        userSettings = {
            ...defaultUserSettings,
            ...userSettings,
            // Deeper merge for config
            xtreamConfig: {
                ...defaultUserSettings.xtreamConfig,
                ...(userSettings.xtreamConfig || {})
            },
            // Ensure nested objects exist
            favorites: userSettings.favorites || [],
            toWatch: userSettings.toWatch || [], // NEW
            watched: userSettings.watched || {},
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
    try {
        // 1. Try to fetch remote settings
        const response = await fetch(`http://i.geekspro.us/users/${username}.json`);
        if (response.ok) {
            console.log("Fetched remote user settings.");
            const fetchedSettings = await response.json();
            userSettings = {
                ...defaultUserSettings,
                ...fetchedSettings,
                xtreamConfig: {
                    ...defaultUserSettings.xtreamConfig,
                    ...(fetchedSettings.xtreamConfig || {})
                },
                favorites : [
                    ...defaultUserSettings.favorites,
                    ...fetchedSettings.favorites
                ],
                toWatch: fetchedSettings.toWatch || [],
                watched: fetchedSettings.watched || {},
                keyMap : fetchedSettings.keyMap || defaultUserSettings.keyMap || {},
            };
            
        } else {
            // 2. No remote settings, fall back to localStorage
            console.log("No remote settings found, loading from localStorage.");
            loadUserSettings(username); // This loads from localStorage or creates new
        }
    } catch (e) {
        showLoader(false);
        // 3. Fetch failed (e.g., offline), fall back to localStorage
        console.warn("Fetch failed, loading from localStorage.", e);
        loadUserSettings(username); // This loads from localStorage or creates new

    } finally {
        showLoader(false);
        currentUsername = username;
        localStorage.setItem('iptv-last-user', username);
        loadTheme();
        saveUserSettings(); // Save merged settings to localStorage
    }
    
    // 4. Check if API is configured
    if (userSettings.xtreamConfig && userSettings.xtreamConfig.host) {
        // Test API config
        handleApiConnect(null,true); // true = isAutoLogin
    } else {
        // 5. Need to configure API
        $('#api-username').textContent = username;
        // Pre-fill fields from settings (which might be from user.json)
        $('#host').value = userSettings.xtreamConfig.host || '';
        $('#api-user').value = userSettings.xtreamConfig.username || '';
        $('#api-pass').value = userSettings.xtreamConfig.password || '';
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
    console.log(`handleApiConnect called (isAutoLogin: ${isAutoLogin})`); // DEBUG
    const config = userSettings.xtreamConfig;
    
    if (!isAutoLogin) {
        config.host = $('#host').value.trim();
        config.username = $('#api-user').value.trim();
        config.password = $('#api-pass').value.trim();
        
        console.log('Reading from form fields:', config); // DEBUG
    }

    if (!config.host || !config.username || !config.password) {
        console.log(isAutoLogin)
        console.log('Validation failed. One or more fields are empty.'); // DEBUG
        if (!isAutoLogin) showError('Please fill in all fields.');
        // Pre-fill fields with the data that just failed
        $('#host').value = config.host || '';
        $('#api-user').value = config.username || '';
        $('#api-pass').value = config.password || '';
        showPage('page-api-details');
        return;
    }
    
    console.log('Validation passed. Proceeding to fetch.'); // DEBUG

    if (!config.host.startsWith('http')) config.host = 'http://' + config.host;
    if (config.host.endsWith('/')) config.host = config.host.slice(0, -1);

    apiBaseUrl = `${config.host}/player_api.php`;

    try {
        // Test login
        const data = await fetchXtream({ action: 'get_vod_categories' });
        if (data) {
            console.log('API connection successful');
            userSettings.xtreamConfig = config; // Save config
            saveUserSettings();
            
            // --- NEW ROUTING LOGIC ---
            // Check if we have a deep link hash to handle from page load
            if (initialHash && initialHash !== '#main' && initialHash !== '#login' && initialHash !== '#') {
                const handled = await handleInitialHash(initialHash); // Make it async
                if (!handled) {
                    // If routing failed, go to main
                    console.warn("Failed to handle hash, defaulting to main.");
                    showPage('page-main');
                    pushToNavStack('page-main');
                }
            } else {
                // No hash, just go to main
                showPage('page-main');
                pushToNavStack('page-main');
            }
            initialHash = ''; // Clear the hash, it has been handled
            // --- END NEW LOGIC ---

        } else {
            throw new Error("Authentication failed or empty response.");
        }
    } catch (error) {
        console.error('API connection failed:', error);
        // Use the specific error message from fetchXtream
        showError(`API Error: ${error.message}`);
        
        // Pre-fill fields with the data that just failed
        $('#host').value = config.host || '';
        $('#api-user').value = config.username || '';
        $('#api-pass').value = config.password || '';
        
        showPage('page-api-details');
    }
}