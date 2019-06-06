(function() {

	let config;

	class Site {
	};

	Site.onConfig = function(_context) {
		config = _context.config;
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
			'/index.html': 1,
			'/welcome.html': 1,
			'/unathorized.html': 1,
			'/buy.html':1,
		});

		let express = require('express');
		app.use(  "/image", express.static(Path.join(__dirname, './image')));

		app.get( "/logout.html", function(req,res) {
			console.log('User '+req.session.userName+' logged out.');
			req.session.destroy();
			res.redirect('/index.html');
		});

		app.get( "/buy.html", function(req,res) {
			const src = Fs.createReadStream('./site/buy.html');
			src.pipe(res);
		});

		app.get( '/', function(req,res,next) {
			res.redirect('/index.html');
		});

		app.get( '/index.html', function(req,res,next) {
			const src = Fs.createReadStream('./site/index.html');
			src.pipe(res);
		});

		app.get( '/unauthorized.html', function(req,res,next) {
			const src = Fs.createReadStream('./site/unauthorized.html');
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