import { Injectable, signal } from '@angular/core';

/**
 * Opens the Quick Add sheet from anywhere in the tab shell. The sheet and its
 * actions stay in `TabsPage`; pages (e.g. You) only ask for it to open.
 */
@Injectable({ providedIn: 'root' })
export class QuickAddLauncher {
  /** Two-way bound to the sheet's `open` model by the tabs shell. */
  readonly open = signal(false);

  show(): void {
    this.open.set(true);
  }
}
