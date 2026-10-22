import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { initErrorReporting } from './app/core/monitoring/error-reporting';

// Before anything else runs, so errors during startup are reported too (when the build has a DSN).
initErrorReporting();

bootstrapApplication(AppComponent, appConfig).catch((error: unknown) => console.error(error));
