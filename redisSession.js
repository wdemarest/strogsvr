(function() {
	let Redis      = require('redis');
	let Session    = require('express-session');
	let RedisStore = require('connect-redis')(Session);

	class RedisSession {
		constructor(params) {
			this.client = null;
			Object.assign( this,params );
			console.assert( this.secret && this.name && this.port && this.domain );
		}

		async open() {
			return new Promise( (resolve,reject) => {
				let once = true;
				this.client = Redis.createClient(this.port,this.domain); // this creates a new client

				this.client.on('connect', function() {
					if( once ) {
						console.log('Redis client connected');
						once = false;
						resolve(this.client);
					}
				});

				this.client.on('error', (err) => {
					if( once ) {
						// Don't forget to start redis. See the readme.
						console.log('Redis failed to connect. Session cache disabled.');
						this.client = null;
						once = false;
						// We do this because, during testing, we can just ignore the session cache.
						resolve(this.client);
					}
				});
			});
		}

		create() {
			if( !this.client ) {
				return null;
			}
			return Session({
				secret: this.secret,
				name: this.name,
				resave: false,
				saveUninitialized: true,
				cookie: { secure: false }, // Note that the cookie-parser module is no longer needed
				store: new RedisStore({
					host: this.domain,
					port: this.port,
					client: this.client,
					ttl: 86400
				}),
			});
		}
	};

	module.exports = RedisSession;

})();