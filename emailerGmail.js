(function() {

	const Gmail = require('gmail-send');

	let config;


	class EmailerGmail {
	}

	EmailerGmail.id = 'Emailer';

	EmailerGmail.onInit = function(_context) {
		config = _context.config;
		console.assert( config.contactEmail );
		console.assert( config.gmailSender );
		console.assert( config.gmailFrom );
		console.assert( config.gmailPassword );
	}

	EmailerGmail.onInstallRoutes = function(app) {
		//app.post( "/email", EmailerGmail.submit );
	}

	EmailerGmail.send = async function(to,subject,body) {
		console.log("Emailing "+to+" "+subject);
		const send = Gmail({
			user: config.gmailSender,
			pass: config.gmailPassword,
			from: config.gmailFrom || config.gmailSender,
			to:   [ to, config.contactEmail ],
			subject: subject,
		});

		let emailerResult = await send( { text: body } );
		return {
			result: parseInt(emailerResult.result) == 250 ? 'success' : 'failure',
			message: emailerResult.result,
			when: (new Date()).toISOString(),
			emailerResult: emailerResult
		};
	}

	module.exports = EmailerGmail;

})();