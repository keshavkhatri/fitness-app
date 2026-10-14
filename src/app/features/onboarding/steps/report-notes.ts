import { ReportReading } from '../state/report-import.service';
import { ReportFieldNote, ReportNoteTone, reportFieldNotes } from '../state/report-review';
import { BasicsField } from '../validation/onboarding-validation';

const NOTE_ICONS: Readonly<Record<ReportNoteTone, string>> = {
  read: 'checkmark-circle',
  check: 'warning-outline',
  missing: 'information-circle-outline',
};

export type ReportNoteView = ReportFieldNote & { readonly icon: string };

/** The report's note for each body detail, with the icon that carries its tone. */
export function reportNotesWithIcons(reading: ReportReading): Readonly<Record<BasicsField, ReportNoteView>> {
  const notes = reportFieldNotes(reading);
  const withIcon = (field: BasicsField): ReportNoteView => ({ ...notes[field], icon: NOTE_ICONS[notes[field].tone] });
  return { dateOfBirth: withIcon('dateOfBirth'), sex: withIcon('sex'), height: withIcon('height'), weight: withIcon('weight') };
}
