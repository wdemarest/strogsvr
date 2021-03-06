(function() {

	const EmailValidator = require("email-validator"); 
	const EmailDeepValidator = require('email-deep-validator');

	let Umbrella       = require('./umbrella.js');

	let config;
	let storage;
	let Credential;
	let Emailer;
	let Glyph;

	let AccountReg = ['Account',{
		save:    ['accountId','userEmail','userName','isAdmin','isTemp','isVerified'],
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
		userEmail: '',
		userName: '',
		isAdmin: false,
		isTemp: true,
		isVerified: false
	};

	Account.VERIFY_EMAIL   = 'verifyEmail';
	Account.RESET_PASSWORD = 'resetPassword';


	Account.onInit = async function(_context) {
		config     = _context.config;
		storage    = _context.storage;
		Glyph      = _context.Glyph;
		Emailer    = _context.Emailer;
		Credential = _context.Credential;

		Credential.getEmailFromAccountId = async function(accountId) {
			let account = await storage.load('Account',accountId);
			return account ? account.userEmail : null;
		}

		console.assert( config && storage && Glyph && Emailer && Credential );
		storage.serial.register( ...AccountReg );

		console.assert( config.siteUrl );
		console.assert( config.contactEmail );
		console.assert( config.emailVerifyHours );
		console.assert( config.passwordResetHours );

		Glyph.register( Account.VERIFY_EMAIL,   Account.verify );
		Glyph.register( Account.RESET_PASSWORD, Account.reset );

		let adminAccount = await storage.load( 'Account', Credential.admin.accountId );
		if( !adminAccount ) {
			adminAccount = new Account( Credential.admin.accountId, {
				userEmail: Credential.admin.userEmail,
				userName: Credential.admin.userName,
				isAdmin: true,
				isTemp: false,
				isVerified: true,
			} );
			storage.save(adminAccount);
		}
	}

	Account.onInstallRoutes = function(app) {
		Object.assign( app.accessNoAuthRequired, {
			'/signup': 1,
			'/login':  1,
			'/logout': 1,
			'/forgot': 1,
			'/reset':  1,
			'/verify':  1,
			'/emailTest': 1,
		});

		app.post( "/signup", Account.signup );
		app.post( "/login",  Account.login );
		app.get(  "/logout", Account.logout );
		app.post( "/forgot", Account.forgot );
		app.get(  "/reset/:id", Account.glyphRedirect);
		app.get(  "/verify/:id", Account.glyphRedirect);
		app.post( "/reset",  Glyph.onGlyph );
		app.post( "/verify", Glyph.onGlyph );
		app.get(  "/emailTest", Account.emailTest );
	}

	Account.glyphRedirect = function(req,res) {
		res.cookie( 'glyphId', req.params.id );
		return res.redirect("/index.html");
	}


	Account.loginActivate = function(req,res,account) {
		console.log( 'loginActivate',account);
		req.session.accountId  = account.accountId;
		req.session.userEmail  = account.userEmail || '';
		req.session.userName   = account.userName || '';
		req.session.isAdmin    = account.isAdmin || false;
		req.session.isTemp     = account.isTemp===false ? false : true;
		req.session.isVerified = account.isVerified===true ? true : false;
	}

	Account.createTemp = async function() {
		let guestIndex = await Umbrella.getAndIncGuestIndex();

		let accountId = 'T'+Math.uid();
		let userName  = 'guest'+guestIndex;

		let account = new Account( accountId, {
			userName: userName,
			userEmail: '',
			isAdmin: false,
			isTemp: true,
			isVerified: false
		});
		console.log( 'Created temp account', account );
		return account;
	}

	Account.login = async function(req,res) {
		let debug = false;
		let userEmail = req.body.userEmail;
		let password  = req.body.password;
		if( !userEmail || !password ) {
			return res.send( JSON.stringify({ result: 'failure', message: 'invalid user email or password' }) );
		}

		console.log("Login", userEmail);
		let credential = await storage.load( 'Credential', userEmail );

		if( debug ) {
			console.log( "userEmail entered: ", userEmail );
			console.log( "password entered: ", password );
			console.log( "credentials found: ", credential );
		}

		let response = { result: 'failure' };

		if( !credential ) {
			response.message = 'Credential not found.';
		} else
		if( !userEmail ) {
			response.message = 'No user email specified.';
		} else
		if( !Credential.match( credential, password ) ) {
			response.message = 'Wrong password.';
		} else
		if( !credential.accountId ) {
			response.message = 'Credential lacks an accountId.';
		} else {
			let account = await storage.load( 'Account', credential.accountId );
			if( !account ) {
				response.message = "Credential lacks matching account "+credential.accountId;
			}
			else {
				response.result = 'success';
				response.message = 'Successful login.';
				Account.loginActivate(req,res,account);
			}
		}

		console.log(response.message);
		return res.send( JSON.stringify(response) );
	}

	Account.generateAndSendEmailVerificationInvitation = async function(userEmail,accountId) {
		let glyph = await Glyph.create( config.emailVerifyHours, {
			command: Account.VERIFY_EMAIL,
			userEmail: userEmail,
			accountId: accountId
		});

		return await Emailer.send(
			userEmail,
			"Please verify your email.",
			"At Strog Games your security is important to us. Please take a moment to\n"+
			"click below to verify your email address.\n"+
			"\n"+
			config.siteUrl+'/verify/'+glyph.uid+"\n"+
			"\n"+
			"If you ever have any questions or issues, please don't hesitate to email us at "+config.contactEmail+"\n"+
			"\n"+
			"Happy Gaming!\n"
		);
	}

	Account.signup = async function(req,res) {
		let userEmail    = req.body.userEmail;
		let userName     = req.body.userName;
		let password     = req.body.password;
		let confirmation = req.body.confirmation;

		console.log("Signup", userEmail, userName);

		if( password != confirmation ) {
			return res.send( { result: 'failure', message: 'The password does not match the confirmation.' } );
		}

		if( password.length < 8 ) {
			return res.send( { result: 'failure', message: 'Password must be at least 8 characters.' } );
		}

		if( password.length > 32 ) {
			return res.send( { result: 'failure', message: 'That password is too long. 32 characters or less please.' } );
		}

		if( userName === '' ) {
			return res.send( { result: 'failure', message: 'Please enter a user name.' } );
		}

		if( !/^[a-zA-Z0-9.\-_$*!]{3,30}$/.test(userName) ) {
			return res.send( { result: 'failure', message: 'User names may only contain letters, numbers, and -_$*!.' } );
		}

		if( userName.length < 4 ) {
			return res.send( { result: 'failure', message: 'That user name is too short. At least 4 characters please.' } );
		}

		if( userName.length > 16 ) {
			return res.send( { result: 'failure', message: 'That user name is too long. 16 characters or less please.' } );
		}

		if( !EmailValidator.validate(userEmail) ) {
			return res.send( { result: 'failure', message: 'Please enter a valid email address.' } );
		}

		const deepValidator = new EmailDeepValidator();
		const { wellFormed, validDomain, validMailbox } = await deepValidator.verify(userEmail);
		if( !wellFormed ) {
			return res.send( { result: 'failure', message: 'Please enter a valid email address.' } );
		}
		if( !validDomain ) {
			return res.send( { result: 'failure', message: 'Sorry, we could not contact that domain.' } );
		}
		if( !validMailbox ) {
			return res.send( { result: 'failure', message: 'Sorry, that mailbox does not exist.' } );
		}

		let credential = await storage.load( 'Credential', userEmail );
		if( credential ) {
			return res.send( { result: 'failure', message: 'Sorry that user email is already taken.' } );
		}

		credential = await Credential.create(userEmail,password,Math.uid());

		let account = new Account( credential.accountId, {
			userEmail: userEmail,
			userName: userName,
			isAdmin: false,
			isTemp: false,
			isVerified: false
		});
		storage.save( account );

		Emailer.send(
			userEmail,
			"Welcome to Strog Games!",
			"Thanks for signing up for Strog All Access.\n"+
			"\n"+
			config.siteUrl+"\n"+
			"User Name: "+userName+"\n"+
			"User Email: "+userEmail+"\n"+
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
		
		let verifyResult = await Account.generateAndSendEmailVerificationInvitation(userEmail,credential.accountId);

		Account.loginActivate(req,res,account);

		return res.send( { result: 'success', message: 'Sign up complete!', verify: verifyResult } );
	}

	Account.logout = function(req,res) {
		console.log('User '+req.session.userName+' logged out.');
		let meta = storage.serial.getMeta('Account');
		console.log(req.cookies);
		for( let key in req.cookies ) {
			if( meta.save.includes(key) ) {
				console.log('clearing',key);
				res.clearCookie(key);
			}
		}
		req.session.regenerate(function(err) {
			res.redirect('/index.html');
		});
	}

	Account.reset = async function(glyph,result,req,res) {
		if( result ) {
			if( result.fired ) {
				result.message = "Your password was already reset.";
			}
			return result;
		}
		let password     = req.body.password;
		let confirmation = req.body.confirmation;

		if( !glyph.action.userEmail ) {
			return { result: 'failure', message: 'No userEmail in glyph.' };
		}

		if( password != confirmation ) {
			return { result: 'failure', doNotSave: true, message: 'The password does not match the confirmation.' };
		}

		if( password.length < 8 ) {
			return { result: 'failure', doNotSave: true, message: 'Password must be at least 8 characters.' };
		}

		if( password.length > 32 ) {
			return { result: 'failure', doNotSave: true, message: 'That password is too long. 32 characters or less please.' };
		}

		let credential = await storage.load( 'Credential', glyph.action.userEmail );
		if( !credential ) {
			return { result: 'failure', message: 'Email matches no credential.' };
		}

		await Credential.reset( credential, password );
		result = { result: 'success', message: 'Password changed successfully.' };

		await Emailer.send(
			credential.userEmail,
			"Your Strog Games password has changed",
			"Hello,\n"+
			"\n"+
			"Somebody, hopefully you, changed your password at strog.com.\n"+
			"\n"+
			"If it wasn't you, email us at "+config.contactEmail+"\n"+
			"\n"
		);

		return result;
	}


	Account.forgot = async function(req,res) {
		console.log(req.body);
		let userEmail = req.body.userEmail;

		if( !userEmail ) {
			return res.send( { result: 'failure', message: 'Blank email not allowed.' } );
		}
		if( userEmail == Credential.admin.userEmail ) {
			return res.send( { result: 'failure', message: 'Admin credentials may not be recovered.' } );
		}
		console.log( userEmail+' forgot pwd');

		let credential = await storage.load( 'Credential', userEmail );
		if( !credential ) {
			return res.send( { result: 'failure', message: 'No such credentials.' } );
		}
		let account = await storage.load( 'Account', credential.accountId );
		if( !account ) {
			return res.send( { result: 'failure', message: 'No such account.' } );
		}
		if( userEmail !== account.userEmail ) {
			return res.send( { result: 'failure', message: 'No such account.' } );
		}

		let glyph = await Glyph.create( config.passwordResetHours, {
			command: Account.RESET_PASSWORD,
			userEmail: credential.userEmail
		}); 

		let result = await Emailer.send(
			credential.userEmail,
			"Lost password for strog.com",
`
Hi ${account.userName},

Sorry to hear you forgot your password. You can reset your password by clicking the link below.

${config.siteUrl}/reset/${glyph.uid}

If you did not ask for your password to be reset, please email us ASAP at ${config.contactEmail}!

Thank you for being part of the Strog family!
`
		);

		return res.send( result );
	}

	Account.verify = async function(glyph,result,req,res) {
		if( result ) {
			if( result.fired && glyph.result.result=='success') {
				result.message = "Your email has already been verified.";
			}
			return result;
		}
		let accountId = glyph.action.accountId;
		let userEmail = glyph.action.userEmail;
		let account = await storage.load('Account',accountId);
		if( !account ) {
			return { result: 'failure', message: 'No such account' };
		}
		if( account.userEmail != userEmail ) {
			return { result: 'failure', message: 'Mismatched email' };
		}
		account.isVerified = true;
		await storage.save( account );
		return { result: 'success', message: 'Your email was successfully verified.' };
	}

	Account.emailTest = async function(req,res) {
		let glyph = await Glyph.create( config.emailVerifyHours, {
			command: Account.VERIFY_EMAIL,
			userEmail: 'ken.demarest@gmail.com',
			accountId: 'none'
		});
		let result = await Emailer.send(
			'ken.demarest@gmail.com',
			'some subject',
			'this is the body. to verify your email click '+glyph.url()
		);
		return res.send( result );
	}

	module.exports = Account;

})();
