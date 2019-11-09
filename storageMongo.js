(function() {

	const ObjectId = require('mongodb').ObjectID;

	class Converted {};

	let ConvertedReg = ['Converted',{
		save:     ['itemId','original','revised'],
		make:     (data) => new Converted(),
		table:    'Converted',
		idField:  'itemId',
		version:  1
	}];


	class StorageMongo {
		constructor(serial) {
			this.db = null;
			this.serial = serial;
			this.serial.register( ...ConvertedReg );

		}
		get classList() {
			return Object.keys(this.serial.meta);
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
				console.log('Storage connecting user',mongoUser,'to',mongoUrl);
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
		async removeWhere(className,query) {
			if( !this.db ) return;
			console.logStorage('storage delete',className,query);
			let meta = this.serial.getMeta(className);
			console.assert(meta.table);
			let result = await this.db.collection(meta.table).deleteMany(query);
			return result;
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
		async _load(className,query,asRaw) {
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
					if( asRaw ) {
						return resolve( list );
					}
					let recordHash = {};
					let discards = 0;
					//console.log('list=',list);
					list.forEach( data => {
						let record = this.serial.inject(null,data);
						discards += record === undefined ? 1 : 0;
						if( record !== 'undefined' ) {
							console.assert(data[idField]);
							recordHash[data[idField]] = record;
						}
					});
					console.logStorage(className,'loaded',Object.keys(recordHash).length,'of',list.length,'with '+discards+' discards.');
					return resolve( recordHash );
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
			let query = this.filter(idField,recordId);
			let recordHash = await this._load( className, query );
			return recordHash[query[idField]];
		}
		async loadWhere(className,query) {
			return await this._load( className, query );
		}
		async convert(className) {
			let meta = this.serial.getMeta(className);
			console.assert(meta);
			if( !meta.convert ) {
				return -1;
			}
			let query = { '_version': { $lt: meta.version } };
			//console.log('query=',query);
			let rawHash = await this._load( className, query, true );
			//console.log('rawHash = ', rawHash );
			let count = 0;
			if( rawHash.length > 0 ) {
				console.log('Converting', className );
				for( let raw of rawHash ) {
					// WARNING: This is WAY slow, to do each one-by-one. Should do it as a batch...
					let originalId = raw._id;
					let original   = Object.assign( {}, raw );
					let revised = await meta.convert( raw );
					if( revised ) {
						let converted = new Converted();
						converted.itemId    = Math.uid()+'-'+original._id;
						converted.original  = Object.assign({},original);
						converted.revised   = Object.assign({},revised);
						delete converted.original._id;
						delete converted.revised._id;
						//console.log('Saving converted ', converted );
						await this.save( converted );
						await this.save( revised );

						++count;
					}
				}
				console.log('Converted', count, className );
			}
			return count;
		}
		async save(obj) {
			if( !this.db ) return obj;
			let meta = this.serial.deduceMeta(obj);
			if( !meta ) {
				console.log( 'Failed to deduce meta for', obj );
			}
			//console.log(meta);
			//console.log(obj);
			
			console.assert(meta);
			let table = meta.table;
			console.assert(table);
			console.assert(meta.save);
			let idField = meta.idField;
			console.assert(obj[idField]);
			let data = this.serial.distill(obj,['save']);
			console.assert(data[idField]);
			//console.logStorage(data);
			if( data._id ) {
				console.logStorage('save',meta.className,'_id=',data._id,'idField=',data[idField],'to',table);
				await this.db.collection(table).updateOne(
					{ _id: ObjectId(data._id) }, { $set: data }, { upsert: true }
				);
			}
			else {
				console.logStorage('save',meta.className,data[idField],'to',table);
				await this.db.collection(table).updateOne(
					this.filter(idField,data[idField]), { $set: data }, { upsert: true }
				);
			}
			return obj;
		}
		async inc(className,id,fieldToInc,amount=1) {
			let meta = this.serial.getMeta(className);
			console.assert(meta, 'Failed to deduce meta for '+className);
			console.assert(meta.table);
			console.assert(meta.idField);
			console.assert(Number.isInteger(amount));

			let result = await this.db.collection(meta.table).findOneAndUpdate(
				{ [meta.idField]: id },
				{ '$inc': { [fieldToInc]: amount } },
				{
					upsert: true,
					returnOriginal: false	// WARNING: this is documented in mongodb 3.2.0 as returnNewDocument: true, but that isn't how this driver works
				}
			);
			//let record = this.serial.inject(null,result);
			//console.log('inc result =',result);
			return result;
		}
		async update(className,id,fieldId,value) {
			let meta = this.serial.getMeta(className);
			console.assert(meta, 'Failed to deduce meta for '+className);
			console.assert(meta.table);
			console.assert(meta.idField);
			console.assert(fieldId);
			console.assert(value!==undefined);

			let result = await this.db.collection(meta.table).update(
				{ [meta.idField]: id },
				{ '$set': { [fieldId]: value } },
				{
					returnOriginal: false	// WARNING: this is documented in mongodb 3.2.0 as returnNewDocument: true, but that isn't how this driver works
				}
			);
			return result;
		}
	}

	module.exports = StorageMongo;

})();
