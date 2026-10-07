import { TestBed } from '@angular/core/testing';

import { FitnessMetricComponent, MetricTrend } from './fitness-metric.component';

function render(trend?: MetricTrend) {
  const fixture = TestBed.createComponent(FitnessMetricComponent);
  fixture.componentRef.setInput('label', 'Body weight');
  fixture.componentRef.setInput('value', '78.4');
  fixture.componentRef.setInput('unit', 'kg');
  fixture.componentRef.setInput('trend', trend);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('FitnessMetricComponent', () => {
  it('conveys trend direction as text, not only via the icon', () => {
    const trend = render({ direction: 'down', sentiment: 'positive', label: '0.6 kg this week' }).querySelector('.trend');

    expect(trend?.querySelector('.visually-hidden')?.textContent).toBe('Down');
    expect(trend?.textContent).toContain('0.6 kg this week');
    expect(trend?.getAttribute('data-sentiment')).toBe('positive');
  });

  it('omits the trend when none is given', () => {
    expect(render().querySelector('.trend')).toBeNull();
  });
});
