(function() {

	const URL = require('url').URL;
	const path = require('path');

	const iplocation = require("iplocation").default;

	class Security {
		constructor() {
			// Sadly, socket.io gets seen as extension .io, so need to include it here.
			this.validExtension = { '':1, ico:1, js:1, io:1, html:1, css:1, png:1, jpg:1, gif:1, mp3:1, wav:1, ogg:1 };
			this.validMethod = { GET:1, HEAD:1, POST:1, OPTIONS:1 };
			this.validCountryCode = { US:1 };
			this.knownBadIp = {};
			this.knownGoodIp = {};
		}
		isReservedIp(ip) {
			if( ip == '::1' ) return true;
			let part = ip.split('.');
			return part[0] == '192' && part[1] == '168';
		}
		fail(res,message) {
			console.log( '[SECURITY] '+message );
			res.redirect('/unauthorized.html');
		}
		filter( req, res, next ) {
			// https://www.nodebeginner.org/blog/post/nodejs-tutorial-whatwg-url-parser/
			let ip = Security.remoteAddressToIp(req.connection.remoteAddress);
			if( this.knownBadIp[ip] ) {
				return this.fail(res,'filter '+ip);
			}

			let method = req.method;
			if( !this.validMethod[method] ) {
				return this.fail(res,'invalid method ['+method+']');
			}

			let url    = new URL( req.url, 'http://strog.com' );
			if( url.password ) {
				return this.fail(res,'password found in URL ['+url.password+']');
			}
			if( url.username ) {
				return this.fail(res,'username found in URL ['+url.username+']');
			}

			let ext = path.extname(url.pathname).slice(1);
			if( !this.validExtension[ext] ) {
				return this.fail(res,'bad extension ['+ext+'] in '+req.url);
			}

			if( this.knownGoodIp[ip] || this.isReservedIp(ip) ) {
				return next();
			}

			iplocation( ip, [], (error, info) => {
				// Because multiple requests can start before we resolve the validity of their IP,
				// we want to check it AGAIN here. This becomes most noticeable when req.visitorInfo
				// cascades into four or more calls during a brand new visitor.
				if( this.knownGoodIp[ip] ) {
					return next();
				}
				if( error ) throw error;
				if( !this.validCountryCode[info.countryCode] ) {
					this.knownBadIp[ip] = 1;
					return this.fail( res, 'invalid country code ['+info.countryCode+'] for '+ip );
				}
				console.log('visitor info',info);
				info.ip = ip;
				req.visitorInfo = info;
				this.knownGoodIp[ip] = 1;
				return next();
			});

		}
	};

	Security.remoteAddressToIp = function(remoteAddress) {
		let ip = remoteAddress;
		if( ip.substr(0,7) == '::ffff:' ) {
			ip = ip.substr(7);
		}
		return ip;
	}

	module.exports = Security;

})();
