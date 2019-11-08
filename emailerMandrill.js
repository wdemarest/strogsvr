(function() {

	let config;

	class Emailer {
	}

	Emailer.onInit = function(_context) {
		config = _context.config;
		console.assert( config.contactEmail );
	}

	Emailer.onInstallRoutes = function(app) {
		app.post( "/email", Emailer.submit );
	}

	Emailer.send = function(to,subject,body,callback) {
		if( !config.mandrillApiKey ) {
			callback({ result: 'success', error: 'pretend email sent' });
			return;
		}
		let mandrillSend = require('mandrill-send')(config.mandrillApiKey);
		console.log("Emailing "+to+" "+subject);
		mandrillSend({
				from: 'Strog Games <'+config.contactEmail+'>',
				to: [ to, config.contactEmail ],
				subject: subject,
				text: body
			},
			function(err) {
				let result = {
					result: "success",
					when: (new Date()).toISOString()
				};
				if( err ) {
					let msg = (err.data ? (err.data.message || err.data) : err);
					result = {
						result: 'failure', error: JSON.stringify(msg)
					};
				}
				console.log(result);
				callback(result);
			}	
		);
	};

	Emailer.submit = function(req, res) {
		Emailer.send(
			[ config.contactEmail ],
			req.body.subject,
			"From: "+req.body.name+"\nEmail: "+req.body.email+"\n"+req.body.message,
			function(result) {
				res.send( JSON.stringify(response) );
			}
		);
	};

	module.exports = Emailer;

})();