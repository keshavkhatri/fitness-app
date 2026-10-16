-- Every user-owned Pulseform row now belongs to a real Better Auth user: user_id references
-- auth."user"(id), and deleting the user deletes their data. Safe to add now because the types
-- match (text) and the tables were empty when this was written (nothing writes to them yet).
--
-- Only the root tables get the key. Child rows (workout exercises and sets, measurement values,
-- body composition values) already reference their parent by (user_id, id) and cascade with it,
-- so they inherit the owner and the deletion.
--
-- If a database already holds rows whose user_id matches no user, this migration fails and rolls
-- back as a whole: such rows must be resolved first, never silently deleted.

ALTER TABLE pulseform.user_profiles
  ADD CONSTRAINT user_profiles_user_fk FOREIGN KEY (user_id) REFERENCES auth."user" ("id") ON DELETE CASCADE;
ALTER TABLE pulseform.user_preferences
  ADD CONSTRAINT user_preferences_user_fk FOREIGN KEY (user_id) REFERENCES auth."user" ("id") ON DELETE CASCADE;
ALTER TABLE pulseform.workout_plans
  ADD CONSTRAINT workout_plans_user_fk FOREIGN KEY (user_id) REFERENCES auth."user" ("id") ON DELETE CASCADE;
ALTER TABLE pulseform.workout_logs
  ADD CONSTRAINT workout_logs_user_fk FOREIGN KEY (user_id) REFERENCES auth."user" ("id") ON DELETE CASCADE;
ALTER TABLE pulseform.food_entries
  ADD CONSTRAINT food_entries_user_fk FOREIGN KEY (user_id) REFERENCES auth."user" ("id") ON DELETE CASCADE;
ALTER TABLE pulseform.weight_entries
  ADD CONSTRAINT weight_entries_user_fk FOREIGN KEY (user_id) REFERENCES auth."user" ("id") ON DELETE CASCADE;
ALTER TABLE pulseform.measurement_entries
  ADD CONSTRAINT measurement_entries_user_fk FOREIGN KEY (user_id) REFERENCES auth."user" ("id") ON DELETE CASCADE;
ALTER TABLE pulseform.body_composition_assessments
  ADD CONSTRAINT body_composition_assessments_user_fk FOREIGN KEY (user_id) REFERENCES auth."user" ("id") ON DELETE CASCADE;
ALTER TABLE pulseform.daily_check_ins
  ADD CONSTRAINT daily_check_ins_user_fk FOREIGN KEY (user_id) REFERENCES auth."user" ("id") ON DELETE CASCADE;
ALTER TABLE pulseform.notification_reads
  ADD CONSTRAINT notification_reads_user_fk FOREIGN KEY (user_id) REFERENCES auth."user" ("id") ON DELETE CASCADE;
