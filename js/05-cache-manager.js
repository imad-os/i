// cache-manager.js
// Optimized CacheManager for Tizen TV (low CPU / low RAM safe)
// Features:
// - Uses wgt-private/cache root
// - Keeps per-type folders (live, vod, series)
// - Non-blocking JSON parse/serialize helpers (yields to event loop)
// - Size caps: won't cache files > MAX_CACHE_BYTES (configurable)
// - meta.json versioning and auto-invalidate on mismatch
// - Robust read/write with corruption handling
// - Minimal logging via debug flag

console.log("isTizen:", isTizen);
function FakeTizenFS() {
    if(userSettings.useFileSystemCache){
        return;
    }
    console.log("Fake Tizen FS enabled for Chrome testing.");

    // In-memory fake storage for Chrome testing
    window.fakeTizenFSData = [];

    function getFile(path) {
        return window.fakeTizenFSData.find(o => o.path === path);
    }

    function writeFile(path, content) {
        let f = getFile(path);
        if (f) f.content = content;
        else window.fakeTizenFSData.push({ path, content });
    }

    window.tizen = window.tizen || {};
    window.tizen.filesystem = {

        resolve(path, success, error) {
            try {

                success({
                    path,

                    // Simple file read
                    readAsText(callback) {
                        const f = getFile(path);
                        callback(f ? f.content : "");
                    },

                    // Stream mode (read/write)
                    openStream(mode, callback) {
                        const f = getFile(path);

                        let buffer = f ? f.content : "";

                        callback({
                            // For writing
                            write(txt) {
                                buffer = txt;
                            },

                            // For reading
                            readAsText(callback) {
                                callback(buffer || "");
                            },

                            close() {
                                writeFile(path, buffer || "");
                            }
                        });
                    },

                    createDirectory() {},
                    createFile() {},

                    remove(cb) {
                        window.fakeTizenFSData =
                            window.fakeTizenFSData.filter(o => o.path !== path);
                        cb && cb();
                    },

                    listFiles() {
                        return window.fakeTizenFSData
                            .filter(o => o.path.startsWith(path + "/"))
                            .map(o => ({
                                path: o.path,
                                remove(cb) {
                                    window.fakeTizenFSData =
                                        window.fakeTizenFSData.filter(x => x.path !== o.path);
                                    cb && cb();
                                }
                            }));
                    }
                });

            } catch (e) {
                error && error(e);
            }
        }
    };
}
FakeTizenFS();

class CacheManager {
    constructor(options = {}) {
        if (!isTizen || !window.tizen || !window.tizen.filesystem) {
            console.log("Tizen filesystem API not available");
            return
        }
        this.fs = window.tizen.filesystem;
        this.root = "wgt-private"; // application private storage
        this.cacheFolder = "cache";
        this.cacheRootPath = `${this.root}/${this.cacheFolder}`; // wgt-private/cache
        this.debug = !!options.debug;
        this.META_FILENAME = "meta.json";
        // default max cached file size (bytes) - keep small for low-end tvs
        this.MAX_CACHE_BYTES = options.maxCacheBytes || 10 * 1024 * 1024; // 10 MB
        this.APP_CACHE_VERSION = options.appCacheVersion || 1;
        this.initialized = false;
    }

    log(...args) {
        if (this.debug) console.log("[CacheManager]", ...args);
    }

    // Non-blocking JSON parse (yields to event loop)
    async safeJsonParse(text) {
        return new Promise((resolve, reject) => {
            // yield once to allow UI to update
            setTimeout(() => {
                try {
                    const parsed = JSON.parse(text);
                    resolve(parsed);
                } catch (err) {
                    reject(err);
                }
            }, 0);
        });
    }

