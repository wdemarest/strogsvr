(function() {

	let paypal     = require('paypal-rest-sdk');
	let accessCode = require('./accessCode.js');

// See https://developer.paypal.com
// See samples here: https://github.com/paypal/PayPal-node-SDK/tree/master/samples
//paypal.configure( fs.readFileSync('paypal_credentials.json', 'utf8') );

	let PaymentReg = ['Payment',{
		save:    ['paymentId','accountId','userName','product','live','timestamp','accessCodeId'],
		make:    (data) => new Account( data.paymentId, data ),
		table:   'Payment',
		idField: 'paymentId',
		version: 1
	}];

	class Payment {
		constructor( paymentId, data ) {
			this.paymentId = paymentId;
			this.accountId = data.accountId;
			this.userName  = data.userName;
			this.product   = data.product;
			this.live      = data.live;
			this.timestamp = data.timestamp;
			this.accessCodeId = data.accessCodeId;
		}
	};

	let config;

	Payment.onInit = function(_context) {
		_context.storage.serial.register( ...PaymentReg );
		config = _context.config;

		if( config.paymentMode === 'disable' ) {
			config.paypal = null;
		}
		else {
			if( !config.paymentMode ) {
				console.log("Error: config variable 'paymentMode' missing or empty.");
				return;
			}

			if( !config[config.paymentMode] ) {
				console.log("Error: config lacks an entry named '"+config.paymentMode+"'.");
				return;
			}
			config.paypal = config[config.paymentMode];
			config.paypal.port = config.paypal.port || "";
			paypal.configure(config.paypal);
		}
	}

	Payment.onInstallRoutes = function(app) {
		if( !config.paypal ) {
			console.log( "NOT ACCEPTING PAYMENTS");
		}
		if( config.paypal && config.paypal.live ) {
			console.log( "ACCEPTING LIVE PAYMENTS");
			console.log(config.paypal);
		}

		Object.assign( app.accessNoAuthRequired, {
			'/payment_create':1,
			'/payment_execute':1,
			'/payment_cancel':1,
			'/payment_code':1,
			'/after_payment':1
		});

		app.get(  "/payment_create",  Payment.create );
		app.get(  "/payment_execute", Payment.execute );
		app.get(  "/payment_cancel",  Payment.cancel );
		app.post( "/payment_code",    Payment.useCode );
		app.get(  "/after_payment", function(req,res,next) {
			res.send( "Payment Complete" );
		});
	}

	Payment.create = function(req,res) {
		let port = config.portExternal || 80;
		let myUrl = req.protocol + '://' + req.hostname  + ( port == 80 || port == 443 ? '' : ':'+port );
		//console.log("I think I am at "+myUrl)
		
		let payment = {
			"intent": "sale",
			"payer": {
				"payment_method": "paypal"
			},
			"redirect_urls": {
				"return_url": myUrl+"/payment_execute",
				"cancel_url": myUrl+"/payment_cancel"
			},
			"transactions": [{
				"amount": {
					"total": "5.00",
					"currency": "USD"
				},
			"description": "Purchase Strog All Access Pass"
			}]
		};
		
		paypal.payment.create(payment, function (error, payment) {
			if (error) {
				console.log(error);
				res.send("payment_create error"+JSON.stringify(error,null,4));
			} else {
				if(payment.payer.payment_method === 'paypal') {
					req.session.paymentId = payment.id;
					let redirectUrl;
					for(let i=0; i < payment.links.length; i++) {
						let link = payment.links[i];
						if (link.method === 'REDIRECT') {
							redirectUrl = link.href;
						}
					}
					res.redirect(redirectUrl);
				}
			}
		});
	}

	Payment.execute = async function(req,res) {
		let accountId = req.session.accountId;
		let userName  = req.session.userName;
		let paymentId = req.session.paymentId;
		let payerId   = req.param('PayerID');

		let account    = await storage.load( 'Account', accountId );

		let errorMessage = 
			!accountId || !userName ? "No user is logged in." :
			!account ? "No such account." :
			!paymentId ? "No paymentId." :
			!payerId ? "No payerId." :
			null;

		if( errorMessage ) {
			console.log(errorMessage);
			res.redirect('/buy.html?pay='+errorMessage)
			return;
		}

		let details = { "payer_id": payerId };
		paypal.payment.execute(paymentId, details, function (error, payment) {
			//console.log(payment);
			if (error) {
				console.log("User "+userName+" failed to pay");
				console.log(error);
				res.redirect('/buy.html?pay=failure '+error.message);
			} else {
				console.log("User "+userName+" paid");
				console.log("Saving to "+paymentId);

				let payment = new Payment( paymentId, {
					accountId: accountId,
					userName: userName,
					product: 'allAccess',
					payerId: payerId,
					live: config.paypal ? config.paypal.live : false,
					timestamp: (new Date()).toISOString(),
					accessCodeId: null
				});
				res.redirect('/buy.html?pay=success')
			}
		});
	}

	Payment.cancel = function(req,res) {
		res.redirect("/index.html");
	}

	Payment.useCode = async function(req,res) {
		let accountId     = req.session.accountId;
		let userName      = req.session.userName;
		let accessCodeId  = (''+req.body.password).toUpperCase();
		//console.log(req.body);

		let accessCode = await storage.load( 'AccessCode', accessCodeId );
		let account    = await storage.load( 'Account', accountId );

		let errorMessage = 
			!accountId || !userName ? "No user is logged in." :
			!account ? "No such account." :
			!accessCodeId ? "No code was entered." :
			accessCode == null ? "Invalid purchase code." :
			!accessCode.available ? "Code already used." :
			null;

		if( errorMessage ) {
			console.log(errorMessage);
			res.redirect('/buy.html?pay='+errorMessage)
			return;
		}

		console.log("User "+userName+" used purchase code "+code);
		let paymentId = accountId+'-'+accessCodeId;	// arbitrary. Just needs to be unique.
		console.log("Saving to "+paymentId);

		let payment = new Payment( paymentId, {
			accountId: accountId,
			userName: userName,
			product: 'allAccess',
			payerId: null,
			live: config.paypal ? config.paypal.live : false,
			timestamp: (new Date()).toISOString(),
			accessCodeId: accessCodeId
		});
		accessCode.available = false;
		accessCode.accountId = accountId;

		storage.save( payment );
		storage.save( accessCode );

		res.redirect('/buy.html?pay=success')
	}

	module.exports = Payment;

})();