// MAIN.JS — Summer Holiday / Lola v0.3
// Entry point — imports all modules and bootstraps the app

import * as Util from './util.js';
import * as Api from './api.js';
import * as State from './state.js';
import * as Trips from './trips.js';
import * as City from './city.js';
import * as Plan from './plan.js';
import * as Snake from './snake.js';
import * as App from './app.js';

// Expose everything to window for inline onclick handlers in HTML
// This bridges the module system with the existing HTML markup
// In v0.4 we'll migrate to event delegation and remove this
Object.assign(window, Util, Api, State, Trips, City, Plan, Snake, App);

// Boot
App.init();
