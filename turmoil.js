(function() {
	let path = require('path');

	let config;
	let storage;

	class Turmoil {
		constructor() {
		}
	}

	Turmoil.onInit = function(_context) {
		config  = _context.config;
		storage = _context.storage;
	}

	Turmoil.onInstallRoutes = function(app) {
		let express = require('express');
		app.use(  "/turmoil", express.static(path.join(__dirname, '../turmoil')));
	}

	module.exports = Turmoil;

})();