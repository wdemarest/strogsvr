
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

let plugins = [Account, Emailer, Tickle, Payment, CandyHop, ReactorRescue, Turmoil, Ops, Site];

var Debug = new DebugProxy({
	comms: false,
	serial: false,
	storage: true,
	traffic: true
});

let app = express();

function serverStart(port,sitePath,localShadowStoneUrl,session,storage) {
	port = port || 80;
	sitePath = sitePath || '.';
	app.accessNoAuthRequired = {};
	app.accessAdminOnly = {};
	/// app.tempAccountList = {};

	console.log("\n\n"+(new Date()).toISOString()+" Serving "+sitePath+" on "+port);

	let wsProxyShadowStone = Proxy({
		target: localShadowStoneUrl
	});

	let security = new Security();

	app.use( security.filter.bind(security) );

	app.use( '/shadowStone', wsProxyShadowStone );

	app.use( session );

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

	app.use( function( req, res, next ) {
		//if we see an accountId, we can't just take it for granted.
		//we have to be sure that it is logged in. For temp accounts, maybe we just
		//take the machine's word for it though...


		if( !req.cookies.accountId || req.cookies.accountId=='undefined' ) {
			let ip = req.connection.remoteAddress;
			let ua = req.headers['user-agent'];
			console.log('Temp Account:', ip, 'User-Agent',ua);
			let account = Account.createTemp();
			storage.save( account );
			Account.loginActivate(req,res,account);
		}
		return next();
	});

	app.use( function( req, res, next ) {
		//console.log('setupLocals');
		//console.log( req.session );
		res.cookie( 'accountId', req.session ? req.session.accountId : null);
		res.cookie( 'userName', req.session ? req.session.userName : null);
		res.cookie( 'userEmail', req.session ? req.session.userEmail : null);
		res.cookie( 'isAdmin', req.session ? req.session.isAdmin : null);
		res.cookie( 'isReal', req.session ? req.session.isReal : null);
		return next();
	});

	// PLUGIN ONINSTALLROUTES
	plugins.forEach( plugin => plugin.onInstallRoutes ? plugin.onInstallRoutes(app) : 0 );

	//app.theServer = http.createServer(app);
	app.theServer = app.listen(port);
	app.theServer.on('upgrade', wsProxyShadowStone.upgrade)
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
	let session = redisSessionMaker.create();

	let appContext = {
		config:  config,
		storage: storage
	};
	plugins.forEach( plugin => plugin.onInit ? plugin.onInit(appContext) : 0 );

	serverStart( config.port, config.sitePath, config.shadowStoneLocalUrl, session, storage );
}


process.on ('SIGTERM', serverShutdown);
process.on ('SIGINT', serverShutdown);

main();
