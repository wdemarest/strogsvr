
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
let storage = new StorageMongo(new Serial);
let config;


function serverStart(port,sitePath,session) {
	port = port || 80;
	sitePath = sitePath || '.';
	app.accessNoAuthRequired = {};
	app.accessAdminOnly = {};

	console.log("\n\n"+(new Date()).toISOString()+" Serving "+sitePath+" on "+port);

	let wsProxy = Proxy({
		target: config.shadowStoneLocalUrl
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
			let accountId = 'temp-'+Math.uid();
			let account = new Account( accountId, {
				userName: 'guest'+Math.unsafeRandInt(1000),
				userEmail: '',
				isAdmin: false,
				isTemp: true
			});
			console.log( 'Created temp account',account );
			Account.loginActivate(req,res,account);
			storage.save( account );
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
	config = JSON.parse( fs.readFileSync("config.json",'utf8') || "" );

	await storage.open(config.mongoUrl,config.mongoUser,config.mongoPwd,config.dbName);

	let redisSessionMaker = new RedisSession({
		secret: config.redisSecret,
		name: config.redisName,
		port: config.redisPort,
		domain: config.redisDomain
	});
	await redisSessionMaker.open();

	let appContext = {
		config:  config,
		storage: storage
	};
	plugins.forEach( plugin => plugin.onInit ? plugin.onInit(appContext) : 0 );

	serverStart( config.port, config.sitePath, redisSessionMaker.makeSession() );
}


process.on ('SIGTERM', serverShutdown);
process.on ('SIGINT', serverShutdown);

main();
