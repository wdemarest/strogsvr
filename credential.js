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
		password:  'password'
	};

	Credential.matchesAdmin = function(u,p) {
		return u==Credential.admin.userName && p==Credential.admin.password;
	}

	Credential.onInit = async function(_context) {
		let storage = _context.storage;
		storage.serial.register( ...CredentialReg );

		let admin = Credential.admin;
		admin.password = _context.config.adminPassword || admin.password;

		let credential = await storage.load( 'Credential', admin.userName );
		if( !credential ) {
			credential = new Credential( admin.userName, admin.password, admin.accountId );
			storage.save( credential );
		}
	}

	module.exports = Credential;

})();
