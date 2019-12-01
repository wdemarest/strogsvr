(function() {

	let config;

	class Site {
	};

	Site.onConfig = function(_context) {
		config = _context.config;
		console.assert( config.siteUrl && config.siteUrl.substr(0,4) == 'http' );
	}

	Site.onInstallRoutes = function(app) {

		let Url  = require('url');
		let Fs   = require('fs');
		let Path = require('path');

		let pathOf = (url) => Url.parse( url ).pathname;
		Site.access = {
			noAuthRequired: (url) => true, //app.accessNoAuthRequired[pathOf(url)],
			adminOnly: (url) => app.accessAdminOnly[pathOf(url)]
		};

		Object.assign( app.accessNoAuthRequired, {
			'/nav.css': 1,
			'/index.html': 1,
			'/verified.html': 1,
			'/welcome.html': 1,
			'/unathorized.html': 1,
			'/buy.html':1,
		});

		let express = require('express');
		app.use(  "/image", express.static(Path.join(__dirname, './image')));

		app.get( '/', function(req,res,next) {
			res.redirect('/index.html');
		});

		app.get( "/*.(html|css|js)", function(req,res) {
			let fileName = req.params[0].replace(/\./g,'');
			let fileExt  = req.params[1].replace(/\./g,'');
			let path = './site/'+fileName+'.'+fileExt;
			const src = Fs.createReadStream(path);
			src.on('error', (err) => {
				console.log('Unable to stream',path,err.syscall,err.code,err.errno);
				res.status(404).send('Resource Not Found '+path);
			});
			src.pipe(res);
		});
	}


	Site.ensureAuthenticated = function( req, res, next ) {
		let debug = false;
		if( debug ) console.log('ensureAuthenticated');
		if( debug ) console.log('page is ['+req.url+']');
		if( Site.access.noAuthRequired(req.url) ) {
			if( debug ) console.log('always allowed');
			return next();
		}
		if( Site.access.adminOnly(req.url) && !req.session.isAdmin ) {
			res.send( "Login as admin to access this page." );
			return next();
		}
		if( req.session.accountId /*&& req.session.paid */ ) {
			if( debug ) console.log(req.session.userName,'authorized');
			return next();
		}
		if( debug ) console.log('unauthorized. redirecting.');
		res.redirect('/unauthorized.html');
	}

	module.exports = Site;
	
})();