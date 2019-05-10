(function() {

	let config;
	let storage;

	class Ops {
	};

	Ops.onInit = function(_context) {
		config  = _context.config;
		storage = _context.storage;

		console.assert(config);
		console.assert(storage);
	}

	Ops.onInstallRoutes = function(app) {
		console.assert( typeof app.accessAdminOnly !== 'undefined' );
		Object.assign( app.accessAdminOnly, {
			'/emails': 1
		});

		app.post( "/emails", Ops.get_emails );
	}

	Ops.get_emails = async function(req,res) {
		let accountHash = await storage.loadAll( 'Account' );
		let s = '';
		for( let account of accountHash ) {
			s += account.userEmail + ', '
		}
		s = '<pre>'+s+'</pre>';
		res.send( s );
	}

	module.exports = Ops;

})();
