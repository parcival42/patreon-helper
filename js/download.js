/*
 *	Patreon Helper for Firefox
 * 	draconigen@gmail.com
 */

var db;
var activeDownloads = 0;
var downloadIdToDbId = new Map(); // maps Firefox download ID → our DB record ID

var dbOpen = indexedDB.open("patreonex", dbVersion);

dbOpen.onupgradeneeded = () => {
    console.info(`initializing downloads structure, version "${dbVersion}".`);

    try {dbOpen.result.deleteObjectStore("downloads")}
    catch {console.warn("could not delete downloads object store - probably none present")}

    let store = dbOpen.result.createObjectStore("downloads", {keyPath: "id", autoIncrement: true});
    store.createIndex("identifier", "identifier", {unique: true});
    store.createIndex("filename", "filename", {unique: false});
    store.createIndex("url", "url", {unique: false});
    store.createIndex("state", "state", {unique: false});
}

dbOpen.onsuccess = () => {
    db = dbOpen.result;

    // reset in-progress items left over from a previous session
    let store = db.transaction("downloads", "readwrite").objectStore("downloads");
    store.index("state").openCursor(IDBKeyRange.only(2)).onsuccess = e => {
        let cursor = e.target.result;
        if (!cursor) {
            for (let i = 0; i < concurrentDownloads; i++) downloadNext();
            return;
        }
        cursor.value.state = 0;
        cursor.update(cursor.value);
        cursor.continue();
    };
};

// fires when a browser download actually completes or fails
browser.downloads.onChanged.addListener(delta => {
    if (!downloadIdToDbId.has(delta.id) || !delta.state) return;

    let state = delta.state.current;
    if (state !== 'complete' && state !== 'interrupted') return;

    let dbId = downloadIdToDbId.get(delta.id);
    downloadIdToDbId.delete(delta.id);

    // complete → done (1), interrupted → failed (3); state 3 won't be retried automatically
    let newState = state === 'complete' ? 1 : 3;
    let store = db.transaction("downloads", "readwrite").objectStore("downloads");
    store.get(dbId).onsuccess = e => {
        let record = e.target.result;
        if (record) {
            record.state = newState;
            store.put(record);
        }
    };

    activeDownloads--;
    downloadNext();
});

function downloadNext() {
    if (activeDownloads >= concurrentDownloads || !db) return;
    activeDownloads++; // claim slot synchronously before any async work

    let store = db.transaction("downloads", "readwrite").objectStore("downloads");
    store.index("state").openCursor(IDBKeyRange.only(0)).onsuccess = event => {
        let cursor = event.target.result;
        if (!cursor) {
            activeDownloads--; // nothing pending, release slot
            return;
        }

        let record = cursor.value;
        record.state = 2; // mark in-progress
        cursor.update(record);

        startDownload(record.filename, record.url, record.id);
    };
}

function setDbState(dbId, state) {
    let store = db.transaction("downloads", "readwrite").objectStore("downloads");
    store.get(dbId).onsuccess = e => {
        let record = e.target.result;
        if (record) { record.state = state; store.put(record); }
    };
}

function startDownload(filename, url, dbId) {
    console.info(`downloading; filename: '${filename}', url: '${url}'`);

    if (url.includes('patreonusercontent.com')) {
        browser.downloads.download({ filename, url, saveAs: false })
            .then(
                downloadId => {
                    // slot stays claimed until onChanged fires with complete/interrupted
                    downloadIdToDbId.set(downloadId, dbId);
                },
                () => {
                    console.error(`download failed; filename: '${filename}', url: '${url}'`);
                    setDbState(dbId, 3);
                    activeDownloads--;
                    downloadNext();
                }
            );
    } else if (downloadAttachments) {
        console.info("Downloading attachment", {filename, url});
        browser.tabs.create({ active: false, url });
        setDbState(dbId, 1);
        activeDownloads--;
        downloadNext();
    } else {
        console.info(`Attachment skipped (downloadAttachments: false)`, {filename, url});
        setDbState(dbId, 1);
        activeDownloads--;
        downloadNext();
    }
}
