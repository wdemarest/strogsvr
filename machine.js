(function() {

	let config  = null;
	let storage = null;

	let MachineReg = ['Machine',{
		save:    ['muid','ip','visits','guestAccountId'],
		make:    (data) => new Machine(),
		table:   'Machine',
		idField: 'muid',
		version: 1,
		convert: null
	}];

	class Machine {
		constructor() {
			Object.assign(this,{muid:null,ip:'',visits:0,guestAccountId:null});
		}
	}

	Machine.onInit = async function(_context) {
		config     = _context.config;
		storage    = _context.storage;
		storage.serial.register( ...MachineReg );
	}

	Machine.incVisits = async function(muid) {
		return await storage.inc('Machine',muid,'visits',1);
	}

	module.exports = Machine;

})();
