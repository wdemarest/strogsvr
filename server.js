var express = require('express');
var http = require('http');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var serveStatic = require('serve-static');
var mkdirp = require('mkdirp');
var url = require('url');
var fs = require('fs');
var session = require('express-session');
var FileStore = require('session-file-store')(session);
var paypal = require('paypal-rest-sdk');

var app = express();

var config = JSON.parse( fs.readFileSync("config.json",'utf8') || "" );

if( !config.paymentMode ) {
	console.log("Error: config variable 'paymentMode' missing or empty.");
	return;
}

if( !config[config.paymentMode] ) {
	console.log("Error: config lacks an entry named '"+paymentMode+"'.");
	return;
}
config.paypal = config[config.paymentMode];
config.paypal.port = config.paypal.port || "";
paypal.configure(config.paypal);

if( !fs.existsSync('./sessions') ) {
	console.log("Creating /sessions directory.");
	mkdirp('./sessions', function(err) {
		if( err ) console.log(err);
	});
}

if( !fs.existsSync('./payments') ) {
	console.log("Creating /payments directory.");
	mkdirp('./payments', function(err) {
		if( err ) console.log(err);
	});
}

if( !fs.existsSync('./pack') ) {
	console.log("Creating /pack directory.");
	mkdirp('./pack', function(err) {
		if( err ) console.log(err);
	});
}

if( !fs.existsSync(config.credentialsFile) ) {
	console.log("Creating", config.credentialsFile);
	console.log("Filling with user 'admin'");
	fs.writeFileSync(config.credentialsFile,JSON.stringify({
		"admin": "" // the username 'admin' always is tested against 'config.adminPassword'
	},null,4));
}

if( !fs.existsSync(config.userDataFile) ) {
	console.log("Creating", config.userDataFile);
	console.log("Adding user data for 'admin'");
	fs.writeFileSync(config.userDataFile,JSON.stringify({
		"admin": {
			userName: "admin",
			userEmail: "",
			paid: 1,
			isAdmin: 1,
			isDemo: 0,
			isUnlocked: 1,
			maySolve: 1,
			progress: []
		}
	},null,4));
}


// See https://developer.paypal.com
// See samples here: https://github.com/paypal/PayPal-node-SDK/tree/master/samples
//paypal.configure( fs.readFileSync('paypal_credentials.json', 'utf8') );

function escapeHtml(text) {
	var map = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;'
	};

	return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

var payment = {};
payment.create = function(req,res) {
	var port = config.portExternal;
	var myUrl = req.protocol + '://' + req.hostname  + ( port == 80 || port == 443 ? '' : ':'+port );
	//console.log("I think I am at "+myUrl)
	
	var payment = {
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
		"description": "Purchase Candy Hop"
		}]
	};
	
	paypal.payment.create(payment, function (error, payment) {
		if (error) {
			console.log(error);
			res.send("payment_create error"+JSON.stringify(error,null,4));
		} else {
			if(payment.payer.payment_method === 'paypal') {
				req.session.paymentId = payment.id;
				var redirectUrl;
				for(var i=0; i < payment.links.length; i++) {
					var link = payment.links[i];
					if (link.method === 'REDIRECT') {
						redirectUrl = link.href;
					}
				}
				res.redirect(redirectUrl);
			}
		}
	});
}

payment.execute = function(req,res) {
	var userName = req.session.userName;
	var paymentId = req.session.paymentId;
	var payerId = req.param('PayerID');

	var details = { "payer_id": payerId };
	paypal.payment.execute(paymentId, details, function (error, payment) {
		//console.log(payment);
		if (error) {
			console.log("User "+userName+" failed to pay");
			console.log(error);
			res.redirect('/buy.html?pay=failure '+error.message);
		} else {
			console.log("User "+userName+" paid");
			var paymentFile = 'payments/'+(config.paypal.live?'':'TEST_')+userName+'_'+(new Date()).toISOString().substring(0,19).replace(/[:.]/g,'-')+'.json';
			console.log("Saving to "+paymentFile);
			fs.writeFileSync(paymentFile, JSON.stringify(payment,null,4));
			var userData = userDataRead(userName);
			userDataWrite(userName,function(userData) {
				userData.paid = 1;
				req.session.paid = userData.paid;
			});
			res.redirect('/buy.html?pay=success')
		}
	});
}

