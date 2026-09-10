interface LocalClock {
  date: string;
  time: string;
}

export function localClock(now: Date, timezone: string): LocalClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

export function calculateNextReminderAt(
  now: Date,
  reminderTime: string,
  timezone: string,
): Date {
  const localDate = localClock(now, timezone).date;
  let candidate = zonedDateTimeToUtc(localDate, reminderTime, timezone);

  if (candidate.getTime() <= now.getTime()) {
    candidate = zonedDateTimeToUtc(addCalendarDay(localDate), reminderTime, timezone);
  }

  return candidate;
}

function zonedDateTimeToUtc(
  date: string,
  time: string,
  timezone: string,
): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = new Date(desiredAsUtc);

  // Intl 로 해당 타임존의 오프셋을 역산한다. DST 전환점 보정을 위해 두 번 반복한다.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const local = localClock(candidate, timezone);
    const [localYear, localMonth, localDay] = local.date.split("-").map(Number);
    const [localHour, localMinute] = local.time.split(":").map(Number);
    const representedAsUtc = Date.UTC(
      localYear,
      localMonth - 1,
      localDay,
      localHour,
      localMinute,
    );
    candidate = new Date(candidate.getTime() + desiredAsUtc - representedAsUtc);
  }

  return candidate;
}

function addCalendarDay(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}
