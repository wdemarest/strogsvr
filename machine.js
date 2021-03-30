(function() {

	const url = require('url');

	let config  = null;
	let storage = null;

	let MachineReg = ['Machine',{
		save:    ['muid','ip','visits','guestAccountId','fuid','isPerson','referrer','fbid','info'],
		_created: true,
		make:    (data) => new Machine(),
		table:   'Machine',
		idField: 'muid',
		version: 1,
		convert: null
	}];
	// muid   - the machine unique id, stored as a cookie.
	//    It is used to track each machine that visits, and when detected the 'visits' is incremented.
	// ip     - the ip address this machine had when we first created its muid
	// visits - how many times this machine has visited
	// guestAccountId - used by other systems to give this machine a guest account. If multiple users use it, so be it
	// fuid - the fingerprint of this machine. Stored for speculative reasons.
	// isPerson - this is a real human being, as detected via mouse usage
	// referred - the standard website referrer
	// info - detailed info on the browser etc.

	class Machine {
		constructor() {
			Object.assign(this,{muid:null,ip:'',visits:0,guestAccountId:null,fuid:null,isPerson:null,referrer:null,fbid:null,info:null});
		}
	}

	Machine.muidSeen = {};

	Machine.onInit = async function(_context) {
		config     = _context.config;
		storage    = _context.storage;
		storage.serial.register( ...MachineReg );
		console.assert(config.siteUrl);
		Machine.siteDomain = url.parse(config.siteUrl).hostname;
	}

	Machine.onInstallRoutes = function(app) {
		Object.assign( app.accessNoAuthRequired, {
			'/fuid': 1,
			'/person': 1
		});
		app.post( "/fuid", Machine.fuid );
		app.post( "/person", Machine.person );
	}

	let referrerIsSelf = function(referrer) {
		return url.parse(referrer).hostname == Machine.siteDomain;
	}

	Machine.fuid = async function(req,res) {
		// The client tries to make sure this only gets calls when the fuid cookie is different from
		// the actual (possibly hanging) fuid value. But double-check that here, and make this the authority

		let muid = req.body.muid;
		let fuid = req.body.fuid;
		if( !muid || !fuid ) {
			return res.send({result:'failure',message:'empty muid or fuid'});
		}
		if( muid !== req.session.muid ) {
			return res.send({result:'failure',message:'muid mismatch'});
		}
		if( req.cookies.fuid == fuid ) {
			return res.send({result:'success',message:'fuid already identical'});
		}

		let exp = new Date(Date.now() + 2*365*24*60*60*1000);
		console.log('Machine:',muid,'fuid=',fuid);
		res.cookie( 'fuid', fuid, { expires: exp } );
		req.session.fuid = fuid;
		storage.update('Machine',muid,'fuid',fuid);
		return res.send({result:'success',message:'fuid set'});
	}

	Machine.person = async function(req,res) {
		// The client tries to make sure this only gets calls when the fuid cookie is different from
		// the actual (possibly hanging) fuid value. But double-check that here, and make this the authority

		let muid = req.body.muid;
		if( !muid ) {
			return res.send({result:'failure',message:'empty muid'});
		}
		if( muid !== req.session.muid ) {
			return res.send({result:'failure',message:'muid mismatch'});
		}
		let exp = new Date(Date.now() + 2*365*24*60*60*1000);
		console.log('Machine is person:',muid);
		let isPerson = 1;
		res.cookie( 'isPerson', isPerson, { expires: exp } );
		req.session.isPerson = isPerson;
		storage.update('Machine',muid,'isPerson',isPerson);
		return res.send({result:'success',message:'isPerson set'});
	}


	Machine.incVisits = async function(muid) {
		return await storage.inc('Machine',muid,'visits',1);
	}

	Machine.machineCreate = async function(muid,ip) {
		let machine = new Machine();
		machine.muid = muid;
		machine.ip   = ip;
		await storage.save(machine);
		return machine;
	}

	Machine.muidKeep = function(req,res,value) {
		let exp = new Date(Date.now() + 2*365*24*60*60*1000);
		res.cookie( 'muid', value, { expires: exp } );
		return value;
	}

	Machine.muid = async function(req,res) {
		let muid = req.cookies.muid;

		//
		// IMPORTANT: All this only happens the very first time we ever see this muid, OR
		// when there is no muid connected with this machine.
		//
		if( !muid || !Machine.muidSeen[muid] ) {
			// CRITTICAL to set that we've seen it here, because all the work below could take
			// a long time and we don't want to do it twice.
			if( muid ) {
				Machine.muidSeen[muid] = true;
			}
			if( !muid ) {
				console.log('Machine: new',muid);
				let machine = await Machine.machineCreate( Math.uid(), req.ipSimple );
				console.log(machine);
				muid = Machine.muidKeep( req, res, machine.muid );
			}

			// OK, now we need to make sure a machine entry really exists for this muid, because a coder
			// debugging might have deleted it. This is why we remember which muids we've seen.
			console.log('Machine: first sighting',muid);
			let machine = await storage.load( 'Machine', muid );
			if( !machine ) {
				// If a programmer deleted this machine, regenerate it. This is the only
				// way that this code gets visited. In production, if this happens, then
				// somebody hacked their own muid cookie identity client-side.
				machine = await Machine.machineCreate( muid, req.ipSimple )
			}

			let referrer = req.headers.referrer || req.headers.referer;
			if( referrer && !referrerIsSelf(referrer) && !machine.referrer ) {
				console.log('Machine: referrer=',referrer);
				storage.update('Machine',muid,'referrer',referrer);
			}

			let fbid = req.query.fbid || req.query._fbid;
			if( fbid && !machine.fbid ) {
				console.log('Machine: fbid=',fbid);
				storage.update('Machine',muid,'fbid',fbid);
			}
		}

		// WARNING! Is this legit code? Maybe the session muid should have been set
		// somewhere up above...
		if( !req.session.muid || req.session.muid!=muid) {
			req.session.muid = muid;
			Machine.incVisits(muid);
			console.log('Machine: +1 visit by',muid);
		}

		if( req.visitorInfo ) {
			req.visitorInfo.userAgent = req.headers['user-agent'];
			console.log('Machine:',muid,'info=',req.visitorInfo);
			storage.update('Machine',muid,'info',req.visitorInfo);
		}
	}

	module.exports = Machine;

})();