payment.cancel = function(req,res) {
	res.redirect("/welcome.html");
}

payment.useCode = function(req,res) {
	var userName = req.session.userName;
	var password = req.body.password;
	//console.log(req.body);

	var errorMessage = 
		!userName ? "No user is logged in." :
		password != config.purchaseCode ? "Invalid purchase code." :
		null;

	if( errorMessage ) {
		console.log(errorMessage);
		res.redirect('/buy.html?pay='+errorMessage)
		return;
	}

	console.log("User "+userName+" used a purchase code");
	var paymentFile = 'payments/'+(config.paypal.live?'':'PCODE_')+userName+'_'+(new Date()).toISOString().substring(0,19).replace(/[:.]/g,'-')+'.json';
	console.log("Saving to "+paymentFile);
	fs.writeFileSync(paymentFile, JSON.stringify({userName:userName, date:(new Date()).toISOString()},null,4));
	var userData = userDataRead(userName);
	userDataWrite(userName,function(userData) {
		userData.paid = 1;
		req.session.paid = userData.paid;
	});
	res.redirect('/buy.html?pay=success')
}

var emailer = {};

emailer.send = function(to,subject,body,callback) {
	var email = require('mandrill-send')(config.mandrillApiKey);
	console.log("Emailing "+to+" "+subject);
	email({
			from: 'Candy Hop <'+config.contactEmail+'>',
			to: [ to, config.contactEmail ],
			subject: subject,
			text: body
		},
		function(err) {
			var result = {
				status: "success",
				when: (new Date()).toISOString()
			};
			if( err ) {
				var msg = (err.data ? (err.data.message || err.data) : err);
				result = {
					status: 'failure', error: JSON.stringify(msg)
				};
			}
			console.log(result);
			callback(result);
		}	
	);
};

emailer.submit = function(req, res) {
	emailer.send(
		[ config.contactEmail ],
		req.body.subject,
		"From: "+req.body.name+"\nEmail: "+req.body.email+"\n"+req.body.message,
		function(result) {
			res.send( JSON.stringify(response) );
		}
	);
};

function userDataRead(userName) {
	var userData = JSON.parse( fs.readFileSync(config.userDataFile,'utf8') || "{}" );
	if( userName === true ) {
		return userData;
	}
	return userData[userName];
}

function userDataWrite(userName,fn) {
	var userData = JSON.parse( fs.readFileSync(config.userDataFile,'utf8') || "{}" );
	userData[userName] = userData[userName] || { userName: '', userEmail: '', paid: 0, progress: [] };
	fn(userData[userName]);
	fs.writeFileSync(config.userDataFile,JSON.stringify(userData,null,4));
}

var progress = {};

progress.get = function(req,res) {
	//console.log('progress.get');
	var userName = req.session.userName;
	//console.log(userName);
	var userData = userDataRead(userName);
	//console.log(userData);
	res.send( userData.progress || [] );
}

progress.post = function(req,res) {

	var userName = req.session.userName;
	var level = req.body.level;
	if( level === undefined || level === null ) {
		return res.send( { result: 'failure', message: 'no level specified', detail: req.body } );
	}
	var points = req.body.points || 0;
	var stars = req.body.stars || 0;
	var userData = userDataRead(userName);
	var progress = userData.progress[level] || {points: 0, stars: 0, tries: 0};

	userDataWrite(userName,function(userData) {
		userData.progress = userData.progress || [];
		// Save this level's best progress
		userData.progress[level] = {
			points: Math.max(progress.points || 0, points),
			stars: Math.max(progress.stars || 0, stars),
			tries: (progress.tries || 0) + 1
		};
		// Open up the next level for play
		if( stars > 0 && (userData.progress[level+1] === undefined || userData.progress[level+1] === null) ) {
			userData.progress[level+1] = {
				points: 0,
				stars: 0,
				tries: 0
			};
		}
	});
	return res.send( { result: 'success' } );
}

