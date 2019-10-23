(function() {

	let Credential = require('./credential.js');
	let Emailer    = require('./emailer.js');

	let config;
	let storage;

	let TickleReg = ['Tickle',{
		save:    ['userEmail','note'],
		make:    (data) => new Tickle(data.userEmail),
		table:   'Tickle',
		idField: 'userEmail',
		version: 1
	}];

	class Tickle {
		constructor(userEmail,data) {
			this.userEmail = userEmail;
			Object.assign( this, Tickle.blank, data||{} );
		}
	}

	Tickle.blank = {
		userEmail: '',
		note: ''
	};

	Tickle.onInit = async function(_context) {
		config  = _context.config;
		storage = _context.storage;
		storage.serial.register( ...TickleReg );
	}

	Tickle.onInstallRoutes = function(app) {
		Object.assign( app.accessNoAuthRequired, {
			'/tickleAdd': 1,
		});

		app.post( "/tickleAdd",  Tickle.add );
	}

	function validateEmail(email) {
		var re = /\S+@\S+\.\S+/;
		return re.test(email);
	}


	Tickle.add = async function(req,res) {
		let userEmail    = req.body.userEmail;
		let note         = req.body.note;

		let response = { result: 'failure' };
		if( !validateEmail(userEmail) ) {
			console.log("Tickle got bad data ", userEmail, note);
			return res.send( { result: 'failure', message: 'Not a valid email address. Please try again.' } );
		}

		console.log("Tickle add ", userEmail, note);

		let tickle = new Tickle( userEmail, {
			userEmail: userEmail,
			note: note
		});
		storage.save( tickle );

		return res.send( { result: 'success', message: 'Email remembered!' } );
	}

	module.exports = Tickle;

})();
