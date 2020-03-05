(function() {

	class Plugins {
		set(list) {
			this.list = list;
		}
		installRoutes(app) {
			this.list.forEach( plugin => plugin.onInstallRoutes ? plugin.onInstallRoutes(app) : 0 );
		}
		async init(appContext) {
			for( let plugin of this.list ) {
				if( plugin.id ) {
					appContext[plugin.id] = plugin;
				}
				if( plugin.onInit ) {
					await plugin.onInit(appContext);
				}
			};
		}

	}

	module.exports = new Plugins();

})();