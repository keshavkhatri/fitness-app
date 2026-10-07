import { TestBed } from '@angular/core/testing';

import { ChoiceGroupComponent, ChoiceOption } from './choice-group.component';

const OPTIONS: readonly ChoiceOption<string>[] = [
  { value: 'a', label: 'Alpha', description: 'First' },
  { value: 'b', label: 'Beta' },
];

function render(inputs: { selected: string[]; multiple?: boolean }) {
  const fixture = TestBed.createComponent(ChoiceGroupComponent<string>);
  fixture.componentRef.setInput('options', OPTIONS);
  fixture.componentRef.setInput('selected', inputs.selected);
  fixture.componentRef.setInput('name', 'test');
  fixture.componentRef.setInput('labelledBy', 'question');
  fixture.componentRef.setInput('multiple', inputs.multiple ?? false);
  fixture.detectChanges();
  const toggled: string[] = [];
  fixture.componentInstance.optionToggled.subscribe((v) => toggled.push(v));
  return { el: fixture.nativeElement as HTMLElement, toggled };
}

describe('ChoiceGroupComponent', () => {
  it('uses native radios in a labelled radiogroup for single choice', () => {
    const { el } = render({ selected: ['b'] });
    const group = el.querySelector('[role="radiogroup"]');
    const inputs = el.querySelectorAll<HTMLInputElement>('input[type="radio"]');

    expect(group?.getAttribute('aria-labelledby')).toBe('question');
    expect([...inputs].map((i) => i.checked)).toEqual([false, true]);
  });

  it('shows selection with a check mark, not only color', () => {
    const { el } = render({ selected: ['a'] });
    const [first, second] = el.querySelectorAll('.option');

    expect(first.querySelector('.indicator ion-icon')).not.toBeNull();
    expect(second.querySelector('.indicator ion-icon')).toBeNull();
  });

  it('uses checkboxes for multiple choice and reports toggles to the parent', () => {
    const { el, toggled } = render({ selected: [], multiple: true });
    const inputs = el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');

    inputs[1].click();
    expect(toggled).toEqual(['b']);
  });
});
