(function() {

	let AccessCodeReg = ['AccessCode',{
		save:    ['accessCodeId','available'],
		make:    (data) => new AccessCode(data.accessCodeId, data.available),
		table:   'AccessCode',
		idField: 'accessCodeId',
		version: 1
	}];

	class AccessCode {
		constructor(accessCodeId, available=false) {
			this.accessCodeId = accessCodeId;
			this.available    = available;
		}
	}

	AccessCode.onInit = function(_context) {
		_context.storage.serial.register( ...AccessCodeReg );
	}

	module.exports = AccessCode;

})();
