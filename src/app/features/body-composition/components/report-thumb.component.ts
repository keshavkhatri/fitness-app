import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Placeholder artwork for an InBody report: a sheet drawn with lines and
 * bars. Report images aren't stored (they're only sent to be read), so this
 * never shows the user's actual report. Decorative.
 */
@Component({
  selector: 'app-report-thumb',
  template: `
    <span class="sheet">
      <span class="brand"></span>
      <span class="line w80"></span>
      <span class="line w60"></span>
      <span class="bars"><span></span><span></span><span></span></span>
      <span class="line w70"></span>
      <span class="line w50"></span>
    </span>
  `,
  styles: `
    :host {
      display: grid;
      flex: none;
      place-items: center;
      width: var(--thumb-size, 56px);
      height: calc(var(--thumb-size, 56px) * 1.2);
      border-radius: var(--radius-sm);
      background: var(--color-surface-muted);
    }
    .sheet {
      display: flex;
      flex-direction: column;
      gap: 8%;
      width: 72%;
      height: 82%;
      padding: 8%;
      border-radius: 2px;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
    }
    .brand {
      width: 40%;
      height: 9%;
      border-radius: 1px;
      background: #3b5bdb;
    }
    .line {
      height: 5%;
      border-radius: 1px;
      background: #c9ccd3;
    }
    .w80 { width: 80%; }
    .w70 { width: 70%; }
    .w60 { width: 60%; }
    .w50 { width: 50%; }
    .bars {
      display: flex;
      flex-direction: column;
      gap: 6%;
      height: 26%;
      span {
        display: block;
        height: 22%;
        border-radius: 1px;
        background: #9aa1ad;
      }
      span:nth-child(1) { width: 90%; }
      span:nth-child(2) { width: 55%; }
      span:nth-child(3) { width: 72%; }
    }
  `,
  host: { 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportThumbComponent {}
