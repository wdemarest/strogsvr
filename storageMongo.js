(function() {

	let DbMemory = require('./dbMemory.js');

	class StorageMongo {
		constructor(serial) {
			this.db = null;
			this.serial = serial;
		}
		filter(key,value) {
			let n = {};
			n[key] = value;
			return n;
		}
		get online() {
			return this.db !== null;
		}
		open(mongoUrl,mongoUser,mongoPwd,dbName) {
			console.assert(mongoUrl);
			console.assert(mongoUser);
			console.assert(mongoPwd);
			console.assert(dbName);
			return new Promise( (resolve,reject) => {
				console.log('Connecting user',mongoUser,'to',mongoUrl);
				let MongoClient = require('mongodb').MongoClient
				let parts = mongoUrl.split('://');
				let url = parts[0]+'://'+mongoUser+':'+mongoPwd+'@'+parts[1];
				MongoClient.connect(url, { useNewUrlParser: true }, (err, db) => {
					if( err && err.code == 'ECONNREFUSED' ) {
						console.log('DATABASE IS OFFLINE.', err);
						return resolve();
					}
					if( err ) {
						if( err.name == 'MongoNetworkError' ) {
							console.log("Are you attempting to connect from a non-whitelisted IP?");
						}
						return reject(err);
					}
					this.db = db.db(dbName);
					console.log('db is',dbName);
					return resolve();
				});
			});
		}

		removeAll(className) {
			if( !this.db ) return;
			console.log('STORAGE CLEARING TABLE',className);
			let meta = this.serial.getMeta(className);
			console.assert(meta.table);
			this.db.collection(meta.table).deleteMany({});
		}
		remove(obj) {
			if( !this.db ) return obj;
			let meta = this.serial.deduceMeta(obj);
			console.assert(meta.table);
			console.assert(meta.save);
			let idField = meta.idField;
			console.assert(idField);
			console.assert(obj[idField]);
			console.logStorage('storage delete',meta.className,obj[idField],'from',meta.table);
			this.db.collection(meta.table).deleteOne( this.filter(idField,obj[idField]) )
		}
		async _load(className,query,single) {
			console.assert(className);
			console.assert(query);
			return new Promise( (resolve,reject) => {
				if( !this.db ) return resolve();
				let meta = this.serial.getMeta(className);
				if( !meta ) {
					console.log( '_load can not find', className );
				}
				console.assert(meta);
				let table = meta.table;
				console.assert(table);
				let idField = meta.idField;
				console.assert(idField);
				this.db.collection(table).find(query).toArray( (err, list) => {
					if(err) reject(err);
					let recordHash = {};
					let discards = 0;
					list.forEach( data => {
						let record = this.serial.inject(null,data);
						discards += record === undefined ? 1 : 0;
						if( record !== 'undefined' ) {
							console.assert(data[idField]);
							recordHash[data[idField]] = record;
						}
					});
					console.logStorage('Loaded',list.length,className,'with '+discards+' discards');
					//console.log('content:',single ? recordHash[query[idField]] : recordHash);
					return resolve( single ? recordHash[query[idField]] : recordHash );
				});
			});
		}
		async loadAll(className) {
			return this._load(className,{});
		}
		async load(className,recordId) {
			console.assert(className);
			let meta = this.serial.getMeta(className);
			console.assert(meta);
			let idField = meta.idField;
			console.assert(idField);
			return this._load( className, this.filter(idField,recordId), true );
		}
		save(obj) {
			if( !this.db ) return obj;
			let meta = this.serial.deduceMeta(obj);
			if( !meta ) {
				console.log( 'Failed to deduce meta for', obj );
			}
			console.assert(meta);
			let table = meta.table;
			console.assert(table);
			console.assert(meta.save);
			let idField = meta.idField;
			console.assert(obj[idField]);
			let data = this.serial.distill(obj,['save']);
			console.assert(data[idField]);
			console.logStorage('save',meta.className,data[idField],'to',table);
			this.db.collection(table).updateOne(
				this.filter(idField,data[idField]), { $set: data }, { upsert: true }
			);
			return obj;
		}
/*
		save(obj) {
			if( !this.db ) return obj;
			let meta = this.serial.deduceMeta(obj);
			let table = meta.table;
			console.assert(table);
			console.assert(meta.save);
			let idField = meta.idField;
			console.assert(obj[idField]);
			let dataRaw = this.serial.distill(obj,['save']);
			let _id = dataRaw[idField];
			let data = dataRaw;
			console.assert( !data._id );
			//let data = Object.assign( {}, dataRaw, {_id:obj[idField]} );

			console.logStorage('save',meta.className,_id,'to',table);
			this.db.collection(table).updateOne(
				{ _id: _id }, { $set: data }, { upsert: true }
			);
			return obj;
		}
*/

	}

	module.exports = StorageMongo;

})();
