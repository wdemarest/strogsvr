(function() {

	let config  = null;
	let storage = null;

	let GlyphReg = ['Glyph',{
		save:    ['uid','action','expires','result'],
		_created: true,
		make:    (data) => new Glyph(),
		table:   'Glyph',
		idField: 'uid',
		version: 1,
		convert: null
	}];

	class Glyph {
		constructor() {
			Object.assign(this,{uid:null,action:null,expires:null,result:null});
		}
		set( uid, action, expires ) {
			console.assert(uid);
			console.assert(action);
			console.assert(expires);

			this.uid     = uid;
			this.action  = action;
			this.expires = expires;
			this.result  = null;
			return this;
		}

		isExpired() {
			console.assert(this.expires);
			return this.expires < new Date().toISOString();
		}

		url() {
			return config.siteUrl+'/g/'+this.uid;
		}

//we have to make it that glyph actions that complete are just kept around and don't expire.
//also, there should be friendly messages shown on the web pages when the first few tests in act() are met

//Also, make sure we have machine IDs for every visitor! so we know how many uniques, and can count visits.


		async act() {
			if( this.result ) {
				return { result: 'failure', hasFired: 1, message: 'action '+this.uid+' already taken.', details:this.result };
			}
			if( this.isExpired() ) {
				await Glyph.remove(this);
				return { result: 'failure', message: 'action '+this.uid+' expired.' };
			}
			if( !Glyph.actionList[this.action.command] ) {
				await Glyph.remove(this);
				return { result: 'failure', message: 'unknown action '+this.uid+'.' };
			}

			// Technically, to be completely safe, we should remove the glyph first AND make sure we
			// were the process to actually remove it. If we were, then it can act as a lock stating
			// that we are the authorized process that can act on the glyph.			
			let result = await Glyph.actionList[this.action.command](this);
			this.result = result;
			if( result.result ) {
				// We don't save it if all that is returned is a redirect URL, because that means the
				// glyph isn't actually resolved yet. The web page at the URL will do it.
				await storage.save(this);
			}
			return result;
		}
	}

	Glyph.id = 'Glyph';
	Glyph.actionList = {};
	Glyph.register = function(command,actionFn) {
		console.assert(command);
		console.assert(actionFn);
		console.assert( !Glyph.actionList[command] );
		Glyph.actionList[command] = actionFn;
	}


	Glyph.onInit = async function(_context) {
		config  = _context.config;
		storage = _context.storage;
		storage.serial.register( ...GlyphReg );


		// Every x minutes delete all appropriate expired glyphs. Note that glyph
		// expiration values more granular than this can not be respected.
		Glyph.expiryProcess = setInterval( Glyph.removeExpired, 10*60*1000 );
		setTimeout( Glyph.removeExpired, 10*1000 );	// let everything start up, and then expire any glyphs.

		// For testing glyph expiration:
		//setTimeout( ()=>Glyph.create(0,{command:'verifyEmail'}), 1 );

	}

	Glyph.onInstallRoutes = function(app) {
		Object.assign( app.accessNoAuthRequired, {
			'/g': 1,
			'/glyph': 1,
		});

		app.get('/g/:id',Glyph.onUserVisit);
		app.get('/glyph/:id',Glyph.get);
	}

	Glyph.removeExpired = async function() {
		let now = new Date().toISOString();
		let result = await storage.removeWhere( 'Glyph', { expires: { '$lt': now }, result: null } );
		if( result.deletedCount > 0 ) {
			console.logGlyph('Glyph expired',result.deletedCount);
		}
	}

	Glyph.onUserVisit = async function(req,res) {
		let uid = req.params.id;
		let actOnGlyph = async () => {
			if( !uid ) {
				return { result: 'failure', message: 'Missing glyph uid.' };
			}
			let glyph = await storage.load('Glyph',uid);
			if( !glyph ) {
				return { result: 'failure', message: 'No such glyph.' };
			}
			return await glyph.act();
		};
		let result = await actOnGlyph();
		if( result.url ) {
			return res.redirect( result.url );
		}
		return res.send( result );
	}

	Glyph.get = async function(req,res) {
		let uid = req.params.id;
		if( !uid ) {
			return res.send({ result: 'failure', message: 'Missing glyph uid.' });
		}
		let glyph = await storage.load('Glyph',uid);
		if( !glyph ) {
			return res.send({ result: 'failure', message: 'No such glyph.' });
		}
		return res.send(glyph);
	}

	Glyph.create = async function(expiresHours,action) {
		console.assert(action);
		console.assert(action.command);
		console.assert(Glyph.actionList[action.command]);

		let expires = (new Date()).addHours( expiresHours ).toISOString();
		let glyph = new Glyph().set( Math.uid(), action, expires );
		console.logGlyph('Created', glyph,'expires in',expiresHours );
		await storage.save( glyph );
		return glyph;

	}

	Glyph.remove = async function(glyph) {
		console.logGlyph('Removing ', glyph );
		return await storage.remove(glyph);
	}

	module.exports = Glyph;

})();
