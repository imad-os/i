// === Global State ===
// This file defines all the global state variables
// It must be loaded first.

let isTizen = true;//typeof webapis !== 'undefined' && webapis.avplay; // Detect Tizen OS
let currentUsername = '';
const defaultUserSettings = {
    favorites: [], // Array of stream_ids
    watching: {}, // { id: { progress_sec, duration_sec, type, item, episode? } }
    theme: 'theme-default',
    gpu_memory_enhancer:false,
    hiddenCategories: [], // Array of category_ids to hide
    pinnedCategories: [], // Array of category_ids to pin to top
    pl: 0, // Current playlist index
    useCache: true,
    useFileSystemCache: false,
    autoPlayNextEpisode: true,
    rememberLastPosition: true,
    showAdultContent: false,
    xtreamConfig: [{
        title: 'Default Playlist',
        host: '',
        username: '',
        password: ''
    }]
};
let currnetCategory = "";
let userSettings = { ...defaultUserSettings };

let focus_history={};
let apiBaseUrl = '';
let navigationStack = []; // For "Back" button functionality
let tizenAvPlayer; // Holds the Tizen player object
let tizenOverlayTimer;
let currentItem = null; // Holds item being played for progress saving
let currentEpisode = null; // Holds episode being played
let saveProgressInterval;
let lastFocusedElement = null; // For restoring focus after modal
let clockInterval;
let initialHash = ''; // <-- NEW: For routing on refresh

// --- NEW SEARCH STATE ---
let searchState = {
    active: false,
    query: '',
    originalItems: [] // Backup of full list for filtering
};

// --- NEW VIRTUALIZATION STATE ---
let virtualList = null; // Holds the virtual list instance returned by createVirtualList
let virtualListItems = []; // Holds the data (movies/series) for the virtual list
let virtualListType = ''; // 'vod' or 'series'
let virtualListContext = {}; // e.g., { special: 'favorites' }
let focusedVirtualIndex = 0; // The index of the focused item
// --- END NEW VIRTUALIZATION STATE ---


// --- NEW TIZEN PLAYER STATE ---
let tizenPlayerInfo = {
    audioTracks: [],
    subtitleTracks: [],
    width: 0,
    height: 0,
    duration: 0,
    currentAudioIndex: -1,
    currentSubtitleIndex: -1
};

let xtreamConfig = userSettings.xtreamConfig[userSettings.pl || 0] || {};

let isTizenPlaying = true;
let tizenOverlayActive = false;
let tizenModalActive = false;
// --- END TIZEN PLAYER STATE ---

// This is the source of truth for grid classes
const GRID_CLASS_DEFAULT = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4 p-4';
const grid_class = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4 p-4';

