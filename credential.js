(function() {

	let crypto = require('crypto');
	let storage = null;

	let CredentialReg = ['Credential',{
		save:    ['userName','password','salt','saltedPassword','accountId'],
		make:    (data) => new Credential(data.userName,data.salt,data.saltedPassword,data.accountId),
		table:   'Credential',
		idField: 'userName',
		version: 2,
		convert: (from,to,record) => { return Credential.convert(from,to,record); }
	}];

	class Credential {
		constructor( userName, salt, saltedPassword, accountId ) {
			console.assert(userName);
			console.assert(salt);
			console.assert(saltedPassword);
			console.assert(accountId);

			this.userName        = userName;
			this.salt            = salt;
			this.saltedPassword  = saltedPassword;
			this.accountId       = accountId;
			this.password        = null;
		}
	}

	Credential.admin = {
		accountId: 'admin',
		userName:  'admin'
	};

	Credential.onInit = async function(_context) {
		storage = _context.storage;
		storage.serial.register( ...CredentialReg );
		await storage.convert( CredentialReg[1].table );

		let adminPassword = _context.config.adminPassword;
		if( !adminPassword || (adminPassword in ['password','admin']) ) {
			throw "Illegal admin credentials. Please check config.*.secret.hjson";
		}

		let adminCredential = await storage.load( 'Credential', Credential.admin.userName );
		if( !adminCredential || !Credential.match(adminCredential,adminPassword) ) {
			console.log( "Admin credentials are new or have changed. Writing to db." );
			Credential.create(
				Credential.admin.userName,
				adminPassword,
				Credential.admin.accountId
			);
		}
	}

	Credential.convert = async function(from,to,raw) {
		if( from == 1 && to == 2 ) {
			Credential.overwrite( raw.userName, raw.password, raw.accountId );
			return true;	// so convert counting works right.
		}
	}

	function generateSaltedPassword(password, salt){
		console.assert( password );

		let hash = crypto.createHmac('sha512', salt); /** Hashing algorithm sha512 */
		hash.update(password);
		let saltedPassword = hash.digest('hex');
		return saltedPassword;
	}

	Credential.match = function(credential,password) {
		console.assert( credential.salt);
		console.assert( password );
		//console.log( 'match', credential );
		//console.log( password );
		//console.log( password );
		let saltedPassword = generateSaltedPassword( password, credential.salt );
		//console.log( saltedPassword );
		let isMatch = saltedPassword === credential.saltedPassword;
		//console.log(isMatch);
		return isMatch;
	}

	async function accountWrite(userName,password,accountId) {

		console.assert( userName );
		console.assert( password );
		console.assert( accountId );

		function generateSalt(length) {
			return crypto.randomBytes(Math.ceil(length/2))
				.toString('hex')	/** convert to hexadecimal format */
				.slice(0,length);	/** return required number of characters */
		}

		let salt           = generateSalt(16);
		let saltedPassword = generateSaltedPassword( password, salt );

		let credential = new Credential(userName,salt,saltedPassword,accountId);
		storage.save( credential );

		return credential;
	}

	Credential.create = async function(userName,password,accountId) {
		return await accountWrite( userName, password, accountId || Math.uid() );
	}

	Credential.overwrite = async function(userName,password,accountId) {
		return await accountWrite( userName, password, accountId );
	}

	module.exports = Credential;

})();
