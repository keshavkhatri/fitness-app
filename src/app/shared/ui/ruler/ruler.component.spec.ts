import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { RulerComponent, RulerOrientation } from './ruler.component';

@Component({
  template: `
    <fit-ruler
      label="Weight"
      [orientation]="orientation()"
      [min]="20"
      [max]="500"
      [step]="0.1"
      [pxPerStep]="10"
      [majorEvery]="10"
      [labelEvery]="10"
      [valueText]="spoken"
      [value]="value()"
      (valueChange)="changes.push($event); value.set($event)"
    />
  `,
  imports: [RulerComponent],
})
class HostComponent {
  readonly value = signal(70);
  readonly orientation = signal<RulerOrientation>('horizontal');
  readonly changes: number[] = [];
  readonly spoken = (v: number) => `${v} kilograms`;
}

/** No animation in these tests: settling and flicks resolve at once. */
function setup(orientation: RulerOrientation = 'horizontal') {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.orientation.set(orientation);
  fixture.detectChanges();
  const ruler = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('fit-ruler')!;
  ruler.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 300, right: 300, bottom: 300, x: 0, y: 0, toJSON: () => null });
  ruler.setPointerCapture = vi.fn();
  const host = fixture.componentInstance;
  const pointer = (type: string, x: number, y: number, timeStamp = 0) => {
    const event = new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', bubbles: true, button: 0 });
    Object.defineProperty(event, 'timeStamp', { value: timeStamp });
    ruler.dispatchEvent(event);
    fixture.detectChanges();
  };
  const key = (k: string) => {
    ruler.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  return { fixture, ruler, host, pointer, key };
}

describe('RulerComponent', () => {
  it('is a labelled, keyboard-focusable slider with a spoken value', () => {
    const { ruler } = setup();
    expect(ruler.getAttribute('role')).toBe('slider');
    expect(ruler.tabIndex).toBe(0);
    expect(ruler.getAttribute('aria-label')).toBe('Weight');
    expect([ruler.getAttribute('aria-valuemin'), ruler.getAttribute('aria-valuemax'), ruler.getAttribute('aria-valuenow')]).toEqual(['20', '500', '70']);
    expect(ruler.getAttribute('aria-valuetext')).toBe('70 kilograms');
    expect(ruler.getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('draws only the ticks near the marker, labelled on whole values', () => {
    const { ruler } = setup();
    const ticks = ruler.querySelectorAll('.tick');
    expect(ticks.length).toBeLessThan(80);
    expect([...ruler.querySelectorAll('.label')].map((l) => l.textContent)).toContain('70');
    expect(ruler.querySelector('.tick.current .label')?.textContent).toBe('70');
  });

  it('keyboard: arrows step, Page keys jump a division, Home/End go to the ends', () => {
    const { host, key } = setup();
    key('ArrowRight');
    key('ArrowUp');
    expect(host.value()).toBe(70.2);
    key('ArrowLeft');
    expect(host.value()).toBe(70.1);
    key('PageUp');
    expect(host.value()).toBe(71.1);
    key('PageDown');
    key('PageDown');
    expect(host.value()).toBe(69.1);
    key('End');
    expect(host.value()).toBe(500);
    key('ArrowRight');
    expect(host.value()).toBe(500); // clamped
    key('Home');
    expect(host.value()).toBe(20);
  });

  it('horizontal drag: dragging left brings higher values to the marker, on ticks only', () => {
    const { host, pointer } = setup();
    pointer('pointerdown', 150, 40, 0);
    pointer('pointermove', 120, 40, 100);
    pointer('pointermove', 87, 40, 200); // 63 px left = 6.3 ticks
    pointer('pointerup', 87, 40, 400); // paused before release: no flick
    expect(host.value()).toBe(70.6); // 70.63 → nearest tick
    expect(host.changes.every((v) => Math.round(v * 10) === v * 10)).toBe(true);
  });

  it('vertical drag: dragging down brings higher values (above) to the marker', () => {
    const { host, pointer } = setup('vertical');
    pointer('pointerdown', 20, 150, 0);
    pointer('pointermove', 20, 190, 100); // 40 px down = 4 ticks
    pointer('pointerup', 20, 190, 400);
    expect(host.value()).toBe(70.4);
  });

  it('a tap picks the tick under it', () => {
    const { host, pointer } = setup();
    pointer('pointerdown', 180, 40); // 30 px right of the centre (150)
    pointer('pointerup', 182, 40); // within the tap slop
    expect(host.value()).toBe(70.3);

    const vertical = setup('vertical');
    vertical.pointer('pointerdown', 20, 170); // 20 px below the centre = 2 ticks lower
    vertical.pointer('pointerup', 20, 170);
    expect(vertical.host.value()).toBe(69.8);
  });

  it('stops at the ends when dragged past them', () => {
    const { host, pointer } = setup();
    pointer('pointerdown', 150, 40, 0);
    pointer('pointermove', 10_000, 40, 100);
    pointer('pointerup', 10_000, 40, 400);
    expect(host.value()).toBe(20);
  });

  it('shows an off-tick value exactly until the user moves it', () => {
    const { host, ruler, fixture, key } = setup();
    host.value.set(68.45);
    fixture.detectChanges();
    expect(ruler.getAttribute('aria-valuenow')).toBe('68.45');
    expect(host.changes).toEqual([]);
    key('ArrowRight');
    expect(host.value()).toBe(68.6); // from its nearest tick (68.5)
  });

  it('a mouse button other than the main one does nothing', () => {
    const { host, ruler, fixture } = setup();
    ruler.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', button: 2, clientX: 150, bubbles: true }));
    ruler.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'mouse', button: 2, clientX: 200, bubbles: true }));
    fixture.detectChanges();
    expect(host.value()).toBe(70);
  });
});
