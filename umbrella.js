(function() {

	let config;
	let storage;

	let UmbrellaReg = ['Umbrella',{
		save:    ['siteId','guestIndex'],
		make:    (data) => new Umbrella(data.siteId,Umbrella.initData),
		table:   'Umbrella',
		idField: 'siteId',
		version: 1
	}];


	class Umbrella {
		constructor(siteId,data) {
			this.siteId = siteId || Umbrella.mySiteId;
			this.guestIndex = data.guestIndex;
		}
	}

	Umbrella.mySiteId = "strog.com";
	Umbrella.initData = { 
		siteId: Umbrella.mySiteId,
		guestIndex: 1000
	};

	Umbrella.onInit = async function(_context) {
		config  = _context.config;
		storage = _context.storage;

		storage.serial.register( ...UmbrellaReg );

		let umbrella = await storage.load( 'Umbrella', Umbrella.mySiteId );
		if( !umbrella ) {
			umbrella = new Umbrella( Umbrella.mySiteId, Umbrella.initData );
			storage.save(umbrella);
		}
	}

	// WARNING: Somehow we need to make this atomic.
/*
That would be done with 
	let umbrella = db.collection.findAndModify(
		query:  {_id: doc_id},
		update: { $inc: { guestIndex :1 } },
		new: true,
	)
*/
	Umbrella.getAndIncGuestIndex = async function() {
		let umbrella = await storage.load( 'Umbrella', Umbrella.mySiteId );
		umbrella.guestIndex = (((umbrella.guestIndex+1)-999)%9000)+999;
		storage.save(umbrella);
		return umbrella.guestIndex;
	}

	module.exports = Umbrella;

})();
