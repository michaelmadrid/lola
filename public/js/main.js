// MAIN.JS — Summer Holiday / Lola v0.3
export const VERSION = '0.3';

import * as Util from './util.js';
import * as Api from './api.js';
import * as State from './state.js';
import * as Trips from './trips.js';
import * as City from './city.js';
import * as Plan from './plan.js';
import * as Snake from './snake.js';
import * as App from './app.js';

// Expose to window for inline HTML onclick handlers.
// In v0.4 we migrate to event delegation and remove this.
Object.assign(window, Util, Api, State, Trips, City, Plan, Snake, App);

App.init();
