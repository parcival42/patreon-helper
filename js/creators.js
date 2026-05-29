function registerCreator(name) {
	if (knownCreators.hasOwnProperty(name)) {
		console.info(`registering creator "${name}" rejected: name already known.`);
		return;
	}

	if (name === unknownCreator) {
		console.info(`registering creator "${name}" rejected: name unknown.`);
		return;
	}
	
	// greedy: new creators are enabled by default; selective: require explicit opt-in
	knownCreators[name] = (collectionMode === "greedy");

	updateSettingsStorage();
}

function setCreatorContentCollection(name, state) {
	if (!knownCreators.hasOwnProperty(name)) {
		console.warn(`setCreatorContentCollection("${name}", ${state}) called, but "${name}" was not on the list; registering now.`);
		registerCreator(name);
	}

	knownCreators[name] = state;

	updateSettingsStorage();
}

function clearKnownCreators() {
	knownCreators = {};
	updateSettingsStorage();
	return "OK, knownCreators cleared.";
}