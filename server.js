
let express       = require('express');
let http          = require('http');
let bodyParser    = require('body-parser');
let cookieParser  = require('cookie-parser');
let serveStatic   = require('serve-static');
let fs            = require('fs');
let RedisSession  = require('./redisSession.js');
let Utils         = require('./utils');
let DebugProxy    = require('./debugProxy.js');

let StorageMongo  = require('./storageMongo.js');
let Serial        = require('./serial.js');
let Config        = require('./config.js');

// Plugins
let Umbrella      = require('./umbrella.js');
let Credential    = require('./credential.js');
let Account       = require('./account.js');
let Emailer       = require('./emailer.js');
let Tickle        = require('./tickle.js');
let Payment       = require('./payment.js');
let CandyHop      = require('./candyHop.js');
let ReactorRescue = require('./reactorRescue.js');
let Turmoil       = require('./turmoil.js');
let Ops           = require('./ops.js');
let Site          = require('./site.js');
let Security      = require('./security.js');

let Proxy         = require('http-proxy-middleware');

let plugins = [Umbrella, Credential, Account, Emailer, Tickle, Payment, CandyHop, ReactorRescue, Turmoil, Ops, Site];

var Debug = new DebugProxy({
	comms: false,
	serial: false,
	storage: true,
	traffic: true
});

let app = express();

function serverStart(port,sitePath,localShadowStoneUrl,sessionMaker,storage) {
	port = port || 80;
	sitePath = sitePath || '.';
	app.accessNoAuthRequired = {};
	app.accessAdminOnly = {};

	console.log((new Date()).toISOString()+" Serving "+sitePath+" on "+port);

	let wsProxyShadowStone = Proxy({
		target: localShadowStoneUrl
	});

	let security = new Security();

	app.use( security.filter.bind(security) );

	app.use( '/shadowStone', wsProxyShadowStone );

	app.use( sessionMaker );

	app.use( function tellRequest( req, res, next ) {
		let ignore = { image:1, images:1, sound:1, sounds:1 }
		let part   = req.url.split('/');
		let silent = ignore[part[0]] || (part.length>1 && ignore[part[1]]) || (part.length>2 && ignore[part[2]]) || (part.length>3 && ignore[part[3]])
		if( !silent ) {
			console.logTraffic(req.method, req.url);
		}
		next();
	});
	app.use( cookieParser() );
	app.use( bodyParser.json() );
	app.use( bodyParser.urlencoded({extended:false}) );
	app.locals.pretty = true;

	app.use( Site.ensureAuthenticated );

	app.use( async function( req, res, next ) {
		// IMPORTANT: The browser might not support cookies, or might have them turned off,
		// so we want to pull the session's accountId if there is no cookie.
		let accountId = req.cookies.accountId || req.session.accountId;
		let accountIdBlank = !accountId || accountId=='undefined' || accountId=='null' || accountId=='0';

		if( !accountIdBlank && (!req.session || !req.session.accountId) ) {
			// The user is making a claim as to his account, but we haven't
			// established a session yet for this user...
			console.log('New Connection: Account', accountId);
			let account = await storage.load( 'Account', accountId );
			if( account ) {
				Account.loginActivate(req,res,account);
			}
			if( !account ) {
				console.log('Account unknown. Setting blank.');
				accountId = null;
				accountIdBlank = true;	// So a temp username gets made.
			}
		}

		if( accountIdBlank ) {
			let ip = req.connection.remoteAddress;
			let ua = req.headers['user-agent'];
			console.log('Temp Account needed for:', ip, 'User-Agent',ua);
			let account = await Account.createTemp();
			storage.save( account );
			Account.loginActivate(req,res,account);
		}
		return next();
	});

	app.use( function( req, res, next ) {
		//console.log('setupLocals');
		//console.log( req.session );
		if( req.session && req.cookies.accountId !== req.session.accountId ) {
			let exp = new Date(Date.now() + 2*365*24*60*60*1000);
			res.cookie( 'accountId', req.session.accountId, { expires: exp } );
			res.cookie( 'userName', req.session.userName, { expires: exp } );
			res.cookie( 'userEmail', req.session.userEmail, { expires: exp } );
			res.cookie( 'isAdmin', req.session.isAdmin, { expires: exp } );
			res.cookie( 'isTemp', req.session.isTemp, { expires: exp } );
		}
		return next();
	});

	// PLUGIN ONINSTALLROUTES
	console.log('Installing plugin routes.');
	plugins.forEach( plugin => plugin.onInstallRoutes ? plugin.onInstallRoutes(app) : 0 );

	//app.theServer = http.createServer(app);
	app.theServer = app.listen(port);
	app.theServer.on('upgrade', wsProxyShadowStone.upgrade);
}

let serverShutdown = function() {
	console.log("Server shutting down...");
	setTimeout(function() {
		console.error("Could not close connections in time, forcefully shutting down");
		process.exit(1)
	}, 4*1000);
	app.theServer.close(function() {
		console.log("Server stopped clean.");
		process.exit(0)
	});
}

async function main() {
	console.log('StrogSvr at ',process.cwd());
	let config = new Config('STROG_CONFIG_ID');
	await config.load( 'config.$1.secret.hjson' );

	let storage = new StorageMongo(new Serial);
	await storage.open(config.mongoUrl,config.mongoUser,config.mongoPwd,config.dbName);

	let redisSessionMaker = new RedisSession({
		secret: config.redisSecret,
		name: config.redisName,
		port: config.redisPort,
		domain: config.redisDomain
	});
	await redisSessionMaker.open();
	let sessionMaker = redisSessionMaker.create();

	let appContext = {
		config:  config,
		storage: storage
	};
	console.log('Loading',plugins.length,'plugins.');
	for( plugin of plugins ) {
		if( plugin.onInit ) {
			await plugin.onInit(appContext);
		}
	};

	serverStart( config.port, config.sitePath, config.shadowStoneLocalUrl, sessionMaker, storage );
}


process.on ('SIGTERM', serverShutdown);
process.on ('SIGINT', serverShutdown);

main();