    // Non-blocking stringify (yielding)
    async safeJsonStringify(obj) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                try {
                    const s = JSON.stringify(obj);
                    resolve(s);
                } catch (err) {
                    reject(err);
                }
            }, 0);
        });
    }

    async init() {
        if (this.initialized) return;
        this.initialized = true;

        // ensure root/cache exists
        await this._ensureFolder(this.cacheRootPath);

        // check meta version
        try {
            const meta = await this._readTextFile(`${this.cacheRootPath}/${this.META_FILENAME}`);
            const parsed = await this.safeJsonParse(meta);
            if (!parsed || parsed.version !== this.APP_CACHE_VERSION) {
                this.log("Cache version mismatch or absent - clearing cache.");
                await this.clearAll();
                await this._writeMeta();
            } else {
                this.log("Cache version OK");
            }
        } catch (e) {
            // meta missing or corrupt -> create fresh meta
            this.log("No valid meta file, resetting cache meta.", e && e.message);
            await this.clearAll().catch(()=>{}); // best-effort
            await this._writeMeta().catch(()=>{});
        }
    }

    async _writeMeta() {
        const meta = { version: this.APP_CACHE_VERSION, createdAt: Date.now() };
        try {
            const body = await this.safeJsonStringify(meta);
            await this._writeTextFile(`${this.cacheRootPath}/${this.META_FILENAME}`, body);
        } catch (e) {
            this.log("Failed to write meta file:", e && e.message);
        }
    }

    // map type to folder name (guarding invalid names)
    getTypeFolder(type) {
        const map = { live: "live", vod: "vod", series: "series" };
        return map[type] || String(type);
    }

    // ensure folder exists
    _ensureFolder(path) {
        return new Promise((resolve, reject) => {
            this.fs.resolve(path, (dir) => {
                resolve(dir);
            }, (err) => {
                // create parent then folder
                // path expected like "wgt-private/cache" or "wgt-private/cache/vod"
                const parent = path.substring(0, path.lastIndexOf("/"));
                const folderName = path.substring(path.lastIndexOf("/") + 1);
                this.fs.resolve(parent, (pdir) => {
                    try {
                        pdir.createDirectory(folderName);
                        // small delay to ensure FS flushed on some TVs
                        setTimeout(() => resolve(true), 30);
                    } catch (e) {
                        // directory may already exist
                        resolve(true);
                    }
                }, (e) => {
                    reject(e);
                });
            });
        });
    }

    // read as text, returns string or throws
    _readTextFile(path) {
        console.log("_readTextFile:", path);
        return new Promise((resolve, reject) => {
            this.fs.resolve(path, (file) => {
                try {
                    file.openStream("r", (stream) => {
                        let text = "";
                        stream.readAsText((content) => {
                            // tizen readAsText callback provides content
                            resolve(content);
                            stream.close();
                        }, (err) => {
                            stream.close();
                            reject(err);
                        });
                    }, reject);
                } catch (e) {
                    reject(e);
                }
            }, (err) => reject(err));
        });
    }

    // write text to file (creates file if missing)
    _writeTextFile(path, text) {
        return new Promise((resolve, reject) => {
            const folder = path.substring(0, path.lastIndexOf("/"));
            const fileName = path.substring(path.lastIndexOf("/") + 1);

            this._ensureFolder(folder).then(() => {
                // try resolve file, else create file
                this.fs.resolve(path, (file) => {
                    // file exists - open and write
                    try {
                        file.openStream("w", (stream) => {
                            stream.write(text);
                            stream.close();
                            // tiny delay so TV FS can commit
                            setTimeout(resolve, 25);
                        }, (err) => {
                            reject(err);
                        });
                    } catch (e) {
                        reject(e);
                    }
                }, () => {
                    // file not exist - create then write
                    this.fs.resolve(folder, (dir) => {
                        try {
                            dir.createFile(fileName);
                            // write again
                            this._writeTextFile(path, text).then(resolve).catch(reject);
                        } catch (e) {
                            reject(e);
                        }
                    }, reject);
                });
            }).catch(reject);
        });
    }

    // delete a file if exists
    _deleteFile(path) {
        return new Promise((resolve, reject) => {
            this.fs.resolve(path, (file) => {
                try {
                    file.remove(resolve, reject);
                } catch (e) {
                    resolve(); // best-effort
                }
            }, () => resolve()); // file not found -> ok
        });
    }

    // --- Public helpers ---

    // Save categories list for a type (object/array)
    async saveCategories(type, categories) {
        if (!categories) return;
        await this.initIfNeeded();
        const folder = this.getTypeFolder(type);
        const path = `${this.cacheRootPath}/${folder}/categories.json`;

        try {
            const body = await this.safeJsonStringify(categories);
            if (body.length > this.MAX_CACHE_BYTES) {
                this.log("Skipping saveCategories: file too large (> MAX_CACHE_BYTES)");
                return;
            }
            await this._writeTextFile(path, body);
        } catch (e) {
            this.log("Failed to saveCategories:", e && e.message);
        }
    }

    // Load categories list, returns parsed object or throws
    async loadCategories(type) {
        await this.initIfNeeded();
        const folder = this.getTypeFolder(type);
        const path = `${this.cacheRootPath}/${folder}/categories.json`;
        const text = await this._readTextFile(path);
        const parsed = await this.safeJsonParse(text);
        return parsed;
    }

    // Save items for a given category id
    async saveCategoryItems(type, catId, items) {
        if (!catId || !items) return;
        await this.initIfNeeded();
        const folder = this.getTypeFolder(type);
        const path = `${this.cacheRootPath}/${folder}/${catId}.json`;

        try {
            const body = await this.safeJsonStringify(items);
            if (body.length > this.MAX_CACHE_BYTES) {
                this.log("Skipping saveCategoryItems: file too large (> MAX_CACHE_BYTES)");
                return;
            }
            await this._writeTextFile(path, body);
        } catch (e) {
            this.log("Failed saveCategoryItems:", e && e.message);
        }
    }

    // Load items for category id
    async loadCategoryItems(type, catId) {
        if (!catId) throw new Error("catId required");
        await this.initIfNeeded();
        const folder = this.getTypeFolder(type);
        const path = `${this.cacheRootPath}/${folder}/${catId}.json`;
        try {
            const text = await this._readTextFile(path);
            const parsed = await this.safeJsonParse(text);
            return parsed;
        } catch (e) {
            // If corrupt, remove file to avoid future crashes
            try { await this._deleteFile(path); } catch (ee) {}
            throw e;
        }
    }

    // Quick existence check for file
    async exists(path) {
        return new Promise((resolve) => {
            this.fs.resolve(path, (file) => resolve(true), () => resolve(false));
        });
    }

    // Clear everything in cache root (useful on version mismatch)
    async clearAll() {
        // remove cache folder by removing files under it (tizen may not support recursive remove)
        return new Promise((resolve) => {
            this.fs.resolve(this.cacheRootPath, (dir) => {
                try {
                    // iterate items and remove files/dirs
                    const list = dir.listFiles();
                    if (!list || list.length === 0) {
                        resolve();
                        return;
                    }
                    // remove each entry; small delays to avoid hogging FS
                    let idx = 0;
                    const next = () => {
                        if (idx >= list.length) {
                            setTimeout(resolve, 40);
                            return;
                        }
                        const f = list[idx++];
                        try {
                            f.remove(() => setTimeout(next, 10), () => setTimeout(next, 10));
                        } catch (e) {
                            setTimeout(next, 10);
                        }
                    };
                    next();
                } catch (e) {
                    resolve();
                }
            }, () => resolve());
        });
    }

    // ensure init called
    async initIfNeeded() {
        if (!this.initialized) await this.init();
    }
}

// expose for import
window.CacheManager = CacheManager;
