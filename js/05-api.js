// === API Handling ===

async function fetchXtream(params, loading=true) {
    if (loading){
        showLoader(true);
    }
    
    
    // Safety check
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
    console.log(`Fetching from Xtream API: ${url}`); // DEBUG
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Network error: ${response.statusText}`);
        }
        const data = await response.json();
        
        if (data.user_info && data.user_info.auth === 0) {
             throw new Error("Xtream API: Authentication failed.");
        }
        
        if (loading){
            showLoader(false);
        }
        return data;
    } catch (error) {
        console.error('Fetch error:', error);
        
        // Check for network failure, which is often a CORS issue
        if (error instanceof TypeError && error.message === "Failed to fetch") {
             const specificError = "Network Error (Server offline or CORS issue).";
             showError(specificError);
             throw new Error(specificError); // Re-throw to be caught by handleApiConnect
        } else {
            showError(error.message); // Show specific error (e.g., "Authentication failed")
            throw error; // Re-throw
        }
    }
}