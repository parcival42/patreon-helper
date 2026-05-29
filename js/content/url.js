// matches patreon.com/cw/{creator} and patreon.com/c/{creator}
const creatorUrlRegex = /patreon\.com\/(?:cw|c)\/(\w+)/;

function detectAndSendCreator() {
	let match = creatorUrlRegex.exec(window.location.href);
	let creator = match !== null ? match[1] : null;
	browser.runtime.sendMessage({
		action: "setPageCreator",
		data: { creator }
	});
}

detectAndSendCreator();

// re-detect on SPA navigation (Patreon uses client-side routing)
let lastUrl = window.location.href;
new MutationObserver(() => {
	if (window.location.href !== lastUrl) {
		lastUrl = window.location.href;
		detectAndSendCreator();
	}
}).observe(document, { subtree: true, childList: true });

// popup can ask for current creator directly
browser.runtime.onMessage.addListener(request => {
	if (request.action === "getCreator") {
		let match = creatorUrlRegex.exec(window.location.href);
		return Promise.resolve({ creator: match ? match[1] : null });
	}
});
