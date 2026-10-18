import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { APP_BRAND } from './brand';
import { BrandTitleStrategy } from './brand-title.strategy';

@Component({ selector: 'app-blank', template: '' })
class BlankComponent {}

describe('the browser tab title', () => {
  it('is the product name, StokeForm', () => {
    expect(APP_BRAND).toBe('StokeForm');
  });

  it('keeps the brand on every screen: "StokeForm" alone, or "<screen> · StokeForm" when the route names itself', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'named', title: 'Sign in', component: BlankComponent },
          { path: 'plain', component: BlankComponent },
        ]),
        { provide: TitleStrategy, useExisting: BrandTitleStrategy },
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/named');
    expect(document.title).toBe('Sign in · StokeForm');
    await router.navigateByUrl('/plain');
    expect(document.title).toBe('StokeForm');
  });
});
