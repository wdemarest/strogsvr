(function() {

	let Credential = require('./credential.js');
	let Emailer    = require('./emailer.js');
	let Umbrella   = require('./umbrella.js');

	let config;
	let storage;

	let AccountReg = ['Account',{
		save:    ['accountId','userName','userEmail','isAdmin','isTemp'],
		make:    (data) => new Account(data.accountId),
		table:   'Account',
		idField: 'accountId',
		version: 1
	}];

	class Account {
		constructor(accountId,data) {
			this.accountId = accountId;
			Object.assign( this, Account.blank, data||{} );
		}
	}

	Account.blank = {
		userName: '',
		userEmail: '',
		isAdmin: false,
		isTemp: true,
	};

	Account.onInit = async function(_context) {
		config  = _context.config;
		storage = _context.storage;
		storage.serial.register( ...AccountReg );

		console.assert( config.siteUrl );
		console.assert( config.contactEmail );
		console.assert( Credential.admin.password );

		let adminAccount = await storage.load( 'Account', Credential.admin.accountId );
		if( !adminAccount ) {
			adminAccount = new Account( Credential.admin.accountId, {
				userName: Credential.admin.userName,
				userEmail: null,
				isAdmin: true,
				isTemp: false
			} );
			storage.save(adminAccount);
		}
	}

	Account.onInstallRoutes = function(app) {
		Object.assign( app.accessNoAuthRequired, {
			'/signup': 1,
			'/login':  1,
			'/logout': 1,
			'/forgot': 1
		});

		app.post( "/signup", Account.signup );
		app.post( "/login",  Account.login );
		app.post( "/logout", Account.logout );
		app.post( "/forgot", Account.forgot );
	}

	Account.loginActivate = function(req,res,account) {
		req.session.accountId = account.accountId;
		req.session.userEmail = account.userEmail || '';
		req.session.userName  = account.userName || '';
		req.session.isAdmin   = account.isAdmin || 0;
		req.session.isTemp    = account.isTemp || 0;
	}

	Account.createTemp = async function() {
		/// console.assert(uid);
		/// console.assert(userName);
		let guestIndex = await Umbrella.getAndIncGuestIndex();

		let accountId = 'T'+Math.uid();
		let userName  = 'guest'+guestIndex;

		let account = new Account( accountId, {
			userName: userName,
			userEmail: '',
			isAdmin: false,
			isTemp: true
		});
		console.log( 'Created temp account', account );
		return account;
	}

	Account.login = async function(req,res) {
		let debug = true;
		let userName = req.body.userName;
		let password = req.body.password;
		console.log("Login", userName);
		let credential = await storage.load( 'Credential', userName );

		let account    = credential ? await storage.load( 'Account', credential.accountId ) : null;

		if( debug ) {
			console.log( "userName entered: ", userName );
			console.log( "password entered: ", password );
			console.log( "credentials found: ", credential );
		}

		let response = { result: 'failure' };

		if( !credential ) {
			response.message = 'Unable to load credential.';
		} else
		if( !userName ) {
			response.message = 'No user name specified.';
		} else
		if( credential.password != password ) {
			response.message = 'Wrong password.';
		} else
		if( !credential.accountId ) {
			response.message = 'Credential lacks an accountId.';
		} else {
			response.result = 'success';
			response.message = 'Successful login.';
			Account.loginActivate(req,res,account);
		}

		console.log(response.message);
		res.send( JSON.stringify(response) );
	}

	Account.signup = async function(req,res) {
		let userName     = req.body.userName;
		let userEmail    = req.body.userEmail;
		let password     = req.body.password;
		let confirmation = req.body.confirmation;

		console.log("Signup", userEmail, userName);

		if( password != confirmation ) {
			return res.send( { result: 'failure', message: 'The password does not match the confirmation.' } );
		}

		if( password.length < 8 ) {
			return res.send( { result: 'failure', message: 'Password must be at least 8 characters.' } );
		}

		if( userName === '' ) {
			return res.send( { result: 'failure', message: 'Please enter a user name.' } );
		}

		if( userName.length > 16 ) {
			return res.send( { result: 'failure', message: 'That user name is too long. 16 characters or less please.' } );
		}

		if( password.length > 32 ) {
			return res.send( { result: 'failure', message: 'That password is too long. 32 characters or less please.' } );
		}

		let credential = await storage.load( 'Credential', userName );
		if( credential ) {
			return res.send( { result: 'failure', message: 'Sorry that user name is already taken.' } );
		}

		let accountId = Math.uid();
		credential = new Credential(userName,password,accountId);
		storage.save( credential );

		let account = new Account( accountId, {
			userName: userName,
			userEmail: userEmail,
			isAdmin: false,
			isTemp: false
		});
		storage.save( account );

		Emailer.send(
			userEmail,
			"Welcome to Strog Games!",
			"Thanks for signing up for Strog All Access.\n"+
			"\n"+
			config.siteUrl+"\n"+
			"User Name: "+userName+"\n"+
			"Password:  "+password+"\n"+
			"\n"+
			"If you ever have any questions or issues, please don't hesitate to email me at "+config.contactEmail+"\n"+
			"\n"+
			"Happy Gaming!\n",
			function(result) {
				account.signupEmail = result;
				storage.save( account );
			}
		);
		
		Account.loginActivate(req,res,account);

		return res.send( { result: 'success', message: 'Sign up complete!' } );
	}

	Account.logout = function(req,res) {
		console.log('logout');
		req.session.accountId = null;
		res.clearCookie('accountId');
		res.send( { result: 'success' } );
	}

	Account.forgot = async function(req,res) {
		console.log(req.body);
		let userName = req.body.userName;
		console.log( userName+' forgot pwd');
		let credential = await storage.load( 'Credential', userName );
		if( !credential ) {
			return res.send( { result: 'failure', message: 'No such credentials.' } );
		}
		let account   = await storage.load( 'Account', credential.accountId );
		if( !account ) {
			return res.send( { result: 'failure', message: 'No such account.' } );
		}
		let userEmail = account.userEmail;
		if( !userEmail ) {
			return res.send( { result: 'failure', message: 'No email for this account.' } );
		}
		let password  = credential.password;

		Emailer.send(
			userEmail,
			"Strog Games login info for "+userName,
			"As you requested, here is your Strog Games login information.\n"+
			"\n"+
			"User Name: "+userName+"\n"+
			"Password:  "+password+"\n"+
			"\n"+
			"If you ever have any other questions or issues, please don't hesitate to email me at "+config.contactEmail+"\n"+
			"\n"+
			"Happy Gaming!\n",
			function(result) {
				account.reminderEmail = result;
				storage.save( account );
				res.send( result );
			}
		);
	}

	module.exports = Account;

})();
