
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
let Payment       = require('./payment.js');
let CandyHop      = require('./candyHop.js');
let ReactorRescue = require('./reactorRescue.js');
let Ops           = require('./ops.js');
let Site          = require('./site.js');

let Proxy         = require('http-proxy-middleware');

let plugins = [Account, Emailer, Payment, CandyHop, ReactorRescue, Ops, Site];

var Debug = new DebugProxy({
	comms: false,
	serial: false,
	storage: true,
});

let app = express();

function serverStart(port,sitePath,localUrl,session,storage) {
	port = port || 80;
	sitePath = sitePath || '.';
	app.accessNoAuthRequired = {};
	app.accessAdminOnly = {};

	console.log("\n\n"+(new Date()).toISOString()+" Serving "+sitePath+" on "+port);

	let wsProxy = Proxy({
		target: localUrl
	});

	app.use( '/shadowStone', wsProxy );

	app.use( session );

	app.use( function tellRequest( req, res, next ) {
		function startsWith(s,value) {
			return s.substr(0,value.length) == value;
		}
		if( !startsWith(req.url,'/image/') && !startsWith(req.url,'image/') && !startsWith(req.url,'/sound/') ) {
			console.log(req.method, req.url);
		}
		next();
	});
	app.use( cookieParser() );
	app.use( bodyParser.json() );
	app.use( bodyParser.urlencoded({extended:false}) );
	app.locals.pretty = true;

	app.use( Site.ensureAuthenticated );

	app.use( function( req, res, next ) {
		if( !req.cookies.accountId || req.cookies.accountId=='undefined' ) {
			let ip = req.connection.remoteAddress;
			console.log('New temp account requested for IP', ip);
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
	app.theServer.on('upgrade', wsProxy.upgrade)
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
