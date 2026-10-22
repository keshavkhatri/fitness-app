import { NavController } from '@ionic/angular';

import { localIsoDate } from '../../core/time/clock';
import { NEW_WEIGHT_PATH } from '../body-weight/weight-history-paths';
import { NEW_FOOD_PATH } from '../nutrition/nutrition-paths';
import { activeWorkoutPath, workoutSessionPath } from '../workout/workout-paths';
import { NotificationAction } from './notifications';

export const NOTIFICATIONS_PATH = '/home/notifications';
export const notificationPath = (id: string) => ['/home', 'notifications', id];
/** Home opens its recovery check-in when navigated to with this query param. */
export const CHECK_IN_QUERY = { checkIn: 'recovery' } as const;

/** Opens the existing screen a reminder is about. */
export function runNotificationAction(nav: NavController, action: NotificationAction, now: Date): void {
  switch (action.kind) {
    case 'resume':
      void nav.navigateForward(activeWorkoutPath(action.sessionId));
      break;
    case 'open-session':
      void nav.navigateForward(workoutSessionPath(action.sessionId));
      break;
    case 'recovery-check-in':
      void nav.navigateBack('/home', { queryParams: CHECK_IN_QUERY });
      break;
    case 'log-weight':
      void nav.navigateForward(NEW_WEIGHT_PATH);
      break;
    case 'log-food':
      void nav.navigateForward(NEW_FOOD_PATH, { queryParams: { date: localIsoDate(now) } });
      break;
    case 'streak':
      void nav.navigateForward('/home/streak');
      break;
  }
}
