(function() {

	const url = require('url');

	let config  = null;
	let storage = null;

	let MachineReg = ['Machine',{
		save:    ['muid','ip','visits','guestAccountId','fuid','referrer','fbid','info'],
		_created: true,
		make:    (data) => new Machine(),
		table:   'Machine',
		idField: 'muid',
		version: 1,
		convert: null
	}];

	class Machine {
		constructor() {
			Object.assign(this,{muid:null,ip:'',visits:0,guestAccountId:null,fuid:null,referrer:null,fbid:null,info:null});
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
		});
		app.post( "/fuid", Machine.fuid );
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
				// If this is a bot, we might end up making a ton of new muids, and thus a lot
				// of new temp accounts that will never be used again.
				// So, we try to find a machine with the same IP address, and we'll just steal that
				// muid. If we wrongly re-use a muid, we can live with that.
				let machine = await storage.loadWhere( 'Machine', { ip: req.ipSimple } );
				// Just get the first one returned. It doesn't really matter which.
				if( machine ) {
					if( Object.keys(machine).length > 1 ) {
						machine = machine[Object.keys(machine)[0]];
					}
					console.log('Machine: linked by ip to',machine);
					muid = Machine.muidKeep(req,res,machine.muid);
				}
				// We couldn't find it by ip, so create one. 
				if( !muid ) {
					console.log('Machine: new',muid);
					machine = await Machine.machineCreate( Math.uid(), req.ipSimple );
					console.log(machine);
					muid = Machine.muidKeep( req, res, machine.muid );
				}
			}

			// OK, now we need to make sure a machine entry really exists for this muid, because a coder
			// debugging might have deleted it. This is why we remember which muids we've seen.
			console.log('Machine: first sighting',muid);
			let machine = await storage.load( 'Machine', muid );
			if( !machine ) {
				// If a programmer deleted this machine, regenerate it
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
