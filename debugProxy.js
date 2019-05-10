(function() {

	let DebugProxy = function(debugFlags) {


		let hideFn = () => {};
		let showFn = console.log;

		let methods = {
			get: function(obj, prop) {
				return obj[prop];
			},
			set: function(obj,prop,value) {
				obj[prop] = value;
				let fnName = 'log'+prop.charAt(0).toUpperCase() + prop.slice(1);
				value ? console.log('Debug.'+prop+' is on') : 0;
				console[fnName] = value ? showFn : hideFn;
			}
		}

		let proxy = new Proxy({},methods);
		proxy.setMany = function(obj) {
			Object.entries(obj).forEach( entry => {
				proxy[entry[0]] = entry[1];
			});
		}

		proxy.setMany(debugFlags);
		return proxy;
	};

	if( typeof module !== 'undefined' ) {
		module.exports = DebugProxy;
	}
	else {
		window.DebugProxy = DebugProxy;
	}

})();
