browser.runtime.getBackgroundPage().then(bg => {
	const currentCreatorEl = document.getElementById('currentCreator');
	const pendingCountEl = document.getElementById('pendingCount');
	const doneCountEl = document.getElementById('doneCount');
	const toggleCreatorBtn = document.getElementById('toggleCreatorButton');
	const resetCreatorBtn = document.getElementById('resetCreatorButton');
	const resetAllBtn = document.getElementById('resetAllButton');
	const feedbackEl = document.getElementById('feedback');
	const clearAllBtn = document.getElementById('clearAllButton');
	const concurrentDownloadsInput = document.getElementById('concurrentDownloadsInput');

	function updateCreator() {
		let creator = bg.pageCreator;
		if (creator) {
			currentCreatorEl.textContent = creator;
			currentCreatorEl.classList.remove('unknown');

			let enabled = bg.knownCreators[creator] === true;
			toggleCreatorBtn.disabled = false;
			toggleCreatorBtn.textContent = enabled ? `Disable "${creator}"` : `Enable "${creator}"`;
			toggleCreatorBtn.classList.toggle('secondary', enabled);

			resetCreatorBtn.textContent = `Reset "${creator}"`;
			resetCreatorBtn.disabled = false;
		} else {
			currentCreatorEl.textContent = 'not detected';
			currentCreatorEl.classList.add('unknown');
			toggleCreatorBtn.disabled = true;
			toggleCreatorBtn.textContent = 'No creator detected';
			toggleCreatorBtn.classList.remove('secondary');
			resetCreatorBtn.textContent = 'Reset current creator';
			resetCreatorBtn.disabled = true;
		}
	}

	function updateStats() {
		let tx = bg.db.transaction("downloads");
		let index = tx.objectStore("downloads").index("state");
		index.count(IDBKeyRange.only(0)).onsuccess = e => {
			pendingCountEl.textContent = e.target.result;
		};
		index.count(IDBKeyRange.only(1)).onsuccess = e => {
			doneCountEl.textContent = e.target.result;
		};
	}

	function resetDownloads(creator) {
		let store = bg.db.transaction("downloads", "readwrite").objectStore("downloads");
		let count = 0;

		let req = creator
			? store.index("filename").openCursor(IDBKeyRange.bound(`patreon/${creator}/`, `patreon/${creator}/￿`))
			: store.openCursor();

		req.onsuccess = e => {
			let cursor = e.target.result;
			if (!cursor) {
				let label = creator ? `"${creator}"` : 'all creators';
				showFeedback(`Reset ${count} file(s) for ${label}.`);
				updateStats();
				return;
			}
			if (cursor.value.state === 1) {
				cursor.value.state = 0;
				cursor.update(cursor.value);
				count++;
			}
			cursor.continue();
		};
	}

	function showFeedback(msg) {
		feedbackEl.textContent = msg;
		feedbackEl.style.display = 'block';
		setTimeout(() => { feedbackEl.style.display = 'none'; }, 4000);
	}

	concurrentDownloadsInput.value = bg.concurrentDownloads;
	concurrentDownloadsInput.addEventListener('change', e => {
		let val = Math.min(Math.max(parseInt(e.target.value) || 1, 1), 4);
		e.target.value = val;
		bg.concurrentDownloads = val;
		bg.updateSettingsStorage();
	});

	toggleCreatorBtn.addEventListener('click', () => {
		let creator = bg.pageCreator;
		if (!creator) return;
		let enabled = bg.knownCreators[creator] === true;
		bg.setCreatorContentCollection(creator, !enabled);
		updateCreator();
	});

	resetCreatorBtn.addEventListener('click', () => resetDownloads(bg.pageCreator));
	resetAllBtn.addEventListener('click', () => resetDownloads(null));

	clearAllBtn.addEventListener('click', () => {
		if (!window.confirm('This will delete the entire download history, all known creators, and reset all settings to default. Continue?'))
			return;

		// clear IndexedDB
		bg.db.transaction("downloads", "readwrite").objectStore("downloads").clear();

		// reset in-memory state
		bg.knownCreators = {};
		bg.downloadAttachments = true;
		bg.useLostAndFound = true;
		bg.collectionMode = "greedy";
		bg.concurrentDownloads = 1;
		bg.activeDownloads = 0;

		// wipe storage
		browser.storage.local.clear().then(() => {
			showFeedback('All data cleared. Reloading…');
			setTimeout(() => window.close(), 1500);
		});
	});

	browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
		if (!tabs[0]) { updateCreator(); updateStats(); return; }

		browser.tabs.sendMessage(tabs[0].id, {action: "getCreator"})
			.then(response => {
				if (response && response.creator) bg.pageCreator = response.creator;
			})
			.catch(() => {}) // not a patreon tab or content script not ready
			.finally(() => { updateCreator(); updateStats(); });
	});

	setInterval(() => { updateCreator(); updateStats(); }, 2000);
});
