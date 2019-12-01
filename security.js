(function() {

	const URL = require('url').URL;
	const path = require('path');

	const iplocation = require("iplocation").default;

	class Security {
		constructor(config) {
			// Sadly, socket.io gets seen as extension .io, so need to include it here.
			console.assert( config.security!==undefined );
			console.assert( config.security.extensions );
			console.assert( config.security.methods );
			console.assert( config.security.countryCodes );
			console.assert( config.security.unauthorized!==undefined );
			console.assert( config.security.quickRobotsResponse!==undefined );
			console.assert( config.security.quickAdsResponse!==undefined );
			this.validExtension      = config.security.extensions;
			this.validMethod         = config.security.methods;
			this.validCountryCode    = config.security.countryCodes;
			this.unauthorizedUrl     = config.security.unauthorized;
			this.quickRobotsResponse = config.security.quickRobotsResponse;
			this.quickAdsResponse    = config.security.quickAdsResponse;
			this.knownBadIp = {};
			this.knownGoodIp = {};
		}
		isReservedIp(ip) {
			if( ip == '::1' ) return true;
			let part = ip.split('.');
			return (part[0] == '192' && part[1] == '168') || (part[0] == '10');
		}
		fail(res,message) {
			console.log( '[SECURITY] '+message );
			return res.redirect(this.unauthorizedUrl);
		}
		filter( req, res, next ) {
			// https://www.nodebeginner.org/blog/post/nodejs-tutorial-whatwg-url-parser/
			let ip = String.remoteAddressToIp(req.connection.remoteAddress);
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

			if( this.quickRobotsResponse && url.pathname == '/robots.txt' ) {
				return res.send(this.quickRobotsResponse);
			}

			if( this.quickAdsResponse && url.pathname == '/ads.txt' ) {
				return res.send(this.quickAdsResponse);
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
				//console.log('visitor info',info);
				info.ip = ip;
				req.visitorInfo = info;
				this.knownGoodIp[ip] = 1;
				return next();
			});

		}
	};

	module.exports = Security;

})();
