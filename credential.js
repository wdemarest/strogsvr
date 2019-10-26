(function() {

	let CredentialReg = ['Credential',{
		save:    ['userName','password','accountId'],
		make:    (data) => new Credential(data.userName,data.password,data.accountId),
		table:   'Credential',
		idField: 'userName',
		version: 1
	}];

	class Credential {
		constructor(userName,password,accountId) {
			console.assert(userName);
			console.assert(password);
			console.assert(accountId);

			this.userName  = userName;
			this.password  = password;
			this.accountId = accountId;
		}
	}

	Credential.admin = {
		accountId: 'admin',
		userName:  'admin',
		password:  null
	};

	Credential.onInit = async function(_context) {
		let storage = _context.storage;
		storage.serial.register( ...CredentialReg );

		Credential.admin.password = _context.config.adminPassword;
		if( !Credential.admin.password || (Credential.admin.password in ['password','admin']) ) {
			throw "Illegal admin credentials. Please check config.*.secret.hjson";
		}

		let adminCredential = await storage.load( 'Credential', Credential.admin.userName );
		if( !adminCredential || adminCredential.password != Credential.admin.password ) {
			console.log( "Admin credentials are new or have changed. Writing to db." );
			adminCredential = new Credential(
				Credential.admin.userName,
				Credential.admin.password,
				Credential.admin.accountId
			);
			storage.save( adminCredential );
		}
	}

	module.exports = Credential;

})();