var levelPack = new (function() {

	function makePath(userName) {
		return "pack/"+userName+".json";
	}

	function read(userName) {
		if( !fs.existsSync(makePath(userName)) ) {
			return [];
		}

		return JSON.parse( fs.readFileSync(makePath(userName),'utf8') || "[]" );
	}

	function write(userName,pack) {
		fs.writeFileSync(makePath(userName),JSON.stringify(pack));
	}

	this.get = function(req,res) {
		var userName = req.session.userName;
		res.send( read(userName) );
	}
	
	this.post = function(req,res) {
		var userName = req.session.userName;
		var level = req.body.level;
		var layout = req.body.layout;
		
		if( !userName ) {
			return res.send( { result: 'failure', message: 'blank user name', detail: req.body } );
		}
		
		if( level === undefined || level === null ) {
			return res.send( { result: 'failure', message: 'no level specified', detail: req.body } );
		}

		if( !layout || !layout.name || !layout.map ) {
			return res.send( { result: 'failure', message: 'bad layout format', detail: req.body } );
		}
		
	
		var newLayout = {
			name: layout.name,
			author: layout.author || '',
			version: layout.version || 0,
			published: layout.published || 0,
			finished: layout.finished || 0,		// which version got finished?
			map: layout.map || []
		};

		var pack = read(userName);
		pack[level] = newLayout;
		write(userName,pack);
		return res.send( { result: 'success' } );
	}
	return this;
})();

var ops = {};
ops.get_stats = function(req,res) {
	function fix(s,len) { return (s+'                    ').substr(0,len); }
	var userData = userDataRead(true);
	var head = [fix('USERNAME',16)];
	var sum = [];
	var count = [];
	var s = '';
	for( var userName in userData ) {
		var line = [fix(userName,16)];
		var progress = userData[userName].progress;
		for( var i=0 ; i<progress.length ; ++i ) {
			var tries = progress[i] ? progress[i].tries || 0 : '';
			if( tries ) {
				count[i] = (count[i] || 0) + 1;
				sum[i] = (sum[i] || 0) + tries;
			}
			line.push(tries);
			head[i] = head[i] || i;
		}
		s += line.join('\t')+'\n';
	}
	var avg = [fix('AVG',16)];
	for( var a=0 ; a<sum.length ; ++a ) {
		var avgLong = (sum[a] || 0) / (count[a] || 0.0001);
		avg[a+1] = Math.round(avgLong*10)/10;
	}
	s += avg.join('\t')+'\n';
	s = '<pre>'+head.join('\t')+'\n'+s+'</pre>';
//	res.header("Content-Type", "text/plain");
	return res.end( s );
}

ops.get_emails = function(req,res) {
	var credentials = JSON.parse( fs.readFileSync(config.credentialsFile,'utf8') || "{}" );
	var s = '';
	for( var userName in credentials ) {
		var userData = userDataRead(userName);
		if( !userData.unsubscribed ) {
			s += userData.userEmail + ', '
		}
	}
	var s = '<pre>'+s+'</pre>';
	res.send( s );
}


ops.get_user = function(req,res) {
	var userName = req.params.u || req.params.userName || req.params.user || true;
	var userData = userDataRead(userName);
	delete userData.progress;
	var s = '<pre>'+JSON.stringify(userData,null,4)+'</pre>';
	res.send( s );
}

function loginActivate(req,res,userName) {
	var userData = userDataRead(userName);
	req.session.userEmail = userData.userEmail || '';
	req.session.userName = userData.userName || '';
	req.session.isAdmin = userData.isAdmin || 0;
	req.session.isDemo = userData.isDemo || 0;
	req.session.paid = userData.paid || userData.isAdmin || 0;
	req.session.isUnlocked = userData.isUnlocked || userData.isAdmin || 0;
	req.session.maySolve = userData.maySolve || userData.isAdmin|| 0;
}

var account = {};

