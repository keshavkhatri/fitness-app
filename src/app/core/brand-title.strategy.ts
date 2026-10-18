import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { APP_BRAND } from './brand';

/**
 * The browser tab / window title: "StokeForm" on its own, or "<screen> · StokeForm" for a screen that names
 * itself in its route (`title: 'Sign in'`). Without this, Angular replaces the title with the route's alone and
 * the brand disappears after the first navigation.
 */
@Injectable({ providedIn: 'root' })
export class BrandTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const screen = this.buildTitle(snapshot);
    this.title.setTitle(screen ? `${screen} · ${APP_BRAND}` : APP_BRAND);
  }
}
