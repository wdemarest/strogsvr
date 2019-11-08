(function() {

	let Hjson = require('hjson');
	let Fs    = require('fs');

	// Set the environment variable to the name of the config file to use.
	// To do so, cd ~ ; touch .profile ; edit the .profile and set "export MY_ENV_VAR=yourName"
	class Config {
		constructor(envConfigId) {
			this._envConfigId = envConfigId;
			this._default = {};
		}
		setDefaults(def) {
			this._default = def || {};
		}
		async load(pattern) {
			return new Promise( (resolve,reject) => {
				console.assert(pattern);
				let configId = process.env[this._envConfigId] || 'dev';
				console.log('Environment variable '+this._envConfigId+' set to '+configId );
				let configFileName = pattern.replace( '$1', configId );
				console.log('Config loading',configFileName);
				Fs.readFile( configFileName, 'utf8', (err, contents) => {
					if( err ) {
						return reject(err);
					}
					delete contents._default;
					delete contents._envConfigId;
					Object.assign( this, this._default, Hjson.parse(contents) );
					return resolve( this );
				});
			});
		}
	}

	module.exports = Config;

})();