account.login = function(req,res) {
	var userName = req.body.userName;
	var password = req.body.password;
	console.log("Login", userName);

	var credentials = JSON.parse( fs.readFileSync(config.credentialsFile,'utf8') || "{}" );
	if( credentials ) {
		credentials['admin'] = config.adminPassword;
	}
	//console.log(credentials);

	var response = { result: 'failure' };
	if( !credentials ) {
		response.message = 'Unable to load credentials.';
	} else
	if( !userName ) {
		response.message = 'No user name specified.';
	} else
	if( !credentials[userName] ) {
		response.message = 'Unknown user name.';
	} else
	if( credentials[userName] != password ) {
		response.message = 'Wrong password.';
	} else {
		response.result = 'success';
		response.message = 'Successful login.';
		loginActivate(req,res,userName);
	}

	console.log(response.message);
	res.send( JSON.stringify(response) );
}

account.signup = function(req,res) {
	var userName = req.body.userName;
	var userEmail = req.body.userEmail;
	var password = req.body.password;
	var confirmation = req.body.confirmation;

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

//	if( userName.match( /^[0-9a-zA-Z_]+$/ ) ) {
//		return res.send( { result: 'failure', message: 'User name must be a-z, A-Z, 0-9 and underscore.' } );
//	}

	var credentials = JSON.parse( fs.readFileSync(config.credentialsFile,'utf8') || "{}" );
	if( credentials[userName] ) {
		return res.send( { result: 'failure', message: 'Sorry that user name is already taken.' } );
	}

	credentials[userName] = password;
	fs.writeFileSync(config.credentialsFile,JSON.stringify(credentials,null,4));

	userDataWrite(userName,function(userData) {
		userData.userName = userName;
		userData.userEmail = userEmail;
	});
	emailer.send(
		userEmail,
		"Welcome to Candy Hop!",
		"Thanks for signing up for Candy Hop.\n"+
		"\n"+
		config.siteUrl+"\n"+
		"User Name: "+userName+"\n"+
		"Password:  "+password+"\n"+
		"\n"+
		"If you ever have any questions or issues with Candy Hop, please don't hesitate to email me at "+config.contactEmail+"\n"+
		"\n"+
		"Happy Hopping!\n",
		function(result) {
			userDataWrite(userName,function(userData) {
				userData.signupEmail = result;
			});
		}
	);
	
	loginActivate(req,res,userName);

	return res.send( { result: 'success', message: 'Sign up complete!' } );
}

account.logout = function(req,res) {
	console.log('logout');
	req.session.destroy();
	res.send( { result: 'success' } );
}

account.forgot = function(req,res) {
	console.log(req.body);
	var userName = req.body.userName;
	console.log( userName+' forgot pwd');
	var credentials = JSON.parse( fs.readFileSync(config.credentialsFile,'utf8') || "{}" );
	if( !credentials[userName] ) {
		return res.send( { result: 'failure', message: 'No such user.' } );
	}
	var userEmail = userDataRead(userName).userEmail;
	var password = credentials[userName];
	emailer.send(
		userEmail,
		"Candy Hop login info for "+userName,
		"As you requested, here is your Candy Hop login information.\n"+
		"\n"+
		"User Name: "+userName+"\n"+
		"Password:  "+password+"\n"+
		"\n"+
		"If you ever have any other questions or issues with Candy Hop, please don't hesitate to email me at "+config.contactEmail+"\n"+
		"\n"+
		"Happy Hopping!\n",
		function(result) {
			userDataWrite(userName,function(userData) {
				userData.reminderEmail = result;
			});
			res.send( result );
		}
	);
}

