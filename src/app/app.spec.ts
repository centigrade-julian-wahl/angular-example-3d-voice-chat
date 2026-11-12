import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  it('renders the shell', async () => {
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const shell = fixture.nativeElement as HTMLElement;
    expect(shell.querySelector('header.top')).toBeNull();
    expect(shell.textContent).not.toContain('WEIHNACHTSGRUSS 2026');
    expect(shell.querySelector('main router-outlet')).not.toBeNull();
    expect(shell.querySelector('footer img')?.getAttribute('alt')).toBe('Centigrade');
  });
});
