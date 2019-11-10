(function() {

	const url = require('url');

	let config  = null;
	let storage = null;

	let MachineReg = ['Machine',{
		save:    ['muid','ip','visits','guestAccountId','fuid','referrer','info'],
		_created: true,
		make:    (data) => new Machine(),
		table:   'Machine',
		idField: 'muid',
		version: 1,
		convert: null
	}];

	class Machine {
		constructor() {
			Object.assign(this,{muid:null,ip:'',visits:0,guestAccountId:null,fuid:null,referrer:null,info:null});
		}
	}

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

	Machine.referrerIsSelf = function(referrer) {
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

	module.exports = Machine;

})();