function serverStart() {
	config.port = config.port || 80;
	config.sitePath = config.sitePath || '.';
	var noAuthRequired = {
		'/signup': 1,
		'/login': 1,
		'/logout': 1,
		'/forgot': 1,
		'/welcome.html': 1,
		'/buy.html':1,
		'/payment_create':1,
		'/payment_execute':1,
		'/payment_cancel':1,
		'/payment_code':1
	};
	var adminOnly = {
		'/user': 1,
		'/emails': 1,
		'/stats': 1
	};
	console.log("\n\n"+(new Date()).toISOString()+" Serving "+config.sitePath+" on "+config.port);
	if( config.paypal.live ) {
		console.log( "ACCEPTING LIVE PAYMENTS");
		console.log(config.paypal);
	}

	app.use(session({
		store: new FileStore({ttl:60*60*24}),
		secret: 'sidehihcshhd',
		ttl: 60*60*24,
		resave: true,
		saveUninitialized: true
	}));

	app.use( function tellRequest( req, res, next ) {
		function startsWith(s,value) {
			return s.substr(0,value.length) == value;
		}
		if( !startsWith(req.url,'/image/') && !startsWith(req.url,'/sound/') ) {
			console.log(req.method, req.url);
		}
		next();
	});
	app.use( cookieParser() );
	app.use( bodyParser.json() );
	app.use( bodyParser.urlencoded({extended:false}) );
	app.locals.pretty = true;

	app.use( function ensureAuthenticated( req, res, next ) {
		var debug = false;
		if( debug ) console.log('ensureAuthenticated');
		var p = url.parse( req.url ).pathname;
		if( debug ) console.log('page is ['+p+']');
		if( noAuthRequired[p] ) {
			if( debug ) console.log(p,'always allowed');
			return next();
		}
		if( adminOnly[p] && !req.session.isAdmin ) {
			res.send( "Login as admin to access this page." );
			return next();
		}
		if( req.session.userName && req.session.paid ) {
			if( debug ) console.log(req.session.userName,'authorized and paid');
			return next();
		}
		if( !req.session.paid && req.session.userName ) {
			if( debug ) console.log('unpaid. '+req.session.paid+' redirecting.');
			return res.redirect('/buy.html');
		}
		if( debug ) console.log('unauthorized. redirecting.');
		res.redirect('/welcome.html');
	});

	app.use( function setupCookies( req, res, next ) {
		//console.log('setupLocals');
		res.cookie('userName', req.session ? req.session.userName : null);
		res.cookie('isAdmin', req.session ? req.session.isAdmin : null);
		res.cookie('isDemo', req.session ? req.session.isDemo : null);
		res.cookie('isUnlocked', req.session ? req.session.isUnlocked : null);
		res.cookie('maySolve', req.session ? req.session.maySolve : null);
		res.cookie('userEmail', req.session ? req.session.userEmail : null);
		return next();
	});

	app.post( "/email", emailer.submit );
	app.get( "/payment_create", payment.create );
	app.get( "/payment_execute", payment.execute );
	app.get( "/payment_cancel", payment.cancel );
	app.post( "/payment_code", payment.useCode );
	app.post( "/signup", account.signup );
	app.post( "/login", account.login );
	app.post( "/logout", account.logout );
	app.post( "/forgot", account.forgot );
	app.get( "/progress", progress.get );
	app.post( "/progress", progress.post );
	app.get( "/pack", levelPack.get );
	app.post( "/pack", levelPack.post );
	app.get( "/stats", ops.get_stats );
	app.post( "/emails", ops.get_emails );
	app.get( "/user", ops.get_user );

	app.get( "/after_payment", function(req,res,next) {
		res.send( "Payment Complete" );
	});

	var siteServer = serveStatic(config.sitePath, {'index': ['index.html']});

	app.get( "/welcome.html", function(req,res) {
		if( req.session ) {
			console.log('User '+req.session.userName+' logged out on welcome.');
			req.session.destroy();
		}
		return siteServer(req,res);
	});

	app.get( "/solver.js", function(req,res) {
		if( req.session && req.session.maySolve ) {
			return siteServer(req,res);
		}
		res.send('');
	});


	app.use( siteServer );

	app.theServer = http.createServer(app);
	app.theServer.listen(config.port);
}

var serverShutdown = function() {
	console.log("Server shutting down...");
	setTimeout(function() {
		console.error("Could not close connections in time, forcefully shutting down");
		process.exit(1)
	}, 3*1000);
	app.theServer.close(function() {
		console.log("Server stopped.");
		process.exit()
	});
}

process.on ('SIGTERM', serverShutdown);
process.on ('SIGINT', serverShutdown);

serverStart();
