browser.runtime.getBackgroundPage().then(bg => {
	const currentCreatorEl = document.getElementById('currentCreator');
	const pendingCountEl = document.getElementById('pendingCount');
	const toggleCreatorBtn = document.getElementById('toggleCreatorButton');
	const concurrentDownloadsInput = document.getElementById('concurrentDownloadsInput');
	const openSettingsPageEl = document.getElementById('openSettingsPageLink');

	function updateCreator() {
		let creator = bg.pageCreator;
		if (creator) {
			currentCreatorEl.textContent = creator;
			currentCreatorEl.classList.remove('unknown');

			let enabled = bg.knownCreators[creator] === true;
			toggleCreatorBtn.disabled = false;
			toggleCreatorBtn.textContent = enabled ? `Disable "${creator}"` : `Enable "${creator}"`;
			toggleCreatorBtn.classList.toggle('secondary', enabled);
		} else {
			currentCreatorEl.textContent = 'not detected';
			currentCreatorEl.classList.add('unknown');
			toggleCreatorBtn.disabled = true;
			toggleCreatorBtn.textContent = 'No creator detected';
			toggleCreatorBtn.classList.remove('secondary');
		}
	}

	function updateStats() {
		let tx = bg.db.transaction("downloads");
		let index = tx.objectStore("downloads").index("state");
		index.count(IDBKeyRange.only(0)).onsuccess = e => {
			pendingCountEl.textContent = e.target.result;
		};
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

		// reloading the tab re-triggers API requests so newly enabled creators are collected immediately
		if (enabled) return; // disabling needs no reload
		browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
			if (tabs[0]) browser.tabs.reload(tabs[0].id);
		});
	});

	openSettingsPageEl.addEventListener('click', () => {
		browser.runtime.openOptionsPage();
		window.close(); // close popup
	});

	browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
		if (!tabs[0]) { updateCreator(); updateStats(); return; }

		// disable interactive controls and show a notice when not on the target site
		let isPatreonTab = tabs[0].url && tabs[0].url.includes('patreon.com');
		if (!isPatreonTab) {
			document.body.classList.add('not-patreon');
			return;
		}

		browser.tabs.sendMessage(tabs[0].id, {action: "getCreator"})
			.then(response => {
				if (response && response.creator) bg.pageCreator = response.creator;
			})
			.catch(() => {})
			.finally(() => { updateCreator(); updateStats(); });
	});

	setInterval(() => { updateCreator(); updateStats(); }, 2000);
});
