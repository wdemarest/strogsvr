(function() {

	let crypto = require('crypto');
	let storage = null;

	let CredentialReg = ['Credential',{
		save:    ['userEmail','userName','password','salt','saltedPassword','accountId'],
		make:    (data) => new Credential(),
		table:   'Credential',
		idField: 'userEmail',
		version: 3,
		convert: (record) => { return Credential.convert(record); }
	}];

	class Credential {
		constructor() {
			this.userEmail       = null;
			this.salt            = null;
			this.saltedPassword  = null;
			this.accountId       = null;
			this.password        = null;
		}
		set( userEmail, salt, saltedPassword, accountId ) {
			console.assert(userEmail, 'set userEmail');
			console.assert(salt, 'set salt');
			console.assert(saltedPassword, 'set saltedPassword');
			console.assert(accountId, 'set accountId');

			this.userEmail       = userEmail;
			this.salt            = salt;
			this.saltedPassword  = saltedPassword;
			this.accountId       = accountId;
			this.password        = null;
			return this;
		}
	}

	Credential.admin = {
		accountId: 'admin',
		userEmail: 'admin',
		userName:  'admin',
	};

	Credential.id = 'Credential';

	Credential.onInit = async function(_context) {
		storage = _context.storage;
		storage.serial.register( ...CredentialReg );

		let adminPassword = _context.config.adminPassword;
		if( !adminPassword || (adminPassword in ['password','admin']) ) {
			throw "Illegal admin credentials. Please check config.*.secret.hjson";
		}

		let adminCredential = await storage.load( 'Credential', Credential.admin.userEmail );
		if( !adminCredential || !Credential.match(adminCredential,adminPassword) ) {
			console.log( "Admin credentials are new or have changed. Writing to db." );
			Credential.create(
				Credential.admin.userEmail,
				adminPassword,
				Credential.admin.accountId
			);
		}
	}

	Credential.convert = async function(raw) {
		let credential = Object.assign( new Credential(), raw );
		let fromVersion = credential._version;

		if( credential._version == 1 ) {
			let s = saltGet( credential.password );
			console.assert( s.salt );
			console.assert( s.saltedPassword );
			credential.salt           = s.salt;
			credential.saltedPassword = s.saltedPassword;
			credential.password       = null;
			credential._version = 2;
		}
		if( credential._version == 2 ) {
			console.assert(credential.accountId);
			credential.userEmail = credential.accountId=='admin' ? 'admin' : await Credential.getEmailFromAccountId( credential.accountId );
			console.assert(credential.userEmail);
			delete credential.userName;
			credential._version = 3;
		}

		return fromVersion < credential._version ? credential : null;
	}

	function generateSaltedPassword(password, salt){
		console.assert( password, 'generateSaltedPassword - password' );

		let hash = crypto.createHmac('sha512', salt); /** Hashing algorithm sha512 */
		hash.update(password);
		let saltedPassword = hash.digest('hex');
		return saltedPassword;
	}

	Credential.match = function(credential,password) {
		if( !credential.salt ) return false;
		console.assert( password, 'Credential.match - password' );
		//console.log( 'match', credential );
		//console.log( password );
		//console.log( password );
		let saltedPassword = generateSaltedPassword( password, credential.salt );
		//console.log( saltedPassword );
		let isMatch = saltedPassword === credential.saltedPassword;
		//console.log(isMatch);
		return isMatch;
	}

	function saltGet(password) {

		function generateSalt(length) {
			return crypto.randomBytes(Math.ceil(length/2))
				.toString('hex')	/** convert to hexadecimal format */
				.slice(0,length);	/** return required number of characters */
		}

		console.assert( password, 'saltGet - password' );
		let salt           = generateSalt(16);
		let saltedPassword = generateSaltedPassword( password, salt );
		return { salt: salt, saltedPassword: saltedPassword };
	}

	Credential.create = async function(userEmail,password,accountId) {
		console.assert( userEmail, 'Credential.create - userEmail');
		console.assert( password, 'Credential.create - password' );
		console.assert( accountId, 'Credential.create - accountId' );

		let s = saltGet( password );
		let credential = new Credential().set(userEmail,s.salt,s.saltedPassword,accountId);
		await storage.save( credential );
		return credential;
	}

	Credential.reset = async function(credential,password) {
		console.assert( credential, 'Credential.reset - credential');
		console.assert( password, 'Credential.reset - password' );

		let s = saltGet( password );
		credential.salt = s.salt;
		credential.saltedPassword = s.saltedPassword;
		delete credential.password;
		await storage.save( credential );
		return credential;
	}

	module.exports = Credential;

})();
