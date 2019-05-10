(function() {
	let path = require('path');

	let config;
	let storage;

	let CandyHopReg = ['CandyHop',{
		save:    ['accountId','progress','pack'],
		make:    (data) => new CandyHop(data.accountId),
		table:   'CandyHop',
		idField: 'accountId',
		version: 1
	}];

	class CandyHop {
		constructor(accountId) {
			this.accountId  = accountId;
			this.progress   = [];
			this.pack       = [];
		}
	}

	CandyHop.onInit = function(_context) {
		config  = _context.config;
		storage = _context.storage;
		storage.serial.register( ...CandyHopReg );
		storage.serial.register( ...CandyHopLevelReg );
	}

	CandyHop.onInstallRoutes = function(app) {
		let express = require('express');
		app.use(  "/candyhop",   express.static(path.join(__dirname, '../candyhop')));
		app.get(  "/progressCh", CandyHop.progressGet );
		app.post( "/progressCh", CandyHop.progressPost );
		app.get(  "/chpack",     CandyHop.packGet );
		app.post( "/chpack",     CandyHop.packPost );
	}

	CandyHop.progressGet = async function(req,res) {
		let accountId = req.session.accountId;
		let gameData = await storage.load( 'CandyHop', accountId );
		res.send( gameData.progress || [] );
	}

	CandyHop.progressPost = async function(req,res) {
		let accountId = req.session.accountId;
		if( !accountId ) {
			return res.send( { result: 'failure', message: 'no account', detail: req.body } );
		}

		let levelId = req.body.level;
		if( levelId === undefined || levelId === null ) {
			return res.send( { result: 'failure', message: 'no level specified', detail: req.body } );
		}

		let scoreBlank = ()=>({points: 0, stars: 0, tries: 0});
		let points     = req.body.points || 0;
		let stars      = req.body.stars || 0; 

		let gameData   = await storage.load( 'CandyHop', accountId ) || [];
		let score      = gameData.progress[levelId] || scoreBlank();

		// Save this level's best score
		Object.assign( gameData.progress[levelId], {
			points: Math.max(score.points || 0, points),
			stars: Math.max(score.stars || 0, stars),
			tries: (score.tries || 0) + 1
		});

		// Open up the next level for play
		if( stars > 0 && (gameData.progress[levelId+1] === undefined || gameData.progress[levelId+1] === null) ) {
			gameData.progress[levelId+1] = scoreBlank();
		}

		storage.save( gameData );

		return res.send( { result: 'success' } );
	}


	let CandyHopLevelReg = ['CandyHopLevel',{
		save:    ['levelId','name','author','version','published','finished','map'],
		make:    (data) => new CandyHopLevel(data.levelId,data),
	}];

	class CandyHopLevel {
		constructor(levelId,data) {
			this.levelId = levelId;
			this.name = data.name || 'noname';
			this.author = data.author || '';
			this.version = data.version || 0;
			this.published = data.published || 0;
			this.finished = data.finished || 0;		// which version got finished?
			this.map = data.map || [];
		}
	};

	CandyHop.packGet = async function(req,res) {
		let accountId = req.session.accountId;
		let gameData  = await storage.load( 'CandyHop', accountId );
		res.send( gameData.pack );
	}

	CandyHop.packPost = async function(req,res) {
		let accountId = req.session.accountId;
		let levelId   = req.body.level;
		let level     = req.body.layout;
		
		if( !accountId ) {
			return res.send( { result: 'failure', message: 'blank accountId', detail: req.body } );
		}
		
		if( levelId === undefined || levelId === null ) {
			return res.send( { result: 'failure', message: 'no level specified', detail: req.body } );
		}

		if( !level || !level.name || !level.map ) {
			return res.send( { result: 'failure', message: 'bad layout format', detail: req.body } );
		}

		let gameData = await storage.load( 'CandyHop', accountId );
		gameData.pack[levelId] = new CandyHopLevel( levelId, gamedata.pack[levelId] || {} );
		storage.save(gameData);
		return res.send( { result: 'success' } );
	}

	module.exports = CandyHop;

})();
