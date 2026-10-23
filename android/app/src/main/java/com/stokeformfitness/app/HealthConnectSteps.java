package com.stokeformfitness.app;

import android.content.Context;
import android.health.connect.AggregateRecordsRequest;
import android.health.connect.AggregateRecordsResponse;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.LocalTimeRangeFilter;
import android.health.connect.datatypes.StepsRecord;
import android.os.OutcomeReceiver;

import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Reads the day totals of steps from Health Connect (Android 14+, where it is part of the system). Only steps are
 * read and nothing is written. The totals are Health Connect's own aggregates, which already de-duplicate steps
 * recorded by more than one app (a phone's pedometer and a watch, for example).
 */
@RequiresApi(34)
final class HealthConnectSteps {
  private static final Executor EXECUTOR = Executors.newSingleThreadExecutor();

  private HealthConnectSteps() {}

  static boolean available(Context context) {
    return context.getSystemService(HealthConnectManager.class) != null;
  }

  /** The steps of each of the last `days` local days (today first), as [{ date: "yyyy-MM-dd", steps: n }]. */
  static JSArray readDays(Context context, int days) throws Exception {
    HealthConnectManager manager = context.getSystemService(HealthConnectManager.class);
    if (manager == null) {
      throw new IllegalStateException("not-available");
    }
    JSArray out = new JSArray();
    LocalDate today = LocalDate.now();
    for (int back = 0; back < days; back++) {
      LocalDate date = today.minusDays(back);
      LocalDateTime start = date.atStartOfDay();
      // Today runs up to now; earlier days to the end of that day.
      LocalDateTime end = back == 0 ? LocalDateTime.now() : date.plusDays(1).atStartOfDay();
      long steps = totalSteps(manager, start, end);
      JSObject day = new JSObject();
      day.put("date", date.toString());
      day.put("steps", steps);
      out.put(day);
    }
    return out;
  }

  private static long totalSteps(HealthConnectManager manager, LocalDateTime start, LocalDateTime end) throws Exception {
    if (!end.isAfter(start)) {
      return 0;
    }
    AggregateRecordsRequest<Long> request =
        new AggregateRecordsRequest.Builder<Long>(new LocalTimeRangeFilter.Builder().setStartTime(start).setEndTime(end).build())
            .addAggregationType(StepsRecord.STEPS_COUNT_TOTAL)
            .build();
    CountDownLatch done = new CountDownLatch(1);
    AtomicReference<Long> total = new AtomicReference<>(0L);
    AtomicReference<Exception> failure = new AtomicReference<>();
    manager.aggregate(
        request,
        EXECUTOR,
        new OutcomeReceiver<AggregateRecordsResponse<Long>, HealthConnectException>() {
          @Override
          public void onResult(@NonNull AggregateRecordsResponse<Long> response) {
            Long value = response.get(StepsRecord.STEPS_COUNT_TOTAL);
            total.set(value == null ? 0L : value);
            done.countDown();
          }

          @Override
          public void onError(@NonNull HealthConnectException error) {
            failure.set(error);
            done.countDown();
          }
        });
    if (!done.await(15, TimeUnit.SECONDS)) {
      throw new IllegalStateException("timeout");
    }
    if (failure.get() != null) {
      throw failure.get();
    }
    return total.get();
  }
}
