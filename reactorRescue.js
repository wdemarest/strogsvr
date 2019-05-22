(function() {
	let path = require('path');

	let config;
	let storage;

	let ReactorRescueReg = ['ReactorRescue',{
		save:    ['accountId','userName','progress'],
		make:    (data) => new ReactorRescue(data.accountId,data),
		table:   'ReactorRescue',
		idField: 'accountId',
		version: 1
	}];

	class ReactorRescue {
		constructor(accountId,data) {
			this.accountId  = accountId;
			this.userName   = data.userName;	// WARNING! This is a nasty cached userName, for convenience. It will cause trouble eventually.
			this.progress   = data.progress || [];
		}
	}

	ReactorRescue.recordsCache = null;	// holds the best records, so we only have to recalculate them when somebody has beat their own high score.

	ReactorRescue.onInit = function(_context) {
		config  = _context.config;
		storage = _context.storage;
		storage.serial.register( ...ReactorRescueReg );
	}

	ReactorRescue.onInstallRoutes = function(app) {
		let express = require('express');
		app.use(  "/reactorRescue", express.static(path.join(__dirname, '../reactorRescue')));
		app.get(  "/progressRr", ReactorRescue.progressGet );
		app.post( "/progressRr", ReactorRescue.progressPost );
		app.get(  "/recordsRr",  ReactorRescue.recordsGet );
	}

	ReactorRescue.recordsGet = async function(req,res) {
		if( !ReactorRescue.recordsCache ) {
			let gameDataList = await storage.loadAll( 'ReactorRescue' );

			let i;
			let best = [];
			for( let key in gameDataList ) {
				let gameData = gameDataList[key] || {progress:null};
				let progress = gameData.progress || [];
				for( let i=0 ; i<progress.length ; ++i ) {
					if( best[i] === undefined || progress[i].time < best[i].time ) {
						best[i] = best[i] || {};
						best[i].time     = progress[i].time;
						best[i].userName = gameData.userName;
					}
				}
			}

			ReactorRescue.recordsCache = best;
		}
		return res.send( ReactorRescue.recordsCache );
	}

	ReactorRescue.progressGet = async function(req,res) {
		let accountId = req.session.accountId;
		let gameData = await storage.load( 'ReactorRescue', accountId );
		res.send( gameData.progress || [] );
	}

	ReactorRescue.progressPost = async function(req,res) {

		let accountId = req.session.accountId;
		if( !accountId ) {
			return res.send( { result: 'failure', message: 'no account', detail: req.body } );
		}

		let levelId = req.body.level;
		if( levelId === undefined || levelId === null ) {
			return res.send( { result: 'failure', message: 'no level specified', detail: req.body } );
		}

		let timeFail = 9999;
		let timeNew = req.body.time || timeFail;
		let gameData = await storage.load( 'ReactorRescue', accountId );

		gameData.progress = gameData.progress || [];
		gameData.progress[levelId] = gameData.progress[levelId] || {};

		let timeBest = gameData.progress[levelId];
		if( !timeBest || timeNew < timeBest ) {
			// Save the best time.
			ReactorRescue.recordsCache = null;
			gameData.progress[levelId] = {
				time: timeNew,
			};
		}

		// Open up the next level for play
		if( timeNew < timeFail && (gameData.progress[levelId+1] === undefined || gameData.progress[levelId+1] === null) ) {
			gameData.progress[levelId+1] = {
				time: timeFail
			};
		}

		storage.save( gameData );

		return res.send( { result: 'success' } );
	}

	module.exports = ReactorRescue;

})();